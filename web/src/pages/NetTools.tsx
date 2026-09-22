import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, Drawer, Input, InputNumber, Progress, Row, Segmented,
  Select, Space, Spin, Switch, Table, Tag, Tooltip, Typography, message,
} from 'antd';
import {
  ApiOutlined, CalculatorOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
  CodeOutlined, CopyOutlined, DeploymentUnitOutlined, DownloadOutlined,
  ExperimentOutlined, FileSearchOutlined, GlobalOutlined, HistoryOutlined, LinkOutlined,
  NodeIndexOutlined, PartitionOutlined, RadarChartOutlined, ReloadOutlined, SafetyCertificateOutlined,
  SendOutlined, SwapOutlined, ThunderboltOutlined, WifiOutlined,
} from '@ant-design/icons';
import { api } from '../api';
import './net-tools.css';

const { Text } = Typography;

/* ═══════════════════════════════ 类型与工具定义 ═══════════════════════════════ */
type FieldType = 'text' | 'number' | 'select' | 'switch' | 'textarea';
interface Field {
  key: string; label: string; type: FieldType; placeholder?: string;
  options?: { label: string; value: any }[]; width?: number; min?: number; max?: number; rows?: number;
  default?: any; showIf?: (p: any) => boolean; tip?: string;
}
interface ToolDef {
  key: string; name: string; short: string; desc: string; group: string;
  icon: React.ReactNode; bin?: string; fields: Field[];
  run: (p: any) => Promise<any>;
}
const GROUPS = ['DNS 解析', '连通性', '路由追踪', 'HTTP 调试', '安全证书', '网络工具'];
const GROUP_COLOR: Record<string, string> = {
  'DNS 解析': '#2f6bff', '连通性': '#16a34a', '路由追踪': '#7c3aed',
  'HTTP 调试': '#ea580c', '安全证书': '#dc2626', '网络工具': '#0891b2',
};
const DNS_OPTS = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'SRV', 'CAA', 'PTR', 'ANY'].map((v) => ({ label: v, value: v }));
const reqMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

