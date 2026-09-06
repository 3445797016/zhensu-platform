import { useEffect, useState } from 'react';
import { Card, Tabs, Table, Button, Space, Modal, Form, Input, Select, Tag, App, Popconfirm, Drawer, Alert, Timeline, InputNumber, Typography } from 'antd';
import { PlusOutlined, PlayCircleOutlined, DeleteOutlined, CodeOutlined } from '@ant-design/icons';
import MonacoEditor from '@monaco-editor/react';
import { api } from '../api';
import DevOpsToolchain from './DevOpsCI';
import AnsiblePage from './Ansible';

export default function DevOps() {
  return (
    <Tabs defaultActiveKey="pipeline" items={[
      { key: 'pipeline', label: '流水线', children: <Pipelines /> },
      { key: 'releases', label: '发布记录', children: <Releases /> },
      { key: 'scripts', label: '脚本库', children: <Scripts /> },
      { key: 'env', label: '环境管理', children: <Envs /> },
      { key: 'cicd', label: 'CI/CD 工具链', children: <DevOpsToolchain /> },
      { key: 'ansible', label: 'Ansible 自动化', children: <AnsiblePage /> },
    ]} />
  );
}

function Pipelines() {
  const [list, setList] = useState<any[]>([]);
  const [hosts, setHosts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const load = async () => { setList(await api.get('/devops/pipelines')); setHosts(await api.get('/hosts')); };
  useEffect(() => { load(); }, []);
  const save = async (v: any) => {
    try { v.steps = JSON.parse(v.stepsJson || '[]'); } catch { message.error('stepsJson 不是合法 JSON'); return; }
    delete v.stepsJson;
    await api.post('/devops/pipelines', v); message.success('已保存'); setOpen(false); load();
  };
  const run = async (p: any, hostId: string) => {
    const r = await api.post(`/devops/pipelines/${p.id}/run`, { hostId });
    r.ok ? message.success(`流水线运行结束: ${r.status}`) : message.error(r.error || '运行失败');
    load();
  };
  const cols = [
    { title: '名称', dataIndex: 'name', render: (v: string, r: any) => <b>{v}</b> },
    { title: '步骤数', render: (_: any, r: any) => r.steps?.length || 0 },
    { title: '变量', dataIndex: 'vars', render: (v: any) => (v ? Object.keys(v).map((k) => <Tag key={k}>${k}</Tag>) : '-') },
    { title: '说明', dataIndex: 'desc', ellipsis: true },
    { title: '操作', width: 320, render: (_: any, r: any) => (
      <Space>
        <Select placeholder="选择目标主机" size="small" style={{ width: 150 }} options={hosts.map((h) => ({ value: h.id, label: h.name }))}
          onSelect={(hid) => run(r, hid)} />
        <Button size="small" icon={<PlayCircleOutlined />} onClick={() => { Modal.confirm({ title: '运行到哪台主机？', content: <HostSelect hosts={hosts} onOk={async (hid) => { await run(r, hid); load(); }} /> }); }}>运行</Button>
        <Button size="small" onClick={() => { setEditing(r); form.setFieldsValue({ ...r, stepsJson: JSON.stringify(r.steps, null, 2) }); setOpen(true); }}>编辑</Button>
        <Popconfirm title="删除?" onConfirm={async () => { await api.del('/devops/pipelines/' + r.id); load(); }}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>
    ) },
  ];
  return (
    <Card size="small">
      <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ stepsJson: '[{"name":"示例","script":"echo hello","onError":"stop"}]' }); setOpen(true); }}>新建流水线</Button>
      <Table rowKey="id" dataSource={list} columns={cols} size="middle" pagination={false} />
      <Modal title={editing ? '编辑流水线' : '新建流水线'} width={760} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="name" label="流水线名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="desc" label="说明"><Input /></Form.Item>
          <Form.Item name="stepsJson" label="步骤定义（JSON 数组，每步 {name, script, timeout?, onError?}）" rules={[{ required: true }]}><MonacoEditor height={260} language="json" theme="light" options={{ minimap: { enabled: false } }} /></Form.Item>
          <Form.Item name="vars" label="变量(JSON)"><Input.TextArea rows={2} placeholder={'{"APP":"demo","PORT":"8080"}'} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

