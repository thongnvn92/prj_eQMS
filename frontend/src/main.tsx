import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { ConfigProvider, App as AntApp } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { store } from './store';
import App from './App';
import 'antd/dist/reset.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ConfigProvider
        locale={viVN}
        theme={{
          token: { colorPrimary: '#225780', borderRadius: 6 },
          components: {
            // Menu trái: mục đang chọn có nền #dfecef, chữ/icon theo màu chủ đạo.
            Menu: {
              itemSelectedBg: '#dfecef',
              itemSelectedColor: '#225780',
              itemHoverBg: '#eef5f6',
            },
          },
        }}
      >
        <AntApp>
          <App />
        </AntApp>
      </ConfigProvider>
    </Provider>
  </React.StrictMode>,
);

