import { useState } from 'react';
import { Layout, Menu, theme, Avatar, Space, Typography, Badge, Tooltip, Button } from 'antd';
import {
  DashboardOutlined, RobotOutlined, CloudServerOutlined, ContainerOutlined,
  ClusterOutlined, ControlOutlined, CodeOutlined, ToolOutlined, MessageOutlined, RocketOutlined,
  MonitorOutlined, BellOutlined, ApiOutlined, DatabaseOutlined, BookOutlined,
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

const { Sider, Header, Content } = Layout;

const MENU = [
  { key: '/', icon: <DashboardOutlined />, label: '总览 Dashboard' },
  { key: '/agents', icon: <RobotOutlined />, label: 'Agent 管理' },
  { key: '/hosts', icon: <CloudServerOutlined />, label: '宿主机 / VM' },
  { key: '/docker', icon: <ContainerOutlined />, label: 'Docker 容器' },
  { key: '/k8s', icon: <ClusterOutlined />, label: 'Kubernetes' },
  { key: '/linux', icon: <ControlOutlined />, label: 'Linux 管理' },
  { key: '/tools', icon: <ToolOutlined />, label: '中间件 / 工具库' },
  { key: '/devops', icon: <RocketOutlined />, label: 'DevOps 流水线' },
  { key: '/code', icon: <CodeOutlined />, label: '在线编程' },
  { key: '/problems', icon: <BookOutlined />, label: '题库刷题' },
  { key: '/kb', icon: <DatabaseOutlined />, label: '知识库 RAG' },
  { key: '/monitoring', icon: <MonitorOutlined />, label: '监控 / 告警' },
  { key: '/ai', icon: <MessageOutlined />, label: 'AI 智能运维' },
];

export default function App() {
  const nav = useNavigate();
  const loc = useLocation();
  const [col, setCol] = useState(false);
  const { token } = theme.useToken();
  const sel = loc.pathname.startsWith('/solve') ? '/problems' : '/' + (loc.pathname.split('/')[1] || '');

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
            <Tooltip title="点击查看 Agent"><Badge status="processing" /><RobotOutlined /></Tooltip>
            <Tooltip title="告警中心"><Badge dot><BellOutlined style={{ fontSize: 16 }} /></Badge></Tooltip>
            <Avatar style={{ background: '#4f8cff' }}>Op</Avatar>
          </Space>
        </Header>
        <Content style={{ margin: 16, padding: 8 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/hosts" element={<Hosts />} />
            <Route path="/docker" element={<Docker />} />
            <Route path="/k8s" element={<K8s />} />
            <Route path="/linux" element={<LinuxManage />} />
            <Route path="/tools" element={<Tools />} />
            <Route path="/devops" element={<DevOps />} />
            <Route path="/monitoring" element={<Monitoring />} />
            <Route path="/code" element={<Code />} />
            <Route path="/problems" element={<ProblemsPage />} />
            <Route path="/solve/:id" element={<SolvePage />} />
            <Route path="/kb" element={<KnowledgeBase />} />
            <Route path="/ai" element={<AIChat />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
