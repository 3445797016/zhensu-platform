import { useEffect, useState } from 'react';
import {
  Card, Tabs, Table, Button, Space, Modal, Form, Input, Select, Tag, App, Popconfirm, Drawer,
  Alert, Switch, Timeline, Typography, Descriptions, Empty, Tooltip, Progress, Divider, Badge,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, FolderOpenOutlined, ReloadOutlined, PlayCircleOutlined,
  CloudServerOutlined, ScanOutlined, DatabaseOutlined, RocketOutlined, ImportOutlined,
  FileAddOutlined, CodeOutlined, CheckCircleOutlined, CloseCircleOutlined, PoweroffOutlined,
} from '@ant-design/icons';
import MonacoEditor from '@monaco-editor/react';
import { api } from '../api';
import JenkinsBuild from './JenkinsBuild';
import BuildTools from './BuildTools';

const { Text, Paragraph } = Typography;

// ================= 主入口:CI/CD 工具链 =================
export default function DevOpsToolchain() {
  return (
    <Tabs defaultActiveKey="jenkins" items={[
      { key: 'jenkins', label: 'Jenkins 构建引擎', children: <JenkinsBuild /> },
      { key: 'tools', label: '构建工具配置', children: <BuildTools /> },
      { key: 'repos', label: '本地仓库', children: <LocalRepos /> },
      { key: 'services', label: 'CI 服务(Jenkins/Sonar/Nexus/Gitea)', children: <CIServices /> },
      { key: 'pipeline', label: 'CI/CD 流水线', children: <CIPipeline /> },
      { key: 'sonar', label: '代码扫描', children: <SonarScan /> },
      { key: 'nexus', label: '制品仓库', children: <NexusArtifacts /> },
    ]} />
  );
}

