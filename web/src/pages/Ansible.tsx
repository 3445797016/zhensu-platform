import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, Tabs, Table, Button, Space, Tag, Modal, Form, Input, Select, InputNumber, Switch, Alert, Typography, Drawer, Popconfirm, App, Badge } from 'antd';
import { PlayCircleOutlined, PlusOutlined, DeleteOutlined, ReloadOutlined, EyeOutlined, ThunderboltOutlined, ScheduleOutlined, BookOutlined, DashboardOutlined, StopOutlined } from '@ant-design/icons';
import { api } from '../api';

const { Text } = Typography;

const MODULES = [
  { v: 'ping', d: 'ping' }, { v: 'setup', d: 'setup(收集 facts)' }, { v: 'command', d: 'command(执行命令)' },
  { v: 'shell', d: 'shell(Shell 命令)' }, { v: 'apt', d: 'apt' }, { v: 'dnf', d: 'dnf' },
  { v: 'copy', d: 'copy(传文件)' }, { v: 'file', d: 'file(文件/目录)' }, { v: 'service', d: 'service(服务)' },
  { v: 'stat', d: 'stat(文件状态)' }, { v: 'gather_facts', d: 'gather_facts' }, { v: 'cron', d: 'cron' },
  { v: 'user', d: 'user(用户)' }, { v: 'yum', d: 'yum' }, { v: 'get_url', d: 'get_url(下载)' }, { v: 'git', d: 'git' },
];

