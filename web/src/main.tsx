import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import './styles/global.css';
import './styles/dark.css';
import './monaco-setup';   // 必须在任何 MonacoEditor 渲染前执行(本地加载 monaco)
import App from './App';

function buildTheme(dark: boolean) {
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: '#2f6bff',
      colorInfo: '#2f6bff',
      colorLink: '#2f6bff',
      borderRadius: 10,
      fontSize: 13.5,
      controlHeight: 34,
      fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", Roboto, "Helvetica Neue", sans-serif',
      ...(dark
        ? { colorBgLayout: '#0b0f17', colorBgContainer: '#151a23', colorBgElevated: '#1b2230', colorText: '#e5e9f0', colorTextSecondary: '#8b95a7', colorBorder: '#2a3342', colorBorderSecondary: '#232b38' }
        : { colorBgLayout: '#f4f6fb', colorText: '#1f2937', colorTextSecondary: '#6b7280' }),
    },
    components: {
      Layout: { bodyBg: dark ? '#0b0f17' : '#f4f6fb', headerBg: dark ? '#151a23' : '#ffffff', headerHeight: 56 },
      Card: { headerFontSize: 14, headerHeight: 46, headerHeightSM: 42, bodyPadding: 18, bodyPaddingSM: 14 },
      Table: {
        headerBg: dark ? '#1b2230' : '#f7f9fc',
        headerColor: dark ? '#9aa6b8' : '#475569',
        borderColor: dark ? '#242c3a' : '#eaeef5',
        rowHoverBg: dark ? '#1e2635' : '#f7f9ff',
        cellPaddingBlock: 10, cellPaddingInline: 14, headerSplitColor: 'transparent',
      },
      Button: { controlHeight: 34, fontWeight: 500, primaryShadow: '0 6px 16px -8px rgba(47,107,255,.9)' },
      Input: { activeShadow: '0 0 0 3px rgba(47,107,255,.1)' },
      Select: { optionSelectedBg: dark ? 'rgba(47,107,255,.24)' : 'rgba(47,107,255,.1)' },
      Menu: {
        itemBorderRadius: 9, itemHeight: 38, itemMarginInline: 8, itemMarginBlock: 2,
        itemSelectedBg: dark ? 'rgba(47,107,255,.22)' : 'rgba(47,107,255,.1)',
        itemSelectedColor: dark ? '#8fb4ff' : '#2f6bff',
        itemColor: dark ? '#c3cbd8' : '#4b5563',
        itemHoverBg: dark ? '#1e2635' : '#f4f6fb',
      },
      Tabs: { horizontalItemGutter: 22, titleFontSize: 13.5 },
    },
  } as const;
}

function Root() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('zs-theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('zs-theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  }, [dark]);

  return (
    <ConfigProvider locale={zhCN} theme={buildTheme(dark) as any}>
      <AntApp>
        <BrowserRouter>
          <App dark={dark} onToggleDark={() => setDark((d) => !d)} />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
