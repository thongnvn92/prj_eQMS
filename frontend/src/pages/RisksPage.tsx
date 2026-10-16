// CR-RISK-OPPORTUNITY-001 – Risk Register (table + detail drawer + lịch sử + đánh giá)
import { useMemo, useState } from 'react';
import { App, Button, Card, Drawer, Form, Input, InputNumber, Select, Space, Table, Typography } from 'antd';
import { DeleteOutlined, EyeOutlined, PlusOutlined, SearchOutlined, StarOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { useRiskItems, useFetchRiskDetail, useCreateRisk, useUpdateRisk, useEvaluateRisk, useDeleteRisk } from '../hooks/queries';
import { useAppSelector } from '../store/hooks';
import { StatusTag, LevelTag, ScorePill, metaOf, RO_STATUS, RO_SOURCE_TYPES, RO_CATEGORIES, RO_FREQUENCIES } from '../components/widgets';
import { ApiError } from '../services/api';
import type { RiskAssessmentItem, RiskItem, RiskLevel, RoStatus } from '../mock/types';

const { Text } = Typography;

const EDITABLE_STATUS: RoStatus[] = ['open', 'in_progress', 'blocked', 'pending_verification'];

type CreateRiskValues = {
  sourceType: RiskItem['sourceType']; category?: string; objective?: string; description?: string;
  likelihood: number; impact: number; treatment?: string; expectedResult?: string;
  reviewFrequency?: string; nextReviewDate?: string; dueDate?: string;
};

export default function RisksPage() {
  const { can, user } = useAuth();
  const { message } = App.useApp();
  const { data: risks = [], status } = useRiskItems();
  const fetchDetail = useFetchRiskDetail();
  const createRisk = useCreateRisk();
  const updateRisk = useUpdateRisk();
  const evaluateRisk = useEvaluateRisk();
  const removeRisk = useDeleteRisk();

  const { items: actions = [] } = useAppSelector((s) => s.actions);
  const lookups = useAppSelector((s) => s.lookups);

  const [keyword, setKeyword] = useState('');
  const [level, setLevel] = useState<RiskLevel | ''>('');
  const [statusFilter, setStatusFilter] = useState<RoStatus | ''>('');
  const [modal, setModal] = useState<{ mode: 'create' | 'evaluate'; item: RiskItem } | null>(null);
  const [detail, setDetail] = useState<{ risk: RiskItem; history: RiskAssessmentItem[] } | null>(null);

  const rows = useMemo(() => {
    let list = risks;
    const kw = keyword.trim().toLowerCase();
    if (kw) list = list.filter((r) => r.code.toLowerCase().includes(kw) || (r.category ?? '').toLowerCase().includes(kw) || (r.description ?? '').toLowerCase().includes(kw));
    if (level) list = list.filter((r) => r.riskLevel === level);
    if (statusFilter) list = list.filter((r) => r.status === statusFilter);
    return list;
  }, [risks, keyword, level, statusFilter]);

  const personOf = (id?: number | null) => lookups.people.find((p) => p.id === id)?.fullName ?? '—';
  const deptOf = (id?: number | null) => lookups.departments.find((d) => d.id === id)?.name ?? '—';

  const columns = [
    { title: 'Mã', dataIndex: 'code', width: 90 },
    {
      title: 'Vấn đề',
      key: 'title',
      width: 300,
      ellipsis: true,
      render: (_: unknown, r: RiskItem) => <Text title={r.description ?? ''}>{r.category ?? '—'}</Text>,
    },
    {
      title: 'Mức độ',
      key: 'level',
      width: 110,
      render: (_: unknown, r: RiskItem) => <LevelTag level={r.riskLevel} />,
    },
    {
      title: 'Điểm',
      key: 'score',
      width: 90,
      render: (_: unknown, r: RiskItem) => <ScorePill score={r.riskScore} origin={`${r.initialScore} (${r.initialLikelihood}×${r.initialImpact})`} />,
    },
    { title: 'Tiến độ', key: 'progress', width: 100, render: (_: unknown, r: RiskItem) => <Text>{r.progress ?? 0}%</Text> },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 140,
      render: (_: unknown, r: RiskItem) => <StatusTag meta={metaOf(RO_STATUS, r.status)} />,
    },
    { title: 'Phòng', key: 'dept', width: 130, ellipsis: true, render: (_: unknown, r: RiskItem) => r.departmentId != null ? deptOf(r.departmentId) : '—' },
    {
      title: 'Phụ trách',
      key: 'owner',
      width: 130,
      ellipsis: true,
      render: (_: unknown, r: RiskItem) => r.ownerId != null ? personOf(r.ownerId) : '—',
    },
    { title: 'Hạn', dataIndex: 'dueDate', width: 110 },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 230,
      render: (_: unknown, r: RiskItem) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => fetchDetail.mutate(r.id, { onSuccess: (d) => setDetail(d) })}>
            Xem
          </Button>
          {can('risk.evaluate') && EDITABLE_STATUS.includes(r.status) && (
            <Button size="small" icon={<StarOutlined />} type="primary" onClick={() => setModal({ mode: 'evaluate', item: r })}>
              Đánh giá
            </Button>
          )}
          {can('risk.delete') && r.status !== 'closed' && (
            <Button size="small" icon={<DeleteOutlined />} danger onClick={() => removeRisk.mutate(r.id)}>
              Xóa
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const submitEvaluate = (values: { likelihood?: number; impact?: number; comment?: string }) => {
    if (!modal) return;
    const { item } = modal;
    evaluateRisk.mutate(
      { id: item.id, likelihood: values.likelihood ?? item.likelihood, impact: values.impact ?? item.impact, comment: values.comment },
      {
        onSuccess: (updated) => {
          message.success(`Đã đánh giá rủi ro ${updated.code}`);
          setModal(null);
          fetchDetail.mutate(updated.id, { onSuccess: (d) => setDetail(d) });
        },
        onError: (e) => message.error(e instanceof ApiError ? e.message : 'Đánh giá thất bại'),
      },
    );
  };

  const submitCreate = (values: CreateRiskValues) => {
    createRisk.mutate(
      {
        sourceType: values.sourceType,
        category: values.category ?? null,
        objective: values.objective ?? null,
        description: values.description ?? null,
        likelihood: values.likelihood,
        impact: values.impact,
        treatment: values.treatment ?? null,
        expectedResult: values.expectedResult ?? null,
        reviewFrequency: (values.reviewFrequency ?? null) as RiskItem['reviewFrequency'],
        nextReviewDate: values.nextReviewDate ?? null,
        dueDate: values.dueDate ?? null,
      },
      {
        onSuccess: (created) => {
          message.success(`Đã tạo rủi ro ${created.code}`);
          setModal(null);
        },
        onError: (e) => message.error(e instanceof ApiError ? e.message : 'Tạo rủi ro thất bại'),
      },
    );
  };

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space style={{ marginBottom: 12 }}>
          <Input
            placeholder="Tìm mã, danh mục, mô tả..."
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 320 }}
          />
          <Input
            placeholder="Mức độ"
            value={level}
            onChange={(e) => setLevel(e.target.value as RiskLevel | '')}
            style={{ width: 110 }}
          />
          <Input
            placeholder="Trạng thái"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RoStatus | '')}
            style={{ width: 140 }}
          />
          {can('risk.create') && (
            <Button icon={<PlusOutlined />} onClick={() => setModal({ mode: 'create', item: {} as RiskItem })}>
              Thêm rủi ro
            </Button>
          )}
        </Space>
        <Table columns={columns} dataSource={rows} rowKey="id" loading={status === 'loading'} />
      </Card>

      <Drawer
        title="Chi tiết rủi ro"
        placement="right"
        width={640}
        open={!!detail}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <Text type="secondary">Mã: {detail.risk.code}</Text>
              <Text strong>Đánh giá: {detail.risk.riskLevel} — điểm {detail.risk.riskScore}</Text>
              <Text type="secondary">Nguồn: {detail.risk.sourceType}</Text>
              <Text type="secondary">Phòng: {detail.risk.departmentId != null ? deptOf(detail.risk.departmentId) : '—'}</Text>
              <Text type="secondary">Phụ trách: {detail.risk.ownerId != null ? personOf(detail.risk.ownerId) : '—'}</Text>
              <Text type="secondary">Nhắc đánh giá: {detail.risk.reviewFrequency ?? '—'} — gần nhất: {detail.risk.nextReviewDate ?? '—'}</Text>
              <Text type="secondary">Tiến độ: {detail.risk.progress ?? 0}%</Text>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <Text strong>Mô tả</Text>
              <Text>{detail.risk.description ?? '—'}</Text>
              <Text strong>Biện pháp khắc phục</Text>
              <Text>{detail.risk.treatment ?? '—'}</Text>
              <Text strong>Kết quả mong đợi</Text>
              <Text>{detail.risk.expectedResult ?? '—'}</Text>
            </div>
          </div>
        )}
        {detail && detail.history.length > 0 && (
          <Card title="Lịch sử đánh giá" style={{ marginTop: 12 }}>
            <Table
              columns={[
                { title: 'Ngày', dataIndex: 'date', width: 140 },
                { title: 'Mức độ', dataIndex: 'level', width: 120 },
                { title: 'Nội dung', dataIndex: 'comment', width: 300 },
              ]}
              dataSource={detail.history}
              rowKey="id"
              pagination={false}
            />
          </Card>
        )}
        {detail && detail.history.length === 0 && <Text type="secondary">Chưa có lịch sử đánh giá.</Text>}
      </Drawer>

      <Drawer
        title="Đánh giá rủi ro"
        placement="right"
        width={480}
        open={!!modal && modal.mode === 'evaluate'}
        onClose={() => setModal(null)}
      >
        <Form layout="vertical" name="evaluateRisk" onFinish={submitEvaluate}>
          <Form.Item name="likelihood" label="Khả năng xảy ra (1..5)" rules={[{ required: true, message: 'Vui lòng chọn' }]}>
            <InputNumber min={1} max={5} placeholder="1..5" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="impact" label="Mức ảnh hưởng (1..5)" rules={[{ required: true, message: 'Vui lòng chọn' }]}>
            <InputNumber min={1} max={5} placeholder="1..5" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="comment" label="Bình luận">
            <Input.TextArea rows={3} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setModal(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={evaluateRisk.isPending}>
              Xác nhận
            </Button>
          </div>
        </Form>
      </Drawer>

      <Drawer
        title="Thêm rủi ro"
        placement="right"
        width={560}
        open={!!modal && modal.mode === 'create'}
        onClose={() => setModal(null)}
      >
        <Form layout="vertical" name="createRisk" onFinish={submitCreate}>
          <Form.Item name="sourceType" label="Nguồn" rules={[{ required: true, message: 'Vui lòng chọn' }]}>
            <Select placeholder="Chọn nguồn" options={RO_SOURCE_TYPES} />
          </Form.Item>
          <Form.Item name="category" label="Nhóm nguồn">
            <Select
              allowClear
              placeholder="Chọn nhóm"
              options={Object.entries(RO_CATEGORIES).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="objective" label="Mục tiêu / Vấn đề">
            <Input maxLength={250} />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="likelihood" label="Khả năng xảy ra (1..5)" rules={[{ required: true, message: 'Vui lòng chọn' }]} style={{ flex: 1 }}>
              <InputNumber min={1} max={5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="impact" label="Mức ảnh hưởng (1..5)" rules={[{ required: true, message: 'Vui lòng chọn' }]} style={{ flex: 1 }}>
              <InputNumber min={1} max={5} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="treatment" label="Biện pháp khắc phục">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="expectedResult" label="Kết quả mong đợi">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="reviewFrequency" label="Chu kỳ đánh giá">
            <Select allowClear placeholder="Chọn chu kỳ" options={RO_FREQUENCIES} />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="nextReviewDate" label="Ngày nhắc đánh giá" style={{ flex: 1 }}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="dueDate" label="Hạn xử lý" style={{ flex: 1 }}>
              <Input type="date" />
            </Form.Item>
          </Space>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setModal(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={createRisk.isPending}>
              Tạo mới
            </Button>
          </div>
        </Form>
      </Drawer>
    </div>
  );
}
