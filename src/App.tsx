import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, FileCheck2, FileText, Plus, Printer, ReceiptText, Trash2 } from 'lucide-react'
import type { DocumentData, DocumentKind, WorkItem } from './types'
import { downloadFillablePdf } from './pdf'
import { calculateDocumentTotal, formatDocumentDate } from './documentUtils'

const company = {
  abn: '46939484472',
  address: '1/20 Rae St, Chadstone 3148 Vic',
  phone: '0470234567',
  email: 'Sppainting.remodeling@gmail.com',
  website: 'www.sppaintingremodeling.com.au',
}

function createInitialData(): Record<DocumentKind, DocumentData> {
  const today = formatDocumentDate()
  return {
    invoice: {
      number: '5',
      date: today,
      customer: {
        name: 'Jewel Builds',
        abn: '36332367178',
        address: '9 Shakespeare Grove,\nHawthorn, 3122',
        phone: '0431480132',
        email: 'jewelbuilds@gmail.com',
      },
      items: [{
        description: 'Invoice for prepped and painted at exterior of your project.\n\n• 4 paint striper.',
        amount: '',
      }],
      total: '',
    },
    quotation: {
      number: '',
      date: today,
      customer: { name: '', abn: '', address: '', phone: '', email: '' },
      items: [{ description: '', amount: '' }],
      total: '',
    },
    contract: {
      number: '',
      date: today,
      customer: { name: '', abn: '', address: '', phone: '', email: '' },
      items: [{ description: '', amount: '' }],
      total: '',
    },
  }
}

const nav: Array<{ id: DocumentKind; label: string; icon: typeof ReceiptText }> = [
  { id: 'invoice', label: 'Invoice', icon: ReceiptText },
  { id: 'quotation', label: 'Quotation', icon: FileText },
  { id: 'contract', label: 'Contract', icon: FileCheck2 },
]

function getInitialDocument(): DocumentKind {
  const requested = new URLSearchParams(window.location.search).get('document')
  return requested === 'quotation' || requested === 'contract' ? requested : 'invoice'
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
}) {
  const Component = multiline ? 'textarea' : 'input'
  return (
    <label className="field">
      <span>{label}</span>
      <Component value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function FittedPdfValue({ field, value }: { field: string; value: string }) {
  const valueRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const element = valueRef.current
    if (!element) return

    element.style.fontSize = ''
    const maximumSize = Number.parseFloat(window.getComputedStyle(element).fontSize)
    const minimumSize = 10
    if (element.scrollWidth <= element.clientWidth) return

    let lower = minimumSize
    let upper = maximumSize
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = (lower + upper) / 2
      element.style.fontSize = `${candidate}px`
      if (element.scrollWidth <= element.clientWidth) lower = candidate
      else upper = candidate
    }
    element.style.fontSize = `${lower}px`
  }, [value])

  return (
    <span ref={valueRef} data-pdf-field={field} data-pdf-autofit="true">
      {value}
    </span>
  )
}

