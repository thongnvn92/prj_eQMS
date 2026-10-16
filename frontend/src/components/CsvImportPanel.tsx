// Panel import CSV dùng chung cho Admin (Master Plan ISO / Document Control).
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, App, Button, Space, Table, Typography, Upload } from 'antd';
import { DownloadOutlined, InboxOutlined, ImportOutlined } from '@ant-design/icons';
import { csvTable, downloadCsvTemplate } from '../lib/csv';
import { ApiError } from '../services/api';

const { Text } = Typography;

export interface CsvImportColumn<T> {
  title: string;
  width?: number;
  value: (row: T) => ReactNode;
}

export interface CsvImportColumnDoc {
  key: string;
  label: string;
  required?: boolean;
  note?: string;
}

/** Kết quả import cả batch (gọi đúng 1 lần tới bulk endpoint BE). */
export interface CsvImportBatchResult {
  ok: number;
  failed: { line: number; message: string }[];
}

export interface CsvImportPanelProps<T> {
  /** Tên file mẫu người dùng tải về (vd: master-plan-import.csv). */
  templateFilename: string;
  templateHeader: string[];
  templateSampleRows: string[][];
  /** Mô tả các cột (hiển thị ở Alert hướng dẫn). */
  columnDocs: CsvImportColumnDoc[];
  /** Một dòng CSV → row hợp lệ hoặc thông báo lỗi. */
  parseRecord: (values: Record<string, string>, line: number) => { row: T } | { error: string };
  /** Cột preview trước khi import. */
  previewColumns: CsvImportColumn<T>[];
  /** Import cả batch (gọi đúng 1 lần tới bulk endpoint BE); throw nếu request thất bại. */
  importRows: (items: { line: number; row: T }[]) => Promise<CsvImportBatchResult>;
  /** Gọi trước mỗi lần parse file mới (dùng reset trạng thái parser nội bộ của parent). */
  onFileStart?: () => void;
  /** Có quyền import không — khác rỗng thì hiện warning thay vì panel. */
  disabledReason?: string;
}

export default function CsvImportPanel<T>({
  templateFilename,
  templateHeader,
  templateSampleRows,
  columnDocs,
  parseRecord,
  previewColumns,
  importRows,
  onFileStart,
  disabledReason,
}: CsvImportPanelProps<T>) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<{ line: number; row: T }[]>([]);
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const [result, setResult] = useState<{ ok: number; failed: { line: number; message: string }[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const loadFile = async (file: File) => {
    onFileStart?.();
    const text = await file.text();
    const table = csvTable(text);
    const nextRows: { line: number; row: T }[] = [];
    const nextErrors: { line: number; message: string }[] = [];
    for (const rec of table.records) {
      const out = parseRecord(rec.values, rec.line);
      if ('row' in out) {
        nextRows.push({ line: rec.line, row: out.row });
      } else {
        nextErrors.push({ line: rec.line, message: out.error });
      }
    }
    setRows(nextRows);
    setErrors(nextErrors);
    setResult(null);
    message.info(`Đã đọc ${file.name}: ${nextRows.length} dòng hợp lệ, ${nextErrors.length} dòng lỗi.`);
  };

  const runImport = async () => {
    setImporting(true);
    try {
      // 1 request bulk cho cả batch – BE validate lại + insert hàng loạt (partial import).
      const res = await importRows(rows);
      setImporting(false);
      setResult(res);
      if (res.failed.length === 0) {
        message.success(`Import thành công ${res.ok} dòng.`);
      } else {
        message.warning(`Import xong: ${res.ok} dòng OK, ${res.failed.length} dòng lỗi.`);
      }
    } catch (e) {
      // Lỗi request (401/403/422/network): không có partial result – hiện message lỗi.
      setImporting(false);
      message.error(e instanceof ApiError ? e.message : String(e));
    }
  };

  if (disabledReason) {
    return <Alert type="warning" showIcon message={disabledReason} />;
  }

  const tableColumns = [
    { title: 'Dòng CSV', dataIndex: 'line', width: 90 },
    ...previewColumns.map((c) => ({
      title: c.title,
      width: c.width,
      render: (_: unknown, record: { line: number; row: T }) => c.value(record.row),
    })),
  ];

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Import dữ liệu từ file CSV"
        description={
          <div>
            <div>
              1) <b>Tải mẫu CSV</b> rồi điền dữ liệu (giữ nguyên dòng tiêu đề) → 2) Chọn file .csv → 3) Kiểm tra preview rồi bấm <b>Import</b>.
            </div>
            <div style={{ marginTop: 8 }}>
              {columnDocs.map((c, i) => (
                <span key={c.key}>
                  {i > 0 && ' · '}
                  <Text code>
                    {c.key}
                    {c.required ? '*' : ''}
                  </Text>
                  <Text type="secondary">
                    {' '}
                    – {c.label}
                    {c.note ? ` (${c.note})` : ''}
                  </Text>
                </span>
              ))}
            </div>
          </div>
        }
      />
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<DownloadOutlined />} onClick={() => downloadCsvTemplate(templateFilename, templateHeader, templateSampleRows)}>
          Tải mẫu CSV
        </Button>
        <Upload accept=".csv" showUploadList={false} beforeUpload={(file) => { void loadFile(file); return false; }}>
          <Button icon={<InboxOutlined />}>Chọn file CSV</Button>
        </Upload>
        <Button type="primary" icon={<ImportOutlined />} disabled={rows.length === 0} loading={importing} onClick={() => void runImport()}>
          Import {rows.length > 0 ? `${rows.length} dòng hợp lệ` : 'CSV'}
        </Button>
      </Space>

      {rows.length > 0 && (
        <Table
          rowKey="line"
          size="small"
          style={{ marginBottom: 12 }}
          columns={tableColumns}
          dataSource={rows}
          pagination={{ pageSize: 10 }}
        />
      )}

      {errors.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={`Dòng lỗi trong file (${errors.length}) – không được import`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {errors.slice(0, 20).map((e) => (
                <li key={e.line}>
                  Dòng {e.line}: {e.message}
                </li>
              ))}
              {errors.length > 20 && <li>…và {errors.length - 20} dòng lỗi khác.</li>}
            </ul>
          }
        />
      )}

      {result && (
        <Alert
          type={result.failed.length === 0 ? 'success' : 'warning'}
          showIcon
          message={`Import hoàn tất: ${result.ok} dòng OK, ${result.failed.length} dòng lỗi.`}
          description={
            result.failed.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {result.failed.slice(0, 20).map((e) => (
                  <li key={e.line}>
                    Dòng {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            ) : (
              <Text type="secondary">Dữ liệu đã được tạo trong hệ thống — xem lại ở trang Master Plan / Tài liệu.</Text>
            )
          }
        />
      )}
    </div>
  );
}

