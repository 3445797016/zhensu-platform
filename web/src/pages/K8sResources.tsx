import { useEffect, useState } from 'react';
import { Select, Button, Space, Table, Tag, Drawer, InputNumber, App, Statistic, Row, Col, Card, Tooltip, Alert, Spin, Modal, Popconfirm, Badge, Segmented } from 'antd';
import MonacoEditor from '@monaco-editor/react';
import { ReloadOutlined, SaveOutlined, DeleteOutlined, FileTextOutlined, CodeOutlined } from '@ant-design/icons';
import { api } from '../api';

const KINDS = ['pods', 'deployments', 'statefulsets', 'daemonsets', 'jobs', 'cronjobs', 'services', 'configmaps', 'secrets', 'persistentvolumeclaims', 'ingresses', 'nodes', 'namespaces'];

export default function ResourceExplorer() {
  const [ns, setNs] = useState<string>('default');
  const [nsList, setNsList] = useState<string[]>([]);
  const [kind, setKind] = useState<string>('deployments');
  const [ov, setOv] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [yamlDoc, setYamlDoc] = useState<any>(null);
  const [apply, setApply] = useState(false);
  const [yamlApply, setYamlApply] = useState('apiVersion: v1\nkind: Pod\nmetadata:\n  name: example\n  namespace: default\nspec:\n  containers:\n    - name: app\n      image: nginx:latest\n');
  const [podsLog, setPodsLog] = useState<any>(null);
  const { message } = App.useApp();

  useEffect(() => { (async () => { try { const o = await api.get('/k8s/overview'); setOv(o); setNsList((o.namespaces || []).map((n: any) => n.metadata?.name)); if (o.namespaces?.length && !o.namespaces.some((x: any) => x.metadata.name === 'default')) setNs(o.namespaces[0].metadata.name); } catch (e: any) { setErr(e.message); } })(); }, []);

  const load = async () => {
    setLoading(true); setErr('');
    try { const r = await api.get('/k8s/resources/' + kind, { ns }); r.ok ? setItems(r.items || []) : setErr(r.error || '拉取失败'); }
    catch (e: any) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { if (kind && ns) load(); }, [kind, ns]);

  const openYaml = async (name: string) => { const r = await api.get(`/k8s/resources/${kind}/${name}/yaml`, { ns }); if (r.ok) setYamlDoc({ kind, name, ns, content: r.content }); else message.error(r.content); };
  const saveYaml = async () => { const r = await api.post(`/k8s/resources/${yamlDoc.kind}/${yamlDoc.name}/yaml`, { content: yamlDoc.content }, { ns: yamlDoc.ns }); r.ok ? (message.success('已应用'), load()) : message.error('应用失败: ' + (r.output || '').slice(-400)); setYamlDoc(null); };
  const doAct = async (action: 'scale' | 'restart' | 'delete', name: string, replicas?: number) => {
    const r = action === 'scale'
      ? await api.post(`/k8s/resources/${kind}/${name}/scale?ns=${ns}`, { replicas })
      : await api.post(`/k8s/resources/${kind}/${name}/${action}?ns=${ns}`, {});
    if (r.ok) { message.success('成功'); load(); } else message.error('失败: ' + (r.output || '').slice(-300));
  };
  const showLogs = async (name: string, container?: string) => { const r = await api.get('/k8s/pods/' + name + '/logs', { ns, container, tail: 500 }); setPodsLog({ name, content: r.ok ? r.content : '无日志: ' + r.content }); };
  const showDescribe = async (name: string) => { const r = await api.get(`/k8s/resources/${kind}/${name}/describe`, { ns }); setPodsLog({ name: name + ' · describe', content: r.content || '无' }); };

  if (!ov) return <center style={{ marginTop: 80 }}><Spin size="large" /> {err}</center>;

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select value={ns} onChange={setNs} style={{ width: 180 }} options={nsList.map((n) => ({ value: n, label: n }))} placeholder="命名空间" />
        <Select value={kind} onChange={setKind} style={{ width: 200 }} options={KINDS.map((k) => ({ value: k, label: k }))} />
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
        <Button type="primary" icon={<FileTextOutlined />} onClick={() => setApply(true)}>应用 YAML</Button>
      </Space>
      {err && <Alert type="error" style={{ marginBottom: 12 }} showIcon message={err} />}
      <Table rowKey={(r: any) => r.metadata?.uid || r.metadata?.name} dataSource={items} size="middle" loading={loading} pagination={{ pageSize: 20 }} scroll={{ x: 900 }}
        columns={kCols(kind, openYaml, showLogs, showDescribe, doAct)} />

      <Drawer title={`编辑 ${yamlDoc?.kind}/${yamlDoc?.name}`} width={760} open={!!yamlDoc} onClose={() => setYamlDoc(null)}
        extra={<Button icon={<SaveOutlined />} type="primary" onClick={saveYaml}>应用更改</Button>}>
        <MonacoEditor height="78vh" language="yaml" theme="light" value={yamlDoc?.content} onChange={(v) => setYamlDoc((d: any) => ({ ...d, content: v || '' }))} options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true }} />
      </Drawer>

      <Modal title="应用 YAML" width={760} open={apply} onCancel={() => setApply(false)} footer={null} destroyOnClose>
        <MonacoEditor height="55vh" language="yaml" theme="light" value={yamlApply} onChange={(v) => setYamlApply(v || '')} options={{ minimap: { enabled: false }, fontSize: 13 }} />
        <div style={{ marginTop: 10, textAlign: 'right' }}>
          <Button type="primary" onClick={async () => { const r = await api.post('/k8s/apply', { content: yamlApply }); r.ok ? (message.success('应用成功'), setApply(false), load()) : message.error('失败: ' + (r.output || '').slice(-400)); }}>应用</Button>
        </div>
      </Modal>

      <Drawer title={podsLog?.name || '输出'} width={820} open={!!podsLog} onClose={() => setPodsLog(null)} footer={null}>
        <pre style={{ background: '#f6f8fa', color: '#1f2328', padding: 12, borderRadius: 8, maxHeight: '82vh', overflow: 'auto', fontSize: 12 }}>{podsLog?.content || ''}</pre>
      </Drawer>
    </div>
  );
}

