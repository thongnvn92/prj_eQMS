import { Modal, Form, Input, Select, Switch } from 'antd';
import { MinusOutlined } from '@ant-design/icons';

export interface UserCreateProps {
  lookups: { departments: { id: number; name: string }[] } | null;
  roles: { code: string; name: string }[];
  /** Callback khi submit form. Trả về giá trị đã validate. */
  onSubmit: (values: {
    username: string;
    password?: string;
    fullName: string;
    email?: string;
    departmentId?: number | null;
    roleCodes: string[];
    active: boolean;
  }) => void;
  /** Hiển thị khi đang tạo */
  createMode: boolean;
  /** xóa khi đóng modal */
  onCancel: () => void;
  /** loading state */
  loading?: boolean;
}

/**
 * Modal Thêm người dùng mới (Create User).
 * Không nhận `user` nào → luôn tạo mới.
 */
export default function UserCreateModal({
  lookups,
  roles,
  onSubmit,
  createMode,
  onCancel,
  loading = false,
}: UserCreateProps) {
  const [form] = Form.useForm<{
    username: string;
    password?: string;
    fullName: string;
    email?: string;
    departmentId?: number | null;
    roleCodes: string[];
    active: boolean;
  }>();

  return (
    <Modal
      title="Thêm người dùng mới"
      open
      onCancel={onCancel}
      onOk={() => form.validateFields().then(onSubmit).catch(() => undefined)}
      okText="Lưu"
      cancelText="Hủy"
      width={720}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false} initialValues={{ roleCodes: [], active: true }}>
        <Form.Item
          name="username"
          label="Username"
          rules={[
            { required: true, message: 'Bắt buộc' },
            { pattern: /^[a-zA-Z0-9._-]+$/, message: 'Chỉ gồm chữ, số, dấu chấm/gạch dưới/gạch ngang' },
          ]}
        >
          <Input placeholder="VD: nguyenvana" maxLength={50} />
        </Form.Item>
        <Form.Item
          name="password"
          label="Mật khẩu"
          rules={[{ required: true, message: 'Bắt buộc' }, { min: 6, message: 'Tối thiểu 6 ký tự' }]}
        >
          <Input.Password placeholder="Tối thiểu 6 ký tự" maxLength={100} />
        </Form.Item>
        <Form.Item
          name="fullName"
          label="Họ và tên"
          rules={[{ required: true, message: 'Bắt buộc' }]}
        >
          <Input placeholder="VD: Nguyễn Văn A" maxLength={150} />
        </Form.Item>
        <Form.Item
          name="email"
          label="Email"
          rules={[{ type: 'email', message: 'Email không hợp lệ' }]}
        >
          <Input placeholder="VD: a.nv@dmc.vn" maxLength={150} />
        </Form.Item>
        <Form.Item name="departmentId" label="Phòng ban">
          <Select
            allowClear
            placeholder="Chọn phòng"
            options={(lookups?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
          />
        </Form.Item>
        <Form.Item
          name="roleCodes"
          label="Vai trò (nhiều lựa chọn)"
          rules={[{ required: true, message: 'Chọn ít nhất 1 vai trò' }]}
        >
          <Select
            mode="multiple"
            placeholder="Chọn vai trò"
            optionFilterProp="label"
            options={(roles ?? []).map((r) => ({ value: r.code, label: `${r.name} (${r.code})` }))}
          />
        </Form.Item>
        <Form.Item name="active" label="Kích hoạt" valuePropName="checked">
          <Switch checkedChildren="Active" unCheckedChildren="Disabled" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