const TOOLS: ToolDef[] = [
  {
    key: 'dns', name: 'DNS 查询', short: 'dig 记录解析', group: 'DNS 解析', icon: <GlobalOutlined />, bin: 'dig',
    desc: '查询 A/AAAA/MX/NS/TXT 等记录, 支持指定 DNS 服务器、TCP、DNSSEC',
    fields: [
      { key: 'domain', label: '域名', type: 'text', placeholder: 'example.com', width: 230, default: '' },
      { key: 'type', label: '记录类型', type: 'select', options: DNS_OPTS, width: 110, default: 'A' },
      { key: 'server', label: 'DNS 服务器', type: 'text', placeholder: '留空=系统', width: 150, default: '' },
      { key: 'short', label: '精简输出', type: 'switch', default: false },
      { key: 'tcp', label: 'TCP 查询', type: 'switch', default: false },
      { key: 'dnssec', label: 'DNSSEC', type: 'switch', default: false },
      { key: 'authority', label: '含 Authority', type: 'switch', default: false },
    ],
    run: (p) => api.post('/net/dns', p),
  },
  {
    key: 'dns-propagation', name: 'DNS 传播检测', short: '多解析器对比', group: 'DNS 解析', icon: <RadarChartOutlined />, bin: 'dig',
    desc: '并发查询 7 个公共 DNS, 对比解析结果是否一致, 判断解析生效/传播情况',
    fields: [
      { key: 'domain', label: '域名', type: 'text', placeholder: 'example.com', width: 250, default: '' },
      { key: 'type', label: '记录类型', type: 'select', options: DNS_OPTS, width: 120, default: 'A' },
    ],
    run: (p) => api.post('/net/dns-propagation', p),
  },
  {
    key: 'reverse', name: '反向解析', short: 'IP → 域名 PTR', group: 'DNS 解析', icon: <SwapOutlined />, bin: 'dig',
    desc: '通过 PTR 记录把 IP 反查为主机名',
    fields: [{ key: 'ip', label: 'IP 地址', type: 'text', placeholder: '8.8.8.8', width: 230, default: '' }],
    run: (p) => api.post('/net/reverse', p),
  },
  {
    key: 'nslookup', name: 'nslookup', short: '经典域名查询', group: 'DNS 解析', icon: <FileSearchOutlined />, bin: 'nslookup',
    desc: '经典 nslookup 输出, 便于与 dig 结果对照',
    fields: [
      { key: 'domain', label: '域名', type: 'text', placeholder: 'example.com', width: 230, default: '' },
      { key: 'server', label: 'DNS 服务器', type: 'text', placeholder: '留空=系统', width: 150, default: '' },
    ],
    run: (p) => api.post('/net/nslookup', p),
  },

  {
    key: 'ping', name: 'Ping 探测', short: 'ICMP 连通与时延', group: '连通性', icon: <ThunderboltOutlined />, bin: 'ping',
    desc: '发送 ICMP 探测, 统计丢包率、最小/平均/最大时延并绘制每包时延',
    fields: [
      { key: 'host', label: '目标', type: 'text', placeholder: 'IP 或域名', width: 230, default: '' },
      { key: 'count', label: '次数', type: 'number', min: 1, max: 50, width: 90, default: 4 },
      { key: 'size', label: '包大小', type: 'number', min: 8, max: 65500, width: 100, default: 56 },
      { key: 'interval', label: '间隔(秒)', type: 'number', min: 1, max: 5, width: 100, default: 1 },
      { key: 'numeric', label: '只显示 IP', type: 'switch', default: true },
    ],
    run: (p) => api.post('/net/ping', p),
  },
  {
    key: 'tcp-ping', name: 'TCP 连接探测', short: '端口握手时延', group: '连通性', icon: <DeploymentUnitOutlined />,
    desc: '对指定 host:port 反复发起 TCP 握手, 绕过 ICMP 封锁, 统计连通率与时延',
    fields: [
      { key: 'host', label: '目标', type: 'text', placeholder: 'IP 或域名', width: 230, default: '' },
      { key: 'port', label: '端口', type: 'number', min: 1, max: 65535, width: 110, default: 443 },
      { key: 'count', label: '次数', type: 'number', min: 1, max: 20, width: 90, default: 4 },
      { key: 'timeout', label: '超时(ms)', type: 'number', min: 200, max: 10000, width: 120, default: 2000 },
    ],
    run: (p) => api.post('/net/tcp-ping', p),
  },
  {
    key: 'port-scan', name: '端口扫描', short: 'nmap / 内置扫描', group: '连通性', icon: <PartitionOutlined />,
    desc: '探测目标开放端口与服务。优先使用 nmap, 也可强制使用内置 TCP 扫描(无需依赖)',
    fields: [
      { key: 'host', label: '目标', type: 'text', placeholder: 'IP 或域名', width: 230, default: '' },
      { key: 'mode', label: '模式', type: 'select', width: 130, default: 'top', options: [{ label: 'Top 端口', value: 'top' }, { label: '自定义端口', value: 'custom' }] },
      { key: 'topPorts', label: 'Top 数量', type: 'select', width: 120, default: 100, options: [20, 100, 1000, 5000].map((v) => ({ label: String(v), value: v })), showIf: (p) => p.mode !== 'custom' },
      { key: 'ports', label: '端口列表', type: 'text', placeholder: '22,80,443 或 1-1000', width: 220, default: '', showIf: (p) => p.mode === 'custom' },
      { key: 'version', label: '版本探测', type: 'switch', default: false },
      { key: 'engine', label: '引擎', type: 'select', width: 120, default: 'auto', options: [{ label: '自动', value: 'auto' }, { label: 'nmap', value: 'nmap' }, { label: '内置', value: 'node' }] },
    ],
    run: (p) => api.post('/net/port-scan', { ...p, engine: p.engine === 'auto' ? undefined : p.engine }),
  },

  {
    key: 'traceroute', name: '路由追踪', short: 'traceroute 逐跳', group: '路由追踪', icon: <NodeIndexOutlined />, bin: 'traceroute',
    desc: '逐跳探测数据包路径, 支持 UDP/ICMP/TCP 三种模式, 展示每跳多次探测时延',
    fields: [
      { key: 'host', label: '目标', type: 'text', placeholder: 'IP 或域名', width: 230, default: '' },
      { key: 'maxHops', label: '最大跳数', type: 'number', min: 1, max: 64, width: 110, default: 30 },
      { key: 'queries', label: '每跳探测', type: 'number', min: 1, max: 5, width: 110, default: 3 },
      { key: 'protocol', label: '协议', type: 'select', width: 120, default: 'udp', options: [{ label: 'UDP', value: 'udp' }, { label: 'ICMP', value: 'icmp' }, { label: 'TCP', value: 'tcp' }] },
      { key: 'port', label: 'TCP 端口', type: 'number', min: 1, max: 65535, width: 110, default: 80, showIf: (p) => p.protocol === 'tcp' },
      { key: 'resolve', label: '解析主机名', type: 'switch', default: false },
    ],
    run: (p) => api.post('/net/traceroute', p),
  },
  {
    key: 'mtr', name: 'MTR 综合分析', short: '路由 + 丢包', group: '路由追踪', icon: <ExperimentOutlined />,
    desc: '融合 ping 与 traceroute, 展示每跳丢包率与延迟分布(未安装 mtr 时自动降级)',
    fields: [
      { key: 'host', label: '目标', type: 'text', placeholder: 'IP 或域名', width: 230, default: '' },
      { key: 'cycles', label: '探测轮数', type: 'number', min: 1, max: 50, width: 110, default: 10 },
      { key: 'mode', label: '协议', type: 'select', width: 120, default: 'icmp', options: [{ label: 'ICMP', value: 'icmp' }, { label: 'UDP', value: 'udp' }, { label: 'TCP', value: 'tcp' }] },
    ],
    run: (p) => api.post('/net/mtr', p),
  },

  {
    key: 'http', name: 'HTTP 请求', short: 'curl 调试', group: 'HTTP 调试', icon: <ApiOutlined />, bin: 'curl',
    desc: '发送 HTTP 请求, 返回状态码、耗时瀑布、重定向链、响应头与响应体',
    fields: [
      { key: 'url', label: 'URL', type: 'text', placeholder: 'https://example.com/api', width: 380, default: '' },
      { key: 'method', label: '方法', type: 'select', width: 110, default: 'GET', options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].map((v) => ({ label: v, value: v })) },
      { key: 'timeout', label: '超时(秒)', type: 'number', min: 1, max: 120, width: 110, default: 15 },
      { key: 'follow', label: '跟随重定向', type: 'switch', default: true },
      { key: 'insecure', label: '忽略证书', type: 'switch', default: false },
      { key: 'useProxy', label: '使用代理', type: 'switch', default: true, tip: '关闭后 curl 直连(不走 http_proxy)' },
      { key: 'headers', label: '请求头(JSON)', type: 'textarea', rows: 2, width: 620, placeholder: '{"Authorization":"Bearer xxx","Content-Type":"application/json"}', default: '' },
      { key: 'body', label: '请求体', type: 'textarea', rows: 3, width: 620, placeholder: '{"key":"value"}', default: '', showIf: (p) => reqMethods.includes(p.method) },
    ],
    run: (p) => {
      let headers: any;
      if (p.headers && String(p.headers).trim()) {
        try { headers = JSON.parse(p.headers); } catch { throw new Error('请求头必须是合法 JSON 对象'); }
      }
      return api.post('/net/http', { ...p, headers });
    },
  },
  {
    key: 'headers', name: '响应头探测', short: 'HTTP 头 / 重定向', group: 'HTTP 调试', icon: <LinkOutlined />, bin: 'curl',
    desc: '快速获取目标 HTTP 响应头与重定向链, 适合排查站点配置',
    fields: [
      { key: 'url', label: 'URL', type: 'text', placeholder: 'https://example.com', width: 420, default: '' },
      { key: 'useProxy', label: '使用代理', type: 'switch', default: true },
    ],
    run: (p) => api.post('/net/headers', p),
  },

  {
    key: 'tls', name: 'TLS 证书检测', short: '证书链/到期', group: '安全证书', icon: <SafetyCertificateOutlined />, bin: 'openssl',
    desc: '获取 HTTPS 站点证书: 主体、签发者、有效期、剩余天数、SAN、签名算法与证书链',
    fields: [
      { key: 'host', label: '主机 / URL', type: 'text', placeholder: 'example.com 或 https://example.com', width: 340, default: '' },
      { key: 'port', label: '端口', type: 'number', min: 1, max: 65535, width: 110, default: 443 },
    ],
    run: (p) => api.post('/net/tls', p),
  },

  {
    key: 'subnet', name: '子网计算器', short: 'CIDR/IPv4', group: '网络工具', icon: <CalculatorOutlined />,
    desc: '根据 IPv4 CIDR 计算网络地址、广播地址、可用范围、掩码与二进制',
    fields: [{ key: 'cidr', label: 'IPv4 CIDR', type: 'text', placeholder: '192.168.1.0/24', width: 260, default: '' }],
    run: (p) => api.post('/net/subnet', p),
  },
  {
    key: 'info', name: '本机网络接口', short: '网卡与路由', group: '网络工具', icon: <WifiOutlined />, bin: 'ip',
    desc: '列出本机所有网卡的 IP/MAC/掩码与系统路由表',
    fields: [],
    run: () => api.get('/net/info'),
  },
];

