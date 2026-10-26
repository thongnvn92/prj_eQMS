// Form tạo/Sửa Master Plan (kế hoạch tổng thể).
import { Form, Input, Space, Typography, Modal } from 'antd';
import type { FormInstance } from 'antd';
import type { PlanFormValues } from '../store/slices/ganttGeometry';
import type { MasterPlan } from '../mock/types';

export interface PlanFormModalProps {
  open: boolean;
  title: string;
  plan?: MasterPlan | null;
  onCancel: () => void;
  onOk: (values: PlanFormValues) => void;
}

export default function PlanFormModal({ open, title, plan, onCancel, onOk }: PlanFormModalProps) {
  const [form] = Form.useForm<PlanFormValues>();

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onCancel}
      onOk={() => form.validateFields().then(onOk).catch(() => undefined)}
      okText="Lưu"
      cancelText="Hủy"
      destroyOnHidden
      afterOpenChange={(isOpen) => {
        if (!isOpen) return;
        form.resetFields();
        if (plan) {
          form.setFieldsValue({
            code: plan.code,
            name: plan.name,
            cycleLabel: plan.cycleLabel,
            startDate: plan.startDate,
            endDate: plan.endDate,
            description: plan.description,
          });
        }
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="code" label="Mã kế hoạch" rules={[{ required: true, message: 'Bắt buộc' }]}>
          <Input placeholder="VD: MP-2027" maxLength={30} />
        </Form.Item>
        <Form.Item name="name" label="Tên kế hoạch" rules={[{ required: true, message: 'Bắt buộc' }]}>
          <Input placeholder="Tên kế hoạch ISO" maxLength={200} />
        </Form.Item>
        <Form.Item name="cycleLabel" label="Nhãn chu kỳ" rules={[{ required: true, message: 'Bắt buộc' }]}>
          <Input placeholder="VD: T10/T11/2026 -> T10/T12/2027" maxLength={50} />
        </Form.Item>
        <Space size={12} style={{ display: 'flex' }}>
          <Form.Item name="startDate" label="Bắt đầu" rules={[{ required: true, message: 'Bắt buộc' }]} style={{ flex: 1 }}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="endDate" label="Kết thúc" rules={[{ required: true, message: 'Bắt buộc' }]} style={{ flex: 1 }}>
            <Input type="date" />
          </Form.Item>
        </Space>
        <Form.Item name="description" label="Ghi chú">
          <Input.TextArea rows={3} placeholder="Mô tả kế hoạch..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
