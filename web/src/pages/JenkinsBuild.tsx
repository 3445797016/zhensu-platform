import { Fragment, useEffect, useRef, useState } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, Tag, App, Popconfirm, Drawer, Switch,
  Empty, Tooltip, Badge, Row, Col, Divider, Typography, InputNumber, Segmented, Progress, List, Alert,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, PlayCircleOutlined, EditOutlined, ReloadOutlined, StopOutlined,
  RocketOutlined, CheckCircleFilled, CloseCircleFilled, LoadingOutlined, MinusCircleFilled,
  ClockCircleFilled, PartitionOutlined, ApiOutlined, LinkOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { api } from '../api';

const { Text, Paragraph } = Typography;

const stripAnsi = (s: string) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');
const statusColor = (s: string) => (s === 'success' ? '#52c41a' : s === 'failed' ? '#ff4d4f' : s === 'aborted' ? '#faad14' : '#1677ff');
const WEATHER: Record<string, { icon: string; tip: string }> = {
  sun: { icon: '☀️', tip: '构建健康(成功率≥80%)' },
  partly: { icon: '🌤️', tip: '基本健康(60%~80%)' },
  cloudy: { icon: '☁️', tip: '不稳定(40%~60%)' },
  rain: { icon: '🌧️', tip: '频繁失败(20%~40%)' },
  storm: { icon: '⛈️', tip: '严重失败(<20%)' },
  none: { icon: '🌫️', tip: '暂无构建' },
};

