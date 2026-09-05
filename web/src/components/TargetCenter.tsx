import { useEffect, useState } from 'react';
import { Card, Table, Tag, Space, Button, message, Drawer, Modal, Descriptions, Input, Alert, Popconfirm, Row, Col, Empty } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, RedoOutlined, FileTextOutlined, SwapOutlined, SafetyCertificateOutlined, LinkOutlined, SyncOutlined, MonitorOutlined, ContainerOutlined } from '@ant-design/icons';
import { api } from '../api';

const httpPort = (ports: string) => {
  const list = (ports || '').match(/:(\d+)->/g)?.map((x) => x.replace(/[^\d]/g, '')) || [];
  return list.find((p) => ['80', '3000', '8080', '8000', '3333'].includes(p)) || list[0] || '';
};

export default function TargetCenter() {
  const [d, setD] = useState<any>(null);
  const [sel, setSel] = useState<any>(null);       // {type:'container'|'host', ...}
  const [logs, setLogs] = useState<any>(null);
  const [cpOpen, setCpOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const load = () => api.get('/targets').then(setD).catch((e) => message.error(e.message));
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const act = async (name: string, action: string) => { setBusy(action + name); try { await api.post(`/targets/${name}/action`, { action }); message.success(action + ' 成功'); load(); } catch (e: any) { message.error(e.message); } setBusy(''); };
  const openLogs = async (name: string) => { try { setLogs(await api.get(`/targets/${name}/logs`)); } catch (e: any) { message.error(e.message); } };

  const display = [...(d?.hosts || []).map((h: any) => ({ ...h, state: 'host', stats: {} })), ...(d?.list || [])];
  const runningC = d?.running || 0;

  const cols = [
    { title: '类型', width: 100, render: (_: any, r: any) => r.kind === 'host'
      ? <Tag color="blue"><MonitorOutlined /> {r.lab || '主机'}</Tag>
      : r.lab === '靶场' ? <Tag color="red"><ContainerOutlined /> 靶场容器</Tag> : <Tag><ContainerOutlined /> 容器</Tag> },
    { title: '名称/靶机', dataIndex: 'name', render: (n: string, r: any) => <a onClick={() => setSel({ type: r.kind, name: n, hostId: r.hostId || '' })}><b>{n}</b></a> },
    { title: '镜像/地址', width: 220, ellipsis: true, render: (_: any, r: any) => <span style={{ fontSize: 12 }}>{r.kind === 'host' ? (r.image || '-') : (r.image || '-')}</span> },
    { title: '状态', width: 100, render: (_: any, r: any) => r.kind === 'host' ? <Tag color="geekblue">主机(在线可测)</Tag> : r.state === 'running' ? <Tag color="green" icon={<SyncOutlined spin />}>运行中</Tag> : <Tag color="orange">已停止</Tag> },
    { title: '端口', width: 190, render: (_: any, r: any) => r.kind === 'host' ? '-' : r.ports ? <code style={{ fontSize: 11 }}>{r.ports}</code> : '-' },
    { title: 'CPU', width: 90, render: (_: any, r: any) => <span>{r.stats?.cpu || '-'}</span> },
    { title: '内存', width: 90, render: (_: any, r: any) => <span>{r.stats?.mem || '-'}</span> },
    { title: '操作', width: 300, render: (_: any, r: any) => r.kind === 'host' ? (
      <Button size="small" type="primary" ghost icon={<MonitorOutlined />} onClick={() => setSel({ type: 'host', name: r.name, hostId: r.hostId || r.id })}>查看资源</Button>
    ) : (
      <Space size={2} wrap>
        {r.state !== 'running' && <Button size="small" type="primary" ghost loading={busy === 'start' + r.name} onClick={() => act(r.name, 'start')}>启动</Button>}
        {r.state === 'running' && <Button size="small" danger ghost loading={busy === 'stop' + r.name} onClick={() => act(r.name, 'stop')}>停止</Button>}
        <Button size="small" loading={busy === 'restart' + r.name} onClick={() => act(r.name, 'restart')} icon={<RedoOutlined />}>重启</Button>
        <Button size="small" icon={<FileTextOutlined />} onClick={() => openLogs(r.name)}>日志</Button>
        <Button size="small" icon={<SwapOutlined />} onClick={() => { setSel({ type: 'container', name: r.name }); setCpOpen(true); }}>文件传输</Button>
        {r.state === 'running' && httpPort(r.ports) && <a href={`http://127.0.0.1:${httpPort(r.ports)}`} target="_blank" rel="noreferrer"><Button size="small" type="link" icon={<LinkOutlined />}>打开靶场</Button></a>}
      </Space>) },
  ];

  return (
    <Card size="small" style={{ marginBottom: 14 }} title={<Space><SafetyCertificateOutlined style={{ color: '#fa541c' }} /><b>靶机中心(主机 + 容器)</b>
      <Tag color="blue">{d?.hosts?.length || 0} 台主机</Tag><Tag color="purple">{d?.list?.length || 0} 个容器</Tag><Tag color="green">运行 {runningC}</Tag>
      <span style={{ fontSize: 12, color: '#888' }}>扫描范围:已纳管主机 + 本机 Docker 容器;容器 5s 自动刷新资源</span></Space>}
      extra={<Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>}>
      {!d ? <Alert type="info" showIcon message="正在扫描靶机(主机 + 容器)…" /> : !display.length ? <Empty description={<span>没有找到靶机。容器类:到「中间件/工具库 → 渗透测试」一键部署 DVWA/JuiceShop/WebGoat/ZAP/GoPhish/BeEF;主机类:到「宿主机/VM」添加 SSH 主机。</span>} /> : (
        <Table rowKey={(r: any) => r.kind + '-' + (r.id || r.name)} size="small" dataSource={display} columns={cols as any} pagination={false} scroll={{ x: 1250 }} />
      )}

      <Drawer title={sel ? `详情 · ${sel.name}` : ''} open={!!sel && !cpOpen} onClose={() => setSel(null)} width={620} footer={null}>
        {sel && <TargetInfo type={sel.type} name={sel.name} hostId={sel.hostId} />}
      </Drawer>

      <Modal title={`靶机文件传输 · ${sel?.name || ''}`} open={cpOpen} onCancel={() => { setCpOpen(false); setSel(null); }} footer={null} width={640}>
        <CpPanel container={sel?.name} onClose={() => { setCpOpen(false); setSel(null); }} />
      </Modal>

      <Modal title={`容器日志 · ${logs?.name || ''}`} open={!!logs} onCancel={() => setLogs(null)} footer={null} width={720}>
        <pre style={{ maxHeight: '60vh', overflow: 'auto', background: '#0d1117', color: '#d4e0ea', padding: 12, borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{logs?.logs || '(空)'}</pre>
      </Modal>
    </Card>
  );
}

function TargetInfo({ type, name, hostId }: any) {
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!name) return;
    const p = type === 'host' ? api.get(`/targets/host/${hostId}/info`) : api.get(`/targets/${name}/info`);
    p.then(setInfo).catch((e) => setErr(e.message));
  }, [type, name, hostId]);
  if (err) return <Alert type="error" message={err} />;
  if (!info) return <Alert type="info" showIcon message="读取信息与资源中…" />;
  if (info.type === 'host') {
    const t = (s: number) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h ? `${h}h${m}m` : `${m}m`; };
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="类型">SSH/本机主机靶机</Descriptions.Item>
          <Descriptions.Item label="主机名">{info.name}</Descriptions.Item>
          <Descriptions.Item label="地址">{info.addr}</Descriptions.Item>
          <Descriptions.Item label="系统">{info.os || '-'}</Descriptions.Item>
          <Descriptions.Item label="运行时长">{t(info.uptimeSec)}</Descriptions.Item>
        </Descriptions>
        <Descriptions column={2} size="small" bordered title="实时资源">
          {Object.entries(info.resource || {}).map(([k, v]: any) => <Descriptions.Item key={k} label={k}>{v}</Descriptions.Item>)}
        </Descriptions>
        <Alert type="info" showIcon message="需要更完整指标/进程/网络?去「监控/告警 → 主机指标」或「宿主机/VM」查看;对主机做扫描/基线用本页顶部网络安全工具箱。" />
      </Space>
    );
  }
  const fmtTime = (s: number) => { if (!s) return '0'; const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h ? `${h}h${m}m` : `${m}m${Math.floor(s % 60)}s`; };
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Alert type={info.state?.Running ? 'success' : 'warning'} showIcon message={info.state?.Running ? '运行中' : '已停止'} />
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="镜像">{info.config?.image}</Descriptions.Item>
        <Descriptions.Item label="状态">{info.state?.Status} · 重启 {info.state?.RestartCount}</Descriptions.Item>
        <Descriptions.Item label="运行时长">{fmtTime(info.uptimeSec)}</Descriptions.Item>
        <Descriptions.Item label="资源"><Space wrap>{['cpu', 'mem', 'netIO', 'pids'].map((k) => <Tag key={k}>{k}: {info.resource?.[k] || '-'}</Tag>)}</Space></Descriptions.Item>
        <Descriptions.Item label="端口映射">{Object.entries(info.portBindings || {}).map(([p, v]: any) => `${p} → ${(v || []).map((x: any) => x.HostPort).join(',')}`).join('; ') || '-'}</Descriptions.Item>
        <Descriptions.Item label="挂载">{info.mounts?.length ? info.mounts.map((m: any) => `${m.source || m.type} → ${m.dest}`).join('\n') : '-'}</Descriptions.Item>
        <Descriptions.Item label="网络">{Object.entries(info.network || {}).map(([k, v]: any) => `${k}: ${v.IPAddress}`).join('; ') || '-'}</Descriptions.Item>
        <Descriptions.Item label="环境变量">{info.config?.env?.slice(0, 12).join(' · ') || '-'}</Descriptions.Item>
      </Descriptions>
    </Space>
  );
}