export default function AnsiblePage() {
  const { message } = App.useApp();
  const [tab, setTab] = useState('overview');
  const [status, setStatus] = useState<any>(null);
  const [inv, setInv] = useState<any>(null);
  const [pbs, setPbs] = useState<any>({ files: [], samples: [] });
  const [runs, setRuns] = useState<any[]>([]);
  const [scheds, setScheds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 编辑器状态
  const [pbModal, setPbModal] = useState(false);
  const [pbName, setPbName] = useState('');
  const [pbContent, setPbContent] = useState('');
  const [runTarget, setRunTarget] = useState('all');
  const [runVars, setRunVars] = useState('');
  const [runNotify, setRunNotify] = useState(false);
  // ad-hoc
  const [adhoc, setAdhoc] = useState<any>({ module: 'ping', args: '', target: 'all' });
  // run detail
  const [detail, setDetail] = useState<any>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    try { setStatus(await api.get('/ansible/status')); } catch { /* */ }
    try { const r = await api.get('/ansible/runs'); setRuns(r); } catch { /* */ }
  }, []);

  const loadInv = async () => { try { setInv(await api.get('/ansible/inventory')); } catch { /* */ } };
  const loadPbs = async () => { try { setPbs(await api.get('/ansible/playbooks')); } catch { /* */ } };
  const loadScheds = async () => { try { setScheds(await api.get('/ansible/schedules')); } catch { /* */ } };

  useEffect(() => { refresh(); loadInv(); loadPbs(); loadScheds(); }, [refresh]);
  useEffect(() => {
    if (tab !== 'runs') return;
    const iv = setInterval(refresh, 4000);
    return () => clearInterval(iv);
  }, [tab, refresh]);

  // 打开执行记录的详情抽屉(轮询直到结束)
  const openDetail = async (id: string) => {
    setDetailId(id); setDetail({ id, status: 'running' });
    const iv = setInterval(async () => {
      try {
        const d = await api.get('/ansible/runs/' + id);
        setDetail({ ...d, running: d.status === 'running' || d.status === 'pending' });
        if (d.status !== 'running' && d.status !== 'pending') clearInterval(iv);
      } catch { clearInterval(iv); }
    }, 2000);
    try { const d = await api.get('/ansible/runs/' + id); setDetail(d); } catch { /* */ }
  };

  const runPb = async (name: string) => {
    setRunning(true);
    try {
      await api.post('/ansible/run', { kind: 'playbook', playbook: name, target: runTarget, extraVars: runVars, notify: runNotify });
      message.success('已启动 ' + name); setPbModal(false); setTab('runs');
    } catch (e: any) { message.error('启动失败: ' + (e?.message || e)); }
    setRunning(false);
  };
  const runAdhoc = async () => {
    setRunning(true);
    try {
      await api.post('/ansible/run', { kind: 'adhoc', module: adhoc.module, adhocArgs: adhoc.args, target: adhoc.target, extraVars: runVars, notify: runNotify });
      message.success('Ad-hoc 已启动'); setTab('runs');
    } catch (e: any) { message.error('启动失败: ' + (e?.message || e)); }
    setRunning(false);
  };
  const cancelRun = async (id: string) => { try { await api.post(`/ansible/runs/${id}/cancel`); message.info('已发送取消'); refresh(); } catch (e: any) { message.error(String(e)); } };

  const stTag = (s: string) => ({ pending: 'default', running: 'processing', ok: 'success', fail: 'error', cancelled: 'warning' } as any)[s] || 'default';

  const adhocModal = async () => {
    await runAdhoc();
  };

  const statusCard = (
    <Card size="small" title={<Space><DashboardOutlined />Ansible 运行环境</Space>} extra={<Space><Button size="small" icon={<ReloadOutlined />} onClick={refresh} /><Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={async () => { await api.post('/ansible/install'); message.info('已在后台安装,请稍后刷新'); }}>一键安装</Button></Space>} style={{ marginBottom: 12 }}>
      <Space size={24} wrap>
        <StatItem ok={status?.installed} label="ansible-playbook" value={status?.ansiblePlaybook?.version} />
        <StatItem ok={status?.sshpass?.ok} label="sshpass(密码认证)" value={status?.sshpass?.version} />
        <StatItem ok={status?.python?.ok} label="python3" value={status?.python?.version} />
      </Space>
      {!status?.installed && <Alert style={{ marginTop: 8 }} type="warning" showIcon message="本机尚未安装 Ansible。点「一键安装」(apt 安装 ansible + sshpass),或自行: apt install -y ansible sshpass" />}
      {status?.installed && !status?.sshpass?.ok && <Alert style={{ marginTop: 8 }} type="info" showIcon message="sshpass 未装,使用密码认证的远程主机将无法连接;可点上方安装按钮补装" />}
    </Card>
  );

  const targets = inv?.hosts || [];
  const targetOptions = [
    { value: 'all', label: '全部(all)' },
    { value: 'local', label: '本机 [local]' },
    ...(targets.filter((h: any) => h.kind === 'ssh').length ? [{ value: 'managed', label: 'SSH 主机 [managed]' }] : []),
    ...(targets.filter((h: any) => h.kind === 'ssh').map((h: any) => ({ value: h.id, label: `${h.name} @ ${h.host}` }))),
    ...(new Set(targets.filter((h: any) => h.kind === 'ssh').flatMap((h: any) => h.tags || [])).size ? [...new Set(targets.filter((h: any) => h.kind === 'ssh').flatMap((h: any) => h.tags || []))].map((t) => ({ value: `tag_${t}`, label: `标签 ${t} [tag_${t}]` })) : []),
  ];

  return (
    <Card size="small" styles={{ body: { padding: 8 } }}>
      <Tabs activeKey={tab} onChange={setTab} items={[
        { key: 'overview', label: <Space><DashboardOutlined />总览 / Inventory</Space>, children: (<>
          {statusCard}
          <Card size="small" title="Inventory(自动由「纳管主机」生成,凭据直接复用,存于本地 data 目录)">
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Alert type="info" showIcon message="目标选择: all=全部, local=本机, managed=所有 SSH 主机, 也可按单个主机或标签。自定义 inventory 片段会附加到文件末尾(高级)。" />
              <Input.TextArea rows={14} value={inv?.inventory || ''} readOnly style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </Space>
          </Card>
        </>) },
        { key: 'playbooks', label: <Space><BookOutlined />Playbook 库</Space>, children: (<>
          <Space style={{ marginBottom: 8 }} wrap>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setPbName(''); setPbContent('---\n- name: 我的任务\n  hosts: all\n  tasks:\n    - name: ping\n      ansible.builtin.ping:\n'); setPbModal(true); }}>新建 Playbook</Button>
            <Text type="secondary">选择文件后可直接「运行」;或点名称编辑</Text>
          </Space>
          <Table size="small" rowKey="name" dataSource={pbs.files} pagination={false} columns={[
            { title: '文件', dataIndex: 'name', render: (v: string, r: any) => <a onClick={async () => { const d = await api.get('/ansible/playbooks/' + v); setPbName(v); setPbContent(d.content); setPbModal(true); }}>{v}</a> },
            { title: '大小', dataIndex: 'size', width: 90, render: (v: number) => v + ' B' },
            { title: '任务数', dataIndex: 'tasks', width: 90 },
            { title: '操作', width: 280, render: (_: any, r: any) => (<Space>
              <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => { setPbName(r.name); setPbModal(true); }} disabled={running}>运行</Button>
              <Popconfirm title="确认删除该 Playbook?" onConfirm={async () => { await api.del('/ansible/playbooks/' + r.name); loadPbs(); }}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
            </Space>) },
          ]} />
          <DividerT title="内置示例(点击可引入为文件)" />
          <Space wrap>
            {pbs.samples?.map((s: string) => <Tag key={s} style={{ cursor: 'pointer' }} onClick={async () => { const d = await api.get('/ansible/playbooks/' + s); setPbName(s); setPbContent(d.content); setPbModal(true); }}>{s} ✓</Tag>)}
          </Space>
        </>) },
        { key: 'runs', label: <Space><ThunderboltOutlined />执行记录</Space>, children: (<>
          <Table size="small" rowKey="id" dataSource={runs} pagination={{ pageSize: 10, showSizeChanger: false }} columns={[
            { title: '任务', dataIndex: 'title', ellipsis: true },
            { title: '类型', dataIndex: 'kind', width: 80, render: (v: string) => v === 'playbook' ? <Tag color="blue">playbook</Tag> : <Tag color="purple">adhoc</Tag> },
            { title: '目标', dataIndex: 'target', width: 120 },
            { title: '状态', dataIndex: 'status', width: 100, render: (v: string) => <Tag color={stTag(v)}>{v}</Tag> },
            { title: '开始', dataIndex: 'created', width: 160, render: (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false }) },
            { title: '操作', width: 150, render: (_: any, r: any) => (<Space>
              <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>日志</Button>
              {(r.status === 'running' || r.status === 'pending') && <Popconfirm title="取消该任务?" onConfirm={() => cancelRun(r.id)}><Button size="small" danger icon={<StopOutlined />}>取消</Button></Popconfirm>}
            </Space>) },
          ]} />
        </>) },
        { key: 'adhoc', label: <Space><ThunderboltOutlined />Ad-hoc</Space>, children: (<>
          <Card size="small">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Space wrap>
                <span>模块:</span>
                <Select showSearch style={{ width: 240 }} value={adhoc.module} onChange={(v) => setAdhoc({ ...adhoc, module: v })} options={MODULES.map((m) => ({ value: m.v, label: m.d }))} />
                <span>目标:</span>
                <Select style={{ width: 200 }} value={adhoc.target} onChange={(v) => setAdhoc({ ...adhoc, target: v })} options={targetOptions} />
              </Space>
              <Input.TextArea rows={2} placeholder="模块参数(args), 如: free -m   /   dest=/tmp/a.txt content=hi   /   name=nginx state=started" value={adhoc.args} onChange={(e) => setAdhoc({ ...adhoc, args: e.target.value })} />
              <Space>
                <span>Extra Vars(-e):</span>
                <Input placeholder="key=value 空格分隔, 如 env=prod version=1.2" style={{ width: 320 }} value={runVars} onChange={(e) => setRunVars(e.target.value)} />
                <Switch checked={runNotify} onChange={setRunNotify} checkedChildren="失败通知" unCheckedChildren="通知" />
              </Space>
              <Button type="primary" icon={<PlayCircleOutlined />} loading={running} onClick={adhocModal}>执行 Ad-hoc</Button>
              <Alert type="warning" showIcon message="ad-hoc 可对多台主机批量执行命令,请确认目标范围与命令安全性(例如 command 模块可加 executable,避免通配符注入)。" />
            </Space>
          </Card>
        </>) },
        { key: 'sched', label: <Space><ScheduleOutlined />定时任务</Space>, children: <SchedTab data={scheds} reload={loadScheds} targetOptions={targetOptions} pbs={pbs} onRunNow={async (id) => { try { await api.post('/ansible/schedules/run', { id }); message.success('已触发,见执行记录'); setTab('runs'); } catch (e: any) { message.error(String(e?.message || e)); } }} /> },
      ]} />

      {/* Playbook 编辑/运行弹窗 */}
      <Modal title={pbName ? `Playbook: ${pbName}` : '新建 Playbook'} open={pbModal} width={900} onCancel={() => setPbModal(false)}
        footer={<Space>
          <Input style={{ width: 260 }} placeholder="文件名(如 my-task.yml)" value={pbName} onChange={(e) => setPbName(e.target.value)} />
          <Button onClick={async () => { if (!pbName.trim()) return message.warning('请先填文件名'); await api.post('/ansible/playbooks', { name: pbName.trim(), content: pbContent }); message.success('已保存'); loadPbs(); setPbModal(false); }}>保存</Button>
          <Popconfirm title={`确认对 ${runTarget} 运行 ${pbName || '该'} Playbook?`} onConfirm={() => runPb(pbName)}><Button type="primary" icon={<PlayCircleOutlined />} loading={running} disabled={!pbName}>保存并运行</Button></Popconfirm>
        </Space>}>
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Space wrap>
            <span>运行目标:</span>
            <Select style={{ width: 220 }} value={runTarget} onChange={setRunTarget} options={targetOptions} />
            <span>Extra Vars(-e):</span>
            <Input placeholder="key=value" style={{ width: 240 }} value={runVars} onChange={(e) => setRunVars(e.target.value)} />
            <Switch checked={runNotify} onChange={setRunNotify} checkedChildren="失败通知" unCheckedChildren="通知" />
          </Space>
          <div style={{ border: '1px solid #eee', borderRadius: 6 }}>
            <Input.TextArea value={pbContent} onChange={(e) => setPbContent(e.target.value)} autoSize={false} rows={22}
              spellCheck={false} style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', fontSize: 13, lineHeight: 1.6, background: '#0d1117', color: '#c9d1d9', border: 'none', borderRadius: 6 }}
              placeholder={'---\n- name: 任务名\n  hosts: all\n  become: true\n  tasks:\n    - name: ping\n      ansible.builtin.ping:'} />
            <div style={{ fontSize: 11, color: '#888', padding: '2px 8px' }}>YAML 编辑(纯文本,离线可用);缩进用两个空格</div>
          </div>
        </Space>
      </Modal>

      {/* 运行日志抽屉 */}
      <Drawer title={`运行日志 · ${detail?.title || detailId}`} width={720} open={!!detailId} onClose={() => { setDetailId(null); setDetail(null); }} extra={detail && (detail.status === 'running' || detail.status === 'pending') ? <Badge status="processing" text="运行中…" /> : <Tag color={stTag(detail?.status)}>{detail?.status}</Tag>}>
        {detail?.summary && <Alert type="success" style={{ marginBottom: 8 }} message={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{detail.summary}</pre>} />}
        <pre style={{ background: '#111', color: '#cfc', padding: 10, borderRadius: 6, maxHeight: '70vh', overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap' }}>{(detail?.log || []).join('\n')}</pre>
      </Drawer>
    </Card>
  );
}

