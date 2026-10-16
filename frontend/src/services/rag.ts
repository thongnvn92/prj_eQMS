// ============================================================
// RAG (Retrieval-Augmented Generation) cho AI Insight eQMS.
//
// Thay vì nhồi toàn bộ dữ liệu vào 1 prompt, ta:
//   1) INDEX  – chia dữ liệu eQMS (task/tài liệu/action/log) + phân tích
//               suy luận (KPI, rủi ro, nghẽn, khối lượng) + tri thức miền
//               (ISO 9001 / eQMS) thành các "chunk" có token + trọng số.
//   2) RETRIEVE – chấm điểm từng chunk theo độ khớp truy vấn (TF-IDF lexical)
//               + tăng trọng theo chuyên mành (mode) + mức độ rủi ro/gần đây.
//   3) AUGMENT – ghép các chunk liên quan nhất (top-K) vào prompt kèm mã nguồn
//               để AI trích dẫn, sinh phân tích chuyên sâu.
//
// Retriever thuần lexical + heuristic (deterministic, chạy offline, không cần
// embedding API) – phù hợp dữ liệu có cấu trúc và nhỏ/gỡn của eQMS.
// ============================================================
import type { DashboardStats, DocumentItem, Task, ActionItem, ActivityLog, Phase, Department, Person } from './ragTypes';

export type { DashboardStats, DocumentItem, Task, ActionItem, ActivityLog, Phase, Department, Person } from './ragTypes';

export interface RagChunk {
  id: string;
  /** Nhóm nguồn: task | document | action | log | kpi | risk | bottleneck | workload | domain. */
  kind: RagKind;
  /** Mã trích dẫn (VD: MP-012, QT-HCNS.01, KPI, RISK...). */
  code: string;
  title: string;
  /** Nội dung bằng chứng đưa vào prompt. */
  text: string;
  /** Token khoá (đã hạ chữ) dùng để chấm điểm. */
  tokens: string[];
  /** Trọng số nền (kpi/risk/bottleneck cao hơn entity thường). */
  weight: number;
  /** Nhãn chuyên môn để tăng trọng theo mode. */
  tags: string[];
}

export type RagKind =
  | 'task' | 'document' | 'action' | 'log'
  | 'kpi' | 'risk' | 'bottleneck' | 'workload' | 'domain';

export interface RagInput {
  stats: DashboardStats;
  tasks: Task[];
  documents: DocumentItem[];
  actions: ActionItem[];
  logs?: ActivityLog[];
  phases?: Phase[];
  departments?: Department[];
  people?: Person[];
  today?: string;
}

export interface AnalysisMode {
  key: string;
  label: string;
  /** Câu hỏi/nhiệm vụ phân tích cho mode này. */
  question: string;
  /** Tag ưu tiên khi retrieve. */
  focus: string[];
  /** Gợi ý chuyên môn bổ sung. */
  hint: string;
}

export interface RagContext {
  systemPrompt: string;
  userPrompt: string;
  sources: RagChunk[];
  mode: AnalysisMode;
}