// ================= Jenkins 复刻:构建任务引擎 =================
export default function JenkinsBuild() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [repos, setRepos] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [hook, setHook] = useState<any>(null);
  const [form] = Form.useForm();
  const { message } = App.useApp();

  const load = async () => { setJobs(await api.get('/jenkins/jobs')); setRepos(await api.get('/devops/repos')); setQueue(await api.get('/jenkins/queue')); };
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);

  const buildNow = async (job: any) => {
    const params = job.params || [];
    const doBuild = async (values: any) => {
      try {
        const r = await api.post(`/jenkins/jobs/${job.id}/build`, { trigger: 'manual', params: values });
        r.queued ? message.warning(`任务繁忙,已进入队列(第 ${r.position} 位)`) : message.success(`已触发 #${r.number}`);
        load();
      } catch (e: any) { message.error(String(e.message || e)); }
    };
    if (params.length) {
      let values: any = {};
      Modal.confirm({
        title: `参数化构建 · ${job.name}`,
        content: <Form layout="vertical">{params.map((p: any) => (
          <Form.Item key={p.name} label={p.name + (p.description ? `(${p.description})` : '')}>
            <Input placeholder={p.defaultValue} onChange={(e) => { values[p.name] = e.target.value; }} />
          </Form.Item>
        ))}</Form>,
        onOk: () => doBuild(values), okText: '构建',
      });
    } else doBuild({});
  };

  const save = async (v: any) => {
    try {
      if (edit?.id) { await api.put(`/jenkins/jobs/${edit.id}`, v); message.success('已更新'); }
      else { await api.post('/jenkins/jobs', v); message.success('已创建'); }
      setOpen(false); load();
    } catch (e: any) { message.error(String(e.message || e)); }
  };

  const cols = [
    {
      title: '任务', dataIndex: 'name', render: (v: string, r: any) => <Space>
        <Tooltip title={WEATHER[r.weather]?.tip}><span style={{ fontSize: 20 }}>{WEATHER[r.weather]?.icon || ''}</span></Tooltip>
        <Badge status={r.enabled === false ? 'default' : 'success'} /><b>{v}</b>{r.running && <Tag color="processing">构建中</Tag>}
      </Space>,
    },
    { title: '成功/失败', render: (_: any, r: any) => <Space size={6}>
      <Tooltip title={`成功 ${r.stats?.success || 0} 次`}><Tag color="green">✓ {r.stats?.success || 0}</Tag></Tooltip>
      <Tooltip title={`失败 ${r.stats?.failed || 0} 次`}><Tag color="red">✗ {r.stats?.failed || 0}</Tag></Tooltip>
    </Space> },
    { title: '源码', dataIndex: 'repo', render: (v: string, r: any) => v === 'none' ? <Text type="secondary">无</Text> : <Tag>{v}{r.branch ? ':' + r.branch : ''}</Tag> },
    { title: '触发器', render: (_: any, r: any) => <Space size={4}>
      {r.triggers?.pollScm && <Tag color="blue">轮询 {r.triggers.pollMinutes}m</Tag>}
      {r.triggers?.cron && <Tag color="purple">cron {r.triggers.cron}</Tag>}
      {r.postBuild?.downstream?.length > 0 && <Tag color="cyan">下游 {r.postBuild.downstream.length}</Tag>}
      {!r.triggers?.pollScm && !r.triggers?.cron && <Text type="secondary">手动</Text>}
    </Space> },
    { title: '最近构建', dataIndex: 'lastBuild', render: (v: any) => v ? <Space size={4}><Tag color={statusColor(v.status)}>#{v.number}</Tag><Text type="secondary" style={{ fontSize: 11 }}>{v.durationMs ? Math.round(v.durationMs / 1000) + 's' : ''}</Text></Space> : '-' },
    {
      title: '操作', width: 380, render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" type="primary" icon={<PlayCircleOutlined />} loading={r.running} onClick={() => buildNow(r)}>构建</Button>
          <Button size="small" icon={<PartitionOutlined />} onClick={() => setDetail(r)}>Blue Ocean</Button>
          <Button size="small" icon={<ApiOutlined />} onClick={() => setHook(r)}>Webhook</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEdit(r); form.setFieldsValue({ ...r, steps: r.steps || [], params: r.params || [] }); setOpen(true); }} />
          <Popconfirm title={`删除任务 ${r.name}?`} onConfirm={async () => { await api.del('/jenkins/jobs/' + r.id); load(); }}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      {queue.length > 0 && <Card size="small" title={<Space><ClockCircleFilled style={{ color: '#faad14' }} />构建队列({queue.length})</Space>} style={{ borderColor: '#ffe58f' }}>
        <List size="small" dataSource={queue} renderItem={(q: any) => <List.Item><Space><Badge status="warning" /><b>{q.jobName}</b><Tag>第 {q.position} 位</Tag><Text type="secondary">触发:{q.trigger} · {new Date(q.queuedAt).toLocaleTimeString()}</Text></Space></List.Item>} />
      </Card>}

      <Card size="small">
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEdit(null); form.resetFields(); form.setFieldsValue({ repo: 'none', branch: 'main', steps: [{ name: 'Shell', command: 'echo hello' }], params: [], triggers: { pollScm: false, pollMinutes: 5, cron: '' }, postBuild: {} }); setOpen(true); }}>新建任务</Button>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Text type="secondary">内置 Jenkins 式构建引擎:任务 + 工作区 + 控制台 + 触发器 + 并发队列 + 下游触发 + Webhook</Text>
        </Space>
        <Table rowKey="id" dataSource={jobs} columns={cols} size="middle" pagination={false} />
      </Card>

      <Modal title={edit ? '编辑任务' : '新建任务'} width={800} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} destroyOnClose>
        <JobForm form={form} repos={repos} jobs={jobs} onFinish={save} />
      </Modal>

      <Modal title={<Space><ApiOutlined />Webhook 自动触发 · {hook?.name || ''}</Space>} open={!!hook} onCancel={() => setHook(null)} footer={null} width={620}>
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="外部系统(Git/GitLab/GitHub CI 等)可通过 POST 该地址自动触发构建,无需登录。" />
        <Paragraph copyable={{ text: `${location.origin}/api/open/jenkins/webhook/${hook?.id}?token=${hook?.webhookToken}` }} style={{ background: '#f6f8fa', padding: 10, borderRadius: 6 }}>
          <code style={{ wordBreak: 'break-all' }}>{location.origin}/api/open/jenkins/webhook/{hook?.id}?token={hook?.webhookToken}</code>
        </Paragraph>
        <Space>
          <Text type="secondary">Token:</Text><Text code>{hook?.webhookToken}</Text>
          <Button size="small" icon={<ReloadOutlined />} onClick={async () => { const r = await api.post(`/jenkins/jobs/${hook.id}/webhook/reset`); setHook({ ...hook, webhookToken: r.token }); message.success('Token 已重置'); }}>重置 Token</Button>
        </Space>
        <Divider />
        <Text type="secondary" style={{ fontSize: 12 }}>curl 示例:</Text>
        <pre style={{ background: '#f6f8fa', padding: 10, borderRadius: 6, fontSize: 11 }}>{`curl -X POST '${location.origin}/api/open/jenkins/webhook/${hook?.id}?token=${hook?.webhookToken}' -H 'Content-Type: application/json' -d '{"payload":{"branch":"main"}}'`}</pre>
      </Modal>

      {detail && <BuildDetail job={detail} onClose={() => { setDetail(null); load(); }} onBuild={buildNow} />}
    </Space>
  );
}

