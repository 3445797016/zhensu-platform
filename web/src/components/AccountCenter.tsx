import { useEffect, useState } from 'react';
import {
  App, Avatar, Badge, Button, Drawer, Dropdown, Form, Input, List, Popover, Space, Tag, Typography, Empty, Descriptions, Divider,
} from 'antd';
import { BellOutlined, UserOutlined, LogoutOutlined, SafetyOutlined, KeyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const { Text } = Typography;
const COLORS = ['#2f6bff', '#722ed1', '#eb2f96', '#fa8c16', '#52c41a', '#13c2c2', '#f5222d', '#faad14'];
const KIND_TAG: Record<string, string> = { disk: 'orange', memory: 'red', cpu: 'volcano', host: 'geekblue', service: 'purple', net: 'cyan' };

// 顶部右侧:消息铃铛 + 账户菜单(个人资料 / 退出登录)
export default function HeaderTools() {
  const nav = useNavigate();
  const [profile, setProfile] = useState<any>({ username: 'root', nickname: '超级管理员', avatar: '#2f6bff' });
  const [alerts, setAlerts] = useState<any[]>([]);
  const [accOpen, setAccOpen] = useState(false);
  const [version, setVersion] = useState('');

  const refresh = async () => {
    try {
      const me = await api.get('/auth/me');
      if (me?.user) setProfile(me.user);
    } catch { /* 未登录状态 */ }
    try { setAlerts(await api.get('/monitor/alerts')); } catch { /* */ }
    try { const h = await api.get('/health'); setVersion('运行 ' + Math.round(h.uptime / 3600) + 'h'); } catch { /* */ }
  };
  useEffect(() => { refresh(); const t = setInterval(refresh, 20000); return () => clearInterval(t); }, []);

  const unread = alerts.filter((a: any) => !a.ack).length;

  const bellContent = (
    <div style={{ width: 340 }}>
      <div style={{ padding: '6px 10px', fontWeight: 700, borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
        <span>消息 / 告警{unread ? <Tag color="red" style={{ marginLeft: 8 }}>{unread} 条未读</Tag> : null}</span>
      </div>
      <div style={{ maxHeight: 340, overflow: 'auto' }}>
        {alerts.length ? <List size="small" dataSource={alerts.slice(0, 12)} renderItem={(a: any) => (
          <List.Item actions={a.ack ? undefined : [<Button key="ack" type="link" size="small" onClick={async () => { await api.post('/monitor/alerts/ack', { id: a.id }); refresh(); }}>已读</Button>]}>
            <Space direction="vertical" size={0}>
              <Space size={4}>
                <Badge status={a.ack ? 'default' : 'error'} />
                <Tag color={KIND_TAG[a.kind] || 'blue'} style={{ marginRight: 0 }}>{a.kind || 'alarm'}</Tag>
                <Text style={{ fontSize: 12 }}>{a.hostName || ''}</Text>
              </Space>
              <Text style={{ fontSize: 12 }}>{a.message}</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>{a.time ? new Date(a.time).toLocaleString() : ''}</Text>
            </Space>
          </List.Item>
        )} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无消息" />}
      </div>
      <div style={{ padding: 8, borderTop: '1px solid #f0f0f0', textAlign: 'center' }}>
        <Button size="small" type="link" onClick={() => nav('/monitoring')}>查看监控 / 告警中心</Button>
      </div>
    </div>
  );

  return (
    <Space size={6}>
      <Popover trigger="click" placement="bottomRight" content={bellContent}>
        <Badge count={unread} size="small">
          <Button type="text" icon={<BellOutlined style={{ fontSize: 16 }} />} style={{ cursor: 'pointer' }} />
        </Badge>
      </Popover>
      <Dropdown trigger={['click']} menu={{ items: [
        { key: 'profile', icon: <UserOutlined />, label: '个人资料设置' },
        { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
      ], onClick: ({ key }) => {
        if (key === 'profile') setAccOpen(true);
        if (key === 'logout') { void api.post('/auth/logout').catch(() => { /* */ }); window.location.reload(); }
      } }}>
        <Space style={{ cursor: 'pointer' }}>
          <Avatar style={{ background: profile.avatar || '#2f6bff', fontSize: 15 }}>{String(profile.nickname || '管')[0]}</Avatar>
          <Text strong style={{ fontSize: 13 }}>{profile.nickname || '超级管理员'}</Text>
        </Space>
      </Dropdown>
      {accOpen && <AccountDrawer profile={profile} onClose={() => setAccOpen(false)} onSaved={(p) => { setProfile(p); refresh(); }} />}
    </Space>
  );
}

function AccountDrawer({ profile, onClose, onSaved }: { profile: any; onClose: () => void; onSaved: (p: any) => void }) {
  const { message } = App.useApp();
  const [pForm] = Form.useForm();
  const [pwForm] = Form.useForm();
  const [color, setColor] = useState(profile.avatar || '#2f6bff');
  const [busy, setBusy] = useState(false);

  useEffect(() => { pForm.setFieldsValue(profile); setColor(profile.avatar || '#2f6bff'); }, [profile]);

  const saveProfile = async (v: any) => {
    setBusy(true);
    try {
      const r = await api.put('/auth/profile', { nickname: v.nickname, avatar: color });
      message.success('个人资料已保存'); onSaved(r.user);
    } catch (e: any) { message.error(e.message); } finally { setBusy(false); }
  };
  const savePwd = async (v: any) => {
    setBusy(true);
    try {
      if (v.newPassword !== v.confirm) { message.error('两次输入的新密码不一致'); return; }
      await api.post('/auth/password', { oldPassword: v.oldPassword, newPassword: v.newPassword });
      message.success('密码已修改,24 小时内其它会话已失效'); pwForm.resetFields();
    } catch (e: any) { message.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Drawer title={<Space><UserOutlined />个人资料</Space>} width={460} open onClose={onClose}>
      <Form form={pForm} layout="vertical" onFinish={saveProfile} initialValues={profile}>
        <Descriptions size="small" column={1} style={{ marginBottom: 16 }} bordered
          items={[{ key: 'role', label: '角色', children: <Tag color="gold">超级管理员</Tag> },
            { key: 'user', label: '登录账号', children: <Text code>{pForm.getFieldValue('username') || profile.username || 'root'}</Text> },
          ]} />
        <Form.Item name="nickname" label="昵称" rules={[{ required: true }]}><Input placeholder="显示名称" /></Form.Item>
        <Form.Item label="头像颜色">
          <Space wrap>{COLORS.map((c) => <div key={c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', outline: color === c ? `3px solid ${c}55` : 'none', boxShadow: color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : 'none' }} />)}</Space>
          <Avatar style={{ background: color, marginLeft: 10 }}>{String(pForm.getFieldValue('nickname') || profile.nickname || '管')[0]}</Avatar>
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy} block icon={<SafetyOutlined />}>保存资料</Button>
      </Form>

      <Divider />

      <Typography.Title level={5}><KeyOutlined /> 修改密码</Typography.Title>
      <Form form={pwForm} layout="vertical" onFinish={savePwd}>
        <Form.Item name="oldPassword" label="当前密码" rules={[{ required: true }]}><Input.Password placeholder="输入当前密码" /></Form.Item>
        <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6 }]}><Input.Password placeholder="至少 6 位" /></Form.Item>
        <Form.Item name="confirm" label="确认新密码" rules={[{ required: true }]} dependencies={['newPassword']}>
          <Input.Password placeholder="再次输入新密码" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy} block>修改密码</Button>
        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>会话有效期 24 小时,修改密码后其它登录会话将失效。</Text>
      </Form>
    </Drawer>
  );
}
