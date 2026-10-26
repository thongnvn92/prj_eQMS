// Seed data demo – DMC eQMS (chu kỳ Master Plan T10/2026 → T12/2027)
import { ROLE_CODES, ROLE_NAMES, ROLE_PERMISSIONS } from '../auth/permissions';
import type { ActionItem, Department, DocumentItem, MockDb, OpportunityItem, Phase, RiskAssessmentItem, RiskItem, RoleItem, Task, User } from './types';

export const DEMO_ACCOUNTS = [
  { label: 'System Admin', username: 'admin', password: 'Admin123!' },
  { label: 'ISO Leader', username: 'leader', password: 'Leader123!' },
  { label: 'ISO Deputy', username: 'deputy', password: 'Deputy123!' },
  { label: 'ISO Coordinator', username: 'coordinator', password: 'Coord123!' },
  { label: 'ISO Member', username: 'member', password: 'Member123!' },
  { label: 'Document Owner', username: 'owner', password: 'Owner123!' },
  { label: 'Department Manager', username: 'manager', password: 'Manager123!' },
  { label: 'Auditor', username: 'auditor', password: 'Audit123!' },
  { label: 'Normal User', username: 'user', password: 'User123!' },
];

const departments: Department[] = [
  { id: 1, code: 'BM01', name: 'Ban Giám đốc', description: 'Ban lãnh đạo tổng ca, có thẩm quyền cao nhất.' },
  { id: 2, code: 'BM02', name: 'Ban ISO', description: 'Ban Tiêu chuẩn ISO 9001:2015 quản lý hệ thống chất lượng.' },
  { id: 3, code: 'BM03', name: 'Phòng Hành chính – Nhân sự', description: 'Hoàn thành hành chính nội bộ và công tác nhân sự.' },
  { id: 4, code: 'BM04', name: 'Phòng Kinh doanh', description: 'Quản lý sales, chăm sóc khách hàng và thu nhập.' },
  { id: 5, code: 'BM05', name: 'Phòng Kỹ thuật – Đảm bảo chất lượng', description: 'Chủ trì xây dựng, rà soát và cải tiến hệ thống ISO.' },
  { id: 6, code: 'BM06', name: 'Phòng Sản xuất', description: 'Thực hiện sản xuất và áp dụng các quy trình công đoạn.' },
];

const users: User[] = [
  { id: 1, username: 'admin', password: 'Admin123!', fullName: 'Nguyễn Minh Admin', email: 'admin@dmc.vn', departmentId: 1, roleCodes: ['super_admin'], active: true },
  { id: 2, username: 'leader', password: 'Leader123!', fullName: 'Trần Văn Long', email: 'long.tv@dmc.vn', departmentId: 2, roleCodes: ['iso_leader'], active: true },
  { id: 3, username: 'deputy', password: 'Deputy123!', fullName: 'Lê Thị Hoa', email: 'hoa.lt@dmc.vn', departmentId: 2, roleCodes: ['iso_deputy'], active: true },
  { id: 4, username: 'coordinator', password: 'Coord123!', fullName: 'Phạm Văn Nam', email: 'nam.pv@dmc.vn', departmentId: 2, roleCodes: ['iso_coordinator'], active: true },
  { id: 9, username: 'member', password: 'Member123!', fullName: 'Đỗ Thị Lan', email: 'lan.dt@dmc.vn', departmentId: 2, roleCodes: ['iso_member'], active: true },
  { id: 5, username: 'owner', password: 'Owner123!', fullName: 'Hoàng Thị Mai', email: 'mai.ht@dmc.vn', departmentId: 3, roleCodes: ['document_owner'], active: true },
  { id: 6, username: 'manager', password: 'Manager123!', fullName: 'Vũ Văn Trung', email: 'trung.vv@dmc.vn', departmentId: 5, roleCodes: ['dept_manager'], active: true },
  { id: 7, username: 'auditor', password: 'Audit123!', fullName: 'Đặng Văn Phúc', email: 'phuc.dv@dmc.vn', departmentId: 2, roleCodes: ['auditor'], active: true },
  { id: 8, username: 'user', password: 'User123!', fullName: 'Nguyễn Văn Hùng', email: 'hung.nv@dmc.vn', departmentId: 4, roleCodes: ['normal_user'], active: true },
];

