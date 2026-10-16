import { useMemo, useState } from 'react';
import { App, Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Typography } from 'antd';
import { CheckOutlined, DeleteOutlined, EditOutlined, LockOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { useActionItems, useCreateAction, useDeleteAction, useLookups, useUpdateAction } from '../hooks/queries';
import { ACTION_SOURCE_LABEL, ACTION_STATUS, ProgressCell, StatusTag, metaOf } from '../components/widgets';
import { ApiError } from '../services/api';
import type { ActionItem } from '../mock/types';

const EDITABLE = ['open', 'in_progress', 'blocked', 'pending_verification'];
const UPDATE_OPTIONS = EDITABLE.map((value) => ({ value, label: ACTION_STATUS[value].label }));

export default function ActionsPage() {
  const { can, user } = useAuth();
  const { message } = App.useApp();
  const { data, isLoading } = useActionItems();
  const { data: lookups } = useLookups();
  const update = useUpdateAction();
  const create = useCreateAction();
  const remove = useDeleteAction();

  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState<{ mode: 'update' | 'close'; item: ActionItem } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm] = Form.useForm<{
    code: string; title: string; description?: string; source: string;
    departmentId?: number; ownerId?: number; dueDate: string; issueDescription?: string;
  }>();
  const [form] = Form.useForm<{
    status?: string; progress?: number; result?: string; evidence?: string;
    title?: string; source?: string; ownerId?: number | null; departmentId?: number | null; dueDate?: string;
  }>();

  const nameOf = (id?: number | null) => lookups?.people.find((p) => p.id === id)?.fullName ?? '—';
  const deptOf = (id?: number | null) => lookups?.departments.find((d) => d.id === id)?.name ?? '—';

  // normal_user: chỉ thấy nút của Action mình phụ trách (mirror ownership check ở backend)
  const canUpdate = (a: ActionItem) =>
    can('action.update') && !(user?.roleCodes.includes('normal_user') && a.ownerId !== user.id);

  const rows = useMemo(() => {
    let list = data ?? [];
    const kw = keyword.trim().toLowerCase();
    if (kw) list = list.filter((a) => a.code.toLowerCase().includes(kw) || a.title.toLowerCase().includes(kw));
    if (status) list = list.filter((a) => a.status === status);
    return list;
  }, [data, keyword, status]);

  const openModal = (mode: 'update' | 'close', item: ActionItem) => {
    form.setFieldsValue(
      mode === 'update'
        ? {
            status: item.status, progress: item.progress, result: item.result ?? '',
            title: item.title, source: item.source,
            ownerId: item.ownerId, departmentId: item.departmentId,
            dueDate: String(item.dueDate).slice(0, 10),
          }
        : { evidence: item.evidence ?? '' },
    );
    setModal({ mode, item });
  };

  const submit = () => {
    if (!modal) return;
    const target = modal;
    form
      .validateFields()
      .then((values) => {
        const patch =
          target.mode === 'update'
            ? {
                status: values.status as ActionItem['status'], progress: values.progress, result: values.result,
                title: values.title, source: values.source as ActionItem['source'],
                ownerId: values.ownerId ?? null, departmentId: values.departmentId ?? null,
                dueDate: values.dueDate,
              }
            : { status: 'closed' as const, evidence: values.evidence };
        update.mutate(
          { id: target.item.id, patch },
          {
            onSuccess: () => {
              message.success(
                `${target.mode === 'close' ? 'Đóng' : 'Cập nhật'} ${target.item.code} thành công`,
              );
              setModal(null);
            },
            onError: (e) => message.error(e instanceof ApiError ? e.message : 'Thao tác thất bại'),
          },
        );
      })
      .catch(() => undefined);
  };

  const submitCreate = () => {
    createForm
      .validateFields()
      .then((v) => {
        create.mutate(
          {
            code: v.code, title: v.title, description: v.description,
            source: v.source as ActionItem['source'],
            departmentId: v.departmentId ?? null, ownerId: v.ownerId ?? null,
            dueDate: v.dueDate, issueDescription: v.issueDescription,
          },
          {
            onSuccess: () => {
              message.success(`Đã tạo Action ${v.code}`);
              setShowCreate(false);
              createForm.resetFields();
            },
            onError: (e) => message.error(e instanceof ApiError ? e.message : 'Tạo Action thất bại'),
          },
        );
      })
      .catch(() => undefined);
  };

  const removeAction = (item: ActionItem) => {
    remove.mutate(item.id, {
      onSuccess: () => message.success(`Đã xóa ${item.code}`),
      onError: (e) => message.error(e instanceof ApiError ? e.message : 'Xóa thất bại'),
    });
  };

  const verify = (item: ActionItem) => {
    update.mutate(
      { id: item.id, patch: { status: 'verified' } },
      {
        onSuccess: () => message.success(`Đã xác minh ${item.code}`),
        onError: (e) => message.error(e instanceof ApiError ? e.message : 'Xác minh thất bại'),
      },
    );
  };

  const columns = [
    { title: 'Mã', dataIndex: 'code', width: 95 },
    {
      title: 'Vấn đề / Action',
      key: 'title',
      width: 300,
      ellipsis: true,
      render: (_: unknown, a: ActionItem) => <Typography.Text title={a.issue}>{a.title}</Typography.Text>,
    },
    {
      title: 'Nguồn',
      key: 'source',
      width: 130,
      render: (_: unknown, a: ActionItem) => ACTION_SOURCE_LABEL[a.source] ?? a.source,
    },
    { title: 'Phụ trách', key: 'owner', width: 140, render: (_: unknown, a: ActionItem) => nameOf(a.ownerId) },
    { title: 'Phòng', key: 'dept', width: 180, ellipsis: true, render: (_: unknown, a: ActionItem) => deptOf(a.departmentId) },
    { title: 'Hạn', dataIndex: 'dueDate', width: 120 },
    { title: 'Tiến độ', key: 'progress', width: 140, render: (_: unknown, a: ActionItem) => <ProgressCell percent={a.progress} /> },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 145,
      render: (_: unknown, a: ActionItem) => <StatusTag meta={metaOf(ACTION_STATUS, a.status)} />,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 215,
      render: (_: unknown, a: ActionItem) => (
        <Space size={4}>
          {canUpdate(a) && EDITABLE.includes(a.status) && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openModal('update', a)}>
              Sửa
            </Button>
          )}
          {can('action.verify') && a.status === 'pending_verification' && (
            <Button size="small" icon={<CheckOutlined />} type="primary" onClick={() => verify(a)}>
              Xác minh
            </Button>
          )}
          {can('action.close') && a.status === 'verified' && (
            <Button size="small" icon={<LockOutlined />} danger onClick={() => openModal('close', a)}>
              Đóng
            </Button>
          )}
          {can('action.delete') && a.status !== 'closed' && (
            <Popconfirm
              title={`Xóa ${a.code}?`}
              description="Hành động này không thể hoàn tác."
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              onConfirm={() => removeAction(a)}
            >
              <Button size="small" icon={<DeleteOutlined />} danger>
                Xóa
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="eqms-page">
      <Typography.Title level={4} className="eqms-page-title">
        Action / CAPA – theo dõi deadline, evidence và hiệu lực
      </Typography.Title>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm mã / tiêu đề..."
            style={{ width: 250 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Select
            allowClear
            placeholder="Trạng thái"
            style={{ width: 175 }}
            options={Object.keys(ACTION_STATUS).map((value) => ({ value, label: ACTION_STATUS[value].label }))}
            value={status || undefined}
            onChange={(v) => setStatus(v ?? '')}
          />
          {can('action.create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>
              Thêm Action
            </Button>
          )}
          <Typography.Text type="secondary">
            {rows.length} / {data?.length ?? 0} action
          </Typography.Text>
        </Space>
      </Card>

      <Card size="small">
        <Table
          rowKey="id"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1550 }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
        />
      </Card>

      <Modal
        title={modal ? `${modal.mode === 'close' ? 'Đóng Action' : 'Cập nhật'} ${modal.item.code}` : ''}
        open={!!modal}
        onCancel={() => setModal(null)}
        onOk={submit}
        okText={modal?.mode === 'close' ? 'Đóng Action' : 'Lưu'}
        cancelText="Hủy"
        confirmLoading={update.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          {modal?.mode === 'update' ? (
            <>
              <Form.Item name="title" label="Vấn đề / Action" rules={[{ required: true, message: 'Bắt buộc nhập tiêu đề' }]}>
                <Input maxLength={250} />
              </Form.Item>
              <Form.Item name="source" label="Nguồn" rules={[{ required: true, message: 'Bắt buộc chọn nguồn' }]}>
                <Select
                  placeholder="Chọn nguồn"
                  options={Object.keys(ACTION_SOURCE_LABEL).map((value) => ({ value, label: ACTION_SOURCE_LABEL[value] }))}
                />
              </Form.Item>
              <Form.Item name="ownerId" label="Phụ trách">
                <Select
                  allowClear
                  placeholder="Chọn người"
                  options={(lookups?.people ?? []).map((p) => ({ value: p.id, label: p.fullName }))}
                />
              </Form.Item>
              <Form.Item name="departmentId" label="Phòng">
                <Select
                  allowClear
                  placeholder="Chọn phòng"
                  options={(lookups?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
                />
              </Form.Item>
              <Form.Item name="dueDate" label="Hạn" rules={[{ required: true, message: 'Bắt buộc nhập hạn' }]}>
                <Input type="date" />
              </Form.Item>
              <Form.Item name="status" label="Trạng thái" rules={[{ required: true, message: 'Bắt buộc' }]}>
                <Select options={UPDATE_OPTIONS} />
              </Form.Item>
              <Form.Item name="progress" label="Tiến độ (%)">
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="result" label="Kết quả / ghi chú">
                <Input.TextArea rows={3} />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              name="evidence"
              label="Evidence (bắt buộc khi đóng)"
              rules={[{ required: true, message: 'Phải ghi evidence trước khi đóng Action' }]}
            >
              <Input.TextArea rows={3} placeholder="VD: Biên bản xác minh số 12/BBC-2026, link hồ sơ..." />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title="Thêm Action / CAPA mới"
        open={showCreate}
        onCancel={() => { setShowCreate(false); createForm.resetFields(); }}
        onOk={submitCreate}
        okText="Tạo"
        cancelText="Hủy"
        confirmLoading={create.isPending}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item name="code" label="Mã Action" rules={[{ required: true, message: 'Bắt buộc nhập mã' }]}>
            <Input placeholder="VD: ACT-2026-017" maxLength={30} />
          </Form.Item>
          <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, message: 'Bắt buộc nhập tiêu đề' }]}>
            <Input placeholder="VD: Sửa quy trình bàn giao ca" maxLength={250} />
          </Form.Item>
          <Form.Item name="source" label="Nguồn phát hiện" rules={[{ required: true, message: 'Bắt buộc chọn nguồn' }]}>
            <Select
              placeholder="Chọn nguồn"
              options={Object.keys(ACTION_SOURCE_LABEL).map((value) => ({ value, label: ACTION_SOURCE_LABEL[value] }))}
            />
          </Form.Item>
          <Form.Item name="dueDate" label="Hạn hoàn thành" rules={[{ required: true, message: 'Bắt buộc' }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="departmentId" label="Phòng phụ trách">
            <Select
              allowClear
              placeholder="Chọn phòng"
              options={(lookups?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
          <Form.Item name="ownerId" label="Người phụ trách">
            <Select
              allowClear
              placeholder="Chọn người"
              options={(lookups?.people ?? []).map((p) => ({ value: p.id, label: p.fullName }))}
            />
          </Form.Item>
          <Form.Item name="issueDescription" label="Mô tả vấn đề phát hiện">
            <Input.TextArea rows={3} placeholder="VD: Ghi nhận sai sót trong kiểm tra nội bộ lần 2..." />
          </Form.Item>
          <Form.Item name="description" label="Hành động khắc phục đề xuất">
            <Input.TextArea rows={3} placeholder="VD: Sửa quy trình, đào tạo lại nhân sự..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

