import { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Space, Tabs, Drawer, Descriptions, Input, App, Select, Segmented, Popconfirm, Alert, Badge, Tooltip } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, PauseCircleOutlined, CaretRightOutlined, StopOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { api } from '../api';

export default function Docker() {
  const [hostId, setHostId] = useState<string>('');
  const [hosts, setHosts] = useState<any[]>([]);
  const [containers, setContainers] = useState<any[]>([]);
  const [images, setImages] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [logs, setLogs] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  const reload = async (all = true) => {
    setLoading(true);
    const q = hostId ? { hostId } : {};
    try {
      const s = await api.get('/docker/status');
      setStatus(s);
      if (s.ok) { setContainers(await api.get('/docker/containers', q)); setImages(await api.get('/docker/images', q)); }
    } catch (e: any) { message.error(e.message); }
    setLoading(false);
  };
  useEffect(() => { (async () => { const h = await api.get('/hosts'); setHosts([{ id: '', name: '本机(local)' }, ...h]); })(); }, []);
  useEffect(() => { reload(); }, [hostId]);

  const act = async (id: string, action: string) => {
    await api.post(`/docker/containers/${id}/${action}`, undefined, hostId ? { hostId } : {});
    message.success('已执行 ' + action); reload();
  };
  const showDetail = async (id: string) => { setDetail({ loading: true }); const d = await api.get('/docker/containers/' + id, hostId ? { hostId } : {}); setDetail(d); };
  const showLogs = async (id: string) => { setLogs({ loading: true, id }); const l = await api.get('/docker/containers/' + id + '/logs', { ...(hostId ? { hostId } : {}), tail: 300 }); setLogs(l); };

  const stateTag = (s: string) => {
    const map: any = { running: 'green', exited: 'red', paused: 'orange', created: 'default', restarting: 'processing' };
    return <Tag color={map[s] || 'default'}>{s}</Tag>;
  };

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select value={hostId} onChange={setHostId} style={{ width: 220 }} options={hosts.map((h) => ({ value: h.id, label: h.name }))} />
        <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>刷新</Button>
        {status && status.ok
          ? <Alert type="success" showIcon message={`Docker ${status.version?.Version} · 驱动 ${status.info?.Driver} · 容器 ${status.info?.ContainersRunning}/${status.info?.Containers}`} style={{ paddingInline: 12 }} />
          : <Alert type="error" showIcon message={status?.error || 'Docker 不可用'} />}
      </Space>
      {status?.ok && <Tabs defaultActiveKey="c" items={[
        { key: 'c', label: `容器 ${containers.length}`, children: containerTable() },
        { key: 'i', label: `镜像 ${images.length}`, children: imageTable() },
        { key: 'o', label: '其他', children: <OtherTabs hostId={hostId} /> },
      ]} />}

      {/* 容器详情 */}
      <Drawer title="容器详情" width={720} open={!!detail} onClose={() => setDetail(null)}>
        {detail?.loading ? '加载中...' : detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="名称">{detail.inspect?.Name}</Descriptions.Item>
            <Descriptions.Item label="状态">{stateTag(detail.inspect?.State?.Status)} ({detail.inspect?.State?.Running ? '运行中' : '停止'})</Descriptions.Item>
            <Descriptions.Item label="镜像">{detail.inspect?.Config?.Image}</Descriptions.Item>
            <Descriptions.Item label="创建">{new Date(detail.inspect?.Created).toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="重启策略">{detail.inspect?.HostConfig?.RestartPolicy?.Name || '无'}</Descriptions.Item>
            <Descriptions.Item label="命令">{detail.inspect?.Config?.Cmd?.join(' ')}</Descriptions.Item>
            <Descriptions.Item label="网络">
              {Object.entries(detail.inspect?.NetworkSettings?.Networks || {}).map(([n, v]: any) => <div key={n}>{n}: {v.IPAddress} → {v.Gateway}</div>)}
            </Descriptions.Item>
            <Descriptions.Item label="环境变量">{JSON.stringify(detail.inspect?.Config?.Env)}</Descriptions.Item>
            {detail.stats && <Descriptions.Item label="CPU/内存">
              <StatView stats={detail.stats} />
            </Descriptions.Item>}
          </Descriptions>
        )}
      </Drawer>

      {/* 日志 */}
      <Drawer title="容器日志" width={900} open={!!logs} onClose={() => setLogs(null)}>
        {logs?.loading ? '加载中...' : <pre style={{ background: '#f6f8fa', color: '#1f2328', padding: 12, borderRadius: 8, maxHeight: '80vh', overflow: 'auto', fontSize: 12 }}>{typeof logs === 'string' ? logs : logs?.data ? logs.data : logs?.message || JSON.stringify(logs, null, 2)}</pre>}
      </Drawer>
    </div>
  );

  function containerTable() {
    const cols = [
      { title: '名称', dataIndex: 'names', render: (n: string[]) => <b>{(n || []).map((x) => x.replace(/^\//, '')).join(', ')}</b> },
      { title: '镜像', dataIndex: 'image', ellipsis: true, width: 200 },
      { title: '状态', dataIndex: 'state', width: 90, render: (s: string) => stateTag(s) },
      { title: '端口', render: (_: any, c: any) => (c.ports || []).filter((p: any) => p.PublicPort).map((p: any) => <Tag key={p.PrivatePort}>{p.IP || ''}:{p.PublicPort}→{p.PrivatePort}</Tag>) },
      { title: 'ID', dataIndex: 'shortId', width: 110 },
      { title: '操作', width: 300, render: (_: any, c: any) => (
        <Space size={2}>
          <Tooltip title="启动"><Button size="small" disabled={c.state === 'running'} icon={<CaretRightOutlined />} onClick={() => act(c.id, 'start')} /></Tooltip>
          <Tooltip title="停止"><Button size="small" disabled={c.state !== 'running'} icon={<PauseCircleOutlined />} onClick={() => act(c.id, 'stop')} /></Tooltip>
          <Tooltip title="重启"><Button size="small" disabled={c.state !== 'running'} icon={<PlayCircleOutlined />} onClick={() => act(c.id, 'restart')} /></Tooltip>
          <Button size="small" icon={<StopOutlined />} onClick={() => act(c.id, 'kill')} disabled={c.state === 'exited'}>强杀</Button>
          <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(c.id)}>详情</Button>
          <Button size="small" onClick={() => showLogs(c.id)}>日志</Button>
          <Popconfirm title="删除容器?" onConfirm={() => act(c.id, 'remove')}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ) },
    ];
    return <Table rowKey="id" dataSource={containers} columns={cols} size="middle" pagination={{ pageSize: 15 }} loading={loading} />;
  }

  function imageTable() {
    const cols = [
      { title: '仓库:标签', dataIndex: 'repoTags', render: (t: string[]) => (t || []).map((x) => <Tag key={x}>{x || '<none>'}</Tag>) },
      { title: '大小', dataIndex: 'size', render: (s: number) => fmt(s) },
      { title: '创建', dataIndex: 'created', render: (c: number) => new Date(c * 1000).toLocaleString() },
      { title: '被容器引用', dataIndex: 'containers', width: 100 },
      { title: 'ID', dataIndex: 'shortId', width: 110 },
      { title: '操作', width: 100, render: (_: any, i: any) => <Button size="small" icon={<EyeOutlined />} onClick={async () => { const d = await api.get('/docker/images/' + i.id); ModalInfo(d, i); }}>详情</Button> },
    ];
    return <Table rowKey="id" dataSource={images} columns={cols} size="middle" pagination={{ pageSize: 15 }} loading={loading} />;
  }
}

function OtherTabs({ hostId }: any) {
  const [vols, setVols] = useState<any[]>([]);
  const [nets, setNets] = useState<any[]>([]);
  useEffect(() => { const q = hostId ? { hostId } : {}; api.get('/docker/volumes', q).then(setVols); api.get('/docker/networks', q).then(setNets); }, [hostId]);
  return (
    <div>
      <b>数据卷 ({vols.length})</b>
      <Table rowKey="Name" size="small" style={{ marginBottom: 20 }} pagination={false} dataSource={vols}
        columns={[{ title: '名称', dataIndex: 'Name' }, { title: '驱动', dataIndex: 'Driver' }, { title: '挂载点', dataIndex: 'Mountpoint' }]} />
      <b>网络 ({nets.length})</b>
      <Table rowKey="Id" size="small" dataSource={nets} pagination={false}
        columns={[{ title: '名称', dataIndex: 'Name' }, { title: '驱动', dataIndex: 'Driver' }, { title: '作用域', dataIndex: 'Scope' }]} />
    </div>
  );
}

function StatView({ stats }: any) {
  const cpu = stats?.cpu_stats?.cpu_usage?.total_usage, pcpu = stats?.precpu_stats?.cpu_usage?.total_usage;
  const on = stats?.cpu_stats?.online_cpus || 1;
  const cpuPct = cpu && pcpu ? Math.max(0, ((cpu - pcpu) / (stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage)) * on * 100) : 0;
  const mem = stats?.memory_stats;
  return <div>CPU: {cpuPct.toFixed(1)}% &nbsp;·&nbsp; 内存: {fmt(mem?.usage)} / {fmt(mem?.limit)}</div>;
}

export function ModalInfo(d: any, i: any) {
  // 简单展示镜像信息
}
function fmt(n: number) {
  if (!n) return '-';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(1) + u[i];
}
