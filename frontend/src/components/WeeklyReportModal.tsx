// Modal xem trước "Weekly ISO Management Report" + nút xuất PDF/CSV.
import { Modal, Button, Row, Col, Progress, Table, Tag, Typography } from 'antd';
import { FilePdfOutlined, FileExcelOutlined } from '@ant-design/icons';
import type { WeeklyReportModel } from './WeeklyReport';
import { STATUS_EMOJI, STATUS_TEXT, exportWeeklyCsv, printWeeklyReport } from './WeeklyReport';

const STATUS_COLOR: Record<string, string> = { green: '#52c41a', yellow: '#faad14', red: '#ff4d4f', gray: '#8c8c8c' };

export default function WeeklyReportModal({
  open,
  report,
  onClose,
}: {
  open: boolean;
  report: WeeklyReportModel | null;
  onClose: () => void;
}) {
  if (!report) return null;
  const m = report;

  const kpiCard = (n: number, label: string, color: string) => (
    <Col span={6}>
      <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, textAlign: 'center', background: '#fafafa' }}>
        <div style={{ fontSize: 30, fontWeight: 700, color, lineHeight: 1 }}>{n}</div>
        <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4, textTransform: 'uppercase' }}>{label}</div>
      </div>
    </Col>
  );

  return (
    <Modal
      title={`Báo cáo tuần Ban ISO – ${m.weekLabel}`}
      open={open}
      onCancel={onClose}
      width={980}
      footer={[
        <Button key="close" onClick={onClose}>
          Đóng
        </Button>,
        <Button key="csv" icon={<FileExcelOutlined />} onClick={() => exportWeeklyCsv(m)}>
          Xuất CSV
        </Button>,
        <Button key="pdf" type="primary" icon={<FilePdfOutlined />} onClick={() => printWeeklyReport(m)}>
          Xuất PDF
        </Button>,
      ]}
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: -4 }}>
        Người lập: <b>{m.author}</b> · Ngày báo cáo: {m.reportDate}
      </Typography.Paragraph>

      <Row gutter={[12, 12]}>
        {kpiCard(m.kpis.completed, 'Hoàn thành', '#52c41a')}
        {kpiCard(m.kpis.onTrack, 'Đúng tiến độ', '#1677ff')}
        {kpiCard(m.kpis.overdue, 'Tồn đọng', '#ff4d4f')}
        {kpiCard(m.kpis.needSupport, 'Cần hỗ trợ', '#fa8c16')}
      </Row>

      <div style={{ marginTop: 16 }}>
        <Typography.Text strong>Tiến độ tài liệu ISO</Typography.Text>
        <Progress percent={m.docProgressPct} />
        <Typography.Text type="secondary">
          Tỷ lệ hoàn thành kế hoạch: <b>{m.completionRate}%</b> · Carry-over sang tuần sau: <b>{m.carryOver}</b>
        </Typography.Text>
      </div>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col span={12}>
          <Typography.Text strong>Điểm nổi bật tuần này</Typography.Text>
          <ul style={{ marginTop: 6 }}>
            {m.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </Col>
        <Col span={12}>
          <Typography.Text strong>Trọng tâm tuần tới</Typography.Text>
          <ul style={{ marginTop: 6 }}>
            {m.focusNext.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </Col>
      </Row>

      <div style={{ marginTop: 12 }}>
        <Typography.Text strong>Vấn đề / Quyết định cần BLĐ hỗ trợ</Typography.Text>
        {m.attention.length === 0 ? (
          <div style={{ marginTop: 6, padding: 10, border: '1px solid #f0f0f0', borderRadius: 8, background: '#fafafa' }}>
            Không có vấn đề cần BLĐ hỗ trợ trong tuần.
          </div>
        ) : (
          m.attention.map((a, i) => (
            <div
              key={i}
              style={{
                marginTop: 6,
                padding: 10,
                borderRadius: 8,
                border: `1px solid ${a.level === 'red' ? '#ffccc7' : '#ffe58f'}`,
                background: a.level === 'red' ? '#fff1f0' : '#fffbe6',
              }}
            >
              <div>
                <b>
                  {STATUS_EMOJI[a.level]} {a.title}
                </b>
              </div>
              <div style={{ color: '#595959' }}>{a.detail}</div>
              <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                Cần: {a.need} · Deadline: {a.deadline}
              </div>
            </div>
          ))
        )}
      </div>
      <div style={{ marginTop: 16 }}>
        <Typography.Text strong>Kết quả &amp; Kế hoạch theo giai đoạn</Typography.Text>
        <Table
          size="small"
          style={{ marginTop: 6 }}
          pagination={false}
          rowKey="group"
          dataSource={m.planRows}
          columns={[
            { title: 'Nhóm công việc', dataIndex: 'group' },
            { title: 'Kết quả tuần này', dataIndex: 'result', width: 150 },
            {
              title: 'Status',
              dataIndex: 'status',
              width: 175,
              render: (s: string) => (
                <span style={{ color: STATUS_COLOR[s] }}>
                  {STATUS_EMOJI[s]} {STATUS_TEXT[s]}
                </span>
              ),
            },
            { title: 'Vấn đề', dataIndex: 'issue', width: 150 },
            { title: 'Kế hoạch tuần tới', dataIndex: 'plan' },
            { title: 'Deadline', dataIndex: 'deadline', width: 90 },
            { title: 'PIC', dataIndex: 'pic', width: 120 },
          ]}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <Typography.Text strong>Tình trạng tài liệu ISO theo đơn vị</Typography.Text>
        <Table
          size="small"
          style={{ marginTop: 6 }}
          pagination={false}
          rowKey="dept"
          dataSource={m.docStatusByDept}
          columns={[
            { title: 'Đơn vị', dataIndex: 'dept' },
            { title: 'Đã ban hành', dataIndex: 'published', width: 100, align: 'center' },
            { title: 'Đã phê duyệt', dataIndex: 'approved', width: 100, align: 'center' },
            { title: 'Chờ phê duyệt', dataIndex: 'approvalPending', width: 110, align: 'center' },
            { title: 'Đang thẩm định', dataIndex: 'reviewing', width: 110, align: 'center' },
            { title: 'Nháp/Lỗi thời', dataIndex: 'draft', width: 100, align: 'center' },
            { title: 'Tổng', dataIndex: 'total', width: 70, align: 'center', render: (v: number) => <b>{v}</b> },
            {
              title: 'TT',
              dataIndex: 'status',
              width: 70,
              align: 'center',
              render: (s: string) => (
                <Tag color={s === 'green' ? 'success' : s === 'yellow' ? 'warning' : s === 'red' ? 'error' : 'default'}>
                  {STATUS_EMOJI[s]}
                </Tag>
              ),
            },
          ]}
        />
      </div>
    </Modal>
  );
}