function kCols(kind: string, openYaml: any, showLogs: any, showDescribe: any, doAct: any) {
  const base: any = [
    { title: '名称', dataIndex: 'metadata', render: (m: any) => <b>{m?.name}</b> },
    { title: '命名空间', dataIndex: 'metadata', render: (m: any) => m?.namespace || '-' },
  ];
  if (kind === 'pods') {
    base.push({ title: '状态', render: (_: any, r: any) => {
      const ph = r.status?.phase; const ready = (r.status?.containerStatuses || []).filter((c: any) => c.ready).length + '/' + (r.status?.containerStatuses || []).length;
      const color = ph === 'Running' ? 'green' : ph === 'Succeeded' ? 'blue' : ph === 'Failed' ? 'red' : 'orange';
      return <><Tag color={color}>{ph}</Tag><Tag>{ready}</Tag></>;
    } }, { title: '节点', render: (_: any, r: any) => r.spec?.nodeName }, { title: '重启', render: (_: any, r: any) => (r.status?.containerStatuses || []).reduce((a: any, c: any) => a + (c.restartCount || 0), 0) }, { title: 'IP', render: (_: any, r: any) => `${r.status?.podIP || '-'}` });
  }
  if (kind === 'deployments' || kind === 'statefulsets' || kind === 'daemonsets') {
    base.push({ title: '就绪', render: (_: any, r: any) => `${r.status?.readyReplicas || 0}/${r.spec?.replicas || 0}` }, { title: '镜像', render: (_: any, r: any) => { const c = r.spec?.template?.spec?.containers?.[0]; return c ? <Tooltip title={(r.spec.template.spec.containers || []).map((x: any) => x.image).join('\n')}><span>{c.image}</span></Tooltip> : '-'; } });
  }
  if (kind === 'services') base.push({ title: '类型', render: (_: any, r: any) => <Tag>{r.spec?.type}</Tag> }, { title: 'ClusterIP', render: (_: any, r: any) => r.spec?.clusterIP }, { title: '端口', render: (_: any, r: any) => (r.spec?.ports || []).map((p: any) => <Tag key={p.port}>{p.port}:{p.targetPort}/{p.protocol}</Tag>) });
  if (kind === 'configmaps') base.push({ title: '数据项', render: (_: any, r: any) => Object.keys(r.data || {}).length });
  if (kind === 'nodes') base.push({ title: '状态', render: (_: any, r: any) => (r.status?.conditions || []).find((c: any) => c.type === 'Ready')?.status === 'True' ? <Tag color="green">Ready</Tag> : <Tag color="red">NotReady</Tag> }, { title: 'K8s 版本', render: (_: any, r: any) => r.status?.nodeInfo?.kubeletVersion });
  if (kind === 'namespaces') base.push({ title: '状态', dataIndex: ['status', 'phase'], render: (v: string) => <Tag color={v === 'Active' ? 'green' : 'red'}>{v}</Tag> });
  base.push({ title: '创建时间', dataIndex: 'metadata', render: (m: any) => m?.creationTimestamp ? new Date(m.creationTimestamp).toLocaleString() : '-' });
  base.push({ title: '操作', fixed: 'right', width: 300, render: (_: any, r: any) => {
    const name = r.metadata?.name;
    const isWorkload = ['deployments', 'statefulsets', 'daemonsets'].includes(kind);
    const isPod = kind === 'pods';
    return (
      <Space size={2}>
        <Button size="small" icon={<CodeOutlined />} onClick={() => openYaml(name)}>编辑 YAML</Button>
        {isPod && <Button size="small" onClick={() => showLogs(name, r.spec?.containers?.[0]?.name)}>日志</Button>}
        <Button size="small" onClick={() => showDescribe(name)}>describe</Button>
        {isWorkload && <>
          <ScaleBtn defaultReplicas={r.spec?.replicas} onOk={(n: number) => doAct('scale', name, n)} />
          <Popconfirm title="滚动重启?" onConfirm={() => doAct('restart', name)}><Button size="small">重启</Button></Popconfirm>
        </>}
        <Popconfirm title={`删除 ${name} ?`} onConfirm={() => doAct('delete', name)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>
    );
  } });
  return base;
}

function ScaleBtn({ defaultReplicas, onOk }: any) {
  const [n, setN] = useState(defaultReplicas || 1);
  return <Popconfirm title={<InputNumber min={0} max={200} value={n} onChange={(v) => setN(v as number)} style={{ width: 80 }} />} onConfirm={() => onOk(n)}><Button size="small">伸缩</Button></Popconfirm>;
}
