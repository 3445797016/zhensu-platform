import { useEffect, useState } from 'react';
import { Select, Button, Space, Card, Tabs, Table, Tag, Statistic, Row, Col, Progress, Input, App, Popconfirm, Drawer, Alert, Descriptions, Typography } from 'antd';
import { ReloadOutlined, DownloadOutlined, DeleteOutlined, SyncOutlined, ArrowUpOutlined, SearchOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { api } from '../api';
import { Services, Processes, Cron, Ports } from '../components/HostOps';

export default function LinuxManage() {
  const [hosts, setHosts] = useState<any[]>([]);
  const [sel, setSel] = useState<string>('local');
  const [refreshKey, setRefreshKey] = useState(0);
  const { message } = App.useApp();
  const [info, setInfo] = useState<any>(null);
  const [disk, setDisk] = useState<any[]>([]);

  useEffect(() => { api.get('/hosts').then(setHosts); }, []);
  const loadSys = async () => {
    try {
      const [i, d] = await Promise.all([api.get('/linux/' + sel + '/info'), api.get('/linux/' + sel + '/disk')]);
      setInfo(i); setDisk(d.items || []);
    } catch (e: any) { message.error(e.message); }
  };
  useEffect(() => { loadSys(); }, [sel]);
  const hostName = hosts.find((h) => h.id === sel)?.name || (sel === 'local' ? '本机(Linux)' : sel);
  const memPct = info && info.memTotalMb ? Math.round((info.memUsedMb / info.memTotalMb) * 100) : 0;
  const diskMax = Math.max(0, ...disk.map((d) => d.pct));

  const shared = { hostId: sel, refreshKey, refresh: () => setRefreshKey((k) => k + 1), message };

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select value={sel} onChange={(v) => setSel(v)} style={{ width: 220 }} options={hosts.map((h) => ({ value: h.id, label: h.name }))} placeholder="选择 Linux 主机" />
        <Tag color="geekblue">{hostName}</Tag>
        <Button icon={<ReloadOutlined />} onClick={() => { setRefreshKey((k) => k + 1); loadSys(); }}>全部刷新</Button>
        <Typography.Text type="secondary">包管理/服务/进程/磁盘/用户/网络 等对所选主机实时操作（apt 需有源可访问）</Typography.Text>
      </Space>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="主机名" value={info?.hostname || '-'} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="CPU/核心" value={info ? `${info.cpuModel?.trim().slice(0, 26) || ''} ×${info.cores}` : '-'} valueStyle={{ fontSize: 14 }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="内存" value={info ? `${info.memUsedMb}/${info.memTotalMb} MB` : '-'} valueStyle={{ fontSize: 16, color: memPct > 90 ? '#ff4d4f' : undefined }} suffix={<Tag color={memPct > 90 ? 'red' : 'green'}>{memPct}%</Tag>} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="磁盘(最大占用)" value={diskMax + '%'} valueStyle={{ color: diskMax > 80 ? '#ff4d4f' : undefined }} /></Card></Col>
      </Row>

      {info && <Alert style={{ marginBottom: 12 }} type="info" showIcon message={`系统: ${info.os} | 内核 ${info.kernel} (${info.arch}) | 负载 ${info.load} | 运行 ${(info.uptimeSec / 3600).toFixed(1)}h`} />}

      <Tabs defaultActiveKey="pkg" items={[
        { key: 'pkg', label: '软件包 (apt)', children: <Packages hostId={sel} message={message} onChanged={loadSys} /> },
        { key: 'svc', label: '服务', children: <Services {...shared} /> },
        { key: 'proc', label: '进程', children: <Processes {...shared} /> },
        { key: 'disk', label: '磁盘', children: <DiskTable hostId={sel} /> },
        { key: 'user', label: '用户', children: <Users hostId={sel} /> },
        { key: 'net', label: '网络', children: <Network hostId={sel} message={message} /> },
        { key: 'cron', label: '计划任务', children: <Cron {...shared} /> },
        { key: 'port', label: '端口', children: <Ports {...shared} /> },
      ]} />
    </div>
  );
}

function Packages({ hostId, message, onChanged }: any) {
  const [installed, setInstalled] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [pkgName, setPkgName] = useState('');
  const load = async () => { setLoading(true); const r = await api.get('/linux/' + hostId + '/packages', { q }); setInstalled(r.items || []); setTotal(r.total || 0); setLoading(false); };
  useEffect(() => { load(); }, [hostId]);
  useEffect(() => { const t = setTimeout(load, 400); return () => clearTimeout(t); }, [q]);
  const act = async (name: string, action: 'install' | 'remove') => {
    if (!name) return;
    setBusy(true);
    message.loading({ content: `${action === 'install' ? '安装' : '卸载'} ${name}...`, key: 'pkg' });
    const r = await api.post('/linux/' + hostId + '/package', { name, action });
    message.destroy('pkg');
    setOutput({ action, name, output: r.output || r.error || '' });
    message.success(r.ok ? '完成' : '执行结束，见输出'); setBusy(false); load(); onChanged?.();
  };
  const runGlobal = async (kind: 'update' | 'upgrade') => {
    setBusy(true); message.loading({ content: kind === 'update' ? '更新软件源...' : '升级全部软件...', key: 'pkg' });
    const r = await api.post('/linux/' + hostId + '/' + kind);
    message.destroy('pkg'); setOutput({ action: kind, name: '', output: r.output || r.error || '' }); setBusy(false); load();
  };
  const cols = [
    { title: '软件包', dataIndex: 'name', render: (v: string) => <b>{v}</b> },
    { title: '版本', dataIndex: 'version', ellipsis: true, width: 240 },
    { title: '说明', dataIndex: 'summary', ellipsis: true },
    { title: '操作', width: 90, render: (_: any, r: any) => <Popconfirm title={`卸载 ${r.name}?`} onConfirm={() => act(r.name, 'remove')}><Button size="small" danger>卸载</Button></Popconfirm> },
  ];
  return (
    <Card size="small">
      <Space style={{ marginBottom: 10 }} wrap>
        <Input.Search allowClear prefix={<SearchOutlined />} placeholder="过滤已安装包" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
        <Input placeholder="要安装/卸载的包名，如 nginx" value={pkgName} onChange={(e) => setPkgName(e.target.value)} style={{ width: 220 }} />
        <Button type="primary" icon={<DownloadOutlined />} loading={busy} onClick={() => act(pkgName.trim(), 'install')}>安装</Button>
        <Button danger icon={<DeleteOutlined />} loading={busy} onClick={() => pkgName.trim() && act(pkgName.trim(), 'remove')}>卸载</Button>
        <Button icon={<SyncOutlined />} loading={busy} onClick={() => runGlobal('update')}>更新软件源</Button>
        <Popconfirm title="升级所有可升级软件包? 可能耗时较长" onConfirm={() => runGlobal('upgrade')}><Button icon={<ArrowUpOutlined />} loading={busy} type="primary" ghost>升级全部</Button></Popconfirm>
      </Space>
      <Alert type="info" style={{ marginBottom: 8 }} showIcon message={`共 ${total} 个已安装软件包（实时读取该主机 dpkg）`} />
      <Table rowKey="name" size="small" loading={loading} dataSource={installed} columns={cols} pagination={{ pageSize: 20 }} scroll={{ y: 520 }} />
      <Drawer title={`${output?.action} · ${output?.name || ''}`} width={820} open={!!output} onClose={() => setOutput(null)}>
        <pre style={{ background: '#f6f8fa', border: '1px solid #d0d7de', color: '#1f2328', padding: 12, borderRadius: 8, maxHeight: '80vh', overflow: 'auto', fontSize: 12 }}>{output?.output || '（无输出）'}</pre>
      </Drawer>
    </Card>
  );
}

function DiskTable({ hostId }: any) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get('/linux/' + hostId + '/disk').then((r) => setItems(r.items || [])); }, [hostId]);
  const cols = [
    { title: '挂载点', dataIndex: 'mount', render: (v: string) => <b>{v}</b> },
    { title: '文件系统', dataIndex: 'fs', width: 140 },
    { title: '容量', dataIndex: 'size', width: 90 },
    { title: '已用', dataIndex: 'used', width: 90 },
    { title: '可用', dataIndex: 'avail', width: 90 },
    { title: '使用率', dataIndex: 'pct', render: (v: number) => <Progress percent={Math.min(100, v)} size="small" style={{ width: 180, margin: 0 }} strokeColor={v > 80 ? '#ff4d4f' : undefined} /> },
  ];
  return <Card size="small" title="磁盘与文件系统"><Table rowKey={(r: any) => r.mount + r.fs} size="small" dataSource={items} columns={cols} pagination={false} /></Card>;
}

