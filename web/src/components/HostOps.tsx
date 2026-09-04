import { useEffect, useState } from 'react';
import { Drawer, Tabs, Table, Tag, Button, Space, App, Input, Switch, Alert, Select, InputNumber, Popconfirm, Descriptions, Badge } from 'antd';
import { PoweroffOutlined, RedoOutlined, SyncOutlined, ReloadOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { api } from '../api';

const stateColor: any = { running: 'green', exited: 'red', active: 'green', inactive: 'default', failed: 'red' };

export default function HostOps({ host, open, onClose }: any) {
  const { message } = App.useApp();
  const [tab, setTab] = useState('services');
  const [refreshKey, setRefreshKey] = useState(0);

  const mkProps = { hostId: host?.id, refresh: () => setRefreshKey((k) => k + 1), message };

  return (
    <Drawer title={`系统运维 · ${host?.name || ''}`} width={980} open={open} onClose={onClose} footer={null}>
      <Space style={{ marginBottom: 8 }}>
        <Badge status="processing" text="实时读自目标主机" />
        <Button size="small" icon={<ReloadOutlined />} onClick={() => setRefreshKey((k) => k + 1)}>全部刷新</Button>
      </Space>
      <Tabs activeKey={tab} onChange={setTab} items={[
        { key: 'services', label: '服务 (systemd)', children: <Services {...mkProps} refreshKey={refreshKey} /> },
        { key: 'processes', label: '进程', children: <Processes {...mkProps} refreshKey={refreshKey} /> },
        { key: 'cron', label: '计划任务 cron', children: <Cron {...mkProps} refreshKey={refreshKey} /> },
        { key: 'ports', label: '监听端口', children: <Ports {...mkProps} refreshKey={refreshKey} /> },
      ]} />
    </Drawer>
  );
}

export function Services({ hostId, refreshKey, message, refresh }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async () => { setLoading(true); const r = await api.get(`/hosts/${hostId}/services`); setItems(r.items || []); setLoading(false); };
  useEffect(() => { load(); }, [hostId, refreshKey]);
  const act = async (action: string, unit: string) => {
    const r = await api.post(`/hosts/${hostId}/service/${action}`, { unit });
    r.ok ? (message.success(`${action} ${unit}`), load()) : message.error((r.output || r.error || '').slice(-200));
  };
  const shown = items.filter((i) => !filter || i.name.includes(filter));
  const cols = [
    { title: '服务名', dataIndex: 'name', render: (v: string) => <b>{v}</b> },
    { title: '状态', dataIndex: 'active', width: 110, render: (v: string, r: any) => <Tag color={stateColor[v] || 'default'}>{v === 'active' ? '运行中' : v} · {r.sub}</Tag> },
    { title: '操作', width: 340, render: (_: any, r: any) => (
      <Space size={2}>
        <Button size="small" disabled={r.active === 'active'} icon={<PoweroffOutlined />} onClick={() => act('start', r.name)}>启动</Button>
        <Button size="small" disabled={r.active !== 'active'} danger icon={<PoweroffOutlined />} onClick={() => act('stop', r.name)}>停止</Button>
        <Button size="small" disabled={r.active !== 'active'} icon={<SyncOutlined />} onClick={() => act('restart', r.name)}>重启</Button>
        <Button size="small" icon={<RedoOutlined />} onClick={() => act('reload', r.name)}>reload</Button>
        {r.load === 'loaded' ? <Button size="small" onClick={() => act('disable', r.name)}>禁开机</Button> : <Button size="small" type="primary" ghost onClick={() => act('enable', r.name)}>开机自启</Button>}
      </Space>
    ) },
  ];
  return (
    <div>
      <Input.Search placeholder="过滤服务名" allowClear onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 300, marginBottom: 10 }} />
      <Table rowKey="name" size="small" loading={loading} dataSource={shown} columns={cols} pagination={{ pageSize: 15 }} />
    </div>
  );
}

