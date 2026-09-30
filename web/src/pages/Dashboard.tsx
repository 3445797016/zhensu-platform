import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Row, Col, Tag, Space, Progress, Alert, Spin, Empty, Button, Tooltip,
  Typography, Badge, List,
} from 'antd';
import {
  RobotOutlined, CloudServerOutlined, ContainerOutlined, ClusterOutlined,
  ToolOutlined, CheckCircleOutlined, CloseCircleOutlined, SafetyCertificateOutlined,
  ReloadOutlined, RiseOutlined, ClockCircleOutlined, BellOutlined,
  ExclamationCircleOutlined, ThunderboltOutlined, MonitorOutlined, HistoryOutlined,
  DatabaseOutlined, RocketOutlined, CodeOutlined, ApartmentOutlined, HddOutlined,
  ArrowRightOutlined, NodeIndexOutlined, FileTextOutlined, DashboardOutlined,
} from '@ant-design/icons';
import { api } from '../api';
import './dashboard.css';

const { Text, Title } = Typography;

/* ────────────── 迷你趋势线 ────────────── */
function Sparkline({ values, color = '#2f6bff' }: { values: number[]; color?: string }) {
  const safe = values.length ? values : [0];
  const max = Math.max(...safe, 1), min = Math.min(...safe, 0);
  const span = Math.max(max - min, 1);
  const y = (v: number) => 34 - ((v - min) / span) * 28;
  const points = safe.map((v, i) => `${(i / Math.max(safe.length - 1, 1)) * 100},${y(v)}`).join(' ');
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" style={{ width: '100%', height: 36, display: 'block' }} aria-label="趋势图">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,36 ${points} 100,36`} fill="url(#sparkFill)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="100" cy={y(safe[safe.length - 1])} r="2.6" fill={color} />
    </svg>
  );
}

/* ────────────── 实时时钟（隔离重渲染）────────────── */
function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return (
    <div style={{ textAlign: 'right' }}>
      <div className="dash-clock">{hh}:{mm}<span style={{ fontSize: 16, opacity: .7 }}>:{ss}</span></div>
      <div style={{ opacity: .8, fontSize: 12.5, marginTop: 4 }}>
        {now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
      </div>
    </div>
  );
}

/* ────────────── 区块标题 ────────────── */
function DashTitle({ icon, text, extra }: { icon?: any; text: string; extra?: any }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <span className="dash-title"><span className="dash-title-bar" />{icon}{text}</span>
      {extra}
    </div>
  );
}

/* ────────────── KPI 卡 ────────────── */
function KpiCard({ icon, color, label, value, suffix, sub, progress, onClick }: {
  icon: any; color: string; label: string; value: any; suffix?: string; sub?: string; progress?: number; onClick?: () => void;
}) {
  return (
    <Card className="dash-kpi dash-fade" onClick={onClick} styles={{ body: { padding: '16px 16px 14px' } }} style={{ ['--kpi' as any]: color }}>
      <Space align="center" size={13}>
        <div className="dash-kpi-icon" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <div className="dash-kpi-label">{label}</div>
          <div className="dash-kpi-value">{value}<span style={{ fontSize: 13, fontWeight: 500, color: '#8c8c8c', marginLeft: 3 }}>{suffix}</span></div>
        </div>
      </Space>
      {sub && <div className="dash-kpi-sub">{sub}</div>}
      {progress !== undefined && <Progress percent={progress} showInfo={false} size="small" strokeColor={color} style={{ marginTop: 6, marginBottom: -6 }} />}
    </Card>
  );
}

