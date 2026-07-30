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
    'invoice.gst',
    'invoice.deposit',
    'invoice.balance',
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
    'quotation.total',
    'quotation.gst',
    'quotation.deposit',
    'quotation.balance',
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

    if (kind === 'invoice' || kind === 'quotation') {
      const displayedTotal = await page.getByLabel('Total before GST').inputValue()
      const displayedDeposit = await page.getByLabel('Deposit (10%)').inputValue()
      const displayedGst = await page.locator('.calculated-field').filter({ hasText: 'GST' }).locator('strong').textContent()
      const displayedBalance = await page.locator('.balance-field strong').textContent()
      if (displayedTotal !== '$1,250.50') {
        throw new Error(`${kind}: expected item total $1,250.50, received ${displayedTotal}`)
      }
      if (displayedGst !== '$1,375.55' || displayedDeposit !== '$125.05') {
        throw new Error(`${kind}: expected GST-inclusive total and 10% deposit values`)
      }
      if (displayedBalance !== '$1,250.50') {
        throw new Error(`${kind}: expected remaining balance $1,250.50, received ${displayedBalance}`)
      }

      await page.getByLabel('Deposit (10%)').fill('$100.00')
      const overriddenBalance = await page.locator('.balance-field strong').textContent()
      if (overriddenBalance !== '$1,275.55') {
        throw new Error(`${kind}: editable deposit did not update the balance`)
      }
    }

    const longTotal = '$123,456,789.00'
    if (kind === 'invoice' || kind === 'quotation') {
      await page.getByLabel('Total before GST').fill(longTotal)
      if ((await page.getByLabel('Deposit (10%)').inputValue()) !== '$12,345,678.90') {
        throw new Error(`${kind}: changing total did not refresh the default 10% deposit`)
      }
      for (const fieldName of ['total', 'gst', 'deposit', 'balance']) {
        const fieldLayout = await page.locator(`[data-pdf-field="${fieldName}"]`).evaluate((element) => ({
          fits: element.scrollWidth <= element.clientWidth + 1,
          fontSize: Number.parseFloat(window.getComputedStyle(element).fontSize),
        }))
        if (!fieldLayout.fits) throw new Error(`${kind}: long ${fieldName} overflowed its preview cell`)
        if (fieldLayout.fontSize < 10) {
          throw new Error(`${kind}: long ${fieldName} became too small to read`)
        }
      }
    }

    await page.screenshot({
      path: path.join(outputDirectory, `${kind}-line-items.png`),
      fullPage: true,
    })

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Download PDF/ }).click()
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

    if (kind === 'invoice' || kind === 'quotation') {
      const totalField = pdf.getForm().getTextField(`${kind}.total`)
      const exportedTotal = totalField.getText()
      if (exportedTotal !== longTotal) {
        throw new Error(`${kind}: editable total override was not preserved in the exported PDF`)
      }
      if (!/\s0(?:\.0+)?\s+Tf/.test(totalField.acroField.getDefaultAppearance() ?? '')) {
        throw new Error(`${kind}: total PDF field is not configured to auto-fit future edits`)
      }
      const expectedSummary = {
        gst: '$135,802,467.90',
        deposit: '$12,345,678.90',
        balance: '$123,456,789.00',
      }
      for (const [fieldName, expectedText] of Object.entries(expectedSummary)) {
        const summaryField = pdf.getForm().getTextField(`${kind}.${fieldName}`)
        if (summaryField.getText() !== expectedText) {
          throw new Error(`${kind}: ${fieldName} formula was not preserved in the PDF`)
        }
        if (!/\s0(?:\.0+)?\s+Tf/.test(summaryField.acroField.getDefaultAppearance() ?? '')) {
          throw new Error(`${kind}: ${fieldName} PDF field is not configured to auto-fit`)
        }
      }
      if (!pdf.getForm().getTextField(`${kind}.gst`).isReadOnly()) {
        throw new Error(`${kind}: GST-inclusive total PDF field should be read-only`)
      }
      if (!pdf.getForm().getTextField(`${kind}.balance`).isReadOnly()) {
        throw new Error(`${kind}: calculated balance PDF field should be read-only`)
      }
      if (pdf.getForm().getTextField(`${kind}.deposit`).isReadOnly()) {
        throw new Error(`${kind}: deposit PDF field should remain editable`)
      }
    }

    for (const itemNumber of [1, 2]) {
      const amountField = pdf.getForm().getTextField(`${kind}.item-${itemNumber}-amount`)
      if (kind === 'invoice' && !/\s0(?:\.0+)?\s+Tf/.test(amountField.acroField.getDefaultAppearance() ?? '')) {
        throw new Error(`${kind}: item ${itemNumber} amount PDF field is not configured to auto-fit`)
      }
      if (kind === 'quotation' && !amountField.isMultiline()) {
        throw new Error(`${kind}: price ${itemNumber} PDF field should allow writing on multiple lines`)
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

    if (await page.getByLabel('Name').inputValue()) {
      throw new Error(`${kind}: customer details were not cleared after PDF generation`)
    }
    if (await page.getByLabel('Amount 1').inputValue()) {
      throw new Error(`${kind}: work details were not cleared after PDF generation`)
    }
    if ((await page.getByLabel('Date').inputValue()) !== expectedToday) {
      throw new Error(`${kind}: reset document did not retain today's automatic date`)
    }

    await page.getByRole('button', { name: 'Add item' }).click()
    await page.getByLabel('Amount 1').fill(kind === 'quotation' ? '$60\n\n$40' : '$100')
    await page.getByRole('button', { name: 'Remove item 2' }).click()
    if (await page.getByLabel('Description 2').count()) {
      throw new Error(`${kind}: removed line item remained in the editor`)
    }
    if (kind === 'invoice' || kind === 'quotation') {
      const recalculatedTotal = await page.getByLabel('Total before GST').inputValue()
      const recalculatedDeposit = await page.getByLabel('Deposit (10%)').inputValue()
      const recalculatedGst = await page.locator('.calculated-field').filter({ hasText: 'GST' }).locator('strong').textContent()
      const recalculatedBalance = await page.locator('.balance-field strong').textContent()
      if (recalculatedTotal !== '$100.00' || recalculatedDeposit !== '$10.00') {
        throw new Error(`${kind}: removing an item did not recalculate total and deposit`)
      }
      if (recalculatedGst !== '$110.00' || recalculatedBalance !== '$100.00') {
        throw new Error(`${kind}: client $100 GST/deposit example calculated incorrectly`)
      }
    }

    console.log(`${kind}: PASS — A4, 1 page, ${names.length} editable fields`)
    await context.close()
  }

  for (const kind of ['invoice', 'quotation']) {
    const mobileContext = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
    const mobilePage = await mobileContext.newPage()
    await mobilePage.addInitScript(() => {
      const revokeObjectUrl = URL.revokeObjectURL.bind(URL)
      window.__pdfUrlRevocations = []
      URL.revokeObjectURL = (url) => {
        window.__pdfUrlRevocations.push(url)
        revokeObjectUrl(url)
      }
    })
    await mobilePage.goto(`http://127.0.0.1:5173/?document=${kind}`)
    if (await mobilePage.locator('.editor-panel').isVisible()) {
      throw new Error(`mobile ${kind}: separate form should be hidden in direct document mode`)
    }
    await mobilePage.getByRole('button', { name: 'Form', exact: true }).click()
    if (!await mobilePage.locator('.editor-panel').isVisible()) {
      throw new Error(`mobile ${kind}: form fallback did not open`)
    }
    await mobilePage.getByRole('button', { name: 'Document', exact: true }).click()

    await mobilePage.locator('.document-page [data-pdf-field="customer-name"]').fill('Mobile Client')
    await mobilePage.locator('.document-page [data-pdf-field="item-1-description"]').fill('Mobile layout test')
    await mobilePage.locator('.document-page [data-pdf-field="item-1-amount"]').fill('$500')
    await mobilePage.locator('.mobile-add-item').click()
    await mobilePage.locator('.document-page [data-pdf-field="item-2-description"]').fill('Second mobile item')
    await mobilePage.locator('.document-page [data-pdf-field="item-2-amount"]').fill('$250')

    const mobileTotal = await mobilePage.locator('.document-page [data-pdf-field="total"]').textContent()
    const mobileBalance = await mobilePage.locator('.document-page [data-pdf-field="balance"]').textContent()
    if (mobileTotal !== '$750.00' || mobileBalance !== '$750.00') {
      throw new Error(`mobile ${kind}: payment formulas did not update from touch-sized inputs`)
    }

    const mobileLayout = await mobilePage.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      contentWidth: document.documentElement.scrollWidth,
      downloadVisible: Boolean(document.querySelector('.print-button')?.getBoundingClientRect().width),
      documentLeft: document.querySelector('.document-page')?.getBoundingClientRect().left ?? -1,
      documentRight: document.querySelector('.document-page')?.getBoundingClientRect().right ?? -1,
    }))
    if (mobileLayout.contentWidth > mobileLayout.viewportWidth + 2) {
      throw new Error(
        `mobile ${kind}: layout overflows horizontally (${mobileLayout.contentWidth}px > ${mobileLayout.viewportWidth}px)`,
      )
    }
    if (!mobileLayout.downloadVisible) {
      throw new Error(`mobile ${kind}: download control is not visible`)
    }
    if (mobileLayout.documentLeft < 0 || mobileLayout.documentRight > mobileLayout.viewportWidth) {
      throw new Error(
        `mobile ${kind}: A4 preview is clipped (${mobileLayout.documentLeft}px to ${mobileLayout.documentRight}px)`,
      )
    }

    await mobilePage.screenshot({
      path: path.join(outputDirectory, `${kind}-mobile.png`),
      fullPage: true,
    })

    const mobileDownloadPromise = mobilePage.waitForEvent('download')
    await mobilePage.getByRole('button', { name: /Download PDF/ }).click()
    const mobileDownload = await mobileDownloadPromise
    const expectedMobileFilename = kind === 'invoice'
      ? 'Invoice-005-Mobile-Client.pdf'
      : 'Quotation-Mobile-Client.pdf'
    if (mobileDownload.suggestedFilename() !== expectedMobileFilename) {
      throw new Error(`mobile ${kind}: unexpected filename ${mobileDownload.suggestedFilename()}`)
    }
    const mobileOutputPath = path.join(outputDirectory, `${kind}-mobile.pdf`)
    await mobileDownload.saveAs(mobileOutputPath)

    const immediateRevocations = await mobilePage.evaluate(() => window.__pdfUrlRevocations.length)
    if (immediateRevocations !== 0) {
      throw new Error(`mobile ${kind}: PDF blob URL was revoked before download completion`)
    }

    const mobilePdf = await PDFDocument.load(await readFile(mobileOutputPath))
    if (mobilePdf.getPages().length !== 1) {
      throw new Error(`mobile ${kind}: PDF should contain exactly one page`)
    }
    if (!mobilePdf.getForm().getFields().length) {
      throw new Error(`mobile ${kind}: downloaded PDF has no editable fields`)
    }
    if (await mobilePage.locator('.document-page [data-pdf-field="customer-name"]').textContent()) {
      throw new Error(`mobile ${kind}: form did not clear after download`)
    }

    console.log(`mobile ${kind}: PASS — direct editing, form fallback, formulas, download, and reset`)
    await mobileContext.close()
  }
} finally {
  await browser.close()
  server.kill()
}
