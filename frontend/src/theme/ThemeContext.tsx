import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd';
import viVN from 'antd/locale/vi_VN';

type ColorMode = 'light' | 'dark';

interface ThemeContextValue {
  colorMode: ColorMode;
  toggleColorMode: () => void;
}

const THEME_STORAGE_KEY = 'eqms.color-mode';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function loadColorMode(): ColorMode {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorMode, setColorMode] = useState<ColorMode>(loadColorMode);

  useEffect(() => {
    document.documentElement.dataset.theme = colorMode;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, colorMode);
    } catch {
      // Theme remains active for the current page even when storage is unavailable.
    }
  }, [colorMode]);

  const toggleColorMode = () => {
    setColorMode((current) => current === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ colorMode, toggleColorMode }}>
      <ConfigProvider
        locale={viVN}
        theme={{
          algorithm: colorMode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: '#225780',
            borderRadius: 6,
            ...(colorMode === 'dark' ? { colorPrimary: '#5b9bd5' } : {}),
          },
          components: {
            Menu: colorMode === 'dark'
              ? {
                  itemSelectedBg: '#1f3a50',
                  itemSelectedColor: '#91caff',
                  itemHoverBg: '#1f2933',
                }
              : {
                  itemSelectedBg: '#dfecef',
                  itemSelectedColor: '#225780',
                  itemHoverBg: '#eef5f6',
                },
          },
        }}
      >
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useColorMode(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useColorMode must be used within ThemeProvider');
  return context;
}
