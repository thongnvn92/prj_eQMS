// Kiểu dùng cho RAG – tái xuất từ mock/types (giữ rag.ts thuần logic, không kéo React/JSX).
export type {
  DashboardStats,
  DocumentItem,
  Task,
  ActionItem,
  ActivityLog,
  Phase,
  Department,
} from '../mock/types';

/** Người (owner) – khớp lookups.people. */
export interface Person {
  id: number;
  fullName: string;
}