function Users({ hostId }: any) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get('/linux/' + hostId + '/users').then((r) => setItems(r.items || [])); }, [hostId]);
  const cols = [
    { title: '用户名', dataIndex: 'name', render: (v: string) => <b>{v}</b> },
    { title: 'UID', dataIndex: 'uid', width: 90 },
    { title: 'GID', dataIndex: 'gid', width: 90 },
    { title: '家目录', dataIndex: 'home' },
    { title: 'Shell', dataIndex: 'shell', render: (v: string) => <code>{v}</code> },
  ];
  return <Card size="small" title="用户账户（普通用户 + root）"><Table rowKey="name" size="small" dataSource={items} columns={cols} pagination={false} /></Card>;
}

function Network({ hostId, message }: any) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.get('/linux/' + hostId + '/network').then(setData).catch((e: any) => message.error(e.message)); }, [hostId]);
  const cols = [
    { title: '接口', dataIndex: 'iface', render: (v: string) => <Tag>{v}</Tag> },
    { title: '协议', dataIndex: 'family', width: 90 },
    { title: '地址', dataIndex: 'address', render: (v: string) => <code>{v}</code> },
  ];
  return (
    <Card size="small" title="网络接口">
      <Space style={{ marginBottom: 8 }}><InfoCircleOutlined /><Typography.Text>默认网关: {data?.gateway || '-'}</Typography.Text></Space>
      <Table rowKey={(r: any) => r.iface + r.family + r.address} size="small" dataSource={data?.addrs || []} columns={cols} pagination={false} />
    </Card>
  );
}
