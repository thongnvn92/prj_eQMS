import type { ReactNode } from 'react';
import { Card, Progress, Statistic, Tag, Tooltip } from 'antd';
import {
  FileExcelOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileUnknownOutlined,
  FileWordOutlined,
  FileZipOutlined,
} from '@ant-design/icons';
import type { ActionStatus, DocumentStatus, Priority, Task } from '../mock/types';

type Meta = { color: string; label: string; hex: string };

// ---------- Domain status → nhãn/màu (không hard-code ở component) ----------
export const TASK_STATUS: Record<string, Meta> = {
  not_started: { label: 'Chưa thực hiện', color: 'default', hex: '#8c8c8c' },
  in_progress: { label: 'Đang thực hiện', color: 'processing', hex: '#1677ff' },
  blocked: { label: 'Bị chặn', color: 'warning', hex: '#faad14' },
  delayed: { label: 'Trễ hạn', color: 'orange', hex: '#fa8c16' },
  completed: { label: 'Hoàn thành', color: 'success', hex: '#52c41a' },
  cancelled: { label: 'Đã hủy', color: 'default', hex: '#bfbfbf' },
};

export const PRIORITY: Record<string, Meta> = {
  critical: { label: 'Critical', color: 'red', hex: '#ff4d4f' },
  high: { label: 'High', color: 'volcano', hex: '#fa541c' },
  medium: { label: 'Medium', color: 'gold', hex: '#faad14' },
  low: { label: 'Low', color: 'blue', hex: '#1677ff' },
};

export const DOC_STATUS: Record<string, Meta> = {
  draft: { label: 'Bản nháp', color: 'default', hex: '#8c8c8c' },
  reviewing: { label: 'Đang thẩm định', color: 'processing', hex: '#1677ff' },
  approval_pending: { label: 'Chờ phê duyệt', color: 'gold', hex: '#faad14' },
  approved: { label: 'Đã phê duyệt', color: 'blue', hex: '#2f54eb' },
  published: { label: 'Đã ban hành', color: 'success', hex: '#52c41a' },
  obsolete: { label: 'Lỗi thời', color: 'orange', hex: '#fa8c16' },
  archived: { label: 'Lưu trữ', color: 'default', hex: '#bfbfbf' },
};

export const ACTION_STATUS: Record<string, Meta> = {
  open: { label: 'Mở', color: 'default', hex: '#8c8c8c' },
  in_progress: { label: 'Đang xử lý', color: 'processing', hex: '#1677ff' },
  blocked: { label: 'Bị chặn', color: 'warning', hex: '#faad14' },
  overdue: { label: 'Quá hạn', color: 'error', hex: '#ff4d4f' },
  pending_verification: { label: 'Chờ xác minh', color: 'gold', hex: '#faad14' },
  verified: { label: 'Đã xác minh', color: 'blue', hex: '#2f54eb' },
  closed: { label: 'Đã đóng', color: 'success', hex: '#52c41a' },
};

/** Trạng thái chung của Risk & Opportunity Register. */
export const RO_STATUS: Record<string, Meta> = {
  open: { label: 'Mở', color: 'default', hex: '#8c8c8c' },
  in_progress: { label: 'Đang xử lý', color: 'processing', hex: '#1677ff' },
  blocked: { label: 'Bị chặn', color: 'warning', hex: '#faad14' },
  pending_verification: { label: 'Chờ xác minh', color: 'gold', hex: '#faad14' },
  closed: { label: 'Đã đóng', color: 'success', hex: '#52c41a' },
};

/** Nguồn rủi ro/cơ hội – theo QT-BISO.03-BM.02/.03 (internal|external|interested_party). */
export const RO_SOURCE_TYPES: { value: string; label: string }[] = [
  { value: 'internal', label: 'Bên trong' },
  { value: 'external', label: 'Bên ngoài' },
  { value: 'interested_party', label: 'Các bên quan tâm' },
];

/** Nhóm nguồn rủi ro/cơ hội (key => label) – khớp RiskSupport::CATEGORIES backend. */
export const RO_CATEGORIES: Record<string, string> = {
  weakness: 'Điểm yếu',
  human: 'Con người',
  infrastructure: 'Cơ sở hạ tầng',
  capital: 'Nguồn vốn',
  materials: 'NVL',
  process: 'QT / PP / HTQL',
  location_environment: 'Vị trí địa lý / Môi trường',
  political_legal: 'Chính trị / luật định',
  competitor: 'Đối thủ',
  customer: 'Khách hàng',
  supplier: 'Nhà cung cấp',
  management: 'Ban lãnh đạo',
  employee: 'Nhân viên',
  community: 'Cộng đồng',
};

/** Chu kỳ đánh giá – khớp RiskSupport::REVIEW_FREQUENCIES. */
export const RO_FREQUENCIES: { value: string; label: string }[] = [
  { value: 'daily', label: 'Hằng ngày' },
  { value: 'monthly', label: 'Hằng tháng' },
  { value: 'quarterly', label: 'Hằng quý' },
  { value: 'yearly', label: 'Hằng năm' },
  { value: 'batch', label: 'Theo lô' },
  { value: 'custom', label: 'Tùy chọn' },
];

export const DOC_TYPE_LABEL: Record<string, string> = {
  policy: 'Chính sách',
  manual: 'Sổ tay',
  regulation: 'Quy chế',
  procedure: 'Quy trình',
  work_instruction: 'Hướng dẫn công việc',
  form: 'Biểu mẫu',
  record: 'Bản ghi',
};

