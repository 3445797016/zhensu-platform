import { useEffect, useState } from 'react';
import {
  Card, Tabs, Table, Tag, Space, Button, Select, Input, Modal, message, Alert, Popconfirm, Row, Col, Statistic, Tooltip, Typography,
} from 'antd';
import { FireOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined, LockOutlined, UnlockOutlined, GlobalOutlined } from '@ant-design/icons';
import { api } from '../api';

export default function Firewall() {
  const [d, setD] = useState<any>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const load = () => api.get('/firewall').then(setD).catch((e) => message.error(e.message));
  useEffect(() => { load(); }, []);
  return (
    <div>
      <Card size="small" style={{ marginBottom: 14 }} title={
        <Space><FireOutlined style={{ color: '#fa541c' }} /><b>防火墙</b>
          <Tag color={d?.ufw ? 'green' : 'blue'}>{d?.ufw ? 'ufw 状态化防火墙' : 'iptables'}</Tag>
          {d && <span style={{ fontSize: 12, color: '#888' }}>监听服务 {d.listening?.length} 个 · 规则 {d.ruleCount} 条</span>}
        </Space>}
        extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>刷新</Button></Space>}>
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="规则直接作用于 INPUT 链。误删/误拒可能断连,请勿封禁 SSH(22)与面板端口。" />
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={4}><Card size="small"><Statistic title="默认策略(INPUT)" value={d?.policy || '-'} valueStyle={{ color: d?.policy === 'DROP' ? '#ff4d4f' : '#52c41a' }} suffix={<Button size="small" type="link" icon={<LockOutlined />} onClick={() => setPolicyOpen(true)}>调整</Button>} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="规则总数" value={d?.ruleCount || 0} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="累计流量" value={fmtBytes(d?.bytes)} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="累计包数" value={d?.pkts || 0} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="被拒绝命中" value={d?.deniedPkts || 0} valueStyle={{ color: d?.deniedPkts ? '#faad14' : undefined }} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="监听端口" value={d?.listening?.length || 0} /></Card></Col>
        </Row>
      </Card>
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Tabs defaultActiveKey="port" items={[
          { key: 'port', label: '🔓 端口放行', children: <PortTab d={d} onChanged={load} /> },
          { key: 'ip', label: '🚫 IP 封禁 / 放行', children: <IpTab d={d} onChanged={load} /> },
          { key: 'listen', label: '🖥 监听端口与服务', children: <ListenTab d={d} onChanged={load} /> },
        ]} />
      </Card>
      <PolicyModal open={policyOpen} onClose={() => setPolicyOpen(false)} onDone={load} policy={d?.policy} />
    </div>
  );
}

const fmtBytes = (n: number) => { if (!n) return '0'; if (n >= 1073741824) return (n / 1073741824).toFixed(1) + 'GB'; if (n >= 1048576) return (n / 1048576).toFixed(1) + 'MB'; if (n >= 1024) return (n / 1024).toFixed(0) + 'KB'; return n + 'B'; };