function StatItem({ ok, label, value }: { ok?: boolean; label: string; value?: string }) {
  return (<Space><Badge status={ok ? 'success' : 'error'} /><Text strong>{label}</Text>{value ? <Text type="secondary" style={{ fontSize: 12 }}>{value}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>未检测</Text>}</Space>);
}
function DividerT({ title }: { title: string }) { return <div style={{ margin: '12px 0 8px', color: '#888', fontSize: 13 }}>{title}</div>; }

function SchedTab({ data, reload, targetOptions, pbs, onRunNow }: any) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({});
  const save = async () => {
    if (!f.name || !f.intervalMin) return message.warning('请填名称与间隔');
    const list = data.filter((x: any) => x.id !== f.id);
    const item = { ...f, id: f.id || ('s' + Date.now()), enabled: !!f.enabled, notify: !!f.notify, intervalMin: Number(f.intervalMin), kind: f.kind || 'playbook' };
    await api.post('/ansible/schedules', { schedules: [...list, item] });
    message.success('已保存'); setOpen(false); reload();
  };
  return (<>
    <Space style={{ marginBottom: 8 }}><Button type="primary" icon={<PlusOutlined />} onClick={() => { setF({ kind: 'playbook', enabled: true, intervalMin: 60 }); setOpen(true); }}>新建定时任务</Button><Text type="secondary">按固定间隔(分钟)自动执行 Playbook/Ad-hoc;失败可推送到右上角铃铛告警</Text></Space>
    <Table size="small" rowKey="id" dataSource={data} pagination={false} columns={[
      { title: '名称', dataIndex: 'name' },
      { title: '间隔(分)', dataIndex: 'intervalMin', width: 90 },
      { title: '类型', dataIndex: 'kind', width: 90, render: (v: string) => v === 'playbook' ? 'playbook' : 'adhoc' },
      { title: '内容', width: 220, ellipsis: true, render: (_: any, r: any) => r.kind === 'playbook' ? r.playbook : `${r.module} ${r.adhocArgs || ''}` },
      { title: '目标', dataIndex: 'target', width: 100 },
      { title: '上次', width: 150, render: (_: any, r: any) => r.lastRun ? <Space size={4}><Tag color={{ ok: 'success', fail: 'error', cancelled: 'warning' }[r.lastStatus] || 'default'}>{r.lastStatus}</Tag><Text style={{ fontSize: 11 }}>{new Date(r.lastRun).toLocaleString('zh-CN', { hour12: false })}</Text></Space> : '-' },
      { title: '启用', dataIndex: 'enabled', width: 70, render: (v: boolean, r: any) => <Switch size="small" checked={!!v} onChange={async (c) => { await api.post('/ansible/schedules', { schedules: data.map((x: any) => x.id === r.id ? { ...x, enabled: c } : x) }); reload(); }} /> },
      { title: '操作', width: 200, render: (_: any, r: any) => (<Space>
        <Button size="small" onClick={() => { setF(r); setOpen(true); }}>编辑</Button>
        <Button size="small" type="primary" ghost icon={<PlayCircleOutlined />} onClick={() => onRunNow(r.id)}>立即执行</Button>
        <Popconfirm title="删除该定时任务?" onConfirm={async () => { await api.post('/ansible/schedules', { schedules: data.filter((x: any) => x.id !== r.id) }); reload(); }}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>) },
    ]} />
    <Modal title={f.id ? '编辑定时任务' : '新建定时任务'} open={open} onCancel={() => setOpen(false)} onOk={save} okText="保存" width={620}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Space><Text>名称:</Text><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="如: 每日巡检 / 部署 nginx" style={{ width: 300 }} /></Space>
        <Space><Text>间隔(分钟):</Text><InputNumber min={1} max={43200} value={f.intervalMin} onChange={(v) => setF({ ...f, intervalMin: v })} /> <Switch checked={f.enabled} onChange={(c) => setF({ ...f, enabled: c })} checkedChildren="启用" unCheckedChildren="停用" /></Space>
        <Space><Text>类型:</Text><Select style={{ width: 140 }} value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: 'playbook', label: 'Playbook' }, { value: 'adhoc', label: 'Ad-hoc' }]} />
          {f.kind === 'playbook'
            ? <Select showSearch style={{ width: 220 }} placeholder="选择 Playbook" value={f.playbook} onChange={(v) => setF({ ...f, playbook: v })} options={(pbs?.files || []).map((x: any) => ({ value: x.name, label: x.name }))} />
            : (<><Select style={{ width: 160 }} value={f.module} onChange={(v) => setF({ ...f, module: v })} options={MODULES.map((m) => ({ value: m.v, label: m.d }))} /><Input placeholder="args" style={{ width: 160 }} value={f.adhocArgs} onChange={(e) => setF({ ...f, adhocArgs: e.target.value })} /></>)}
        </Space>
        <Space><Text>目标:</Text><Select style={{ width: 220 }} value={f.target} onChange={(v) => setF({ ...f, target: v })} options={targetOptions} />
          <Text>Extra Vars:</Text><Input style={{ width: 180 }} placeholder="k=v" value={f.extraVars} onChange={(e) => setF({ ...f, extraVars: e.target.value })} /></Space>
        <Space><Switch checked={f.notify} onChange={(c) => setF({ ...f, notify: c })} checkedChildren="失败通知铃铛" unCheckedChildren="失败不通知" /></Space>
      </Space>
    </Modal>
  </>);
}