/** Các chế độ phân tích chuyên sâu. */
export const ANALYSIS_MODES: AnalysisMode[] = [
  {
    key: 'executive',
    label: 'Tổng quan điều hành',
    question: 'Đánh giá sức khỏe tổng thể chương trình ISO và đề xuất 3 ưu tiên hành động cho Ban lãnh đạo.',
    focus: ['kpi', 'timeline', 'workload'],
    hint: 'Nhấn mạnh xu hướng, rủi ro chiến lược và quyết định cần BLĐ.',
  },
  {
    key: 'risk',
    label: 'Rủi ro & tồn đọng',
    question: 'Phân tích sâu rủi ro, công việc quá hạn/bị chặn và tồn đọng; đề xuất biện pháp khắc phục + phòng ngừa.',
    focus: ['risk', 'timeline'],
    hint: 'Ưu tiên mục có nguy cơ cao nhất; phân tích nguyên nhân gốc (5 Whys nếu phù hợp).',
  },
  {
    key: 'document',
    label: 'Kiểm soát tài liệu',
    question: 'Phân tích điểm nghẽn vòng đời tài liệu (soạn thảo→thẩm định→phê duyệt→ban hành) và đề xuất tăng tốc.',
    focus: ['document', 'bottleneck'],
    hint: 'Tập trung tài liệu tồn đọng lâu, nghẽn thẩm định/phê duyệt, tuân thủ ISO 9001 điều 7.5.',
  },
  {
    key: 'action',
    label: 'Action / CAPA',
    question: 'Đánh giá hiệu quả Action/CAPA: tiến độ, quá hạn, hiệu lực; đề xuất cải tiến quy trình xử lý.',
    focus: ['action', 'risk'],
    hint: 'Đánh giá tỷ lệ đóng đúng hạn, action quá hạn, action thiếu evidence/hiệu lực.',
  },
  {
    key: 'workload',
    label: 'Phân bổ nguồn lực',
    question: 'Phân tích khối lượng công việc/tài liệu theo phòng ban & người phụ trách; đề xuất cân bằng lại nguồn lực.',
    focus: ['workload'],
    hint: 'Chỉ ra quá tải cá nhân/phòng, đề xuất điều phối hợp lý.',
  },
];

export const DEFAULT_MODE = ANALYSIS_MODES[0].key;

// ============================================================
// Tri thức miền (domain knowledge) – ISO 9001 / eQMS.
// Các chunk tĩnh này được retrieve khi truy vấn/mode liên quan.
// ============================================================
const DOMAIN_KNOWLEDGE: Omit<RagChunk, 'id' | 'tokens'>[] = [
  {
    kind: 'domain',
    code: 'ISO-7.5',
    title: 'Kiểm soát thông tin dạng văn bản (ISO 9001:2015 §7.5)',
    text:
      'Tài liệu phải được phê duyệt trước khi phát hành; rà soát & cập nhật định kỳ; đảm bảo nhận diện phiên bản hiện hành; ' +
      'bản còn hiệu lực phải có ở nơi sử dụng. Điểm nghẽn thẩm định/phê duyệt làm tăng rủi ro không tuân thủ và chậm triển khai.',
    weight: 1.2,
    tags: ['document', 'bottleneck', 'risk'],
  },
  {
    kind: 'domain',
    code: 'ISO-6.1',
    title: 'Quản lý rủi ro & cơ hội (ISO 9001:2015 §6.1)',
    text:
      'Tổ chức phải xác định rủi ro/cơ hội, lập kế hoạch hành động tương ứng, đánh giá hiệu quả. Công việc quá hạn, bị chặn, ' +
      'tồn đọng kéo dài là tín hiệu rủi ro cần leo thang và có biện pháp khắc phục + phòng ngừa.',
    weight: 1.2,
    tags: ['risk'],
  },
  {
    kind: 'domain',
    code: 'ISO-10.2',
    title: 'Không phù hợp & hành động khắc phục (ISO 9001:2015 §10.2)',
    text:
      'Khi phát sinh không phù hợp: phản ứng, đánh giá cần hành động khắc phục, thực hiện hành động, đánh giá hiệu lực, ' +
      'cập nhật rủi ro/cơ hội nếu cần. Action/CAPA phải có owner, deadline rõ và đánh giá hiệu lực trước khi đóng.',
    weight: 1.2,
    tags: ['action', 'risk'],
  },
  {
    kind: 'domain',
    code: 'KPI-DEF',
    title: 'Định nghĩa KPI quản trị eQMS',
    text:
      'Completion Rate = task hoàn thành / tổng task. Avg Progress = tiến độ trung bình. Overdue = quá hạn chưa hoàn thành. ' +
      'Carry-over = tồn đọng chuyển sang tuần sau. Tỷ lệ tài liệu ban hành/phê duyệt phản ánh mức độ sẵn sàng kiểm soát.',
    weight: 1.1,
    tags: ['kpi', 'document'],
  },
  {
    kind: 'domain',
    code: 'GOV-REVIEW',
    title: 'Nguyên tắc báo cáo quản trị Ban ISO',
    text:
      'Báo cáo quản trị hiệu quả trả lời 4 câu: (1) tuần này đạt gì, (2) đang chậm/vướng gì, (3) tuần tới ưu tiên gì, ' +
      '(4) cần BLĐ quyết định/hỗ trợ gì. Phân tích cần chỉ rõ mức độ ưu tiên và hành động cụ thể, có chủ thể và thời hạn.',
    weight: 1.1,
    tags: ['kpi', 'workload'],
  },
];