/* ────────────── 主页面 ────────────── */
export default function Dashboard() {
  const nav = useNavigate();
  const [data, setData] = useState<any>({ loading: true });
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  const load = async () => {
    setRefreshing(true);
    const patch = (obj: any) => setData((s: any) => ({ ...s, ...obj, loading: false }));
    // 每个接口先到先渲染，避免被慢接口（如 k8s/summary）阻塞
    const withPatch = (p: Promise<any>, key: string, fb: any) =>
      p.then((v) => { patch({ [key]: v }); return v; }).catch(() => { patch({ [key]: fb }); return fb; });

    const [agents, docker, hosts, alerts] = await Promise.all([
      withPatch(api.get('/agents/overview'), 'agents', null),
      withPatch(api.get('/docker/status'), 'docker', { ok: false, error: 'Docker 不可用' }),
      withPatch(api.get('/hosts'), 'hosts', []),
      withPatch(api.get('/monitor/alerts'), 'alerts', []),
    ]);
    // 其余面板不阻塞首屏
    withPatch(api.get('/tools'), 'toolsDef', { tools: [] });
    withPatch(api.get('/k8s/ready'), 'k8s', { ready: false });
    withPatch(api.get('/k8s/summary'), 'k8sSummary', []);
    withPatch(api.get('/tasks'), 'tasks', { tasks: [] });
    withPatch(api.get('/audit'), 'audit', { list: [] });
    withPatch(api.get('/seclab/summary'), 'seclab', null);
    withPatch(api.get('/report/list'), 'reports', []);

    const ok = [!!agents, !!docker?.ok, Array.isArray(hosts), alerts.length >= 0].filter(Boolean).length;
    setHistory((h) => [...h.slice(-23), Math.round((ok / 4) * 100)]);
    setLastRefresh(new Date());
    setRefreshing(false);
  };

  useEffect(() => { load(); const t = window.setInterval(load, 20000); return () => window.clearInterval(t); }, []);

  const d = data;
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 6 ? '凌晨好' : h < 9 ? '早上好' : h < 12 ? '上午好' : h < 14 ? '中午好' : h < 18 ? '下午好' : h < 22 ? '晚上好' : '夜深了';
  }, []);

  const healthItems = useMemo(() => ([
    { label: 'Agent 服务', ok: !!d.agents, icon: <RobotOutlined /> },
    { label: 'Docker 引擎', ok: !!d.docker?.ok, icon: <ContainerOutlined /> },
    { label: 'Kubernetes', ok: !!d.k8s?.ready, icon: <ClusterOutlined /> },
    { label: '主机采集', ok: Array.isArray(d.hosts), icon: <CloudServerOutlined /> },
  ]), [d]);

  const healthScore = Math.round((healthItems.filter((x) => x.ok).length / healthItems.length) * 100);
  const toolsTotal = d.toolsDef?.tools?.length || 0;
  const pendingAlerts = (d.alerts || []).filter((a: any) => !a.ack).length;

  // 告警去重（同一 类型+主机+数值 只保留最新，统计重复次数）
  const alertGroups = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of d.alerts || []) {
      const key = `${a.kind}|${a.hostId}|${a.value}`;
      const cur = map.get(key);
      if (!cur) map.set(key, { ...a, count: 1 });
      else cur.count += 1;
    }
    return [...map.values()].sort((x, y) => new Date(y.time).getTime() - new Date(x.time).getTime());
  }, [d.alerts]);

  // Docker 统计
  const dinfo = d.docker?.info || {};
  const dockerR = dinfo.ContainersRunning || 0, dockerS = dinfo.ContainersStopped || 0;
  const dockerP = dinfo.ContainersPaused || 0, dockerT = dinfo.Containers || (dockerR + dockerS + dockerP) || 0;
  const pct = (n: number) => (dockerT ? (n / dockerT) * 100 : 0);

  // K8s 统计
  const ksum = d.k8sSummary || [];
  const kPods = ksum.reduce((n: number, x: any) => n + (x.pods || 0), 0);
  const kRunning = ksum.reduce((n: number, x: any) => n + (x.runningPods || 0), 0);
  const kMaxNs = Math.max(1, ...ksum.map((x: any) => x.pods || 0));

  const tasks: any[] = d.tasks?.tasks || [];
  const audits: any[] = d.audit?.list || [];
  const reports: any[] = d.reports || [];
  const seclab = d.seclab || { total: 0, scanned: 0, vulnerable: 0, openPorts: 0 };

  if (d.loading) return <div style={{ textAlign: 'center', marginTop: 140 }}><Spin size="large" tip="正在加载平台概览…"><div /></Spin></div>;

  const QUICK_LINKS = [
    { key: '/sec', label: '网络安全', desc: '扫描 · 基线 · 审计', icon: <SafetyCertificateOutlined />, color: '#722ed1' },
    { key: '/pentagi', label: 'AI 渗透', desc: '自主渗透 · 报告', icon: <ThunderboltOutlined />, color: '#2f6bff' },
    { key: '/docker', label: 'Docker', desc: '容器 · 镜像', icon: <ContainerOutlined />, color: '#13c2c2' },
    { key: '/hosts', label: '宿主机', desc: '指标 · 进程', icon: <CloudServerOutlined />, color: '#fa8c16' },
    { key: '/monitoring', label: '监控告警', desc: '趋势 · 阈值', icon: <MonitorOutlined />, color: '#eb2f96' },
    { key: '/tasks', label: '任务中心', desc: '执行记录', icon: <HistoryOutlined />, color: '#52c41a' },
    { key: '/kb', label: '知识库', desc: 'RAG 检索', icon: <DatabaseOutlined />, color: '#2f54eb' },
    { key: '/devops', label: 'DevOps', desc: '流水线 · 构建', icon: <RocketOutlined />, color: '#fa541c' },
  ];

  const sevColor: Record<string, string> = { disk: '#fa8c16', cpu: '#f5222d', mem: '#eb2f96', net: '#13c2c2', service: '#722ed1' };

  return (
    <div className="dash-fade">
      {/* ── Hero ── */}
      <div className="dash-hero">
        <div className="dash-hero-inner">
          <Row align="middle" gutter={16}>
            <Col flex="auto">
              <Space align="center" size={14}>
                <div style={{ width: 46, height: 46, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.26)' }}>
                  <DashboardOutlined />
                </div>
                <div>
                  <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: .3 }}>{greeting}，欢迎回到轸宿智汇平台</div>
                  <div style={{ opacity: .82, fontSize: 13, marginTop: 3 }}>智能运维 · Agent 管理 · 安全评估 · DevOps 一体化</div>
                </div>
              </Space>
            </Col>
            <Col>
              <Space align="center" size={16}>
                <Clock />
                <Button className="dash-hero-btn" icon={<ReloadOutlined />} onClick={load} loading={refreshing}>刷新</Button>
              </Space>
            </Col>
          </Row>
          <Space size={8} wrap style={{ marginTop: 16 }}>
            <span className="dash-chip">
              <Badge status={healthScore >= 75 ? 'success' : healthScore >= 50 ? 'warning' : 'error'} />
              健康度 {healthScore}%
            </span>
            <span className="dash-chip"><CloudServerOutlined /> 纳管主机 {d.hosts?.length || 0}</span>
            <span className="dash-chip"><ContainerOutlined /> 容器 {dockerR}/{dockerT}</span>
            <span className="dash-chip"><ApartmentOutlined /> Pod {kRunning}/{kPods}</span>
            <span className="dash-chip" style={pendingAlerts ? { background: 'rgba(250,140,22,.28)', borderColor: 'rgba(250,173,20,.6)' } : undefined}>
              <BellOutlined /> 未处理告警 {pendingAlerts}
            </span>
            {lastRefresh && <span className="dash-chip"><ClockCircleOutlined /> 更新于 {lastRefresh.toLocaleTimeString('zh-CN', { hour12: false })}</span>}
          </Space>
        </div>
      </div>

      {/* ── KPI 行 ── */}
      <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
        <Col xs={12} sm={8} lg={4}>
          <KpiCard icon={<RobotOutlined />} color="#2f6bff" label="Agent" value={d.agents?.agents?.length || 0}
            sub={`运行中 ${(d.agents?.agents || []).reduce((n: number, a: any) => n + (a.running || 0), 0)} · ${(d.agents?.agents || []).filter((a: any) => a.installed).length} 已装`}
            onClick={() => nav('/agents')} />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <KpiCard icon={<CloudServerOutlined />} color="#fa8c16" label="宿主机 / VM" value={d.hosts?.length || 0}
            sub={`本机 ${(d.hosts || []).filter((h: any) => h.kind === 'local').length} · SSH ${(d.hosts || []).filter((h: any) => h.kind === 'ssh').length}`}
            onClick={() => nav('/hosts')} />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <KpiCard icon={<ContainerOutlined />} color="#13c2c2" label="Docker 容器" value={`${dockerR}/${dockerT}`} progress={pct(dockerR)}
            sub={`运行 ${dockerR} · 停止 ${dockerS} · 镜像 ${dinfo.Images || 0}`}
            onClick={() => nav('/docker')} />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <KpiCard icon={<ClusterOutlined />} color="#2f54eb" label="Kubernetes" value={d.k8s?.ready ? `${kRunning}/${kPods}` : '未连接'}
            progress={kPods ? (kRunning / kPods) * 100 : undefined}
            sub={d.k8s?.ready ? `命名空间 ${ksum.length} · Pod ${kPods}` : 'kubeconfig 未就绪'}
            onClick={() => nav('/k8s')} />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <KpiCard icon={<SafetyCertificateOutlined />} color="#722ed1" label="安全扫描目标" value={`${seclab.scanned || 0}/${seclab.total || 0}`}
            progress={seclab.total ? (seclab.scanned / seclab.total) * 100 : undefined}
            sub={seclab.vulnerable ? `发现漏洞 ${seclab.vulnerable}` : '暂无确认漏洞'}
            onClick={() => nav('/sec')} />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <KpiCard icon={<BellOutlined />} color={pendingAlerts ? '#f5222d' : '#52c41a'} label="未处理告警" value={pendingAlerts}
            sub={pendingAlerts ? `${alertGroups.length} 类进行中` : '当前无告警'}
            onClick={() => nav('/monitoring')} />
        </Col>
      </Row>

      {/* ── 健康度 + 资源态势 ── */}
      <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
        <Col xs={24} lg={9}>
          <Card size="small" style={{ height: '100%' }}
            title={<DashTitle icon={<RiseOutlined style={{ color: '#2f6bff' }} />} text="平台健康度"
              extra={<Tooltip title={lastRefresh ? `最近刷新 ${lastRefresh.toLocaleTimeString()}` : '载入中'}><Badge status={refreshing ? 'processing' : 'success'} /></Tooltip>} />} >
            <Row align="middle" gutter={16}>
              <Col span={9}>
                <Progress type="circle" percent={healthScore} size={116}
                  strokeColor={{ '0%': healthScore > 74 ? '#52c41a' : '#faad14', '100%': healthScore > 74 ? '#95de64' : '#ffc53d' }}
                  format={(p) => <span style={{ fontSize: 22, fontWeight: 800 }}>{p}<span style={{ fontSize: 12 }}>%</span></span>} />
              </Col>
              <Col span={15}>
                <Space direction="vertical" size={7} style={{ width: '100%' }}>
                  {healthItems.map((item) => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Space size={6}>{item.icon}<span style={{ fontSize: 13 }}>{item.label}</span></Space>
                      <Tag color={item.ok ? 'green' : 'red'} style={{ marginRight: 0 }}>{item.ok ? '正常' : '异常'}</Tag>
                    </div>
                  ))}
                </Space>
              </Col>
            </Row>
            <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>最近 24 次刷新趋势</Text>
              <Sparkline values={history} color={healthScore > 74 ? '#52c41a' : '#faad14'} />
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={15}>
          <Card size="small" style={{ height: '100%' }}
            title={<DashTitle icon={<ApartmentOutlined style={{ color: '#13c2c2' }} />} text="资源态势"
              extra={<Text type="secondary" style={{ fontSize: 12 }}>实时采集</Text>} />} >
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Docker 容器分布</Text>
                <div className="dash-stack" style={{ marginTop: 8 }}>
                  <span style={{ width: `${pct(dockerR)}%`, background: 'linear-gradient(90deg,#52c41a,#95de64)' }} />
                  <span style={{ width: `${pct(dockerP)}%`, background: '#faad14' }} />
                  <span style={{ width: `${pct(dockerS)}%`, background: '#d9d9d9' }} />
                </div>
                <div className="dash-legend">
                  <span className="dash-legend-item"><span className="dash-legend-dot" style={{ background: '#52c41a' }} />运行 {dockerR}</span>
                  <span className="dash-legend-item"><span className="dash-legend-dot" style={{ background: '#faad14' }} />暂停 {dockerP}</span>
                  <span className="dash-legend-item"><span className="dash-legend-dot" style={{ background: '#d9d9d9' }} />停止 {dockerS}</span>
                </div>
                {d.docker?.ok ? (
                  <div style={{ marginTop: 10 }}>
                    <Space size={14} wrap>
                      <Text style={{ fontSize: 12 }}><Text type="secondary">版本</Text> {dinfo.ServerVersion || dinfo.Version || '-'}</Text>
                      <Text style={{ fontSize: 12 }}><Text type="secondary">驱动</Text> {dinfo.Driver || '-'}</Text>
                    </Space>
                  </div>
                ) : <Alert style={{ marginTop: 10 }} type="warning" showIcon message={d.docker?.error || 'Docker 不可用'} />}
              </Col>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Kubernetes Pod（按命名空间）</Text>
                <div style={{ marginTop: 10 }}>
                  {ksum.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无命名空间数据" /> : ksum.map((x: any) => (
                    <div className="dash-ns-row" key={x.ns}>
                      <span className="dash-ns-name" title={x.ns}>{x.ns}</span>
                      <div className="dash-ns-bar"><i style={{ width: `${((x.pods || 0) / kMaxNs) * 100}%` }} /></div>
                      <Text type="secondary" style={{ fontSize: 12, width: 46, textAlign: 'right' }}>{x.runningPods}/{x.pods}</Text>
                    </div>
                  ))}
                </div>
              </Col>
            </Row>
            <div style={{ marginTop: 10, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
              <Space size={8} wrap>
                <Tag color="purple" icon={<ToolOutlined />}>工具/中间件 {toolsTotal}</Tag>
                <Tag color="geekblue">纳管主机 {d.hosts?.length || 0}</Tag>
                <Tag color={pendingAlerts ? 'orange' : 'green'}>{pendingAlerts ? `待处理告警 ${pendingAlerts}` : '无高优先级事件'}</Tag>
                <Tag color="cyan">动态采集 20s</Tag>
              </Space>
            </div>
          </Card>
        </Col>
      </Row>

      {/* ── 告警 + 活动 ── */}
      <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
        <Col xs={24} lg={13}>
          <Card size="small" style={{ height: '100%' }}
            title={<DashTitle icon={<BellOutlined style={{ color: pendingAlerts ? '#f5222d' : '#52c41a' }} />}
              text={`进行中告警（${alertGroups.length} 类 / ${pendingAlerts} 条）`}
              extra={<Button size="small" type="link" onClick={() => nav('/monitoring')}>查看全部 <ArrowRightOutlined /></Button>} />} >
            {alertGroups.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无告警，一切正常" />
            ) : (
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                {alertGroups.slice(0, 6).map((a: any) => (
                  <div className="dash-alert-item" key={a.id || `${a.kind}-${a.hostId}`}>
                    <div className="dash-alert-kind" style={{ background: `${sevColor[a.kind] || '#8c8c8c'}1a`, color: sevColor[a.kind] || '#8c8c8c' }}>
                      {a.kind === 'disk' ? <HddOutlined /> : <ExclamationCircleOutlined />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Space size={6} wrap>
                        <Tag color={a.ack ? 'default' : 'error'} style={{ marginRight: 0 }}>{a.kind}</Tag>
                        <Text strong style={{ fontSize: 13 }}>{a.hostName}</Text>
                        {a.count > 1 && <Tag bordered={false}>×{a.count}</Tag>}
                      </Space>
                      <div><Text type="secondary" style={{ fontSize: 12 }}>{a.message}</Text></div>
                    </div>
                    <Tag color={a.ack ? 'default' : 'orange'} style={{ marginRight: 0 }}>{a.ack ? '已确认' : '待处理'}</Tag>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={11}>
          <Card size="small" style={{ height: '100%' }}
            title={<DashTitle icon={<HistoryOutlined style={{ color: '#2f6bff' }} />} text="最近活动"
              extra={<Button size="small" type="link" onClick={() => nav('/system')}>审计日志 <ArrowRightOutlined /></Button>} />} >
            {audits.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无活动记录" /> : (
              <Space direction="vertical" size={0} style={{ width: '100%' }}>
                {audits.slice(0, 7).map((a: any) => (
                  <div className="dash-act-item" key={a.id}>
                    <span className="dash-act-dot" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Space size={6} wrap>
                        <Tag color="blue" style={{ marginRight: 0 }}>{a.action}</Tag>
                        <Text className="dash-ns-name" style={{ width: 'auto', maxWidth: 200 }}>{a.target}</Text>
                        {a.detail && <Text type="secondary" style={{ fontSize: 12 }}>{String(a.detail).slice(0, 30)}</Text>}
                      </Space>
                      <div><Text type="secondary" style={{ fontSize: 12 }}>{a.time ? new Date(a.time).toLocaleString('zh-CN', { hour12: false }) : ''}</Text></div>
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── 任务 + 报告 ── */}
      <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
        <Col xs={24} lg={12}>
          <Card size="small" style={{ height: '100%' }}
            title={<DashTitle icon={<HistoryOutlined style={{ color: '#52c41a' }} />} text="最近任务"
              extra={<Button size="small" type="link" onClick={() => nav('/tasks')}>任务中心 <ArrowRightOutlined /></Button>} />} >
            {tasks.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" /> : (
              <List size="small" dataSource={tasks.slice(0, 5)} renderItem={(t: any) => (
                <List.Item>
                  <List.Item.Meta
                    title={<Space size={6}><Tag color={t.status === 'ok' ? 'green' : t.status === 'failed' ? 'red' : 'blue'} style={{ marginRight: 0 }}>{t.type}</Tag><Text>{t.title}</Text></Space>}
                    description={<Text type="secondary" style={{ fontSize: 12 }}>{t.host} · {t.created ? new Date(t.created).toLocaleString('zh-CN', { hour12: false }) : ''}</Text>}
                  />
                </List.Item>
              )} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" style={{ height: '100%' }}
            title={<DashTitle icon={<FileTextOutlined style={{ color: '#722ed1' }} />} text="巡检报告"
              extra={<Button size="small" type="link" onClick={() => nav('/report')}>全部报告 <ArrowRightOutlined /></Button>} />} >
            {reports.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无巡检报告" /> : (
              <List size="small" dataSource={reports.slice(0, 4)} renderItem={(r: any) => (
                <List.Item>
                  <List.Item.Meta
                    title={<Text>{r.title}</Text>}
                    description={<Text type="secondary" style={{ fontSize: 12 }}>{(r.summary || []).join(' · ') || (r.generated ? new Date(r.generated).toLocaleString('zh-CN', { hour12: false }) : '')}</Text>}
                  />
                </List.Item>
              )} />
            )}
          </Card>
        </Col>
      </Row>

      {/* ── 快捷入口 ── */}
      <Card size="small" style={{ marginTop: 14 }}
        title={<DashTitle icon={<CodeOutlined style={{ color: '#2f6bff' }} />} text="快捷入口" />}>
        <Row gutter={[12, 12]}>
          {QUICK_LINKS.map((l) => (
            <Col xs={12} sm={8} md={6} lg={3} key={l.key}>
              <div className="dash-link" onClick={() => nav(l.key)}>
                <div className="dash-link-icon" style={{ background: l.color }}>{l.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{l.label}</div>
                  <div style={{ fontSize: 11.5, color: '#8c8c8c' }}>{l.desc}</div>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
}