function CpPanel({ container, onClose }: any) {
  const [dir, setDir] = useState('to');
  const [localPath, setLocalPath] = useState('');
  const [containerPath, setContainerPath] = useState('/tmp/');
  const [toPath, setToPath] = useState('/');
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    if (!localPath) return message.warning('填本机源文件路径(或选文件上传)');
    setBusy(true);
    try { await api.post(`/targets/${container}/cp`, { direction: 'to', source: localPath, containerPath }); message.success('已复制进靶机'); } catch (e: any) { message.error(e.message); }
    setBusy(false);
  };
  const pick = async (f: File) => {
    const data = await new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(',')[1] || ''); rd.readAsDataURL(f); });
    setBusy(true);
    try { await api.post(`/targets/${container}/cp`, { direction: 'to', data, containerPath: containerPath + f.name }); message.success('已上传到靶机 ' + containerPath + f.name); } catch (e: any) { message.error(e.message); }
    setBusy(false);
  };
  const pull = async (save: boolean) => {
    if (!containerPath) return message.warning('填靶机内文件路径');
    setBusy(true);
    try {
      const r = await api.post(`/targets/${container}/cp`, { direction: 'from', containerPath, localPath: save ? toPath : undefined });
      if (!save) { const a = document.createElement('a'); a.href = 'data:application/octet-stream;base64,' + r.data; a.download = r.name || 'file'; a.click(); message.success(`已下载(${r.size}B)`); }
      else message.success('已保存到本机 ' + toPath);
    } catch (e: any) { message.error(e.message); }
    setBusy(false);
  };
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Alert type="info" showIcon message={`本机 ⇆ 容器 ${container} 的双向文件传输(docker cp)。本机路径为平台所在主机绝对路径。`} />
      <div>
        <Button type={dir === 'to' ? 'primary' : 'default'} onClick={() => setDir('to')}>本机 → 靶机(上传)</Button>
        <Button type={dir === 'from' ? 'primary' : 'default'} style={{ marginLeft: 8 }} onClick={() => setDir('from')}>靶机 → 本机(下载)</Button>
      </div>
      {dir === 'to' ? (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Row gutter={8}>
            <Col span={14}><Input addonBefore="本机路径" value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="/tmp/wordlist.txt" /></Col>
            <Col span={10}><Input addonBefore="靶机目录" value={containerPath} onChange={(e) => setContainerPath(e.target.value)} placeholder="/tmp/" /></Col>
          </Row>
          <Space>
            <Button type="primary" loading={busy} icon={<SwapOutlined />} onClick={upload}>按路径复制</Button>
            <label style={{ cursor: 'pointer' }}>或<Button size="small" disabled={busy}>选择本机文件上传</Button>
              <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} /></label>
          </Space>
        </Space>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input addonBefore="靶机内路径" value={containerPath} onChange={(e) => setContainerPath(e.target.value)} placeholder="/var/www/html/flag.txt" />
          <Space wrap>
            <Button type="primary" loading={busy} icon={<SwapOutlined />} onClick={() => pull(false)}>下载到浏览器</Button>
            <Input style={{ width: 240 }} addonBefore="另存到" value={toPath} onChange={(e) => setToPath(e.target.value)} placeholder="/root/downloads/" disabled={!toPath} />
            <Button loading={busy} onClick={() => pull(true)} disabled={!toPath}>保存到该路径</Button>
          </Space>
        </Space>
      )}
    </Space>
  );
}
