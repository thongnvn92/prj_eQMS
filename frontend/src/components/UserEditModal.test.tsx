import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UserEditModal from './UserEditModal';

describe('UserEditModal', () => {
  it('loads selected user data into the form when opened', async () => {
    render(
      <UserEditModal
        lookups={{ departments: [{ id: 1, name: 'Phòng QA' }, { id: 2, name: 'Phòng Kỹ thuật' }] }}
        roles={[{ code: 'admin', name: 'Quản trị viên' }, { code: 'editor', name: 'Biên tập' }]}
        user={{
          id: 42,
          username: 'nguyenvana',
          fullName: 'Nguyễn Văn A',
          email: 'a.nguyen@dmc.vn',
          departmentId: 1,
          roleCodes: ['admin', 'editor'],
          active: true,
        }}
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('nguyenvana')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Nguyễn Văn A')).toBeInTheDocument();
      expect(screen.getByDisplayValue('a.nguyen@dmc.vn')).toBeInTheDocument();
    });

    const usernameInput = screen.getByDisplayValue('nguyenvana');
    expect(usernameInput).toBeDisabled();
    expect(screen.getByText('Phòng QA')).toBeInTheDocument();
  });
});
