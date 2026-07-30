import html2canvas from 'html2canvas'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { DocumentKind } from './types'

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

export async function downloadFillablePdf(kind: DocumentKind) {
  const documentElement = document.getElementById('print-document')
  if (!documentElement) return

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
    field.setFontSize(fontSize)
    field.updateAppearances(font)
  })

  const bytes = await pdf.save()
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `sppainting-${kind}.pdf`
  anchor.click()
  URL.revokeObjectURL(url)
}
