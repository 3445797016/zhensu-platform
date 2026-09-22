import { Component, useEffect, useState } from 'react';
import { Layout, Menu, theme, Avatar, Space, Typography, Badge, Tooltip, Button, Result, Spin, Input, Card, Alert } from 'antd';
import {
  DashboardOutlined, RobotOutlined, CloudServerOutlined, ContainerOutlined,
  ClusterOutlined, ControlOutlined, CodeOutlined, ToolOutlined, MessageOutlined, RocketOutlined,
  MonitorOutlined, BellOutlined, ApiOutlined, DatabaseOutlined, BookOutlined, SafetyCertificateOutlined,
  FolderOpenOutlined, HistoryOutlined, GlobalOutlined, FireOutlined, CloudDownloadOutlined, FileSearchOutlined, FileTextOutlined,
  LockOutlined, UserOutlined, NodeIndexOutlined, ThunderboltOutlined, BulbOutlined, BulbFilled, PictureOutlined,
} from '@ant-design/icons';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';
import Hosts from './pages/Hosts';
import Docker from './pages/Docker';
import K8s from './pages/K8s';
import LinuxManage from './pages/LinuxManage';
import Tools from './pages/Tools';
import AIChat from './pages/AIChat';
import DevOps from './pages/DevOps';
import Monitoring from './pages/Monitoring';
import KnowledgeBase from './pages/KnowledgeBase';
import Code from './pages/Code';
import ProblemsPage from './pages/ProblemsPage';
import SolvePage from './pages/Solve';
import SecurityPage from './pages/SecurityPage';
import FilesPage from './pages/FilesPage';
import TaskCenter from './pages/TaskCenter';
import VPN from './pages/VPN';
import MinIO from './pages/MinIO';
import NetTools from './pages/NetTools';
import Tunnels from './pages/Tunnels';
import Notebook from './pages/Notebook';
import ReportPage from './pages/ReportPage';
import Websites from './pages/Websites';
import Firewall from './pages/Firewall';
import BackupCenter from './pages/BackupCenter';
import WebLogs from './pages/WebLogs';
import SystemCenter from './pages/SystemCenter';
import DatabaseCenter from './pages/DatabaseCenter';
// PentAGI 集成（可迁移模块，见 web/src/pentagi/README.md）
import PentagiPage from './pentagi/PentagiPage';
import HeaderTools from './components/AccountCenter';
import AppearancePanel from './components/AppearancePanel';
import { useAppearance, WallpaperLayer } from './appearance';

const { Sider, Header, Content } = Layout;

// 登录页(启用登录保护后展示)
function LoginScreen({ onOk }: { onOk: () => void }) {
  const [user, setUser] = useState('root');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const doLogin = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pwd }) });
      const j = await r.json();
      if (r.ok) onOk(); else setErr(j?.error || '登录失败');
    } catch (e: any) { setErr(String(e?.message || e)); }
    setBusy(false);
  };
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#eef2ff,#f9f0ff)' }}>
      <Card style={{ width: 400 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div style={{ textAlign: 'center' }}><ApiOutlined style={{ fontSize: 30, color: '#4f8cff' }} /><div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>轸宿智汇平台</div><div style={{ color: '#999', fontSize: 13 }}>智能运维 · Agent 管理 · DevOps</div></div>
          <Alert type="warning" showIcon message="已启用登录保护,请输入管理员账号口令" />
          {err && <Alert type="error" showIcon message={err} />}
          <Input prefix={<UserOutlined />} placeholder="管理员账号(root)" value={user} onChange={(e) => setUser(e.target.value)}
            onPressEnter={() => { if (!busy) doLogin(); }} />
          <Input.Password prefix={<LockOutlined />} placeholder="管理员密码" value={pwd} onChange={(e) => setPwd(e.target.value)}
            onPressEnter={() => { if (!busy) doLogin(); }} />
          <Button type="primary" block loading={busy} onClick={doLogin}>登 录</Button>
          <div style={{ textAlign: 'center' }}><Typography.Text type="secondary" style={{ fontSize: 12 }}>会话有效期 24 小时 · 同一账号多点登录</Typography.Text></div>
        </Space>
      </Card>
    </div>
  );
}

