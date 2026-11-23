import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface ExportColumn {
  header: string;
  align?: 'left' | 'right' | 'center';
}

export interface ExportPayload {
  title: string;
  subtitle: string;
  dateRange: string;
  filename: string;
  columns: ExportColumn[];
  rows: (string | number)[][];
  footerRows?: (string | number)[][];
}

function sanitizePdfText(value: string | number | undefined | null): string {
  const raw = String(value ?? '');
  return raw
    .replace(/৳/g, 'BDT ')
    .replace(/→/g, 'to')
    .replace(/·/g, '|')
    .replace(/×/g, 'x')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildMergedFooterRows(
  footerRows: (string | number)[][] | undefined,
  columns: ExportColumn[]
) {
  if (!footerRows || footerRows.length === 0) return undefined;

  return footerRows.map((row) => {
    const cells: {
      content: string;
      colSpan?: number;
      styles?: { halign?: 'left' | 'right' | 'center'; fontStyle?: 'bold' };
    }[] = [];

    let i = 0;
    while (i < columns.length) {
      const text = sanitizePdfText(row[i]);
      const colAlign = columns[i]?.align || 'left';

      // Merge trailing empty cells into a non-empty label cell so totals don't look fragmented/spaced out
      if (text !== '') {
        let span = 1;
        while (
          i + span < columns.length &&
          sanitizePdfText(row[i + span]) === '' &&
          (columns[i + span]?.align || 'left') !== 'right'
        ) {
          span++;
        }
        // Also merge into adjacent empty right-aligned cells ONLY if there is another value further right?
        // Actually merging all consecutive empty cells up to the next non-empty cell gives the cleanest alignment!
        span = 1;
        while (i + span < columns.length && sanitizePdfText(row[i + span]) === '') {
          // If this cell itself is a right-aligned numeric total at the end or middle, don't absorb subsequent columns
          if (colAlign === 'right') break;
          span++;
        }

        cells.push({
          content: text,
          ...(span > 1 ? { colSpan: span } : {}),
          styles: {
            halign: colAlign,
            fontStyle: 'bold',
          },
        });
        i += span;
      } else {
        // Leading empty cells before any value
        let span = 1;
        while (i + span < columns.length && sanitizePdfText(row[i + span]) === '') {
          span++;
        }
        cells.push({
          content: '',
          ...(span > 1 ? { colSpan: span } : {}),
          styles: { halign: 'left', fontStyle: 'bold' },
        });
        i += span;
      }
    }

    return cells;
  });
}

export function exportReportToExcel(payload: ExportPayload): void {
  const sheetData: (string | number)[][] = [
    ['Provet — Enterprise ERP'],
    [payload.title],
    [payload.subtitle],
    [`Period: ${payload.dateRange}`],
    [],
    payload.columns.map((c) => c.header),
    ...payload.rows,
  ];
  if (payload.footerRows && payload.footerRows.length > 0) {
    sheetData.push(...payload.footerRows);
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = payload.columns.map((col, idx) => {
    const maxLen = Math.max(
      col.header.length,
      ...payload.rows.map((r) => String(r[idx] ?? '').length),
      ...(payload.footerRows || []).map((r) => String(r[idx] ?? '').length)
    );
    return { wch: Math.min(42, Math.max(12, maxLen + 3)) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${payload.filename}.xlsx`);
}

export function exportReportToPDF(payload: ExportPayload): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Provet Forest Green Header Band
  doc.setFillColor(7, 67, 43); // #07432B
  doc.rect(0, 0, pageWidth, 68, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('PROVET ENTERPRISE ERP', 36, 28);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizePdfText(payload.title), 36, 46);

  doc.setFontSize(8.5);
  doc.text(`Period: ${sanitizePdfText(payload.dateRange)}`, pageWidth - 36, 30, { align: 'right' });
  doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`, pageWidth - 36, 45, { align: 'right' });

  doc.setTextColor(75, 99, 86);
  doc.setFontSize(8.5);
  doc.text(sanitizePdfText(payload.subtitle), 36, 86);

  const columnStyles: Record<
    number,
    { halign: 'left' | 'right' | 'center'; cellWidth?: 'auto' | 'wrap' | number }
  > = {};
  payload.columns.forEach((col, i) => {
    columnStyles[i] = {
      halign: col.align || 'left',
    };
  });

  const bodyRows =
    payload.rows.length > 0
      ? payload.rows.map((r) => r.map((cell) => sanitizePdfText(cell)))
      : [[
          {
            content: 'No transactions or records found in the selected date duration.',
            colSpan: payload.columns.length,
            styles: { halign: 'center' as const, textColor: [75, 99, 86] as [number, number, number] },
          },
        ]];

  const mergedFooter = buildMergedFooterRows(payload.footerRows, payload.columns);

  autoTable(doc, {
    startY: 98,
    head: [payload.columns.map((c) => sanitizePdfText(c.header))],
    body: bodyRows,
    foot: mergedFooter,
    showFoot: 'lastPage',
    theme: 'grid',
    headStyles: {
      fillColor: [7, 67, 43],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: { top: 6, right: 6, bottom: 6, left: 6 },
      lineColor: [7, 67, 43],
      lineWidth: 0.4,
    },
    footStyles: {
      fillColor: [234, 244, 238],
      textColor: [7, 67, 43],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: { top: 7, right: 6, bottom: 7, left: 6 },
      lineColor: [7, 67, 43],
      lineWidth: 0.6,
    },
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: { top: 5, right: 6, bottom: 5, left: 6 },
      textColor: [13, 35, 25],
      lineColor: [216, 226, 220],
      lineWidth: 0.35,
      valign: 'middle',
      overflow: 'linebreak',
    },
    alternateRowStyles: {
      fillColor: [249, 252, 250],
    },
    columnStyles,
    didParseCell(data) {
      if (data.section === 'body') {
        const rawRow = Array.isArray(data.row.raw) ? data.row.raw : [];
        const firstCell = String(rawRow[0] ?? '');
        const secondCell = String(rawRow[1] ?? '');
        const isSection = [
          'REVENUE',
          'COST OF GOODS SOLD',
          'OPERATING EXPENSES',
          'ASSETS',
          'LIABILITIES',
          'EQUITY',
          'OPENING CASH & BANK',
          'RECEIPTS (INFLOWS)',
          'PAYMENTS (OUTFLOWS)',
          'CLOSING CASH & BANK',
        ].includes(firstCell);
        const isSubtotal =
          secondCell.startsWith('GROSS PROFIT') ||
          secondCell.startsWith('TOTAL ') ||
          secondCell.startsWith('Total ') ||
          secondCell.startsWith('Net Sales') ||
          firstCell.startsWith('Total ') ||
          firstCell.startsWith('TOTAL ');

        if (isSection) {
          data.cell.styles.fillColor = [234, 244, 238];
          data.cell.styles.textColor = [7, 67, 43];
          data.cell.styles.fontStyle = 'bold';
        } else if (isSubtotal) {
          data.cell.styles.fillColor = [243, 248, 245];
          data.cell.styles.textColor = [13, 35, 25];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawPage() {
      const pageNum = doc.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(110, 128, 118);
      doc.text('Provet Enterprise ERP — Official Accounting Statement', 36, pageHeight - 22);
      doc.text(`Page ${pageNum}`, pageWidth - 36, pageHeight - 22, { align: 'right' });
    },
    margin: { left: 36, right: 36, bottom: 40 },
  });

  doc.save(`${payload.filename}.pdf`);
}

export function printCurrentReport(): void {
  window.print();
}

export function exportQuotationToPDF(params: {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  quotNo: string;
  date: string;
  validUntil: string;
  customerName: string;
  customerAddress: string;
  customerMobile: string;
  notes: string;
  currency: string;
  items: { productName: string; qty: number; bonusQty: number; salesPrice: number; discountAmount: number; lineTotal: number }[];
  totalAmount: number;
  amountInWords: string;
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const fmtAmt = (n: number) =>
    sanitizePdfText(
      `${params.currency}${n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    );

  // Header band
  doc.setFillColor(7, 67, 43);
  doc.rect(0, 0, pageWidth, 72, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitizePdfText(params.companyName.toUpperCase()), 36, 28);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizePdfText(params.companyAddress), 36, 44);
  doc.text(`${sanitizePdfText(params.companyPhone)} | ${sanitizePdfText(params.companyEmail)}`, 36, 57);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('SALES QUOTATION', pageWidth - 36, 30, { align: 'right' });
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Quotation No: ${sanitizePdfText(params.quotNo)}`, pageWidth - 36, 45, { align: 'right' });
  doc.text(`Date: ${params.date} | Valid Until: ${params.validUntil}`, pageWidth - 36, 58, { align: 'right' });

  doc.setTextColor(13, 35, 25);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Quotation Prepared For:', 36, 98);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizePdfText(params.customerName), 36, 113);
  doc.text(sanitizePdfText(params.customerAddress || '-'), 36, 126);
  doc.text(`Mobile: ${sanitizePdfText(params.customerMobile || '-')}`, 36, 139);

  autoTable(doc, {
    startY: 158,
    head: [['#', 'Product Description', 'Qty', 'Bonus', 'Unit Price', 'Discount', 'Line Total']],
    body: params.items.map((it, idx) => [
      idx + 1,
      sanitizePdfText(it.productName),
      it.qty,
      it.bonusQty || 0,
      fmtAmt(it.salesPrice),
      fmtAmt(it.discountAmount),
      fmtAmt(it.lineTotal),
    ]),
    foot: [
      [
        { content: 'Grand Total', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: fmtAmt(params.totalAmount), styles: { halign: 'right', fontStyle: 'bold' } },
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [7, 67, 43], textColor: [255, 255, 255], fontSize: 8.5, cellPadding: 6 },
    footStyles: { fillColor: [234, 244, 238], textColor: [7, 67, 43], fontStyle: 'bold', fontSize: 9, cellPadding: 6 },
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 5, textColor: [13, 35, 25], lineColor: [216, 226, 220], lineWidth: 0.35 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 26 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
    margin: { left: 36, right: 36 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 280;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Amount in Words: ${sanitizePdfText(params.amountInWords)}`, 36, finalY + 24);
  if (params.notes) {
    doc.setFont('helvetica', 'normal');
    doc.text(`Notes / Terms: ${sanitizePdfText(params.notes)}`, 36, finalY + 42);
  }

  doc.setFontSize(8.5);
  doc.text('Authorized Signature (Provet)', 36, finalY + 95);
  doc.text('Customer Acceptance', pageWidth - 36, finalY + 95, { align: 'right' });

  doc.save(`Provet_Quotation_${params.quotNo}.pdf`);
}
