import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Tabs, Table, Tag, Space, Button, Select, App, Switch, InputNumber, Form,
  Timeline, Alert, Badge, Row, Col, Divider, Tooltip,
} from 'antd';
import {
  ApiOutlined, CloudServerOutlined, DashboardOutlined, DesktopOutlined, FieldTimeOutlined,
  HddOutlined, LineChartOutlined, ThunderboltOutlined, WarningOutlined,
} from '@ant-design/icons';
import { api } from '../api';
import { Processes } from '../components/HostOps';

export default function Monitoring() {
  return (
    <Tabs defaultActiveKey="host" items={[
      { key: 'host', label: '📊 主机指标', children: <HostMetrics /> },
      { key: 'proc', label: '实时进程 / 线程', children: <ProcessMonitor /> },
      { key: 'alerts', label: '告警中心', children: <Alerts /> },
      { key: 'events', label: '事件流', children: <Events /> },
      { key: 'cfg', label: '监控配置', children: <Config /> },
    ]} />
  );
}

/* ============ 工具函数 ============ */
const levelColor = (v: number) => (v >= 90 ? '#ff4d4f' : v >= 75 ? '#fa8c16' : v >= 60 ? '#faad14' : '#52c41a');
const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
const fmtUptime = (sec: number) => {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}天${h}小时`;
  if (h > 0) return `${h}小时${m}分`;
  return `${m}分${Math.floor(sec % 60)}秒`;
};
const fmtMb = (mb: number) => (mb >= 1024 ? (mb / 1024).toFixed(1) + 'G' : mb + 'M');

/* ============ 动画圆环仪表 ============ */
function Gauge({ value, label, sub, size = 128, thickness = 11, warnHint }: any) {
  const id = useMemo(() => 'g' + Math.random().toString(36).slice(2, 8), []);
  const v = clamp(Number.isFinite(value) ? value : 0);
  const r = (size - thickness) / 2 - 4;
  const C = 2 * Math.PI * r;
  const color = levelColor(v);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <defs>
            <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity={0.55} />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f4" strokeWidth={thickness} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={thickness}
            strokeLinecap="round" strokeDasharray={C}
            strokeDashoffset={C * (1 - v / 100)}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.25,.8,.25,1)' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: size / 5.2, fontWeight: 700, color, lineHeight: 1 }}>{Math.round(v)}<span style={{ fontSize: size / 9, color: '#888', fontWeight: 500 }}>%</span></span>
          {sub && <span style={{ fontSize: 10.5, color: '#8a94a6', marginTop: 1 }}>{sub}</span>}
        </div>
      </div>
      <span style={{ fontSize: 13, color: '#3a4356', fontWeight: 600 }}>{label}</span>
      {warnHint && <span style={{ fontSize: 10, color: color }}><WarningOutlined /> 超阈值</span>}
    </div>
  );
}

/* ============ 实时趋势(迷你面积图) ============ */
function Trend({ title, unit, data, color, height = 66 }: any) {
  const id = useMemo(() => 't' + Math.random().toString(36).slice(2, 8), []);
  const pts = (data || []).filter((n: any) => Number.isFinite(n));
  const W = 120, H = 40, pad = 3;
  const cur = pts.length ? pts[pts.length - 1] : 0;
  const peak = pts.length ? Math.max(...pts) : 0;
  const lo = Math.max(0, Math.min(...pts) - 4);
  const hi = Math.min(100, Math.max(...pts, 8) + 2);
  const span = Math.max(1, hi - lo);
  const px = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, pts.length - 1);
  const py = (v: number) => H - pad - ((v - lo) / span) * (H - pad * 2);
  const line = pts.map((v: number, i: number) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const area = line ? `${pad},${H} ${line} ${(W - pad)},${H}` : '';
  const grid = [0, 0.5, 1].map((f) => H - f * (H - pad * 2) - pad).map((y) => y.toFixed(1));
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <Space size={4}><ThunderboltOutlined style={{ color, fontSize: 11 }} /><span style={{ fontSize: 12, color: '#5b6472', fontWeight: 600 }}>{title}</span></Space>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{Number.isFinite(cur) ? Math.round(cur) : '—'}{unit}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {grid.map((y, i) => <line key={i} x1={pad} x2={W - pad} y1={y} y2={y} stroke="#eef1f5" strokeDasharray={i === 0 ? '' : '2 3'} strokeWidth={i === 0 ? 0.6 : 0.5} />)}
          {area && <polygon points={area} fill={`url(#${id})`} />}
          {line && <polyline points={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 2px ${color}55)` }} />}
          {pts.length > 0 && <circle cx={px(pts.length - 1)} cy={py(cur)} r={2.4} fill="#fff" stroke={color} strokeWidth={1.8} className="zs-live-dot" />}
        </svg>
        <span style={{ position: 'absolute', right: 0, bottom: 0, fontSize: 9.5, color: '#b4bcc9', background: 'rgba(255,255,255,.85)', padding: '0 3px', borderRadius: 3 }}>
          峰值 {Math.round(peak)}% · {pts.length} 样本
        </span>
      </div>
    </div>
  );
}

/* ============ 主机指标(动态可视化) ============ */
function HostMetrics() {
  const [hosts, setHosts] = useState<any[]>([]);
  const [sel, setSel] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(true);
  const [thresholds, setThresholds] = useState<any>({ cpu: 90, mem: 90, disk: 80 });
  const hist = useRef<Record<string, any>>({});
  const histRef = hist;

  const resetHist = () => { histRef.current = {}; };
  const cfgLoad = () => api.get('/monitor/config').then((c) => { setSel(c.monitoredHostIds || []); setThresholds(c.thresholds || {}); });
  useEffect(() => { api.get('/hosts').then(setHosts); cfgLoad(); }, []);

  const collect = async () => {
    setLoading(true);
    try {
      const r = await api.get('/monitor/collect');
      setMetrics(r);
      r.forEach((m: any) => {
        if (m.error) return;
        const h = histRef.current[m.hostId] || { cpu: [], mem: [], disk: [] };
        h.cpu.push(Number(m.cpuPercent) || 0); h.mem.push(Number(m.memPct) || 0); h.disk.push(Number(m.diskMaxPct) || 0);
        for (const k of ['cpu', 'mem', 'disk']) if (h[k].length > 48) h[k].shift();
        histRef.current[m.hostId] = h;
      });
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { if (sel.length) collect(); }, [sel.length]);
  useEffect(() => { if (!live) return; const t = setInterval(collect, 5000); return () => clearInterval(t); }, [live]);

  const selNames: Record<string, string> = {};
  hosts.forEach((h) => { selNames[h.id] = h.name; });

  const colorFor = (v: number, warn: number) => (v >= warn ? '#ff4d4f' : levelColor(v));

  return (
    <div>
      <style>{`
        @keyframes zsPulse { 0%,100% { opacity: 1 } 50% { opacity: .2 } }
        .zs-live-dot { animation: zsPulse 1.6s ease-in-out infinite; }
        .zs-card-hover { transition: box-shadow .25s ease, transform .25s ease; }
        .zs-card-hover:hover { box-shadow: 0 8px 22px rgba(31,45,70,.10); transform: translateY(-2px); }
      `}</style>
      <Card size="small" style={{ marginBottom: 14 }}
        title={<Space><DashboardOutlined style={{ color: '#1677ff' }} /><b>主机实时指标</b>
          {live && metrics.length > 0 && <Badge status="processing" text={<span style={{ color: '#52c41a' }}>每 5 秒自动采集 · 数据动态刷新</span>} />}
          {!live && <Tag>采集已暂停</Tag>}
        </Space>}
        extra={<Space wrap>
          <Select mode="multiple" style={{ minWidth: 320 }} value={sel} options={hosts.map((h) => ({ value: h.id, label: h.name }))} placeholder="选择要监控的主机"
            onChange={async (v) => { setSel(v); resetHist(); const c = await api.get('/monitor/config'); await api.put('/monitor/config', { ...c, monitoredHostIds: v }); if (v.length) collect(); }} />
          <Switch checkedChildren="实时" unCheckedChildren="暂停" checked={live} onChange={setLive} />
          <Button icon={<FieldTimeOutlined />} loading={loading} onClick={collect}>立即采集</Button>
        </Space>}>
        {sel.length === 0 ? (
          <Alert type="info" showIcon icon={<CloudServerOutlined />} message="尚未选择监控主机。选择主机后每 5 秒自动采集,超过阈值自动告警(可到「监控配置」调整 CPU/内存/磁盘阈值)。" />
        ) : metrics.length === 0 && loading ? <div style={{ textAlign: 'center', padding: 40 }}><Badge status="processing" text="正在采集主机指标…" /></div> : (
          <Row gutter={[16, 16]}>
            {metrics.map((m: any) => {
              const hc = m.hostId || m.hostName;
              const th = thresholds || {};
              const warnCpu = m.cpuPercent > th.cpu; const warnMem = m.memPct > th.mem; const warnDisk = m.diskMaxPct > th.disk;
              const t = histRef.current[hc] || { cpu: [], mem: [], disk: [] };
              const swapShow = Number(m.swapTotalMb) > 0;
              const mounts = m.disk || [];
              return (
                <Col span={24} key={hc}>
                  <Card size="small" className="zs-card-hover" style={{ borderTop: '3px solid ' + (m.error ? '#ff4d4f' : (warnCpu || warnMem || warnDisk ? '#faad14' : '#52c41a')) }}>
                    {/* 行1：主机信息 + 圆环仪表 */}
                    <Row gutter={16} align="middle">
                      <Col xs={24} lg={9}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <Space size={6}>
                            <Badge status={m.error ? 'error' : 'success'} />
                            <b style={{ fontSize: 16 }}>{m.hostName || '未知主机'}</b>
                            {m.error ? <Tag color="red">采集异常</Tag> :
                              (warnCpu || warnMem || warnDisk ? <Tag color="orange">有超阈值指标</Tag> : <Tag color="green">运行正常</Tag>)}
                          </Space>
                          <Space wrap size={6}>
                            <Tag icon={<DesktopOutlined />} color="geekblue">{m.os || '—'}</Tag>
                            <Tag>内核 {m.kernel || '—'}</Tag>
                            <Tag icon={<FieldTimeOutlined />}>已运行 {fmtUptime(Number(m.uptimeSec) || 0)}</Tag>
                            <Tag color="blue">采集 {m.time ? new Date(m.time).toLocaleTimeString() : '—'}</Tag>
                          </Space>
                          <Space wrap size={8} style={{ fontSize: 12 }}>
                            <Tooltip title="系统平均负载 1/5/15 分钟">
                              <span><ThunderboltOutlined style={{ color: '#fa8c16' }} /> 负载 <b>{m.load1 ?? 0} / {m.load5 ?? 0} / {m.load15 ?? 0}</b></span>
                            </Tooltip>
                            <Tooltip title="进程数 / 线程数">
                              <span><ApiOutlined style={{ color: '#1677ff' }} /> 进程 <b>{m.processes ?? 0}</b> / 线程 <b>{m.threads ?? 0}</b></span>
                            </Tooltip>
                            <Tooltip title="TCP 已建立连接 / 监听端口">
                              <span><LineChartOutlined style={{ color: '#722ed1' }} /> 连接 <b>{m.connectionsEstablished ?? 0}</b> · 监听 <b>{m.listeningPorts ?? 0}</b></span>
                            </Tooltip>
                          </Space>
                        </div>
                      </Col>
                      <Col xs={24} lg={15}>
                        <Row gutter={[8, 8]} justify={m.error ? 'start' : 'center'} style={{ flexWrap: 'wrap' }}>
                          <Col><Gauge value={m.cpuPercent} label="CPU 使用率" sub="实时" warnHint={warnCpu} /></Col>
                          <Col><Gauge value={m.memPct} label="内存使用率" sub={m.memTotalMb ? `${fmtMb(m.memUsedMb)} / ${fmtMb(m.memTotalMb)}` : ''} warnHint={warnMem} /></Col>
                          <Col><Gauge value={m.diskMaxPct} label="磁盘使用率" sub={mounts.find((x: any) => x.pct === m.diskMaxPct)?.mount || ''} warnHint={warnDisk} /></Col>
                          {swapShow && <Col><Gauge value={m.swapPct} label="交换分区" sub="swap" /></Col>}
                        </Row>
                      </Col>
                    </Row>
                    <Divider style={{ margin: '12px 0' }} />
                    {/* 行2：实时趋势 */}
                    <div style={{ marginBottom: 4, color: '#5b6472', fontWeight: 600, fontSize: 12.5 }}><LineChartOutlined /> 近 48 次采样趋势(自动滚动)</div>
                    <Row gutter={[18, 12]}>
                      <Col xs={24} sm={8}><Trend title="CPU" unit="%" data={t.cpu} color={levelColor(t.cpu[t.cpu.length - 1] ?? 0)} /></Col>
                      <Col xs={24} sm={8}><Trend title="内存" unit="%" data={t.mem} color={colorFor(t.mem[t.mem.length - 1] ?? 0, th.mem)} /></Col>
                      <Col xs={24} sm={8}><Trend title="磁盘" unit="%" data={t.disk} color={colorFor(t.disk[t.disk.length - 1] ?? 0, th.disk)} /></Col>
                    </Row>
                    {/* 行3：磁盘挂载详情 */}
                    {mounts.length > 0 && (
                      <>
                        <Divider style={{ margin: '10px 0' }} />
                        <div style={{ fontSize: 12.5, color: '#5b6472', fontWeight: 600, marginBottom: 6 }}><HddOutlined /> 磁盘挂载点</div>
                        <Row gutter={[12, 4]}>
                          {mounts.map((d: any, i: number) => (
                            <Col xs={24} md={12} xl={mounts.length > 4 ? 6 : 8} key={i}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Tooltip title={`${d.used} / ${d.size}`}><span style={{ width: 110, fontSize: 11.5, fontFamily: 'monospace', color: '#4a5465', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.mount}</span></Tooltip>
                                <div style={{ flex: 1, height: 7, background: '#eef0f4', borderRadius: 4, overflow: 'hidden' }}>
                                  <div style={{ width: `${clamp(d.pct)}%`, height: '100%', background: levelColor(d.pct), borderRadius: 4, transition: 'width 1s cubic-bezier(.25,.8,.25,1)' }} />
                                </div>
                                <span style={{ width: 34, textAlign: 'right', fontSize: 11, color: '#5b6472' }}>{d.pct}%</span>
                              </div>
                            </Col>
                          ))}
                        </Row>
                      </>
                    )}
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Card>
    </div>
  );
}

/* ============ 实时进程 / 线程(复用原实现) ============ */
function ProcessMonitor() {
  const [hosts, setHosts] = useState<any[]>([]);
  const [sel, setSel] = useState('local');
  const [refreshKey, setRefreshKey] = useState(0);
  const { message } = App.useApp();
  useEffect(() => { (async () => { const h = await api.get('/hosts'); setHosts(h.length ? h : [{ id: 'local', name: '本机(Linux)' }]); })(); }, []);
  return (
    <Card size="small" title="实时进程（含线程数，点开展线程；每 3 秒自动刷新，可暂停）" extra={
      <Space>
        <Select value={sel} onChange={setSel} style={{ width: 200 }} options={hosts.map((h) => ({ value: h.id, label: h.name }))} />
        <Button onClick={() => setRefreshKey((k) => k + 1)}>刷新</Button>
      </Space>
    }>
      <Processes hostId={sel} refreshKey={refreshKey} message={message} />
    </Card>
  );
}

/* ============ 告警中心(保持不变) ============ */
function Alerts() {
  const [list, setList] = useState<any[]>([]);
  const load = () => api.get('/monitor/alerts').then(setList);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);
  const unack = list.filter((a) => !a.ack);
  const cols = [
    { title: '级别', render: (_: any, r: any) => <Tag color={r.ack ? 'default' : 'error'}>{r.ack ? '已确认' : '未处理'}</Tag> },
    { title: '类型', dataIndex: 'kind', render: (k: string) => <Tag color="volcano">{k}</Tag> },
    { title: '主机', dataIndex: 'hostName' },
    { title: '内容', dataIndex: 'message' },
    { title: '时间', dataIndex: 'time', render: (t: string) => new Date(t).toLocaleString() },
    { title: '操作', render: (_: any, r: any) => !r.ack && <Button size="small" onClick={async () => { await api.post('/monitor/alerts/ack', { id: r.id }); load(); }}>确认</Button> },
  ];
  return <Card size="small" title={`告警列表（未处理 ${unack.length}）`}>
    {unack.length > 0 && <Alert type="warning" style={{ marginBottom: 12 }} showIcon message={`当前 ${unack.length} 条告警待处理`} />}
    <Table rowKey="id" dataSource={list} columns={cols} size="middle" pagination={false} />
  </Card>;
}

/* ============ 事件流(保持不变) ============ */
function Events() {
  const [list, setList] = useState<any[]>([]);
  const load = () => api.get('/monitor/events', { type: 'all' }).then(setList);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);
  const color: any = { cpu: 'red', memory: 'orange', disk: 'red' };
  return <Card size="small" title="最近事件流">
    {list.length === 0 ? <Alert type="info" showIcon message="暂无事件" /> : <Timeline items={list.map((e: any) => ({ color: color[e.type] || 'blue', children: <div><Space><Tag color={color[e.type] || 'blue'}>{e.type}</Tag><b>{new Date(e.time).toLocaleString()}</b></Space><div>{JSON.stringify(e.data)}</div></div> }))} />}
  </Card>;
}

/* ============ 监控配置(保持不变) ============ */
function Config() {
  const [cfg, setCfg] = useState<any>(null);
  const [form] = Form.useForm();
  useEffect(() => { api.get('/monitor/config').then((c) => { setCfg(c); form.setFieldsValue(c.thresholds); }); }, []);
  const save = async (v: any) => { const c = await api.get('/monitor/config'); await api.put('/monitor/config', { ...c, thresholds: v }); setCfg({ ...c, thresholds: v }); };
  return <Card size="small" title="监控阈值配置">
    <Form form={form} layout="inline" onFinish={save} initialValues={{ cpu: 90, mem: 90, disk: 80 }}>
      <Form.Item label="CPU 阈值%" name="cpu"><InputNumber min={1} max={100} /></Form.Item>
      <Form.Item label="内存阈值%" name="mem"><InputNumber min={1} max={100} /></Form.Item>
      <Form.Item label="磁盘阈值%" name="disk"><InputNumber min={1} max={100} /></Form.Item>
      <Form.Item><Button type="primary" htmlType="submit">保存</Button></Form.Item>
    </Form>
  </Card>;
}