function App() {
  const [active, setActive] = useState<DocumentKind>(getInitialDocument)
  const [documents, setDocuments] = useState(createInitialData)
  const [exporting, setExporting] = useState(false)
  const data = documents[active]

  const title = useMemo(
    () => nav.find((item) => item.id === active)?.label ?? 'Invoice',
    [active],
  )

  const update = <K extends keyof DocumentData>(key: K, value: DocumentData[K]) => {
    setDocuments((current) => ({
      ...current,
      [active]: { ...current[active], [key]: value },
    }))
  }

  const updateCustomer = (key: keyof DocumentData['customer'], value: string) => {
    update('customer', { ...data.customer, [key]: value })
  }

  const updateItem = (index: number, key: keyof WorkItem, value: string) => {
    setDocuments((current) => {
      const items = current[active].items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [key]: value } : item
      ))
      const document = { ...current[active], items }
      if (active === 'invoice' && key === 'amount') {
        document.total = calculateDocumentTotal(document)
      }
      return { ...current, [active]: document }
    })
  }

  const addItem = () => {
    update('items', [...data.items, { description: '', amount: '' }])
  }

  const removeItem = (index: number) => {
    setDocuments((current) => {
      if (current[active].items.length === 1) return current
      const items = current[active].items.filter((_, itemIndex) => itemIndex !== index)
      const document = { ...current[active], items }
      if (active === 'invoice') document.total = calculateDocumentTotal(document)
      return { ...current, [active]: document }
    })
  }

  const exportPdf = async () => {
    setExporting(true)
    try {
      await downloadFillablePdf(active, data)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.jpeg" alt="SPPainting logo" />
          <div>
            <strong>SPPainting</strong>
            <span>Document Studio</span>
          </div>
        </div>

        <nav aria-label="Document sections">
          <p className="nav-label">DOCUMENTS</p>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              className={active === id ? 'active' : ''}
              key={id}
              onClick={() => setActive(id)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        <div className="status-card">
          <Check size={17} />
          <div>
            <strong>Template locked</strong>
            <span>Business details stay consistent.</span>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p>DOCUMENT EDITOR</p>
            <h1>{title}</h1>
          </div>
          <button className="print-button" onClick={exportPdf} disabled={active === 'contract' || exporting}>
            <Printer size={18} />
            {exporting ? 'Creating PDF…' : 'Download PDF'}
          </button>
        </header>

        {active === 'contract' ? (
          <section className="contract-pending">
            <div className="pending-icon"><FileCheck2 /></div>
            <p>CONTRACT SECTION</p>
            <h2>Contract template reference required</h2>
            <span>
              This section is separate and ready. The supplied photos do not show the
              contract wording or page layout, so no unapproved content has been added.
            </span>
          </section>
        ) : (
          <div className="workspace">
            <section className="editor-panel">
              <div className="editor-heading">
                <span>EDITABLE DETAILS</span>
                <small>Changes appear in the preview</small>
              </div>
              <div className="form-section">
                <h3>{title} details</h3>
                <div className={active === 'invoice' ? 'field-grid' : ''}>
                  {active === 'invoice' && (
                    <Field label="Invoice number" value={data.number} onChange={(v) => update('number', v)} />
                  )}
                  <Field label="Date" value={data.date} onChange={(v) => update('date', v)} />
                </div>
              </div>
              <div className="form-section">
                <h3>{active === 'invoice' ? 'Bill to' : 'Customer'}</h3>
                <Field label="Name" value={data.customer.name} onChange={(v) => updateCustomer('name', v)} />
                {active === 'invoice' && (
                  <Field label="ABN" value={data.customer.abn} onChange={(v) => updateCustomer('abn', v)} />
                )}
                <Field label="Address" value={data.customer.address} onChange={(v) => updateCustomer('address', v)} multiline />
                <div className="field-grid">
                  <Field label="Phone" value={data.customer.phone} onChange={(v) => updateCustomer('phone', v)} />
                  <Field label="Email" value={data.customer.email} onChange={(v) => updateCustomer('email', v)} />
                </div>
              </div>
              <div className="form-section">
                <div className="items-heading">
                  <h3>Work and price</h3>
                  <button type="button" className="add-item-button" onClick={addItem}>
                    <Plus size={14} />
                    Add item
                  </button>
                </div>
                <div className="item-editors">
                  {data.items.map((item, index) => (
                    <div className="item-editor" key={index}>
                      <div className="item-number">
                        <span>Item {index + 1}</span>
                        {data.items.length > 1 && (
                          <button
                            type="button"
                            className="remove-item-button"
                            aria-label={`Remove item ${index + 1}`}
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <Field
                        label={`Description ${index + 1}`}
                        value={item.description}
                        onChange={(value) => updateItem(index, 'description', value)}
                        multiline
                      />
                      <Field
                        label={`Amount ${index + 1}`}
                        value={item.amount}
                        onChange={(value) => updateItem(index, 'amount', value)}
                      />
                    </div>
                  ))}
                </div>
                {active === 'invoice' && (
                  <div className="total-editor">
                    <Field label="Total includes gst" value={data.total} onChange={(v) => update('total', v)} />
                    <small>Item subtotal plus 10% GST. You can still edit it.</small>
                  </div>
                )}
              </div>
            </section>

            <section className="preview-panel">
              <div className="preview-label">
                <span>PDF PREVIEW</span>
                <small>A4 portrait</small>
              </div>
              <DocumentPage kind={active} data={data} />
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

function BusinessHeader() {
  return (
    <div className="business-header">
      <img src="/logo.jpeg" alt="Superior Plus Painting & Remodeling" />
      <div className="business-details">
        <p><b>ABN:</b><span>{company.abn}</span></p>
        <p><b>Address:</b><span>{company.address}</span></p>
        <p><b>Phone:</b><span>{company.phone}</span></p>
        <p><b>E-Mail:</b><span>{company.email}</span></p>
        <p className="website">{company.website}</p>
      </div>
    </div>
  )
}

function CustomerBox({ kind, data }: { kind: DocumentKind; data: DocumentData }) {
  return (
    <div className="doc-box customer-box">
      <div className="box-title">{kind === 'invoice' ? 'Bill To' : 'CUSTOMER'}</div>
      <div className="box-body">
        <p><b>Name:</b> <span data-pdf-field="customer-name">{data.customer.name}</span></p>
        {kind === 'invoice' && <p><b>abn:</b> <span data-pdf-field="customer-abn">{data.customer.abn}</span></p>}
        <p className="preserve"><b>Address:</b> <span data-pdf-field="customer-address" data-multiline="true">{data.customer.address}</span></p>
        <p><b>{kind === 'invoice' ? 'Phone:' : 'Number'}</b> <span data-pdf-field="customer-phone">{data.customer.phone}</span></p>
        <p><b>Email{kind === 'invoice' ? ':' : ''}</b> <span data-pdf-field="customer-email">{data.customer.email}</span></p>
      </div>
    </div>
  )
}

function DocumentPage({ kind, data }: { kind: DocumentKind; data: DocumentData }) {
  const invoice = kind === 'invoice'
  return (
    <article className={`document-page ${kind}`} id="print-document">
      <div className="document-top">
        <BusinessHeader />
        <div className="document-meta">
          <h2>{invoice ? 'Invoice' : ''}</h2>
          <div className="meta-grid">
            {invoice && <><b>INVOICE #</b><b>DATE</b><span data-pdf-field="number">{data.number}</span><span data-pdf-field="date">{data.date}</span></>}
            {!invoice && <><b>DATE</b><span data-pdf-field="date">{data.date}</span></>}
          </div>
        </div>
      </div>

      <div className={`document-middle ${invoice ? '' : 'quotation-middle'}`}>
        <CustomerBox kind={kind} data={data} />
        {invoice && (
          <div className="doc-box bank-box">
            <div className="box-title">Bank Detail</div>
            <div className="box-body">
              <p>NAME: AFSHIN NAJIBI</p>
              <p>BSB: 064162</p>
              <p>Acc: 11458192</p>
            </div>
          </div>
        )}
      </div>

      {!invoice && <p className="quote-intro">We have pleasure in submitting the following quote for your project</p>}

      <div className="work-table">
        <div className="work-head">
          <b>{invoice ? 'DESCRIPTION' : 'DESCRIPTION OF WORK'}</b>
          <b>{invoice ? 'Amount' : 'PRICE'}</b>
        </div>
        <div className={`work-body ${data.items.length === 1 ? 'single-item' : 'multiple-items'}`}>
          {data.items.map((item, index) => (
            <div className="work-item" key={index}>
              <div className="description preserve">
                <span data-pdf-field={`item-${index + 1}-description`} data-multiline="true">
                  {item.description}
                </span>
              </div>
              <div className="amount">
                <FittedPdfValue field={`item-${index + 1}-amount`} value={item.amount} />
              </div>
            </div>
          ))}
        </div>
        <div className="work-footer">
          <span>
            {invoice
              ? 'Thank you for choosing our company'
              : 'This quotation is valid for a period of 30 days from the date of quoting'}
          </span>
          {invoice && <><b>Total<br />includes gst</b><FittedPdfValue field="total" value={data.total} /></>}
        </div>
      </div>
    </article>
  )
}

export default App
