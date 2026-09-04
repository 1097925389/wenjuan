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
          colorPrimary: '#145cd1',
          colorInfo: '#145cd1',
          colorSuccess: '#0fba81',
          colorText: '#1a1a2e',
          colorTextSecondary: '#5a6a7e',
          colorBorder: '#dce3ef',
          colorBgLayout: '#f2f5fa',
          borderRadius: 12,
          controlHeight: 46,
          fontSize: 15,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Button: { fontWeight: 600, primaryShadow: '0 6px 20px rgba(20, 92, 209, .4)' },
          Card: { borderRadiusLG: 16 },
          Form: { labelFontSize: 14 },
          Input: { activeShadow: '0 0 0 3px rgba(20, 92, 209, .15)' },
        },
      }}
    >
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);
