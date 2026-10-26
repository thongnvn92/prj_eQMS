import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useColorMode } from './ThemeContext';

function ThemeModeControl() {
  const { colorMode, toggleColorMode } = useColorMode();
  return (
    <button type="button" onClick={toggleColorMode}>
      {colorMode}
    </button>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('toggles between light and dark mode and persists the selection', async () => {
    render(
      <ThemeProvider>
        <ThemeModeControl />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button')).toHaveTextContent('light');
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('dark');
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(localStorage.getItem('eqms.color-mode')).toBe('dark');
    });
  });

  it('restores the saved color mode on mount', async () => {
    localStorage.setItem('eqms.color-mode', 'dark');

    render(
      <ThemeProvider>
        <ThemeModeControl />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button')).toHaveTextContent('dark');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });
});