// ================= 本地仓库 =================
function LocalRepos() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [cur, setCur] = useState<any>(null);
  const [form] = Form.useForm();
  const [impForm] = Form.useForm();
  const { message } = App.useApp();

  const load = async () => { setLoading(true); try { setList(await api.get('/devops/repos')); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const cols = [
    { title: '仓库', dataIndex: 'name', render: (v: string, r: any) => <Space><CodeOutlined style={{ color: '#4f8cff' }} /><b>{v}</b></Space> },
    { title: '说明', dataIndex: 'description', ellipsis: true },
    { title: '分支', dataIndex: 'branch', render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: '提交数', dataIndex: 'commits' },
    { title: '最近提交', dataIndex: 'last', render: (v: any) => v ? <span>{v.subject}<Text type="secondary" style={{ marginLeft: 6, fontSize: 11 }}>{v.date}</Text></span> : '-' },
    {
      title: '操作', width: 200, render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<FolderOpenOutlined />} onClick={() => setCur(r)}>查看</Button>
          <Popconfirm title={`删除仓库 ${r.name}?`} onConfirm={async () => { await api.del('/devops/repos/' + r.name); message.success('已删除'); load(); }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card size="small">
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>新建仓库</Button>
        <Button icon={<ImportOutlined />} onClick={() => { impForm.resetFields(); setImportOpen(true); }}>导入本地目录</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </Space>
      <Table rowKey="name" dataSource={list} columns={cols} size="middle" loading={loading} pagination={false} />

      <Modal title="新建本地仓库" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={async (v) => { const r = await api.post('/devops/repos', v); if (r.ok) { message.success('仓库已创建'); setCreateOpen(false); load(); } }}>
          <Form.Item name="name" label="仓库名(仅字母数字._-)" rules={[{ required: true }]}><Input placeholder="my-service" /></Form.Item>
          <Form.Item name="description" label="说明"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title="导入本地目录为仓库" open={importOpen} onCancel={() => setImportOpen(false)} onOk={() => impForm.submit()} destroyOnClose>
        <Form form={impForm} layout="vertical" onFinish={async (v) => { const r = await api.post('/devops/repos/' + v.name + '/import', { source: v.source, message: v.message }); if (r.ok) { message.success('导入成功'); setImportOpen(false); load(); } }}>
          <Form.Item name="name" label="仓库名" rules={[{ required: true }]}><Input placeholder="my-service" /></Form.Item>
          <Form.Item name="source" label="本机源目录路径" rules={[{ required: true }]}><Input placeholder="/home/kali/projects/demo" /></Form.Item>
          <Form.Item name="message" label="提交信息"><Input placeholder="import" /></Form.Item>
          <Alert type="info" showIcon message="源目录含 .git 时保留全部历史;否则按当前文件快照导入" />
        </Form>
      </Modal>

      {cur && <RepoDrawer repo={cur} onClose={() => { setCur(null); load(); }} />}
    </Card>
  );
}

function RepoDrawer({ repo, onClose }: { repo: any; onClose: () => void }) {
  const [info, setInfo] = useState<any>({ branches: [], commits: [] });
  const [files, setFiles] = useState<string[]>([]);
  const [branch, setBranch] = useState(repo.branch || 'main');
  const [selFile, setSelFile] = useState('');
  const [content, setContent] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();
  const { message } = App.useApp();

  const load = async () => {
    setInfo(await api.get(`/devops/repos/${repo.name}/info`));
    setFiles((await api.get(`/devops/repos/${repo.name}/tree`, { ref: branch })).files || []);
  };
  useEffect(() => { load(); }, [branch]);

  const openFile = async (p: string) => {
    setSelFile(p);
    const r = await api.get(`/devops/repos/${repo.name}/file`, { path: p, ref: branch });
    setContent(r.content || '');
  };

  return (
    <Drawer title={<Space><CodeOutlined />{repo.name}</Space>} width={820} open onClose={onClose}>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="克隆地址" description={<Paragraph copyable style={{ margin: 0 }}><code>git clone {repo.clonePath}</code></Paragraph>} />
      <Space style={{ marginBottom: 12 }}>
        <Select size="small" style={{ width: 160 }} value={branch} onChange={setBranch} options={(info.branches || []).map((b: string) => ({ value: b, label: b }))} />
        <Button size="small" icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        <Button size="small" icon={<FileAddOutlined />} onClick={() => { addForm.resetFields(); setAddOpen(true); }}>新增文件</Button>
      </Space>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
        <Card size="small" title="文件" bodyStyle={{ maxHeight: 520, overflow: 'auto', padding: 8 }}>
          {files.length ? files.map((f) => <div key={f} onClick={() => openFile(f)} style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, background: selFile === f ? '#e6f4ff' : undefined }}><FileAddOutlined style={{ marginRight: 6, color: '#999' }} />{f}</div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </Card>
        <Card size="small" title="提交历史" bodyStyle={{ maxHeight: 520, overflow: 'auto', padding: 8 }}>
          <Timeline items={(info.commits || []).map((c: any) => ({ children: <span><b>{c.hash}</b> {c.message}</span> }))} />
        </Card>
      </div>
      {selFile && <Card size="small" title={selFile} style={{ marginTop: 12 }}>
        <MonacoEditor height={320} language="plaintext" theme="light" value={content} options={{ readOnly: true, minimap: { enabled: false } }} />
      </Card>}

      <Modal title="新增文件并提交" open={addOpen} onCancel={() => setAddOpen(false)} onOk={() => addForm.submit()} destroyOnClose>
        <Form form={addForm} layout="vertical" onFinish={async (v) => {
          await api.post(`/devops/repos/${repo.name}/commit`, { files: [{ path: v.path, content: v.content }], message: v.message, branch });
          message.success('已提交'); setAddOpen(false); load(); setSelFile(''); setContent('');
        }}>
          <Form.Item name="path" label="文件路径(相对仓库根)" rules={[{ required: true }]}><Input placeholder="src/main.js" /></Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true }]}><Input.TextArea rows={10} /></Form.Item>
          <Form.Item name="message" label="提交信息"><Input placeholder="add file" /></Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}

