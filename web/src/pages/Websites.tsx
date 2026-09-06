import { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Modal, Form, Input, Switch, Select, Alert, message, Popconfirm, Tabs, Tooltip, Typography,
} from 'antd';
import { PlusOutlined, GlobalOutlined, SafetyCertificateOutlined, ReloadOutlined, EditOutlined, EyeOutlined, PoweroffOutlined, CaretUpOutlined } from '@ant-design/icons';
import { api } from '../api';

const { Text } = Typography;

function featsDefault() {
  return {
    lb: { enabled: false, method: 'round_robin', backends: [] },
    hotlink: { enabled: false, allow: '', types: 'jpg|jpeg|png|gif|webp|bmp', action: '403', target: '' },
    cache: { enabled: false, expires: '7d', types: 'js|css|jpg|jpeg|png|gif|svg|woff2|ttf|ico' },
    gzip: false, bodySize: '', httpsRedirect: false,
    rateLimit: { enabled: false, rate: '5r/s', burst: 10 },
  };
}

export default function Websites() {
  const [data, setData] = useState<any>({ sites: [], nginx: {} });
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [viewConf, setViewConf] = useState<any>(null);
  const [lbText, setLbText] = useState('');
  const [load2, setLoad2] = useState(false);
  const [form] = Form.useForm();
  const [tab, setTab] = useState('basic');

  const load = () => api.get('/websites').then(setData);
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEdit(null); form.resetFields(); form.setFieldsValue({ feats: featsDefault(), index: 'index.html index.htm' }); setLbText(''); setTab('basic'); setOpen(true); };
  const openEdit = (s: any) => {
    setEdit(s);
    const feats = { ...featsDefault(), ...(s.feats || {}) };
    form.setFieldsValue({ ...s, feats, lbEnabled: feats.lb.enabled });
    setLbText((feats.lb.backends || []).join('\n'));
    setTab('basic'); setOpen(true);
  };

  const save = async () => {
    const v = await form.validateFields();
    setLoad2(true);
    try {
      const domains = String(v.domains || '').split(/[,\s]+/).filter(Boolean);
      const feats = { ...featsDefault(), ...v.feats };
      feats.lb.backends = lbText.split('\n').map((s: string) => s.trim()).filter(Boolean);
      const payload = { ...v, domains, feats, index: v.index || 'index.html index.htm' };
      const r = edit ? await api.put('/websites/' + edit.id, payload) : await api.post('/websites', payload);
      if (r.conf?.ok) message.success(edit ? '已更新并写入 nginx' : '站点已创建并写入 nginx');
      else message.warning((r.conf?.error ? '已保存,但 ' : '') + (r.conf?.error || ''), 6);
      setOpen(false); load();
    } catch (e: any) { message.error(e.message); }
    setLoad2(false);
  };

  const toggle = async (s: any) => { const r = await api.put('/websites/' + s.id, { enabled: s.enabled === false }); r.conf?.ok ? message.success('状态已切换') : message.warning(r.conf?.error || ''); load(); };
  const rm = async (id: string) => { try { await api.del('/websites/' + id); message.success('已删除'); load(); } catch (e: any) { message.error(e.message); } };
  const ssl = async (s: any) => { try { const r = await api.post(`/websites/${s.id}/ssl`, {}); message.success(r.conf?.ok ? '证书已生成并启用 HTTPS' : '已生成,' + (r.conf?.error || '')); load(); } catch (e: any) { message.error(e.message); } };

  const featTags = (r: any) => {
    const f = r.feats || {}; const out = [];
    if (f.lb?.enabled && f.lb.backends?.length) out.push(<Tag key="lb" color="volcano">负载均衡 ×{f.lb.backends.length}</Tag>);
    if (f.hotlink?.enabled) out.push(<Tag key="hot" color="purple">防盗链</Tag>);
    if (f.cache?.enabled) out.push(<Tag key="cache" color="cyan">缓存 {f.cache.expires}</Tag>);
    if (f.gzip) out.push(<Tag key="gz" color="geekblue">gzip</Tag>);
    if (f.rateLimit?.enabled) out.push(<Tag key="rl" color="orange">限流 {f.rateLimit.rate}</Tag>);
    if (r.ssl && f.httpsRedirect) out.push(<Tag key="h2s" color="green">强制HTTPS</Tag>);
    return out.length ? <Space size={4} wrap>{out}</Space> : <Text type="secondary">-</Text>;
  };

  const cols = [
    { title: '站点', render: (_: any, r: any) => <b>{r.name}</b> },
    { title: '域名', dataIndex: 'domains', render: (d: string[]) => (d || []).join(' , ') || <Tag>默认 _</Tag> },
    { title: '类型', width: 90, render: (_: any, r: any) => r.feats?.lb?.enabled && r.feats.lb.backends?.length ? <Tag color="volcano">负载均衡</Tag> : (r.proxy_pass ? <Tag color="blue">反代</Tag> : <Tag>静态</Tag>) },
    { title: '高级功能', render: (_: any, r: any) => featTags(r) },
    { title: '目标', width: 200, ellipsis: true, render: (_: any, r: any) => <Text code style={{ fontSize: 11 }}>{r.proxy_pass || r.root}</Text> },
    { title: 'HTTPS', width: 90, render: (_: any, r: any) => r.ssl ? <Tag color="green">443</Tag> : <Tag>无</Tag> },
    { title: '状态', width: 70, render: (_: any, r: any) => r.enabled === false ? <Tag>停用</Tag> : <Tag color="green">启用</Tag> },
    { title: '操作', width: 300, render: (_: any, r: any) => (
      <Space size={4}>
        <Tooltip title="编辑"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
        <Tooltip title="查看配置"><Button size="small" icon={<EyeOutlined />} onClick={() => setViewConf(r)} /></Tooltip>
        <Button size="small" icon={<SafetyCertificateOutlined />} disabled={r.ssl} onClick={() => ssl(r)}>SSL</Button>
        <Tooltip title={r.enabled === false ? '启用' : '停用'}><Button size="small" icon={<PoweroffOutlined />} onClick={() => toggle(r)} /></Tooltip>
        <Popconfirm title="删除站点及其 nginx 配置?" onConfirm={() => rm(r.id)}><Button size="small" danger>删除</Button></Popconfirm>
      </Space>) },
  ];

  return (
    <Card size="small" title={<Space><GlobalOutlined style={{ color: '#13c2c2' }} /><b>网站管理(Nginx 虚拟主机)</b>
      <Tag color={data.nginx?.present ? 'green' : 'default'}>{data.nginx?.present ? `nginx ${data.nginx.version}` : '未检测到 nginx'}</Tag>
      {data.nginx?.running ? <Tag color="blue">运行中</Tag> : null}
    </Space>}
      extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建站点</Button></Space>}>
      {!data.nginx?.present && <Alert type="warning" showIcon style={{ marginBottom: 10 }} message="本机未检测到 nginx,配置将在检测到 nginx 后自动下发;当前可先保存站点定义。" />}
      <Table rowKey="id" size="small" dataSource={data.sites} columns={cols as any} pagination={false} />

      <Modal title={edit ? '编辑站点(保存即下发 nginx)' : '新建站点'} width={780} open={open} onCancel={() => setOpen(false)} onOk={save} okText={edit ? '保存并下发' : '创建'} confirmLoading={load2} destroyOnClose>
        <Tabs activeKey={tab} onChange={setTab} items={[
          { key: 'basic', label: '基础', children: <Form form={form} layout="vertical">
            <Form.Item name="name" label="站点名称" rules={[{ required: true }]}><Input placeholder="如 mysite" /></Form.Item>
            <Form.Item name="domains" label="域名(逗号/空格分隔)"><Input placeholder="www.example.com example.com" /></Form.Item>
            <Form.Item name="proxy_pass" label="反向代理目标" tooltip="填 http://IP:端口 即代理到该后端;留空则走静态目录"><Input placeholder="http://127.0.0.1:3000" /></Form.Item>
            <Form.Item name="root" label="站点根目录(静态模式)"><Input placeholder="/www/wwwroot/mysite" /></Form.Item>
            <Form.Item name="index" label="默认索引页"><Input placeholder="index.html index.htm" /></Form.Item>
          </Form> },
          { key: 'lb', label: '负载均衡', children: <Form form={form} layout="vertical">
            <Form.Item name={['feats', 'lb', 'enabled']} label="启用负载均衡(多后端自动轮询)" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name={['feats', 'lb', 'method']} label="调度算法"><Select options={[{ value: 'round_robin', label: '轮询 round_robin' }, { value: 'least_conn', label: '最小连接 least_conn' }, { value: 'ip_hash', label: '会话保持 ip_hash' }]} /></Form.Item>
            <Form.Item label="后端服务器(每行一个,支持权重)">
              <Input.TextArea rows={5} value={lbText} onChange={(e) => setLbText(e.target.value)} placeholder={'http://192.168.1.10:8080 weight=1\nhttp://192.168.1.11:8080 weight=2 max_fails=2 fail_timeout=30s'} />
            </Form.Item>
            <Alert type="info" showIcon message="启用后反向代理自动指向该 upstream 组;算法:轮询/最小连接/源IP会话保持。" />
          </Form> },
          { key: 'hot', label: '防盗链', children: <Form form={form} layout="vertical">
            <Form.Item name={['feats', 'hotlink', 'enabled']} label="启用防盗链" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name={['feats', 'hotlink', 'allow']} label="允许来源域名(逗号分隔,留空仅允许本域与无来源)">
              <Input placeholder="example.com api.example.com" />
            </Form.Item>
            <Form.Item name={['feats', 'hotlink', 'types']} label="保护文件类型(| 分隔)"><Input placeholder="jpg|jpeg|png|gif|webp|bmp" /></Form.Item>
            <Form.Item name={['feats', 'hotlink', 'action']} label="盗链处理"><Select options={[{ value: '403', label: '返回 403 拒绝' }, { value: '404', label: '假装 404(隐藏)' }, { value: 'redirect', label: '302 跳转到提示图' }]} /></Form.Item>
            <Form.Item noStyle shouldUpdate>{(f) => f.getFieldValue(['feats', 'hotlink', 'action']) === 'redirect' ? <Form.Item name={['feats', 'hotlink', 'target']} label="提示图/地址"><Input placeholder="https://your.cdn/anti-leech.png" /></Form.Item> : null}</Form.Item>
          </Form> },
          { key: 'cache', label: '缓存 / gzip', children: <Form form={form} layout="vertical">
            <Form.Item name={['feats', 'cache', 'enabled']} label="启用静态资源缓存" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name={['feats', 'cache', 'expires']} label="缓存时长"><Input placeholder="7d" /></Form.Item>
            <Form.Item name={['feats', 'cache', 'types']} label="缓存类型(| 分隔)"><Input placeholder="js|css|jpg|png|svg|woff2" /></Form.Item>
            <Form.Item name={['feats', 'gzip']} label="启用 gzip 压缩" valuePropName="checked"><Switch /></Form.Item>
          </Form> },
          { key: 'sec', label: '安全 / 性能', children: <Form form={form} layout="vertical">
            <Form.Item name={['feats', 'bodySize']} label="上传大小限制 client_max_body_size"><Input placeholder="100m" /></Form.Item>
            <Form.Item name={['feats', 'rateLimit', 'enabled']} label="启用访问限流(防刷)" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name={['feats', 'rateLimit', 'rate']} label="速率"><Input placeholder="5r/s" style={{ width: 160 }} /></Form.Item>
            <Form.Item name={['feats', 'rateLimit', 'burst']} label="突发峰值"><Input placeholder="10" style={{ width: 160 }} /></Form.Item>
            <Form.Item name={['feats', 'httpsRedirect']} label="HTTP 自动跳转 HTTPS(需先开启 SSL)" valuePropName="checked"><Switch /></Form.Item>
          </Form> },
          { key: 'extra', label: '扩展指令', children: <Form form={form} layout="vertical">
            <Form.Item name="extra" label="额外 nginx 指令(将插入 server 块末尾)">
              <Input.TextArea rows={6} placeholder={'location /api/ { proxy_pass http://127.0.0.1:8000; }\nadd_header X-Frame-Options SAMEORIGIN;'} />
            </Form.Item>
          </Form> },
        ]} />
      </Modal>

      <Modal title={`nginx 配置 · ${viewConf?.name || ''}`} open={!!viewConf} onCancel={() => setViewConf(null)} footer={<Button type="primary" onClick={() => setViewConf(null)}>关闭</Button>} width={720}>
        <pre style={{ background: '#0b1021', color: '#d0d7e5', padding: 14, borderRadius: 6, fontSize: 11.5, maxHeight: 560, overflow: 'auto' }}>{viewConf?.conf || ''}</pre>
      </Modal>
    </Card>
  );
}
