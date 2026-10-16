// Màn hình Gantt Chart – tiến độ task Master Plan (Apache ECharts custom series)
import { useMemo, useState } from 'react';
import { Card, Empty, Select, Space, Spin, Tag, Typography } from 'antd';
import { useLookups, useMasterPlan } from '../hooks/queries';
import EChart from '../components/EChart';
import { PRIORITY, TASK_STATUS, isTaskOverdue, metaOf } from '../components/widgets';
import { flattenVisibleTree, tasksOfPlan } from '../store/slices/flattenTree';
import { MAX_WBS_LEVEL } from '../store/slices/ganttGeometry';
import type { Priority, Task, TaskStatus } from '../mock/types';
import type { EChartsOption } from 'echarts';

const STATUS_OPTIONS = Object.keys(TASK_STATUS).map((value) => ({
  value,
  label: TASK_STATUS[value].label,
}));

const toTs = (d: string) => new Date(`${d}T00:00:00`).getTime();

/** Vùng nhãn tên công việc bên trái Gantt (truncate nếu dài hơn) — px. */
const GANTT_LABEL_WIDTH = 320;
/** Khoảng cách nhãn → vùng bar (px). */
const GANTT_LABEL_GAP = 12;
/** grid.left = toàn bộ vùng nhãn + gap; margin = grid.left → nhãn căm trải từ mép trái, không đè bar. */
const GANTT_GRID_LEFT = GANTT_LABEL_WIDTH + GANTT_LABEL_GAP;

/** Legend antd màu theo status domain */
function StatusLegend() {
  return (
    <Space size={8} wrap>
      {Object.keys(TASK_STATUS).map((k) => (
        <Tag key={k} color={TASK_STATUS[k].color} style={{ marginInlineEnd: 0 }}>
          {TASK_STATUS[k].label}
        </Tag>
      ))}
      <Tag color="red" style={{ marginInlineEnd: 0 }}>
        Viền đỏ = Overdue
      </Tag>
    </Space>
  );
}

