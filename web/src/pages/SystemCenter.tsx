import { useEffect, useState } from 'react';
import { Tabs, Card, Table, Tag, Space, Input, Button, Switch, Alert, message, Typography, Divider, Select, Popconfirm, Popover, Modal } from 'antd';
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
  const [users, setUsers] = useState<any[]>([]);
  const [root, setRoot] = useState('root');
  const [um, setUm] = useState(false);            // 新增弹窗
  const [edit, setEdit] = useState<any>(null);    // 编辑/重置
  const [nf, setNf] = useState<any>({});          // 新用户表单
  const me = status?.me;
  const isAdmin = me?.role === 'admin';
  const load = () => api.get('/auth/status').then(setStatus);
  const loadUsers = async () => { if (isAdmin) { try { const d = await api.get('/auth/users'); setUsers(d.users || []); setRoot(d.root || 'root'); } catch { /* */ } } };
  useEffect(() => { load(); }, []);
  useEffect(() => { loadUsers(); }, [status?.me?.username]);
  const setup = async (enabled: boolean) => {
    try {
      if (!pwd && enabled) return message.warning('请先填写新密码');
      const r = await api.post('/auth/setup', { password: pwd, oldPassword: undefined, enabled });
      message.success(r.enabled ? '已启用登录保护' : '已关闭(回到开放模式)'); setPwd(''); load(); loadUsers();
    } catch (e: any) { message.error(e?.message || String(e)); }
  };
  const addUser = async () => {
    if (!nf.username || nf.password?.length < 6) return message.warning('用户名与 ≥6 位密码必填');
    try { await api.post('/auth/users', { ...nf }); message.success('已添加'); setUm(false); setNf({}); loadUsers(); }
    catch (e: any) { message.error(e?.message || String(e)); }
  };
  const upd = async (u: any) => {
    try { await api.put('/auth/users/' + encodeURIComponent(u.username), u); message.success('已更新'); loadUsers(); setEdit(null); }
    catch (e: any) { message.error(e?.message || String(e)); }
  };
  const cols = [
    { title: '用户名', dataIndex: 'username' },
    { title: '昵称', dataIndex: 'nickname' },
    { title: '角色', width: 130, render: (_: any, r: any) => (
      <Select size="small" value={r.role} onChange={(v) => upd({ ...r, role: v })}
        options={[{ value: 'admin', label: '管理员' }, { value: 'viewer', label: '只读' }]} disabled={r.username === root} />) },
    { title: '启用', width: 80, render: (_: any, r: any) => <Switch size="small" checked={!!r.enabled} onChange={(v) => upd({ ...r, enabled: v })} disabled={r.username === root} /> },
    { title: '创建', width: 150, dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false }) },
    { title: '操作', width: 170, render: (_: any, r: any) => (r.username === root
      ? <Tag>超级管理员</Tag>
      : <Space>
        <Button size="small" onClick={() => setEdit({ ...r, password: '' })}>重置密码</Button>
        <Popconfirm title="删除该用户?" onConfirm={async () => { try { await api.del('/auth/users/' + encodeURIComponent(r.username)); loadUsers(); } catch (e: any) { message.error(e?.message || String(e)); } }}><Button size="small" danger>删除</Button></Popconfirm>
      </Space>) },
  ];
  return (
    <Card size="small" title={<Space><SafetyOutlined /><b>登录安全与用户</b>{status.enabled ? <Tag color="green">已启用</Tag> : <Tag>未启用</Tag>}{me ? <Tag color={isAdmin ? 'gold' : 'default'}>{me.username} · {isAdmin ? '管理员' : '只读'}</Tag> : null}</Space>}>
      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        <Alert type={status.enabled ? 'success' : 'warning'} showIcon
          message={status.enabled ? '已开启:全站 API 需登录会话。管理员可读写全部;只读账号仅可查看,写操作一律拒绝。同 IP 连续失败 5 次锁 5 分钟。' : '当前为开放模式(默认)。建议设置口令并启用,尤其是暴露到公网时。'} />
        {!isAdmin && me ? <Alert type="info" showIcon message="当前为只读账号:可浏览面板,但无法执行任何修改操作(增删改/运行/部署等)。需要权限请联系管理员。" /> : null}
        {isAdmin && <>
          <Divider style={{ margin: '4px 0' }} />
          <Space wrap>
            <span style={{ fontWeight: 600 }}>超级管理员({root})</span>
            <Input.Password style={{ width: 220 }} value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder={status.enabled ? '新密码(可选,留空则仅切换开关)' : '设置密码(≥6 位)'} />
            <Button type="primary" onClick={() => setup(true)} disabled={status.enabled}>已启用(改密)</Button>
            {!status.enabled && <Button type="primary" onClick={() => setup(true)}>设置并启用保护</Button>}
            {status.enabled && <Button onClick={() => setup(false)}>关闭保护(开放)</Button>}
          </Space>
          <Divider style={{ margin: '4px 0' }} />
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <b>成员管理({users.length + 1})</b>
            <Button icon={<PlusOutlined />} onClick={() => { setNf({ role: 'viewer', enabled: true }); setUm(true); }}>添加用户</Button>
          </Space>
          <Table size="small" rowKey="username" dataSource={[{ username: root, nickname: '超级管理员', role: 'admin', enabled: true }, ...users]} columns={cols as any} pagination={false} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>角色说明:管理员=全部权限;只读=仅浏览(写请求与服务端双重拦截)。危险操作仍保留二次确认。</Typography.Text>
        </>}
        <Space>
          <Button danger onClick={async () => { await api.post('/auth/logout'); message.success('已退出'); setTimeout(() => location.reload(), 300); }}>退出登录</Button>
        </Space>
      </Space>

      <Modal title="添加用户" open={um} onCancel={() => setUm(false)} onOk={addUser} okText="添加" width={460}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space><span style={{ width: 70 }}>用户名</span><Input value={nf.username} onChange={(e) => setNf({ ...nf, username: e.target.value })} placeholder="2-32 位字母/数字._-" style={{ width: 240 }} /></Space>
          <Space><span style={{ width: 70 }}>昵称</span><Input value={nf.nickname} onChange={(e) => setNf({ ...nf, nickname: e.target.value })} style={{ width: 240 }} /></Space>
          <Space><span style={{ width: 70 }}>密码</span><Input.Password value={nf.password} onChange={(e) => setNf({ ...nf, password: e.target.value })} placeholder="≥6 位" style={{ width: 240 }} /></Space>
          <Space><span style={{ width: 70 }}>角色</span><Select style={{ width: 240 }} value={nf.role} onChange={(v) => setNf({ ...nf, role: v })} options={[{ value: 'admin', label: '管理员' }, { value: 'viewer', label: '只读(仅查看)' }]} /></Space>
        </Space>
      </Modal>
      <Modal title={'重置密码: ' + (edit?.username || '')} open={!!edit} onCancel={() => setEdit(null)} onOk={() => edit?.password?.length >= 6 ? upd(edit) : message.warning('新密码至少 6 位')} okText="重置" width={400}>
        <Input.Password value={edit?.password || ''} onChange={(e) => setEdit({ ...edit, password: e.target.value })} placeholder="新密码(≥6 位)" />
      </Modal>
    </Card>
  );
}