export const ACTION_SOURCE_LABEL: Record<string, string> = {
  audit_finding: 'Audit Finding',
  ncr: 'NCR',
  complaint: 'Khiếu nại',
  risk: 'Rủi ro',
  management: 'Ban Lãnh đạo',
  internal_audit: 'Đánh giá nội bộ',
  other: 'Khác',
};

export function StatusTag({ meta }: { meta: Meta }) {
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function metaOf(map: Record<string, Meta>, key: string): Meta {
  return map[key] ?? { label: key, color: 'default', hex: '#8c8c8c' };
}

/** Điểm số 5×5 (1..25) → màu cảnh báo; `origin` hiển thị chú thích khi hover. */
export function ScorePill({ score, origin }: { score: number; origin?: string }) {
  const hex = score >= 17 ? '#ff4d4f' : score >= 10 ? '#fa8c16' : score >= 5 ? '#1677ff' : '#52c41a';
  const pill = <Tag color={hex} style={{ marginInlineEnd: 0, fontWeight: 600 }}>{score}</Tag>;
  return origin ? <Tooltip title={origin}>{pill}</Tooltip> : pill;
}

export function isTaskOverdue(task: Task, today = new Date().toISOString().slice(0, 10)): boolean {
  return task.dueDate < today && task.status !== 'completed' && task.status !== 'cancelled';
}

/** Số ngày hiệu lực của task (bao gồm cả ngày bắt đầu & kết thúc). */
export function durationDays(task: { startDate: string; dueDate: string }): number {
  const s = new Date(`${task.startDate}T00:00:00`).getTime();
  const e = new Date(`${task.dueDate}T00:00:00`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

export function LevelTag<T extends string = string>({ level }: { level: T }) {
  const map: Record<string, Meta> = {
    low: { label: 'Thấp', color: 'blue', hex: '#1677ff' },
    medium: { label: 'Trung bình', color: 'gold', hex: '#faad14' },
    high: { label: 'Cao', color: 'red', hex: '#ff4d4f' },
    ignore: { label: 'Bỏ qua', color: 'default', hex: '#8c8c8c' },
    research: { label: 'Nghiên cứu', color: 'processing', hex: '#1677ff' },
    priority: { label: 'Ưu tiên', color: 'success', hex: '#52c41a' },
  } as const;
  return <Tag color={(map as Record<string, Meta>)[level]?.color ?? 'default'}>{(map as Record<string, Meta>)[level]?.label ?? level}</Tag>;
}

// ---------- Icon & màu theo loại tệp đính kèm ----------
type FileVisual = { icon: ReactNode; color: string; label: string };

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** Chọn icon/màu theo phần mở rộng (ưu tiên) hoặc MIME type. */
export function fileVisualOf(name: string, mimeType?: string | null): FileVisual {
  const ext = extOf(name);
  const mime = (mimeType ?? '').toLowerCase();
  const pick = (icon: ReactNode, color: string, label: string): FileVisual => ({ icon, color, label });

  switch (ext) {
    case 'pdf': return pick(<FilePdfOutlined />, '#ff4d4f', 'PDF');
    case 'doc':
    case 'docx': return pick(<FileWordOutlined />, '#2f54eb', 'Word');
    case 'xls':
    case 'xlsx':
    case 'csv': return pick(<FileExcelOutlined />, '#52c41a', 'Excel');
    case 'ppt':
    case 'pptx': return pick(<FilePptOutlined />, '#fa541c', 'PowerPoint');
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp': return pick(<FileImageOutlined />, '#722ed1', 'Hình ảnh');
    case 'zip':
    case 'rar':
    case '7z': return pick(<FileZipOutlined />, '#faad14', 'Nén');
    case 'txt': return pick(<FileTextOutlined />, '#8c8c8c', 'Văn bản');
    default:
      break;
  }
  // Dự phòng theo MIME khi không có phần mở rộng rõ ràng.
  if (mime === 'application/pdf') return pick(<FilePdfOutlined />, '#ff4d4f', 'PDF');
  if (mime.startsWith('image/')) return pick(<FileImageOutlined />, '#722ed1', 'Hình ảnh');
  return pick(<FileUnknownOutlined />, '#8c8c8c', 'Tệp');
}

export function isPdf(name: string, mimeType?: string | null): boolean {
  return extOf(name) === 'pdf' || (mimeType ?? '').toLowerCase() === 'application/pdf';
}

/** Định dạng dung lượng cho dễ đọc (KB/MB). */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StatCard({
  title,
  value,
  suffix,
  prefix,
  color,
  description,
}: {
  title: string;
  value: number | string;
  suffix?: ReactNode;
  prefix?: ReactNode;
  color?: string;
  description?: string;
}) {
  return (
    <Card size="small" style={{ height: '100%' }}>
      <Statistic
        title={title}
        value={value}
        suffix={suffix}
        prefix={prefix}
        valueStyle={color ? { color } : undefined}
      />
      {description && (
        <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 4 }}>{description}</div>
      )}
    </Card>
  );
}

export function ProgressCell({ percent }: { percent: number }) {
  const color = percent >= 100 ? '#52c41a' : percent >= 50 ? '#1677ff' : percent > 0 ? '#faad14' : '#d9d9d9';
  return <Progress percent={percent} size="small" strokeColor={color} style={{ marginBottom: 0 }} />;
}