function PortTab({ d, onChanged }: any) {
  const [proto, setProto] = useState('tcp');
  const [port, setPort] = useState('');
  const [source, setSource] = useState('');
  const add = async (kind: 'allow' | 'deny') => {
    if (!port) return message.warning('请填写端口(可单端口或 8000:9000)');
    try { await api.post('/firewall', { kind, proto, port, source: source || undefined }); message.success(kind === 'allow' ? '已放行' : '已拒绝'); setPort(''); onChanged(); } catch (e: any) { message.error(e.message); }
  };
  const quick = async (p: number) => { try { await api.post('/firewall', { kind: 'allow', proto: 'tcp', port: String(p) }); message.success(`已放行 ${p}`); onChanged(); } catch (e: any) { message.error(e.message); } };
  const del = async (id: number) => { try { await api.post('/firewall/delete', { id }); onChanged(); } catch (e: any) { message.error(e.message); } };

  const cols = [
    { title: '#', width: 48, dataIndex: 'id' },
    { title: '动作', width: 90, render: (_: any, r: any) => <Tag color={r.target === 'ACCEPT' ? 'green' : 'red'}>{r.target === 'ACCEPT' ? '放行' : r.target}</Tag> },
    { title: '协议', width: 80, render: (_: any, r: any) => <Tag>{r.prot}</Tag> },
    { title: '端口', width: 110, render: (_: any, r: any) => (r.port ? <b>{r.port}</b> : <span style={{ color: '#999' }}>全部</span>) },
    { title: '来源', width: 160, render: (_: any, r: any) => <code style={{ fontSize: 12 }}>{r.src}</code> },
    { title: '目的', width: 160, render: (_: any, r: any) => <code style={{ fontSize: 12 }}>{r.dst}</code> },
    { title: '命中', width: 100, render: (_: any, r: any) => <Tooltip title={`${fmtBytes(r.bytes)}`}><span>{r.pkts} 包</span></Tooltip> },
    { title: '备注', dataIndex: 'comment', render: (c: string) => (c ? <Tag color="cyan">{c}</Tag> : '-') },
    { title: '操作', width: 80, render: (_: any, r: any) => (
      <Popconfirm title="删除该规则?" onConfirm={() => del(r.id)}><Button size="small" danger type="text" icon={<DeleteOutlined />} /></Popconfirm>) },
  ];

  const rows = (d?.rules || []).filter((r: any) => r.prot !== 'all' || r.port);
  return (
    <div style={{ padding: 12 }}>
      <Space wrap style={{ marginBottom: 10 }}>
        <Select style={{ width: 100 }} value={proto} onChange={setProto} options={[{ value: 'tcp', label: 'TCP' }, { value: 'udp', label: 'UDP' }]} />
        <Input style={{ width: 180 }} placeholder="端口 8000 或 8000:9000" value={port} onChange={(e) => setPort(e.target.value)} />
        <Input style={{ width: 180 }} placeholder="来源 IP/网段(留空=全部)" value={source} onChange={(e) => setSource(e.target.value)} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => add('allow')}>放行</Button>
        <Button danger icon={<LockOutlined />} onClick={() => add('deny')}>拒绝</Button>
      </Space>
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#888', marginRight: 8 }}>常用端口快捷放行:</span>
        {(d?.commonPorts || []).map((p: number) => <Button key={p} size="small" style={{ marginRight: 6 }} onClick={() => quick(p)}>{p}</Button>)}
      </div>
      <Table rowKey="id" size="small" dataSource={rows} columns={cols as any} pagination={{ pageSize: 12 }} />
    </div>
  );
}

function IpTab({ d, onChanged }: any) {
  const [ip, setIp] = useState('');
  const [kind, setKind] = useState('deny');
  const apply = async () => {
    if (!ip) return message.warning('填写来源 IP/网段');
    try { await api.post('/firewall', { kind, proto: 'any', source: ip, comment: 'ip-rule' }); message.success(kind === 'deny' ? '已封禁' : '已放行'); setIp(''); onChanged(); } catch (e: any) { message.error(e.message); }
  };
  return (
    <div style={{ padding: 12 }}>
      <Alert type="info" showIcon style={{ marginBottom: 10 }} message="规则基于来源 IP 整段生效(封禁=丢弃该来源全部流量)。内网网段如 192.168.1.0/24 请先放行以免断网。" />
      <Space wrap style={{ marginBottom: 10 }}>
        <Select style={{ width: 120 }} value={kind} onChange={setKind} options={[{ value: 'deny', label: '封禁(DROP)' }, { value: 'allow', label: '放行(ACCEPT)' }]} />
        <Input style={{ width: 260 }} placeholder="IP 或网段,如 1.2.3.4 / 1.2.3.0/24" value={ip} onChange={(e) => setIp(e.target.value)} onPressEnter={apply} />
        <Button type={kind === 'deny' ? 'primary' : 'default'} danger={kind === 'deny'} icon={<GlobalOutlined />} onClick={apply}>执行</Button>
      </Space>
      <Table rowKey="id" size="small" dataSource={d?.rules?.filter?.((r: any) => r.prot === 'all') || []} columns={[{ title: '动作', width: 100, render: (_: any, r: any) => <Tag color={r.target === 'ACCEPT' ? 'green' : 'red'}>{r.target}</Tag> }, { title: '来源', render: (_: any, r: any) => <code>{r.src}</code> }, { title: '命中', width: 140, render: (_: any, r: any) => `${r.pkts} 包` }, { title: '操作', width: 90, render: (_: any, r: any) => <Popconfirm title="解封/删除?" onConfirm={async () => { try { await api.post('/firewall/delete', { id: r.id }); onChanged(); } catch (e: any) { message.error(e.message); } }}><Button size="small" type="text" danger icon={<UnlockOutlined />}>解除</Button></Popconfirm> }] as any} pagination={false} />
    </div>
  );
}