function JobForm({ form, repos, jobs, onFinish }: { form: any; repos: any[]; jobs: any[]; onFinish: (v: any) => void }) {
  const editId = Form.useWatch('id', form);
  return (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Row gutter={12}>
        <Col span={12}><Form.Item name="name" label="任务名称" rules={[{ required: true }]}><Input /></Form.Item></Col>
        <Col span={12}><Form.Item name="description" label="描述"><Input /></Form.Item></Col>
      </Row>
      <Divider orientation="left" plain>源码管理(SCM)</Divider>
      <Row gutter={12}>
        <Col span={14}><Form.Item name="repo" label="本地仓库" rules={[{ required: true }]}>
          <Select options={[{ value: 'none', label: '无(仅执行命令)' }, ...repos.map((r) => ({ value: r.name, label: r.name }))]} />
        </Form.Item></Col>
        <Col span={10}><Form.Item name="branch" label="分支"><Input placeholder="main" /></Form.Item></Col>
      </Row>
      <Form.Item name="remote" label="远程 Git URL(可选,覆盖本地仓库)"><Input placeholder="https://github.com/user/repo.git" /></Form.Item>

      <Divider orientation="left" plain>构建步骤(Execute Shell)</Divider>
      <Form.List name="steps">
        {(fields, { add, remove }) => (
          <>
            {fields.map((f) => (
              <Space key={f.key} align="baseline" style={{ display: 'flex', marginBottom: 6 }}>
                <Form.Item name={[f.name, 'name']} rules={[{ required: true, message: '步骤名' }]}><Input placeholder="步骤名" style={{ width: 160 }} /></Form.Item>
                <Form.Item name={[f.name, 'command']} rules={[{ required: true, message: '命令' }]}><Input placeholder="npm install && npm run build" style={{ width: 460 }} /></Form.Item>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
              </Space>
            ))}
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => add({ name: 'Shell', command: '' })}>添加步骤</Button>
          </>
        )}
      </Form.List>

      <Divider orientation="left" plain>触发器</Divider>
      <Space size="large" align="start">
        <Form.Item name={['triggers', 'pollScm']} label="轮询 SCM" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item noStyle shouldUpdate>{(f) => f.getFieldValue(['triggers', 'pollScm']) ? <Form.Item name={['triggers', 'pollMinutes']} label="轮询间隔(分钟)"><InputNumber min={1} max={1440} /></Form.Item> : null}</Form.Item>
        <Form.Item name={['triggers', 'cron']} label="定时 Cron(分 时 日 月 周)"><Input placeholder="0 2 * * *" style={{ width: 150 }} /></Form.Item>
      </Space>

      <Divider orientation="left" plain>参数(可选)</Divider>
      <Form.List name="params">
        {(fields, { add, remove }) => (
          <>
            {fields.map((f) => (
              <Space key={f.key} align="baseline" style={{ display: 'flex', marginBottom: 6 }}>
                <Form.Item name={[f.name, 'name']} rules={[{ required: true, message: '参数名' }]}><Input placeholder="参数名" style={{ width: 150 }} /></Form.Item>
                <Form.Item name={[f.name, 'defaultValue']}><Input placeholder="默认值" style={{ width: 200 }} /></Form.Item>
                <Form.Item name={[f.name, 'description']}><Input placeholder="说明" style={{ width: 200 }} /></Form.Item>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
              </Space>
            ))}
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => add({ name: '', defaultValue: '', description: '' })}>添加参数</Button>
          </>
        )}
      </Form.List>

      <Divider orientation="left" plain>构建后操作</Divider>
      <Space size="large" align="start" wrap>
        <Form.Item name={['postBuild', 'sonarScan']} label="SonarScanner 扫描" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name={['postBuild', 'nexusUpload']} label="上传制品到 Nexus" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item noStyle shouldUpdate>{(f) => f.getFieldValue(['postBuild', 'nexusUpload']) ? <>
          <Form.Item name={['postBuild', 'artifactPath']} label="制品路径"><Input placeholder="dist/app.tar.gz" style={{ width: 170 }} /></Form.Item>
          <Form.Item name={['postBuild', 'nexusRepo']} label="仓库" initialValue="raw-hosted"><Input style={{ width: 110 }} /></Form.Item>
        </> : null}</Form.Item>
      </Space>
      <Divider orientation="left" plain>下游触发(构建后触发其他任务)</Divider>
      <Space align="start" wrap>
        <Form.Item name={['postBuild', 'downstream']} label="下游任务" style={{ marginBottom: 0 }}>
          <Select mode="multiple" style={{ width: 360 }} placeholder="选择构建完成后要触发的任务" options={jobs.filter((j) => j.id !== editId).map((j) => ({ value: j.id, label: j.name }))} />
        </Form.Item>
        <Form.Item name={['postBuild', 'downstreamCondition']} label="触发条件" initialValue="success" style={{ marginBottom: 0 }}>
          <Select style={{ width: 120 }} options={[{ value: 'success', label: '成功时' }, { value: 'failure', label: '失败时' }, { value: 'always', label: '总是' }]} />
        </Form.Item>
      </Space>
    </Form>
  );
}

