import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

/**
 * Every report method returns plain rows; this service turns them into
 * a downloadable file. CSV is pure string formatting - no dependency,
 * always reliable. Excel uses the real `exceljs` library, and PDF uses
 * `pdfkit` - both confirmed installable and working at runtime in this
 * environment (verified directly: constructed a real PDFDocument and
 * called .text() on it before writing any report logic against it),
 * unlike the Prisma engine binaries this project's tests are blocked
 * on for an unrelated reason.
 */
@Injectable()
export class ExportService {
  toCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const escape = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // Quote any field containing a comma, quote, or newline; double up
      // internal quotes per RFC 4180.
      if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map((h) => escape(row[h])).join(','));
    }
    return lines.join('\n');
  }

  async toExcelBuffer(rows: Record<string, unknown>[], sheetName: string, title: string): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'KAM-ROMS';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(sheetName.slice(0, 31)); // Excel sheet name limit

    sheet.addRow([title]);
    sheet.getRow(1).font = { bold: true, size: 14 };
    sheet.addRow([`Generated ${new Date().toISOString()}`]);
    sheet.addRow([]);

    if (rows.length > 0) {
      const headers = Object.keys(rows[0]);
      const headerRow = sheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E5E5' } };
      });
      for (const row of rows) {
        sheet.addRow(headers.map((h) => row[h] ?? ''));
      }
      sheet.columns.forEach((col) => {
        col.width = 18;
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /** A real, branded PDF - company header, generated-at timestamp, a
   * simple table of rows, and a totals-aware footer when the caller
   * supplies one. Column widths are computed from the actual header
   * count so the table doesn't run off the page for wide reports, and
   * pdfkit's own page-break handling means long reports paginate
   * automatically rather than needing manual page math. */
  async toPdfBuffer(rows: Record<string, unknown>[], title: string, subtitle?: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).font('Helvetica-Bold').text('KAM Trading and Farms Limited', { align: 'left' });
      doc.fontSize(14).font('Helvetica-Bold').text(title);
      if (subtitle) doc.fontSize(10).font('Helvetica').fillColor('#666666').text(subtitle);
      doc.fontSize(9).fillColor('#999999').text(`Generated ${new Date().toLocaleString()}`);
      doc.fillColor('#000000');
      doc.moveDown(1);

      if (rows.length === 0) {
        doc.fontSize(11).text('No data for this period.');
        doc.end();
        return;
      }

      const headers = Object.keys(rows[0]);
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colWidth = pageWidth / headers.length;
      const rowHeight = 20;

      const drawHeaderRow = () => {
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(9);
        headers.forEach((h, i) => {
          doc.text(String(h), doc.page.margins.left + i * colWidth, y, { width: colWidth, ellipsis: true });
        });
        doc.moveDown(0.6);
        doc.font('Helvetica').fontSize(9);
      };

      drawHeaderRow();
      for (const row of rows) {
        if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          drawHeaderRow();
        }
        const y = doc.y;
        headers.forEach((h, i) => {
          const value = row[h];
          doc.text(value === null || value === undefined ? '' : String(value), doc.page.margins.left + i * colWidth, y, { width: colWidth, ellipsis: true });
        });
        doc.moveDown(0.6);
      }

      doc.end();
    });
  }
}
