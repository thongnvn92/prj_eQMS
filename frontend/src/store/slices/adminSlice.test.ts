import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import adminReducer, { updatePhase } from './adminSlice';
import lookupsReducer from './lookupsSlice';
import masterPlanReducer from './masterPlanSlice';

const apiMock = vi.hoisted(() => ({
  updatePhase: vi.fn(),
  adminPhases: vi.fn(),
  lookups: vi.fn(),
  masterPlan: vi.fn(),
  masterPlans: vi.fn(),
}));

vi.mock('../../services/api', () => ({ api: apiMock }));

describe('admin master-data synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes the Master Plan after updating a work group', async () => {
    const updatedPhase = {
      id: 22,
      code: 'PHASE-EDIT',
      name: 'Updated work group',
      sortOrder: 1,
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    };
    apiMock.updatePhase.mockResolvedValue(updatedPhase);
    apiMock.adminPhases.mockResolvedValue([updatedPhase]);
    apiMock.lookups.mockResolvedValue({ people: [], departments: [], phases: [updatedPhase], documentStatuses: [] });
    apiMock.masterPlan.mockResolvedValue({ phases: [updatedPhase], tasks: [] });
    apiMock.masterPlans.mockResolvedValue([]);

    const store = configureStore({
      reducer: {
        admin: adminReducer,
        lookups: lookupsReducer,
        masterPlan: masterPlanReducer,
      },
    });

    await store.dispatch(updatePhase({ id: updatedPhase.id, patch: { name: updatedPhase.name } }));

    expect(apiMock.updatePhase).toHaveBeenCalledWith(updatedPhase.id, { name: updatedPhase.name });
    expect(apiMock.masterPlan).toHaveBeenCalledTimes(1);
    expect(store.getState().masterPlan.phases).toEqual([updatedPhase]);
    expect(store.getState().lookups.phases).toEqual([updatedPhase]);
  });
});
