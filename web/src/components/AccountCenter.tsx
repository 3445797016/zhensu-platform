import { useEffect, useState } from 'react';
import {
  App, Avatar, Badge, Button, Drawer, Dropdown, Form, Input, List, Popover, Space, Tag, Typography, Empty, Descriptions, Divider, Segmented, Tooltip,
} from 'antd';
import { BellOutlined, UserOutlined, LogoutOutlined, SafetyOutlined, KeyOutlined, CheckOutlined, HddOutlined, ThunderboltOutlined, ApiOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import './account-center.css';

const { Text } = Typography;
const COLORS = ['#2f6bff', '#722ed1', '#eb2f96', '#fa8c16', '#52c41a', '#13c2c2', '#f5222d', '#faad14'];
const KIND_TAG: Record<string, string> = { disk: 'orange', memory: 'red', cpu: 'volcano', host: 'geekblue', service: 'purple', net: 'cyan' };
const KIND_META: Record<string, { color: string; icon: any }> = {
  disk: { color: '#fa8c16', icon: <HddOutlined /> },
  memory: { color: '#eb2f96', icon: <ThunderboltOutlined /> },
  cpu: { color: '#f5222d', icon: <ThunderboltOutlined /> },
  host: { color: '#2f6bff', icon: <ApiOutlined /> },
  service: { color: '#722ed1', icon: <ApiOutlined /> },
  net: { color: '#13c2c2', icon: <ApiOutlined /> },
};
const relTime = (t?: string) => {
  if (!t) return '';
  const diff = Date.now() - new Date(t).getTime();
  if (isNaN(diff)) return '';
  if (diff < 60000) return '刚刚';
  const m = Math.floor(diff / 60000); if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24); if (d < 30) return `${d} 天前`;
  return new Date(t).toLocaleDateString();
};

// 顶部右侧:消息铃铛 + 账户菜单(个人资料 / 退出登录)
export default function HeaderTools() {
  const nav = useNavigate();
  const [profile, setProfile] = useState<any>({ username: 'root', nickname: '超级管理员', avatar: '#2f6bff' });
  const [alerts, setAlerts] = useState<any[]>([]);
  const [accOpen, setAccOpen] = useState(false);
  const [version, setVersion] = useState('');
  const [bellFilter, setBellFilter] = useState<'all' | 'unread'>('unread');
  const [acking, setAcking] = useState(false);
  const { message } = App.useApp();

  const refresh = async () => {
    // 三个请求并行，避免某个慢接口拖住告警加载
    const [me, al, h] = await Promise.allSettled([api.get('/auth/me'), api.get('/monitor/alerts'), api.get('/health')]);
    if (me.status === 'fulfilled' && me.value?.user) setProfile(me.value.user);
    if (al.status === 'fulfilled') setAlerts(Array.isArray(al.value) ? al.value : []);
    if (h.status === 'fulfilled') setVersion('运行 ' + Math.round((h.value?.uptime || 0) / 3600) + 'h');
  };
  useEffect(() => { refresh(); const t = setInterval(refresh, 20000); return () => clearInterval(t); }, []);

  const unread = alerts.filter((a: any) => !a.ack).length;
  const shownAlerts = (bellFilter === 'unread' ? alerts.filter((a: any) => !a.ack) : alerts).slice(0, 20);

  const ackAll = async () => {
    if (!unread) return;
    setAcking(true);
    // 乐观更新：立即反馈，后台再同步
    setAlerts((prev) => prev.map((a: any) => (a.ack ? a : { ...a, ack: true, ackTime: new Date().toISOString() })));
    try { await api.post('/monitor/alerts/ack', { all: true }); message.success('已全部标记为已读'); await refresh(); }
    catch (e: any) { message.error(e?.message || '操作失败'); await refresh(); }
    finally { setAcking(false); }
  };
  const ackOne = async (id: string) => {
    setAlerts((prev) => prev.map((a: any) => (a.id === id ? { ...a, ack: true, ackTime: new Date().toISOString() } : a)));
    try { await api.post('/monitor/alerts/ack', { id }); await refresh(); }
    catch (e: any) { message.error(e?.message || '操作失败'); await refresh(); }
  };

  const bellContent = (
    <div style={{ width: 366 }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space size={8}>
          <span style={{ fontWeight: 700 }}>消息 / 告警</span>
          {unread > 0
            ? <Tag color="red" style={{ marginRight: 0 }}><span className="bell-pulse" style={{ marginRight: 5 }} />{unread} 未读</Tag>
            : <Tag color="green" style={{ marginRight: 0 }}>全部已读</Tag>}
        </Space>
        <Button type="link" size="small" icon={<CheckOutlined />} disabled={!unread} loading={acking} onClick={ackAll}>一键已读</Button>
      </div>
      <div style={{ padding: '8px 12px 0' }}>
        <Segmented block size="small" value={bellFilter} onChange={(v) => setBellFilter(v as any)}
          options={[{ label: `全部 ${alerts.length}`, value: 'all' }, { label: `未读 ${unread}`, value: 'unread' }]} />
      </div>
      <div className="bell-scroll" style={{ maxHeight: 360, overflow: 'auto', padding: '6px 6px 6px' }}>
        {shownAlerts.length ? shownAlerts.map((a: any) => {
          const meta = KIND_META[a.kind] || { color: '#2f6bff', icon: <BellOutlined /> };
          return (
            <div key={a.id} className={`bell-item${a.ack ? ' is-ack' : ''}`} onClick={() => nav('/monitoring')}>
              <div className="bell-icon" style={{ background: `${meta.color}1a`, color: meta.color }}>{meta.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Space size={6} wrap>
                  <Tag color={meta.color} style={{ marginRight: 0 }}>{a.kind || 'alarm'}</Tag>
                  <Text strong style={{ fontSize: 12.5 }}>{a.hostName || ''}</Text>
                </Space>
                <div><Text style={{ fontSize: 12 }}>{a.message}</Text></div>
                <Text type="secondary" style={{ fontSize: 11 }}>{relTime(a.time)}</Text>
              </div>
              {!a.ack && (
                <Tooltip title="标记已读">
                  <Button type="text" size="small" icon={<CheckOutlined />} onClick={(e) => { e.stopPropagation(); ackOne(a.id); }} />
                </Tooltip>
              )}
            </div>
          );
        }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={bellFilter === 'unread' ? '没有未读消息' : '暂无消息'} />}
      </div>
      <div style={{ padding: 8, borderTop: '1px solid #f0f0f0', textAlign: 'center' }}>
        <Button size="small" type="link" onClick={() => nav('/monitoring')}>查看监控 / 告警中心</Button>
      </div>
    </div>
  );

  return (
    <Space size={6}>
      <Popover trigger="click" placement="bottomRight" content={bellContent} onOpenChange={(o) => { if (o) refresh(); }}>
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