function HostSelect({ hosts, onOk }: any) {
  const [v, setV] = useState('');
  return <><Select style={{ width: '100%', margin: '12px 0' }} placeholder="选择主机" options={hosts.map((h: any) => ({ value: h.id, label: h.name }))} onChange={setV} /><Button type="primary" onClick={() => v && onOk(v)}>开始</Button></>;
}

function Releases() {
  const [list, setList] = useState<any[]>([]);
  const [cur, setCur] = useState<any>(null);
  const load = () => api.get('/devops/releases').then(setList);
  useEffect(() => { load(); }, []);
  const cols = [
    { title: '流水线', dataIndex: 'pipelineName' },
    { title: '目标主机', dataIndex: 'hostName' },
    { title: '触发', dataIndex: 'trigger' },
    { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={s === 'success' ? 'green' : 'red'}>{s}</Tag> },
    { title: '时间', dataIndex: 'time', render: (t: string) => new Date(t).toLocaleString() },
    { title: '操作', render: (_: any, r: any) => <Button size="small" onClick={() => setCur(r)}>查看详情</Button> },
  ];
  return <Card size="small">
    <Table rowKey="id" dataSource={list} columns={cols} size="middle" pagination={{ pageSize: 15 }} />
    <Drawer title={`发布详情 · ${cur?.pipelineName || ''}`} width={700} open={!!cur} onClose={() => setCur(null)}>
      {cur?.steps?.map((s: any, i: number) => (
        <Card key={i} size="small" style={{ marginBottom: 10 }} title={`${i + 1}. ${s.name}`} extra={<Tag color={s.status === 'success' ? 'green' : s.status === 'failed' ? 'red' : 'processing'}>{s.status}</Tag>}>
          <pre style={{ background: '#f6f8fa', padding: 10, borderRadius: 6, fontSize: 11, maxHeight: 260, overflow: 'auto' }}>{s.output}</pre>
        </Card>
      ))}
    </Drawer>
  </Card>;
}

function Scripts() {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const load = () => api.get('/devops/scripts').then(setList);
  useEffect(() => { load(); }, []);
  const cols = [
    { title: '名称', dataIndex: 'name', render: (v: string) => <b>{v}</b> },
    { title: '标签', dataIndex: 'tags', render: (t: string[]) => (t || []).map((x) => <Tag key={x}>{x}</Tag>) },
    { title: '内容', dataIndex: 'content', ellipsis: true },
    { title: '操作', width: 100, render: (_: any, r: any) => <Popconfirm title="删除?" onConfirm={async () => { await api.del('/devops/scripts/' + r.id); load(); }}><Button size="small" danger>删</Button></Popconfirm> },
  ];
  return <Card size="small">
    <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setOpen(true)}>新增脚本</Button>
    <Table rowKey="id" dataSource={list} columns={cols} size="middle" pagination={false} />
    <Modal title="新增脚本" width={700} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={async (v) => { await api.post('/devops/scripts', v); setOpen(false); load(); }}>
        <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="content" label="脚本内容" rules={[{ required: true }]}><Input.TextArea rows={8} /></Form.Item>
      </Form>
    </Modal>
  </Card>;
}

function Envs() {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const load = () => api.get('/devops/envs').then(setList);
  useEffect(() => { load(); }, []);
  const cols = [
    { title: '环境名', dataIndex: 'name', render: (v: string) => <b>{v}</b> },
    { title: '服务器地址', dataIndex: 'server' },
    { title: '类型', dataIndex: 'kind' },
  ];
  return <Card size="small">
    <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setOpen(true)}>新增环境</Button>
    <Table rowKey="id" dataSource={list} columns={cols} size="middle" pagination={false} />
    <Modal title="新增环境" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={async (v) => { await api.post('/devops/envs', v); setOpen(false); load(); }}>
        <Form.Item name="name" label="环境名" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="server" label="服务器"><Input /></Form.Item>
        <Form.Item name="kind" label="类型"><Input placeholder="prod/staging/dev" /></Form.Item>
      </Form>
    </Modal>
  </Card>;
}
