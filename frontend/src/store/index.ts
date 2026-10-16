// Redux Toolkit store – DMC eQMS
// Server state (dashboard, master plan, documents, actions, admin) nằm trong store;
// session/auth giữ ở AuthContext (xem docs/architecture.md).
import { configureStore } from '@reduxjs/toolkit';
import adminReducer from './slices/adminSlice';
import actionsReducer from './slices/actionsSlice';
import dashboardReducer from './slices/dashboardSlice';
import documentsReducer from './slices/documentsSlice';
import lookupsReducer from './slices/lookupsSlice';
import masterPlanReducer from './slices/masterPlanSlice';
import opportunitiesReducer from './slices/opportunitiesSlice';
import riskDashboardReducer from './slices/riskDashboardSlice';
import risksReducer from './slices/risksSlice';

export const store = configureStore({
  reducer: {
    lookups: lookupsReducer,
    dashboard: dashboardReducer,
    masterPlan: masterPlanReducer,
    documents: documentsReducer,
    actions: actionsReducer,
    risks: risksReducer,
    opportunities: opportunitiesReducer,
    riskDashboard: riskDashboardReducer,
    admin: adminReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