const phases: Phase[] = [
  { id: 1, code: 'P1', name: 'Giai đoạn 1 – Chuẩn bị & Rà soát (T10–T11/2026)', startDate: '2026-10-01', endDate: '2026-11-30' },
  { id: 2, code: 'P2', name: 'Giai đoạn 2 – Biên soạn & Phê duyệt (T12/2026 – T04/2027)', startDate: '2026-12-01', endDate: '2027-04-30' },
  { id: 3, code: 'P3', name: 'Giai đoạn 3 – Ban hành & Đào tạo (T05 – T08/2027)', startDate: '2027-05-01', endDate: '2027-08-31' },
  { id: 4, code: 'P4', name: 'Giai đoạn 4 – Đánh giá & Báo cáo (T09 – T12/2027)', startDate: '2027-09-01', endDate: '2027-12-31' },
];

const tasks: Task[] = [
  { id: 1, code: 'MP-001', name: 'Xây dựng Kế hoạch ISO năm 2027', phaseId: 1, ownerId: 3, departmentId: 2, priority: 'high', status: 'completed', progress: 100, startDate: '2026-10-01', dueDate: '2026-10-15', result: 'Kế hoạch được Ban Giám đốc phê duyệt 12/10/2026' },
  { id: 2, code: 'MP-002', name: 'Rà soát mục tiêu và phạm vi ISO', phaseId: 1, ownerId: 2, departmentId: 2, priority: 'high', status: 'in_progress', progress: 60, startDate: '2026-10-05', dueDate: '2026-10-20' },
  { id: 3, code: 'MP-003', name: 'Rà soát danh mục tài liệu hiện hành', phaseId: 1, ownerId: 5, departmentId: 3, priority: 'medium', status: 'in_progress', progress: 40, startDate: '2026-10-05', dueDate: '2026-10-31' },
  { id: 4, code: 'MP-004', name: 'Phân công đầu mối ISO tại các Phòng', phaseId: 1, ownerId: 3, departmentId: 2, priority: 'medium', status: 'completed', progress: 100, startDate: '2026-10-01', dueDate: '2026-10-05', result: 'Đã ban hành quyết định phân công đầu mối' },
  { id: 5, code: 'MP-005', name: 'Xác định nhu cầu đào tạo ISO', phaseId: 1, ownerId: 4, departmentId: 2, priority: 'low', status: 'not_started', progress: 0, startDate: '2026-10-01', dueDate: '2026-09-28' },
  { id: 6, code: 'MP-006', name: 'Biên soạn QT-KD.01 Quy trình bán hàng', phaseId: 2, ownerId: 5, departmentId: 4, priority: 'high', status: 'delayed', progress: 30, startDate: '2026-10-01', dueDate: '2026-09-30', note: 'Chờ góp ý Phòng Kinh doanh' },
  { id: 7, code: 'MP-007', name: 'Cập nhật Sổ tay chất lượng (QMS Manual)', phaseId: 2, ownerId: 3, departmentId: 2, priority: 'critical', status: 'in_progress', progress: 55, startDate: '2026-10-08', dueDate: '2026-10-25' },
  { id: 8, code: 'MP-008', name: 'Thẩm định và lấy ý kiến các Phòng', phaseId: 2, ownerId: 2, departmentId: 2, priority: 'medium', status: 'not_started', progress: 0, startDate: '2026-11-01', dueDate: '2026-11-15' },
  { id: 9, code: 'MP-009', name: 'Trình phê duyệt và ban hành tài liệu', phaseId: 2, ownerId: 2, departmentId: 2, priority: 'high', status: 'not_started', progress: 0, startDate: '2026-11-16', dueDate: '2026-12-01' },
  { id: 10, code: 'MP-010', name: 'Tổ chức đào tạo/chia sẻ ISO toàn công ty', phaseId: 3, ownerId: 4, departmentId: 2, priority: 'medium', status: 'not_started', progress: 0, startDate: '2027-05-05', dueDate: '2027-05-20' },
  { id: 11, code: 'MP-011', name: 'Triển khai áp dụng tại các Phòng', phaseId: 3, ownerId: 3, departmentId: 2, priority: 'medium', status: 'not_started', progress: 0, startDate: '2027-05-21', dueDate: '2027-06-30' },
  { id: 12, code: 'MP-012', name: 'Kiểm tra tuân thủ nội bộ', phaseId: 4, ownerId: 7, departmentId: 2, priority: 'high', status: 'not_started', progress: 0, startDate: '2027-09-01', dueDate: '2027-09-15' },
  { id: 13, code: 'MP-013', name: 'Đánh giá nội bộ (Internal Audit)', phaseId: 4, ownerId: 7, departmentId: 2, priority: 'critical', status: 'not_started', progress: 0, startDate: '2027-09-16', dueDate: '2027-10-15' },
  { id: 14, code: 'MP-014', name: 'Lập Action List khắc phục từ kết quả audit', phaseId: 4, ownerId: 7, departmentId: 2, priority: 'high', status: 'not_started', progress: 0, startDate: '2027-10-16', dueDate: '2027-11-01' },
  { id: 15, code: 'MP-015', name: 'Đánh giá KPI hệ thống & báo cáo Ban Lãnh đạo', phaseId: 4, ownerId: 2, departmentId: 2, priority: 'high', status: 'not_started', progress: 0, startDate: '2027-11-02', dueDate: '2027-12-10' },
  { id: 16, code: 'MP-016', name: 'Tổ chức buổi chia sẻ ISO với nhân viên mới', phaseId: 1, ownerId: 4, departmentId: 2, priority: 'low', status: 'blocked', progress: 10, startDate: '2026-10-06', dueDate: '2026-11-10', note: 'Chờ Phòng HC-NS xác nhận danh sách' },
];

