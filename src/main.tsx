import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#135dd2',
          colorInfo: '#135dd2',
          colorSuccess: '#0fba81',
          colorText: '#183052',
          colorTextSecondary: '#6b7f9d',
          colorBorder: '#d7e3f5',
          colorBgLayout: '#f1f5fb',
          borderRadius: 8,
          controlHeight: 46,
          fontSize: 16,
          fontFamily:
            "Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', system-ui, sans-serif",
        },
        components: {
          Button: { fontWeight: 650, primaryShadow: '0 4px 12px rgba(21, 75, 184, .24)' },
          Card: { borderRadiusLG: 14 },
          Form: { labelFontSize: 16 },
          Input: { activeShadow: '0 0 0 3px rgba(21, 94, 212, .14)' },
        },
      }}
    >
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);
