// CR-RISK-OPPORTUNITY-001 – Opportunity Register (table + detail drawer + đánh giá)
import { useMemo, useState } from 'react';
import { App, Button, Card, Drawer, Form, Input, InputNumber, Select, Space, Table, Typography } from 'antd';
import { DeleteOutlined, EyeOutlined, PlusOutlined, SearchOutlined, StarOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { useOpportunityItems, useCreateOpportunity, useEvaluateOpportunity, useDeleteOpportunity } from '../hooks/queries';
import { useAppSelector } from '../store/hooks';
import { StatusTag, LevelTag, ScorePill, metaOf, RO_STATUS, RO_SOURCE_TYPES, RO_CATEGORIES, RO_FREQUENCIES } from '../components/widgets';
import { ApiError } from '../services/api';
import type { OpportunityLevel, RiskAssessmentItem, OpportunityItem, RoStatus } from '../mock/types';

const { Text } = Typography;

const EDITABLE_STATUS: RoStatus[] = ['open', 'in_progress', 'blocked', 'pending_verification'];

type CreateOpportunityValues = {
  sourceType: OpportunityItem['sourceType']; category?: string; objective?: string; description?: string;
  feasibility: number; benefit: number; solution?: string; expectedResult?: string;
  reviewFrequency?: string; nextReviewDate?: string; dueDate?: string;
};

export default function OpportunitiesPage() {
  const { can, user } = useAuth();
  const { message } = App.useApp();
  const { data: opportunities = [], status } = useOpportunityItems();
  const createOpportunity = useCreateOpportunity();
  const evaluateOpportunity = useEvaluateOpportunity();
  const removeOpportunity = useDeleteOpportunity();

  const { items: actions = [] } = useAppSelector((s) => s.actions);
  const lookups = useAppSelector((s) => s.lookups);

  const [keyword, setKeyword] = useState('');
  const [level, setLevel] = useState<OpportunityLevel | ''>('');
  const [statusFilter, setStatusFilter] = useState<RoStatus | ''>('');
  const [modal, setModal] = useState<{ mode: 'create' | 'evaluate'; item: OpportunityItem } | null>(null);
  const [detail, setDetail] = useState<{ opportunity: OpportunityItem; history: RiskAssessmentItem[] } | null>(null);

  const rows = useMemo(() => {
    let list = opportunities;
    const kw = keyword.trim().toLowerCase();
    if (kw) list = list.filter((o) => o.code.toLowerCase().includes(kw) || (o.category ?? '').toLowerCase().includes(kw) || (o.description ?? '').toLowerCase().includes(kw));
    if (level) list = list.filter((o) => o.opportunityLevel === level);
    if (statusFilter) list = list.filter((o) => o.status === statusFilter);
    return list;
  }, [opportunities, keyword, level, statusFilter]);

  const personOf = (id?: number | null) => lookups.people.find((p) => p.id === id)?.fullName ?? '—';
  const deptOf = (id?: number | null) => lookups.departments.find((d) => d.id === id)?.name ?? '—';

  const columns = [
    { title: 'Mã', dataIndex: 'code', width: 90 },
    {
      title: 'Cơ hội',
      key: 'title',
      width: 300,
      ellipsis: true,
      render: (_: unknown, o: OpportunityItem) => <Text title={o.description ?? ''}>{o.category ?? '—'}</Text>,
    },
    {
      title: 'Độ khả thi',
      key: 'feasibility',
      width: 110,
      render: (_: unknown, o: OpportunityItem) => rowOf(o, 'feasibility'),
    },
    {
      title: 'Lợi ích',
      key: 'benefit',
      width: 110,
      render: (_: unknown, o: OpportunityItem) => rowOf(o, 'benefit'),
    },
    {
      title: 'Điểm',
      key: 'score',
      width: 90,
      render: (_: unknown, o: OpportunityItem) => <ScorePill score={o.opportunityScore} origin={`${o.opportunityScore} (feasible×benefit)`} />,
    },
    {
      title: 'Mức độ',
      key: 'level',
      width: 110,
      render: (_: unknown, o: OpportunityItem) => <LevelTag level={o.opportunityLevel} />,
    },
    { title: 'Tiến độ', key: 'progress', width: 100, render: (_: unknown, o: OpportunityItem) => <Text>{o.progress ?? 0}%</Text> },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 140,
      render: (_: unknown, o: OpportunityItem) => <StatusTag meta={metaOf(RO_STATUS, o.status)} />,
    },
    { title: 'Phòng', key: 'dept', width: 130, ellipsis: true, render: (_: unknown, o: OpportunityItem) => o.departmentId != null ? deptOf(o.departmentId) : '—' },
    {
      title: 'Phụ trách',
      key: 'owner',
      width: 130,
      ellipsis: true,
      render: (_: unknown, o: OpportunityItem) => o.ownerId != null ? personOf(o.ownerId) : '—',
    },
    { title: 'Hạn', dataIndex: 'dueDate', width: 110 },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 230,
      render: (_: unknown, o: OpportunityItem) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail({ opportunity: o, history: [] })}>
            Xem
          </Button>
          {can('opportunity.evaluate') && EDITABLE_STATUS.includes(o.status) && (
            <Button size="small" icon={<StarOutlined />} type="primary" onClick={() => setModal({ mode: 'evaluate', item: o })}>
              Đánh giá
            </Button>
          )}
          {can('opportunity.delete') && o.status !== 'closed' && (
            <Button size="small" icon={<DeleteOutlined />} danger onClick={() => removeOpportunity.mutate(o.id)}>
              Xóa
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const FEASIBILITY_LABEL: Record<number, { label: string; color: string }> = {
    1: { label: 'Rất thấp', color: 'default' },
    2: { label: 'Thấp', color: 'blue' },
    3: { label: 'Trung bình', color: 'gold' },
    4: { label: 'Cao', color: 'processing' },
    5: { label: 'Rất cao', color: 'success' },
  };
  const BENEFIT_LABEL: Record<number, { label: string; color: string }> = {
    1: { label: 'Xấu', color: 'default' },
    2: { label: 'Thấp', color: 'blue' },
    3: { label: 'Trung bình', color: 'gold' },
    4: { label: 'Cao', color: 'processing' },
    5: { label: 'Rất tốt', color: 'success' },
  };

  const rowOf = (o: OpportunityItem, key: 'feasibility' | 'benefit') => (
    <Space>
      {key === 'feasibility' ? FEASIBILITY_LABEL[o[key]]?.label ?? o[key] : BENEFIT_LABEL[o[key]]?.label ?? o[key]}
    </Space>
  );

  const submitEvaluateOpp = (values: { feasibility?: number; benefit?: number; comment?: string }) => {
    if (!modal) return;
    const { item } = modal;
    evaluateOpportunity.mutate(
      { id: item.id, feasibility: values.feasibility ?? item.feasibility, benefit: values.benefit ?? item.benefit, comment: values.comment },
      {
        onSuccess: (updated) => {
          message.success(`Đã đánh giá cơ hội ${updated.code}`);
          setModal(null);
          setDetail({ opportunity: updated, history: (updated as OpportunityItem & { assessments?: RiskAssessmentItem[] }).assessments ?? [] });
        },
        onError: (e) => message.error(e instanceof ApiError ? e.message : 'Đánh giá thất bại'),
      },
    );
  };

  const submitCreateOpp = (values: CreateOpportunityValues) => {
    createOpportunity.mutate(
      {
        sourceType: values.sourceType,
        category: values.category ?? null,
        objective: values.objective ?? null,
        description: values.description ?? null,
        feasibility: values.feasibility,
        benefit: values.benefit,
        solution: values.solution ?? null,
        expectedResult: values.expectedResult ?? null,
        reviewFrequency: (values.reviewFrequency ?? null) as OpportunityItem['reviewFrequency'],
        nextReviewDate: values.nextReviewDate ?? null,
        dueDate: values.dueDate ?? null,
      },
      {
        onSuccess: (created) => {
          message.success(`Đã tạo cơ hội ${created.code}`);
          setModal(null);
        },
        onError: (e) => message.error(e instanceof ApiError ? e.message : 'Tạo cơ hội thất bại'),
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
            onChange={(e) => setLevel(e.target.value as OpportunityLevel | '')}
            style={{ width: 140 }}
          />
          <Input
            placeholder="Trạng thái"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RoStatus | '')}
            style={{ width: 140 }}
          />
          {can('opportunity.create') && (
            <Button icon={<PlusOutlined />} onClick={() => setModal({ mode: 'create', item: {} as OpportunityItem })}>
              Thêm cơ hội
            </Button>
          )}
        </Space>
        <Table columns={columns} dataSource={rows} rowKey="id" loading={status === 'loading'} />
      </Card>

      <Drawer
        title="Chi tiết cơ hội"
        placement="right"
        width={640}
        open={!!detail}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <Text type="secondary">Mã: {detail.opportunity.code}</Text>
              <Text strong>Mức độ: {detail.opportunity.opportunityLevel} — điểm {detail.opportunity.opportunityScore}</Text>
              <Text type="secondary">Nguồn: {detail.opportunity.sourceType}</Text>
              <Text type="secondary">Phòng: {detail.opportunity.departmentId != null ? deptOf(detail.opportunity.departmentId) : '—'}</Text>
              <Text type="secondary">Phụ trách: {detail.opportunity.ownerId != null ? personOf(detail.opportunity.ownerId) : '—'}</Text>
              <Text type="secondary">Nhắc đánh giá: {detail.opportunity.reviewFrequency ?? '—'} — gần nhất: {detail.opportunity.nextReviewDate ?? '—'}</Text>
              <Text type="secondary">Tiến độ: {detail.opportunity.progress ?? 0}%</Text>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <Text strong>Mô tả</Text>
              <Text>{detail.opportunity.description ?? '—'}</Text>
              <Text strong>Giải pháp</Text>
              <Text>{detail.opportunity.solution ?? '—'}</Text>
              <Text strong>Kết quả mong đợi</Text>
              <Text>{detail.opportunity.expectedResult ?? '—'}</Text>
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
        title="Đánh giá cơ hội"
        placement="right"
        width={480}
        open={!!modal && modal.mode === 'evaluate'}
        onClose={() => setModal(null)}
      >
        <Form layout="vertical" name="evaluate" onFinish={submitEvaluateOpp}>
          <Form.Item name="feasibility" label="Độ khả thi (1..5)" rules={[{ required: true, message: 'Vui lòng chọn' }]}>
            <InputNumber min={1} max={5} placeholder="1..5" />
          </Form.Item>
          <Form.Item name="benefit" label="Lợi ích (1..5)" rules={[{ required: true, message: 'Vui lòng chọn' }]}>
            <InputNumber min={1} max={5} placeholder="1..5" />
          </Form.Item>
          <Form.Item name="comment" label="Bình luận">
            <Input.TextArea rows={3} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setModal(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit">
              Xác nhận
            </Button>
          </div>
        </Form>
      </Drawer>

      <Drawer
        title="Thêm cơ hội"
        placement="right"
        width={560}
        open={!!modal && modal.mode === 'create'}
        onClose={() => setModal(null)}
      >
        <Form layout="vertical" name="createOpportunity" onFinish={submitCreateOpp}>
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
          <Form.Item name="objective" label="Mục tiêu / Cơ hội">
            <Input maxLength={250} />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="feasibility" label="Độ khả thi (1..5)" rules={[{ required: true, message: 'Vui lòng chọn' }]} style={{ flex: 1 }}>
              <InputNumber min={1} max={5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="benefit" label="Lợi ích (1..5)" rules={[{ required: true, message: 'Vui lòng chọn' }]} style={{ flex: 1 }}>
              <InputNumber min={1} max={5} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="solution" label="Giải pháp">
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
            <Button type="primary" htmlType="submit" loading={createOpportunity.isPending}>
              Tạo mới
            </Button>
          </div>
        </Form>
      </Drawer>
    </div>
  );
}
