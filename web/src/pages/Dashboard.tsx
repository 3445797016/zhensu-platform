import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, List, Space, Progress, Alert, Spin, Descriptions, Empty, Button, Tooltip, Typography, Badge } from 'antd';
import { RobotOutlined, CloudServerOutlined, ContainerOutlined, ClusterOutlined, ToolOutlined, CheckCircleOutlined, CloseCircleOutlined, SafetyCertificateOutlined, ReloadOutlined, RiseOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { api } from '../api';

function Sparkline({ values, color = '#2f6bff' }: { values: number[]; color?: string }) {
  const safe = values.length ? values : [0];
  const max = Math.max(...safe, 1), min = Math.min(...safe, 0);
  const span = Math.max(max - min, 1);
  const points = safe.map((v, i) => `${(i / Math.max(safe.length - 1, 1)) * 100},${34 - ((v - min) / span) * 28}`).join(' ');
  return <svg viewBox="0 0 100 36" preserveAspectRatio="none" style={{ width: '100%', height: 36, display: 'block' }} aria-label="趋势图">
    <polyline points={points} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="100" cy={34 - ((safe[safe.length - 1] - min) / span) * 28} r="2.4" fill={color} />
  </svg>;
}

export default function Dashboard() {
  const [data, setData] = useState<any>({ loading: true });
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const load = async () => {
    setRefreshing(true);
    const [agents, dstat, hosts, alerts, tools, kov] = await Promise.allSettled([
      api.get('/agents/overview'), api.get('/docker/status'),
      api.get('/hosts'), api.get('/monitor/alerts'),
      api.get('/tools'), api.get('/k8s/ready'),
    ]);
    setData({
      loading: false,
      agents: agents.status === 'fulfilled' ? agents.value : null,
      docker: dstat.status === 'fulfilled' ? dstat.value : { ok: false, error: 'Docker 不可用' },
      hosts: hosts.status === 'fulfilled' ? hosts.value : [],
      alerts: alerts.status === 'fulfilled' ? alerts.value : [],
      toolsDef: tools.status === 'fulfilled' ? tools.value : { tools: [] },
      k8s: kov.status === 'fulfilled' ? kov.value : { ready: false },
    });
    const health = [agents.status === 'fulfilled', dstat.status === 'fulfilled' && dstat.value?.ok, hosts.status === 'fulfilled', kov.status === 'fulfilled' && kov.value?.ready].filter(Boolean).length;
    setHistory((h) => [...h.slice(-23), Math.round((health / 4) * 100)]);
    setLastRefresh(new Date());
    setRefreshing(false);
  };
  useEffect(() => { load(); const t = window.setInterval(load, 15000); return () => window.clearInterval(t); }, []);
  const d = data;
  if (d.loading) return <center style={{ marginTop: 120 }}><Spin size="large" /></center>;

  const toolsTotal = d.toolsDef?.tools?.length || 0;
  const pendingAlerts = d.alerts?.filter?.((a: any) => !a.ack).length || 0;
  const healthItems = [
    { label: 'Agent 服务', ok: !!d.agents, icon: <RobotOutlined /> },
    { label: 'Docker 引擎', ok: !!d.docker?.ok, icon: <ContainerOutlined /> },
    { label: 'Kubernetes', ok: !!d.k8s?.ready, icon: <ClusterOutlined /> },
    { label: '主机采集', ok: Array.isArray(d.hosts), icon: <CloudServerOutlined /> },
  ];
  const healthScore = Math.round((healthItems.filter((x) => x.ok).length / healthItems.length) * 100);
  return (
    <div>
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message="轸宿智汇平台 · 控制台"
        description="管理本地 Agent · 宿主机/VM · Docker · Kubernetes · 中间件 · DevOps · 监控告警，并支持 AI 对话式运维。工具未安装时会给出安装指引，装好即自动纳入管理。" />

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} lg={4}><Card><Statistic title="Agent" value={d.agents?.agents?.length || 0} prefix={<RobotOutlined />} suffix={<Tag color="blue">pi / opencode</Tag>} /></Card></Col>
        <Col xs={12} sm={8} lg={4}><Card><Statistic title="宿主机/VM" value={d.hosts?.length || 0} prefix={<CloudServerOutlined />} /></Card></Col>
        <Col xs={12} sm={8} lg={4}><Card><Statistic title="Docker" value={d.docker?.ok ? '在线' : '离线'} prefix={<ContainerOutlined />} valueStyle={{ color: d.docker?.ok ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
        <Col xs={12} sm={8} lg={4}><Card><Statistic title="Kubernetes" value={d.k8s?.ready ? '就绪' : '未连接'} prefix={<ClusterOutlined />} valueStyle={{ color: d.k8s?.ready ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
        <Col xs={12} sm={8} lg={4}><Card><Statistic title="工具/中间件" value={toolsTotal} prefix={<ToolOutlined />} /></Card></Col>
        <Col xs={12} sm={8} lg={4}><Card><Statistic title="未处理告警" value={pendingAlerts} prefix={<CloseCircleOutlined />} valueStyle={{ color: pendingAlerts ? '#fa8c16' : undefined }} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card size="small" title={<Space><RiseOutlined style={{ color: '#2f6bff' }} />平台健康度</Space>} extra={<Tooltip title={lastRefresh ? `最近刷新 ${lastRefresh.toLocaleTimeString()}` : '载入中'}><Badge status={refreshing ? 'processing' : 'success'} /></Tooltip>}>
            <Row align="middle" gutter={16}>
              <Col span={9}><Progress type="circle" percent={healthScore} strokeColor={healthScore > 74 ? '#52c41a' : healthScore > 49 ? '#faad14' : '#ff4d4f'} /></Col>
              <Col span={15}><Space direction="vertical" size={4} style={{ width: '100%' }}>{healthItems.map((item) => <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Space size={6}>{item.icon}<span>{item.label}</span></Space><Tag color={item.ok ? 'green' : 'red'}>{item.ok ? '正常' : '异常'}</Tag></div>)}</Space></Col>
            </Row>
            <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}><Typography.Text type="secondary" style={{ fontSize: 12 }}>最近 24 次刷新趋势</Typography.Text><Sparkline values={history} color={healthScore > 74 ? '#52c41a' : '#faad14'} /></div>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card size="small" title={<Space><SafetyCertificateOutlined style={{ color: '#722ed1' }} />安全态势快照</Space>} extra={<Button size="small" icon={<ReloadOutlined />} onClick={load} loading={refreshing}>刷新</Button>}>
            <Row gutter={12}>
              <Col span={8}><Statistic title="工具总数" value={toolsTotal} suffix="项" /></Col>
              <Col span={8}><Statistic title="可处理告警" value={pendingAlerts} valueStyle={{ color: pendingAlerts ? '#fa8c16' : '#52c41a' }} /></Col>
              <Col span={8}><Statistic title="纳管主机" value={d.hosts?.length || 0} suffix="台" /></Col>
            </Row>
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}><Tag color="purple">安全工具箱已接入</Tag><Tag color="blue">审计 / 基线</Tag><Tag color="cyan">动态采集 15s</Tag><Tag color={pendingAlerts ? 'orange' : 'green'}>{pendingAlerts ? '存在待处理事件' : '当前无高优先级事件'}</Tag></div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Agent 运行状态" size="small">
            {!d.agents ? <Empty /> : (
              <List size="small" dataSource={d.agents.agents || []}
                renderItem={(a: any) => (
                  <List.Item actions={[<Tag color={a.installed ? 'green' : 'red'}>{a.installed ? '已安装' : '未安装'}</Tag>, <Tag color={a.running > 0 ? 'blue' : 'default'}>{a.running > 0 ? `运行中 ×${a.running}` : '未运行'}</Tag>]}>
                    <List.Item.Meta title={<Space>{a.name}<Tag>{a.version || '-'}</Tag></Space>} description={`会话数 ${a.sessionCount ?? '-'}`} />
                  </List.Item>
                )} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="宿主机/VM" size="small" extra={<Button size="small" onClick={load}>刷新</Button>}>
            {d.hosts?.length === 0 ? <Empty description="尚未添加主机，请到「宿主机 / VM」添加" /> : (
              <List size="small" dataSource={d.hosts || []}
                renderItem={(h: any) => (
                  <List.Item actions={[<Tag color={h.kind === 'local' ? 'gold' : 'geekblue'}>{h.kind === 'local' ? '本机' : 'SSH'}</Tag>]}>
                    <List.Item.Meta title={h.name} description={`${h.kind === 'ssh' ? `${h.user}@${h.host}:${h.port}` : 'local'} ${h.os || ''}`} />
                  </List.Item>
                )} />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Docker 服务" size="small">
            {d.docker?.ok ? (
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="版本">{d.docker.version?.Version}</Descriptions.Item>
                <Descriptions.Item label="存储驱动">{d.docker.info?.Driver}</Descriptions.Item>
                <Descriptions.Item label="镜像数">{d.docker.info?.Images}</Descriptions.Item>
                <Descriptions.Item label="运行容器">{d.docker.info?.ContainersRunning}</Descriptions.Item>
              </Descriptions>
            ) : <Alert type="warning" message={d.docker?.error || 'Docker 不可用'} />}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<Space><ClockCircleOutlined />最新告警</Space>} size="small" extra={<Button size="small" icon={<ReloadOutlined />} onClick={load} loading={refreshing}>刷新</Button>}>
            {d.alerts?.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无告警" /> : (
              <List size="small" dataSource={(d.alerts || []).slice(0, 5)} renderItem={(a: any) => (
                <List.Item><Space><Tag color={a.ack ? 'default' : 'error'}>{a.kind}</Tag><span>{a.hostName}: {a.message}</span></Space></List.Item>
              )} />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
