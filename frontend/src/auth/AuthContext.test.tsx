// Task 06 – AuthContext: login/logout, khôi phục session, event 401, RBAC can/canAny.
// Mock services/api để test state logic không cần fetch/backend.
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { ApiError } from '../mock/api';
import type { SessionUser } from '../mock/types';

const loginMock = vi.fn();
const meMock = vi.fn();

vi.mock('../services/api', () => ({
  api: {
    login: (...args: unknown[]) => loginMock(...args),
    me: (...args: unknown[]) => meMock(...args),
  },
}));

const leaderSession: SessionUser = {
  id: 2,
  username: 'leader',
  fullName: 'Trần Văn Long',
  departmentId: 2,
  departmentName: 'ISO',
  roleCodes: ['iso_leader'],
  roleNames: ['ISO Committee Leader'],
  permissions: ['dashboard.view', 'master_plan.update', 'document.approve'],
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AuthContext', () => {
  it('useAuth ngoài <AuthProvider> throw lỗi rõ ràng', () => {
    // React DOM cũng log error ra stderr khi render component throw → chặn để output sạch.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // renderHook không có wrapper → React context null → throw.
    expect(() => renderHook(() => useAuth())).toThrow('useAuth phải dùng trong <AuthProvider>');
    spy.mockRestore();
  });

  it('chưa đăng nhập: user=null, loading=false, can() luôn false', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.can('dashboard.view')).toBe(false);
  });

  it('login thành công: set user + persist token vào localStorage', async () => {
    // Sau login, token đổi → effect khôi phục session gọi api.me() → phải mock trả user.
    meMock.mockResolvedValue(leaderSession);
    loginMock.mockResolvedValue({ token: 'tok.2.abc', user: leaderSession });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: SessionUser | undefined;
    await result.current.login('leader', 'Leader123!').then((u) => { returned = u; });

    expect(loginMock).toHaveBeenCalledWith('leader', 'Leader123!');
    expect(returned).toEqual(leaderSession);
    // State React cập nhật bất đồng bộ → waitFor.
    await waitFor(() => expect(result.current.user).toEqual(leaderSession));
    expect(result.current.token).toBe('tok.2.abc');
    expect(localStorage.getItem('eqms.session')).toBe('tok.2.abc');
    expect(result.current.can('master_plan.update')).toBe(true);
    expect(result.current.can('action.close')).toBe(false); // không có trong permissions
    expect(result.current.canAny(['action.close', 'document.approve'])).toBe(true);
  });

  it('login sai mật khẩu: ném ApiError, không set user/token', async () => {
    loginMock.mockRejectedValue(new ApiError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.'));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.login('leader', 'sai')).rejects.toMatchObject({ status: 401 });
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('eqms.session')).toBeNull();
  });

  it('reload trang với token còn hiệu lực → khôi phục session qua me()', async () => {
    localStorage.setItem('eqms.session', 'tok.2.abc');
    meMock.mockResolvedValue(leaderSession);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.user).toEqual(leaderSession));
    expect(result.current.token).toBe('tok.2.abc');
    expect(result.current.loading).toBe(false);
  });

  it('reload trang với token hết hạn → me()=null → xóa session', async () => {
    localStorage.setItem('eqms.session', 'tok.het-han');
    meMock.mockResolvedValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.user).toBeNull());
    expect(localStorage.getItem('eqms.session')).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('nhận sự kiện eqms:unauthorized giữa phiên → logout ngay', async () => {
    localStorage.setItem('eqms.session', 'tok.2.abc');
    meMock.mockResolvedValue(leaderSession);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(leaderSession));

    window.dispatchEvent(new CustomEvent('eqms:unauthorized'));

    await waitFor(() => expect(result.current.user).toBeNull());
    await waitFor(() => expect(localStorage.getItem('eqms.session')).toBeNull());
  });

  it('logout: xóa token + user', async () => {
    localStorage.setItem('eqms.session', 'tok.2.abc');
    meMock.mockResolvedValue(leaderSession);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(leaderSession));

    result.current.logout();

    // State React cập nhật bất đồng bộ → waitFor.
    await waitFor(() => expect(result.current.user).toBeNull());
    await waitFor(() => expect(result.current.token).toBeNull());
    expect(localStorage.getItem('eqms.session')).toBeNull();
  });
});
