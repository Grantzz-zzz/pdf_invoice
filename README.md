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

With the development server running:

```bash
npm run test:pdf
```
