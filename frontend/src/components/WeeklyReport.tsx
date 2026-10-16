// ============================================================
// Weekly ISO Management Report – Executive Summary + báo cáo tuần.
// Dựng mô hình báo cáo quản trị (KPI, điểm nổi bật, trọng tâm, vấn đề
// cần BLĐ, tình trạng tài liệu theo phòng) từ Dashboard/MasterPlan/
// Documents, rồi xuất PDF (in) / CSV — KHÔNG phụ thuộc thư viện ngoài.
// ============================================================
import type { DashboardStats, DocumentItem, Task } from '../mock/types';
import { DOC_STATUS, metaOf } from './widgets';

export interface WeeklyReportInput {
  stats: DashboardStats;
  tasks: Task[];
  documents: DocumentItem[];
  departments: { id: number; name: string }[];
  people: { id: number; fullName: string }[];
  author: string;
  today?: string; // YYYY-MM-DD
}

export interface AttentionItem {
  level: 'red' | 'yellow';
  title: string;
  detail: string;
  need: string;
  deadline: string;
  pic: string;
}

export interface PlanRow {
  group: string;
  unit: string;
  result: string;
  status: 'green' | 'yellow' | 'red' | 'gray';
  issue: string;
  plan: string;
  deadline: string;
  pic: string;
}

export interface DocStatusByDept {
  dept: string;
  published: number;
  approved: number;
  approvalPending: number;
  reviewing: number;
  draft: number;
  total: number;
  status: 'green' | 'yellow' | 'red' | 'gray';
}

