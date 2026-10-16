import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Checkbox, Divider, Form, Input, Modal, Select, Space, Table, Tag, Typography, Upload } from 'antd';
import { DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { useCreateDocument, useDeleteDocument, useDocuments, useLookups, useNewDocumentVersion, useTransitionDocument, useUpdateDocument, useUploadDocumentFile } from '../hooks/queries';
import { DOC_STATUS, DOC_TYPE_LABEL, StatusTag, fileVisualOf, formatBytes, isPdf, metaOf } from '../components/widgets';
import ConfirmModal from '../components/ConfirmModal';
import { ApiError, api } from '../services/api';
import type { Permission } from '../auth/permissions';
import type { DocAction, DocApproval, DocumentFile, DocumentItem, DocumentStatus, DocumentType, DocVersion } from '../mock/types';

const ACTION_LABEL: Record<DocAction, string> = {
  submit: 'Gửi thẩm định',
  review: 'Trình phê duyệt',
  approve: 'Phê duyệt',
  reject: 'Từ chối',
  publish: 'Ban hành',
};

/** Workflow transitions + quyền tương ứng (FR-DOC-03) */
  const fmtDate = (v: unknown) => {
    if (v == null || v === '') return '—';
    const s = String(v);
    return s.length >= 10 ? `${s.slice(0, 4)}/${s.slice(5, 7)}/${s.slice(8, 10)}` : s;
  };

const WORKFLOW: Record<string, { action: DocAction; perm: Permission; danger?: boolean }[]> = {
  draft: [{ action: 'submit', perm: 'document.submit' }],
  reviewing: [
    { action: 'review', perm: 'document.review' },
    { action: 'reject', perm: 'document.approve', danger: true },
  ],
  approval_pending: [
    { action: 'approve', perm: 'document.approve' },
    { action: 'reject', perm: 'document.approve', danger: true },
  ],
  approved: [{ action: 'publish', perm: 'document.publish' }],
};

/** CR-DOC-UI-001: status code "đã ban hành" (UI label "Đã ban hành") – so sánh theo code, không hardcode label. */
const PUBLISHED_STATUS: DocumentStatus = 'published';

/** Panel tệp đính kèm: mỗi lần upload = 1 revision; PDF xem trực tiếp, file khác tải về. */
function FilesPanel({
  documentId,
  canUpload,
  nameOf,
}: {
  documentId: number;
  canUpload: boolean;
  nameOf: (id?: number | null) => string;
}) {
  const { message } = App.useApp();
  const [files, setFiles] = useState<DocumentFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [changeNote, setChangeNote] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.documentFiles(documentId)
      .then((f) => setFiles(f))
      .catch((e) => message.error(e instanceof ApiError ? e.message : 'Không tải được danh sách tệp'))
      .finally(() => setLoading(false));
  }, [documentId, message]);

  useEffect(() => { load(); }, [load]);

  const doUpload = (fileList: File[]) => {
    if (fileList.length === 0) return;
    if (fileList.length > 10) {
      message.error('Chỉ được tải lên tối đa 10 tệp mỗi lần.');
      return;
    }
    setUploading(true);
    api.uploadDocumentFile(documentId, fileList, changeNote || undefined)
      .then((nf) => {
        message.success(`Đã tải lên ${nf.length} tệp (revision ${nf[0]?.revision}${nf.length > 1 ? `–${nf[nf.length - 1]?.revision}` : ''})`);
        setChangeNote('');
        load();
      })
      .catch((e) => message.error(e instanceof ApiError ? e.message : 'Tải lên thất bại'))
      .finally(() => setUploading(false));
  };

  const doOpen = (f: DocumentFile) => {
    api.downloadDocumentFile(f.id, f.originalName, f.mimeType)
      .catch((e) => message.error(e instanceof ApiError ? e.message : 'Không mở được tệp'));
  };

  return (
    <div>
      <Space wrap style={{ marginBottom: 8 }}>
        <Typography.Text strong>Tệp đính kèm ({files?.length ?? 0})</Typography.Text>
        {canUpload && (
          <Upload
            multiple
            maxCount={10}
            beforeUpload={(file) => { doUpload(Array.isArray(file) ? file : [file as File]); return false; }}
            showUploadList={false}
          >
            <Button size="small" icon={<UploadOutlined />} loading={uploading}>
              Tải lên tệp (tối đa 10)
            </Button>
          </Upload>
        )}
      </Space>
      {canUpload && (
        <Input
          allowClear
          size="small"
          placeholder="Ghi chú thay đổi cho lần tải lên này (không bắt buộc)..."
          value={changeNote}
          onChange={(e) => setChangeNote(e.target.value)}
          style={{ marginBottom: 8, maxWidth: 460 }}
        />
      )}
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        pagination={false}
        dataSource={files ?? []}
        locale={{ emptyText: 'Chưa có tệp đính kèm' }}
        columns={[
          {
            title: 'Tệp',
            key: 'name',
            render: (_: unknown, f: DocumentFile) => {
              const v = fileVisualOf(f.originalName, f.mimeType);
              return (
                <Space size={6}>
                  <span style={{ color: v.color, fontSize: 16, display: 'inline-flex' }}>{v.icon}</span>
                  <span>{f.originalName}</span>
                  <Tag>{v.label}</Tag>
                </Space>
              );
            },
          },
          { title: 'Kích thước', dataIndex: 'size', width: 110, render: (s: number) => formatBytes(s) },
          { title: 'Người tải', key: 'by', width: 150, render: (_: unknown, f: DocumentFile) => nameOf(f.uploadedBy) },
          {
            title: '',
            key: 'act',
            width: 130,
            render: (_: unknown, f: DocumentFile) => (
              <Button
                size="small"
                type="link"
                icon={isPdf(f.originalName, f.mimeType) ? <EyeOutlined /> : <DownloadOutlined />}
                onClick={() => doOpen(f)}
              >
                {isPdf(f.originalName, f.mimeType) ? 'Xem' : 'Tải về'}
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}

export default function DocumentsPage() {
  const { can } = useAuth();
  const { message } = App.useApp();
  const { data, isLoading } = useDocuments();
  const { data: lookups } = useLookups();
  const transition = useTransitionDocument();
  const creator = useCreateDocument();
  const updater = useUpdateDocument();
  const newVersion = useNewDocumentVersion();
  const remover = useDeleteDocument();

  // Thành viên Ban ISO (leader/deputy/member/coordinator) được thêm/chỉnh sửa tài liệu.
  const canCreate = can('document.create');
  const canUpdate = can('document.update');
  const canDelete = can('document.delete');
  const canUpload = canCreate || canUpdate;
  // CR-DOC-UI-001: quyền tạo phiên bản mới = document.create|document.update (khớp middleware route BE).
  const canCreateNewVersion = canCreate || canUpdate;

  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [docType, setDocType] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sortField, setSortField] = useState('');
  const [pending, setPending] = useState<{ doc: DocumentItem; action: DocAction } | null>(null);
  const [form] = Form.useForm<{ comment?: string }>();
  const [editing, setEditing] = useState<DocumentItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [versionForm] = Form.useForm<{ changeSummary?: string }>();
  const [versionModal, setVersionModal] = useState<{ open: boolean; doc: DocumentItem | null; message: string }>({ open: false, doc: null, message: '' });
  // CR-DOC-UI-002: tài liệu đang chờ xác nhận xóa (mở ConfirmModal chung).
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [docForm] = Form.useForm<{
    code: string; name: string; docType: DocumentType;
    departmentId?: number; ownerId?: number; description?: string; changeSummary?: string;
    autoVersion: boolean; version?: string;
  }>();
  // CR: bám trạng thái checkbox auto-version để bật/tắt ô nhập version thủ công.
  const autoVersionChecked = Form.useWatch('autoVersion', docForm);

  const nameOf = (id?: number | null) => lookups?.people.find((p) => p.id === id)?.fullName ?? '—';
  const deptOf = (id?: number | null) => lookups?.departments.find((d) => d.id === id)?.name ?? '—';

  const rows = useMemo(() => {
    let list = data ?? [];
    const kw = keyword.trim().toLowerCase();
    if (kw) list = list.filter((d) => d.code.toLowerCase().includes(kw) || d.name.toLowerCase().includes(kw));
    if (status) list = list.filter((d) => d.status === status);
    if (docType) list = list.filter((d) => d.docType === docType);
    if (deptFilter) list = list.filter((d) => String(d.departmentId) === deptFilter);
    if (sortField) {
      list = [...list].sort((a, b) => {
        const av = String(a[sortField as 'createdAt' | 'updatedAt' | 'code'] ?? '');
        const bv = String(b[sortField as 'createdAt' | 'updatedAt' | 'code'] ?? '');
        if (sortField === 'code') return av.localeCompare(bv);
        return bv.localeCompare(av);
      });
    }
    return list;
  }, [data, keyword, status, docType, deptFilter, sortField]);

  const openAction = (doc: DocumentItem, action: DocAction) => {
    form.resetFields();
    setPending({ doc, action });
  };

  const run = () => {
    if (!pending) return;
    const target = pending;
    form
      .validateFields()
      .then((values) => {
        transition.mutate(
          { id: target.doc.id, action: target.action, comment: values.comment },
          {
            onSuccess: () => {
              message.success(`${ACTION_LABEL[target.action]} thành công – ${target.doc.code}`);
              setPending(null);
            },
            onError: (e) => message.error(e instanceof ApiError ? e.message : 'Thao tác thất bại'),
          },
        );
      })
      .catch(() => undefined); // form validation fail
  };

  const openCreate = () => setShowCreate(true);

  const openEdit = (doc: DocumentItem) => setEditing(doc);

  // Load dữ liệu hiện tại lên form khi mở modal (đảm bảo "Sửa tài liệu" hiển thị đúng data kể cả khi
  // Modal dùng destroyOnClose). Create → reset + mặc định tắt auto-version.
  useEffect(() => {
    if (editing) {
      docForm.resetFields();
      docForm.setFieldsValue({
        code: editing.code, name: editing.name, docType: editing.docType,
        departmentId: editing.departmentId, ownerId: editing.ownerId,
        description: editing.description, autoVersion: editing.autoVersion ?? false,
        version: undefined, changeSummary: undefined,
      });
    } else if (showCreate) {
      docForm.resetFields();
      docForm.setFieldsValue({ autoVersion: false });
    }
  }, [editing, showCreate, docForm]);

  const submitDoc = () => {
    docForm
      .validateFields()
      .then((v) => {
        if (editing) {
          updater.mutate(
            {
              id: editing.id,
              patch: {
                code: v.code, name: v.name, docType: v.docType,
                departmentId: v.departmentId, ownerId: v.ownerId,
                description: v.description, changeSummary: v.changeSummary,
                autoVersion: v.autoVersion,
                // Tắt auto → gửi version thủ công; bật auto → BE tự tăng.
                version: v.autoVersion ? undefined : (v.version ?? '').trim() || undefined,
              },
            },
            {
              onSuccess: () => {
                message.success(`Cập nhật tài liệu thành công – ${v.code}`);
                setEditing(null);
              },
              onError: (e) => message.error(e instanceof ApiError ? e.message : 'Cập nhật thất bại'),
            },
          );
        } else {
          creator.mutate(
            {
              code: v.code, name: v.name, docType: v.docType,
              departmentId: v.departmentId, ownerId: v.ownerId,
              description: v.description, changeSummary: v.changeSummary,
              autoVersion: v.autoVersion,
            },
            {
              onSuccess: () => {
                message.success(`Thêm tài liệu thành công – ${v.code}`);
                setShowCreate(false);
              },
              onError: (e) => message.error(e instanceof ApiError ? e.message : 'Thêm tài liệu thất bại'),
            },
          );
        }
      })
      .catch(() => undefined);
  };

  const openNewVersion = (doc: DocumentItem) => {
    setVersionModal({ open: true, doc, message: `Tạo phiên bản mới cho ${doc.code} (${doc.currentVersion}) — không ghi đè phiên bản hiện hành.` });
  };

  /** Xác nhận bằng ConfirmModal chung → gọi DELETE → slice tự reload list + dashboard. */
  const confirmDelete = (doc: DocumentItem) => setDeleteTarget(doc);

  const columns = [
    { title: 'Mã', dataIndex: 'code', width: 120 },
    { title: 'Tên tài liệu', dataIndex: 'name', width: 260, ellipsis: true },
    { title: 'Phiên bản', dataIndex: 'currentVersion', width: 100, render: (v: unknown) => <Tag>{String(v ?? '—')}</Tag> },
    {
      title: 'Loại',
      key: 'type',
      width: 130,
      render: (_: unknown, d: DocumentItem) => DOC_TYPE_LABEL[d.docType] ?? d.docType,
    },
    { title: 'Phòng', key: 'dept', width: 180, ellipsis: true, render: (_: unknown, d: DocumentItem) => deptOf(d.departmentId) },
    { title: 'Chủ trì', key: 'owner', width: 140, render: (_: unknown, d: DocumentItem) => nameOf(d.ownerId) },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 135,
      render: (_: unknown, d: DocumentItem) => <StatusTag meta={metaOf(DOC_STATUS, d.status)} />,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      width: 105,
      render: (v: unknown) => fmtDate(v),
    },
    {
      title: 'Cập nhật trạng thái',
      dataIndex: 'statusUpdatedAt',
      width: 135,
      render: (v: unknown) => fmtDate(v),
    },
    // CR-DOC-UI-002: cột "Thao tác" (Sửa + Xoá) – đứng ngay trước cột Workflow.
    {
      title: 'Thao tác',
      key: 'edit',
      width: 110,
      render: (_: unknown, d: DocumentItem) => (
        <Space size={4}>
          {canUpdate && d.status === 'draft' && (
            <Button size="small" type="default" icon={<EditOutlined />} onClick={() => openEdit(d)}>
              Sửa
            </Button>
          )}
          {/* Xóa: quyền document.delete; ẩn với published (BE/mock chặn 409). Chỉ giữ icon. */}
          {canDelete && d.status !== PUBLISHED_STATUS && (
            <Button size="small" type="default" danger icon={<DeleteOutlined />} title="Xoá" aria-label="Xoá" onClick={() => confirmDelete(d)} />
          )}
        </Space>
      ),
    },
    {
      title: 'Workflow',
      key: 'actions',
      width: 265,
      render: (_: unknown, d: DocumentItem) => (
        <Space wrap size={4}>
          {(WORKFLOW[d.status] ?? [])
            .filter((w) => can(w.perm))
            .map((w) => (
              <Button
                key={w.action}
                size="small"
                danger={w.danger}
                type={w.danger ? 'default' : 'primary'}
                onClick={() => openAction(d, w.action)}
              >
                {ACTION_LABEL[w.action]}
              </Button>
            ))}
          {/* CR-DOC-UI-001: "Phiên bản mới" chuyển vào cột Workflow – chỉ render khi đã ban hành + có quyền (ẩn, không disable). */}
          {canCreateNewVersion && d.status === PUBLISHED_STATUS && (
            <Button size="small" onClick={() => openNewVersion(d)}>
              Phiên bản mới
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="eqms-page">
      <Typography.Title level={4} className="eqms-page-title">
        Document Control – soạn thảo → thẩm định → phê duyệt → ban hành
      </Typography.Title>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm mã / tên tài liệu..."
            style={{ width: 250 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Select
            allowClear
            placeholder="Trạng thái"
            style={{ width: 175 }}
            options={Object.keys(DOC_STATUS).map((value) => ({ value, label: DOC_STATUS[value].label }))}
            value={status || undefined}
            onChange={(v) => setStatus(v ?? '')}
          />
          <Select
            allowClear
            placeholder="Loại tài liệu"
            style={{ width: 170 }}
            options={Object.keys(DOC_TYPE_LABEL).map((value) => ({ value, label: DOC_TYPE_LABEL[value] }))}
            value={docType || undefined}
            onChange={(v) => setDocType(v ?? '')}
          />
          <Select
            allowClear
            placeholder="Phòng"
            style={{ width: 180 }}
            options={(lookups?.departments ?? []).map((d) => ({ value: String(d.id), label: d.name }))}
            value={deptFilter || undefined}
            onChange={(v) => setDeptFilter(v ?? '')}
          />
          <Select
            allowClear
            placeholder="Sắp xếp"
            style={{ width: 165 }}
            options={[
              { value: 'createdAt', label: 'Ngày tạo giảm dần' },
              { value: 'updatedAt', label: 'Cập nhật gần nhất' },
              { value: 'code', label: 'Mã A → Z' },
            ]}
            value={sortField || undefined}
            onChange={(v) => setSortField(v ?? '')}
          />
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Thêm tài liệu
            </Button>
          )}
          <Typography.Text type="secondary">
            {rows.length} / {data?.length ?? 0} tài liệu
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
          scroll={{ x: 1510 }}
          expandable={{
            expandedRowRender: (d) => (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div>
                  <Typography.Text strong>Lịch sử version (không overwrite)</Typography.Text>
                  <Table
                    rowKey="id"
                    size="small"
                    style={{ marginTop: 8 }}
                    pagination={false}
                    dataSource={d.versions}
                    locale={{ emptyText: 'Chưa có lịch sử version' }}
                    columns={[
                      {
                        title: 'Version',
                        dataIndex: 'version',
                        width: 150,
                        render: (v: unknown, ver: DocVersion) => (
                          <Space size={4}>
                            <span>{String(v ?? '—')}</span>
                            {ver.isCurrent ? <Tag color="blue">Hiện hành</Tag> : <Tag>Cũ</Tag>}
                          </Space>
                        ),
                      },
                      { title: 'Thay đổi', dataIndex: 'changeSummary', render: (c: string | null) => c ?? '—' },
                      { title: 'Người tạo', key: 'c', width: 130, render: (_: unknown, v: DocVersion) => nameOf(v.createdBy) },
                      { title: 'Ngày tạo', dataIndex: 'createdAt', width: 110, render: (v: unknown) => fmtDate(v) },
                    ]}
                  />
                </div>
                <div>
                  <Typography.Text strong>Lịch sử phê duyệt</Typography.Text>
                  <Table
                    rowKey="id"
                    size="small"
                    style={{ marginTop: 8 }}
                    pagination={false}
                    dataSource={d.approvals}
                    locale={{ emptyText: 'Chưa có lịch sử phê duyệt' }}
                    columns={[
                      { title: 'Version', dataIndex: 'version', width: 85, render: (v: string | null) => v ?? '—' },
                      {
                        title: 'Bước',
                        dataIndex: 'step',
                        width: 140,
                        render: (s: string) => metaOf(DOC_STATUS, s).label,
                      },
                      { title: 'Người xử lý', key: 'by', width: 130, render: (_: unknown, a: DocApproval) => nameOf(a.approverId) },
                      {
                        title: 'Thao tác',
                        dataIndex: 'action',
                        width: 110,
                        render: (a: string) => <Tag>{ACTION_LABEL[a as DocAction] ?? a}</Tag>,
                      },
                      { title: 'Comment', dataIndex: 'comment', render: (c: string | null) => c ?? '—' },
                      { title: 'Ngày', dataIndex: 'decidedAt', width: 110, render: (v: unknown) => fmtDate(v) },
                    ]}
                  />
                </div>
                </div>
                <Divider style={{ margin: '12px 0' }} />
                <FilesPanel documentId={d.id} canUpload={canUpload} nameOf={nameOf} />
              </div>
            ),
          }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
        />
      </Card>

      <Modal
        title={editing ? `Sửa tài liệu – ${editing.code}` : 'Thêm tài liệu mới'}
        open={showCreate || !!editing}
        onCancel={() => { setShowCreate(false); setEditing(null); }}
        onOk={submitDoc}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={creator.isPending || updater.isPending}
        destroyOnClose
      >
        <Form form={docForm} layout="vertical" preserve={false}>
          <Form.Item name="code" label="Mã tài liệu" rules={[{ required: true, message: 'Bắt buộc nhập mã tài liệu' }]}>
            <Input placeholder="VD: QT-HCNS.03" maxLength={50} />
          </Form.Item>
          <Form.Item name="name" label="Tên tài liệu" rules={[{ required: true, message: 'Bắt buộc nhập tên tài liệu' }]}>
            <Input placeholder="VD: Quy trình ..." maxLength={250} />
          </Form.Item>
          <Form.Item name="docType" label="Loại tài liệu" rules={[{ required: true, message: 'Bắt buộc chọn loại tài liệu' }]}>
            <Select
              placeholder="Chọn loại"
              options={Object.keys(DOC_TYPE_LABEL).map((value) => ({ value, label: DOC_TYPE_LABEL[value] }))}
            />
          </Form.Item>
          <Form.Item name="departmentId" label="Phòng phụ trách">
            <Select
              allowClear
              placeholder="Chọn phòng"
              options={(lookups?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
          <Form.Item name="ownerId" label="Người biên soạn / chủ trì">
            <Select
              allowClear
              placeholder="Chọn người"
              options={(lookups?.people ?? []).map((p) => ({ value: p.id, label: p.fullName }))}
            />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} placeholder="Mô tả nội dung tài liệu (không bắt buộc)..." />
          </Form.Item>
          <Form.Item name="changeSummary" label="Ghi chú phiên bản">
            <Input placeholder={editing ? 'Nội dung cập nhật...' : 'VD: Dự thảo đầu tiên'} />
          </Form.Item>
          <Form.Item
            name="autoVersion"
            valuePropName="checked"
            extra="Tích để hệ thống tự đánh số phiên bản mới (V0.2, V0.3...); bỏ tích để tự nhập số version bên dưới."
          >
            <Checkbox>Tự động đánh số phiên bản (auto-version)</Checkbox>
          </Form.Item>
          <Form.Item
            name="version"
            label="Số version (khi tắt tự động)"
            extra="Chỉ nhập được khi KHÔNG tích 'Tự động đánh số phiên bản'. Bỏ trống khi đã tích — hệ thống tự tăng dần."
          >
            <Input placeholder="VD: V0.2" maxLength={20} disabled={!!autoVersionChecked} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          pending
            ? `${ACTION_LABEL[pending.action]} – ${pending.doc.code} (${pending.doc.currentVersion})`
            : ''
        }
        open={!!pending}
        onCancel={() => setPending(null)}
        onOk={run}
        okText={pending ? ACTION_LABEL[pending.action] : 'Xác nhận'}
        okButtonProps={{ danger: pending?.action === 'reject' }}
        cancelText="Hủy"
        confirmLoading={transition.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="comment"
            label={pending?.action === 'reject' ? 'Lý do từ chối (bắt buộc)' : 'Nội dung góp ý / ghi chú'}
            rules={[
              {
                required: pending?.action === 'reject',
                message: 'Bắt buộc nhập lý do khi từ chối',
              },
            ]}
          >
            <Input.TextArea
              rows={4}
              placeholder={
                pending?.action === 'reject'
                  ? 'VD: Còn thiếu phụ lục A, chỉnh mục 3.2 theo góp ý Phòng Kỹ thuật...'
                  : 'Ghi chú (không bắt buộc)...'
              }
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={versionModal.doc ? `Tạo phiên bản mới – ${versionModal.doc.code}` : ''}
        open={versionModal.open && !!versionModal.doc}
        onCancel={() => setVersionModal({ open: false, doc: null, message: '' })}
        onOk={() => {
          const doc = versionModal.doc;
          if (!doc) return;
          versionForm
            .validateFields()
            .then((values) => {
              const done = (msg: string) => {
                message.success(msg);
                setVersionModal({ open: false, doc: null, message: '' });
                versionForm.resetFields();
              };
              newVersion.mutate(
                { id: doc.id, version: undefined, changeSummary: values.changeSummary },
                { onSuccess: () => done(`Đã tạo phiên bản mới cho ${doc.code}`), onError: (e) => message.error(e instanceof ApiError ? e.message : 'Tạo phiên bản thất bại') },
              );
            })
            .catch(() => undefined);
        }}
        okText="Tạo phiên bản"
        cancelText="Hủy"
        confirmLoading={newVersion.isPending}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">{versionModal.message}</Typography.Paragraph>
        <Form form={versionForm} layout="vertical" preserve={false}>
          <Form.Item name="changeSummary" label="Ghi chú thay đổi (không bắt buộc)">
            <Input placeholder="VD: Bổ sung phụ lục B, cập nhật mục 4.1..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* CR-DOC-UI-002: modal xác nhận xóa dùng chung (ConfirmModal) cho mọi thao tác phá hủy. */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Xác nhận xóa tài liệu"
        okText="Xoá"
        danger
        confirmLoading={remover.isPending}
        content={
          <>
            Bạn có chắc muốn xóa tài liệu <Typography.Text strong>{deleteTarget?.code}</Typography.Text> ({deleteTarget?.name})?
            <br />
            Thao tác này không thể hoàn tác.
          </>
        }
        onConfirm={() => {
          const doc = deleteTarget;
          if (!doc) return;
          setDeleteTarget(null);
          remover.mutate(doc.id, {
            onSuccess: () => message.success(`Đã xóa tài liệu ${doc.code}`),
            // RTK unwrap() ném error đã serialize ({name, message}) — không phải instance ApiError.
            onError: (e) => message.error(e instanceof ApiError ? e.message : (e as { message?: string })?.message || 'Xóa tài liệu thất bại'),
          });
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
