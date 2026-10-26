// Form tạo/Sửa công việc (task). Sử dụng `visibleRows` theo `editingId`.
import { useMemo } from 'react';
import { Form, Input, Select, Space, Typography, Modal, AutoComplete } from 'antd';
import type { FormInstance } from 'antd';
import type { TaskFormValues } from '../store/slices/ganttGeometry';
import type { MasterPlan, Phase, Task } from '../mock/types';

export interface TaskFormModalProps {
  open: boolean;
  title: string;
  editingId: number | null;
  phases: Phase[];
  people: { id: number; fullName: string }[];
  departments?: { id: number; code: string; name: string }[];
  /** Danh sách task (đã lọc theo kế hoạch) để chọn "Công việc cha" – tối đa 5 cấp. */
  tasks?: Task[];
  initialValues?: Partial<TaskFormValues>;
  onCancel: () => void;
  onOk: (values: TaskFormValues) => void;
}

export default function TaskFormModal({
  open,
  title,
  editingId,
  phases,
  people,
  departments,
  tasks,
  initialValues,
  onCancel,
  onOk,
}: TaskFormModalProps) {
  const [form] = Form.useForm<TaskFormValues>();

  // Tùy chọn "Công việc cha": loại chính nó + con cháu (chọn sẽ thành vòng lặp),
  // chỉ nhận cha ở cấp <= 3 (level) để tổng tối đa 5 cấp (level 0..4).
  const parentOptions = useMemo(() => {
    if (!tasks?.length) return [];
    const excluded = new Set<number>();
    if (editingId != null) {
      const stack = [editingId];
      while (stack.length > 0) {
        const id = stack.pop();
        if (id === undefined || excluded.has(id)) continue;
        excluded.add(id);
        tasks.filter((t) => t.parentId === id).forEach((t) => stack.push(t.id));
      }
    }
    const depth = new Map<number, number>();
    const depthOf = (task: Task, seen: Set<number>): number => {
      const cached = depth.get(task.id);
      if (cached !== undefined) return cached;
      if (seen.has(task.id)) return 1; // dữ liệu hỏng (vòng lặp) → coi như gốc
      seen.add(task.id);
      const parent = task.parentId ? tasks.find((t) => t.id === task.parentId) : undefined;
      const d = parent ? depthOf(parent, seen) + 1 : 1;
      depth.set(task.id, d);
      return d;
    };
    return tasks
      .filter((t) => !excluded.has(t.id) && depthOf(t, new Set<number>()) <= 4)
      .map((t) => ({ value: t.id, label: `${t.code} · ${t.name}` }));
  }, [tasks, editingId]);

  const onFinish = (values: TaskFormValues) => {
    onOk(values);
  };

  return (
    <Modal
      open={open}
      title={title}
      width={820}
      onCancel={onCancel}
      onOk={() => form.validateFields().then(onFinish).catch(() => undefined)}
      okText="Lưu"
      cancelText="Hủy"
      destroyOnHidden
      afterOpenChange={(isOpen) => {
        if (!isOpen) return;
        form.resetFields();
        if (initialValues) form.setFieldsValue(initialValues);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="code" label="Mã công việc" rules={[{ required: true, message: 'Bắt buộc' }]}>
          <Input placeholder="VD: MP-017" maxLength={30} />
        </Form.Item>
        <Form.Item name="name" label="Tên công việc" rules={[{ required: true, message: 'Bắt buộc' }]}>
          <Input placeholder="VD: Biên soạn Tài liệu hướng dẫn" maxLength={250} />
        </Form.Item>
        <Form.Item name="phaseId" label="Nhóm công việc" rules={[{ required: true, message: 'Bắt buộc' }]}>
          <Select placeholder="Chọn giai đoạn" options={phases.map((p) => ({ value: p.id, label: p.name }))} />
        </Form.Item>
        <Form.Item name="parentId" label="Công việc cha">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Để trống = cấp gốc"
            options={parentOptions}
          />
        </Form.Item>
        <Form.Item name="ownerId" label="Phụ trách">
          <AutoComplete
            placeholder="Chọn hoặc nhập tên người phụ trách"
            options={people.map((p) => ({ value: p.fullName, label: p.fullName }))}
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
            }
            allowClear
          />
        </Form.Item>
        <Form.Item name="departmentId" label="Phòng ban">
          <Select placeholder="Chọn phòng" options={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))} allowClear />
        </Form.Item>
        <Form.Item name="priority" label="Ưu tiên" rules={[{ required: true, message: 'Bắt buộc' }]}>
          <Select placeholder="Chọn ưu tiên" options={[{ value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'low', label: 'Low' }]} />
        </Form.Item>
        <Space size={12} style={{ display: 'flex' }}>
          <Form.Item name="startDate" label="Ngày bắt đầu" rules={[{ required: true, message: 'Bắt buộc' }]} style={{ flex: 1 }}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="dueDate" label="Ngày kết thúc" rules={[{ required: true, message: 'Bắt buộc' }]} style={{ flex: 1 }}>
            <Input type="date" />
          </Form.Item>
        </Space>
        <Form.Item name="status" label="Trạng thái" initialValue="not_started">
          <Select
            options={[
              { value: 'not_started', label: 'Chưa thực hiện' },
              { value: 'in_progress', label: 'Đang thực hiện' },
              { value: 'completed', label: 'Hoàn thành' },
              { value: 'delayed', label: 'Trễ hạn' },
              { value: 'blocked', label: 'Tạm dừng' },
              { value: 'cancelled', label: 'Hủy' },
            ]}
          />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú">
          <Input.TextArea rows={3} placeholder="Ghi chú (không bắt buộc)..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
