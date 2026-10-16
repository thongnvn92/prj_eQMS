import { useState } from 'react';
import { App, Button, Card, Checkbox, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Typography, Alert } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, RobotOutlined, SaveOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { PERMISSIONS } from '../auth/permissions';
import {
  AI_PROVIDER_META,
  analyzeWithAi,
  isAiConfigured,
  loadAiSettings,
  saveAiSettings,
} from '../services/ai';
import type { AiProvider, AiSettings } from '../services/ai';
import {
  useCreateRole,
  useCreateUser,
  useDeleteRole,
  useDeleteUser,
  useDocuments,
  useImportDocuments,
  useImportTasks,
  useLookups,
  useMasterPlan,
  useResetDemo,
  useRoles,
  useUpdateRole,
  useUpdateUser,
  useUsers,
} from '../hooks/queries';
import { ApiError } from '../services/api';
import CsvImportPanel, { type CsvImportBatchResult } from '../components/CsvImportPanel';
import { DOC_TYPE_LABEL } from '../components/widgets';
import type { DocumentType, Task } from '../mock/types';

interface SafeUser {
  id: number;
  username: string;
  fullName: string;
  email: string | null;
  departmentId: number | null;
  roleCodes: string[];
  active: boolean;
}

interface RoleRow {
  id?: number;
  code: string;
  name: string;
  permissions: string[];
}

/** Nhóm permissions theo module (dashboard, master_plan, document, ...) để render ma trận. */
const PERMISSION_GROUPS: { module: string; items: string[] }[] = (() => {
  const map = new Map<string, string[]>();
  for (const p of PERMISSIONS) {
    const [module] = p.split('.');
    if (!map.has(module)) map.set(module, []);
    map.get(module)!.push(p);
  }
  return [...map.entries()].map(([module, items]) => ({ module, items }));
})();

const MODULE_LABEL: Record<string, string> = {
  dashboard: 'Bảng điều khiển',
  master_plan: 'Kế hoạch tổng thể',
  document: 'Quản lý tài liệu',
  action: 'Action List',
  user: 'Người dùng',
  role: 'Vai trò',
  department: 'Phòng ban',
};