function ListenTab({ d, onChanged }: any) {
  const allow = async (p: number, proto: string) => { try { await api.post('/firewall', { kind: 'allow', proto, port: String(p) }); message.success(`已放行 ${proto}/${p}`); onChanged(); } catch (e: any) { message.error(e.message); } };
  const cols = [
    { title: '协议', width: 80, dataIndex: 'proto', render: (t: string) => <Tag>{t}</Tag> },
    { title: '端口', width: 110, dataIndex: 'port', render: (p: number) => <b>{p}</b> },
    { title: '监听地址', dataIndex: 'addr', render: (a: string) => <code style={{ fontSize: 12 }}>{a}</code> },
    { title: '进程', width: 200, render: (_: any, r: any) => <Tag color="geekblue">{r.proc || '-'}</Tag> },
    { title: 'PID', width: 90, dataIndex: 'pid' },
    { title: '操作', width: 110, render: (_: any, r: any) => <Button size="small" onClick={() => allow(r.port, r.proto)}>放行该端口</Button> },
  ];
  return (
    <div style={{ padding: 12 }}>
      <Alert type="info" showIcon style={{ marginBottom: 10 }} message="以下为本机当前监听端口与归属服务;对公网暴露的服务请确认是否有意为之(常见风险:数据库/管理面板裸奔)。" />
      <Table rowKey={(r: any) => r.proto + r.port + r.pid} size="small" dataSource={d?.listening || []} columns={cols as any} pagination={false} />
    </div>
  );
}

function PolicyModal({ open, onClose, onDone, policy }: any) {
  const [text, setText] = useState('');
  const target = text.toLowerCase() === 'drop' ? 'DROP' : text.toLowerCase() === 'accept' ? 'ACCEPT' : '';
  const apply = async () => {
    try { const r = await api.post('/firewall/policy', { target, confirm: 'yes' }); message.success(r.unchanged ? '已是该策略' : `默认策略已改为 ${r.to}`); onClose(); onDone(); } catch (e: any) { message.error(e.message); }
  };
  return (
    <Modal title="调整 INPUT 默认策略" open={open} onCancel={onClose} footer={null} width={460}>
      <Alert type="error" showIcon style={{ marginBottom: 8 }} message="改为 DROP 会默认丢弃所有新入站连接,必须先放行 SSH/面板端口!后端会在 DROP 前自动确保 22 放行,但请谨慎。" />
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Text>当前策略:<Tag color={policy === 'DROP' ? 'red' : 'green'}>{policy}</Tag></Typography.Text>
        <Input placeholder={'输入 drop 改为拒绝一切 / 输入 accept 改为放行一切'} value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="primary" danger disabled={!target} onClick={apply}>确认修改为 {target}</Button>
      </Space>
    </Modal>
  );
}