const DEFAULTS: Record<string, any> = {};
for (const t of TOOLS) { DEFAULTS[t.key] = {}; for (const f of t.fields) DEFAULTS[t.key][f.key] = f.default; }

/* ═══════════════════════════════ 工具函数 ═══════════════════════════════ */
function formatBytes(n: number) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}
const copyText = (t: string) => { navigator.clipboard.writeText(t).then(() => message.success('已复制')).catch(() => message.error('复制失败')); };
function downloadText(name: string, t: string) {
  const blob = new Blob([t], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

/* ═══════════════════════════════ 结果渲染组件 ═══════════════════════════════ */
function StatGrid({ items }: { items: { label: string; value: any; unit?: string; tone?: string }[] }) {
  return (
    <div className="nt-stat-grid">
      {items.map((it, i) => (
        <div className="nt-stat" key={i} style={{ ['--tone' as any]: it.tone || '#2f6bff' }}>
          <div className="v">{it.value ?? '—'}{it.unit && <span className="u">{it.unit}</span>}</div>
          <div className="l">{it.label}</div>
        </div>
      ))}
    </div>
  );
}

function Spark({ values, unit = 'ms' }: { values: number[]; unit?: string }) {
  const vals = (values || []).filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (!vals.length) return <div className="nt-empty">无时延数据</div>;
  const max = Math.max(...vals, 1);
  return (
    <div>
      <div className="nt-spark">
        {vals.map((v, i) => (
          <div className="nt-spark-col" key={i} title={`#${i + 1}: ${v}${unit}`}>
            <div className={'nt-spark-bar' + (v > max * 0.8 ? ' bad' : '')} style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />
            <div className="nt-spark-lab">{i + 1}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 6 }}>每包时延 · 峰值 {max}{unit}</div>
    </div>
  );
}

function RecordsTable({ r }: { r: any }) {
  const byType = r.byType || (r.records ? r.records.reduce((a: any, x: any) => { (a[x.type] ||= []).push(x); return a; }, {}) : {});
  const types = Object.keys(byType);
  const shortAnswers = r.shortAnswers || [];
  if (!types.length && !shortAnswers.length) return <div className="nt-empty">无解析记录</div>;
  return (
    <div>
      {shortAnswers.length > 0 && (
        <><div className="nt-section-title">应答</div>
          <div className="nt-resolver"><div className="ans">{shortAnswers.map((a: string, i: number) => <code key={i}>{a}</code>)}</div></div></>
      )}
      {types.map((type) => (
        <div key={type} style={{ marginBottom: 14 }}>
          <div className="nt-section-title"><Tag color="blue">{type}</Tag> {byType[type].length} 条</div>
          <Table size="small" pagination={false} dataSource={byType[type]} rowKey={(_: any, i?: number) => String(i)} columns={[
            { title: '名称', dataIndex: 'name', className: 'nt-mono' },
            { title: 'TTL', dataIndex: 'ttl', width: 80 },
            { title: '值', dataIndex: 'value', className: 'nt-mono' },
          ]} />
        </div>
      ))}
    </div>
  );
}

function PropagationView({ r }: { r: any }) {
  return (
    <div>
      <Alert type={r.consistent ? 'success' : 'warning'} showIcon style={{ marginBottom: 12 }}
        message={r.consistent ? '各解析器结果一致, 解析已生效' : '解析结果存在差异(可能仍在传播中)'} />
      <div className="nt-resolver-grid">
        {(r.results || []).map((x: any, i: number) => (
          <div className="nt-resolver" key={i}>
            <div className="hd">
              <div><div className="nm">{x.name}</div><div className="srv">{x.server || '系统默认'}</div></div>
              <Tag color={x.error ? 'red' : (x.answers?.length ? 'green' : 'orange')}>{x.error ? '失败' : `${x.answers?.length || 0} 条`}</Tag>
            </div>
            <div style={{ fontSize: 11.5, color: '#94a3b8' }}>耗时 {x.ms} ms</div>
            <div className="ans">
              {(x.answers || []).map((a: string, j: number) => <code key={j}>{a}</code>)}
              {(!x.answers || !x.answers.length) && <span className="nt-empty">无应答</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PingView({ r }: { r: any }) {
  const s = r.stat || {};
  const times = s.times || (r.probes || []).filter((x: any) => x.ok).map((x: any) => x.ms);
  return (
    <div>
      <StatGrid items={[
        { label: '丢包率', value: s.loss, unit: '%', tone: (s.loss ?? 0) > 0 ? '#ef4444' : '#16a34a' },
        { label: '平均延迟', value: s.avg, unit: ' ms' },
        { label: '最小', value: s.min, unit: ' ms' },
        { label: '最大', value: s.max, unit: ' ms', tone: '#f59e0b' },
        { label: '抖动(mdev)', value: s.mdev, unit: ' ms' },
        { label: '收/发', value: `${s.received ?? '—'} / ${s.transmitted ?? '—'}` },
      ]} />
      <div style={{ height: 12 }} />
      <Spark values={times} />
      {r.probes && (
        <div style={{ marginTop: 12 }}>
          <div className="nt-section-title">探测明细</div>
          <Table size="small" pagination={false} dataSource={r.probes} rowKey={(_: any, i?: number) => String(i)} columns={[
            { title: '#', width: 50, render: (_: any, __: any, i: number) => i + 1 },
            { title: '结果', dataIndex: 'ok', width: 90, render: (v: any) => v ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag> },
            { title: '时延(ms)', dataIndex: 'ms' },
            { title: '说明', dataIndex: 'error' },
          ]} />
        </div>
      )}
    </div>
  );
}

function PortsView({ r }: { r: any }) {
  const open = r.open || [];
  return (
    <div>
      <Space wrap style={{ marginBottom: 10 }}>
        <Tag color={open.length ? 'green' : 'default'}>开放 {open.length} 个</Tag>
        <Tag>引擎 {r.engine}</Tag>
        {r.latency && <Tag color="blue">主机延迟 {r.latency}</Tag>}
      </Space>
      {open.length ? (
        <Table size="small" pagination={false} dataSource={open} rowKey={(x: any) => `${x.proto}-${x.port}`} columns={[
          { title: '端口', dataIndex: 'port', width: 90, render: (p: any) => <b>{p}</b> },
          { title: '协议', dataIndex: 'proto', width: 80, render: (p: any) => <Tag>{p}</Tag> },
          { title: '服务', dataIndex: 'service', width: 140 },
          { title: '版本/指纹', dataIndex: 'version', className: 'nt-mono', render: (v: any) => v || '—' },
          { title: '连接', dataIndex: 'ms', width: 100, render: (m: any) => (m != null ? `${m} ms` : '—') },
        ]} />
      ) : <div className="nt-empty">未发现开放端口(目标可能过滤、离线或使用非默认端口)</div>}
    </div>
  );
}

function HopsView({ r }: { r: any }) {
  const hops = r.hops || [];
  const isMtr = hops.some((h: any) => h.loss != null);
  const maxRtt = Math.max(1, ...hops.flatMap((h: any) => [...(h.rtts || []), h.avg || 0]));
  const cols: any[] = [
    { title: '跳', dataIndex: 'hop', width: 56, render: (h: any) => <Tag color="blue">{h}</Tag> },
    { title: '主机', dataIndex: 'host', render: (h: string | null) => h ? <span className="nt-mono">{h}</span> : <span style={{ color: '#ef4444' }}>* * * 超时</span> },
  ];
  if (isMtr) {
    cols.push({ title: '丢包', dataIndex: 'loss', width: 82, render: (v: any) => <Tag color={v > 0 ? 'red' : 'green'}>{v ?? '—'}%</Tag> });
    cols.push({ title: '平均', dataIndex: 'avg', width: 120, render: (v: any) => v == null ? '—' : <div className="nt-bar"><i style={{ width: `${Math.min(100, (v / maxRtt) * 100)}%` }} /><span>{v} ms</span></div> });
    cols.push({ title: '最佳', dataIndex: 'best', width: 80, render: (v: any) => v == null ? '—' : `${v} ms` });
    cols.push({ title: '最差', dataIndex: 'worst', width: 80, render: (v: any) => v == null ? '—' : `${v} ms` });
    cols.push({ title: '抖动', dataIndex: 'stdev', width: 80, render: (v: any) => v == null ? '—' : `${v} ms` });
  } else {
    cols.push({
      title: '时延探测', render: (_: any, row: any) => row.timeout ? <span style={{ color: '#94a3b8' }}>无响应</span> : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(row.rtts || []).map((v: number, i: number) => (
            <div className="nt-bar" key={i} style={{ width: 84 }}><i style={{ width: `${Math.min(100, (v / maxRtt) * 100)}%` }} /><span>{v} ms</span></div>
          ))}
        </div>
      ),
    });
    cols.push({ title: '平均', dataIndex: 'avg', width: 100, render: (v: any) => v == null ? '—' : `${Number(v).toFixed(2)} ms` });
  }
  return (
    <div>
      {r.fallback && <Alert type="warning" showIcon style={{ marginBottom: 10 }} message={r.note || '已降级执行'} />}
      <Space wrap style={{ marginBottom: 10 }}>
        <Tag color="blue">共 {hops.length} 跳</Tag>
        {r.mode && <Tag>模式 {r.mode}</Tag>}
      </Space>
      {hops.length ? <Table size="small" pagination={false} dataSource={hops} rowKey={(h: any) => h.hop} columns={cols} /> : <div className="nt-empty">无路由数据</div>}
    </div>
  );
}

function HttpView({ r }: { r: any }) {
  const s = r.stats || {};
  const code = r.status?.code;
  const color = code >= 200 && code < 300 ? 'green' : code >= 300 && code < 400 ? 'blue' : code >= 400 && code < 500 ? 'orange' : 'red';
  const segs = [
    { name: 'DNS', v: s.time_namelookup || 0, c: '#60a5fa' },
    { name: 'TCP', v: (s.time_connect || 0) - (s.time_namelookup || 0), c: '#34d399' },
    { name: 'TLS', v: (s.time_appconnect || 0) - (s.time_connect || 0), c: '#a78bfa' },
    { name: '请求', v: (s.time_starttransfer || 0) - (s.time_appconnect || 0), c: '#fbbf24' },
    { name: '下载', v: Math.max(0, (s.time_total || 0) - (s.time_starttransfer || 0)), c: '#f87171' },
  ].filter((x) => x.v > 0);
  const sum = segs.reduce((a, b) => a + b.v, 0) || 1;
  const headerRows: any[] = Object.entries(r.headers || {}).map(([k, v]) => ({ k, v: Array.isArray(v) ? v.join(', ') : String(v) }));
  return (
    <div>
      <Space wrap style={{ marginBottom: 12 }}>
        {r.status && <Tag color={color} style={{ fontSize: 14, fontWeight: 700 }}>{r.status.code} {r.status.reason}</Tag>}
        {s.scheme && <Tag color="geekblue">{String(s.scheme).toUpperCase()}</Tag>}
        {s.remote_ip && <Tag className="nt-mono">{s.remote_ip}{s.remote_port ? `:${s.remote_port}` : ''}</Tag>}
        {s.http_version && <Tag>HTTP/{s.http_version}</Tag>}
        {s.time_total != null && <Tag icon={<ClockCircleOutlined />}>{((s.time_total || 0) * 1000).toFixed(0)} ms</Tag>}
        {r.bodySize != null && <Tag>{formatBytes(r.bodySize)}</Tag>}
      </Space>
      {segs.length > 0 && (
        <>
          <div className="nt-section-title">请求耗时瀑布</div>
          <div className="nt-timing">
            {segs.map((x, i) => (
              <div key={i} className="nt-timing-seg" style={{ width: `${(x.v / sum) * 100}%`, background: x.c }} title={`${x.name} ${(x.v * 1000).toFixed(1)}ms`}>
                {x.v / sum > 0.12 ? x.name : ''}
              </div>
            ))}
          </div>
          <div className="nt-timing-legend">
            {segs.map((x, i) => (<span className="it" key={i}><span className="dot" style={{ background: x.c }} />{x.name} {(x.v * 1000).toFixed(1)}ms</span>))}
          </div>
        </>
      )}
      {r.chain?.length > 1 && (
        <>
          <div className="nt-section-title" style={{ marginTop: 14 }}>重定向链 ({r.chain.length})</div>
          <div className="nt-resolver-grid">
            {r.chain.map((c: any, i: number) => (
              <div className="nt-resolver" key={i}>
                <div className="hd"><Tag color="blue">{c.code}</Tag><span className="srv">{c.reason}</span></div>
                {c.location && <div className="nt-mono" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>→ {c.location}</div>}
              </div>
            ))}
          </div>
        </>
      )}
      <div className="nt-section-title" style={{ marginTop: 14 }}>响应头</div>
      {headerRows.length ? (
        <Table size="small" pagination={false} dataSource={headerRows} rowKey="k" columns={[
          { title: '头', dataIndex: 'k', width: 230, className: 'nt-mono' },
          { title: '值', dataIndex: 'v', className: 'nt-mono' },
        ]} />
      ) : <div className="nt-empty">无响应头</div>}
      {r.isText !== undefined && (
        <>
          <div className="nt-section-title" style={{ marginTop: 14 }}>
            响应体 {r.isText ? <Tag>{formatBytes(r.bodySize)}{r.truncated ? ' · 已截断' : ''}</Tag> : <Tag color="orange">非文本内容</Tag>}
          </div>
          {r.isText ? <pre className="nt-pre">{r.body || '(空)'}</pre> : <div className="nt-empty">响应非文本, 未展示内容</div>}
        </>
      )}
    </div>
  );
}

function TlsView({ r }: { r: any }) {
  const c = r.cert || {};
  const d = c.daysLeft;
  const tone = d == null ? '#94a3b8' : d < 0 || d < 7 ? '#ef4444' : d < 30 ? '#f59e0b' : '#16a34a';
  const pct = d == null ? 0 : Math.max(0, Math.min(100, (d / 365) * 100));
  return (
    <div>
      <div className="nt-cert-hero">
        <div style={{ textAlign: 'center', minWidth: 120 }}>
          <div className="nt-days" style={{ color: tone }}>{d == null ? '—' : d}</div>
          <div style={{ fontSize: 11.5, color: '#94a3b8' }}>天后到期</div>
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <Progress percent={pct} strokeColor={tone} showInfo={false} />
          <div style={{ marginTop: 4 }}>
            <Tag color={d != null && d >= 0 ? 'green' : 'red'}>{d != null && d >= 0 ? '有效证书' : '已过期/异常'}</Tag>
            {c.ca && <Tag color="purple">CA 证书</Tag>}
            <Tag>链长 {c.chainLength}</Tag>
          </div>
        </div>
      </div>
      <div className="nt-section-title" style={{ marginTop: 14 }}>证书详情</div>
      <StatGrid items={[
        { label: '主体 Subject', value: <span className="nt-mono">{c.subject}</span> },
        { label: '签发者 Issuer', value: <span className="nt-mono">{c.issuer}</span> },
        { label: '生效时间', value: c.notBefore },
        { label: '到期时间', value: c.notAfter },
        { label: '签名算法', value: c.sigAlg },
        { label: '公钥', value: `${c.publicKeyAlg || ''} ${c.publicKeyBits || ''} bit` },
      ]} />
      <div className="nt-section-title" style={{ marginTop: 14 }}>SAN 备用名称 ({c.san?.length || 0})</div>
      <div className="nt-san">
        {(c.san || []).map((s: any, i: number) => <code key={i}>{s.type}:{s.value}</code>)}
        {(!c.san || !c.san.length) && <span className="nt-empty">无</span>}
      </div>
      <div style={{ marginTop: 10, fontSize: 11.5, color: '#94a3b8' }} className="nt-mono">序列号 {c.serial || '—'}</div>
    </div>
  );
}

function SubnetView({ r }: { r: any }) {
  const rows: [string, any][] = [
    ['网络地址', r.network], ['广播地址', r.broadcast],
    ['可用范围', `${r.firstUsable} ~ ${r.lastUsable}`],
    ['子网掩码', r.netmask], ['通配符掩码', r.wildcard],
    ['可用主机数', r.usableHosts], ['地址总数', r.totalHosts],
    ['地址类别', r.ipClass], ['私有地址', r.isPrivate ? '是' : '否'],
  ];
  return (
    <div>
      <StatGrid items={[
        { label: '网络', value: r.network, tone: '#2f6bff' },
        { label: '可用主机', value: r.usableHosts, tone: '#16a34a' },
        { label: 'CIDR', value: `/${r.prefix}` },
        { label: '类别', value: r.ipClass },
      ]} />
      <div className="nt-section-title" style={{ marginTop: 14 }}>详细</div>
      <Table size="small" pagination={false} showHeader={false} dataSource={rows.map(([k, v]) => ({ k, v }))} rowKey={(x: any) => x.k} columns={[
        { title: 'k', dataIndex: 'k', width: 150, render: (t: any) => <span className="nt-kv k">{t}</span> },
        { title: 'v', dataIndex: 'v', className: 'nt-mono' },
      ]} />
      <div className="nt-section-title" style={{ marginTop: 14 }}>二进制</div>
      <div className="nt-bin">
        <div><span className="lbl">IP</span>{r.binary?.ip}</div>
        <div><span className="lbl">掩码</span>{r.binary?.mask}</div>
        <div><span className="lbl">网络</span>{r.binary?.network}</div>
        <div><span className="lbl">广播</span>{r.binary?.broadcast}</div>
      </div>
    </div>
  );
}

function WhoisView({ r }: { r: any }) {
  const f = r.fields || {};
  const items = [
    { label: '注册商', value: f.registrar }, { label: '注册商网址', value: f.registrarUrl },
    { label: '创建时间', value: f.created }, { label: '更新时间', value: f.updated },
    { label: '到期时间', value: f.expires }, { label: '状态', value: f.status },
    { label: '组织', value: f.org }, { label: '国家', value: f.country },
    { label: '网段', value: f.netRange }, { label: 'CIDR', value: f.cidr },
  ].filter((x) => x.value);
  return (
    <div>
      {items.length > 0 && (<><div className="nt-section-title">注册信息</div><StatGrid items={items} /></>)}
      <div className="nt-section-title" style={{ marginTop: 14 }}>Name Server ({r.nameServers?.length || 0})</div>
      <div className="nt-san">
        {(r.nameServers || []).map((n: string, i: number) => <code key={i}>{n}</code>)}
        {(!r.nameServers || !r.nameServers.length) && <span className="nt-empty">无</span>}
      </div>
    </div>
  );
}

function InfoView({ r }: { r: any }) {
  return (
    <div>
      <Space wrap style={{ marginBottom: 10 }}>
        <Tag color="blue">主机 {r.hostname}</Tag>
        <Tag>{r.interfaces?.filter((x: any) => !x.internal).length || 0} 个外部接口</Tag>
      </Space>
      <Table size="small" pagination={false} dataSource={r.interfaces || []} rowKey={(x: any) => x.name + x.address} columns={[
        { title: '接口', dataIndex: 'name', width: 120 },
        { title: '族', dataIndex: 'family', width: 70, render: (v: any) => <Tag>{v}</Tag> },
        { title: '地址', dataIndex: 'address', className: 'nt-mono' },
        { title: 'CIDR/掩码', dataIndex: 'cidr', className: 'nt-mono', render: (v: any, row: any) => v || row.netmask },
        { title: 'MAC', dataIndex: 'mac', className: 'nt-mono' },
        { title: '类型', dataIndex: 'internal', width: 80, render: (v: any) => v ? <Tag>内部</Tag> : <Tag color="green">外部</Tag> },
      ]} />
      {r.routes?.length > 0 && (
        <><div className="nt-section-title" style={{ marginTop: 14 }}>路由表</div>
          <pre className="nt-pre light">{r.routes.join('\n')}</pre></>
      )}
    </div>
  );
}

function ResultBody({ toolKey, r }: { toolKey: string; r: any }) {
  switch (toolKey) {
    case 'dns': case 'reverse': return <RecordsTable r={r} />;
    case 'dns-propagation': return <PropagationView r={r} />;
    case 'ping': case 'tcp-ping': return <PingView r={r} />;
    case 'port-scan': return <PortsView r={r} />;
    case 'traceroute': case 'mtr': return <HopsView r={r} />;
    case 'whois': return <WhoisView r={r} />;
    case 'http': case 'headers': return <HttpView r={r} />;
    case 'tls': return <TlsView r={r} />;
    case 'subnet': return <SubnetView r={r} />;
    case 'info': return <InfoView r={r} />;
    default: return r.output ? <pre className="nt-pre">{r.output}</pre> : null;
  }
}

/* ═══════════════════════════════ 主组件 ═══════════════════════════════ */
export default function NetTools() {
  const [caps, setCaps] = useState<any>(null);
  const [active, setActive] = useState('dns');
  const [params, setParams] = useState<Record<string, any>>(() => JSON.parse(JSON.stringify(DEFAULTS)));
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [rawView, setRawView] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [history, setHistory] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem('nt-history') || '[]'); } catch { return []; }
  });

  useEffect(() => { api.get('/net/capabilities').then(setCaps).catch(() => { /* 忽略 */ }); }, []);

  const tool = useMemo(() => TOOLS.find((t) => t.key === active) || TOOLS[0], [active]);
  const p = params[active] || {};
  const missing = (t: ToolDef) => !!(t.bin && caps?.tools && caps.tools[t.bin] === false);

  const setField = (key: string, value: any) => setParams((prev) => ({ ...prev, [active]: { ...prev[active], [key]: value } }));

  const addHistory = (t: ToolDef, pp: any, ok: boolean, ms: number) => {
    setHistory((prev) => {
      const next = [{ id: Date.now() + Math.random(), tool: t.key, name: t.name, params: { ...pp }, ts: new Date().toISOString(), ok, ms }, ...prev].slice(0, 30);
      try { localStorage.setItem('nt-history', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const doRun = async (t: ToolDef = tool, override?: any) => {
    const runParams = override || p;
    setLoading(true); setResult(null); setRawView(false);
    const t0 = performance.now();
    try {
      const r = await t.run(runParams);
      setResult(r);
      addHistory(t, runParams, r?.ok !== false, r?.ms ?? Math.round(performance.now() - t0));
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || String(e) });
      addHistory(t, runParams, false, Math.round(performance.now() - t0));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setParams((prev) => ({ ...prev, [active]: JSON.parse(JSON.stringify(DEFAULTS[active])) })); };

  const rawText = result ? (result.output || JSON.stringify(result, null, 2)) : '';
  const ok = result?.ok !== false;
  const availableCount = TOOLS.filter((t) => !missing(t)).length;

  const renderField = (f: Field) => {
    const val = p[f.key];
    const onChange = (v: any) => setField(f.key, v);
    const enter = () => doRun();
    switch (f.type) {
      case 'number':
        return <InputNumber key={f.key} min={f.min} max={f.max} value={val} onChange={(v) => onChange(v)} style={{ width: f.width || 130 }} placeholder={f.placeholder} />;
      case 'select':
        return <Select key={f.key} value={val} onChange={onChange} options={f.options} style={{ width: f.width || 150 }} />;
      case 'switch':
        return <Switch key={f.key} checked={!!val} onChange={onChange} />;
      case 'textarea':
        return <Input.TextArea key={f.key} value={val} onChange={(e) => onChange(e.target.value)} rows={f.rows || 3} placeholder={f.placeholder} style={{ width: f.width || 520, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />;
      default:
        return <Input key={f.key} value={val} onChange={(e) => onChange(e.target.value)} onPressEnter={enter} placeholder={f.placeholder} style={{ width: f.width || 220 }} />;
    }
  };

  return (
    <div>
      {/* Hero */}
      <div className="nt-hero" style={{ marginBottom: 14 }}>
        <div className="nt-hero-inner">
          <Row align="middle" gutter={16}>
            <Col flex="auto">
              <Space align="center" size={14}>
                <span className="nt-hero-icon"><GlobalOutlined /></span>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: .5 }}>网络工具箱</div>
                  <div style={{ opacity: .86, fontSize: 12.5, marginTop: 2 }}>
                    DNS 诊断 · 连通性探测 · 路由追踪 · HTTP 调试 · 证书检查 · 子网计算
                  </div>
                </div>
              </Space>
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {['dig', 'ping', 'traceroute', 'mtr', 'nmap', 'whois', 'curl', 'openssl', 'nc'].map((name) => {
                  const on = caps?.tools?.[name];
                  return <span key={name} className={'nt-chip ' + (caps == null ? '' : on ? 'ok' : 'off')}>{on ? <CheckCircleOutlined /> : <CloseCircleOutlined />}{name}{caps != null && !on ? ' 未装' : ''}</span>;
                })}
              </div>
            </Col>
            <Col>
              <div className="nt-hero-stat">
                <div className="v">{availableCount}<span style={{ fontSize: 13, opacity: .7 }}> / {TOOLS.length}</span></div>
                <div className="l">可用工具</div>
                <div style={{ marginTop: 10 }}>
                  <Space>
                    <Button size="small" className="nt-hero-btn" icon={<HistoryOutlined />} onClick={() => setHistOpen(true)}>历史</Button>
                    <Tooltip title="重新探测本机可用命令"><Button size="small" className="nt-hero-btn" icon={<ReloadOutlined />} onClick={() => api.get('/net/capabilities').then(setCaps).catch(() => { })} /></Tooltip>
                  </Space>
                </div>
                {caps?.hostname && <div style={{ fontSize: 11, opacity: .7, marginTop: 8 }}>本机 {caps.hostname} · {caps.platform}</div>}
              </div>
            </Col>
          </Row>
        </div>
      </div>

      <Row gutter={14}>
        {/* 左侧工具导航 */}
        <Col xs={24} md={8} lg={7} xl={6} style={{ marginBottom: 14 }}>
          <div className="nt-rail">
            {GROUPS.map((g) => {
              const list = TOOLS.filter((t) => t.group === g);
              if (!list.length) return null;
              return (
                <div key={g}>
                  <div className="nt-rail-group">{g}</div>
                  {list.map((t) => (
                    <div key={t.key} className={'nt-tool' + (active === t.key ? ' active' : '') + (missing(t) ? ' disabled' : '')}
                      onClick={() => { if (missing(t)) { message.warning(`本机未安装 ${t.bin}`); return; } setActive(t.key); setResult(null); }}>
                      <span className="nt-tool-icon" style={{ background: GROUP_COLOR[t.group] }}>{t.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="nt-tool-name">{t.name}{missing(t) && <Tag color="default" style={{ marginLeft: 6, transform: 'scale(.85)' }}>未装</Tag>}</div>
                        <div className="nt-tool-desc">{t.short}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </Col>

        {/* 右侧工作区 */}
        <Col xs={24} md={16} lg={17} xl={18}>
          <Card size="small" style={{ marginBottom: 14, borderRadius: 14 }}
            title={<Space><span className="nt-tool-icon" style={{ background: GROUP_COLOR[tool.group], width: 26, height: 26, fontSize: 14 }}>{tool.icon}</span>{tool.name}</Space>}
            extra={tool.bin ? <Tag color={caps?.tools?.[tool.bin] ? 'green' : 'red'}>依赖 {tool.bin}{caps?.tools?.[tool.bin] ? ' ✓' : ' ✗'}</Tag> : <Tag>内置</Tag>}>
            <div style={{ color: '#8c8c8c', fontSize: 12.5, marginBottom: 12 }}>{tool.desc}</div>
            {tool.fields.length ? (
              <div className="nt-form">
                {tool.fields.filter((f) => !f.showIf || f.showIf(p)).map((f) => (
                  <div className="nt-field" key={f.key}>
                    <span className="nt-field-label">{f.label}</span>
                    {f.tip ? <Tooltip title={f.tip}>{renderField(f)}</Tooltip> : renderField(f)}
                  </div>
                ))}
                <div className="nt-field">
                  <span className="nt-field-label">&nbsp;</span>
                  <Space>
                    <Button type="primary" className="nt-submit" icon={loading ? undefined : <SendOutlined />} loading={loading}
                      disabled={missing(tool)} onClick={() => doRun()}>运行</Button>
                    <Button icon={<ReloadOutlined />} onClick={reset}>重置</Button>
                  </Space>
                </div>
              </div>
            ) : (
              <div>
                <div className="nt-empty">该工具无需参数。</div>
                <Button type="primary" icon={<SendOutlined />} loading={loading} onClick={() => doRun()}>运行</Button>
              </div>
            )}
          </Card>

          {loading && <Card size="small" style={{ borderRadius: 14, textAlign: 'center', padding: 30 }}><Spin tip="执行中..." /></Card>}

          {!loading && result && (
            <Card size="small" className="nt-fade" style={{ borderRadius: 14 }}
              title={<Space><CodeOutlined />执行结果</Space>}
              extra={<Text type="secondary" style={{ fontSize: 12 }}>{new Date().toLocaleTimeString()}</Text>}>
              <div className="nt-statusbar">
                <Tag icon={ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />} color={ok ? 'green' : 'red'}>{ok ? '成功' : '失败'}</Tag>
                {typeof result.ms === 'number' && <span style={{ fontSize: 12, color: '#64748b' }}><ClockCircleOutlined /> {result.ms} ms</span>}
                {result.cmd && <span className="nt-cmd" title={result.cmd}>{result.cmd}</span>}
                <span style={{ flex: 1 }} />
                <Segmented size="small" value={rawView ? 'raw' : 'view'} onChange={(v) => setRawView(v === 'raw')}
                  options={[{ label: '可视化', value: 'view' }, { label: '原始', value: 'raw' }]} />
                <Tooltip title="复制结果"><Button size="small" icon={<CopyOutlined />} onClick={() => copyText(rawText)} /></Tooltip>
                <Tooltip title="下载结果"><Button size="small" icon={<DownloadOutlined />} onClick={() => downloadText(`${tool.key}-${Date.now()}.txt`, rawText)} /></Tooltip>
              </div>
              {result.error && <Alert type="error" showIcon message={result.error} style={{ marginBottom: 12 }} />}
              {rawView || (!ok && !result.output) ? (
                <pre className="nt-pre">{result.output || result.error || '(无输出)'}</pre>
              ) : (
                <ResultBody toolKey={tool.key} r={result} />
              )}
            </Card>
          )}
        </Col>
      </Row>

      {/* 历史抽屉 */}
      <Drawer title={<Space><HistoryOutlined />执行历史</Space>} placement="right" width={420} open={histOpen} onClose={() => setHistOpen(false)}
        extra={<Button size="small" danger disabled={!history.length} onClick={() => { setHistory([]); localStorage.removeItem('nt-history'); }}>清空</Button>}>
        {!history.length && <div className="nt-empty">暂无历史记录</div>}
        {history.map((h) => (
          <div className="nt-hist-item" key={h.id} onClick={() => {
            const t = TOOLS.find((x) => x.key === h.tool);
            if (!t) return;
            setActive(h.tool);
            setParams((prev) => ({ ...prev, [h.tool]: { ...prev[h.tool], ...h.params } }));
            setHistOpen(false);
            setResult(null);
          }}>
            <Tag color={h.ok ? 'green' : 'red'}>{h.ok ? 'OK' : 'FAIL'}</Tag>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12.5 }}>{h.name}</div>
              <div style={{ fontSize: 11, color: '#98a2b3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {Object.entries(h.params || {}).filter(([, v]) => v !== '' && v != null && v !== false).map(([k, v]) => `${k}=${v}`).join(' ') || '(无参数)'}
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#98a2b3', textAlign: 'right' }}>
              <div>{h.ms != null ? `${h.ms} ms` : ''}</div>
              <div>{new Date(h.ts).toLocaleTimeString()}</div>
            </div>
          </div>
        ))}
      </Drawer>
    </div>
  );
}
