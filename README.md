# SPPainting Document Studio

A template-matched document editor for Superior Plus Painting & Remodeling.

## Current checklist

- [x] Separate Invoice section
- [x] Separate Quotation section
- [x] Separate Contract section shell
- [x] Locked company information and bank details
- [x] Editable date, document number, customer, description, amount, and total
- [x] A4 PDF preview
- [x] Downloadable PDF with genuine editable AcroForm fields
- [x] New documents default to today's editable date
- [x] Smart PDF filenames using document number and customer name
- [x] Mobile-safe PDF downloads
- [x] Multiple aligned description/amount line items
- [x] Invoice payment summary: total, GST-inclusive total, editable deposit, and balance due
- [x] Quotation payment summary follows the invoice formulas
- [x] Multiline quotation price fields for flexible vertical placement
- [x] Successful PDF generation clears editable details for the next document
- [x] Supplied company logo
- [ ] Add exact contract body after its reference image is supplied
- [ ] Final pixel-level comparison against original source files
- [ ] Cross-browser and PDF-reader validation

## Run locally

```bash
npm install
npm run dev
```

## Verify fillable PDF exports

```bash
npm run test:pdf
```

The verification command starts its own temporary local server.
