import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionRoute, RequireAuth } from './guards';

const authState = vi.hoisted(() => ({
  user: null as { id: number } | null,
  loading: false,
  permissions: [] as string[],
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
    can: (permission: string) => authState.permissions.includes(permission),
  }),
}));

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/403" element={<div>Forbidden page</div>} />
        <Route
          path="/protected"
          element={
            <RequireAuth>
              <PermissionRoute permission="dashboard.view">
                <div>Protected page</div>
              </PermissionRoute>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.user = null;
  authState.loading = false;
  authState.permissions = [];
});

describe('route guards', () => {
  it('redirects anonymous users to login without rendering protected content', () => {
    renderProtectedRoute();

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
  });

  it('waits for session restoration before rendering protected content', () => {
    authState.user = { id: 1 };
    authState.loading = true;
    renderProtectedRoute();

    expect(screen.getByText('Đang tải phiên làm việc...')).toBeInTheDocument();
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
  });

  it('renders the protected page for an authenticated user with permission', () => {
    authState.user = { id: 1 };
    authState.permissions = ['dashboard.view'];
    renderProtectedRoute();

    expect(screen.getByText('Protected page')).toBeInTheDocument();
  });

  it('redirects authenticated users without permission to forbidden', () => {
    authState.user = { id: 1 };
    renderProtectedRoute();

    expect(screen.getByText('Forbidden page')).toBeInTheDocument();
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
  });
});