// 全局错误边界:页面运行时异常时给出提示,而不是白屏
class ErrBoundary extends Component<any, { err: any }> {
  state = { err: null };
  static getDerivedStateFromError(err: any) { return { err }; }
  render() {
    if (this.state.err) {
      return <Result status="error" title="页面出现异常(非白屏提示)" subTitle={String(this.state.err?.message || this.state.err)}
        extra={<Button type="primary" onClick={() => { this.setState({ err: null }); }}>重试</Button>} />;
    }
    return this.props.children;
  }
}

interface MenuEntry { key: string; icon: JSX.Element; label: string; desc: string; group: string; }
const MENU: MenuEntry[] = [
  { key: '/', icon: <DashboardOutlined />, label: '总览 Dashboard', desc: '平台资源态势、健康度与实时告警一屏总览', group: '总览' },

  { key: '/hosts', icon: <CloudServerOutlined />, label: '宿主机 / VM', desc: '纳管物理机与虚拟机, 查看指标、执行命令', group: '基础设施' },
  { key: '/docker', icon: <ContainerOutlined />, label: 'Docker 容器', desc: '容器 / 镜像 / 网络 / 卷的全生命周期管理', group: '基础设施' },
  { key: '/k8s', icon: <ClusterOutlined />, label: 'Kubernetes', desc: '集群节点、命名空间、工作负载与 Pod 观测', group: '基础设施' },
  { key: '/linux', icon: <ControlOutlined />, label: 'Linux 管理', desc: '服务、进程、用户、磁盘与系统参数管理', group: '基础设施' },
  { key: '/monitoring', icon: <MonitorOutlined />, label: '监控 / 告警', desc: '主机指标采集、历史趋势与告警规则', group: '基础设施' },
  { key: '/net', icon: <ApiOutlined />, label: '网络工具箱', desc: 'DNS、连通性、路由、HTTP、证书与子网工具', group: '基础设施' },
  { key: '/tunnels', icon: <NodeIndexOutlined />, label: '端口转发', desc: '本地/远程端口转发隧道管理', group: '基础设施' },

  { key: '/tools', icon: <ToolOutlined />, label: '中间件 / 工具库', desc: '常用中间件模板探测与一键部署', group: '应用与数据' },
  { key: '/database', icon: <DatabaseOutlined />, label: '数据库中心', desc: 'MySQL / Redis / MongoDB 等实例管理与查询', group: '应用与数据' },
  { key: '/websites', icon: <GlobalOutlined />, label: '网站管理', desc: '站点配置、Nginx 与证书管理', group: '应用与数据' },
  { key: '/minio', icon: <DatabaseOutlined />, label: 'MinIO 存储', desc: '对象存储桶与文件管理', group: '应用与数据' },
  { key: '/files', icon: <FolderOpenOutlined />, label: '文件管理', desc: '远程文件浏览、上传、下载与编辑', group: '应用与数据' },
  { key: '/backup', icon: <CloudDownloadOutlined />, label: '备份中心', desc: '目录归档备份、下载与还原', group: '应用与数据' },
  { key: '/kb', icon: <DatabaseOutlined />, label: '知识库 RAG', desc: '本地文档索引与检索增强问答', group: '应用与数据' },

  { key: '/sec', icon: <SafetyCertificateOutlined />, label: '网络安全', desc: '资产测绘、漏洞扫描与安全靶场', group: '安全' },
  { key: '/pentagi', icon: <ThunderboltOutlined />, label: 'AI 渗透 (PentAGI)', desc: 'AI 自动化渗透测试任务编排', group: '安全' },
  { key: '/firewall', icon: <FireOutlined />, label: '防火墙', desc: 'iptables / ufw 规则查看与下发', group: '安全' },
  { key: '/vpn', icon: <NodeIndexOutlined />, label: 'VPN 代理', desc: 'VPN / 代理节点连通性与配置', group: '安全' },
  { key: '/weblog', icon: <FileSearchOutlined />, label: '访问日志', desc: 'Nginx/Apache 日志聚合分析', group: '安全' },

  { key: '/devops', icon: <RocketOutlined />, label: 'DevOps 流水线', desc: 'CI/CD 流水线、构建与部署编排', group: '自动化与交付' },
  { key: '/tasks', icon: <HistoryOutlined />, label: '任务中心', desc: '异步任务执行历史与结果查看', group: '自动化与交付' },
  { key: '/report', icon: <FileTextOutlined />, label: '📋 巡检报告', desc: '一键生成/推送系统巡检报告', group: '自动化与交付' },

  { key: '/ai', icon: <MessageOutlined />, label: 'AI 智能运维', desc: '大模型对话式运维与工具调用', group: '开发与 AI' },
  { key: '/agents', icon: <RobotOutlined />, label: 'Agent 管理', desc: 'Pi / OpenCode 等编码 Agent 状态', group: '开发与 AI' },
  { key: '/code', icon: <CodeOutlined />, label: '在线编程', desc: '浏览器内多语言代码编辑与运行', group: '开发与 AI' },
  { key: '/notebook', icon: <CodeOutlined />, label: 'Notebook', desc: '交互式脚本与数据分析', group: '开发与 AI' },
  { key: '/problems', icon: <BookOutlined />, label: '题库刷题', desc: '算法题库与力扣式解题', group: '开发与 AI' },

  { key: '/system', icon: <ApiOutlined />, label: '系统设置', desc: '审计日志、API 密钥与通知渠道', group: '系统' },
];
const MENU_GROUPS = ['总览', '基础设施', '应用与数据', '安全', '自动化与交付', '开发与 AI', '系统'];

