import { ExportService } from '../export.service';

describe('ExportService', () => {
  const service = new ExportService();

  describe('toCsv', () => {
    it('produces a header row followed by one row per record', () => {
      const csv = service.toCsv([
        { name: 'Farm A', bags: 100 },
        { name: 'Farm B', bags: 200 },
      ]);

      const lines = csv.split('\n');
      expect(lines[0]).toBe('name,bags');
      expect(lines[1]).toBe('Farm A,100');
      expect(lines[2]).toBe('Farm B,200');
    });

    it('quotes and escapes a field containing a comma per RFC 4180', () => {
      const csv = service.toCsv([{ location: 'Adenta, Accra' }]);

      expect(csv).toBe('location\n"Adenta, Accra"');
    });

    it('doubles up internal quotes and wraps the field in quotes', () => {
      const csv = service.toCsv([{ note: 'He said "hello"' }]);

      expect(csv).toBe('note\n"He said ""hello"""');
    });

    it('returns an empty string for zero rows rather than throwing', () => {
      expect(service.toCsv([])).toBe('');
    });

    it('renders null/undefined values as empty fields, not the literal word "null"', () => {
      const csv = service.toCsv([{ a: 1, b: null, c: undefined }]);

      expect(csv).toBe('a,b,c\n1,,');
    });
  });

  describe('toExcelBuffer', () => {
    it('produces a non-empty, valid xlsx buffer (real exceljs output, not mocked)', async () => {
      const buffer = await service.toExcelBuffer([{ farm: 'Farm A', kg: 62500 }], 'Farm Report', 'Farm Intake Report');

      expect(buffer.length).toBeGreaterThan(0);
      // XLSX files are zip archives — the first two bytes are the PK
      // magic number. This confirms exceljs actually produced a real
      // spreadsheet file, not a stub.
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4b); // 'K'
    });

    it('handles an empty row set without throwing', async () => {
      const buffer = await service.toExcelBuffer([], 'Empty Report', 'Nothing Here');
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