export default function AdminPage() {
  const { message } = App.useApp();
  const { can, user: me } = useAuth();
  const { data: users, isLoading: loadingUsers } = useUsers();
  const { data: roles, isLoading: loadingRoles } = useRoles();
  const { data: lookups } = useLookups();
  const reset = useResetDemo();
  const creator = useCreateUser();
  const updater = useUpdateUser();
  const remover = useDeleteUser();
  const roleCreator = useCreateRole();
  const roleUpdater = useUpdateRole();
  const roleRemover = useDeleteRole();
  const { data: masterPlanData } = useMasterPlan();
  const { data: documents } = useDocuments();
  const tasksImporter = useImportTasks();
  const docsImporter = useImportDocuments();
  const canCreateTask = can('master_plan.create');
  const canCreateDoc = can('document.create');

  const canCreateUser = can('user.create');
  const canUpdateUser = can('user.update');
  const canManageRole = can('role.manage');

  const [userModal, setUserModal] = useState<{ user: SafeUser | null } | null>(null);
  const [userForm] = Form.useForm<{
    username: string; password?: string; fullName: string; email?: string;
    departmentId?: number | null; roleCodes: string[]; active: boolean;
  }>();
  const [roleModal, setRoleModal] = useState<{ role: RoleRow | null } | null>(null);
  const [roleForm] = Form.useForm<{ code: string; name: string; description?: string; permissions: string[] }>();

  // ---------- Import CSV (Master Plan ISO / Document Control) ----------
  const people = lookups?.people ?? [];
  const departments = lookups?.departments ?? [];

  const personLabel = (id: number | null) => (id == null ? '—' : people.find((p) => p.id === id)?.fullName ?? `#${id}`);
  const deptLabel = (id: number | null) => (id == null ? '—' : departments.find((d) => d.id === id)?.name ?? `#${id}`);
  const phaseLabel = (id: number) => masterPlanData?.phases.find((p) => p.id === id)?.name ?? `#${id}`;

  const resolvePersonId = (raw: string): { id: number | null } | { error: string } => {
    if (!raw) return { id: null };
    const key = raw.toLowerCase();
    const hits = people.filter((p) => p.fullName.toLowerCase() === key);
    if (hits.length === 0) return { error: `Không tìm thấy người "${raw}" (khớp theo Họ tên trong hệ thống).` };
    if (hits.length > 1) return { error: `"${raw}" khớp nhiều người — hãy dùng họ tên duy nhất.` };
    return { id: hits[0].id };
  };

  const resolveDepartmentId = (raw: string): { id: number | null } | { error: string } => {
    if (!raw) return { id: null };
    const key = raw.toLowerCase();
    const byName = departments.filter((d) => d.name.toLowerCase() === key);
    if (byName.length === 1) return { id: byName[0].id };
    if (byName.length > 1) return { error: `Phòng "${raw}" khớp nhiều phòng.` };
    if (/^\d+$/.test(raw)) {
      const byId = departments.find((d) => d.id === Number(raw));
      if (byId) return { id: byId.id };
    }
    return { error: `Không tìm thấy phòng ban "${raw}".` };
  };

  const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

  type MpImportRow = { phaseId: number; code: string; name: string; ownerId: number | null; departmentId: number | null; priority?: Task['priority']; startDate: string; dueDate: string; note?: string };
  const parseMpRecord = (values: Record<string, string>): { row: MpImportRow } | { error: string } => {
    const phaseKey = (values.phase ?? '').trim();
    if (!phaseKey) return { error: 'Thiếu cột phase (code hoặc tên giai đoạn).' };
    const phase = (masterPlanData?.phases ?? []).find((p) => p.code.toLowerCase() === phaseKey.toLowerCase() || p.name.toLowerCase() === phaseKey.toLowerCase());
    if (!phase) return { error: `Không tìm thấy giai đoạn "${phaseKey}".` };
    const code = (values.code ?? '').trim();
    if (!code) return { error: 'Thiếu mã công việc (code).' };
    if (code.length > 30) return { error: 'code tối đa 30 ký tự.' };
    const name = (values.name ?? '').trim();
    if (!name) return { error: 'Thiếu tên công việc (name).' };
    if (name.length > 250) return { error: 'name tối đa 250 ký tự.' };
    const startDate = (values.startDate ?? '').trim();
    const dueDate = (values.dueDate ?? '').trim();
    if (!isIsoDate(startDate)) return { error: 'startDate phải dạng yyyy-mm-dd.' };
    if (!isIsoDate(dueDate)) return { error: 'dueDate phải dạng yyyy-mm-dd.' };
    if (dueDate < startDate) return { error: 'dueDate nhỏ hơn startDate.' };
    const priorityRaw = (values.priority ?? '').trim().toLowerCase();
    if (priorityRaw && !['critical', 'high', 'medium', 'low'].includes(priorityRaw)) return { error: 'priority phải là critical|high|medium|low.' };
    const owner = resolvePersonId((values.owner ?? '').trim());
    if ('error' in owner) return owner;
    const dept = resolveDepartmentId((values.department ?? '').trim());
    if ('error' in dept) return dept;
    return { row: { phaseId: phase.id, code, name, ownerId: owner.id, departmentId: dept.id, priority: (priorityRaw || undefined) as Task['priority'] | undefined, startDate, dueDate, note: (values.note ?? '').trim() || undefined } };
  };

  type DocImportRow = { code: string; name: string; docType: DocumentType; departmentId: number | null; ownerId: number | null; description?: string };
  const seenDocCodes = new Set<string>();
  const parseDocRecord = (values: Record<string, string>): { row: DocImportRow } | { error: string } => {
    const code = (values.code ?? '').trim();
    if (!code) return { error: 'Thiếu mã tài liệu (code).' };
    if (code.length > 50) return { error: 'code tối đa 50 ký tự.' };
    const codeKey = code.toLowerCase();
    if (seenDocCodes.has(codeKey)) return { error: `Mã "${code}" bị trùng trong file CSV.` };
    if ((documents ?? []).some((d) => d.code.toLowerCase() === codeKey)) return { error: `Mã "${code}" đã tồn tại trong hệ thống.` };
    seenDocCodes.add(codeKey);
    const name = (values.name ?? '').trim();
    if (!name) return { error: 'Thiếu tên tài liệu (name).' };
    if (name.length > 250) return { error: 'name tối đa 250 ký tự.' };
    const typeRaw = (values.docType ?? '').trim();
    if (!typeRaw) return { error: 'Thiếu cột docType.' };
    let docType = (Object.keys(DOC_TYPE_LABEL) as DocumentType[]).find((k) => k === typeRaw.toLowerCase());
    if (!docType) docType = (Object.entries(DOC_TYPE_LABEL) as [DocumentType, string][]).find(([, label]) => label.toLowerCase() === typeRaw.toLowerCase())?.[0];
    if (!docType) return { error: `docType "${typeRaw}" không hợp lệ (khóa hoặc tên tiếng Việt, vd: procedure / Quy trình).` };
    const owner = resolvePersonId((values.owner ?? '').trim());
    if ('error' in owner) return owner;
    const dept = resolveDepartmentId((values.department ?? '').trim());
    if ('error' in dept) return dept;
    return { row: { code, name, docType, departmentId: dept.id, ownerId: owner.id, description: (values.description ?? '').trim() || undefined } };
  };

  // Gọi bulk endpoint 1 lần duy nhất cho cả batch (không lặp N request create).
  const importMpRows = (items: { line: number; row: MpImportRow }[]) =>
    new Promise<CsvImportBatchResult>((resolve, reject) => {
      tasksImporter.mutate(
        items.map((i) => ({ line: i.line, ...i.row })),
        {
          onSuccess: (r) => resolve({ ok: r.imported, failed: r.errors.map((e) => ({ line: e.line ?? 0, message: e.message })) }),
          onError: (e) => reject(e),
        },
      );
    });
  const importDocRows = (items: { line: number; row: DocImportRow }[]) =>
    new Promise<CsvImportBatchResult>((resolve, reject) => {
      docsImporter.mutate(
        items.map((i) => ({ line: i.line, ...i.row })),
        {
          onSuccess: (r) => resolve({ ok: r.imported, failed: r.errors.map((e) => ({ line: e.line ?? 0, message: e.message })) }),
          onError: (e) => reject(e),
        },
      );
    });

  // ---------- Tích hợp AI (Gemini/GPT/Claude) – cấu hình key ở trang Quản trị ----------
  const [aiForm] = Form.useForm<AiSettings>();
  const [aiSaved, setAiSaved] = useState<AiSettings>(() => loadAiSettings());
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const canManageAi = can('role.manage');

  const saveAi = () => {
    aiForm
      .validateFields()
      .then((v) => {
        const settings: AiSettings = {
          provider: v.provider,
          apiKey: v.apiKey?.trim() ?? '',
          model: v.model?.trim() || AI_PROVIDER_META[v.provider].defaultModel,
          enabled: v.enabled,
        };
        saveAiSettings(settings);
        setAiSaved(settings);
        setAiTestResult(null);
        message.success('Đã lưu cấu hình AI.');
      })
      .catch(() => undefined);
  };

  const testAi = () => {
    aiForm
      .validateFields()
      .then((v) => {
        const settings: AiSettings = {
          provider: v.provider,
          apiKey: v.apiKey?.trim() ?? '',
          model: v.model?.trim() || AI_PROVIDER_META[v.provider].defaultModel,
          enabled: true,
        };
        if (!isAiConfigured(settings)) {
          setAiTestResult({ ok: false, msg: 'Cần nhập API key và bật tích hợp.' });
          return;
        }
        setAiTesting(true);
        setAiTestResult(null);
        analyzeWithAi(settings, 'Hãy trả lời đúng một câu: "Kết nối AI thành công" để xác nhận.')
          .then(() => setAiTestResult({ ok: true, msg: 'Kết nối AI thành công.' }))
          .catch((e: Error) => setAiTestResult({ ok: false, msg: e.message }))
          .finally(() => setAiTesting(false));
      })
      .catch(() => undefined);
  };


  const deptOf = (id: number | null) => lookups?.departments.find((d) => d.id === id)?.name ?? '—';
  const onErr = (e: unknown, fallback: string) => message.error(e instanceof ApiError ? e.message : fallback);

  // ---------- Người dùng: mở form + submit ----------
  const openCreateUser = () => {
    userForm.resetFields();
    userForm.setFieldsValue({ active: true, roleCodes: [] });
    setUserModal({ user: null });
  };

  const openEditUser = (u: SafeUser) => {
    userForm.resetFields();
    userForm.setFieldsValue({
      username: u.username, fullName: u.fullName, email: u.email ?? undefined,
      departmentId: u.departmentId, roleCodes: u.roleCodes, active: u.active,
    });
    setUserModal({ user: u });
  };

  const submitUser = () => {
    userForm
      .validateFields()
      .then((v) => {
        const done = () => {
          message.success(userModal?.user ? `Đã cập nhật ${v.username}` : `Đã tạo người dùng ${v.username}`);
          setUserModal(null);
        };
        if (userModal?.user) {
          updater.mutate(
            {
              id: userModal.user.id,
              patch: {
                username: v.username, fullName: v.fullName, email: v.email,
                departmentId: v.departmentId, roleCodes: v.roleCodes, active: v.active,
                ...(v.password ? { password: v.password } : {}),
              },
            },
            { onSuccess: done, onError: (e) => onErr(e, 'Cập nhật thất bại') },
          );
        } else {
          creator.mutate(
            {
              username: v.username, password: v.password ?? '', fullName: v.fullName, email: v.email,
              departmentId: v.departmentId, roleCodes: v.roleCodes, active: v.active,
            },
            { onSuccess: done, onError: (e) => onErr(e, 'Tạo người dùng thất bại') },
          );
        }
      })
      .catch(() => undefined);
  };

  const removeUser = (u: SafeUser) => {
    remover.mutate(u.id, {
      onSuccess: () => message.success(`Đã xóa người dùng ${u.username}`),
      onError: (e) => onErr(e, 'Xóa người dùng thất bại'),
    });
  };

  // ---------- Vai trò: mở form + submit ----------
  const openCreateRole = () => {
    roleForm.resetFields();
    roleForm.setFieldsValue({ permissions: [] });
    setRoleModal({ role: null });
  };

  const openEditRole = (r: RoleRow) => {
    roleForm.resetFields();
    roleForm.setFieldsValue({ code: r.code, name: r.name, permissions: [...r.permissions] });
    setRoleModal({ role: r });
  };

  const submitRole = () => {
    roleForm
      .validateFields()
      .then((v) => {
        const done = () => {
          message.success(roleModal?.role ? `Đã cập nhật phân quyền vai trò ${v.code}` : `Đã tạo vai trò ${v.code}`);
          setRoleModal(null);
        };
        if (roleModal?.role?.id != null) {
          roleUpdater.mutate(
            { id: roleModal.role.id, patch: { name: v.name, description: v.description, permissions: v.permissions } },
            { onSuccess: done, onError: (e) => onErr(e, 'Cập nhật vai trò thất bại') },
          );
        } else {
          roleCreator.mutate(
            { code: v.code, name: v.name, description: v.description, permissions: v.permissions },
            { onSuccess: done, onError: (e) => onErr(e, 'Tạo vai trò thất bại') },
          );
        }
      })
      .catch(() => undefined);
  };

  const removeRole = (r: RoleRow) => {
    if (r.id == null) {
      message.error('Vai trò không có id – không thể xóa.');
      return;
    }
    roleRemover.mutate(r.id, {
      onSuccess: () => message.success(`Đã xóa vai trò ${r.code}`),
      onError: (e) => onErr(e, 'Xóa vai trò thất bại'),
    });
  };

  // ---------- Cột bảng ----------
  const userColumns = [
    { title: 'Username', dataIndex: 'username', width: 130 },
    { title: 'Họ và tên', dataIndex: 'fullName', width: 200 },
    { title: 'Email', key: 'email', width: 200, render: (_: unknown, u: SafeUser) => u.email ?? '—' },
    { title: 'Phòng', key: 'dept', width: 200, render: (_: unknown, u: SafeUser) => deptOf(u.departmentId) },
    {
      title: 'Vai trò',
      key: 'roles',
      render: (_: unknown, u: SafeUser) => (
        <>
          {u.roleCodes.map((r) => (
            <Tag key={r} color="blue">
              {r}
            </Tag>
          ))}
        </>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'active',
      width: 100,
      render: (_: unknown, u: SafeUser) =>
        u.active ? <Tag color="green">Active</Tag> : <Tag>Disabled</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 150,
      render: (_: unknown, u: SafeUser) => (
        <Space size={4}>
          {canUpdateUser && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditUser(u)}>
              Sửa
            </Button>
          )}
          {canUpdateUser && me?.id !== u.id && (
            <Popconfirm
              title={`Xóa người dùng "${u.username}"?`}
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              onConfirm={() => removeUser(u)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const roleColumns = [
    { title: 'Mã vai trò', dataIndex: 'code', width: 160 },
    { title: 'Tên', dataIndex: 'name', width: 220 },
    {
      title: 'Số quyền',
      key: 'count',
      width: 100,
      render: (_: unknown, r: RoleRow) => <Tag>{r.permissions.length}</Tag>,
    },
    {
      title: 'Chi tiết quyền (module.action)',
      key: 'perms',
      render: (_: unknown, r: RoleRow) => (
        <>
          {r.permissions.map((p) => (
            <Tag key={p} style={{ marginBottom: 4 }}>
              {p}
            </Tag>
          ))}
        </>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 190,
      render: (_: unknown, r: RoleRow) => (
        <Space size={4}>
          {canManageRole && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditRole(r)}>
              Phân quyền
            </Button>
          )}
          {canManageRole && (
            <Popconfirm
              title={`Xóa vai trò "${r.code}"?`}
              description="Chỉ xóa được vai trò tùy chỉnh và chưa gán cho người dùng."
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              onConfirm={() => removeRole(r)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="eqms-page">
      <Space
        style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}
        className="eqms-page-title"
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          Quản trị hệ thống
        </Typography.Title>
        <Popconfirm
          title="Reset toàn bộ dữ liệu demo về ban đầu?"
          okText="Reset"
          cancelText="Hủy"
          onConfirm={() =>
            reset.mutate(undefined, {
              onSuccess: () => message.success('Đã reset dữ liệu demo'),
              onError: () => message.error('Reset thất bại'),
            })
          }
        >
          <Button icon={<ReloadOutlined />} loading={reset.isPending}>
            Reset dữ liệu demo
          </Button>
        </Popconfirm>
      </Space>

      <Card size="small">
        <Tabs
          items={[
            {
              key: 'users',
              label: `Người dùng (${users?.length ?? 0})`,
              children: (
                <>
                  {canCreateUser && (
                    <Space style={{ marginBottom: 12 }}>
                      <Button type="primary" icon={<PlusOutlined />} onClick={openCreateUser}>
                        Thêm người dùng
                      </Button>
                    </Space>
                  )}
                  <Table
                    rowKey="id"
                    size="small"
                    loading={loadingUsers}
                    columns={userColumns}
                    dataSource={users}
                    pagination={{ pageSize: 10, showSizeChanger: true }}
                  />
                </>
              ),
            },
            {
              key: 'roles',
              label: `Vai trò & Phân quyền (${roles?.length ?? 0})`,
              children: (
                <>
                  {canManageRole && (
                    <Space style={{ marginBottom: 12 }}>
                      <Button type="primary" icon={<PlusOutlined />} onClick={openCreateRole}>
                        Thêm vai trò
                      </Button>
                    </Space>
                  )}
                  <Table
                    rowKey="code"
                    size="small"
                    loading={loadingRoles}
                    columns={roleColumns}
                    dataSource={roles}
                    pagination={false}
                  />
                </>
              ),
            },
            {
              key: 'ai',
              label: 'Tích hợp AI',
              children: (
                <div style={{ maxWidth: 640 }}>
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="Phân tích & báo cáo nhanh Dashboard bằng AI"
                    description="Nhập API key của Gemini / OpenAI(GPT) / Claude. Key được lưu cục bộ trên trình duyệt (demo). Với production, nên proxy qua backend để không lộ key."
                  />
                  {!canManageAi ? (
                    <Alert type="warning" showIcon message="Bạn cần quyền quản trị vai trò (role.manage) để cấu hình AI." />
                  ) : (
                    <Form
                      form={aiForm}
                      layout="vertical"
                      initialValues={aiSaved}
                      preserve={false}
                      disabled={!canManageAi}
                    >
                      <Form.Item name="provider" label="Nhà cung cấp" rules={[{ required: true }]}>
                        <Select
                          options={(Object.keys(AI_PROVIDER_META) as AiProvider[]).map((p) => ({
                            value: p,
                            label: AI_PROVIDER_META[p].label,
                          }))}
                          onChange={() => aiForm.setFieldsValue({ model: '' })}
                        />
                      </Form.Item>
                      <Form.Item name="model" label="Model" extra="Để trống sẽ dùng model mặc định của nhà cung cấp.">
                        <Input placeholder={AI_PROVIDER_META[aiSaved.provider]?.defaultModel ?? 'VD: gpt-4o-mini'} />
                      </Form.Item>
                      <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: 'Bắt buộc nhập API key' }]}>
                        <Input.Password placeholder="Dán API key..." autoComplete="new-password" />
                      </Form.Item>
                      <Form.Item name="enabled" label="Bật tích hợp" valuePropName="checked">
                        <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
                      </Form.Item>
                      {aiTestResult && (
                        <Alert
                          type={aiTestResult.ok ? 'success' : 'error'}
                          showIcon
                          message={aiTestResult.msg}
                          style={{ marginBottom: 12 }}
                        />
                      )}
                      <Space>
                        <Button type="primary" icon={<SaveOutlined />} onClick={saveAi}>
                          Lưu cấu hình
                        </Button>
                        <Button icon={<RobotOutlined />} loading={aiTesting} onClick={testAi}>
                          Kiểm tra kết nối
                        </Button>
                        <Typography.Text type="secondary">
                          Lấy key tại:{' '}
                          <a href={AI_PROVIDER_META[aiSaved.provider]?.docs} target="_blank" rel="noreferrer">
                            {AI_PROVIDER_META[aiSaved.provider]?.label}
                          </a>
                        </Typography.Text>
                      </Space>
                    </Form>
                  )}
                </div>
              ),
            },
            {
              key: 'mp-import',
              label: 'Master Plan ISO – Import CSV',
              children: (
                <CsvImportPanel<MpImportRow>
                  templateFilename="master-plan-import.csv"
                  templateHeader={['phase', 'code', 'name', 'owner', 'department', 'priority', 'startDate', 'dueDate', 'note']}
                  templateSampleRows={[
                    ['Giai đoạn 1', 'MP-IMP-001', 'Rà soát hệ thống tài liệu ISO', '', '', 'high', '2026-11-01', '2026-11-30', 'Ví dụ'],
                  ]}
                  columnDocs={[
                    { key: 'phase', label: 'Giai đoạn', required: true, note: 'code hoặc tên phase đang có' },
                    { key: 'code', label: 'Mã công việc', required: true, note: '≤30 ký tự' },
                    { key: 'name', label: 'Tên công việc', required: true, note: '≤250 ký tự' },
                    { key: 'owner', label: 'Phụ trách', note: 'Họ tên khớp hệ thống' },
                    { key: 'department', label: 'Phòng ban', note: 'tên phòng hoặc id' },
                    { key: 'priority', label: 'Ưu tiên', note: 'critical|high|medium|low' },
                    { key: 'startDate', label: 'Ngày bắt đầu', required: true, note: 'yyyy-mm-dd' },
                    { key: 'dueDate', label: 'Hạn hoàn thành', required: true, note: 'yyyy-mm-dd' },
                    { key: 'note', label: 'Ghi chú' },
                  ]}
                  parseRecord={parseMpRecord}
                  previewColumns={[
                    { title: 'Mã', value: (r) => r.code, width: 110 },
                    { title: 'Tên công việc', value: (r) => r.name },
                    { title: 'Giai đoạn', value: (r) => phaseLabel(r.phaseId), width: 140 },
                    { title: 'Ưu tiên', value: (r) => r.priority ?? '—', width: 90 },
                    { title: 'Thời gian', value: (r) => `${r.startDate} → ${r.dueDate}`, width: 200 },
                    { title: 'Phụ trách', value: (r) => personLabel(r.ownerId), width: 140 },
                    { title: 'Phòng', value: (r) => deptLabel(r.departmentId), width: 130 },
                  ]}
                  importRows={importMpRows}
                  disabledReason={canCreateTask ? undefined : 'Bạn cần quyền master_plan.create để import công việc Master Plan ISO.'}
                />
              ),
            },
            {
              key: 'doc-import',
              label: 'Document Control – Import CSV',
              children: (
                <CsvImportPanel<DocImportRow>
                  templateFilename="document-control-import.csv"
                  templateHeader={['code', 'name', 'docType', 'department', 'owner', 'description']}
                  templateSampleRows={[
                    ['QT-BISO.01', 'Quy trình kiểm soát tài liệu', 'procedure', '', '', 'Mô tả tùy chọn'],
                  ]}
                  columnDocs={[
                    { key: 'code', label: 'Mã tài liệu', required: true, note: '≤50 ký tự, không trùng' },
                    { key: 'name', label: 'Tên tài liệu', required: true, note: '≤250 ký tự' },
                    { key: 'docType', label: 'Loại tài liệu', required: true, note: 'procedure/Quy trình, policy/Chính sách, ...' },
                    { key: 'department', label: 'Phòng ban', note: 'tên phòng hoặc id (bỏ trống = phòng của bạn)' },
                    { key: 'owner', label: 'Chủ sở hữu', note: 'Họ tên khớp hệ thống' },
                    { key: 'description', label: 'Mô tả' },
                  ]}
                  parseRecord={parseDocRecord}
                  onFileStart={() => seenDocCodes.clear()}
                  previewColumns={[
                    { title: 'Mã', value: (r) => r.code, width: 120 },
                    { title: 'Tên tài liệu', value: (r) => r.name },
                    { title: 'Loại', value: (r) => DOC_TYPE_LABEL[r.docType] ?? r.docType, width: 150 },
                    { title: 'Phòng', value: (r) => deptLabel(r.departmentId), width: 130 },
                    { title: 'Chủ sở hữu', value: (r) => personLabel(r.ownerId), width: 140 },
                    { title: 'Mô tả', value: (r) => r.description ?? '—' },
                  ]}
                  importRows={importDocRows}
                  disabledReason={canCreateDoc ? undefined : 'Bạn cần quyền document.create để import tài liệu.'}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* CRUD Người dùng */}
      <Modal
        title={userModal?.user ? `Sửa người dùng – ${userModal.user.username}` : 'Thêm người dùng mới'}
        open={!!userModal}
        onCancel={() => setUserModal(null)}
        onOk={submitUser}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={creator.isPending || updater.isPending}
        destroyOnClose
      >
        <Form form={userForm} layout="vertical" preserve={false}>
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
            label={userModal?.user ? 'Mật khẩu mới (để trống giữ nguyên)' : 'Mật khẩu'}
            rules={userModal?.user ? [] : [{ required: true, message: 'Bắt buộc' }, { min: 6, message: 'Tối thiểu 6 ký tự' }]}
          >
            <Input.Password placeholder="Tối thiểu 6 ký tự" maxLength={100} />
          </Form.Item>
          <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, message: 'Bắt buộc' }]}>
            <Input placeholder="VD: Nguyễn Văn A" maxLength={150} />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
            <Input placeholder="VD: a.nv@dmc.vn" maxLength={150} />
          </Form.Item>
          <Form.Item name="departmentId" label="Phòng ban">
            <Select
              allowClear
              placeholder="Chọn phòng"
              options={(lookups?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
          <Form.Item name="roleCodes" label="Vai trò (nhiều lựa chọn)" rules={[{ required: true, message: 'Chọn ít nhất 1 vai trò' }]}>
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

      {/* CRUD Vai trò & Phân quyền */}
      <Modal
        title={roleModal?.role ? `Phân quyền – ${roleModal.role.name} (${roleModal.role.code})` : 'Thêm vai trò mới'}
        open={!!roleModal}
        onCancel={() => setRoleModal(null)}
        onOk={submitRole}
        okText="Lưu"
        cancelText="Hủy"
        width={720}
        confirmLoading={roleCreator.isPending || roleUpdater.isPending}
        destroyOnClose
      >
        <Form form={roleForm} layout="vertical" preserve={false}>
          <Form.Item
            name="code"
            label="Mã vai trò"
            rules={[
              { required: true, message: 'Bắt buộc' },
              { pattern: /^[a-z][a-z0-9_]*$/, message: 'Chữ thường, số và dấu gạch dưới, bắt đầu bằng chữ' },
            ]}
            extra={roleModal?.role ? 'Không thể đổi mã vai trò đã tồn tại.' : undefined}
          >
            <Input placeholder="VD: quality_manager" maxLength={50} disabled={!!roleModal?.role} />
          </Form.Item>
          <Form.Item name="name" label="Tên vai trò" rules={[{ required: true, message: 'Bắt buộc' }]}>
            <Input placeholder="VD: Quality Manager" maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input placeholder="Mô tả ngắn về vai trò (không bắt buộc)..." />
          </Form.Item>
          <Form.Item name="permissions" label="Phân quyền (module.action)" rules={[{ required: true, message: 'Chọn ít nhất 1 quyền' }]}>
            <Checkbox.Group>
              {PERMISSION_GROUPS.map((g) => (
                <div key={g.module} style={{ marginBottom: 8 }}>
                  <Typography.Text strong>
                    {MODULE_LABEL[g.module] ?? g.module} ({g.module})
                  </Typography.Text>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 4 }}>
                    {g.items.map((p) => (
                      <Checkbox key={p} value={p}>
                        {p}
                      </Checkbox>
                    ))}
                  </div>
                </div>
              ))}
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