const documents: DocumentItem[] = [
  {
    id: 1, code: 'QT-HCNS.01', name: 'Quy trình quản lý nhân sự', docType: 'procedure',
    departmentId: 3, ownerId: 5, currentVersion: 'V1.2', status: 'published', workflowStep: 5,
    relatedTaskId: 3, description: 'Quy trình từ tuyển dụng, hợp đồng đến đánh giá.', effectiveDate: '2026-06-01',
    versions: [
      { id: 1, version: 'V1.0', changeSummary: 'Ban hành lần đầu', createdBy: 5, createdAt: '2025-03-01', approvedBy: 2, approvedAt: '2025-03-15', isCurrent: false },
      { id: 2, version: 'V1.1', changeSummary: 'Bổ sung quy trình thử việc', createdBy: 5, createdAt: '2025-11-02', approvedBy: 2, approvedAt: '2025-11-20', isCurrent: false },
      { id: 3, version: 'V1.2', changeSummary: 'Cập nhật theo luật lao động 2026', createdBy: 5, createdAt: '2026-05-02', approvedBy: 2, approvedAt: '2026-05-25', isCurrent: true },
    ],
    approvals: [
      { id: 1, version: 'V1.2', step: 'reviewing', approverId: 3, action: 'review', comment: 'Hợp lý', decidedAt: '2026-05-10' },
      { id: 2, version: 'V1.2', step: 'approval_pending', approverId: 2, action: 'approve', comment: 'Đồng ý ban hành', decidedAt: '2026-05-20' },
      { id: 3, version: 'V1.2', step: 'published', approverId: 2, action: 'publish', decidedAt: '2026-06-01' },
    ],
  },
  {
    id: 2, code: 'QT-HCNS.02', name: 'Quy trình đào tạo và phát triển', docType: 'procedure',
    departmentId: 3, ownerId: 5, currentVersion: 'V0.1', status: 'draft', workflowStep: 1,
    relatedTaskId: 5, description: 'Đang soạn thảo theo nhu cầu đào tạo ISO.',
    versions: [{ id: 4, version: 'V0.1', changeSummary: 'Dự thảo đầu tiên', createdBy: 5, createdAt: '2026-10-06', isCurrent: true }],
    approvals: [],
  },
  {
    id: 3, code: 'QT-KD.01', name: 'Quy trình bán hàng và ký hợp đồng', docType: 'procedure',
    departmentId: 4, ownerId: 5, currentVersion: 'V1.0', status: 'reviewing', workflowStep: 3,
    relatedTaskId: 6,
    versions: [{ id: 5, version: 'V1.0', changeSummary: 'Soạn thảo theo kế hoạch 2027', createdBy: 5, createdAt: '2026-10-07', isCurrent: true }],
    approvals: [{ id: 4, version: 'V1.0', step: 'draft', approverId: 5, action: 'submit', comment: 'Trình thẩm định', decidedAt: '2026-10-07' }],
  },
  {
    id: 4, code: 'QT-KD.02', name: 'Quy trình xử lý khiếu nại khách hàng', docType: 'procedure',
    departmentId: 4, ownerId: 5, currentVersion: 'V0.2', status: 'approval_pending', workflowStep: 4,
    relatedTaskId: 6,
    versions: [{ id: 6, version: 'V0.2', changeSummary: 'Cập nhật theo góp ý KD', createdBy: 5, createdAt: '2026-10-02', isCurrent: true }],
    approvals: [
      { id: 5, version: 'V0.2', step: 'reviewing', approverId: 3, action: 'review', comment: 'Đã thẩm định', decidedAt: '2026-10-05' },
      { id: 6, version: 'V0.2', step: 'approval_pending', approverId: 5, action: 'submit', comment: 'Trình phê duyệt', decidedAt: '2026-10-06' },
    ],
  },
  {
    id: 5, code: 'QT-BCN.01', name: 'Sổ tay chất lượng (QMS Manual)', docType: 'manual',
    departmentId: 2, ownerId: 3, currentVersion: 'V2.0', status: 'draft', workflowStep: 1,
    relatedTaskId: 7, description: 'Đang cập nhật cho chu kỳ 2026–2027.',
    versions: [
      { id: 7, version: 'V1.0', changeSummary: 'Phiên bản cũ', createdBy: 3, createdAt: '2024-08-01', approvedBy: 2, approvedAt: '2024-08-20', isCurrent: false },
      { id: 8, version: 'V2.0', changeSummary: 'Dự thảo chu kỳ 2026–2027', createdBy: 3, createdAt: '2026-10-08', isCurrent: true },
    ],
    approvals: [],
  },
  {
    id: 6, code: 'CQT-KD.01', name: 'Biểu mẫu: Phiếu báo giá', docType: 'form',
    departmentId: 4, ownerId: 5, currentVersion: 'V1.0', status: 'published', workflowStep: 5,
    effectiveDate: '2026-01-01',
    versions: [{ id: 9, version: 'V1.0', changeSummary: 'Ban hành', createdBy: 5, createdAt: '2025-12-10', approvedBy: 2, approvedAt: '2025-12-25', isCurrent: true }],
    approvals: [{ id: 7, version: 'V1.0', step: 'approval_pending', approverId: 2, action: 'approve', decidedAt: '2025-12-25' }],
  },
  {
    id: 7, code: 'QT-KT.01', name: 'Quy trình kiểm tra sản phẩm', docType: 'procedure',
    departmentId: 5, ownerId: 5, currentVersion: 'V0.3', status: 'approval_pending', workflowStep: 4,
    relatedTaskId: 8,
    versions: [{ id: 10, version: 'V0.3', changeSummary: 'Bổ sung AQL', createdBy: 5, createdAt: '2026-10-04', isCurrent: true }],
    approvals: [{ id: 8, version: 'V0.3', step: 'reviewing', approverId: 6, action: 'review', comment: 'Đã kiểm tra', decidedAt: '2026-10-06' }],
  },
  {
    id: 8, code: 'QTCB.01', name: 'Chính sách chất lượng', docType: 'policy',
    departmentId: 2, ownerId: 3, currentVersion: 'V1.0', status: 'published', workflowStep: 5,
    effectiveDate: '2026-01-01',
    versions: [{ id: 11, version: 'V1.0', changeSummary: 'Ban hành đầu tiên', createdBy: 3, createdAt: '2025-12-01', approvedBy: 2, approvedAt: '2025-12-20', isCurrent: true }],
    approvals: [{ id: 9, version: 'V1.0', step: 'approval_pending', approverId: 2, action: 'approve', decidedAt: '2025-12-20' }],
  },
];