/** Tách từ khoá: hạ chữ, bỏ dấu câu, giữ token ≥2 ký tự. */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu tiếng Việt
    .replace(/đ/g, 'd')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}


// ============================================================
// INDEX – dựng knowledge base từ dữ liệu eQMS.
// ============================================================
const TASK_STATUS_LABEL: Record<string, string> = {
  not_started: 'Chưa thực hiện', in_progress: 'Đang thực hiện', blocked: 'Bị chặn',
  delayed: 'Trễ hạn', completed: 'Hoàn thành', cancelled: 'Đã hủy',
};
const DOC_STATUS_LABEL: Record<string, string> = {
  draft: 'Bản nháp', reviewing: 'Đang thẩm định', approval_pending: 'Chờ phê duyệt',
  approved: 'Đã phê duyệt', published: 'Đã ban hành', obsolete: 'Lỗi thời',
};
const ACTION_STATUS_LABEL: Record<string, string> = {
  open: 'Mở', in_progress: 'Đang xử lý', blocked: 'Bị chặn', overdue: 'Quá hạn',
  pending_verification: 'Chờ xác minh', verified: 'Đã xác minh', closed: 'Đã đóng',
};
const lbl = (m: Record<string, string>, k: string) => m[k] ?? k;
const isPast = (date: string, today: string) => date < today;

function mkChunk(c: Omit<RagChunk, 'tokens'>): RagChunk {
  return { ...c, tokens: tokenize(`${c.code} ${c.title} ${c.text} ${c.tags.join(' ')}`) };
}

/** Dựng toàn bộ chunk (entity + analytics + domain) từ input. */
export function buildKnowledgeBase(input: RagInput): RagChunk[] {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const { stats, tasks, documents, actions, logs = [], people = [], departments = [] } = input;
  const nameOf = (id: number | null | undefined) => people.find((p) => p.id === id)?.fullName ?? '—';
  const deptOf = (id: number | null | undefined) => departments.find((d) => d.id === id)?.name ?? '—';
  const chunks: RagChunk[] = [];

  // ---------- Chunk TASK ----------
  tasks.forEach((t) => {
    const overdue = isPast(t.dueDate, today) && t.status !== 'completed' && t.status !== 'cancelled';
    const tags = ['timeline', 'task'];
    if (overdue) tags.push('risk');
    if (t.status === 'blocked' || t.status === 'delayed') tags.push('risk');
    if (t.status === 'completed') tags.push('done');
    chunks.push(mkChunk({
      id: `task:${t.id}`, kind: 'task', code: t.code, title: t.name,
      text: `Công việc ${t.code} "${t.name}" | trạng thái ${lbl(TASK_STATUS_LABEL, t.status)} | tiến độ ${t.progress}% | hạn ${t.dueDate} | phụ trách ${nameOf(t.ownerId)} | phòng ${deptOf(t.departmentId)}${overdue ? ' | QUÁ HẠN' : ''}`,
      weight: overdue ? 1.3 : t.status === 'completed' ? 0.9 : 1.0,
      tags,
    }));
  });

  // ---------- Chunk DOCUMENT ----------
  documents.forEach((d) => {
    const tags = ['document'];
    if (d.status === 'reviewing' || d.status === 'approval_pending') tags.push('bottleneck');
    if (d.status === 'published') tags.push('done');
    chunks.push(mkChunk({
      id: `doc:${d.id}`, kind: 'document', code: d.code, title: d.name,
      text: `Tài liệu ${d.code} "${d.name}" | trạng thái ${lbl(DOC_STATUS_LABEL, d.status)} | phiên bản ${d.currentVersion} | phòng ${deptOf(d.departmentId)} | chủ trì ${nameOf(d.ownerId)} | ${d.versions?.length ?? 0} phiên bản, ${d.approvals?.length ?? 0} lần phê duyệt`,
      weight: (d.status === 'reviewing' || d.status === 'approval_pending') ? 1.2 : 1.0,
      tags,
    }));
  });

  // ---------- Chunk ACTION / CAPA ----------
  actions.forEach((a) => {
    const overdue = (a.status === 'overdue') || (isPast(a.dueDate, today) && a.status !== 'closed' && a.status !== 'verified');
    const tags = ['action'];
    if (overdue) tags.push('risk');
    chunks.push(mkChunk({
      id: `action:${a.id}`, kind: 'action', code: a.code, title: a.title,
      text: `Action ${a.code} "${a.title}" | vấn đề: ${a.issue || '—'} | trạng thái ${lbl(ACTION_STATUS_LABEL, a.status)} | tiến độ ${a.progress}% | hạn ${a.dueDate} | phụ trách ${nameOf(a.ownerId)}${overdue ? ' | QUÁ HẠN' : ''}`,
      weight: overdue ? 1.3 : 1.0,
      tags,
    }));
  });
  return buildAnalytics(chunks, input);
}

