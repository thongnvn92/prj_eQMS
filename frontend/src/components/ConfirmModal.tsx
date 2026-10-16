// Modal xác nhận DÙNG CHUNG (xoá tài liệu / action / task / bản ghi ISO...).
// Bọc antd Modal với cấu hình chuẩn: nút Hủy + nút xác nhận (danger = đỏ cho hành động phá hủy).
// Dùng `useState<target|null>` + `setTarget` ở page; `onCancel` chỉ cần reset state.
import type { ReactNode } from 'react';
import { Modal } from 'antd';

export interface ConfirmModalProps {
  open: boolean;
  /** Tiêu đề modal (VD: "Xác nhận xóa tài liệu"). */
  title: string;
  /** Nội dung mô tả (có thể chứa mã/tên bản ghi bị xóa). */
  content?: ReactNode;
  okText?: string;
  cancelText?: string;
  /** true = nút xác nhận màu đỏ (hành động phá hủy). */
  danger?: boolean;
  confirmLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  content,
  okText = 'Xác nhận',
  cancelText = 'Hủy',
  danger = false,
  confirmLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      onOk={onConfirm}
      onCancel={onCancel}
      okText={okText}
      cancelText={cancelText}
      okButtonProps={{ danger }}
      confirmLoading={confirmLoading}
      destroyOnHidden
      width={420}
    >
      {content}
    </Modal>
  );
}
