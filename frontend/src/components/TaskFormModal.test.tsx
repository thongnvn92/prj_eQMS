import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TaskFormModal from './TaskFormModal';

const sharedProps = {
  title: 'Sửa công việc',
  phases: [{
    id: 1,
    code: 'P1',
    name: 'Planning',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    sortOrder: 1,
  }],
  people: [{ id: 1, fullName: 'User One' }],
  onCancel: vi.fn(),
  onOk: vi.fn(),
};

describe('TaskFormModal', () => {
  it('loads each selected task and clears edit values when reopened for create', async () => {
    const { rerender } = render(
      <TaskFormModal
        {...sharedProps}
        open
        editingId={1}
        initialValues={{ code: 'TASK-A', name: 'First task', phaseId: 1 }}
      />,
    );

    expect(await screen.findByDisplayValue('TASK-A')).toBeInTheDocument();
    expect(screen.getByDisplayValue('First task')).toBeInTheDocument();

    rerender(
      <TaskFormModal
        {...sharedProps}
        open={false}
        editingId={1}
        initialValues={{ code: 'TASK-A', name: 'First task', phaseId: 1 }}
      />,
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    rerender(
      <TaskFormModal
        {...sharedProps}
        open
        editingId={2}
        initialValues={{ code: 'TASK-B', name: 'Second task', phaseId: 1 }}
      />,
    );

    expect(await screen.findByDisplayValue('TASK-B')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Second task')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('TASK-A')).not.toBeInTheDocument();

    rerender(
      <TaskFormModal
        {...sharedProps}
        open={false}
        editingId={2}
        initialValues={{ code: 'TASK-B', name: 'Second task', phaseId: 1 }}
      />,
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    rerender(
      <TaskFormModal
        {...sharedProps}
        title="Thêm công việc mới"
        open
        editingId={null}
        initialValues={{}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('VD: MP-017')).toHaveValue('');
      expect(screen.getByPlaceholderText('VD: Biên soạn Tài liệu hướng dẫn')).toHaveValue('');
    });
  });
});
