import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

/**
 * Every report method returns plain rows; this service turns them into
 * a downloadable file. CSV is pure string formatting — no dependency,
 * always reliable. Excel uses the real `exceljs` library (confirmed
 * installable in this environment via the npm registry, unlike the
 * Prisma engine binaries this project's tests are blocked on).
 *
 * PDF export is NOT implemented in this phase — spec section 33 asks
 * for it, but a properly branded PDF renderer (company header, filters,
 * summary, detail rows, totals, page numbers per spec section 79) is
 * substantial additional surface on its own. This is a documented gap,
 * not a silent one: CSV and Excel cover the same underlying data.
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
}
