import { useMemo, useState } from 'react';
import {
  Button, Card, Col, Divider, Empty, Modal, Row, Select, Space, Spin, Table, Tag, Typography, Alert,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  HistoryOutlined,
  OrderedListOutlined,
  RobotOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { useActionItems, useDashboard, useDocuments, useLookups, useMasterPlan } from '../hooks/queries';
import EChart from '../components/EChart';
import {
  ACTION_STATUS,
  DOC_STATUS,
  PRIORITY,
  StatCard,
  StatusTag,
  TASK_STATUS,
  metaOf,
} from '../components/widgets';
import { buildWeeklyReport } from '../components/WeeklyReport';
import type { WeeklyReportModel } from '../components/WeeklyReport';
import WeeklyReportModal from '../components/WeeklyReportModal';
import { analyzeWithAi, isAiConfigured, loadAiSettings } from '../services/ai';
import type { AiSettings } from '../services/ai';
import { api } from '../services/api';
import type { AiAnalysisRecord } from '../services/api';
import { ANALYSIS_MODES, DEFAULT_MODE, composeRagContext } from '../services/rag';
import type { RagChunk } from '../services/rag';
import type { Task } from '../mock/types';
import type { EChartsOption } from 'echarts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeAiMarkdown } from '../utils/markdown';

const SOURCE_TAG_COLOR: Record<string, string> = {
  task: 'blue', document: 'geekblue', action: 'purple', log: 'default',
  kpi: 'green', risk: 'red', bottleneck: 'orange', workload: 'cyan', domain: 'gold',
};

const formatAnalysisDate = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const { data: lookups } = useLookups();
  const { data: masterPlan } = useMasterPlan();
  const { data: documents } = useDocuments();
  const { user } = useAuth();
  const nameOf = (id?: number | null) => lookups?.people.find((p) => p.id === id)?.fullName ?? '—';

  // ---------- AI Insight (RAG) + Weekly Report state ----------
  const { data: actions } = useActionItems();
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => loadAiSettings());
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string>('');
  const [aiError, setAiError] = useState<string>('');
  const [aiSaveError, setAiSaveError] = useState<string>('');
  const [aiMode, setAiMode] = useState<string>(DEFAULT_MODE);
  const [aiSources, setAiSources] = useState<RagChunk[]>([]);
  const [aiHistoryOpen, setAiHistoryOpen] = useState(false);
  const [aiHistory, setAiHistory] = useState<AiAnalysisRecord[]>([]);
  const [aiHistoryLoading, setAiHistoryLoading] = useState(false);
  const [aiHistoryError, setAiHistoryError] = useState('');
  const [selectedAiAnalysisId, setSelectedAiAnalysisId] = useState<number>();
  const [weeklyOpen, setWeeklyOpen] = useState(false);

  /**
   * RAG: dựng knowledge base từ toàn bộ dữ liệu eQMS → retrieve chunk liên quan
   * theo mode → ghép prompt chuyên gia ISO. Thay cho prompt "nhồi" toàn bộ dữ liệu.
   */
  const runAi = (modeKey = aiMode) => {
    setAiError('');
    setAiSaveError('');
    setAiResult('');
    setAiSources([]);
    if (!isAiConfigured(aiSettings)) {
      setAiError('Chưa cấu hình AI. Vào trang Quản trị → tab "Tích hợp AI" để nhập API key.');
      setAiOpen(true);
      return;
    }
    if (!data) {
      setAiError('Chưa có dữ liệu dashboard để phân tích.');
      setAiOpen(true);
      return;
    }
    setAiOpen(true);
    setAiLoading(true);
    const rag = composeRagContext(
      {
        stats: data,
        tasks: masterPlan?.tasks ?? [],
        documents: documents ?? [],
        actions: actions ?? [],
        logs: [],
        people: lookups?.people ?? [],
        departments: lookups?.departments ?? [],
      },
      modeKey,
    );
    setAiSources(rag.sources);
    void (async () => {
      try {
        const text = await analyzeWithAi(aiSettings, rag.userPrompt, rag.systemPrompt);
        setAiResult(text);
        try {
          await api.saveAiAnalysis({
            mode: modeKey,
            provider: aiSettings.provider,
            model: aiSettings.model,
            content: text,
          });
        } catch (e) {
          setAiSaveError(e instanceof Error ? e.message : 'Không lưu được lịch sử phân tích AI.');
        }
      } catch (e) {
        setAiError(e instanceof Error ? e.message : 'Phân tích AI thất bại.');
      } finally {
        setAiLoading(false);
      }
    })();
  };

  const openAiHistory = () => {
    setAiHistoryOpen(true);
    setAiHistoryLoading(true);
    setAiHistoryError('');
    setSelectedAiAnalysisId(undefined);
    api.aiAnalyses()
      .then((records) => {
        setAiHistory(records);
        setSelectedAiAnalysisId(records[0]?.id);
      })
      .catch((e: Error) => setAiHistoryError(e.message))
      .finally(() => setAiHistoryLoading(false));
  };

  const selectedAiAnalysis = aiHistory.find((record) => record.id === selectedAiAnalysisId);

  const weeklyReport = useMemo<WeeklyReportModel | null>(() => {
    if (!data) return null;
    return buildWeeklyReport({
      stats: data,
      tasks: masterPlan?.tasks ?? [],
      documents: documents ?? [],
      departments: lookups?.departments ?? [],
      people: lookups?.people ?? [],
      author: user?.fullName ?? '—',
    });
  }, [data, masterPlan, documents, lookups, user]);


  // ---------- Chart options (Apache ECharts) ----------
  const taskStatusOption = useMemo<EChartsOption | undefined>(() => {
    if (!data) return undefined;
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, icon: 'circle', itemWidth: 8 },
      series: [
        {
          name: 'Task theo trạng thái',
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: { formatter: '{b}: {c}' },
          data: data.tasksByStatus
            .filter((s) => s.count > 0)
            .map((s) => ({
              name: metaOf(TASK_STATUS, s.status).label,
              value: s.count,
              itemStyle: { color: metaOf(TASK_STATUS, s.status).hex },
            })),
        },
      ],
    };
  }, [data]);

  const phaseProgressOption = useMemo<EChartsOption | undefined>(() => {
    if (!data) return undefined;
    const names = data.tasksByPhase.map((p) => p.name.replace(/ \(.*\)$/, ''));
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0 },
      grid: { left: 8, right: 16, top: 24, bottom: 40, containLabel: true },
      xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
      yAxis: { type: 'category', inverse: true, data: names, axisLabel: { width: 190, overflow: 'truncate' } },
      series: [
        {
          name: 'Tiến độ trung bình (%)',
          type: 'bar',
          data: data.tasksByPhase.map((p) => p.avgProgress),
          itemStyle: { color: '#1677ff', borderRadius: [0, 4, 4, 0] },
          barWidth: 14,
          label: { show: true, position: 'right', formatter: '{c}%' },
        },
        {
          name: 'Task hoàn thành / tổng',
          type: 'bar',
          data: data.tasksByPhase.map((p) => Math.round((p.completed / Math.max(p.total, 1)) * 100)),
          itemStyle: { color: '#52c41a', borderRadius: [0, 4, 4, 0] },
          barWidth: 14,
        },
      ],
    };
  }, [data]);

  const priorityOption = useMemo<EChartsOption | undefined>(() => {
    if (!data) return undefined;
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, icon: 'circle', itemWidth: 8 },
      series: [
        {
          name: 'Task theo ưu tiên',
          type: 'pie',
          radius: '62%',
          center: ['50%', '44%'],
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: { formatter: '{b}: {c}' },
          data: data.tasksByPriority
            .filter((p) => p.count > 0)
            .map((p) => ({
              name: metaOf(PRIORITY, p.priority).label,
              value: p.count,
              itemStyle: { color: metaOf(PRIORITY, p.priority).hex },
            })),
        },
      ],
    };
  }, [data]);

  if (isLoading || !data) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const overdueColumns = [
    { title: 'Mã', dataIndex: 'code', width: 90 },
    { title: 'Công việc', dataIndex: 'name' },
    { title: 'Phụ trách', key: 'owner', width: 150, render: (_: unknown, t: Task) => nameOf(t.ownerId) },
    { title: 'Hạn', dataIndex: 'dueDate', width: 130 },
  ];

  return (
    <div className="eqms-page">
      <Typography.Title level={4} className="eqms-page-title">
        Dashboard tổng quan – Kế hoạch ISO T10/2026 → T12/2027
      </Typography.Title>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Space wrap>
          <Button icon={<FileTextOutlined />} onClick={() => setWeeklyOpen(true)}>
            Báo cáo tuần
          </Button>
          <Button icon={<HistoryOutlined />} onClick={openAiHistory}>
            Lịch sử phân tích AI
          </Button>
          <Button type="primary" icon={<RobotOutlined />} onClick={() => runAi(aiMode)} loading={aiLoading}>
            Phân tích AI
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={8} xl={4}>
          <StatCard title="Tổng công việc" value={data.taskTotal} prefix={<OrderedListOutlined />} />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatCard title="Hoàn thành" value={data.taskCompleted} prefix={<CheckCircleOutlined />} color="#52c41a" />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatCard title="Đang thực hiện" value={data.taskInProgress} prefix={<ClockCircleOutlined />} color="#1677ff" />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatCard
            title="Task quá hạn"
            value={data.taskOverdue}
            prefix={<WarningOutlined />}
            color={data.taskOverdue > 0 ? '#ff4d4f' : undefined}
            description="due < hôm nay, chưa hoàn thành"
          />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatCard title="Completion Rate" value={data.completionRate} suffix="%" color="#52c41a" />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatCard title="Trung bình tiến độ" value={data.avgProgress} suffix="%" />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={8}>
          <Card size="small" title="Task theo trạng thái">
            {taskStatusOption && <EChart option={taskStatusOption} height={280} />}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small" title="Tiến độ theo giai đoạn">
            {phaseProgressOption && <EChart option={phaseProgressOption} height={280} />}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small" title="Task theo ưu tiên">
            {priorityOption && <EChart option={priorityOption} height={280} />}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={8}>
          <Card size="small" title="Task theo trạng thái (chi tiết)">
            {data.tasksByStatus.map((s) => (
              <div key={s.status} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <StatusTag meta={metaOf(TASK_STATUS, s.status)} />
                <span style={{ fontWeight: 600 }}>{s.count}</span>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small" title={`Tài liệu theo trạng thái (chờ phê duyệt: ${data.docPending})`}>
            {data.docByStatus
              .filter((s) => s.count > 0)
              .map((s) => (
                <div key={s.status} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <StatusTag meta={metaOf(DOC_STATUS, s.status)} />
                  <span style={{ fontWeight: 600 }}>{s.count}</span>
                </div>
              ))}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small" title={`Action / CAPA (quá hạn: ${data.actionOverdue})`}>
            {data.actionByStatus
              .filter((s) => s.count > 0)
              .map((s) => (
                <div key={s.status} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <StatusTag meta={metaOf(ACTION_STATUS, s.status)} />
                  <span style={{ fontWeight: 600 }}>{s.count}</span>
                </div>
              ))}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card size="small" title={<span style={{ color: '#ff4d4f' }}>⚠ Task quá hạn – cần xử lý</span>}>
            {data.overdueTasks.length === 0 ? (
              <Empty description="Không có task quá hạn 🎉" />
            ) : (
              <Table
                rowKey="id"
                size="small"
                columns={overdueColumns}
                dataSource={data.overdueTasks}
                pagination={false}
                rowClassName={() => 'eqms-row-overdue'}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title={<span><FileTextOutlined /> Tài liệu đang thẩm định / chờ phê duyệt</span>}>
            {data.pendingDocs.length === 0 ? (
              <Empty description="Không có tài liệu đang chờ" />
            ) : (
              <Table
                rowKey="id"
                size="small"
                columns={[
                  { title: 'Mã', dataIndex: 'code', width: 120 },
                  { title: 'Tên tài liệu', dataIndex: 'name' },
                  {
                    title: 'Phụ trách',
                    key: 'owner',
                    width: 140,
                    render: (_: unknown, r: { ownerId: number }) => nameOf(r.ownerId),
                  },
                ]}
                dataSource={data.pendingDocs}
                pagination={false}
              />
            )}
          </Card>
        </Col>
      </Row>

      <WeeklyReportModal open={weeklyOpen} report={weeklyReport} onClose={() => setWeeklyOpen(false)} />

      {/* AI Insight (RAG) – chuyên gia ISO phân tích dữ liệu được truy xuất từ eQMS. */}
      <Modal
        title={<span><RobotOutlined /> Phân tích & Thống kê AI (RAG)</span>}
        open={aiOpen}
        onCancel={() => setAiOpen(false)}
        width={1000}
        footer={[
          <Button key="close" onClick={() => setAiOpen(false)}>
            Đóng
          </Button>,
          <Button key="retry" type="primary" icon={<RobotOutlined />} onClick={() => runAi(aiMode)} loading={aiLoading}>
            Phân tích lại
          </Button>,
        ]}
      >
        <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 8 }}>
          <Space wrap>
            <Typography.Text strong>Chế độ phân tích:</Typography.Text>
            <Select
              value={aiMode}
              onChange={(v) => setAiMode(v)}
              style={{ width: 260 }}
              options={ANALYSIS_MODES.map((m) => ({ value: m.key, label: m.label }))}
            />
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
            RAG truy xuất <b>{aiSources.length || '—'}</b> bằng chứng liên quan nhất từ dữ liệu eQMS để AI phân tích chuyên sâu. Nhà cung cấp:{' '}
            <b>{aiSettings.provider}</b> · Model: <b>{aiSettings.model || '—'}</b> (cấu hình ở trang Quản trị).
          </Typography.Paragraph>
        </Space>

        {aiError && <Alert type="error" showIcon message={aiError} style={{ marginBottom: 12 }} />}
        {aiSaveError && <Alert type="warning" showIcon message={`Kết quả đã có nhưng chưa lưu được lịch sử: ${aiSaveError}`} style={{ marginBottom: 12 }} />}
        {aiLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, color: '#8c8c8c' }}>AI đang truy xuất & phân tích chuyên sâu dữ liệu eQMS...</div>
          </div>
        ) : (
          aiResult && (
            <div className="ai-markdown-view">
              <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}>{normalizeAiMarkdown(aiResult)}</ReactMarkdown>
            </div>
          )
        )}

        {!aiLoading && aiSources.length > 0 && (
          <>
            <Divider style={{ margin: '12px 0 8px' }} />
            <Typography.Text strong>Nguồn dữ liệu truy xuất ({aiSources.length})</Typography.Text>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {aiSources.map((s) => (
                <Tag key={s.id} color={SOURCE_TAG_COLOR[s.kind] ?? 'default'} style={{ marginInlineEnd: 0 }}>
                  [{s.code}] {s.title}
                </Tag>
              ))}
            </div>
          </>
        )}
      </Modal>

      <Modal
        title={<span><HistoryOutlined /> Lịch sử phân tích AI</span>}
        open={aiHistoryOpen}
        onCancel={() => setAiHistoryOpen(false)}
        footer={<Button onClick={() => setAiHistoryOpen(false)}>Đóng</Button>}
        width={1000}
      >
        {aiHistoryError && <Alert type="error" showIcon message={aiHistoryError} style={{ marginBottom: 12 }} />}
        {aiHistoryLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
        ) : aiHistory.length === 0 ? (
          !aiHistoryError && <Empty description="Chưa có lịch sử phân tích AI" />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap>
              <Typography.Text strong>Ngày giờ phân tích - Chế độ phân tích:</Typography.Text>
              <Select
                aria-label="Chọn lịch sử phân tích AI"
                value={selectedAiAnalysisId}
                onChange={setSelectedAiAnalysisId}
                style={{ width: 320 }}
                options={aiHistory.map((record) => ({
                  value: record.id,
                  label: `${formatAnalysisDate(record.analyzedAt)} - ${ANALYSIS_MODES.find((mode) => mode.key === record.mode)?.label ?? record.mode}`,
                }))}
              />
            </Space>
            {selectedAiAnalysis && (
              <>
                <Typography.Text type="secondary">
                  {selectedAiAnalysis.provider} · {selectedAiAnalysis.model} · {formatAnalysisDate(selectedAiAnalysis.analyzedAt)}
                </Typography.Text>
                <div className="ai-markdown-view ai-markdown-history">
                  <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}>
                    {normalizeAiMarkdown(selectedAiAnalysis.content)}
                  </ReactMarkdown>
                </div>
              </>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}
