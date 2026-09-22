import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import './styles/global.css';
import './monaco-setup';   // 必须在任何 MonacoEditor 渲染前执行(本地加载 monaco)
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#2f6bff',
          colorInfo: '#2f6bff',
          colorLink: '#2f6bff',
          colorBgLayout: '#f4f6fb',
          colorText: '#1f2937',
          colorTextSecondary: '#6b7280',
          borderRadius: 10,
          fontSize: 13.5,
          controlHeight: 34,
          fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", Roboto, "Helvetica Neue", sans-serif',
        },
        components: {
          Layout: { bodyBg: '#f4f6fb', headerBg: '#ffffff', headerHeight: 56 },
          Card: { headerFontSize: 14, headerHeight: 46, headerHeightSM: 42, bodyPadding: 18, bodyPaddingSM: 14 },
          Table: {
            headerBg: '#f7f9fc', headerColor: '#475569', borderColor: '#eaeef5',
            rowHoverBg: '#f7f9ff', cellPaddingBlock: 10, cellPaddingInline: 14,
            headerSplitColor: 'transparent',
          },
          Button: { controlHeight: 34, fontWeight: 500, primaryShadow: '0 6px 16px -8px rgba(47,107,255,.9)' },
          Input: { activeShadow: '0 0 0 3px rgba(47,107,255,.1)' },
          Select: { optionSelectedBg: 'rgba(47,107,255,.1)' },
          Menu: {
            itemBorderRadius: 9, itemHeight: 38, itemMarginInline: 8, itemMarginBlock: 2,
            itemSelectedBg: 'rgba(47,107,255,.1)', itemSelectedColor: '#2f6bff',
            itemColor: '#4b5563', itemHoverBg: '#f4f6fb',
          },
          Tabs: { horizontalItemGutter: 22, titleFontSize: 13.5 },
        },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