// ================= CI 服务 =================
function CIServices() {
  const [list, setList] = useState<any[]>([]);
  const [busy, setBusy] = useState<string>('');
  const [logs, setLogs] = useState<{ id: string; content: string } | null>(null);
  const { message } = App.useApp();

  const load = async () => setList(await api.get('/devops/services'));
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  const act = async (id: string, action: string) => {
    setBusy(id + action);
    try { const r = await api.post(`/devops/services/${id}/action`, { action }); message.success(r.ok ? '操作成功' : (r.error || '操作失败')); await load(); }
    catch (e: any) { message.error(String(e.message || e)); } finally { setBusy(''); }
  };
  const deploy = async (id: string) => {
    setBusy(id + 'deploy');
    try { const r = await api.post(`/devops/services/${id}/deploy`, {}); r.ok ? message.success('部署完成(首次拉镜像较慢)') : message.error(r.error || '部署失败'); await load(); }
    catch (e: any) { message.error(String(e.message || e)); } finally { setBusy(''); }
  };

  const cols = [
    { title: '服务', dataIndex: 'name', render: (v: string, r: any) => <Space><CloudServerOutlined style={{ color: '#722ed1' }} /><b>{v}</b><Text type="secondary">{r.cn}</Text></Space> },
    { title: '说明', dataIndex: 'desc', ellipsis: true },
    { title: '访问地址', dataIndex: 'url', render: (v: string) => <a href={v} target="_blank" rel="noreferrer">{v}</a> },
    { title: '状态', render: (_: any, r: any) => r.running ? <Badge status="success" text={<Tag color="green">运行中</Tag>} /> : <Badge status="default" text={<Tag>{r.state === 'absent' ? '未部署' : r.state}</Tag>} /> },
    { title: '端口', dataIndex: 'port', render: (v: number, r: any) => <Tag color={r.portOpen ? 'green' : 'default'}>{v}{r.portOpen ? ' 开放' : ''}</Tag> },
    {
      title: '操作', width: 360, render: (_: any, r: any) => (
        <Space>
          {!r.running && <Button size="small" type="primary" icon={<RocketOutlined />} loading={busy === r.id + 'deploy'} onClick={() => deploy(r.id)}>部署</Button>}
          {r.running && <Button size="small" icon={<PoweroffOutlined />} onClick={() => act(r.id, 'stop')}>停止</Button>}
          {r.state !== 'absent' && !r.running && <Button size="small" icon={<PlayCircleOutlined />} onClick={() => act(r.id, 'start')}>启动</Button>}
          {r.running && <Button size="small" onClick={() => act(r.id, 'restart')}>重启</Button>}
          <Button size="small" onClick={async () => { const j = await api.get(`/devops/services/${r.id}/logs`); setLogs({ id: r.name, content: j.content }); }}>日志</Button>
          {r.state !== 'absent' && <Popconfirm title="删除容器?" onConfirm={() => act(r.id, 'remove')}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>}
        </Space>
      ),
    },
  ];

  return (
    <Card size="small">
      <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="一键部署提示:Jenkins 首次启动需 1-3 分钟;SonarQube/Nexus 首次启动需 2-5 分钟初始化,期间端口可能未就绪,请耐心等待并刷新。" />
      <Table rowKey="id" dataSource={list} columns={cols} size="middle" pagination={false} />
      <Drawer title={`日志 · ${logs?.id || ''}`} width={700} open={!!logs} onClose={() => setLogs(null)}>
        <pre style={{ background: '#0b1021', color: '#d0d7e5', padding: 12, borderRadius: 6, fontSize: 11, maxHeight: 560, overflow: 'auto' }}>{logs?.content || ''}</pre>
      </Drawer>
    </Card>
  );
}