export default function GanttPage() {
  const { data, isLoading } = useMasterPlan();
  const { data: lookups } = useLookups();
  const [phaseId, setPhaseId] = useState<number | ''>('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [planId, setPlanId] = useState<number | ''>('');

  const nameOf = (id?: number | null) => lookups?.people.find((p) => p.id === id)?.fullName ?? '—';
  const phaseName = (id: number) => data?.phases.find((p) => p.id === id)?.name ?? '—';

  // CR: sắp xếp GIỐNG Master Plan ISO (cây phân cấp cha → con) – cùng nguồn flattenVisibleTree,
  // mở sẵn mọi cấp để Gantt hiển thị đủ công việc con; level dùng để thụt lề nhãn.
  // Chọn Master Plan (rỗng = tất cả kế hoạch) → chỉ lấy task thuộc kế hoạch (tasksOfPlan).
  const planTasks = useMemo(
    () => tasksOfPlan(data?.tasks ?? [], data?.phases ?? [], planId === '' ? null : planId),
    [data, planId],
  );
  const rows = useMemo(
    () =>
      flattenVisibleTree(planTasks, [], {
        phaseId: phaseId === '' ? '' : String(phaseId),
        status: status || undefined,
        priority: priority || undefined,
      }, { defaultExpandLevels: MAX_WBS_LEVEL }),
    [planTasks, phaseId, status, priority],
  );

  /** Nhãn trục Y: thụt vô theo cấp (24px/cấp) để thấy công việc cha–con. */
  const categoryLabel = (row: { code: string; name: string; level: number }) =>
    `${'　'.repeat(row.level * 3)}${row.code} · ${row.name}`;

  const option = useMemo<EChartsOption | undefined>(() => {
    if (!data) return undefined;
    const today = toTs(new Date().toISOString().slice(0, 10));

    const categories = rows.map(categoryLabel);
    const seriesData = rows.map((t, index) => ({
      value: [index, toTs(t.startDate), toTs(t.dueDate), t.progress, t.status],
      task: t,
    }));

    return {
      textStyle: { color: '#111827' },
      tooltip: {
        trigger: 'item',
        formatter: (params) => {
          const p = params as { data?: { task?: Task } };
          const t = p.data?.task;
          if (!t) return '';
          const overdue = isTaskOverdue(t);
          return (
            `<b>${t.code} – ${t.name}</b><br/>` +
            `Giai đoạn: ${phaseName(t.phaseId)}<br/>` +
            `Phụ trách: ${nameOf(t.ownerId)}<br/>` +
            `Thời gian: ${t.startDate} → ${t.dueDate}${overdue ? ' <span style="color:#ff4d4f">(Overdue)</span>' : ''}<br/>` +
            `Trạng thái: ${metaOf(TASK_STATUS, t.status).label}<br/>` +
            `Ưu tiên: ${metaOf(PRIORITY, t.priority).label}<br/>` +
            `Tiến độ: <b>${t.progress}%</b>`
          );
        },
      },
      grid: { left: GANTT_GRID_LEFT, right: 40, top: 8, bottom: 8, containLabel: false },
      // Hover chuột qua tên công việc (hoặc bar) → cả dòng được tô nền (highlight row).
      xAxis: {
        type: 'time',
        axisLabel: { formatter: '{MM}/{yy}' },
        splitLine: { show: true, lineStyle: { color: '#f0f0f0' } },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: categories,
        axisLabel: {
          width: GANTT_LABEL_WIDTH,
          overflow: 'truncate',
          align: 'left',
          // margin = grid.left → nhãn bắt đầu từ mép trái (căm trái thẳng hàng), kết thúc trước vùng bar.
          margin: GANTT_GRID_LEFT,
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#d9d9d9' } },
        // shadow ngang theo chiều cao dòng khi hover tên công việc (hoặc bar) → cả dòng sáng lên.
        axisPointer: {
          show: true,
          type: 'shadow',
          shadowStyle: { color: 'rgba(22,119,255,0.08)' },
          label: { show: false },
        },
        triggerEvent: true,
      },
      series: [
        {
          type: 'custom',
          encode: { x: [1, 2], y: 0 },
          renderItem: (_params, api) => {
            const index = api.value(0) as number;
            const startTs = api.value(1) as number;
            const endTs = api.value(2) as number;
            const progress = api.value(3) as number;
            const taskStatus = api.value(4) as string;

            const start = api.coord([startTs, index]) as [number, number];
            const end = api.coord([endTs, index]) as [number, number];
            const rowHeight = ((api.size as (d: number[]) => number[])([0, 1]) ?? [0, 20])[1];
            const barHeight = Math.min(Math.max(rowHeight * 0.55, 10), 22);

            const fullLeft = start[0];
            const fullWidth = Math.max(end[0] - start[0], 2);
            const progressWidth = Math.max((fullWidth * progress) / 100, 0);

            const meta = metaOf(TASK_STATUS, taskStatus);
            const task = (seriesData[index] as { task?: Task } | undefined)?.task;
            const overdue = task ? isTaskOverdue(task) : false;

            const children: unknown[] = [
              // nền bar (toàn bộ khoảng thời gian), viền đỏ nếu overdue
              {
                type: 'rect',
                shape: { x: fullLeft, y: start[1] - barHeight / 2, width: fullWidth, height: barHeight, r: 3 },
                style: {
                  fill: meta.hex,
                  opacity: 0.18,
                  stroke: overdue ? '#ff4d4f' : 'none',
                  lineWidth: overdue ? 1.5 : 0,
                },
              },
              // phần tiến độ đã hoàn thành
              {
                type: 'rect',
                shape: { x: fullLeft, y: start[1] - barHeight / 2, width: progressWidth, height: barHeight, r: 3 },
                style: { fill: meta.hex },
              },
            ];
            // nhãn % nếu bar đủ rộng
            if (fullWidth > 46) {
              children.push({
                type: 'text',
                style: {
                  x: fullLeft + 6,
                  y: start[1],
                  text: `${progress}%`,
                  fill: progress >= 40 ? '#fff' : '#595959',
                  fontSize: 11,
                  verticalAlign: 'middle',
                },
              });
            }
            return { type: 'group', children } as never;
          },
          data: seriesData,
        },
        {
          // đường "Hôm nay"
          type: 'line',
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#ff4d4f', type: 'dashed', width: 1.5 },
            label: { formatter: 'Hôm nay', position: 'start', color: '#ff4d4f', fontSize: 11 },
            data: [{ xAxis: today }],
          },
          data: [],
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, rows, lookups]);

  if (isLoading || !data) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="eqms-page">
      <Typography.Title level={4} className="eqms-page-title">
        Gantt Chart – Tiến độ Master Plan (T10/2026 → T12/2027)
      </Typography.Title>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select
            allowClear
            placeholder="Master Plan"
            style={{ width: 280 }}
            value={planId === '' ? undefined : planId}
            onChange={(v) => setPlanId(v ?? '')}
            options={(data?.plans ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.cycleLabel})` }))}
            notFoundContent="Chưa có kế hoạch"
          />
          <Select
            allowClear
            placeholder="Giai đoạn"
            style={{ width: 320 }}
            value={phaseId === '' ? undefined : phaseId}
            onChange={(v) => setPhaseId(v ?? '')}
            options={data.phases.map((p) => ({ value: p.id, label: p.name }))}
          />
          <Select
            allowClear
            placeholder="Trạng thái"
            style={{ width: 175 }}
            value={status || undefined}
            onChange={(v) => setStatus((v as TaskStatus) ?? '')}
            options={STATUS_OPTIONS}
          />
          <Select
            allowClear
            placeholder="Ưu tiên"
            style={{ width: 135 }}
            value={priority || undefined}
            onChange={(v) => setPriority((v as Priority) ?? '')}
            options={Object.keys(PRIORITY).map((value) => ({ value, label: PRIORITY[value].label }))}
          />
          <Typography.Text type="secondary">
            {rows.length} / {planTasks.length} công việc
          </Typography.Text>
        </Space>
        <div style={{ marginTop: 8 }}>
          <StatusLegend />
        </div>
      </Card>

      <Card size="small">
        {rows.length === 0 || !option ? (
          <Empty description="Không có công việc phù hợp bộ lọc" />
        ) : (
          <EChart option={option} height={Math.max(rows.length * 40 + 80, 320)} />
        )}
      </Card>
    </div>
  );
}

