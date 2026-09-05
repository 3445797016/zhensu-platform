import { useEffect, useState } from 'react';
import { Card, Table, Tag, Space, Button, Modal, Input, message, Alert, Drawer, Empty, Popconfirm, Select, Switch } from 'antd';
import { AimOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined, ThunderboltOutlined, EyeOutlined, ScanOutlined, WarningOutlined } from '@ant-design/icons';
import { api } from '../api';

const KINDS = [
  { value: 'ping', label: '在线探测' },
  { value: 'quick', label: '快速端口' },
  { value: 'service', label: '服务版本 -sV' },
  { value: 'web', label: 'Web 指纹' },
  { value: 'smb', label: 'SMB 漏洞脚本' },
  { value: 'full', label: '全端口+版本(慢)' },
];

export default function SecTargets() {
  const [data, setData] = useState<any>({ list: [], scans: {} });
  const [cfg, setCfg] = useState<any>({ auto: false, intervalMin: 10, kinds: ['quick'] });
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ip: '', name: '', note: '' });
  const [busy, setBusy] = useState('');
  const [detail, setDetail] = useState<any>(null);

  const load = () => api.get('/seclab/targets').then((r: any) => { setData(r); setCfg(r.cfg || cfg); }).catch((e) => message.error(e.message));
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);
  const saveCfg = async (c: any) => { try { const r = await api.put('/seclab/config', c); setCfg(r); message.success(c.auto ? '已开启自动扫描(整点周期轮询全部靶机)' : '已关闭自动扫描'); } catch (e: any) { message.error(e.message); } };
  const scanAll = async () => { setBusy('*all*'); try { await api.post('/seclab/scanall'); message.success('已触发全部靶机自动扫描,结果将陆续刷新'); } catch (e: any) { message.error(e.message); } setBusy(''); };

  const add = async () => {
    if (!form.ip) return message.warning('填 IP');
    try { await api.post('/seclab/targets', form); message.success('已加入靶机'); setAddOpen(false); setForm({ ip: '', name: '', note: '' }); load(); }
    catch (e: any) { message.error(e.message); }
  };
  const scan = async (ip: string, kind: string) => {
    setBusy(ip + kind);
    try { const r = await api.post('/seclab/scan', { ip, kind }); message.success(`${r.label} 完成(${Math.round(r.ms / 1000)}s)`); load(); }
    catch (e: any) { message.error(e.message); }
    setBusy('');
  };

  const lastOf = (ip: string) => data.scans?.[ip]?.[0];
  const portsOf = (ip: string) => {
    const arr: any[] = [];
    for (const s of data.scans?.[ip] || []) if (s.ports) for (const p of s.ports) if (!arr.some((x) => x.port === p.port)) arr.push(p);
    return arr.slice(0, 20);
  };

  const cols = [
    { title: '靶机 IP', dataIndex: 'ip', render: (ip: string, r: any) => <a onClick={() => setDetail({ t: r })}><b>{ip}</b></a> },
    { title: '名称/备注', width: 220, render: (_: any, r: any) => <span>{r.name}{r.note ? <span style={{ color: '#999', fontSize: 12 }}> · {r.note}</span> : null}</span> },
    { title: '最近扫描', width: 170, render: (_: any, r: any) => { const l = lastOf(r.ip); return l ? <Space size={4}><Tag color="blue">{l.label}</Tag><span style={{ fontSize: 11, color: '#999' }}>{new Date(l.time).toLocaleString()}</span></Space> : <Tag>未扫描</Tag>; } },
    { title: '已知端口/服务', render: (_: any, r: any) => { const ps = portsOf(r.ip); return ps.length ? <Space size={4} wrap>{ps.slice(0, 10).map((p) => <Tooltip key={p.port} title={`${p.service} ${p.version}`}><Tag color="cyan" style={{ marginInlineEnd: 0 }}>{p.port} {p.service}</Tag></Tooltip>)}</Space> : <span style={{ color: '#bbb' }}>—</span>; } },
    { title: 'SMB 漏洞', width: 100, render: (_: any, r: any) => { const s = data.scans?.[r.ip]?.find((x: any) => x.kind === 'smb'); return s ? (s.vulnerable ? <Tag color="red" icon={<WarningOutlined />}>存在漏洞</Tag> : <Tag color="green">未发现</Tag>) : '-'; } },
    { title: '操作', width: 340, render: (_: any, r: any) => (
      <Space size={2} wrap>
        <Button size="small" type="primary" ghost icon={<ThunderboltOutlined />} loading={busy === r.ip + 'quick'} onClick={() => scan(r.ip, 'quick')}>快速</Button>
        <Button size="small" loading={busy === r.ip + 'service'} onClick={() => scan(r.ip, 'service')}>服务版本</Button>
        <Button size="small" loading={busy === r.ip + 'web'} onClick={() => scan(r.ip, 'web')}>Web</Button>
        <Button size="small" danger loading={busy === r.ip + 'smb'} onClick={() => scan(r.ip, 'smb')}>SMB漏洞</Button>
        <Popconfirm title="移除该靶机?" onConfirm={async () => { try { await api.del('/seclab-targets/' + r.ip); load(); } catch (e: any) { message.error(e.message); } }}><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>) },
  ];

  return (
    <Card size="small" style={{ marginBottom: 14 }} title={<Space><AimOutlined style={{ color: '#eb2f96' }} /><b>本地靶机库</b>
      <Tag color="magenta">{data.list?.length || 0} 台</Tag>
      <span style={{ fontSize: 12, color: '#888' }}>维护常扫 IP,一键 探测/端口/服务/Web/SMB漏洞,结果自动留存 20 次</span></Space>}
      extra={<Space>
        <Select size="small" style={{ width: 120 }} value={cfg.intervalMin} onChange={(v) => saveCfg({ ...cfg, intervalMin: v })}
          options={[{ value: 5, label: '每 5 分钟' }, { value: 10, label: '每 10 分钟' }, { value: 30, label: '每 30 分钟' }, { value: 60, label: '每小时' }]} />
        <Switch checked={cfg.auto} onChange={(v) => saveCfg({ ...cfg, auto: v })} checkedChildren="自动扫描开" unCheckedChildren="自动扫描关" />
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        <Button loading={busy === '*all*'} icon={<ScanOutlined />} onClick={scanAll}>扫描全部</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>添加靶机</Button>
      </Space>}>
      {data.scanning && <Alert type="info" showIcon style={{ marginBottom: 8 }} message="自动扫描进行中(轮询所有靶机)…" />}
      {!data.list?.length ? <Empty description={<span>还没有靶机。添加内网实验机 IP(如 192.168.147.128/130)后即可一键扫描。</span>} /> : (
        <Table rowKey="ip" size="small" dataSource={data.list} columns={cols as any} pagination={false} />
      )}

      <Modal title="添加靶机(IP/域名)" open={addOpen} onCancel={() => setAddOpen(false)} onOk={add} okText="添加" width={460} destroyOnClose>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input addonBefore="IP/域名" value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="192.168.147.128" />
          <Input addonBefore="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 WinXP 靶机(可空,默认IP)" />
          <Input addonBefore="备注" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="如 授权练习靶场" />
        </Space>
      </Modal>

      <Drawer title={detail ? `扫描记录 · ${detail.t.ip}` : ''} open={!!detail} onClose={() => setDetail(null)} width={680} footer={null}>
        <ScanHistory ip={detail?.t?.ip} />
      </Drawer>
    </Card>
  );
}

