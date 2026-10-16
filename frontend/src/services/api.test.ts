// Task 06 – Unit/Integration test cho HTTP client thật (services/api.ts).
// fetch được mock – không phụ thuộc backend đang chạy.
// Env: VITE_API_URL=http://api.test, VITE_USE_MOCK=false (vitest.config.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

const BASE = 'http://api.test';

/** Response JSON giả lập. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api.login', () => {
  it('gọi POST /api/login với JSON body, không kèm Authorization', async () => {
    const payload = { token: 'tok.2.abc', user: { id: 2, username: 'leader' } };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    const result = await api.login('leader', 'Leader123!');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/login`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ username: 'leader', password: 'Leader123!' });
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers.Authorization).toBeUndefined();
    expect(result).toEqual(payload);
  });

  it('ném ApiError 401 khi sai mật khẩu (message từ backend)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(
      { status: 'error', message: 'Tên đăng nhập hoặc mật khẩu không đúng.' },
      401,
    ));

    await expect(api.login('leader', 'sai')).rejects.toMatchObject({
      status: 401,
      message: 'Tên đăng nhập hoặc mật khẩu không đúng.',
    });
  });
});

describe('api.me', () => {
  it('gắn Authorization: Bearer từ localStorage', async () => {
    localStorage.setItem('eqms.session', 'tok.2.abc');
    fetchMock.mockResolvedValue(jsonResponse({ id: 2, username: 'leader' }));

    const user = await api.me();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/me`);
    expect(init.headers.Authorization).toBe('Bearer tok.2.abc');
    expect(user).toEqual({ id: 2, username: 'leader' });
  });

  it('trả null (không ném) khi token hết hạn – 401', async () => {
    localStorage.setItem('eqms.session', 'tok.het-han');
    fetchMock.mockResolvedValue(jsonResponse({ status: 'error', message: 'hết hạn' }, 401));

    await expect(api.me()).resolves.toBeNull();
  });
});

describe('api.updateTaskProgress (CR Master Plan ISO)', () => {
  it('gọi PATCH /api/master-plan/tasks/{id}/progress với body { progress }', async () => {
    const payload = { id: 7, progress: 60 };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    const result = await api.updateTaskProgress(7, 60);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/master-plan/tasks/7/progress`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ progress: 60 });
    expect(result).toEqual(payload);
  });

  it('403 (không phải owner, không có master_plan.update) → ApiError 403', async () => {
    fetchMock.mockResolvedValue(jsonResponse(
      { status: 'error', message: 'Bạn chỉ được cập nhật tiến độ công việc của mình.' },
      403,
    ));

    await expect(api.updateTaskProgress(7, 60)).rejects.toMatchObject({
      status: 403,
      message: 'Bạn chỉ được cập nhật tiến độ công việc của mình.',
    });
  });
});

describe('lỗi HTTP – ApiError thống nhất', () => {
  it('403 không có message → dùng message mặc định theo status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 403));

    await expect(api.dashboard()).rejects.toMatchObject({
      status: 403,
      message: 'Bạn không có quyền thực hiện thao tác này.',
    });
  });

  it('422 → lấy lỗi validation đầu tiên từ errors', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      message: 'Dữ liệu không hợp lệ.',
      errors: { progress: ['Progress phải từ 0 đến 100.'] },
    }, 422));

    await expect(api.updateTask(2, { progress: 150 })).rejects.toMatchObject({
      status: 422,
      message: 'Progress phải từ 0 đến 100.',
    });
  });

  it('409 → message từ backend (workflow conflict)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      status: 'error',
      message: 'Không thể thực hiện thao tác tại trạng thái hiện tại.',
    }, 409));

    await expect(api.transitionDocument(2, 'review')).rejects.toMatchObject({
      status: 409,
      message: 'Không thể thực hiện thao tác tại trạng thái hiện tại.',
    });
  });

  it('lỗi mạng (backend tắt) → ApiError status 0, không fallback mock', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const promise = api.dashboard();
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // vẫn gọi fetch, không nhảy sang mockApi
  });

  it('401 request cần auth → phát sự kiện eqms:unauthorized', async () => {
    localStorage.setItem('eqms.session', 'tok.x');
    const onUnauthorized = vi.fn();
    window.addEventListener('eqms:unauthorized', onUnauthorized);
    fetchMock.mockResolvedValue(jsonResponse({ status: 'error' }, 401));

    await expect(api.dashboard()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    window.removeEventListener('eqms:unauthorized', onUnauthorized);
  });
});