// 各分区横幅配色
const GROUP_GRADIENT: Record<string, string> = {
  '总览': 'linear-gradient(120deg, #0d1730 0%, #1e3a8a 52%, #4c1d95 100%)',
  '基础设施': 'linear-gradient(120deg, #06172e 0%, #0e4b8a 50%, #0f766e 100%)',
  '应用与数据': 'linear-gradient(120deg, #1e1b4b 0%, #4338ca 52%, #7c3aed 100%)',
  '安全': 'linear-gradient(120deg, #2a0a12 0%, #9f1239 52%, #b91c1c 100%)',
  '自动化与交付': 'linear-gradient(120deg, #0c1a2b 0%, #0e7490 52%, #0891b2 100%)',
  '开发与 AI': 'linear-gradient(120deg, #101a3d 0%, #2447b8 52%, #6d28d9 100%)',
  '系统': 'linear-gradient(120deg, #1f2937 0%, #374151 52%, #4b5563 100%)',
};

// 这些路由自带 Hero / 需要全屏工作区, 不注入统一横幅
const HIDE_BANNER = new Set(['/', '/net', '/pentagi', '/code', '/notebook', '/ai']);

// 自动页面横幅: 让每条路由都有一致的分区品牌感
function PageBanner({ entry }: { entry: MenuEntry }) {
  return (
    <div className="ui-banner" style={{ background: GROUP_GRADIENT[entry.group] }}>
      <div className="ui-banner-inner">
        <Space align="center" size={14}>
          <span className="ui-banner-icon">{entry.icon}</span>
          <div>
            <div className="ui-banner-title">{entry.label}</div>
            <div className="ui-banner-desc">{entry.desc}</div>
          </div>
          <span className="ui-banner-chip" style={{ marginLeft: 10 }}>{entry.group}</span>
        </Space>
      </div>
    </div>
  );
}

