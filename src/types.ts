export type DocumentKind = 'invoice' | 'quotation' | 'contract'

export interface Customer {
  name: string
  abn: string
  address: string
  phone: string
  email: string
}

export interface WorkItem {
  description: string
  amount: string
}

export interface DocumentData {
  number: string
  date: string
  customer: Customer
  items: WorkItem[]
  total: string
  deposit: string
}
