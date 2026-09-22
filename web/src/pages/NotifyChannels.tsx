import { useEffect, useState } from 'react';
import {
  Card, Table, Button, Space, Tag, Typography, Modal, Form, Input, Select, Switch,
  message, Popconfirm, Tooltip, Alert, Descriptions, Divider, Row, Col
} from 'antd';
import {
  BellOutlined, PlusOutlined, DeleteOutlined, SendOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ApiOutlined, SafetyOutlined
} from '@ant-design/icons';
import { api } from '../api';
import { StatCard } from '../components/ui';

const msg = message;

const CHANNEL_TYPES = [
  { value: 'telegram', label: 'Telegram Bot', color: '#0088cc' },
  { value: 'dingtalk', label: '钉钉机器人', color: '#0089ff' },
  { value: 'wecom', label: '企业微信机器人', color: '#07c160' },
  { value: 'webhook', label: '通用 Webhook', color: '#666' },
];

export default function NotifyChannels() {
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/notify/channels');
      setChannels(r.channels || []);
    } catch (e: any) {
      msg.error('加载失败: ' + e.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditItem(null);
    form.resetFields();
    setModal(true);
  };

  const openEdit = (ch: any) => {
    setEditItem(ch);
    form.setFieldsValue(ch);
    setModal(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    const body = { ...values };
    if (editItem) body.id = editItem.id;
    try {
      const r = await api.post('/notify/channels', body);
      if (r.ok) { msg.success(editItem ? '已更新' : '已添加'); setModal(false); load(); }
      else msg.error(r.error || '保存失败');
    } catch (e: any) {
      msg.error('保存失败: ' + e.message);
    }
  };

  const doDelete = async (id: string) => {
    try {
      const r = await api.del(`/notify/channels/${id}`);
      if (r.ok) { msg.success('已删除'); load(); }
    } catch (e: any) {
      msg.error('删除失败: ' + e.message);
    }
  };

  const doTest = async (id: string) => {
    try {
      const r = await api.post('/notify/channels/test', { id });
      if (r.ok) msg.success('测试消息已发送 ✅');
      else msg.error(r.error || '发送失败');
    } catch (e: any) {
      msg.error('测试失败: ' + e.message);
    }
  };

  const channelType = (type: string) => CHANNEL_TYPES.find(t => t.value === type);

  const columns = [
    {
      title: '名称', dataIndex: 'name', key: 'name',
      render: (v: string, r: any) => (
        <Space>
          <Tag color={channelType(r.type)?.color}>{channelType(r.type)?.label || r.type}</Tag>
          <Typography.Text strong>{v}</Typography.Text>
        </Space>
      ),
    },
    { title: '类型', dataIndex: 'type', key: 'type', render: (v: string) => channelType(v)?.label || v },
    {
      title: '启用', dataIndex: 'enabled', key: 'enabled', width: 80,
      render: (v: boolean) => v ? <Tag color="green">启用</Tag> : <Tag>禁用</Tag>,
    },
    {
      title: '操作', key: 'action', width: 200,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<SendOutlined />} onClick={() => doTest(r.id)}>测试</Button>
          <Button size="small" onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => doDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const configFields = (type: string) => {
    switch (type) {
      case 'telegram':
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Form.Item name={['config', 'botToken']} label="Bot Token" rules={[{ required: true }]}>
              <Input.Password placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" />
            </Form.Item>
            <Form.Item name={['config', 'chatId']} label="Chat ID" rules={[{ required: true }]}>
              <Input placeholder="123456789 或 @username" />
            </Form.Item>
          </Space>
        );
      case 'dingtalk':
        return (
          <Form.Item name={['config', 'webhookUrl']} label="Webhook URL" rules={[{ required: true }]}>
            <Input placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxx" />
          </Form.Item>
        );
      case 'wecom':
        return (
          <Form.Item name={['config', 'webhookUrl']} label="Webhook URL" rules={[{ required: true }]}>
            <Input placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx" />
          </Form.Item>
        );
      case 'webhook':
        return (
          <Form.Item name={['config', 'webhookUrl']} label="Webhook URL" rules={[{ required: true }]}>
            <Input placeholder="https://hooks.example.com/notify" />
          </Form.Item>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <Card
        size="small"
        title={<Space><BellOutlined />通知通道</Space>}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新增通道</Button>}
      >
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col xs={12} md={6}><StatCard title="通道总数" value={channels.length} icon={<BellOutlined />} color="#2f6bff" /></Col>
          <Col xs={12} md={6}><StatCard title="已启用" value={channels.filter((c) => c.enabled).length} icon={<CheckCircleOutlined />} color="#16a34a" /></Col>
          <Col xs={12} md={6}><StatCard title="已禁用" value={channels.filter((c) => !c.enabled).length} icon={<CloseCircleOutlined />} color="#94a3b8" /></Col>
          <Col xs={12} md={6}><StatCard title="支持平台" value={CHANNEL_TYPES.length} icon={<ApiOutlined />} color="#7c3aed" /></Col>
        </Row>
        <Table
          rowKey="id"
          dataSource={channels}
          columns={columns}
          loading={loading}
          size="small"
          pagination={false}
        />

        {channels.length === 0 && !loading && (
          <Alert
            type="info" showIcon
            message="暂无通知通道"
            description="添加 Telegram Bot、钉钉或企业微信机器人，即可在告警、扫描完成等事件时收到推送通知。"
            style={{ marginTop: 12 }}
          />
        )}
      </Card>

      <Modal
        title={editItem ? '编辑通知通道' : '新增通知通道'}
        open={modal}
        onCancel={() => setModal(false)}
        onOk={save}
        okText="保存"
        width={550}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="比如: 团队群通知" />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select options={CHANNEL_TYPES} onChange={() => form.setFieldValue('config', undefined)} />
          </Form.Item>
          <Form.Item shouldUpdate={(prev, cur) => prev.type !== cur.type}>
            {({ getFieldValue }) => {
              const type = getFieldValue('type');
              return type ? configFields(type) : null;
            }}
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}