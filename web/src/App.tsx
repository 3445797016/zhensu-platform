import { Component, useEffect, useState } from 'react';
import { Layout, Menu, theme, Avatar, Space, Typography, Badge, Tooltip, Button, Result, Spin, Input, Card, Alert } from 'antd';
import {
  DashboardOutlined, RobotOutlined, CloudServerOutlined, ContainerOutlined,
  ClusterOutlined, ControlOutlined, CodeOutlined, ToolOutlined, MessageOutlined, RocketOutlined,
  MonitorOutlined, BellOutlined, ApiOutlined, DatabaseOutlined, BookOutlined, SafetyCertificateOutlined,
  FolderOpenOutlined, HistoryOutlined, GlobalOutlined, FireOutlined, CloudDownloadOutlined, FileSearchOutlined, FileTextOutlined,
  LockOutlined, UserOutlined,
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
import ReportPage from './pages/ReportPage';
import Websites from './pages/Websites';
import Firewall from './pages/Firewall';
import BackupCenter from './pages/BackupCenter';
import WebLogs from './pages/WebLogs';
import SystemCenter from './pages/SystemCenter';
import DatabaseCenter from './pages/DatabaseCenter';
import HeaderTools from './components/AccountCenter';

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

const MENU: any[] = [
  { key: '/', icon: <DashboardOutlined />, label: '总览 Dashboard' },
  { key: '/agents', icon: <RobotOutlined />, label: 'Agent 管理' },
  { key: '/hosts', icon: <CloudServerOutlined />, label: '宿主机 / VM' },
  { key: '/docker', icon: <ContainerOutlined />, label: 'Docker 容器' },
  { key: '/k8s', icon: <ClusterOutlined />, label: 'Kubernetes' },
  { key: '/linux', icon: <ControlOutlined />, label: 'Linux 管理' },
  { key: '/tools', icon: <ToolOutlined />, label: '中间件 / 工具库' },
  { key: '/database', icon: <DatabaseOutlined />, label: '数据库中心' },
  { key: '/sec', icon: <SafetyCertificateOutlined />, label: '网络安全' },
  { key: '/files', icon: <FolderOpenOutlined />, label: '文件管理' },
  { key: '/websites', icon: <GlobalOutlined />, label: '网站管理' },
  { key: '/firewall', icon: <FireOutlined />, label: '防火墙' },
  { key: '/backup', icon: <CloudDownloadOutlined />, label: '备份中心' },
  { key: '/weblog', icon: <FileSearchOutlined />, label: '访问日志' },
  { key: '/tasks', icon: <HistoryOutlined />, label: '任务中心' },
  { key: '/report', icon: <FileTextOutlined />, label: '📋 巡检报告' },
  { key: '/devops', icon: <RocketOutlined />, label: 'DevOps 流水线' },
  { key: '/code', icon: <CodeOutlined />, label: '在线编程' },
  { key: '/problems', icon: <BookOutlined />, label: '题库刷题' },
  { key: '/kb', icon: <DatabaseOutlined />, label: '知识库 RAG' },
  { key: '/monitoring', icon: <MonitorOutlined />, label: '监控 / 告警' },
  { key: '/ai', icon: <MessageOutlined />, label: 'AI 智能运维' },
  { key: '/system', icon: <ApiOutlined />, label: '系统(审计/API/登录)' },
];

export default function App() {
  const nav = useNavigate();
  const loc = useLocation();
  const [col, setCol] = useState(false);
  const { token } = theme.useToken();
  const sel = loc.pathname.startsWith('/solve') ? '/problems' : '/' + (loc.pathname.split('/')[1] || '');

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


  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={col} onCollapse={setCol} width={220} theme="light"
        style={{ borderRight: `1px solid ${token.colorBorderSecondary}`, background: '#fff' }}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: token.colorText, fontWeight: 700, fontSize: col ? 14 : 17, letterSpacing: 1 }}>
          {!col && <><ApiOutlined style={{ color: token.colorPrimary }} /> 轸宿智汇</>}
          {col && <ApiOutlined style={{ color: token.colorPrimary }} />}
        </div>
        <Menu theme="light" mode="inline" selectedKeys={[sel]} items={MENU.map(m => ({
          key: m.key, icon: m.icon, label: m.badge ? <Space size={6}>{m.label}<Badge count="NEW" style={{ backgroundColor: '#fa8c16' }} /></Space> : m.label
        }))} onClick={(e) => nav(e.key)} />
      </Sider>
      <Layout>
        <Header style={{ background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 24, height: 56 }}>
          <Space align="baseline" style={{ gap: 10 }}>
            <Typography.Text strong style={{ fontSize: 17 }}>轸宿智汇平台</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>智能运维与 Agent 管理中心</Typography.Text>
          </Space>
          <Space>
            <Tooltip title="在线编程"><Button type="link" icon={<CodeOutlined />} onClick={() => nav('/code')}>在线编程</Button></Tooltip>
            <HeaderTools />
          </Space>
        </Header>
        <Content style={{ margin: 16, padding: 8 }}>
          <ErrBoundary>
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
            <Route path="/files" element={<FilesPage />} />
            <Route path="/websites" element={<Websites />} />
            <Route path="/firewall" element={<Firewall />} />
            <Route path="/backup" element={<BackupCenter />} />
            <Route path="/weblog" element={<WebLogs />} />
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
          </ErrBoundary>
        </Content>
      </Layout>
    </Layout>
  );
}
