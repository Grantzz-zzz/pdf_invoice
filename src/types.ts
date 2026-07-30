export type DocumentKind = 'invoice' | 'quotation' | 'contract'

export interface Customer {
  name: string
  abn: string
  address: string
  phone: string
  email: string
}

export interface DocumentData {
  number: string
  date: string
  customer: Customer
  description: string
  amount: string
  total: string
}
