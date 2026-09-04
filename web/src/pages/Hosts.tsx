import { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, Switch, App, Row, Col, Card, Statistic, Drawer, Descriptions, Progress, Popconfirm, Segmented } from 'antd';
import { PlusOutlined, CodeOutlined, ApiOutlined, ReloadOutlined, DashboardOutlined, DeleteOutlined, ToolOutlined } from '@ant-design/icons';
import { api } from '../api';
import TerminalModal from '../components/Terminal';
import HostOps from '../components/HostOps';

export default function Hosts() {
  const [hosts, setHosts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [term, setTerm] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [ops, setOps] = useState<any>(null);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [cmd, setCmd] = useState('');
  const [cmdOut, setCmdOut] = useState('');
  const [cmdHost, setCmdHost] = useState<any>(null);
  const [execing, setExecing] = useState(false);

  const load = async () => setHosts(await api.get('/hosts'));
  useEffect(() => { load(); }, []);

  const save = async (v: any) => {
    const isLocal = v.kind === 'local';
    const body = { ...v, kind: v.kind || 'local', host: isLocal ? undefined : v.host, user: isLocal ? undefined : v.user, password: isLocal ? undefined : v.password, privateKey: isLocal ? undefined : v.privateKey };
    if (edit) await api.put('/hosts/' + edit.id, body); else await api.post('/hosts', body);
    message.success('已保存'); setOpen(false); form.resetFields(); load();
  };

  const showMetrics = async (h: any) => { setMetrics({ loading: true, h }); const m = await api.get('/hosts/' + h.id + '/metrics'); setMetrics({ ...m, h }); };
  const testConn = async (h: any) => { message.loading('测试中...'); const r = await api.post(`/hosts/${h.id}/test`); r.ok ? message.success(`连接成功: ${r.os}`) : message.error(r.error || '连接失败'); load(); };
  const runCmd = async () => { setExecing(true); const r = await api.post(`/hosts/${cmdHost.id}/exec`, { command: cmd }); setCmdOut(`$ ${cmd}\n[退出码 ${r.code}]\n${r.stdout}${r.stderr && '\n[stderr]\n' + r.stderr}`); setExecing(false); };

  const cols = [
    { title: '名称', dataIndex: 'name', render: (_: any, h: any) => <b>{h.name}</b> },
    { title: '类型', dataIndex: 'kind', width: 80, render: (k: string) => k === 'local' ? <Tag color="gold">本机</Tag> : <Tag color="geekblue">SSH</Tag> },
    { title: '连接', render: (_: any, h: any) => h.kind === 'local' ? <Tag>local</Tag> : <span>{h.user}@{h.host}:{h.port}</span> },
    { title: '系统', dataIndex: 'os', ellipsis: true },
    { title: '标签', dataIndex: 'tags', render: (t: string[]) => (t || []).map((x) => <Tag key={x}>{x}</Tag>) },
    { title: '最近在线', dataIndex: 'lastSeen', render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
    { title: '操作', render: (_: any, h: any) => (
      <Space size={2}>
        <Button size="small" type="primary" ghost icon={<CodeOutlined />} onClick={() => setTerm(h)}>终端</Button>
        <Button size="small" icon={<ToolOutlined />} onClick={() => setOps(h)}>运维</Button>
        <Button size="small" icon={<DashboardOutlined />} onClick={() => showMetrics(h)}>监控</Button>
        <Button size="small" icon={<ApiOutlined />} onClick={() => setCmdHost(h)}>执行</Button>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => testConn(h)}>测连</Button>
        <Button size="small" onClick={() => { setEdit(h); form.setFieldsValue(h); setOpen(true); }}>编辑</Button>
        <Popconfirm title="删除该主机?" onConfirm={async () => { await api.del('/hosts/' + h.id); message.success('已删除'); load(); }}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    ) },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEdit(null); form.resetFields(); form.setFieldsValue({ kind: 'local', port: 22, authType: 'password' }); setOpen(true); }}>添加宿主机 / VM</Button>
      </Space>
      <Table rowKey="id" dataSource={hosts} columns={cols} size="middle" pagination={{ pageSize: 10 }} />

      <Modal title={edit ? '编辑主机' : '添加主机 / VM'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} width={640} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={save} initialValues={{ port: 22 }}>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder="如：Web 服务器-01" /></Form.Item></Col>
            <Col span={12}><Form.Item name="kind" label="连接类型"><Select options={[{ value: 'local', label: '本机（Linux）' }, { value: 'ssh', label: 'SSH 远程' }]} onChange={() => form.setFieldsValue({ host: undefined })} /></Form.Item></Col>
          </Row>
          <Form.Item noStyle shouldUpdate={(a, b) => a.kind !== b.kind}>
            {({ getFieldValue }) => getFieldValue('kind') === 'ssh' ? (
              <>
                <Row gutter={12}>
                  <Col span={12}><Form.Item name="host" label="主机地址" rules={[{ required: true }]}><Input placeholder="IP 或域名" /></Form.Item></Col>
                  <Col span={6}><Form.Item name="port" label="端口"><Input type="number" /></Form.Item></Col>
                  <Col span={6}><Form.Item name="user" label="用户名"><Input placeholder="root" /></Form.Item></Col>
                </Row>
                <Form.Item name="authType" label="认证方式"><Select options={[{ value: 'password', label: '密码' }, { value: 'key', label: '私钥' }]} /></Form.Item>
                <Form.Item noStyle shouldUpdate={(a, b) => a.authType !== b.authType}>
                  {({ getFieldValue }) => getFieldValue('authType') === 'key'
                    ? <Form.Item name="privateKey" label="私钥内容（PEM）"><Input.TextArea rows={4} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" /></Form.Item>
                    : <Form.Item name="password" label="密码"><Input.Password /></Form.Item>}
                </Form.Item>
                <Form.Item name="sudo" valuePropName="checked" label={<span>需要 sudo <span style={{ fontWeight: 400, color: '#999' }}>(勾选并填 sudo 密码)</span></span>}><Switch /></Form.Item>
              </>
            ) : <Form.Item name="sudo" valuePropName="checked" label="本机命令用 sudo"><Switch /></Form.Item>}
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="os" label="系统（可选）"><Input placeholder="如 Ubuntu 22.04" /></Form.Item></Col>
            <Col span={12}><Form.Item name="tags" label="标签（逗号分隔）"><Input placeholder="prod, web, dev" /></Form.Item></Col>
          </Row>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {term && <TerminalModal host={term} open onClose={() => setTerm(null)} />}
      {ops && <HostOps host={ops} open onClose={() => setOps(null)} />}

      <Modal title={`命令执行 · ${metrics?.h?.name || cmdHost?.name || ''}`} open={!!cmdHost} onCancel={() => setCmdHost(null)} footer={null} width={760} destroyOnClose>
        <Input.Search value={cmd} onChange={(e) => setCmd(e.target.value)} loading={execing} enterButton="执行"
          onSearch={runCmd} placeholder="输入要执行的命令，如: ls -la / && df -h && free -m" />
        <pre style={{ background: '#f6f8fa', color: '#1f2328', padding: 12, borderRadius: 8, maxHeight: 420, overflow: 'auto', marginTop: 12, fontSize: 12 }}>{cmdOut || '（尚无输出）'}</pre>
      </Modal>

      <Drawer title={`主机监控 · ${metrics?.h?.name || ''}`} width={560} open={!!metrics && !metrics?.loading} onClose={() => setMetrics(null)}>
        {metrics && !metrics.loading && <HostMetrics m={metrics} />}
      </Drawer>
    </div>
  );
}

function HostMetrics({ m }: any) {
  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={8}><Card size="small"><Statistic title="CPU 核数" value={m.cores} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Load(1/5/15)" value={m.load1} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="运行时长" value={m.up || '-'} /></Card></Col>
      </Row>
      <Card size="small" title="内存" style={{ marginTop: 16 }}><Progress percent={m.memTotalMb ? Math.round((m.memUsedMb / m.memTotalMb) * 100) : 0} status={m.memTotalMb && m.memUsedMb / m.memTotalMb > 0.85 ? 'exception' : 'normal'} format={() => `${m.memUsedMb} / ${m.memTotalMb} MB`} /></Card>
      <Card size="small" title="磁盘" style={{ marginTop: 12 }}>{(m.disk || []).map((x: any, i: number) => <div key={i}><Progress percent={parseInt(x.usePct) || 0} format={() => `${x.mount} ${x.used} / ${x.size}`} /></div>)}</Card>
      <Descriptions title="网络接口" column={1} size="small" style={{ marginTop: 12 }}>
        <Descriptions.Item label="地址">{m.net || '无'}</Descriptions.Item>
      </Descriptions>
    </div>
  );
}