const TYPE_INFO: any = {
  dingtalk: { label: '钉钉', hint: '群机器人 Webhook: https://oapi.dingtalk.com/robot/send?access_token=xxx（安全设置若加签/关键字需一致）' },
  feishu: { label: '飞书', hint: '群机器人 Webhook: https://open.feishu.cn/open-apis/bot/v2/hook/xxx' },
  serverchan: { label: 'Server酱', hint: '完整推送地址: https://sctapi.ftqq.com/<SENDKEY>.send' },
  webhook: { label: 'Webhook', hint: '任意 HTTP 端点,收到 POST JSON {title, content, time, source}' },
  email: { label: '邮件(SMTP)', hint: 'SMTP 发信。QQ/163 等请用「授权码」作密码。465=SSL / 587=STARTTLS / 25=明文。' },
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
              {c.type === 'email' ? (
                <Space direction="vertical" style={{ width: '100%' }} size={6}>
                  <Space wrap><span style={{ width: 60 }}>服务器</span><Input size="small" style={{ width: 220 }} value={c.host} onChange={(e) => patch(c.id, { host: e.target.value })} placeholder="smtp.qq.com" />
                    <span>端口</span><Input size="small" style={{ width: 80 }} value={c.port} onChange={(e) => patch(c.id, { port: Number(e.target.value) || 587 })} />
                    <Select size="small" style={{ width: 130 }} value={c.secure || 'starttls'} onChange={(v) => patch(c.id, { secure: v })} options={[{ value: 'starttls', label: 'STARTTLS(587)' }, { value: 'ssl', label: 'SSL(465)' }, { value: 'none', label: '明文(25)' }]} /></Space>
                  <Space wrap><span style={{ width: 60 }}>账号</span><Input size="small" style={{ width: 240 }} value={c.user} onChange={(e) => patch(c.id, { user: e.target.value })} placeholder="发信账号(可空)" />
                    <span style={{ width: 60 }}>密码</span><Input.Password size="small" style={{ width: 240 }} value={c.password} onChange={(e) => patch(c.id, { password: e.target.value })} placeholder="授权码/密码(留空=无密码)" /></Space>
                  <Space wrap><span style={{ width: 60 }}>发件人</span><Input size="small" style={{ width: 240 }} value={c.from} onChange={(e) => patch(c.id, { from: e.target.value })} placeholder="you@example.com" />
                    <span style={{ width: 60 }}>收件人</span><Input size="small" style={{ width: 300 }} value={c.to} onChange={(e) => patch(c.id, { to: e.target.value })} placeholder="多个用逗号分隔" /></Space>
                </Space>
              ) : (
              <Space wrap style={{ width: '100%' }}>
                <span style={{ width: 60 }}>Webhook</span>
                <Input size="small" style={{ width: 'calc(100% - 120px)' }} value={c.url} onChange={(e) => patch(c.id, { url: e.target.value })} placeholder="https://…" />
                {c.type === 'dingtalk' && <span style={{ width: 60 }}>关键字</span>}
                {c.type === 'dingtalk' && <Input size="small" style={{ width: 200 }} value={c.keyword} onChange={(e) => patch(c.id, { keyword: e.target.value })} placeholder="(如机器人安全设置需要)" />}
              </Space>)}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{TYPE_INFO[c.type]?.hint}</Typography.Text>
            </Space>
          </Card>
        ))}
      </Space>
    </Card>
  );
}