const actions: ActionItem[] = [
  {
    id: 1, code: 'ACT-001', title: 'Cập nhật Quy trình xử lý khiếu nại theo kết quả audit 2025',
    description: 'Bổ sung bước thời hạn phản hồi khách hàng 24h.',
    source: 'audit_finding', departmentId: 4, ownerId: 8, issue: 'Quy trình chưa quy định thời hạn xử lý khiếu nại',
    relatedDocumentId: 4, dueDate: '2026-10-15', status: 'in_progress', progress: 50,
  },
  {
    id: 2, code: 'ACT-002', title: 'Hoàn thiện biên bản đánh giá nội bộ 2026',
    description: 'Tổng hợp checklist và phát hiện của đoàn đánh giá.',
    source: 'internal_audit', departmentId: 2, ownerId: 7, issue: 'Chưa ban hành biên bản audit nội bộ',
    relatedTaskId: 13, dueDate: '2026-10-31', status: 'open', progress: 0,
  },
  {
    id: 3, code: 'ACT-003', title: 'Đào tạo ISO cho nhân viên mới quý III',
    description: 'Đã đào tạo 42/60 nhân viên, còn 18 người lịch tháng sau.',
    source: 'management', departmentId: 3, ownerId: 4, issue: 'Nhân viên mới chưa được đào tạo hệ thống',
    dueDate: '2026-09-30', status: 'overdue', progress: 70,
  },
  {
    id: 4, code: 'ACT-004', title: 'Kiểm kê và loại bỏ tài liệu lỗi thời',
    description: 'Đã lập danh sách 12 tài liệu obsolete chờ duyệt đóng.',
    source: 'ncr', departmentId: 2, ownerId: 3, issue: 'Tài liệu cũ còn lưu tại các phòng',
    relatedDocumentId: 5, dueDate: '2026-09-20', status: 'verified', progress: 100,
    result: 'Đã rà soát xong 12/12 tài liệu',
  },
  {
    id: 5, code: 'ACT-005', title: 'Cải thiện quy trình báo giá cho khách hàng lớn',
    source: 'complaint', departmentId: 4, ownerId: 5, issue: 'Khách hàng phản hồi thời gian báo giá chậm',
    relatedDocumentId: 6, dueDate: '2026-11-15', status: 'open', progress: 0,
  },
  {
    id: 6, code: 'ACT-006', title: 'Bổ sung hồ sơ đánh giá năng lực nhà cung cấp',
    source: 'risk', departmentId: 5, ownerId: 6, issue: 'Nhà cung cấp vật tư chưa có hồ sơ năng lực',
    relatedRiskId: 3, dueDate: '2026-10-20', status: 'in_progress', progress: 35,
  },
  {
    id: 7, code: 'ACT-R01', title: 'Lịch đào tạo ISO hằng tháng cho nhân viên mới',
    source: 'risk', departmentId: 3, ownerId: 4, issue: 'Nhân viên mới chưa hoàn tất đào tạo ISO',
    relatedRiskId: 1, dueDate: '2026-11-30', status: 'in_progress', progress: 40,
  },
  {
    id: 8, code: 'ACT-O01', title: 'Đào tạo ISO 9001:2015 cho toàn thể nhân viên',
    source: 'opportunity', departmentId: 1, ownerId: 2, issue: 'Triển khai ISO 9001 toàn công ty',
    relatedOpportunityId: 1, dueDate: '2026-11-15', status: 'open', progress: 0,
  },
];

