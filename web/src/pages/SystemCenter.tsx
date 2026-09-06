import { useEffect, useState } from 'react';
import { Tabs, Card, Table, Tag, Space, Input, Button, Switch, Alert, message, Typography, Divider, Select, Popconfirm, Popover } from 'antd';
import { SafetyOutlined, KeyOutlined, AuditOutlined, ReloadOutlined, LogoutOutlined, BellOutlined, PlusOutlined, SendOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { api } from '../api';

export default function SystemCenter() {
  return (
    <Tabs defaultActiveKey="audit" items={[
      { key: 'audit', label: '📋 操作审计', children: <AuditTab /> },
      { key: 'api', label: '🔑 开放 API', children: <ApiTab /> },
      { key: 'sec', label: '🛡 登录安全', children: <SecTab /> },
      { key: 'notify', label: '🔔 通知', children: <NotifyTab /> },
    ]} />
  );
}

function AuditTab() {
  const [list, setList] = useState<any[]>([]);
  const [stat, setStat] = useState<any>({});
  const [kw, setKw] = useState('');
  const [action, setAction] = useState('');
  const load = () => api.get('/audit', { kw, action }).then((r) => { setList(r.list); setStat(r.stat); });
  useEffect(() => { load(); }, []);
  const cols = [
    { title: '时间', width: 170, dataIndex: 'time', render: (t: string) => new Date(t).toLocaleString() },
    { title: '动作', width: 120, dataIndex: 'action', render: (a: string) => <Tag color="geekblue">{a}</Tag> },
    { title: '对象', dataIndex: 'target' },
    { title: '详情', dataIndex: 'detail', ellipsis: true },
    { title: '用户', width: 90, dataIndex: 'user' },
  ];
  return (
    <Card size="small" title={<Space><AuditOutlined /><b>全站操作审计</b><Tag>共 {stat.total} 条 · 环形保留 2000</Tag></Space>}
      extra={<Space><Input style={{ width: 200 }} placeholder="搜索对象/详情" value={kw} onChange={(e) => setKw(e.target.value)} onPressEnter={load} />
        <Button size="small" onClick={load}>筛选</Button><Button size="small" icon={<ReloadOutlined />} onClick={load} /></Space>}>
      <Table rowKey="id" size="small" dataSource={list} columns={cols as any} pagination={{ pageSize: 20 }} scroll={{ y: 'calc(100vh - 300px)' }} />
    </Card>
  );
}

function ApiTab() {
  const [cfg, setCfg] = useState<any>({ enabled: false, key: '', hint: '' });
  const load = () => api.get('/apikey').then(setCfg);
  useEffect(() => { load(); }, []);
  const save = async (b: any) => { const r = await api.post('/apikey', b); message.success('已保存'); setCfg({ ...cfg, enabled: r.enabled, hint: r.key, key: r.key?.slice(0, 8) + '…' + r.key?.slice(-4) }); };
  return (
    <Card size="small" title={<Space><KeyOutlined /><b>开放 API(OpenAPI v1)</b><Tag color="purple">/api/open/v1/*</Tag></Space>}>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Space><span>启用: </span><Switch checked={cfg.enabled} onChange={(v) => save({ enabled: v })} /></Space>
        <Alert type="info" showIcon message="启用后以请求头 X-API-Key: <你的密钥> 调用 /api/open/v1/meta、/health、/hosts、/audit、/tasks 等。" />
        <Space>
          <Typography.Text code style={{ fontSize: 12 }}>{cfg.hint || '(尚未生成)'}</Typography.Text>
          <Button onClick={() => save({ rotate: true, enabled: cfg.enabled })}>轮换密钥</Button>
          <Button type="primary" onClick={() => save({ enabled: cfg.enabled, rotate: !cfg.hint })}>生成密钥</Button>
        </Space>
      </Space>
    </Card>
  );
}

function SecTab() {
  const [status, setStatus] = useState<any>({ enabled: false });
  const [pwd, setPwd] = useState('');
  const [oldPwd, setOldPwd] = useState('');
  const load = () => api.get('/auth/status').then(setStatus);
  useEffect(() => { load(); }, []);
  const setup = async (enabled: boolean) => {
    try {
      if (!pwd && enabled) return message.warning('请先填写新密码');
      const r = await api.post('/auth/setup', { password: pwd, oldPassword: oldPwd || undefined, enabled });
      message.success(r.enabled ? '已启用登录保护' : '已关闭(回到开放模式)'); setPwd(''); setOldPwd(''); load();
    } catch (e: any) { message.error(e.message); }
  };
  return (
    <Card size="small" title={<Space><SafetyOutlined /><b>登录安全</b>{status.enabled ? <Tag color="green">已启用</Tag> : <Tag>未启用</Tag>}</Space>}>
      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        <Alert type={status.enabled ? 'success' : 'warning'} showIcon
          message={status.enabled ? '已开启:全站 API 需登录会话(除 /auth 与 /open)。同 IP 连续失败 5 次将锁定 5 分钟。' : '当前为开放模式(默认)。建议设置口令并启用,尤其是暴露到公网时。'} />
        <Space><span style={{ width: 80 }}>新密码</span><Input.Password value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="≥6 位" style={{ width: 240 }} /></Space>
        {status.enabled && <Space><span style={{ width: 80 }}>当前密码</span><Input.Password value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} placeholder="修改需验证当前密码" style={{ width: 240 }} /></Space>}
        <Space>
          <Button type="primary" onClick={() => setup(true)} disabled={status.enabled}>启用登录保护</Button>
          {status.enabled && <Button onClick={() => setup(false)} disabled={!oldPwd}>关闭保护</Button>}
          <Button danger onClick={async () => { await api.post('/auth/logout'); message.success('已退出'); }}>退出登录</Button>
        </Space>
        <Divider />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>说明:会话 Cookie(HttpOnly,3 天)由后端管理;未来可扩展多用户/角色/二次验证。危险操作(网络安全 danger 工具、删除等)仍保留二次确认。</Typography.Text>
      </Space>
    </Card>
  );
}

const TYPE_INFO: any = {
  dingtalk: { label: '钉钉', hint: '群机器人 Webhook: https://oapi.dingtalk.com/robot/send?access_token=xxx（安全设置若加签/关键字需一致）' },
  feishu: { label: '飞书', hint: '群机器人 Webhook: https://open.feishu.cn/open-apis/bot/v2/hook/xxx' },
  serverchan: { label: 'Server酱', hint: '完整推送地址: https://sctapi.ftqq.com/<SENDKEY>.send' },
  webhook: { label: 'Webhook', hint: '任意 HTTP 端点,收到 POST JSON {title, content, time, source}' },
};

function NotifyTab() {
  const [chs, setChs] = useState<any[]>([]);
  const [addType, setAddType] = useState('dingtalk');
  const load = () => api.get('/notify/config').then((r) => setChs(r.channels || []));
  useEffect(() => { load(); }, []);
  const patch = (id: string, p: any) => setChs(chs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const save = async () => {
    try { await api.put('/notify/config', { channels: chs }); message.success('通知渠道已保存'); load(); }
    catch (e: any) { message.error(String(e?.message || e)); }
  };
  const test = async (ch: any) => {
    try { const r = await api.post('/notify/test', { channel: ch }); message.success(r.msg || '已发送'); }
    catch (e: any) { message.error(String(e?.message || e)); }
  };
  const add = async () => { const r = await api.post('/notify/channel', { type: addType }); setChs([...chs, r.channel]); };
  return (
    <Card size="small" title={<Space><BellOutlined /><b>告警通知渠道</b><Tag color="orange">钉钉/飞书/Server酱/Webhook</Tag></Space>}
      extra={<Space><Button icon={<ReloadOutlined />} onClick={load} /><Button onClick={async () => { const r = await api.post('/notify/resend'); message.info(r.msg); }}>重放最近告警</Button><Button type="primary" icon={<SaveOutlined />} onClick={save}>保存全部</Button></Space>}>
      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        <Alert type="info" showIcon message="监控阈值告警、Ansible 定时任务失败等会自动通过启用的渠道推送(右上角铃铛之外的额外通知)。" />
        <Space>
          <span>添加渠道:</span>
          <Select style={{ width: 180 }} value={addType} onChange={setAddType} options={Object.keys(TYPE_INFO).map((k) => ({ value: k, label: TYPE_INFO[k].label }))} />
          <Button icon={<PlusOutlined />} onClick={add}>添加</Button>
        </Space>
        {chs.length === 0 && <Alert type="warning" showIcon message="还没有通知渠道。添加一个钉钉/飞书群机器人或 Server酱,点「保存」后即可收告警。" />}
        {chs.map((c) => (
          <Card key={c.id} size="small" style={{ background: '#fafafa' }}>
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              <Space wrap>
                <Tag color="geekblue">{TYPE_INFO[c.type]?.label || c.type}</Tag>
                <span>名称</span><Input style={{ width: 140 }} size="small" value={c.name} onChange={(e) => patch(c.id, { name: e.target.value })} />
                <span>启用</span><Switch size="small" checked={!!c.enabled} onChange={(v) => patch(c.id, { enabled: v })} />
                <Button size="small" icon={<SendOutlined />} onClick={() => test(c)}>发送测试</Button>
                <Popconfirm title="删除该渠道?" onConfirm={() => setChs(chs.filter((x) => x.id !== c.id))}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
              </Space>
              <Space wrap style={{ width: '100%' }}>
                <span style={{ width: 60 }}>Webhook</span>
                <Input size="small" style={{ width: 'calc(100% - 120px)' }} value={c.url} onChange={(e) => patch(c.id, { url: e.target.value })} placeholder="https://…" />
                {c.type === 'dingtalk' && <span style={{ width: 60 }}>关键字</span>}
                {c.type === 'dingtalk' && <Input size="small" style={{ width: 200 }} value={c.keyword} onChange={(e) => patch(c.id, { keyword: e.target.value })} placeholder="(如机器人安全设置需要)" />}
              </Space>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{TYPE_INFO[c.type]?.hint}</Typography.Text>
            </Space>
          </Card>
        ))}
      </Space>
    </Card>
  );
}
