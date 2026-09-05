import { useEffect, useState } from 'react';
import { Card, Table, Tag, Space, Button, Modal, Form, Input, Switch, Alert, message, Popconfirm, Descriptions } from 'antd';
import { PlusOutlined, GlobalOutlined, SafetyCertificateOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';

export default function Websites() {
  const [data, setData] = useState<any>({ sites: [], nginx: {} });
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [load2, setLoad2] = useState(false);

  const load = () => api.get('/websites').then(setData);
  useEffect(() => { load(); }, []);

  const save = async (v: any) => {
    setLoad2(true);
    try {
      const domains = String(v.domains || '').split(/[,\s]+/).filter(Boolean);
      const r = await api.post('/websites', { ...v, domains });
      message.success(r.conf?.ok ? '站点已创建并写入 nginx' : '站点已保存,' + (r.conf?.error || ''));
      setOpen(false); form.resetFields(); load();
    } catch (e: any) { message.error(e.message); }
    setLoad2(false);
  };
  const rm = async (id: string) => { try { await api.del('/websites/' + id); message.success('已删除'); load(); } catch (e: any) { message.error(e.message); } };
  const ssl = async (s: any) => { try { const r = await api.post(`/websites/${s.id}/ssl`, {}); message.success(r.conf?.ok ? '证书已生成并启用 HTTPS' : '已生成,' + (r.conf?.error || '')); load(); } catch (e: any) { message.error(e.message); } };

  const cols = [
    { title: '站点', render: (_: any, r: any) => <b>{r.name}</b> },
    { title: '域名', dataIndex: 'domains', render: (d: string[]) => (d || []).join(' , ') || <Tag>默认 _</Tag> },
    { title: '类型', width: 90, dataIndex: 'type', render: (t: string) => t === 'proxy' ? <Tag color="blue">反代</Tag> : <Tag>静态</Tag> },
    { title: '根目录/上游', width: 240, render: (_: any, r: any) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.proxy_pass || r.root}</span> },
    { title: 'HTTPS', width: 90, render: (_: any, r: any) => r.ssl ? <Tag color="green">443 已启用</Tag> : <Tag>未启用</Tag> },
    { title: '状态', width: 80, render: (_: any, r: any) => r.enabled === false ? <Tag>停用</Tag> : <Tag color="green">启用</Tag> },
    { title: '操作', width: 190, render: (_: any, r: any) => (
      <Space size={4}>
        <Button size="small" icon={<SafetyCertificateOutlined />} onClick={() => ssl(r)}>自签SSL</Button>
        <Popconfirm title="删除站点及其 nginx 配置?" onConfirm={() => rm(r.id)}><Button size="small" danger>删除</Button></Popconfirm>
      </Space>) },
  ];

  return (
    <Card size="small" title={<Space><GlobalOutlined style={{ color: '#13c2c2' }} /><b>网站管理(Nginx 虚拟主机)</b>
      <Tag color={data.nginx?.present ? 'green' : 'default'}>{data.nginx?.present ? `nginx ${data.nginx.version}` : '未检测到 nginx'}</Tag>
      {data.nginx?.running ? <Tag color="blue">运行中</Tag> : null}
    </Space>}
      extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新建站点</Button></Space>}>
      {!data.nginx?.present && <Alert type="warning" showIcon style={{ marginBottom: 10 }} message="本机未检测到 nginx。可在「中间件/工具库」部署,或先保存站点定义后到装有 nginx 的主机配置(confDir 需可写)。" />}
      <Table rowKey="id" size="small" dataSource={data.sites} columns={cols as any} pagination={false} />
      <Modal title="新建站点" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="创建" confirmLoading={load2} width={560}>
        <Form form={form} layout="vertical" onFinish={save} initialValues={{ type: 'static' }}>
          <Form.Item name="name" label="站点名称" rules={[{ required: true }]}><Input placeholder="如 mysite" /></Form.Item>
          <Form.Item name="domains" label="域名(逗号/空格分隔)"><Input placeholder="www.example.com example.com" /></Form.Item>
          <Form.Item name="type" label="类型"><Input.Group compact>
            <Form.Item name="type" noStyle><Input style={{ width: 100 }} disabled /></Form.Item>
            <Form.Item name="proxy_pass" style={{ marginBottom: 0 }} label="" tooltip="填上游地址即反代模式">
              <Input placeholder="反代: http://127.0.0.1:3000 (填了即反代,留空为静态)" /></Form.Item>
          </Input.Group></Form.Item>
          <Form.Item name="root" label="站点根目录(静态模式)"><Input placeholder="/www/wwwroot/mysite" /></Form.Item>
          <Form.Item name="extra" label="扩展 nginx 指令(可选)"><Input.TextArea rows={2} placeholder="如 client_max_body_size 100m;" /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
