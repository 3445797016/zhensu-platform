import { useEffect, useState } from 'react';
import {
  Card, Table, Button, Space, Tag, Typography, Modal, Form, Input, Select, Switch,
  message, Popconfirm, Tooltip, Alert, Descriptions, Divider, Row, Col
} from 'antd';
import {
  NodeIndexOutlined, PlusOutlined, DeleteOutlined, PlayCircleOutlined,
  StopOutlined, KeyOutlined, LinkOutlined, EyeOutlined
} from '@ant-design/icons';
import { api } from '../api';
import { StatCard } from '../components/ui';

const msg = message;

export default function Tunnels() {
  const [tunnels, setTunnels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [previewCmd, setPreviewCmd] = useState('');
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/tunnels');
      setTunnels(r || []);
    } catch (e: any) {
      msg.error('加载失败: ' + e.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const openAdd = () => {
    setEditItem(null);
    form.resetFields();
    setPreviewCmd('');
    setModal(true);
  };

  const openEdit = (t: any) => {
    setEditItem(t);
    form.setFieldsValue(t);
    setPreviewCmd('');
    setModal(true);
  };

  const doPreview = async () => {
    try {
      const v = form.getFieldsValue();
      const r = await api.post('/tunnels/preview', v);
      setPreviewCmd(r.cmd || '');
    } catch { /* */ }
  };

  const save = async () => {
    const values = await form.validateFields();
    try {
      if (editItem) {
        await api.put(`/tunnels/${editItem.id}`, values);
        msg.success('已更新');
      } else {
        await api.post('/tunnels', values);
        msg.success('已添加');
      }
      setModal(false);
      load();
    } catch (e: any) {
      msg.error('保存失败: ' + e.message);
    }
  };

  const doDelete = async (id: string) => {
    try {
      await api.del(`/tunnels/${id}`);
      msg.success('已删除');
      load();
    } catch (e: any) {
      msg.error('删除失败: ' + e.message);
    }
  };

  const doStart = async (id: string) => {
    try {
      const r = await api.post(`/tunnels/${id}/start`);
      if (r.ok) msg.success('隧道已启动');
      else msg.error(r.error || '启动失败');
      load();
    } catch (e: any) {
      msg.error('启动失败: ' + e.message);
    }
  };

  const doStop = async (id: string) => {
    try {
      const r = await api.post(`/tunnels/${id}/stop`);
      if (r.ok) msg.success('隧道已停止');
      else msg.error(r.error || '停止失败');
      load();
    } catch (e: any) {
      msg.error('停止失败: ' + e.message);
    }
  };

  const typeTag = (type: string) => {
    const colors: any = { local: 'blue', remote: 'orange', dynamic: 'purple' };
    const labels: any = { local: '本地转发', remote: '远程转发', dynamic: 'SOCKS5' };
    return <Tag color={colors[type] || 'default'}>{labels[type] || type}</Tag>;
  };

  const columns = [
    {
      title: '名称', dataIndex: 'name', key: 'name',
      render: (v: string, r: any) => (
        <Space>
          {typeTag(r.type)}
          <Typography.Text strong>{v}</Typography.Text>
          {r.running ? <Tag color="green">运行中</Tag> : <Tag>已停止</Tag>}
        </Space>
      ),
    },
    {
      title: '本地', key: 'local', width: 180,
      render: (_: any, r: any) => `${r.localHost || '0.0.0.0'}:${r.localPort}`,
    },
    {
      title: '远程', key: 'remote', width: 180,
      render: (_: any, r: any) => r.type === 'dynamic' ? 'SOCKS5 代理' : `${r.remoteHost || 'localhost'}:${r.remotePort}`,
    },
    {
      title: 'SSH 目标', key: 'ssh', width: 200,
      render: (_: any, r: any) => `${r.sshUser}@${r.sshHost}:${r.sshPort}`,
    },
    {
      title: '操作', key: 'action', width: 200,
      render: (_: any, r: any) => (
        <Space>
          {r.running
            ? <Button size="small" danger icon={<StopOutlined />} onClick={() => doStop(r.id)}>停止</Button>
            : <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => doStart(r.id)}>启动</Button>
          }
          <Button size="small" onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => doDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        size="small"
        title={<Space><NodeIndexOutlined />SSH 端口转发</Space>}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新建隧道</Button>}
      >
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col xs={12} md={6}><StatCard title="隧道总数" value={tunnels.length} icon={<NodeIndexOutlined />} color="#2f6bff" /></Col>
          <Col xs={12} md={6}><StatCard title="运行中" value={tunnels.filter((t) => t.running).length} icon={<PlayCircleOutlined />} color="#16a34a" /></Col>
          <Col xs={12} md={6}><StatCard title="已停止" value={tunnels.filter((t) => !t.running).length} icon={<StopOutlined />} color="#94a3b8" /></Col>
          <Col xs={12} md={6}><StatCard title="SOCKS5" value={tunnels.filter((t) => t.type === 'dynamic').length} icon={<LinkOutlined />} color="#7c3aed" /></Col>
        </Row>
        <Table
          rowKey="id"
          dataSource={tunnels}
          columns={columns}
          loading={loading}
          size="small"
          pagination={false}
        />

        {tunnels.length === 0 && !loading && (
          <Alert
            type="info" showIcon
            message="暂无隧道"
            description="SSH 端口转发可将本机服务暴露到远程服务器（反向隧道），或将远程服务映射到本地（本地转发），适合渗透测试中打通网络通道。"
            style={{ marginTop: 12 }}
          />
        )}

        <Divider />
        <Descriptions size="small" column={1} title="隧道类型说明">
          <Descriptions.Item label={<Tag color="blue">本地转发 -L</Tag>}>将远程服务器的端口映射到本地。例: 访问 localhost:8080 相当于访问 remote:80</Descriptions.Item>
          <Descriptions.Item label={<Tag color="orange">远程转发 -R</Tag>}>将本机的端口暴露到远程服务器。例: remote 访问 localhost:4444 相当于访问本机:8080</Descriptions.Item>
          <Descriptions.Item label={<Tag color="purple">SOCKS5 -D</Tag>}>在本机创建 SOCKS5 代理，流量经 SSH 隧道转发到远程</Descriptions.Item>
        </Descriptions>
      </Card>

      <Modal
        title={editItem ? '编辑隧道' : '新建隧道'}
        open={modal}
        onCancel={() => setModal(false)}
        onOk={save}
        okText="保存"
        width={550}
      >
        <Form form={form} layout="vertical" onValuesChange={doPreview}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="比如: 目标内网 3389" />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]} initialValue="local">
            <Select options={[
              { value: 'local', label: '本地转发 (-L)' },
              { value: 'remote', label: '远程转发 (-R)' },
              { value: 'dynamic', label: 'SOCKS5 (-D)' },
            ]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a,b) => a.type !== b.type}>
            {({ getFieldValue }) => {
              const type = getFieldValue('type');
              if (type === 'dynamic') {
                return (
                  <Form.Item name="localPort" label="本地 SOCKS5 端口" rules={[{ required: true }]}>
                    <Input type="number" placeholder="1080" />
                  </Form.Item>
                );
              }
              return (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space>
                    <Form.Item name="localHost" label="监听地址" initialValue="0.0.0.0">
                      <Input placeholder="0.0.0.0" style={{ width: 140 }} />
                    </Form.Item>
                    <Form.Item name="localPort" label="本机端口" rules={[{ required: true }]}>
                      <Input type="number" placeholder="8888" style={{ width: 120 }} />
                    </Form.Item>
                  </Space>
                  <Space>
                    <Form.Item name="remoteHost" label="目标地址" initialValue="localhost">
                      <Input placeholder="localhost" style={{ width: 140 }} />
                    </Form.Item>
                    <Form.Item name="remotePort" label="目标端口" rules={[{ required: true }]}>
                      <Input type="number" placeholder="80" style={{ width: 120 }} />
                    </Form.Item>
                  </Space>
                </Space>
              );
            }}
          </Form.Item>
          <Divider style={{ margin: '8px 0' }} />
          <Space>
            <Form.Item name="sshHost" label="SSH 服务器" rules={[{ required: true }]}>
              <Input placeholder="192.168.1.100" style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="sshPort" label="端口" initialValue={22}>
              <Input type="number" placeholder="22" style={{ width: 80 }} />
            </Form.Item>
          </Space>
          <Space>
            <Form.Item name="sshUser" label="用户名" rules={[{ required: true }]}>
              <Input placeholder="root" style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="sshKey" label="密钥路径">
              <Input placeholder="~/.ssh/id_rsa (可选)" style={{ width: 250 }} />
            </Form.Item>
          </Space>
          {previewCmd && (
            <Alert
              type="info" showIcon
              message={
                <Space>
                  <span>SSH 命令预览:</span>
                  <Typography.Text code style={{ fontSize: 11 }}>{previewCmd}</Typography.Text>
                </Space>
              }
              style={{ marginTop: 8 }}
            />
          )}
        </Form>
      </Modal>
    </div>
  );
}