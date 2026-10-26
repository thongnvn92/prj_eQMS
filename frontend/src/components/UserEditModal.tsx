import { Modal, Form, Input, Select, Switch } from 'antd';

export interface UserEditProps {
  lookups: { departments: { id: number; name: string }[] } | null;
  roles: { code: string; name: string }[];
  /** Dữ liệu người dùng đã tải từ BE (lâu nhất, không có password) */
  user: {
    id: number;
    username: string;
    fullName: string;
    email?: string | null;
    departmentId?: number | null;
    roleCodes: string[];
    active: boolean;
  };
  /** onSubmit nhận `{ username, fullName, email, departmentId, roleCodes, active, password? }`. password chỉ được gửi khi có. */
  onSubmit: (values: {
    username: string;
    fullName: string;
    email?: string;
    departmentId?: number | null;
    roleCodes: string[];
    active: boolean;
    password?: string;
  }) => void;
  /** xóa khi đóng modal */
  onCancel: () => void;
  /** loading state */
  loading?: boolean;
}

/**
 * Modal Sửa người dùng (Edit User).
 * Hiển thị `user` đã được fetch từ BE và nạp dữ liệu vào form khi mounted.
 */
export default function UserEditModal({
  lookups,
  roles,
  user,
  onSubmit,
  onCancel,
  loading = false,
}: UserEditProps) {
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
      title={`Sửa người dùng – ${user.username}`}
      open
      onCancel={onCancel}
      onOk={() => form.validateFields().then((v) => {
        // Loại bỏ password trống (không gửi mật khẩu khi không chỉnh đổi)
        const password = v.password && v.password.trim() ? v.password : undefined;
        onSubmit({
          ...v,
          password,
        });
      })}
      okText="Lưu"
      cancelText="Hủy"
      width={720}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form
        key={user.id}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          username: user.username,
          fullName: user.fullName,
          email: user.email ?? '',
          departmentId: user.departmentId ?? undefined,
          roleCodes: user.roleCodes,
          active: user.active,
          password: undefined,
        }}
      >
        <Form.Item
          name="username"
          label="Username"
          rules={[
            { required: true, message: 'Bắt buộc' },
            { pattern: /^[a-zA-Z0-9._-]+$/, message: 'Chỉ gồm chữ, số, dấu chấm/gạch dưới/gạch ngang' },
          ]}
        >
          <Input placeholder="VD: nguyenvana" maxLength={50} disabled={!!user} />
        </Form.Item>
        <Form.Item
          name="password"
          label="Mật khẩu mới (để trống giữ nguyên)"
          rules={[]}
        >
          <Input.Password placeholder="Để trống giữ nguyên mật khẩu cũ" maxLength={100} />
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
