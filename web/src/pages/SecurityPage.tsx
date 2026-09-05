import { useEffect, useMemo, useState } from 'react';
import {
  Card, Tag, Space, Select, Input, Collapse, Alert, Switch, Tooltip, Button, Empty, Divider, Badge, Typography,
} from 'antd';
import {
  SafetyCertificateOutlined, PlayCircleOutlined, CopyOutlined, CloseCircleOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, FieldTimeOutlined, ReloadOutlined, BugOutlined, ApiOutlined,
} from '@ant-design/icons';
import { api } from '../api';
import TargetCenter from '../components/TargetCenter';
import SecTargets from '../components/SecTargets';

const GROUP_ORDER = ['扫描', 'Web', '审计', '基线', '口令/利用(参考)'];
const GROUP_TIP: Record<string, string> = {
  扫描: '端口与资产探测:本机发起扫描,目标填 IP/域名/CIDR',
  Web: 'Web 应用检测:目标填 URL(可带端口/路径)',
  审计: '在所选纳管主机上执行,读取连接/登录/权限日志',
  基线: '对所选主机做只读安全基线体检',
  '口令/利用(参考)': '仅展示参考命令,不在平台执行',
};

export default function SecurityPage() {
  const [catalog, setCatalog] = useState<any>(null);
  const [loadErr, setLoadErr] = useState('');
  const [hostSel, setHostSel] = useState('local');
  const [target, setTarget] = useState('');
  const [ack, setAck] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [res, setRes] = useState<Record<string, any>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  const [params, setParams] = useState<Record<string, Record<string, string>>>({});

  const load = async () => {
    setLoadErr(''); setCatalog(null);
    try {
      const c = await api.get('/sec/tools');
      setCatalog(c);
      if (c.ips?.length) setTarget((prev) => prev || c.ips[0].split(' ')[0]);
    } catch (e: any) { setLoadErr(e.message || '加载失败,请确认后端已重启且 /api/sec/tools 可访问'); }
  };
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => {
    const g: Record<string, any[]> = {};
    (catalog?.tools || []).forEach((t: any) => { (g[t.group] ||= []).push(t); });
    return g;
  }, [catalog]);

  const runTool = async (t: any) => {
    const body: any = { tool: t.id, ack: ack ? 'yes' : 'no' };
    if (t.runOn === 'host') body.hostId = hostSel || 'local';
    else { body.target = target; body.params = params[t.id] || {}; }
    setBusyId(t.id); setErr((e) => ({ ...e, [t.id]: '' })); setRes((r) => ({ ...r, [t.id]: null }));
    try {
      const r = await api.post('/sec/run', body);
      setRes((prev) => ({ ...prev, [t.id]: r }));
      if (r.error) setErr((e) => ({ ...e, [t.id]: r.error }));
    } catch (e: any) { setErr((er) => ({ ...er, [t.id]: e.message || '运行失败' })); }
    setBusyId(null);
  };
  const copy = (s: string) => { try { navigator.clipboard?.writeText(s); } catch {} };

  const runnable = (catalog?.tools || []).filter((t: any) => t.runOn !== 'none');
  const avail = runnable.filter((t: any) => t.available).length;

  return (
    <div>
      <Card size="small" style={{ marginBottom: 14 }} title={
        <Space><SafetyCertificateOutlined style={{ color: '#722ed1' }} /><b>网络安全</b>
          <Tag color="purple">{runnable.length} 个工具</Tag><Tag color="blue">可用 {avail}</Tag>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>集成平台本机 Kali 安全工具 · 仅限自管/授权环境</Typography.Text>
        </Space>}
        extra={<Button size="small" icon={<ReloadOutlined />} onClick={load}>刷新目录</Button>}>
        <Alert type="warning" showIcon icon={<ExclamationCircleOutlined />} style={{ marginBottom: 12 }}
          message="合法使用声明:本工具箱仅用于对你拥有/被授权的目标(自管主机、靶场)进行测试;扫描/注入/爆破前请确认授权,勿对公网第三方使用。" />

        <Space wrap size={12} align="center" style={{ marginBottom: 6 }}>
          <Space size={4}><ApiOutlined /><span style={{ fontSize: 13 }}>审计/基线目标主机:</span></Space>
          <Select style={{ width: 220 }} value={hostSel} onChange={setHostSel}
            options={[{ value: 'local', label: '本机(Linux)' }, ...(catalog?.hosts || []).filter((h: any) => h.id !== 'local').map((h: any) => ({ value: h.id, label: `${h.name} (${h.addr})` }))]} />
          <Space size={4}><BugOutlined /><span style={{ fontSize: 13 }}>扫描/Web 目标:</span></Space>
          <Input style={{ width: 360 }} allowClear placeholder="IP/域名/CIDR 或 URL,如 192.168.147.0/24 或 http://127.0.0.1:3000"
            value={target} onChange={(e) => setTarget(e.target.value)} />
          <span style={{ fontSize: 11, color: '#999' }}>本机: {(catalog?.ips || []).join(' · ') || '—'}</span>
        </Space>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 2px' }}>
          <Switch checked={ack} onChange={setAck} />
          <span style={{ fontSize: 12.5 }}>我已确认仅对<strong>授权目标</strong>测试,允许执行 danger 工具(Masscan/SQLMap)</span>
        </div>
      </Card>
      <TargetCenter />
      <SecTargets />

      {loadErr ? (
        <Card><Alert type="error" showIcon message={loadErr} action={<Button size="small" type="primary" onClick={load}>重试</Button>} /></Card>
      ) : !catalog ? (
        <Card><div style={{ textAlign: 'center', padding: 30 }}><Badge status="processing" text="正在加载安全工具目录…" /></div></Card>
      ) : (catalog.tools || []).length === 0 ? (
        <Card><Empty description="未获取到工具目录(/api/sec/tools 返回空)" /></Card>
      ) : (
        GROUP_ORDER.filter((g) => groups[g]?.length).map((g) => (
          <Card key={g} size="small" style={{ marginBottom: 14 }} title={
            <Space>
              <Tag color={g === '口令/利用(参考)' ? 'default' : g === '扫描' ? 'blue' : g === 'Web' ? 'geekblue' : g === '审计' ? 'cyan' : 'lime'}>{g}</Tag>
              <span style={{ fontSize: 12, color: '#888' }}>{groups[g].length} 个 · {groups[g].filter((t: any) => t.available).length} 可用 · {GROUP_TIP[g]}</span>
            </Space>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: 12 }}>
              {groups[g].map((t: any) => (
                <div key={t.id} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: 12, background: t.danger ? '#fff7f7' : '#fff', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b>{t.name}</b>
                    {t.available ? <Tag icon={<CheckCircleOutlined />} color="green" style={{ marginInlineEnd: 0 }}>可用</Tag> : <Tag color="default">缺 {t.bin}</Tag>}
                    {t.danger && <Tag color="red" style={{ marginInlineEnd: 0 }}>危险·需授权</Tag>}
                    {t.runOn === 'host' && <Tag style={{ marginInlineEnd: 0 }}>在目标主机执行</Tag>}
                    {t.runOn === 'none' && <Tag style={{ marginInlineEnd: 0 }}>仅参考命令</Tag>}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#aaa' }}>{t.bin || ''}</span>
                  </div>
                  {t.help && <div style={{ fontSize: 12, color: '#8a94a6' }}>{t.help}</div>}

                  {t.runOn !== 'none' && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      {t.needsTarget && (
                        <div><div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>目标</div>
                          <Input size="small" style={{ width: 180 }} placeholder="IP/URL" value={params[t.id]?.__target ?? target}
                            onChange={(e) => setParams((p) => ({ ...p, [t.id]: { ...p[t.id], __target: e.target.value } }))} /></div>
                      )}
                      {(t.params || []).map((pp: any) => (
                        <div key={pp.key}><div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>{pp.label}</div>
                          <Tooltip title={pp.hint}><Input size="small" style={{ width: 140 }} placeholder={pp.def || pp.hint}
                            value={params[t.id]?.[pp.key] ?? pp.def ?? ''}
                            onChange={(e) => setParams((p) => ({ ...p, [t.id]: { ...p[t.id], [pp.key]: e.target.value } }))} /></Tooltip></div>
                      ))}
                      <Button size="small" type="primary" icon={<PlayCircleOutlined />} loading={busyId === t.id}
                        disabled={!t.available || (t.danger && !ack)} onClick={() => runTool(t)}>{busyId === t.id ? '运行中…' : '运行'}</Button>
                    </div>
                  )}
                  {t.runOn === 'none' && (
                    <Alert type="info" style={{ padding: '2px 8px' }} message={<span style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{t.sample || t.help || '(参考命令见 help)'}</span>} />
                  )}

                  {err[t.id] && <Alert type="error" style={{ padding: '2px 10px' }} message={<span style={{ fontSize: 12 }}>{err[t.id]}</span>} />}
                  {res[t.id] && (
                    <div>
                      <Space size={6} style={{ marginBottom: 4 }}>
                        {res[t.id].error ? <Tag color="red">错误</Tag> : res[t.id].ok ? <Tag color="green" icon={<CheckCircleOutlined />}>exit 0</Tag> : <Tag color="red" icon={<CloseCircleOutlined />}>exit {res[t.id].code}</Tag>}
                        {res[t.id].timeMs != null && <Tag icon={<FieldTimeOutlined />}>{res[t.id].timeMs}ms</Tag>}
                        <Tag>{res[t.id].host}</Tag>
                        <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copy(res[t.id].stdout || res[t.id].error || '')}>复制输出</Button>
                      </Space>
                      <pre style={{ maxHeight: 300, overflow: 'auto', margin: 0, background: '#0d1117', color: '#d4e0ea', borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {res[t.id].error || res[t.id].stdout || '(无输出)'}{res[t.id].stderr ? '\n[stderr]\n' + res[t.id].stderr : ''}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))
      )}

      <Divider />
      <Alert type="info" icon={<SafetyCertificateOutlined />} showIcon
        message={<span>想练习?去「中间件/工具库 → 渗透测试」一键部署 <b>DVWA / Juice Shop / WebGoat / OWASP ZAP / GoPhish / BeEF</b> 靶场,再回来对本机 localhost 用这些工具扫描练手。</span>} />
    </div>
  );
}