// ================= Blue Ocean 风格构建详情 =================
function BuildDetail({ job, onClose, onBuild }: { job: any; onClose: () => void; onBuild: (j: any) => void }) {
  const [builds, setBuilds] = useState<any[]>([]);
  const [cur, setCur] = useState<any>(null);
  const [fullLog, setFullLog] = useState('');
  const [selStage, setSelStage] = useState<number>(-1);
  const [view, setView] = useState<'stage' | 'console'>('stage');
  const boxRef = useRef<HTMLDivElement>(null);
  const logOff = useRef(0);

  const loadBuilds = async () => setBuilds(await api.get(`/jenkins/jobs/${job.id}/builds`));
  useEffect(() => { loadBuilds(); }, []);

  useEffect(() => {
    if (!cur) return;
    let alive = true;
    logOff.current = 0;
    setFullLog('');
    const poll = async () => {
      try {
        const r = await api.get(`/jenkins/builds/${cur.id}/log`, { offset: logOff.current });
        if (!alive) return;
        if (r.log) { setFullLog((p) => p + r.log); logOff.current = r.offset; }
        if (!r.finished) setTimeout(poll, 1200);
        else loadBuilds();
      } catch { if (alive) setTimeout(poll, 2000); }
    };
    poll();
    return () => { alive = false; };
  }, [cur?.id]);

  const selectBuild = async (b: any) => { setSelStage(-1); setCur(await api.get(`/jenkins/builds/${b.id}`)); };

  const stageLog = (s: any) => {
    if (!s || s.startLog === undefined) return fullLog;
    const end = s.endLog !== undefined ? s.endLog : fullLog.length;
    return fullLog.slice(s.startLog, end);
  };

  return (
    <Drawer title={<Space><RocketOutlined />{job.name} · Blue Ocean</Space>} width={1100} open onClose={onClose}>
      <Space style={{ marginBottom: 10 }}>
        <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => onBuild(job)}>立即构建</Button>
        <Button size="small" icon={<ReloadOutlined />} onClick={loadBuilds}>刷新历史</Button>
        {cur && <Button size="small" danger icon={<StopOutlined />} onClick={async () => { await api.post(`/jenkins/builds/${cur.id}/abort`); }}>中止构建</Button>}
        <Popconfirm title="清理工作区?" onConfirm={async () => { await api.post(`/jenkins/jobs/${job.id}/wipe`); }}><Button size="small">清理工作区</Button></Popconfirm>
      </Space>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12 }}>
        <div>
          <Card size="small" title="构建历史" bodyStyle={{ maxHeight: 660, overflow: 'auto', padding: 8 }}>
            {builds.length ? builds.map((b) => (
              <div key={b.id} onClick={() => selectBuild(b)} style={{ cursor: 'pointer', padding: '8px 10px', borderRadius: 6, marginBottom: 4, background: cur?.id === b.id ? '#e6f4ff' : '#fafafa', borderLeft: `3px solid ${statusColor(b.status)}` }}>
                <Space><Badge status={b.status === 'success' ? 'success' : b.status === 'failed' ? 'error' : b.status === 'aborted' ? 'warning' : 'processing'} /><b>#{b.number}</b></Space>
                <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{new Date(b.startedAt).toLocaleString()}</div>
                <div style={{ fontSize: 11, color: '#999' }}>{b.durationMs ? (b.durationMs / 1000).toFixed(1) + 's' : ''} · {b.trigger}{b.commit ? ' · ' + b.commit : ''}</div>
              </div>
            )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无构建" />}
          </Card>
        </div>

        <div>
          {cur && <PipelineGraph build={cur} onSelectStage={setSelStage} selStage={selStage} />}

          {cur && <Card size="small" style={{ marginTop: 10 }} title={<Space>
            <Segmented size="small" value={view} onChange={(v) => setView(v as any)} options={[{ label: '阶段日志', value: 'stage' }, { label: '完整控制台', value: 'console' }]} />
            {cur.commit && <Tag color="blue">commit {cur.commit}</Tag>}
            {cur.changes?.length > 0 && <Tooltip title={cur.changes.map((c: any) => `${c.hash} ${c.message}`).join('\n')}><Tag color="orange">变更 {cur.changes.length}</Tag></Tooltip>}
          </Space>} bodyStyle={{ padding: 0 }}>
            <div ref={boxRef} style={{ background: '#0b1021', color: '#d0d7e5', fontFamily: 'Menlo,Consolas,monospace', fontSize: 12, padding: 14, minHeight: 300, maxHeight: 480, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {view === 'console'
                ? (stripAnsi(fullLog) || (cur ? '等待输出...' : ''))
                : (selStage >= 0 && cur?.stages?.[selStage] ? stripAnsi(stageLog(cur.stages[selStage])) : <span style={{ color: '#8892a8' }}>点击上方阶段块查看该阶段日志</span>)}
            </div>
          </Card>}
        </div>
      </div>
    </Drawer>
  );
}

// ================= Blue Ocean 大块进度条流水线 =================
function PipelineGraph({ build, onSelectStage, selStage }: { build: any; onSelectStage: (i: number) => void; selStage: number }) {
  const [status, setStatus] = useState<any>(null);
  useEffect(() => {
    if (!build?.id) return;
    let alive = true;
    const poll = async () => {
      try {
        const s = await api.get(`/jenkins/builds/${build.id}/status`);
        if (!alive) return;
        setStatus(s);
        if (s.running) setTimeout(poll, 1000);
      } catch { if (alive) setTimeout(poll, 1500); }
    };
    poll();
    return () => { alive = false; };
  }, [build?.id]);

  const stages = status?.stages || [];
  const totalDur = status?.durationMs ? (status.durationMs / 1000).toFixed(1) + 's' : '';

  return (
    <Card size="small" title={<Space><PartitionOutlined style={{ color: '#1677ff' }} />构建流程 {status ? `#${status.number}` : ''}<Tag color={statusColor(status?.status)}>{status?.status}</Tag>{totalDur && <Text type="secondary" style={{ fontSize: 12 }}>总耗时 {totalDur}</Text>}</Space>}>
      <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', padding: '10px 2px 6px' }}>
        {stages.map((s: any, i: number) => {
          const color = stageColor(s.status);
          const selected = selStage === i;
          return (
            <Fragment key={i}>
              {i > 0 && <div style={{ flex: '0 0 30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c0c4cc', fontSize: 16 }}>▸</div>}
              <div onClick={() => onSelectStage(i)} style={{
                flex: '0 0 158px', minHeight: 104, borderRadius: 10, cursor: 'pointer', background: '#fff',
                border: selected ? `2px solid ${color}` : '1px solid #eef0f3', borderTop: `5px solid ${color}`,
                boxShadow: selected ? `0 4px 14px ${color}33` : '0 1px 5px rgba(0,0,0,0.06)',
                padding: '10px 12px 8px', display: 'flex', flexDirection: 'column', transition: 'all .2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 19, lineHeight: 1 }}>{stageIcon(s.status)}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.name}>{s.name}</span>
                </div>
                <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                  <Progress percent={progressOf(s.status)} status={progressStatus(s.status) as any} showInfo={false} strokeColor={color} size="small" />
                  <div style={{ fontSize: 11, color: '#999', marginTop: 3, textAlign: 'center' }}>
                    {s.status === 'running' ? <span style={{ color: '#1677ff', fontWeight: 600 }}>运行中…</span>
                      : s.status === 'pending' ? '等待中' : s.status === 'notbuilt' ? '未构建' : s.status === 'skipped' ? '跳过' : (s.durationMs ? (s.durationMs / 1000).toFixed(1) + 's' : '')}
                  </div>
                </div>
              </div>
            </Fragment>
          );
        })}
        {!stages.length && <Text type="secondary">正在初始化…</Text>}
      </div>
      <div style={{ marginTop: 4 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>成功 <Text code style={{ color: '#52c41a' }}>■</Text> 运行中 <Text code style={{ color: '#1677ff' }}>▨(动画)</Text> 失败 <Text code style={{ color: '#ff4d4f' }}>■</Text> 等待/未构建 <Text code>▢</Text> —— 点击阶段块查看日志</Text>
      </div>
    </Card>
  );
}

function stageColor(s: string): string {
  switch (s) {
    case 'success': return '#52c41a';
    case 'failed': return '#ff4d4f';
    case 'aborted': return '#faad14';
    case 'running': return '#1677ff';
    case 'skipped': return '#bfbfbf';
    default: return '#d9d9d9';
  }
}
function progressOf(s: string): number {
  if (s === 'running') return 45;
  if (s === 'success' || s === 'failed' || s === 'aborted' || s === 'skipped') return 100;
  return 0;
}
function progressStatus(s: string): string {
  if (s === 'success') return 'success';
  if (s === 'failed' || s === 'aborted') return 'exception';
  if (s === 'running') return 'active';
  return 'normal';
}
function stageIcon(s: string) {
  switch (s) {
    case 'success': return <CheckCircleFilled style={{ color: '#52c41a' }} />;
    case 'failed': return <CloseCircleFilled style={{ color: '#ff4d4f' }} />;
    case 'aborted': return <StopOutlined style={{ color: '#faad14' }} />;
    case 'running': return <LoadingOutlined spin style={{ color: '#1677ff' }} />;
    case 'skipped': return <MinusCircleFilled style={{ color: '#bfbfbf' }} />;
    case 'notbuilt': return <MinusCircleFilled style={{ color: '#e0e0e0' }} />;
    default: return <ClockCircleFilled style={{ color: '#d9d9d9' }} />;
  }
}
