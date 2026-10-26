import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { PermissionRoute, RequireAuth } from './auth/guards';
import ForbiddenPage from './pages/ForbiddenPage';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MasterPlanPage from './pages/MasterPlanPage';
import GanttPage from './pages/GanttPage';
import DocumentsPage from './pages/DocumentsPage';
import ActionsPage from './pages/ActionsPage';
import AdminPage from './pages/AdminPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminFunctionsPage from './pages/AdminFunctionsPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import RisksPage from './pages/RisksPage';
import OpportunitiesPage from './pages/OpportunitiesPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/403" element={<ForbiddenPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route
              index
              element={
                <PermissionRoute permission="dashboard.view">
                  <DashboardPage />
                </PermissionRoute>
              }
            />
            <Route
              path="master-plan"
              element={
                <PermissionRoute permission="master_plan.view">
                  <MasterPlanPage />
                </PermissionRoute>
              }
            />
            <Route
              path="gantt"
              element={
                <PermissionRoute permission="master_plan.view">
                  <GanttPage />
                </PermissionRoute>
              }
            />
            <Route
              path="documents"
              element={
                <PermissionRoute permission="document.view">
                  <DocumentsPage />
                </PermissionRoute>
              }
            />
            <Route
              path="risks"
              element={
                <PermissionRoute permission="risk.view">
                  <RisksPage />
                </PermissionRoute>
              }
            />
            <Route
              path="opportunities"
              element={
                <PermissionRoute permission="opportunity.view">
                  <OpportunitiesPage />
                </PermissionRoute>
              }
            />
            <Route
              path="actions"
              element={
                <PermissionRoute permission="action.view">
                  <ActionsPage />
                </PermissionRoute>
              }
            />
            <Route
              path="admin"
              element={
                <PermissionRoute permission="user.view">
                  <AdminPage />
                </PermissionRoute>
              }
            />
            <Route
              path="admin/users"
              element={
                <PermissionRoute permission="user.view">
                  <AdminUsersPage />
                </PermissionRoute>
              }
            />
            <Route
              path="admin/functions"
              element={
                <PermissionRoute permission="user.view">
                  <AdminFunctionsPage />
                </PermissionRoute>
              }
            />
            <Route
              path="admin/settings"
              element={
                <PermissionRoute permission="user.view">
                  <AdminSettingsPage />
                </PermissionRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
