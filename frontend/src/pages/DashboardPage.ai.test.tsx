import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';

const mocks = vi.hoisted(() => ({
  analyzeWithAi: vi.fn(),
  saveAiAnalysis: vi.fn(),
  aiAnalyses: vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { fullName: 'Quality Analyst' } }),
}));

vi.mock('../hooks/queries', () => ({
  useDashboard: () => ({
    data: {
      taskTotal: 4,
      taskCompleted: 1,
      taskInProgress: 1,
      taskNotStarted: 2,
      taskOverdue: 0,
      completionRate: 25,
      avgProgress: 25,
      tasksByStatus: [],
      tasksByPhase: [],
      tasksByPriority: [],
      docByStatus: [],
      docPending: 0,
      actionByStatus: [],
      actionOverdue: 0,
      overdueTasks: [],
      pendingDocs: [],
    },
    isLoading: false,
  }),
  useLookups: () => ({ data: { people: [], departments: [] } }),
  useMasterPlan: () => ({ data: { tasks: [] } }),
  useDocuments: () => ({ data: [] }),
  useActionItems: () => ({ data: [] }),
}));

vi.mock('../services/ai', () => ({
  analyzeWithAi: mocks.analyzeWithAi,
  isAiConfigured: () => true,
  loadAiSettings: () => ({
    provider: 'gemini',
    apiKey: 'test-key',
    model: 'gemini-3.8-flash',
    enabled: true,
  }),
}));

vi.mock('../services/api', () => ({
  api: {
    saveAiAnalysis: mocks.saveAiAnalysis,
    aiAnalyses: mocks.aiAnalyses,
  },
}));

vi.mock('../services/rag', () => ({
  ANALYSIS_MODES: [
    { key: 'executive', label: 'Tổng quan điều hành' },
  ],
  DEFAULT_MODE: 'executive',
  composeRagContext: () => ({
    userPrompt: 'Analyze dashboard',
    systemPrompt: 'System prompt',
    sources: [],
  }),
}));

vi.mock('../components/EChart', () => ({ default: () => <div data-testid="chart" /> }));
vi.mock('../components/WeeklyReportModal', () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.analyzeWithAi.mockResolvedValue('## Kết quả AI\n\n- Tiến độ **25%**.');
  mocks.saveAiAnalysis.mockResolvedValue({ id: 10 });
  mocks.aiAnalyses.mockResolvedValue([
    {
      id: 10,
      mode: 'executive',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      content: '## Phân tích gần nhất\n\n- Ưu tiên **CAPA**.',
      analyzedAt: '2026-10-27T02:00:00+07:00',
    },
    {
      id: 9,
      mode: 'executive',
      provider: 'openai',
      model: 'gpt-4o-mini',
      content: '## Phân tích trước đó\n\n- Theo dõi *tài liệu*.',
      analyzedAt: '2026-10-26T02:00:00+07:00',
    },
  ]);
});

describe('DashboardPage AI analysis', () => {
  it('saves AI output and renders its markdown formatting', async () => {
    render(<DashboardPage />);

    fireEvent.click(screen.getByRole('button', { name: /Phân tích AI/ }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Kết quả AI' })).toBeInTheDocument();
    expect(screen.getByText('25%', { selector: 'strong' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.saveAiAnalysis).toHaveBeenCalledWith({
      mode: 'executive',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      content: '## Kết quả AI\n\n- Tiến độ **25%**.',
    }));
  });

  it('loads the latest history and exposes older entries in the selector', async () => {
    const user = userEvent.setup();
    const { container } = render(<DashboardPage />);

    fireEvent.click(within(container).getByRole('button', { name: /Lịch sử phân tích AI/ }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Phân tích gần nhất' })).toBeInTheDocument();
    expect(mocks.aiAnalyses).toHaveBeenCalledTimes(1);
    const historyDialog = screen.getByRole('dialog', { name: /Lịch sử phân tích AI/ });
    const combobox = within(historyDialog).getByRole('combobox', { name: 'Chọn lịch sử phân tích AI' });
    await user.click(combobox);
    expect(await screen.findByRole('option', { name: /26\/10\/26 - Tổng quan điều hành/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Phân tích gần nhất' })).toBeInTheDocument();
    expect(screen.getByText('CAPA', { selector: 'strong' })).toBeInTheDocument();
  });

  it('renders compact plaintext Markdown tables in analysis results', async () => {
    const tableMarkdown = '| Mức ưu tiên | Hạng mục | | :--- | :--- | | **CAO** | **[ACT-001]** quá hạn |';
    mocks.analyzeWithAi.mockResolvedValue(tableMarkdown);

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole('button', { name: /Phân tích AI/ }));
    const resultTable = await screen.findByRole('table');
    expect(within(resultTable).getByRole('columnheader', { name: 'Mức ưu tiên' })).toBeInTheDocument();
    expect(within(resultTable).getByRole('cell', { name: 'CAO' })).toBeInTheDocument();
    expect(within(resultTable).getByRole('cell', { name: '[ACT-001] quá hạn' })).toBeInTheDocument();
  });

  it('renders compact plaintext Markdown tables in analysis history', async () => {
    const tableMarkdown = '| Mức ưu tiên | Hạng mục | | :--- | :--- | | **CAO** | **[ACT-001]** quá hạn |';
    mocks.aiAnalyses.mockResolvedValue([{
      id: 10,
      mode: 'executive',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      content: tableMarkdown,
      analyzedAt: '2026-10-27T02:00:00+07:00',
    }]);
    const { container } = render(<DashboardPage />);
    fireEvent.click(within(container).getByRole('button', { name: /Lịch sử phân tích AI/ }));
    const historyDialog = screen.getByRole('dialog', { name: /Lịch sử phân tích AI/ });
    const historyTable = await within(historyDialog).findByRole('table');
    expect(within(historyTable).getByRole('columnheader', { name: 'Mức ưu tiên' })).toBeInTheDocument();
    expect(within(historyTable).getByRole('cell', { name: '[ACT-001] quá hạn' })).toBeInTheDocument();
  });
});