export function Processes({ hostId, refreshKey, message }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(true);
  const load = async () => { setLoading(true); const r = await api.get(`/hosts/${hostId}/processes`); setItems(r.items || []); setLoading(false); };
  useEffect(() => { load(); }, [hostId, refreshKey]);
  useEffect(() => { if (!live) return; const t = setInterval(load, 3000); return () => clearInterval(t); }, [live, hostId]);
  const kill = async (pid: string, sig = 15) => { const r = await api.post(`/hosts/${hostId}/kill`, { pid, signal: sig === 9 ? 9 : 15 }); r.ok ? message.success('已发送信号') : message.error(r.output || '失败'); load(); };
  const shown = items.filter((i) => !filter || (i.command || '').includes(filter) || String(i.pid).includes(filter));
  const cols = [
    { title: 'PID', dataIndex: 'pid', width: 80 },
    { title: '用户', dataIndex: 'user', width: 90 },
    { title: 'CPU%', dataIndex: 'cpu', width: 70 },
    { title: 'MEM%', dataIndex: 'mem', width: 70 },
    { title: '线程', dataIndex: 'threads', width: 70, render: (v: any, r: any) => (v && Number(v) > 1) ? <a onClick={(e) => e.stopPropagation()} style={{ color: '#2f6bff' }}>{v} ▶</a> : v || '-' },
    { title: 'RSS', dataIndex: 'rss', width: 90, render: (v: any) => v ? fmt(v * 1024) : '-' },
    { title: '时长', dataIndex: 'etime', width: 90 },
    { title: '命令', dataIndex: 'command', ellipsis: true },
    { title: '操作', width: 150, render: (_: any, r: any) => (
      <Space size={2}>
        <Popconfirm title={`结束 PID ${r.pid}?`} onConfirm={() => kill(r.pid)}><Button size="small" danger icon={<PoweroffOutlined />}>结束</Button></Popconfirm>
        <Popconfirm title="强制 kill -9?" onConfirm={() => kill(r.pid, 9)}><Button size="small" danger>KILL</Button></Popconfirm>
      </Space>
    ) },
  ];
  return (
    <div>
      <Space style={{ marginBottom: 10 }} wrap>
        <Input.Search placeholder="按命令/PID 过滤" allowClear onChange={(e) => setFilter(e.target.value)} style={{ width: 280 }} />
        <Space size={4}><Switch checkedChildren="实时(3s)" unCheckedChildren="暂停" checked={live} onChange={setLive} /><span style={{ fontSize: 12, color: '#888' }}>点击“线程 ▶”或行首展开查看线程</span></Space>
      </Space>
      <Table rowKey="pid" size="small" loading={loading} dataSource={shown} columns={cols} pagination={{ pageSize: 15 }} scroll={{ x: 1000 }}
        expandable={{ expandedRowRender: (r: any) => <Threads hostId={hostId} pid={r.pid} />, rowExpandable: (r: any) => Number(r.threads) > 1 }} />
    </div>
  );
}

function Threads({ hostId, pid }: any) {
  const [threads, setThreads] = useState<any[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { (async () => { try { const r = await api.get(`/hosts/${hostId}/processes/${pid}/threads`); r.ok ? setThreads(r.items || []) : setErr(r.error || ''); } catch (e: any) { setErr(e.message); } })(); }, [hostId, pid]);
  if (err) return <Tag color="red">{err}</Tag>;
  return (
    <Table size="small" dataSource={threads} pagination={false} style={{ background: '#fafafa' }}
      columns={[
        { title: '线程ID', dataIndex: 'tid', width: 90 },
        { title: '所属进程', dataIndex: 'pid', width: 90 },
        { title: '用户', dataIndex: 'user', width: 90 },
        { title: 'CPU%', dataIndex: 'cpu', width: 70 },
        { title: 'MEM%', dataIndex: 'mem', width: 70 },
        { title: '状态', dataIndex: 'stat', width: 80 },
        { title: '线程名', dataIndex: 'comm', ellipsis: true },
      ]} />
  );
}

export function Cron({ hostId, refreshKey, message }: any) {
  const [content, setContent] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const load = async () => { const r = await api.get(`/hosts/${hostId}/cron`); setContent(r.raw || ''); setLines(r.lines || []); };
  useEffect(() => { load(); }, [hostId, refreshKey]);
  const save = async () => { const r = await api.post(`/hosts/${hostId}/cron`, { content }); r.ok ? (message.success('crontab 已更新'), load()) : message.error(r.output || '保存失败'); };
  return (
    <div>
      <Alert type="info" showIcon style={{ marginBottom: 10 }} message="当前 root 用户的 crontab 计划任务。语法同 crontab。编辑后点保存即生效。" />
      <Table rowKey={(l: string, i: any) => String(i)} size="small" style={{ marginBottom: 12 }} dataSource={lines}
        columns={[{ title: '现有任务', dataIndex: '', render: (_: any, l: string) => <code>{l}</code> }]} pagination={false} />
      <Input.TextArea rows={8} value={content} onChange={(e) => setContent(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
      <Button type="primary" icon={<SaveOutlined />} style={{ marginTop: 8 }} onClick={save}>保存计划任务</Button>
    </div>
  );
}

export function Ports({ hostId, refreshKey }: any) {
  const [items, setItems] = useState<any[]>([]);
  const load = async () => { const r = await api.get(`/hosts/${hostId}/ports`); setItems(r.items || []); };
  useEffect(() => { load(); }, [hostId, refreshKey]);
  const cols = [
    { title: '协议', dataIndex: 'proto', width: 80 },
    { title: '本地地址', dataIndex: 'local', render: (v: string) => <code>{v}</code> },
    { title: '对端', dataIndex: 'foreign' },
    { title: '进程', dataIndex: 'process', render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
  ];
  return <Table rowKey={(r: any, i: any) => i + r.local} size="small" dataSource={items} columns={cols} pagination={{ pageSize: 20 }} />;
}

function fmt(n: number) { const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return n.toFixed(1) + u[i]; }