// ================= 代码扫描(SonarQube) =================
function SonarScan() {
  const [cfg, setCfg] = useState<any>({});
  const [cfgForm] = Form.useForm();
  const [repos, setRepos] = useState<any[]>([]);
  const [scan, setScan] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [gate, setGate] = useState<any>(null);
  const [issues, setIssues] = useState<any>({ total: 0, issues: [] });
  const { message } = App.useApp();

  const loadCfg = async () => { const c = await api.get('/devops/sonar/config'); setCfg(c); cfgForm.setFieldsValue(c); };
  const loadRepos = async () => setRepos(await api.get('/devops/repos'));
  useEffect(() => { loadCfg(); loadRepos(); }, []);

  const doScan = async (v: any) => {
    setScanning(true); setScan(null); setGate(null); setIssues({ total: 0, issues: [] });
    try {
      const r = await api.post('/devops/scan', v);
      setScan(r);
      if (r.ok && r.projectKey) {
        setTimeout(async () => {
          try { setGate(await api.get('/devops/sonar/qualitygate', { projectKey: r.projectKey })); setIssues(await api.get('/devops/sonar/issues', { projectKey: r.projectKey })); } catch {}
        }, 5000);
      } else if (r.error) message.error(r.error);
    } catch (e: any) { message.error(String(e.message || e)); } finally { setScanning(false); }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Card size="small" title="SonarQube 连接配置">
        <Form form={cfgForm} layout="inline" onFinish={async (v) => { await api.put('/devops/sonar/config', v); setCfg(v); message.success('已保存'); }}>
          <Form.Item name="hostUrl" label="SonarQube 地址" rules={[{ required: true }]}><Input style={{ width: 220 }} placeholder="http://localhost:9000" /></Form.Item>
          <Form.Item name="token" label="Token"><Input.Password style={{ width: 240 }} placeholder="SonarQube 用户令牌" /></Form.Item>
          <Form.Item name="projectKeyPrefix" label="项目前缀"><Input style={{ width: 120 }} /></Form.Item>
          <Button type="primary" htmlType="submit">保存</Button>
        </Form>
        <Alert style={{ marginTop: 10 }} type="info" showIcon message="在 SonarQube → 我的账户 → Security 生成 Token;扫描容器通过 --network host 访问本机 SonarQube。" />
      </Card>

      <Card size="small" title="执行扫描">
        <Space>
          <Select placeholder="选择仓库" style={{ width: 200 }} options={repos.map((r) => ({ value: r.name, label: r.name }))} onChange={(v) => setScan((s: any) => ({ ...s, repo: v }))} />
          <Select placeholder="分支" style={{ width: 130 }} defaultValue="main" options={['main', 'master', 'develop'].map((b) => ({ value: b, label: b }))} onChange={(v) => setScan((s: any) => ({ ...s, branch: v }))} />
          <Button type="primary" icon={<ScanOutlined />} loading={scanning} onClick={() => { if (!scan?.repo) return message.warning('请选择仓库'); doScan(scan); }}>开始扫描</Button>
        </Space>
        {scan?.output && <pre style={{ background: '#0b1021', color: '#d0d7e5', padding: 12, borderRadius: 6, fontSize: 11, maxHeight: 300, overflow: 'auto', marginTop: 12 }}>{scan.output}</pre>}
      </Card>

      {gate?.projectStatus && <Card size="small" title="质量门禁">
        <Space size={24}>
          <Stat text="状态" value={gate.projectStatus.status} color={gate.projectStatus.status === 'OK' ? 'green' : 'red'} />
          {gate.projectStatus.conditions?.map((c: any) => <Stat key={c.metricKey} text={c.metricKey} value={c.status} color={c.status === 'OK' ? 'green' : 'orange'} />)}
        </Space>
      </Card>}

      {issues.total > 0 && <Card size="small" title={`问题列表(${issues.total})`}>
        <Table rowKey="key" size="small" dataSource={issues.issues} pagination={false} columns={[
          { title: '级别', dataIndex: 'severity', width: 80, render: (v: string) => <Tag color={v === 'BLOCKER' || v === 'CRITICAL' ? 'red' : v === 'MAJOR' ? 'orange' : 'blue'}>{v}</Tag> },
          { title: '规则', dataIndex: 'rule', width: 140, ellipsis: true },
          { title: '文件', dataIndex: 'component', ellipsis: true },
          { title: '行', dataIndex: 'line', width: 60 },
          { title: '描述', dataIndex: 'message', ellipsis: true },
        ]} />
      </Card>}
    </Space>
  );
}
function Stat({ text, value, color }: { text: string; value: string; color: string }) {
  return <div><div style={{ fontSize: 12, color: '#999' }}>{text}</div><Text strong style={{ color, fontSize: 18 }}>{value}</Text></div>;
}