export interface WeeklyReportModel {
  weekLabel: string;
  reportDate: string;
  author: string;
  kpis: { completed: number; onTrack: number; overdue: number; needSupport: number };
  docProgressPct: number;
  completionRate: number;
  carryOver: number;
  highlights: string[];
  focusNext: string[];
  attention: AttentionItem[];
  planRows: PlanRow[];
  docStatusByDept: DocStatusByDept[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (v?: string | null) => (v && v.length >= 10 ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '—');
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Tuần ISO (bắt đầu Thứ 2) chứa ngày `iso`. */
function isoWeek(iso: string): { week: number; monday: string; sunday: string } {
  const d = new Date(`${iso}T00:00:00`);
  const day = (d.getDay() + 6) % 7; // Mon=0
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const thu = new Date(monday);
  thu.setDate(monday.getDate() + 3);
  const yearStart = new Date(thu.getFullYear(), 0, 4);
  const week = 1 + Math.round(((thu.getTime() - yearStart.getTime()) / 86400000 - 3 + ((yearStart.getDay() + 6) % 7)) / 7);
  const f = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  return { week, monday: f(monday), sunday: f(sunday) };
}

const STATUS_OF_PROGRESS = (avg: number, overdue: number): PlanRow['status'] =>
  overdue > 0 ? 'red' : avg >= 80 ? 'green' : avg >= 40 ? 'yellow' : 'gray';

export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReportModel {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const { stats, tasks, documents, departments, people } = input;
  const nameOf = (id: number | null) => people.find((p) => p.id === id)?.fullName ?? '—';
  const deptName = (id: number | null) => departments.find((d) => d.id === id)?.name ?? 'Khác';

  const wk = isoWeek(today);
  const weekLabel = `Tuần ${wk.week} | ${fmtDate(wk.monday)} – ${fmtDate(wk.sunday)}`;
  const nextWeekEnd = addDays(wk.sunday, 7);
  const notDone = (t: Task) => t.status !== 'completed' && t.status !== 'cancelled';

  // KPI Executive Summary.
  const completed = stats.taskCompleted;
  const onTrack = stats.taskInProgress + stats.taskNotStarted;
  const overdue = stats.taskOverdue;
  const needSupport = stats.docPending + stats.actionOverdue;

  // Điểm nổi bật tuần này (task đã hoàn thành).
  const highlights = tasks
    .filter((t) => t.status === 'completed')
    .slice(0, 6)
    .map((t) => `${t.code} – ${t.name} (${deptName(t.departmentId)})`);

  // Trọng tâm tuần tới (đến hạn trong 7 ngày tới).
  const focusNext = tasks
    .filter((t) => notDone(t) && t.dueDate >= wk.sunday && t.dueDate <= nextWeekEnd)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 6)
    .map((t) => `${t.code} – ${t.name} (hạn ${fmtDate(t.dueDate)})`);

  // Management Attention (task quá hạn + tài liệu chờ).
  const attention: AttentionItem[] = [];
  tasks
    .filter((t) => notDone(t) && t.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5)
    .forEach((t) =>
      attention.push({
        level: 'red',
        title: `Công việc quá hạn: ${t.code} – ${t.name}`,
        detail: `Phụ trách ${nameOf(t.ownerId)} · tiến độ ${t.progress}%`,
        need: 'Bổ sung nguồn lực / điều phối lại tiến độ',
        deadline: fmtDate(t.dueDate),
        pic: nameOf(t.ownerId),
      }),
    );
  stats.pendingDocs.slice(0, 4).forEach((d) =>
    attention.push({
      level: 'yellow',
      title: `Tài liệu chờ xử lý: ${d.code} – ${d.name}`,
      detail: `Trạng thái ${metaOf(DOC_STATUS, d.status).label}`,
      need: 'Phê duyệt / thẩm định để ban hành đúng hạn',
      deadline: fmtDate(d.statusUpdatedAt),
      pic: nameOf(d.ownerId),
    }),
  );

  // Bảng kết quả & kế hoạch theo giai đoạn (phase).
  const byPhase = new Map<number, Task[]>();
  tasks.forEach((t) => {
    const arr = byPhase.get(t.phaseId) ?? [];
    arr.push(t);
    byPhase.set(t.phaseId, arr);
  });
  const planRows: PlanRow[] = stats.tasksByPhase.map((p) => {
    const phaseTasks = byPhase.get(p.phaseId) ?? [];
    const phaseOverdue = phaseTasks.filter((t) => notDone(t) && t.dueDate < today).length;
    const upcoming = phaseTasks.filter((t) => notDone(t) && t.dueDate >= today && t.dueDate <= nextWeekEnd).length;
    const picSet = [...new Set(phaseTasks.map((t) => nameOf(t.ownerId)).filter((n) => n !== '—'))];
    return {
      group: p.name.replace(/ \(.*\)$/, ''),
      unit: 'Ban ISO',
      result: `${p.completed}/${p.total} hoàn thành`,
      status: STATUS_OF_PROGRESS(p.avgProgress, phaseOverdue),
      issue: phaseOverdue > 0 ? `${phaseOverdue} công việc quá hạn` : '—',
      plan: upcoming > 0 ? `${upcoming} đầu việc đến hạn tuần tới` : 'Duy trì tiến độ',
      deadline: fmtDate(phaseTasks.map((t) => t.dueDate).sort().slice(-1)[0]),
      pic: picSet.length ? picSet.slice(0, 2).join(', ') : '—',
    };
  });

  // Tình trạng tài liệu ISO theo đơn vị.
  const docsByDept = new Map<number, DocumentItem[]>();
  documents.forEach((d) => {
    const arr = docsByDept.get(d.departmentId) ?? [];
    arr.push(d);
    docsByDept.set(d.departmentId, arr);
  });
  const docStatusByDept: DocStatusByDept[] = departments
    .map((dept) => {
      const docs = docsByDept.get(dept.id) ?? [];
      const count = (s: DocumentItem['status']) => docs.filter((d) => d.status === s).length;
      const published = count('published');
      const approved = count('approved');
      const approvalPending = count('approval_pending');
      const reviewing = count('reviewing');
      const draft = count('draft') + count('obsolete');
      const total = docs.length;
      const done = published + approved;
      const status: DocStatusByDept['status'] =
        total === 0 ? 'gray' : published > 0 && done / total >= 0.3 ? 'green' : reviewing + approvalPending > 0 ? 'yellow' : 'red';
      return { dept: dept.name, published, approved, approvalPending, reviewing, draft, total, status };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  const docTotal = documents.length || 1;
  const docDone = documents.filter((d) => d.status === 'published' || d.status === 'approved').length;
  const docProgressPct = Math.round((docDone / docTotal) * 100);

  return {
    weekLabel,
    reportDate: fmtDate(today),
    author: input.author,
    kpis: { completed, onTrack, overdue, needSupport },
    docProgressPct,
    completionRate: stats.completionRate,
    carryOver: overdue,
    highlights: highlights.length ? highlights : ['Chưa có công việc hoàn thành trong tuần.'],
    focusNext: focusNext.length ? focusNext : ['Chưa có đầu việc đến hạn tuần tới.'],
    attention,
    planRows,
    docStatusByDept,
  };
}


export const STATUS_EMOJI: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴', gray: '⚪' };
export const STATUS_TEXT: Record<string, string> = {
  green: 'Hoàn thành / Đúng tiến độ',
  yellow: 'Cần theo dõi',
  red: 'Chậm / Vướng mắc',
  gray: 'Chưa bắt đầu',
};
const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `*{box-sizing:border-box}body{font-family:Segoe UI,Arial,sans-serif;color:#1f2937;margin:24px;font-size:12px}
.hdr{background:#0b2545;color:#fff;padding:16px 20px;border-radius:6px}
.hdr h1{margin:0;font-size:20px} .hdr .meta{margin-top:6px;font-size:12px;opacity:.9}
.kpis{display:flex;gap:12px;margin:16px 0}
.kpi{flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:12px;text-align:center;background:#f9fafb}
.kpi-num{font-size:30px;font-weight:700;line-height:1} .kpi-label{font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase}
.bar{height:16px;background:#e5e7eb;border-radius:8px;overflow:hidden} .bar>i{display:block;height:100%;background:#1677ff}
h2{font-size:14px;margin:18px 0 8px;border-left:4px solid #1677ff;padding-left:8px}
.cols{display:flex;gap:16px} .cols>div{flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:10px 14px}
ul{margin:6px 0;padding-left:18px} li{margin:3px 0}
table{width:100%;border-collapse:collapse;margin-top:6px} th,td{border:1px solid #e5e7eb;padding:6px 8px;vertical-align:top;text-align:left}
th{background:#0b2545;color:#fff;font-size:11px} .ctr{text-align:center}
.att{border-radius:6px;padding:8px 12px;margin:6px 0;border:1px solid}
.att.red{border-color:#ffccc7;background:#fff1f0} .att.yellow{border-color:#ffe58f;background:#fffbe6} .att.gray{border-color:#e5e7eb;background:#f9fafb}
.foot{margin-top:18px;color:#9ca3af;font-size:10px;border-top:1px solid #e5e7eb;padding-top:8px}
@media print{body{margin:0}}`;

/** HTML tự chứa để mở cửa sổ in → Save as PDF (corporate tối giản, navy header). */
export function weeklyReportHtml(m: WeeklyReportModel): string {
  const kpi = (n: number, label: string, color: string) =>
    `<div class="kpi"><div class="kpi-num" style="color:${color}">${n}</div><div class="kpi-label">${label}</div></div>`;
  const planTr = m.planRows
    .map(
      (r) =>
        `<tr><td>${esc(r.group)}</td><td>${esc(r.unit)}</td><td>${esc(r.result)}</td>` +
        `<td class="ctr">${STATUS_EMOJI[r.status]} ${STATUS_TEXT[r.status]}</td><td>${esc(r.issue)}</td>` +
        `<td>${esc(r.plan)}</td><td class="ctr">${esc(r.deadline)}</td><td>${esc(r.pic)}</td></tr>`,
    )
    .join('');
  const docTr = m.docStatusByDept
    .map(
      (r) =>
        `<tr><td>${esc(r.dept)}</td><td class="ctr">${r.published}</td><td class="ctr">${r.approved}</td>` +
        `<td class="ctr">${r.approvalPending}</td><td class="ctr">${r.reviewing}</td><td class="ctr">${r.draft}</td>` +
        `<td class="ctr"><b>${r.total}</b></td><td class="ctr">${STATUS_EMOJI[r.status]}</td></tr>`,
    )
    .join('');
  const attHtml = m.attention.length
    ? m.attention
        .map(
          (a) =>
            `<div class="att ${a.level}"><b>${STATUS_EMOJI[a.level]} ${esc(a.title)}</b><br/>` +
            `<span>${esc(a.detail)}</span><br/><i>Cần: ${esc(a.need)} · Deadline: ${esc(a.deadline)}</i></div>`,
        )
        .join('')
    : '<div class="att gray">Không có vấn đề cần BLĐ hỗ trợ trong tuần.</div>';

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Weekly ISO Report</title><style>${CSS}</style></head><body>
    <div class="hdr"><h1>BÁO CÁO TUẦN BAN ISO</h1>
      <div class="meta">${esc(m.weekLabel)} &nbsp;·&nbsp; Người lập: ${esc(m.author)} &nbsp;·&nbsp; Ngày báo cáo: ${esc(m.reportDate)}</div></div>
    <div class="kpis">
      ${kpi(m.kpis.completed, 'Hoàn thành', '#52c41a')}
      ${kpi(m.kpis.onTrack, 'Đúng tiến độ', '#1677ff')}
      ${kpi(m.kpis.overdue, 'Tồn đọng', '#ff4d4f')}
      ${kpi(m.kpis.needSupport, 'Cần hỗ trợ', '#fa8c16')}
    </div>
    <h2>Tiến độ tài liệu ISO</h2>
    <div style="display:flex;align-items:center;gap:12px"><div class="bar" style="flex:1"><i style="width:${m.docProgressPct}%"></i></div><b>${m.docProgressPct}%</b></div>
    <div style="margin-top:4px;color:#6b7280">Tỷ lệ hoàn thành kế hoạch: <b>${m.completionRate}%</b> · Carry-over sang tuần sau: <b>${m.carryOver}</b></div>
    <div class="cols" style="margin-top:14px">
      <div><h2 style="margin-top:0">Điểm nổi bật tuần này</h2><ul>${m.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>
      <div><h2 style="margin-top:0">Trọng tâm tuần tới</h2><ul>${m.focusNext.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>
    </div>
    <h2>Vấn đề / Quyết định cần BLĐ hỗ trợ</h2>${attHtml}
    <h2>Kết quả &amp; Kế hoạch công việc theo giai đoạn</h2>
    <table><thead><tr><th>Nhóm công việc</th><th>Đơn vị</th><th>Kết quả tuần này</th><th>Status</th><th>Vấn đề/Tồn đọng</th><th>Kế hoạch tuần tới</th><th>Deadline</th><th>PIC</th></tr></thead><tbody>${planTr || '<tr><td colspan="8">—</td></tr>'}</tbody></table>
    <h2>Tình trạng tài liệu ISO theo đơn vị</h2>
    <table><thead><tr><th>Đơn vị</th><th>Đã ban hành</th><th>Đã phê duyệt</th><th>Chờ phê duyệt</th><th>Đang thẩm định</th><th>Nháp/Lỗi thời</th><th>Tổng</th><th>TT</th></tr></thead><tbody>${docTr || '<tr><td colspan="8">—</td></tr>'}</tbody></table>
    <div class="foot">Sinh tự động từ hệ thống eQMS · ${esc(m.reportDate)}</div>
  </body></html>`;
}

/** Mở cửa sổ in để lưu PDF. */
export function printWeeklyReport(m: WeeklyReportModel): void {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(weeklyReportHtml(m));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}


const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** Xuất CSV (UTF-8 BOM để Excel đọc tiếng Việt). */
export function exportWeeklyCsv(m: WeeklyReportModel): void {
  const lines: string[] = [];
  lines.push(`BAO CAO TUAN BAN ISO,${csvCell(m.weekLabel)}`);
  lines.push(`Nguoi lap,${csvCell(m.author)},Ngay bao cao,${csvCell(m.reportDate)}`);
  lines.push('');
  lines.push('KPI,Hoan thanh,Dung tien do,Ton dong,Can ho tro,Tien do TL ISO,Completion rate,Carry-over');
  lines.push(
    `,,${m.kpis.completed},${m.kpis.onTrack},${m.kpis.overdue},${m.kpis.needSupport},${m.docProgressPct}%,${m.completionRate}%,${m.carryOver}`,
  );
  lines.push('');
  lines.push('Diem noi bat tuan nay');
  m.highlights.forEach((h) => lines.push(csvCell(h)));
  lines.push('');
  lines.push('Trong tam tuan toi');
  m.focusNext.forEach((h) => lines.push(csvCell(h)));
  lines.push('');
  lines.push('Van de can BLD ho tro');
  if (m.attention.length === 0) lines.push('Khong co van de can ho tro');
  m.attention.forEach((a) => lines.push(`${csvCell(STATUS_TEXT[a.level])},${csvCell(a.title)},${csvCell(a.need)},${csvCell(a.deadline)}`));
  lines.push('');
  lines.push('Nhom cong viec,Don vi,Ket qua tuan nay,Status,Van de,Ke hoach tuan toi,Deadline,PIC');
  m.planRows.forEach((r) =>
    lines.push([r.group, r.unit, r.result, STATUS_TEXT[r.status], r.issue, r.plan, r.deadline, r.pic].map(csvCell).join(',')),
  );
  lines.push('');
  lines.push('Tinh trang tai lieu theo don vi,Da ban hanh,Da phe duyet,Cho phe duyet,Dang tham dinh,Nhap/Loi thoi,Tong,TT');
  m.docStatusByDept.forEach((r) =>
    lines.push([r.dept, r.published, r.approved, r.approvalPending, r.reviewing, r.draft, r.total, STATUS_TEXT[r.status]].map(csvCell).join(',')),
  );

  const blob = new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `weekly-iso-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

