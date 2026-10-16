// CSV import/export tối giản cho Admin (KHÔNG phụ thuộc thư viện ngoài).

/** Ghi 1 ô CSV: bọc nháy kép khi chứa , " \n hoặc \r; escape " → "". */
export function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Parse CSV (RFC4180 tối giản): hỗ trợ ô bọc nháy kép, escape "" bên trong,
 * line ending CRLF/LF, BOM UTF-8, newline nằm trong ô bọc nháy.
 * Trả về mảng dòng × mảng ô (kể cả dòng trống — caller tự lọc).
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      // bỏ \r — xử lý nhánh \n ngay sau đó (CRLF)
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  // đẩy phần còn lại khi file không kết thúc bằng newline
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export interface CsvTable {
  header: string[];
  /** line = số dòng trong file (1-based, header là dòng 1; dòng trống bị bỏ nhưng giữ nguyên số dòng). */
  records: { line: number; values: Record<string, string> }[];
}

/** Parse CSV → header + record map theo tên cột; cột thiếu trong dòng → chuỗi rỗng. */
export function csvTable(text: string): CsvTable {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map((h) => h.trim());
  const records: { line: number; values: Record<string, string> }[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    if (r.every((v) => v.trim() === '')) continue; // bỏ dòng trống, giữ số dòng gốc
    const values: Record<string, string> = {};
    header.forEach((h, j) => {
      values[h] = (r[j] ?? '').trim();
    });
    records.push({ line: i + 1, values });
  }
  return { header, records };
}

/** Tải file CSV từ browser (UTF-8 BOM để Excel hiển thị đúng tiếng Việt). */
export function downloadCsvTemplate(filename: string, header: string[], rows: string[][]): void {
  const lines = [header.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))];
  const blob = new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