// ---------- CR-RISK-OPPORTUNITY-001: demo Risk & Opportunity (khớp BE RiskOpportunitySeeder) ----------

const risks: RiskItem[] = [
  { id: 1, code: 'RISK-001', sourceType: 'internal', category: 'human', objective: 'Đào tạo ISO cho nhân viên mới',
    description: 'Nhân viên mới chưa hoàn tất đào tạo hệ thống → sai sót khi vận hành quy trình.',
    likelihood: 5, impact: 3, riskScore: 15, riskLevel: 'high',
    initialLikelihood: 5, initialImpact: 3, initialScore: 15, initialLevel: 'high',
    treatment: 'Lịch đào tạo hằng tháng, checklist onboarding ISO.',
    expectedResult: '100% nhân viên mới hoàn tất đào tạo trong 30 ngày.',
    ownerId: 4, departmentId: 3, startDate: '2026-10-01', dueDate: '2026-12-31',
    reviewFrequency: 'monthly', nextReviewDate: '2026-09-30', reviewStatus: 'overdue',
    status: 'in_progress' },
  { id: 2, code: 'RISK-002', sourceType: 'internal', category: 'infrastructure', objective: 'Hạ tầng CNTT & sao lưu dữ liệu',
    description: 'Máy chủ chưa có backup tự động hằng ngày, rủi ro mất dữ liệu eQMS.',
    likelihood: 3, impact: 2, riskScore: 6, riskLevel: 'medium',
    initialLikelihood: 3, initialImpact: 2, initialScore: 6, initialLevel: 'medium',
    treatment: 'Thiết lập backup tự động + kiểm thử khôi phục hàng quý.',
    ownerId: 4, departmentId: 3, startDate: '2026-10-01', dueDate: '2026-12-31',
    reviewFrequency: 'quarterly', nextReviewDate: '2026-10-16', reviewStatus: 'due_soon',
    status: 'open' },
  { id: 3, code: 'RISK-003', sourceType: 'external', category: 'supplier', objective: 'Nguồn cung NVL đầu vào',
    description: 'Phụ thuộc duy nhất một nhà cung cấp NVL then chốt.',
    likelihood: 2, impact: 2, riskScore: 4, riskLevel: 'low',
    initialLikelihood: 2, initialImpact: 2, initialScore: 4, initialLevel: 'low',
    treatment: 'Đánh giá và mở thêm nhà cung cấp thứ hai, ký hợp đồng khung.',
    expectedResult: 'Có ít nhất 2 nhà cung cấp được phê duyệt.',
    ownerId: 6, departmentId: 5, startDate: '2026-10-01', dueDate: '2026-12-31',
    reviewFrequency: 'yearly', nextReviewDate: '2026-11-30', reviewStatus: 'normal',
    status: 'open' },
  { id: 4, code: 'RISK-004', sourceType: 'external', category: 'political_legal', objective: 'Thay đổi luật định về môi trường',
    description: 'Dự thảo nghị định mới về phát thải có thể áp dụng từ 2027.',
    likelihood: 4, impact: 4, riskScore: 16, riskLevel: 'high',
    initialLikelihood: 4, initialImpact: 4, initialScore: 16, initialLevel: 'high',
    treatment: 'Theo dõi văn bản pháp luật, rà soát tác động hằng quý.',
    ownerId: 2, departmentId: 1, startDate: '2026-10-01', dueDate: '2026-12-31',
    reviewFrequency: 'quarterly', nextReviewDate: '2027-01-15', reviewStatus: 'normal',
    status: 'open' },
  { id: 5, code: 'RISK-005', sourceType: 'internal', category: 'process', objective: 'Quy trình xử lý khiếu nại',
    description: 'Thời hạn phản hồi khiếu nại chưa được quy định rõ.',
    likelihood: 2, impact: 3, riskScore: 6, riskLevel: 'medium',
    initialLikelihood: 2, initialImpact: 3, initialScore: 6, initialLevel: 'medium',
    treatment: 'Bổ sung bước thời hạn phản hồi 24h vào quy trình.',
    expectedResult: 'Quy trình ban hành, phản hồi khiếu nại ≤24h.',
    ownerId: 8, departmentId: 4,
    reviewFrequency: null, nextReviewDate: null, reviewStatus: null,
    status: 'closed' },
  { id: 6, code: 'RISK-006', sourceType: 'interested_party', category: 'customer', objective: 'Yêu cầu khách hàng lớn về chứng nhận',
    description: 'Khách hàng xuất khẩu yêu cầu bổ sung chứng nhận phụ trợ.',
    likelihood: 1, impact: 2, riskScore: 2, riskLevel: 'low',
    initialLikelihood: 2, initialImpact: 4, initialScore: 8, initialLevel: 'medium',
    treatment: 'Liên hệ tổ chức chứng nhận, lập kế hoạch đánh giá.',
    ownerId: 3, departmentId: 2, startDate: '2026-10-01', dueDate: '2026-12-31',
    reviewFrequency: 'monthly', nextReviewDate: '2026-10-25', reviewStatus: 'normal',
    lastReviewedBy: 3, lastReviewComment: 'Đã liên hệ tổ chức chứng nhận, rủi ro giảm.',
    status: 'open' },
];