function Tooltip({ title, children }: any) { return <span title={title}>{children}</span>; }

function ScanHistory({ ip }: any) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { if (ip) api.get('/seclab/targets').then((r: any) => setData(r.scans?.[ip] || [])); }, [ip]);
  if (!data) return <Alert type="info" showIcon message="读取扫描历史…" />;
  if (!data.length) return <Empty description="还没有扫描记录,返回列表点「快速/服务版本」扫描" />;
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {data.map((s: any, i: number) => (
        <Card key={i} size="small" title={<Space><Tag color="blue">{s.label}</Tag><Tag>{new Date(s.time).toLocaleString()}</Tag><Tag>{Math.round(s.ms / 1000)}s</Tag>
          {s.vulnerable !== undefined && (s.vulnerable ? <Tag color="red">存在漏洞</Tag> : <Tag color="green">未发现</Tag>)}</Space>}>
          {s.ports?.length ? (
            <Table size="small" rowKey={(x: any) => x.port} dataSource={s.ports} pagination={false}
              columns={[{ title: '端口', dataIndex: 'port', width: 90, render: (p: string) => <b>{p}</b> }, { title: '服务', dataIndex: 'service' }, { title: '版本', dataIndex: 'version' }]} style={{ marginBottom: 8 }} />
          ) : null}
          {s.raw && <pre style={{ maxHeight: 260, overflow: 'auto', background: '#0d1117', color: '#d4e0ea', padding: 10, borderRadius: 6, fontSize: 11.5, whiteSpace: 'pre-wrap', margin: 0 }}>{s.raw.slice(0, 6000)}</pre>}
        </Card>
      ))}
    </Space>
  );
}
