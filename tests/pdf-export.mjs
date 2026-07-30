import { mkdir, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { PDFDocument } from 'pdf-lib'

const root = process.cwd()
const outputDirectory = path.join(root, 'test-results')
await mkdir(outputDirectory, { recursive: true })

const server = spawn(
  process.execPath,
  [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1'],
  { cwd: root, stdio: 'ignore' },
)

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:5173')
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Vite did not start on http://127.0.0.1:5173')
}

await waitForServer()

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
})

const expected = {
  invoice: [
    'invoice.number',
    'invoice.date',
    'invoice.customer-name',
    'invoice.customer-abn',
    'invoice.customer-address',
    'invoice.customer-phone',
    'invoice.customer-email',
    'invoice.item-1-description',
    'invoice.item-1-amount',
    'invoice.item-2-description',
    'invoice.item-2-amount',
    'invoice.total',
  ],
  quotation: [
    'quotation.date',
    'quotation.customer-name',
    'quotation.customer-address',
    'quotation.customer-phone',
    'quotation.customer-email',
    'quotation.item-1-description',
    'quotation.item-1-amount',
    'quotation.item-2-description',
    'quotation.item-2-amount',
  ],
}

try {
  for (const [kind, expectedFields] of Object.entries(expected)) {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1100 },
    })
    const page = await context.newPage()
    await page.goto(`http://127.0.0.1:5173/?document=${kind}`)

    const expectedToday = await page.evaluate(() => {
      const now = new Date()
      const day = String(now.getDate()).padStart(2, '0')
      const month = String(now.getMonth() + 1).padStart(2, '0')
      return `${day}/${month}/${now.getFullYear()}`
    })
    const dateField = page.getByLabel('Date')
    if ((await dateField.inputValue()) !== expectedToday) {
      throw new Error(`${kind}: new document did not start with today's date`)
    }

    const editedDate = '01/01/2030'
    await dateField.fill(editedDate)
    if (kind === 'quotation') await page.getByLabel('Name').fill('Acme & Sons / Melbourne')

    await page.getByLabel('Description 1').fill('Prepare exterior walls')
    await page.getByLabel('Amount 1').fill('$1,000')
    await page.getByRole('button', { name: 'Add item' }).click()
    await page.getByLabel('Description 2').fill('Apply two finish coats')
    await page.getByLabel('Amount 2').fill('$250.50')

    if (kind === 'invoice') {
      const displayedTotal = await page.getByLabel('Total includes gst').inputValue()
      if (displayedTotal !== '$1,375.55') {
        throw new Error(`${kind}: expected GST-inclusive total $1,375.55, received ${displayedTotal}`)
      }
    }

    const longTotal = '$123,456,789.00'
    if (kind === 'invoice') {
      await page.getByLabel('Total includes gst').fill(longTotal)
      const totalLayout = await page.locator('[data-pdf-field="total"]').evaluate((element) => ({
        fits: element.scrollWidth <= element.clientWidth + 1,
        fontSize: Number.parseFloat(window.getComputedStyle(element).fontSize),
      }))
      if (!totalLayout.fits) throw new Error(`${kind}: long total overflowed its preview cell`)
      if (totalLayout.fontSize < 10) {
        throw new Error(`${kind}: long total became too small to read`)
      }
    }

    await page.screenshot({
      path: path.join(outputDirectory, `${kind}-line-items.png`),
      fullPage: true,
    })

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download PDF' }).click()
    const download = await downloadPromise
    const expectedFilename = kind === 'invoice'
      ? 'Invoice-005-Jewel-Builds.pdf'
      : 'Quotation-Acme-Sons-Melbourne.pdf'
    if (download.suggestedFilename() !== expectedFilename) {
      throw new Error(
        `${kind}: expected filename ${expectedFilename}, received ${download.suggestedFilename()}`,
      )
    }
    const outputPath = path.join(outputDirectory, `${kind}.pdf`)
    await download.saveAs(outputPath)

    const pdf = await PDFDocument.load(await readFile(outputPath))
    const pages = pdf.getPages()
    if (pages.length !== 1) throw new Error(`${kind}: expected one page, received ${pages.length}`)

    const { width, height } = pages[0].getSize()
    if (Math.abs(width - 595.28) > 0.1 || Math.abs(height - 841.89) > 0.1) {
      throw new Error(`${kind}: expected A4 page, received ${width} × ${height}`)
    }

    const names = pdf.getForm().getFields().map((field) => field.getName()).sort()
    const missing = expectedFields.filter((field) => !names.includes(field))
    const unexpected = names.filter((field) => !expectedFields.includes(field))
    if (missing.length || unexpected.length) {
      throw new Error(
        `${kind}: field mismatch; missing [${missing.join(', ')}], unexpected [${unexpected.join(', ')}]`,
      )
    }

    const exportedDate = pdf.getForm().getTextField(`${kind}.date`).getText()
    if (exportedDate !== editedDate) {
      throw new Error(`${kind}: edited date was not preserved in the exported PDF`)
    }

    for (const [fieldName, expectedText] of [
      [`${kind}.item-1-description`, 'Prepare exterior walls'],
      [`${kind}.item-1-amount`, '$1,000'],
      [`${kind}.item-2-description`, 'Apply two finish coats'],
      [`${kind}.item-2-amount`, '$250.50'],
    ]) {
      const exportedText = pdf.getForm().getTextField(fieldName).getText()
      if (exportedText !== expectedText) {
        throw new Error(`${kind}: ${fieldName} did not preserve its line-item value`)
      }
    }

    if (kind === 'invoice') {
      const totalField = pdf.getForm().getTextField('invoice.total')
      const exportedTotal = totalField.getText()
      if (exportedTotal !== longTotal) {
        throw new Error(`${kind}: editable total override was not preserved in the exported PDF`)
      }
      if (!/\s0(?:\.0+)?\s+Tf/.test(totalField.acroField.getDefaultAppearance() ?? '')) {
        throw new Error(`${kind}: total PDF field is not configured to auto-fit future edits`)
      }
    }

    for (const itemNumber of [1, 2]) {
      const amountField = pdf.getForm().getTextField(`${kind}.item-${itemNumber}-amount`)
      if (!/\s0(?:\.0+)?\s+Tf/.test(amountField.acroField.getDefaultAppearance() ?? '')) {
        throw new Error(`${kind}: item ${itemNumber} amount PDF field is not configured to auto-fit`)
      }
    }

    for (const field of pdf.getForm().getFields()) {
      const widget = field.acroField.getWidgets()[0]
      const rectangle = widget.getRectangle()
      if (rectangle.width < 30 || rectangle.height < 8) {
        throw new Error(
          `${kind}: ${field.getName()} has an unusably small ${rectangle.width} × ${rectangle.height} field`,
        )
      }
    }

    for (const itemNumber of [1, 2]) {
      const description = pdf.getForm().getTextField(`${kind}.item-${itemNumber}-description`)
      const descriptionRectangle = description.acroField.getWidgets()[0].getRectangle()
      if (descriptionRectangle.width < 250 || descriptionRectangle.height < 35) {
        throw new Error(`${kind}: item ${itemNumber} description field is too small`)
      }
    }

    await page.getByRole('button', { name: 'Remove item 2' }).click()
    if (await page.getByLabel('Description 2').count()) {
      throw new Error(`${kind}: removed line item remained in the editor`)
    }
    if (kind === 'invoice') {
      const recalculatedTotal = await page.getByLabel('Total includes gst').inputValue()
      if (recalculatedTotal !== '$1,100.00') {
        throw new Error(`${kind}: removing an item did not recalculate the GST-inclusive total`)
      }
    }

    console.log(`${kind}: PASS — A4, 1 page, ${names.length} editable fields`)
    await context.close()
  }
} finally {
  await browser.close()
  server.kill()
}
