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
          colorPrimary: '#1683c7',
          colorInfo: '#1683c7',
          colorSuccess: '#0fba81',
          colorText: '#1d3448',
          colorTextSecondary: '#647687',
          colorBorder: '#d7e1e9',
          borderRadius: 8,
          controlHeight: 46,
          fontSize: 16,
          fontFamily:
            "Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', system-ui, sans-serif",
        },
        components: {
          Button: { fontWeight: 650, primaryShadow: '0 4px 10px rgba(14, 116, 181, .16)' },
          Card: { borderRadiusLG: 14 },
          Form: { labelFontSize: 16 },
          Input: { activeShadow: '0 0 0 3px rgba(14,165,233,.12)' },
        },
      }}
    >
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);
