// Mock DB – in-memory + localStorage persistence (thay DB thật ở prototype)
import { seed, seedRoles } from './seed';
import type { MockDb } from './types';

const STORAGE_KEY = 'eqms.mockdb.v1';

let cache: MockDb | null = null;

export function getDb(): MockDb {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb;
      // DB cũ (trước khi thêm RBAC roles) → seed lại danh sách vai trò chuẩn.
      if (!Array.isArray(parsed.roles) || parsed.roles.length === 0) parsed.roles = seedRoles();
      // DB cũ (trước CR-RISK-OPPORTUNITY-001) → seed thêm risks/opportunities/assessments.
      if (!Array.isArray(parsed.risks) || !Array.isArray(parsed.opportunities) || !Array.isArray(parsed.riskAssessments)) {
        const fresh = seed();
        parsed.risks = fresh.risks;
        parsed.opportunities = fresh.opportunities;
        parsed.riskAssessments = fresh.riskAssessments;
      }
      cache = parsed;
      return cache;
    }
  } catch {
    // corrupted → seed lại
  }
  cache = seed();
  persist(cache);
  return cache;
}

export function persist(db: MockDb): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // storage full / private mode → bỏ qua
  }
}

/** Dùng cho nút "Reset dữ liệu demo" */
export function resetDb(): MockDb {
  cache = seed();
  persist(cache);
  return cache;
}

export function nextId(db: MockDb): number {
  db.seq += 1;
  return db.seq;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