const riskAssessments: RiskAssessmentItem[] = [
  { id: 1, riskId: 1, kind: 'initial', likelihood: 5, impact: 3, score: 15, level: 'high', assessedBy: 2, createdAt: '2026-10-11T08:00:00' },
  { id: 2, riskId: 2, kind: 'initial', likelihood: 3, impact: 2, score: 6, level: 'medium', assessedBy: 2, createdAt: '2026-10-11T08:00:00' },
  { id: 3, riskId: 3, kind: 'initial', likelihood: 2, impact: 2, score: 4, level: 'low', assessedBy: 2, createdAt: '2026-10-11T08:00:00' },
  { id: 4, riskId: 4, kind: 'initial', likelihood: 4, impact: 4, score: 16, level: 'high', assessedBy: 2, createdAt: '2026-10-11T08:00:00' },
  { id: 5, riskId: 5, kind: 'initial', likelihood: 2, impact: 3, score: 6, level: 'medium', assessedBy: 2, createdAt: '2026-10-11T08:00:00' },
  { id: 6, riskId: 6, kind: 'initial', likelihood: 2, impact: 4, score: 8, level: 'medium', assessedBy: 2, createdAt: '2026-10-11T08:00:00' },
  { id: 7, riskId: 6, kind: 'residual', likelihood: 1, impact: 2, score: 2, level: 'low', assessedBy: 3, comment: 'Đã liên hệ tổ chức chứng nhận, rủi ro giảm.', createdAt: '2026-10-11T09:00:00' },
];