// ================= 制品仓库(Nexus) =================
function NexusArtifacts() {
  const [cfg, setCfg] = useState<any>({});
  const [cfgForm] = Form.useForm();
  const [repos, setRepos] = useState<any[]>([]);
  const [selRepo, setSelRepo] = useState('');
  const [components, setComponents] = useState<any[]>([]);
  const [upForm] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const { message } = App.useApp();

  const loadCfg = async () => { const c = await api.get('/devops/nexus/config'); setCfg(c); cfgForm.setFieldsValue(c); };
  const loadRepos = async () => { const r = await api.get('/devops/nexus/repos'); setRepos(r.repos || []); if (r.error) message.warning(r.error); };
  useEffect(() => { loadCfg(); loadRepos(); }, []);

  const loadComponents = async (repo: string) => {
    setSelRepo(repo);
    const r = await api.get('/devops/nexus/components', { repository: repo });
    setComponents(r.components || []);
    if (r.error) message.warning(r.error);
  };

  const upload = async (v: any) => {
    setUploading(true);
    try { const r = await api.post('/devops/nexus/upload', v); r.ok ? message.success('上传成功') : message.error(r.error || r.output || '上传失败'); }
    catch (e: any) { message.error(String(e.message || e)); } finally { setUploading(false); }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Card size="small" title="Nexus 连接配置">
        <Form form={cfgForm} layout="inline" onFinish={async (v) => { await api.put('/devops/nexus/config', v); setCfg(v); message.success('已保存'); }}>
          <Form.Item name="url" label="地址" rules={[{ required: true }]}><Input style={{ width: 220 }} placeholder="http://localhost:8081" /></Form.Item>
          <Form.Item name="username" label="账号"><Input style={{ width: 140 }} /></Form.Item>
          <Form.Item name="password" label="密码"><Input.Password style={{ width: 140 }} /></Form.Item>
          <Button type="primary" htmlType="submit">保存</Button>
          <Button icon={<ReloadOutlined />} onClick={loadRepos}>刷新仓库</Button>
        </Form>
        <Alert style={{ marginTop: 10 }} type="info" showIcon message="Nexus 默认账号 admin,首次密码在容器 /nexus-data/admin.password 文件内(可 docker exec 查看)。" />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 12 }}>
        <Card size="small" title="仓库列表" bodyStyle={{ maxHeight: 480, overflow: 'auto' }}>
          {repos.length ? repos.map((r) => <div key={r.name} onClick={() => loadComponents(r.name)} style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 4, background: selRepo === r.name ? '#e6f4ff' : undefined }}>
            <DatabaseOutlined style={{ marginRight: 6, color: '#999' }} />{r.name}<Tag style={{ marginLeft: 6 }}>{r.format}</Tag>
          </div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无数据,请检查连接配置" />}
        </Card>
        <Card size="small" title={`制品组件 ${selRepo ? '· ' + selRepo : ''}`}>
          <Table rowKey="id" size="small" dataSource={components} pagination={{ pageSize: 15 }} columns={[
            { title: '名称', dataIndex: 'name', ellipsis: true },
            { title: '版本', dataIndex: 'version', width: 100 },
            { title: '格式', dataIndex: 'format', width: 80, render: (v: string) => <Tag>{v}</Tag> },
            { title: '路径', dataIndex: 'assets', render: (a: string[]) => (a || []).slice(0, 2).map((p) => <div key={p}><Text code style={{ fontSize: 11 }}>{p}</Text></div>) },
          ]} />
        </Card>
      </div>

      <Card size="small" title="上传制品到 raw 仓库">
        <Form form={upForm} layout="inline" onFinish={upload}>
          <Form.Item name="repository" label="仓库" rules={[{ required: true }]} initialValue="raw-hosted"><Input style={{ width: 160 }} placeholder="raw-hosted" /></Form.Item>
          <Form.Item name="filePath" label="本机文件路径" rules={[{ required: true }]}><Input style={{ width: 320 }} placeholder="/home/kali/ops-hub/build/app.tar.gz" /></Form.Item>
          <Form.Item name="directory" label="目录" initialValue="/"><Input style={{ width: 120 }} /></Form.Item>
          <Button type="primary" icon={<RocketOutlined />} htmlType="submit" loading={uploading}>上传</Button>
        </Form>
      </Card>
    </Space>
  );
}