export default function App() {
  const { dark, setDark } = useAppearance();
  const nav = useNavigate();
  const loc = useLocation();
  const [col, setCol] = useState(false);
  const [appOpen, setAppOpen] = useState(false);
  const { token } = theme.useToken();
  const sel = loc.pathname.startsWith('/solve') ? '/problems' : '/' + (loc.pathname.split('/')[1] || '');
  const current = MENU.find((m) => m.key === sel) || MENU[0];

  // 登录保护探测
  const [auth, setAuth] = useState<'loading' | 'open' | 'ok' | 'need'>('loading');
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => {
        if (r.status === 401) { setAuth('need'); return; }
        return r.json().then((j: any) => setAuth(j && j.open !== false ? 'open' : 'ok')).catch(() => setAuth('open'));
      })
      .catch(() => setAuth('open'));
  }, []);
  if (auth === 'loading') return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" tip="载入中" /></div>;
  if (auth === 'need') return <LoginScreen onOk={() => window.location.reload()} />;

  const groupedItems = MENU_GROUPS.map((g) => ({
    type: 'group' as const,
    label: g,
    children: MENU.filter((m) => m.group === g).map((m) => ({ key: m.key, icon: m.icon, label: m.label })),
  })).filter((g) => g.children.length);

  return (
    <>
      <WallpaperLayer />
      <AppearancePanel open={appOpen} onClose={() => setAppOpen(false)} />
      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider collapsible collapsed={col} onCollapse={setCol} width={228} theme={dark ? 'dark' : 'light'}
        style={{ borderRight: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgContainer, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: token.colorText, fontWeight: 700, fontSize: col ? 14 : 17, letterSpacing: 1, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          {!col && <><span style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,#2f6bff,#7c3aed)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}><ApiOutlined /></span> 轸宿智汇</>}
          {col && <span style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,#2f6bff,#7c3aed)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}><ApiOutlined /></span>}
        </div>
        <Menu theme={dark ? 'dark' : 'light'} mode="inline" selectedKeys={[sel]} items={groupedItems as any}
          style={{ borderInlineEnd: 'none', paddingBlock: 6 }}
          onClick={(e) => nav(e.key)} />
      </Sider>
      <Layout style={{ overflow: 'hidden' }}>
        <Header style={{ background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 22, height: 56, flexShrink: 0 }}>
          <Space align="center" style={{ gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(47,107,255,.1)', color: token.colorPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{current.icon}</span>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{current.label}</div>
              <div style={{ fontSize: 11.5, color: '#98a2b3' }}>{current.group} · 轸宿智汇平台</div>
            </div>
          </Space>
          <Space>
            <Tooltip title="外观 / 壁纸">
              <Button type="text" icon={<PictureOutlined />} onClick={() => setAppOpen(true)} />
            </Tooltip>
            <Tooltip title={dark ? '切换到浅色模式' : '切换到深色模式'}>
              <Button type="text" icon={dark ? <BulbFilled /> : <BulbOutlined />} onClick={() => setDark(!dark)} />
            </Tooltip>
            <Tooltip title="在线编程"><Button type="link" icon={<CodeOutlined />} onClick={() => nav('/code')}>在线编程</Button></Tooltip>
            <HeaderTools />
          </Space>
        </Header>
        <Content style={{ margin: 14, padding: 6, overflowY: 'auto', overflowX: 'hidden', height: '100%' }}>
          <div className="app-content-inner">
            {!HIDE_BANNER.has(sel) && <PageBanner entry={current} />}
            <ErrBoundary>
              <div key={loc.pathname} className="page-enter">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/agents" element={<Agents />} />
                  <Route path="/hosts" element={<Hosts />} />
                  <Route path="/docker" element={<Docker />} />
                  <Route path="/k8s" element={<K8s />} />
                  <Route path="/linux" element={<LinuxManage />} />
                  <Route path="/tools" element={<Tools />} />
                  <Route path="/database" element={<DatabaseCenter />} />
                  <Route path="/sec" element={<SecurityPage />} />
                  <Route path="/pentagi" element={<PentagiPage />} />
                  <Route path="/files" element={<FilesPage />} />
                  <Route path="/websites" element={<Websites />} />
                  <Route path="/firewall" element={<Firewall />} />
                  <Route path="/backup" element={<BackupCenter />} />
                  <Route path="/weblog" element={<WebLogs />} />
                  <Route path="/vpn" element={<VPN />} />
                  <Route path="/minio" element={<MinIO />} />
                  <Route path="/net" element={<NetTools />} />
                  <Route path="/tunnels" element={<Tunnels />} />
                  <Route path="/notebook" element={<Notebook />} />
                  <Route path="/tasks" element={<TaskCenter />} />
                  <Route path="/report" element={<ReportPage />} />
                  <Route path="/devops" element={<DevOps />} />
                  <Route path="/monitoring" element={<Monitoring />} />
                  <Route path="/code" element={<Code />} />
                  <Route path="/problems" element={<ProblemsPage />} />
                  <Route path="/solve/:id" element={<SolvePage />} />
                  <Route path="/kb" element={<KnowledgeBase />} />
                  <Route path="/ai" element={<AIChat />} />
                  <Route path="/system" element={<SystemCenter />} />
                </Routes>
              </div>
            </ErrBoundary>
          </div>
        </Content>
      </Layout>
    </Layout>
    </>
  );
}