const opportunities: OpportunityItem[] = [
  { id: 1, code: 'OPP-001', sourceType: 'internal', category: 'process', objective: 'Triển khai hệ thống ISO 9001 toàn công ty',
    description: 'Áp dụng eQMS chuẩn ISO 9001:2015 làm nền tảng quản lý.',
    feasibility: 4, benefit: 3, opportunityScore: 12, opportunityLevel: 'priority',
    solution: 'Đào tạo, xây dựng tài liệu, triển khai, đánh giá nội bộ.',
    expectedResult: 'Đạt chứng nhận ISO 9001:2015.',
    ownerId: 2, departmentId: 1, reviewFrequency: 'monthly', nextReviewDate: '2026-10-20', reviewStatus: 'due_soon',
    status: 'in_progress' },
  { id: 2, code: 'OPP-002', sourceType: 'external', category: 'customer', objective: 'Mở rộng khách hàng xuất khẩu',
    description: 'Nhu cầu thị trường EU tăng, cần đánh giá khả năng đáp ứng.',
    feasibility: 3, benefit: 3, opportunityScore: 9, opportunityLevel: 'research',
    solution: 'Nghiên cứu thị trường, lập hồ sơ năng lực xuất khẩu.',
    ownerId: 5, departmentId: 4, reviewFrequency: 'quarterly', nextReviewDate: '2026-12-31', reviewStatus: 'normal',
    status: 'open' },
  { id: 3, code: 'OPP-003', sourceType: 'internal', category: 'capital', objective: 'Tối ưu chi phí vận hành kho',
    description: 'Ứng dụng lưu trữ điện tử giảm chi phí giấy tờ.',
    feasibility: 2, benefit: 2, opportunityScore: 4, opportunityLevel: 'ignore',
    solution: 'Lưu hồ sơ tham khảo khi điều kiện cho phép.',
    ownerId: 4, departmentId: 3, reviewFrequency: null, nextReviewDate: null, reviewStatus: null,
    status: 'open' },
  { id: 4, code: 'OPP-004', sourceType: 'interested_party', category: 'management', objective: 'Báo cáo Ban Lãnh đạo tự động từ KPI',
    description: 'Dashboard eQMS cung cấp dữ liệu management review theo thời gian thực.',
    feasibility: 5, benefit: 4, opportunityScore: 20, opportunityLevel: 'priority',
    solution: 'Kết nối KPI module với dashboard, phê duyệt bởi BGĐ.',
    expectedResult: 'BGĐ nhận báo cáo tự động hằng tháng.',
    ownerId: 3, departmentId: 2, reviewFrequency: 'monthly', nextReviewDate: '2026-10-30', reviewStatus: 'normal',
    status: 'open' },
  { id: 5, code: 'OPP-005', sourceType: 'external', category: 'community', objective: 'Chương trình cộng đồng về môi trường',
    description: 'Hợp tác chương trình xanh nâng cao danh tiếng doanh nghiệp.',
    feasibility: 3, benefit: 2, opportunityScore: 6, opportunityLevel: 'research',
    solution: 'Đề xuất phương án và thời điểm triển khai phù hợp.',
    ownerId: 6, departmentId: 5, reviewFrequency: 'yearly', nextReviewDate: '2027-02-28', reviewStatus: 'normal',
    status: 'open' },
];