/** Bổ sung chunk phân tích suy luận (KPI, rủi ro, nghẽn, khối lượng, log) + domain. */
function buildAnalytics(chunks: RagChunk[], input: RagInput): RagChunk[] {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const { stats, tasks, documents, actions, logs = [], people = [], departments = [] } = input;
  const nameOf = (id: number | null | undefined) => people.find((p) => p.id === id)?.fullName ?? '—';
  const deptOf = (id: number | null | undefined) => departments.find((d) => d.id === id)?.name ?? '—';

  // KPI tổng hợp.
  chunks.push(mkChunk({
    id: 'kpi:overview', kind: 'kpi', code: 'KPI', title: 'Chỉ số tổng hợp',
    text: `Tổng công việc ${stats.taskTotal}; hoàn thành ${stats.taskCompleted}; đang thực hiện ${stats.taskInProgress}; quá hạn ${stats.taskOverdue}; tỷ lệ hoàn thành ${stats.completionRate}%; tiến độ TB ${stats.avgProgress}%. Tài liệu chờ xử lý ${stats.docPending}; Action quá hạn ${stats.actionOverdue}.`,
    weight: 1.4, tags: ['kpi', 'timeline'],
  }));

  // Rủi ro & tồn đọng.
  const overdueTasks = tasks.filter((t) => isPast(t.dueDate, today) && t.status !== 'completed' && t.status !== 'cancelled');
  const blockedTasks = tasks.filter((t) => t.status === 'blocked' || t.status === 'delayed');
  const overdueActions = actions.filter((a) => a.status === 'overdue' || (isPast(a.dueDate, today) && a.status !== 'closed' && a.status !== 'verified'));
  const sig: string[] = [];
  if (overdueTasks.length) sig.push(`${overdueTasks.length} công việc quá hạn (VD: ${overdueTasks.slice(0, 5).map((t) => t.code).join(', ')})`);
  if (blockedTasks.length) sig.push(`${blockedTasks.length} công việc bị chặn/trễ (VD: ${blockedTasks.slice(0, 5).map((t) => `${t.code}:${lbl(TASK_STATUS_LABEL, t.status)}`).join(', ')})`);
  if (overdueActions.length) sig.push(`${overdueActions.length} action quá hạn (VD: ${overdueActions.slice(0, 5).map((a) => a.code).join(', ')})`);
  chunks.push(mkChunk({
    id: 'risk:overview', kind: 'risk', code: 'RISK', title: 'Rủi ro & tồn đọng',
    text: sig.length
      ? `Tín hiệu rủi ro: ${sig.join('; ')}. Cần leo thang và biện pháp khắc phục + phòng ngừa theo ISO 9001 §6.1/§10.2.`
      : 'Không có tín hiệu rủi ro nổi bật: không có công việc/action quá hạn hoặc bị chặn.',
    weight: 1.5, tags: ['risk', 'timeline', 'action'],
  }));

  // Điểm nghẽn tài liệu.
  const docBottleneck = documents.filter((d) => d.status === 'reviewing' || d.status === 'approval_pending');
  chunks.push(mkChunk({
    id: 'bottleneck:docs', kind: 'bottleneck', code: 'NECK', title: 'Điểm nghẽn tài liệu',
    text: docBottleneck.length
      ? `${docBottleneck.length} tài liệu tồn ở khâu thẩm định/chờ phê duyệt (VD: ${docBottleneck.slice(0, 6).map((d) => `${d.code}:${lbl(DOC_STATUS_LABEL, d.status)}`).join(', ')}). Rủi ro tuân thủ ISO 9001 §7.5.`
      : 'Không có tài liệu tồn đọng ở khâu thẩm định/phê duyệt.',
    weight: 1.4, tags: ['document', 'bottleneck', 'risk'],
  }));

  // Khối lượng theo phòng ban & người.
  const byOwner = new Map<string, number>();
  tasks.forEach((t) => byOwner.set(nameOf(t.ownerId), (byOwner.get(nameOf(t.ownerId)) ?? 0) + 1));
  const byDept = new Map<string, number>();
  tasks.forEach((t) => byDept.set(deptOf(t.departmentId), (byDept.get(deptOf(t.departmentId)) ?? 0) + 1));
  const topOwners = [...byOwner.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  chunks.push(mkChunk({
    id: 'workload:overview', kind: 'workload', code: 'LOAD', title: 'Phân bổ khối lượng',
    text: `Theo phòng ban: ${[...byDept.entries()].map(([k, v]) => `${k}:${v}`).join(', ') || '—'}. Người nhiều việc nhất: ${topOwners.map(([k, v]) => `${k}:${v}`).join(', ') || '—'}.`,
    weight: 1.2, tags: ['workload', 'timeline'],
  }));

  // Hoạt động gần đây.
  logs.slice(-12).forEach((l) =>
    chunks.push(mkChunk({
      id: `log:${l.id}`, kind: 'log', code: `LOG-${l.id}`, title: 'Hoạt động',
      text: `${l.at}: ${nameOf(l.userId)} "${l.action}" trên ${l.entity}#${l.entityId}${l.oldStatus ? ` (${l.oldStatus}→${l.newStatus})` : ''}`,
      weight: 0.8, tags: ['timeline', 'workload'],
    })),
  );

  // Tri thức miền.
  DOMAIN_KNOWLEDGE.forEach((d, i) => chunks.push(mkChunk({ ...d, id: `domain:${i}` })));

  return chunks;
}


// ============================================================
// RETRIEVE – chấm điểm chunk theo truy vấn (TF-IDF lexical) + boost chuyên môn.
// ============================================================
/** IDF của từng token trong toàn bộ corpus. */
function idf(chunks: RagChunk[]): Map<string, number> {
  const df = new Map<string, number>();
  chunks.forEach((c) => new Set(c.tokens).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
  const n = chunks.length || 1;
  const map = new Map<string, number>();
  df.forEach((count, t) => map.set(t, Math.log(1 + n / count)));
  return map;
}

/**
 * Lấy top-K chunk liên quan nhất tới truy vấn + mode.
 * score = Σ(TF·IDF của token khớp) · trọng số chunk · (1 + boost theo tag focus).
 */
export function retrieve(chunks: RagChunk[], query: string, mode: AnalysisMode, topK = 14): RagChunk[] {
  if (chunks.length === 0) return [];
  const qTokens = new Set(tokenize(`${query} ${mode.label} ${mode.focus.join(' ')} ${mode.hint}`));
  const idfMap = idf(chunks);
  const focusSet = new Set(mode.focus);

  const scored = chunks.map((c) => {
    const tf = new Map<string, number>();
    c.tokens.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
    let lexical = 0;
    qTokens.forEach((t) => {
      const f = tf.get(t);
      if (f) lexical += (1 + Math.log(f)) * (idfMap.get(t) ?? 1);
    });
    // Boost: chunk có tag trùng focus của mode; + chút nếu khớp trực tiếp code.
    const tagBoost = c.tags.reduce((acc, tg) => acc + (focusSet.has(tg) ? 0.35 : 0), 0);
    const codeHit = qTokens.has(c.code.toLowerCase()) ? 0.4 : 0;
    const score = (lexical + tagBoost + codeHit) * c.weight;
    return { c, score };
  });

  // Luôn giữ các chunk analytics/quan trọng (kpi/risk/bottleneck) d điểm lexical thấp.
  const mustKeep = new Set(['kpi:overview', 'risk:overview', 'bottleneck:docs', 'workload:overview']);
  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, topK).map((s) => s.c);
  const pickedIds = new Set(picked.map((c) => c.id));
  chunks.filter((c) => mustKeep.has(c.id) && !pickedIds.has(c.id)).forEach((c) => picked.push(c));
  return picked;
}

// ============================================================
// AUGMENT – ghép prompt hệ chuyên gia + bằng chứng truy xuất + câu hỏi.
// ============================================================
const EXPERT_SYSTEM_PROMPT =
  'Bạn là CHUYÊN GIA QUẢN TRỊ CHẤT LƯỢNG & ISO 9001 với 15 năm kinh nghiệm, đang tư vấn cho Ban ISO của một tập đoàn sản xuất. ' +
  'Bạn nhận được CÁC BẰ CHỨNG được truy xuất (retrieved evidence) từ hệ thống eQMS, mỗi bằng chứng có mã nguồn để trích dẫn. ' +
  '\n\nNhiệm vụ: đọc kỹ bằng chứng, SUY LUẬN chuyên sâu (không chỉ liệt kê), rồi trả lời bằng TIẾNG VIỆT theo cấu trúc:\n' +
  '1. **Chẩn đoán tổng quan** – đánh giá sức khỏe chương trình, điểm mạnh/yếu, xu hướng.\n' +
  '2. **Phân tích chuyên sâu** – phân tích nguyên nhân gốc rễ (dùng khung 5 Whys / Ishikawa khi phù hợp), mối liên hệ giữa các dữ liệu, rủi ro không tuân thủ tiêu chuẩn.\n' +
  '3. **Rủi ro & tồn đọng** – liệt kê theo mức ưu tiên (Cao/Trung bình/Thấp), trích dẫn mã (VD: [MP-012], [QT-HCNS.01]).\n' +
  '4. **Khuyến nghị hành động** – đề xuất CỤ THỂ, có chủ thể, thời hạn, cách đo lường hiệu quả; tham chiếu điều khoản ISO liên quan.\n' +
  '5. **Quyết định cần Ban lãnh đạo** (nếu có).\n\n' +
  'Quy tắc: CHỈ dùng số liệu có trong bằng chứng; khi cần ngầm định hãy ghi rõ "(giả định)"; trích dẫn mã nguồn trong ngoặc vuông; ' +
  'viết súc tích, chuyên nghiệp, ưu tiên giá trị hành động.';

/** Tạo prompt RAG hoàn chỉnh (system + user) cho 1 mode. */
export function composeRagContext(input: RagInput, modeKey = DEFAULT_MODE, topK = 14): RagContext {
  const mode = ANALYSIS_MODES.find((m) => m.key === modeKey) ?? ANALYSIS_MODES[0];
  const kb = buildKnowledgeBase(input);
  const sources = retrieve(kb, `${mode.question} ${mode.hint}`, mode, topK);

  const evidence = sources
    .map((s) => `- [${s.code}] ${s.title}: ${s.text}`)
    .join('\n');

  const userPrompt = [
    `BỐI CẢNH HỆ THỐNG eQMS – Ban ISO (dữ liệu được truy xuất tự động):`,
    ``,
    `=== BẰNG CHỨNG LIÊN QUAN (${sources.length} mục) ===`,
    evidence || '(không có dữ liệu)',
    ``,
    `=== YÊU CẦU PHÂN TÍCH ===`,
    `Chế độ: ${mode.label}.`,
    `Câu hỏi: ${mode.question}`,
    `Lưu ý chuyên môn: ${mode.hint}`,
  ].join('\n');

  return { systemPrompt: EXPERT_SYSTEM_PROMPT, userPrompt, sources, mode };
}


