import html2canvas from 'html2canvas'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { DocumentData, DocumentKind } from './types'
import { buildPdfFilename } from './documentUtils'

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

async function waitForDocumentImages(documentElement: HTMLElement) {
  const images = Array.from(documentElement.querySelectorAll('img'))
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error('A document image took too long to load.')),
          10_000,
        )
        const finish = (error?: Error) => {
          window.clearTimeout(timeout)
          image.removeEventListener('load', loaded)
          image.removeEventListener('error', failed)
          if (error) reject(error)
          else resolve()
        }
        const loaded = () => finish()
        const failed = () => finish(new Error('A required document image could not be loaded.'))
        image.addEventListener('load', loaded, { once: true })
        image.addEventListener('error', failed, { once: true })
      })
    }
    if (!image.naturalWidth) throw new Error('A required document image could not be loaded.')
    await image.decode().catch(() => undefined)
  }))
}

export async function downloadFillablePdf(kind: DocumentKind, data: DocumentData) {
  const documentElement = document.getElementById('print-document')
  if (!documentElement) return

  await waitForDocumentImages(documentElement)
  documentElement.classList.add('pdf-capturing')
  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(documentElement, {
      scale: 2,
      backgroundColor: '#fffdf8',
      useCORS: true,
      logging: false,
    })
  } finally {
    documentElement.classList.remove('pdf-capturing')
  }

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([A4_WIDTH, A4_HEIGHT])
  const background = await pdf.embedPng(canvas.toDataURL('image/png'))
  page.drawImage(background, {
    x: 0,
    y: 0,
    width: A4_WIDTH,
    height: A4_HEIGHT,
  })

  const form = pdf.getForm()
  const font = await pdf.embedFont(StandardFonts.TimesRoman)
  const pageRect = documentElement.getBoundingClientRect()
  const scaleX = A4_WIDTH / pageRect.width
  const scaleY = A4_HEIGHT / pageRect.height

  documentElement.querySelectorAll<HTMLElement>('[data-pdf-field]').forEach((element) => {
    const rect = element.getBoundingClientRect()
    const name = element.dataset.pdfField
    if (!name) return

    const field = form.createTextField(`${kind}.${name}`)
    field.setText(element.textContent ?? '')
    if (element.dataset.multiline === 'true') field.enableMultiline()

    const computed = window.getComputedStyle(element)
    const fontSize = Math.max(7, Number.parseFloat(computed.fontSize) * scaleX)

    field.addToPage(page, {
      x: (rect.left - pageRect.left) * scaleX,
      y: A4_HEIGHT - (rect.bottom - pageRect.top) * scaleY,
      width: Math.max(12, rect.width * scaleX),
      height: Math.max(10, rect.height * scaleY),
      borderWidth: 0,
      textColor: rgb(0, 0, 0),
      font,
    })
    if (element.dataset.pdfAutofit === 'true') {
      field.updateAppearances(font)
      field.acroField.setFontSize(0)
    } else {
      field.setFontSize(fontSize)
      field.updateAppearances(font)
    }
    if (element.dataset.pdfReadonly === 'true') field.enableReadOnly()
  })

  const bytes = await pdf.save()
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = buildPdfFilename(kind, data)
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  // Mobile browsers may resolve the blob URL after the click handler returns.
  // Revoking it immediately can turn the download into a 404 page.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
