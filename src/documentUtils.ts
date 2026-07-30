import type { DocumentData, DocumentKind } from './types'

export function formatDocumentDate(date: Date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}

function filenamePart(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function documentNumberPart(value: string) {
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return trimmed.padStart(3, '0')
  return filenamePart(trimmed)
}

export function buildPdfFilename(kind: DocumentKind, data: DocumentData) {
  const type = kind.charAt(0).toUpperCase() + kind.slice(1)
  const number = documentNumberPart(data.number)
  const customer = filenamePart(data.customer.name).slice(0, 60).replace(/-+$/g, '')
  const parts = [type, number, customer].filter(Boolean)
  return `${parts.join('-')}.pdf`
}

function numericAmount(value: string) {
  const normalized = value.replace(/,/g, '').replace(/[^0-9.-]/g, '')
  if (!normalized || normalized === '-' || normalized === '.') return 0
  const amount = Number.parseFloat(normalized)
  return Number.isFinite(amount) ? amount : 0
}

export function calculateDocumentTotal(data: DocumentData) {
  const populatedAmounts = data.items.map((item) => item.amount.trim()).filter(Boolean)
  if (populatedAmounts.length === 0) return ''

  const subtotal = populatedAmounts.reduce((sum, amount) => sum + numericAmount(amount), 0)
  const total = Math.round(subtotal * 1.1 * 100) / 100
  const usesCurrencySymbol = populatedAmounts.some((amount) => amount.includes('$'))
  const formatted = total.toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return usesCurrencySymbol ? `$${formatted}` : formatted
}
