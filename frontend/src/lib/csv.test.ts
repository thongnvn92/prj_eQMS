import { describe, expect, it } from 'vitest';
import { csvEscape, csvTable, parseCsv } from './csv';

describe('parseCsv', () => {
  it('parse cơ bản với CRLF', () => {
    expect(parseCsv('a,b,c\r\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('ô bọc nháy chứa dấu phẩy + escape "" kép', () => {
    expect(parseCsv('"a,1","say ""hi"""\r\nx,y')).toEqual([
      ['a,1', 'say "hi"'],
      ['x', 'y'],
    ]);
  });

  it('bỏ BOM UTF-8', () => {
    expect(parseCsv('\ufeffa,b')).toEqual([['a', 'b']]);
  });

  it('newline trong ô bọc nháy được giữ nguyên', () => {
    expect(parseCsv('"dòng1\ndòng2",x')).toEqual([['dòng1\ndòng2', 'x']]);
  });

  it('dòng cuối không có newline vẫn lấy được', () => {
    expect(parseCsv('a,b')).toEqual([['a', 'b']]);
  });

  it('LF thuần cũng hoạt động', () => {
    expect(parseCsv('a\nb')).toEqual([['a'], ['b']]);
  });
});

describe('csvTable', () => {
  it('map record theo header, số dòng 1-based, bỏ dòng trống nhưng giữ line gốc', () => {
    const t = csvTable('code,name\r\nA,Tên A\r\n\r\nB,"Tên, có phẩy"');
    expect(t.header).toEqual(['code', 'name']);
    expect(t.records).toEqual([
      { line: 2, values: { code: 'A', name: 'Tên A' } },
      { line: 4, values: { code: 'B', name: 'Tên, có phẩy' } },
    ]);
  });

  it('cột thiếu trong dòng → chuỗi rỗng', () => {
    const t = csvTable('a,b,c\n1,2');
    expect(t.records).toHaveLength(1);
    expect(t.records[0].values).toEqual({ a: '1', b: '2', c: '' });
  });

  it('file rỗng → header rỗng, không record', () => {
    expect(csvTable('')).toEqual({ header: [], records: [] });
  });
});

describe('csvEscape', () => {
  it('chỉ bọc nháy khi cần', () => {
    expect(csvEscape('abc')).toBe('abc');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('dòng\nmới')).toBe('"dòng\nmới"');
  });
});