const logs = [
  { id: 1, userId: 2, action: 'approve', entity: 'document', entityId: 1, newStatus: 'published', at: '2026-06-01T08:30:00' },
  { id: 2, userId: 5, action: 'submit', entity: 'document', entityId: 3, newStatus: 'reviewing', at: '2026-10-07T09:15:00' },
  { id: 3, userId: 3, action: 'status_change', entity: 'master_plan_task', entityId: 1, oldStatus: 'in_progress', newStatus: 'completed', at: '2026-10-08T10:00:00' },
];

/** 9 vai trò chuẩn (ma trận RBAC) – admin chỉ sửa phân quyền, không xóa. */
export function seedRoles(): RoleItem[] {
  return ROLE_CODES.map((code, i) => ({
    id: i + 1,
    code,
    name: ROLE_NAMES[code],
    description: ROLE_NAMES[code],
    permissions: [...ROLE_PERMISSIONS[code]],
  }));
}

export function seed(): MockDb {
  return {
    departments: departments.map((d) => ({ ...d })),
    documentsStatuses: [],
    users: users.map((u) => ({ ...u, roleCodes: [...u.roleCodes] })),
    roles: seedRoles(),
    phases: phases.map((p) => ({ ...p })),
    tasks: tasks.map((t) => ({ ...t })),
    documents: documents.map((d) => ({ ...d, versions: [...d.versions], approvals: [...d.approvals] })),
    actions: actions.map((a) => ({ ...a })),
    logs: logs.map((l) => ({ ...l })),
    seq: 1000,
    risks: risks.map((r) => ({ ...r })),
    opportunities: opportunities.map((o) => ({ ...o })),
    riskAssessments: riskAssessments.map((a) => ({ ...a })),
  };
}