// ================= CI/CD 全流程流水线 =================
function CIPipeline() {
  const [repos, setRepos] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [cur, setCur] = useState<any>(null);
  const [form] = Form.useForm();
  const { message } = App.useApp();

  const load = async () => { setRepos(await api.get('/devops/repos')); setRuns(await api.get('/devops/ci/runs')); };
  useEffect(() => { load(); }, []);

  const runPipeline = async (v: any) => {
    setRunning(true); setCur(null);
    try {
      const r = await api.post('/devops/ci/run', v);
      setCur(r);
      message.success(r.status === 'success' ? '流水线执行成功' : '流水线执行失败');
      load();
    } catch (e: any) { message.error(String(e.message || e)); } finally { setRunning(false); }
  };

  const stageColor = (s: string) => s === 'success' ? 'green' : s === 'failed' ? 'red' : s === 'skipped' ? 'gray' : 'blue';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 12 }}>
      <Card size="small" title="流水线配置">
        <Form form={form} layout="vertical" onFinish={runPipeline} initialValues={{ branch: 'main', scan: false, uploadNexus: false }}>
          <Form.Item name="repo" label="代码仓库" rules={[{ required: true }]}>
            <Select placeholder="选择本地仓库" options={repos.map((r) => ({ value: r.name, label: r.name }))} />
          </Form.Item>
          <Form.Item name="branch" label="分支"><Input /></Form.Item>
          <Form.Item name="build" label="构建命令"><Input placeholder="npm install && npm run build" /></Form.Item>
          <Form.Item name="test" label="测试命令"><Input placeholder="npm test" /></Form.Item>
          <Form.Item name="scan" label="SonarScanner 代码扫描" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="package" label="打包命令"><Input placeholder="docker build -t app:latest . 或 mvn package" /></Form.Item>
          <Form.Item name="uploadNexus" label="上传制品到 Nexus" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.uploadNexus !== b.uploadNexus}>
            {({ getFieldValue }) => getFieldValue('uploadNexus') ? (
              <Space style={{ width: '100%' }}>
                <Form.Item name="artifactPath" label="制品路径(相对工作区)" rules={[{ required: true }]}><Input placeholder="dist/app.tar.gz" /></Form.Item>
                <Form.Item name="nexusRepo" label="Nexus 仓库" initialValue="raw-hosted"><Input style={{ width: 120 }} /></Form.Item>
              </Space>
            ) : null}
          </Form.Item>
          <Form.Item name="deploy" label="部署命令"><Input placeholder="docker run -d -p 80:80 app:latest" /></Form.Item>
          <Button type="primary" icon={<PlayCircleOutlined />} htmlType="submit" loading={running} block>执行流水线</Button>
        </Form>
      </Card>

      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        {cur?.stages && <Card size="small" title={`执行结果 · ${cur.repo}(${cur.branch})`} extra={<Tag color={cur.status === 'success' ? 'green' : 'red'}>{cur.status}</Tag>}>
          <Timeline items={cur.stages.map((s: any) => ({
            color: stageColor(s.status),
            children: <div><b>{s.name}</b> <Tag color={stageColor(s.status)}>{s.status}</Tag>
              {s.output && <pre style={{ background: '#f6f8fa', padding: 8, borderRadius: 6, fontSize: 11, maxHeight: 160, overflow: 'auto', marginTop: 6 }}>{s.output}</pre>}
            </div>,
          }))} />
        </Card>}

        <Card size="small" title="历史执行">
          <Table rowKey="id" size="small" dataSource={runs} pagination={{ pageSize: 10 }} columns={[
            { title: '仓库', dataIndex: 'repo' },
            { title: '分支', dataIndex: 'branch', width: 90 },
            { title: '状态', dataIndex: 'status', width: 90, render: (s: string) => <Tag color={s === 'success' ? 'green' : s === 'failed' ? 'red' : 'blue'}>{s}</Tag> },
            { title: '阶段', render: (_: any, r: any) => (r.stages || []).map((s: any) => <Tag key={s.key} color={stageColor(s.status)}>{s.name}</Tag>) },
            { title: '时间', dataIndex: 'startedAt', render: (t: string) => new Date(t).toLocaleString() },
            { title: '操作', width: 80, render: (_: any, r: any) => <Button size="small" onClick={() => setCur(r)}>详情</Button> },
          ]} />
        </Card>
      </Space>
    </div>
  );
}
