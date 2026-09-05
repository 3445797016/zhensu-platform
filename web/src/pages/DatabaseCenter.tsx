import { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Select, Input, Modal, Form, message, Row, Col, Statistic, Tabs, Alert, Popconfirm, Descriptions, InputNumber, Divider, Empty,
} from 'antd';
import { DatabaseOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined, ApiOutlined, ConsoleSqlOutlined, SearchOutlined, ScanOutlined, ThunderboltOutlined, ExperimentOutlined } from '@ant-design/icons';
import { api } from '../api';

const KIND: any = { sql: '关系型', kv: '键值', doc: '文档', vector: '向量' };
const KIND_C: any = { sql: 'green', kv: 'volcano', doc: 'geekblue', vector: 'purple' };

export default function DatabaseCenter() {
  const [types, setTypes] = useState<any[]>([]);
  const [conns, setConns] = useState<any[]>([]);
  const [scan, setScan] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState<any>(null);
  const [form] = Form.useForm();

  const load = () => api.get('/db/conns').then(setConns).catch((e) => message.error(e.message));
  useEffect(() => { api.get('/db/types').then((r) => setTypes(r.types)); load(); }, []);

  const typeInfo = (id: string) => types.find((t) => t.id === id);

  const add = async (v: any) => {
    try {
      const t = await api.post('/db/test', v);
      if (!t.ok) return message.warning('连接测试未通过,仍保存? ' + (t.error || '')); // 仍可保存,由用户确认
      await api.post('/db/conns', v); message.success('已保存并测试通过'); setOpen(false); form.resetFields(); load();
    } catch (e: any) { message.error(e.message); }
  };

  const cols = [
    { title: '名称', dataIndex: 'name', render: (t: string, r: any) => <a onClick={() => setCur(r)}><DatabaseOutlined style={{ color: '#13c2c2', marginRight: 6 }} />{t}</a> },
    { title: '类型', width: 130, render: (_: any, r: any) => <Space size={4}><Tag color={KIND_C[typeInfo(r.type)?.kind]}>{typeInfo(r.type)?.label || r.type}</Tag><span style={{ fontSize: 11, color: '#999' }}>{KIND[typeInfo(r.type)?.kind]}</span></Space> },
    { title: '连接方式', width: 200, render: (_: any, r: any) => r.container ? <Tag color="blue">docker: {r.container}</Tag> : <code style={{ fontSize: 12 }}>{r.host || r.url || r.database || '-'}</code> },
    { title: '状态', width: 90, render: (_: any, r: any) => r.ok ? <Tag color="green">正常</Tag> : <Tooltip title={r.err}><Tag color="red">异常</Tag></Tooltip> },
    { title: '操作', width: 120, render: (_: any, r: any) => <Popconfirm title="删除连接?" onConfirm={async () => { try { await api.del('/db/conns/' + r.id); load(); } catch (e: any) { message.error(e.message); } }}><Button size="small" danger type="text" icon={<DeleteOutlined />} /></Popconfirm> },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }} title={<Space><DatabaseOutlined style={{ color: '#13c2c2' }} /><b>数据库中心</b>
        <Tag color="blue">{conns.filter((c) => c.ok).length}/{conns.length} 在线</Tag>
        <span style={{ fontSize: 12, color: '#888' }}>关系型 · NoSQL · 向量库(为 ML/DL 准备)</span></Space>}
        extra={<Space><Button icon={<SearchOutlined />} onClick={async () => { try { const r = await api.get('/db/scan-local'); setScan(r); } catch (e: any) { message.error(e.message); } }}>扫描本机数据库</Button><Button icon={<ReloadOutlined />} onClick={load}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>添加连接</Button></Space>}>
        <Alert type="info" showIcon style={{ marginBottom: 8 }} message="用法:先在「中间件/工具库」一键部署 MySQL/PostgreSQL/Redis/Mongo/ClickHouse/Qdrant/Chroma 等容器 → 这里添加连接(容器名留空会自动按镜像识别)→ 进入后浏览库表、执行查询/命令;向量库可建集合、写入向量、相似检索(接入后续 ML/DL 与 RAG)。" />
        <Table rowKey="id" size="small" dataSource={conns} columns={cols as any} pagination={false} />
      </Card>
      {scan && <ScanModal scan={scan} onClose={() => setScan(null)} onImported={() => { setScan(null); load(); }} />}
      {cur && <DbExplorer conn={cur} typeInfo={typeInfo} onClose={() => setCur(null)} />}

      <Modal title="添加数据库连接" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} width={560} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={add}>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select options={types.map((t) => ({ value: t.id, label: `${t.label} (${KIND[t.kind]})` }))} onChange={() => { }} /></Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder="如 本地MySQL" /></Form.Item>
          <Form.Item name="container" label="容器名(留空自动按镜像识别;无容器则填下方地址)">
            <Input placeholder="如 opshub-mysql-local, 或 redis…" /></Form.Item>
          <Row gutter={10}>
            <Col span={12}><Form.Item name="host" label="主机"><Input placeholder="127.0.0.1(容器方式可空)" /></Form.Item></Col>
            <Col span={12}><Form.Item name="port" label="端口"><InputNumber style={{ width: '100%' }} placeholder="默认引擎端口" /></Form.Item></Col>
          </Row>
          <Row gutter={10}>
            <Col span={12}><Form.Item name="user" label="用户名"><Input placeholder="root/postgres/default" /></Form.Item></Col>
            <Col span={12}><Form.Item name="password" label="密码"><Input.Password /></Form.Item></Col>
          </Row>
          <Form.Item name="database" label="库/路径/URL 说明">
            <Input placeholder={'SQL:默认库名或 SQLite 文件绝对路径; Qdrant/Chroma:填 url(http://127.0.0.1:6333 / :8000)'} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function ScanModal({ scan, onClose, onImported }: any) {
  const [busy, setBusy] = useState('');
  const importOne = async (f: any) => {
    setBusy(f.container + f.port + f.type);
    try { const r = await api.post('/db/scan-import', f); r.tested ? message.success(`已接入 ${r.conn.name}`) : message.info(`已保存(测试未通过:${r.err})可稍后补账号`); onImported(); }
    catch (e: any) { message.error(e.message); }
    setBusy('');
  };
  return (
    <Modal title={<Space><ScanOutlined style={{ color: '#13c2c2' }} /><b>扫描本机数据库</b><Tag>docker + 监听端口识别</Tag></Space>} open onCancel={onClose} footer={null} width={760}>
      <Alert type="info" showIcon style={{ marginBottom: 8 }} message="发现本机已运行的数据库(容器或监听端口),点「接入」即可加入管理;容器接入无需账号密码,端口接入需补账号。" />
      {scan.found?.length ? (
        <Table rowKey={(r: any, i: any) => String(i)} size="small" dataSource={scan.found} pagination={false}
          columns={[
            { title: '引擎', width: 130, render: (_: any, r: any) => <Space size={4}><DatabaseOutlined /><b>{r.label}</b></Space> },
            { title: '发现方式', width: 110, render: (_: any, r: any) => <Tag color={r.by === 'docker' ? 'blue' : 'cyan'}>{r.by}</Tag> },
            { title: '容器 / 镜像', render: (_: any, r: any) => r.container ? <span>{r.container} <Tag>{r.image}</Tag></span> : <span style={{ color: '#999' }}>—</span> },
            { title: '端口', width: 100, render: (_: any, r: any) => (r.port ? r.port : <span style={{ color: '#999' }}>容器内</span>) },
            { title: '操作', width: 90, render: (_: any, r: any) => <Button size="small" type="primary" loading={busy === r.container + r.port + r.type} onClick={() => importOne(r)}>接入</Button> },
          ] as any} />
      ) : <Empty description="未发现本机数据库(可先到中间件/工具库部署,或在跑起来后点右上角刷新)" />}
    </Modal>
  );
}

function Tooltip({ title, children }: any) { return <span title={title}>{children}</span>; }

function DbExplorer({ conn, typeInfo, onClose }: any) {
  const info = typeInfo(conn.type);
  const kind = info?.kind;
  const [browse, setBrowse] = useState<any>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [db, setDb] = useState(conn.database || '');
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<any>(null);
  const [metaBusy, setMetaBusy] = useState(false);

  const loadBrowse = async () => { setBusy(true); try { const r = await api.get(`/db/conns/${conn.id}/browse`); setBrowse(r); if (r.dbs?.length) setDb((x: string) => x || r.dbs[0]); } catch (e: any) { setErr(e.message); } setBusy(false); };
  useEffect(() => { loadBrowse(); }, [conn.id]);
  const loadMeta = async () => {
    setMetaBusy(true); setMeta(null);
    try { const r = await api.get(`/db/conns/${conn.id}/scan`); setMeta(r); } catch (e: any) { setErr(e.message); }
    setMetaBusy(false);
  };
  useEffect(() => { if (db && kind !== 'kv' && kind !== 'vector') api.get(`/db/conns/${conn.id}/tables`, { db }).then((r) => setTables(r.tables || [])).catch(() => {}); }, [db, conn.id]);

  const exec = async (payload: any) => {
    setBusy(true); setErr(''); setResult(null);
    try { const r = await api.post(`/db/conns/${conn.id}/exec`, payload); setResult(r); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const [sql, setSql] = useState('SELECT 1');
  const [cmd, setCmd] = useState('PING');
  const [mjs, setMjs] = useState('db.getCollectionNames()');
  const [vq, setVq] = useState<any>({ size: 8, vector: '[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8]', points: '', search: '', limit: 5, cid: '' });

  const renderResult = () => {
    if (!result) return null;
    if (result.error) return <Alert type="error" message={result.error} />;
    if (result.kind === 'sql') {
      const cols = result.columns || [];
      return <Table size="small" dataSource={result.rows.map((r: any[], i: number) => Object.fromEntries(cols.map((c: string, j: number) => [c, r[j]])))} columns={cols.map((c: string) => ({ title: c, dataIndex: c, ellipsis: true }))} pagination={{ pageSize: 20 }} scroll={{ x: 'max-content' }} />;
    }
    if (result.text !== undefined) return <pre style={{ background: '#0d1117', color: '#d4e0ea', padding: 12, borderRadius: 6, maxHeight: 400, overflow: 'auto', fontSize: 12.5 }}>{result.text || '(空)'}</pre>;
    return <pre style={{ background: '#0d1117', color: '#d4e0ea', padding: 12, borderRadius: 6, maxHeight: 400, overflow: 'auto', fontSize: 12.5 }}>{JSON.stringify(result.data, null, 2)}</pre>;
  };

  const vecPanels: any = [];
  if (kind === 'vector') {
    vecPanels.push({ key: 'vc', label: '集合管理', children: (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Row gutter={8}>
          <Col span={6}><Input placeholder="集合名" value={vq.collection} onChange={(e) => setVq({ ...vq, collection: e.target.value })} addonBefore="名" /></Col>
          <Col span={4}><InputNumber placeholder="维度" value={vq.size} onChange={(x) => setVq({ ...vq, size: x })} style={{ width: '100%' }} addonBefore="维" /></Col>
          <Col span={8}><Input placeholder="距离(默认 Cosine)" value={vq.distance} onChange={(e) => setVq({ ...vq, distance: e.target.value })} /></Col>
          <Col span={6}><Space><Button onClick={() => exec({ op: 'create', collection: vq.collection, size: vq.size, distance: vq.distance })}>创建</Button>
            <Button danger onClick={() => exec({ op: 'delete', collection: vq.collection })}>删除集合</Button></Space></Col>
        </Row>
        <div>已有集合(来自上方 browse): {JSON.stringify(browse?.collections || [])}</div>
      </Space>
    ) });
    vecPanels.push({ key: 'vu', label: '写入向量', children: (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Alert type="info" showIcon message="points 示例(JSON):[{id:1, vector:[0.1,0.2,…], payload:{text:'你好'}}](Qdrant); Chroma 需 collection_id 与 id/embeddings/documents 数组" />
        <Input.TextArea rows={5} value={vq.points} onChange={(e) => setVq({ ...vq, points: e.target.value })} placeholder='Qdrant: [{"id":1,"vector":[...],"payload":{"text":"..."}}]' />
        <Button type="primary" onClick={() => { try { exec({ op: 'upsert', collection: vq.collection, points: JSON.parse(vq.points) }); } catch { message.error('points JSON 解析失败'); } }}>写入</Button>
      </Space>
    ) });
    vecPanels.push({ key: 'vs', label: '相似检索(为 ML 准备)', children: (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Alert type="success" showIcon message="输入向量做余弦相似检索(可后续接入文本/图像 embedding 模型,构成语义检索 / RAG 召回)" />
        <Input.TextArea rows={3} value={vq.search} onChange={(e) => setVq({ ...vq, search: e.target.value })} placeholder='向量 JSON,如 [0.1,0.2,…] 或 Chroma 数组[[0.1,0.2,…]]' />
        <InputNumber placeholder="Top N" value={vq.limit} onChange={(x) => setVq({ ...vq, limit: x })} style={{ width: 140 }} addonBefore="返回" />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => { try { const arr = JSON.parse(vq.search); exec(Array.isArray(arr[0]) ? { op: 'query', collection: vq.collection, collection_id: vq.cid, embeddings: arr, limit: vq.limit } : { op: 'search', collection: vq.collection, vector: arr, limit: vq.limit }); } catch { message.error('向量 JSON 解析失败'); } }}>检索</Button>
      </Space>
    ) });
  }

  return (
    <Card size="small" title={<Space><DatabaseOutlined style={{ color: '#13c2c2' }} /><b>{conn.name}</b><Tag color="geekblue">{info?.label}</Tag><Tag>{KIND[kind]}</Tag><Button type="link" onClick={onClose}>返回连接列表</Button></Space>}>
      <Descriptions size="small" column={4} style={{ marginBottom: 10 }}>
        <Descriptions.Item label="容器">{conn.container || '-'}</Descriptions.Item>
        <Descriptions.Item label="地址">{conn.host || conn.url || '-'}</Descriptions.Item>
        <Descriptions.Item label="端口">{conn.port || '-'}</Descriptions.Item>
        <Descriptions.Item label="库/路径">{conn.database || '-'}</Descriptions.Item>
      </Descriptions>
      {browse?.info && <Alert type="info" style={{ marginBottom: 8 }} message={<Space wrap>{(browse.info || []).map((x: string) => <Tag key={x}>{x}</Tag>)}</Space>} />}
      {err && <Alert type="error" showIcon style={{ marginBottom: 8 }} message={err} closable onClose={() => setErr('')} />}

      {(kind === 'sql' || kind === 'kv' || kind === 'doc') && (
        <div style={{ marginBottom: 10 }}>
          <Button size="small" type="dashed" icon={<ScanOutlined />} loading={metaBusy} onClick={loadMeta}>扫描库数据(大小/表数/字符集)</Button>
        </div>
      )}
      {meta && (
        <Card size="small" style={{ marginBottom: 10 }} title="库元数据扫描结果" extra={<Button size="small" type="text" onClick={() => setMeta(null)}>收起</Button>}>
          {meta.note ? <Alert type="info" showIcon message={meta.note} /> : meta.rows?.length ? (
            <Table rowKey={(r: any, i: any) => String(i)} size="small" pagination={false}
              dataSource={meta.rows}
              columns={Object.keys(meta.rows[0]).map((k) => ({ title: k, dataIndex: k, render: (v: any, r: any) => (k === '库' && meta.kind === 'sql' ? <a onClick={() => { setDb(String(v)); }}><DatabaseOutlined style={{ marginRight: 4 }} />{v}</a> : <span>{v}</span>) })) as any}
              onRow={(r: any) => ({ style: { cursor: meta.kind === 'sql' ? 'pointer' : 'default' } })}
            />
          ) : <Empty description="未扫描到库数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </Card>
      )}

      {kind === 'sql' && (
        <Tabs items={[
          { key: 'gui', label: '🖱 可视化数据', children: <SqlGui conn={conn} /> },
          { key: 'db', label: `📚 数据库(${browse?.dbs?.length || 0})`, children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Select style={{ width: 280 }} value={db} onChange={setDb} options={(browse?.dbs || []).map((x: string) => ({ value: x, label: x }))} />
              <div>表:{(tables || []).map((t: string) => <Tag key={t} color="blue" style={{ margin: 2, cursor: 'pointer' }} onClick={() => { setSql(`SELECT * FROM ${/[\s]/.test(t) ? '"' + t + '"' : t} LIMIT 50`); }}>{t}</Tag>)}</div>
            </Space>
          ) },
          { key: 'q', label: '⌨ 查询控制台', children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input.TextArea rows={6} value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false} style={{ fontFamily: 'monospace' }} />
              <Space><Button type="primary" loading={busy} onClick={() => exec({ query: sql, db })}>执行(SELECT 建议加 LIMIT)</Button><Button onClick={() => setResult(null)}>清空</Button></Space>
              {renderResult()}
            </Space>
          ) },
        ]} />
      )}

      {kind === 'kv' && (
        <Tabs items={[
          { key: 'keys', label: '🗝 Keys 图形', children: <RedisGui conn={conn} /> },
          { key: 'i', label: 'ℹ 概览', children: <pre style={{ background: '#0d1117', color: '#d4e0ea', padding: 12, borderRadius: 6 }}>{JSON.stringify(browse, null, 2)}</pre> },
          { key: 'c', label: '⌨ Redis 命令', children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input value={cmd} onChange={(e) => setCmd(e.target.value)} addonBefore="命令" onPressEnter={() => exec({ query: cmd })} placeholder='如 INFO / GET k / KEYS * / SET k v' />
              <Space><Button type="primary" loading={busy} onClick={() => exec({ query: cmd })}>执行</Button></Space>
              {renderResult()}
            </Space>
          ) },
        ]} />
      )}

      {kind === 'doc' && (
        <Tabs items={[
          { key: 'docs', label: '🗂 集合文档', children: <MongoGui conn={conn} /> },
          { key: 'c', label: '⌨ MongoDB(JavaScript)', children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input value={mjs} onChange={(e) => setMjs(e.target.value)} addonBefore="脚本" onPressEnter={() => exec({ query: mjs })} />
              <Alert type="info" showIcon message={'示例: db.getSiblingDB("库").getCollectionNames() · 查询: db.getSiblingDB("x").c.find({},{_id:0}).limit(5).toArray() · 需选库时先输入 db=db.getSiblingDB("库")'} />
              <Button type="primary" loading={busy} onClick={() => exec({ query: mjs })}>执行</Button>
              {renderResult()}
            </Space>
          ) },
        ]} />
      )}

      {kind === 'vector' && <Tabs items={[
        { key: 'info', label: '集合', children: <div style={{ minHeight: 120 }}>{renderResult()}<pre style={{ maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(browse?.collections || browse, null, 2)}</pre></div> },
        ...vecPanels,
      ]} />}
    </Card>
  );
}

/* ================= 可视化图形操作面板 ================= */
function SqlGui({ conn }: any) {
  const [dbs, setDbs] = useState<string[]>([]);
  const [db, setDb] = useState(conn.database || '');
  const [tables, setTables] = useState<string[]>([]);
  const [table, setTable] = useState('');
  const [info, setInfo] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [rowOpen, setRowOpen] = useState(false);
  const [row, setRow] = useState<Record<string, any>>({});
  const [err, setErr] = useState('');

  useEffect(() => { api.get(`/db/conns/${conn.id}/browse`).then((r: any) => setDbs(r.dbs || [])).catch((e) => setErr(e.message)); }, [conn.id]);
  useEffect(() => { if (db) api.get(`/db/conns/${conn.id}/tables`, { db }).then((r: any) => { setTables(r.tables || []); setTable(''); setData(null); }).catch((e) => setErr(e.message)); }, [db, conn.id]);

  const pick = async (t: string) => {
    setTable(t); setBusy(true); setErr('');
    try {
      const [inf, dat] = await Promise.all([api.get(`/db/conns/${conn.id}/table/info`, { db, table: t }), api.get(`/db/conns/${conn.id}/table/data`, { db, table: t, limit: 100 })]);
      setInfo(inf.columns || []); setData(dat);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const addRow = async () => {
    try { await api.post(`/db/conns/${conn.id}/table/insert`, { db, table, row }); message.success('已插入'); setRowOpen(false); setRow({}); pick(table); }
    catch (e: any) { message.error(e.message); }
  };
  const cols = (data?.columns || []).map((c: string) => ({ title: c, dataIndex: c, ellipsis: true, width: 160 }));

  return (
    <div>
      {err && <Alert type="error" showIcon style={{ marginBottom: 8 }} message={err} closable onClose={() => setErr('')} />}
      <Space wrap style={{ marginBottom: 8 }}>
        <Select style={{ width: 200 }} value={db} onChange={setDb} options={dbs.map((x) => ({ value: x, label: x }))} placeholder="选库" />
        <Select style={{ width: 220 }} value={table} onChange={pick} options={tables.map((x) => ({ value: x, label: x }))} placeholder="选表" />
        {table && <><Button type="primary" icon={<PlusOutlined />} onClick={() => { setRow({}); setRowOpen(true); }}>新增行</Button>
          <Tag>{info.length} 列</Tag></>}
      </Space>
      {table && (
        <>
          <Alert type="info" showIcon style={{ marginBottom: 6 }} message={<span>结构: {info.map((c: any) => `${c.name} <${c.type}>`).join(' · ')}</span>} />
          <Table rowKey={(_, i) => String(i)} size="small" loading={busy} dataSource={data?.rows?.map((r: any[], i: number) => Object.fromEntries((data.columns || []).map((c: string, j: number) => [c, r[j]])))} columns={cols as any} pagination={{ pageSize: 20 }} scroll={{ x: 'max-content' }} />
        </>
      )}
      <Modal title={`新增行 → ${db}.${table}`} open={rowOpen} onCancel={() => setRowOpen(false)} onOk={addRow} okText="插入" width={560}>
        <Row gutter={8}>
          {info.map((c: any) => (
            <Col span={12} key={c.name}>
              <Input style={{ marginBottom: 6 }} addonBefore={<span style={{ fontSize: 11 }}>{c.name} <Tag style={{ marginInlineEnd: 0, fontSize: 10 }}>{c.type}</Tag></span>}
                value={row[c.name] ?? ''} onChange={(e) => setRow((p) => ({ ...p, [c.name]: e.target.value }))} placeholder={c.key === 'PRI' ? '主键' : ''} />
            </Col>
          ))}
        </Row>
      </Modal>
    </div>
  );
}

function RedisGui({ conn }: any) {
  const [pattern, setPattern] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [openSet, setOpenSet] = useState(false);
  const [nv, setNv] = useState({ key: '', value: '', ttl: '' });
  const [err, setErr] = useState('');
  const db = conn.database || '0';

  const scan = async (pt = pattern) => {
    setBusy(true); setErr('');
    try { const r = await api.get(`/db/conns/${conn.id}/redis/keys`, { db, pattern: pt }); setItems(r.items || []); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  useEffect(() => { scan(''); }, [conn.id]);
  const pick = (k: any) => { setSel(k); setNv((p) => ({ ...p, key: k.key })); };
  const saveKey = async () => {
    try { await api.post(`/db/conns/${conn.id}/redis/ops`, { action: 'set', db, key: nv.key, value: nv.value, ttl: nv.ttl || 0 }); message.success('已保存'); setOpenSet(false); scan(); }
    catch (e: any) { message.error(e.message); }
  };
  const delKey = async (k: string) => {
    try { await api.post(`/db/conns/${conn.id}/redis/ops`, { action: 'del', db, keys: [k] }); message.success('已删除'); setSel(null); scan(); }
    catch (e: any) { message.error(e.message); }
  };

  return (
    <div>
      {err && <Alert type="error" showIcon style={{ marginBottom: 8 }} message={err} closable onClose={() => setErr('')} />}
      <Space style={{ marginBottom: 8 }}>
        <Input placeholder="搜索 key(子串)" value={pattern} onChange={(e) => setPattern(e.target.value)} onPressEnter={() => scan()} style={{ width: 240 }} addonBefore="Pattern" />
        <Button type="primary" loading={busy} icon={<SearchOutlined />} onClick={() => scan()}>扫描</Button>
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => { setNv({ key: '', value: '', ttl: '' }); setOpenSet(true); }}>新建 Key</Button>
        <Tag>{items.length} keys</Tag>
      </Space>
      <Row gutter={12}>
        <Col span={10}>
          <div style={{ border: '1px solid #eee', borderRadius: 6, maxHeight: 380, overflow: 'auto' }}>
            {items.map((k) => (
              <div key={k.key} onClick={() => pick(k)} style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f2f2f2', background: sel?.key === k.key ? '#e6f4ff' : '#fff', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{k.key}</span>
                <Space size={4}><Tag color={k.type === 'string' ? 'green' : 'purple'} style={{ marginInlineEnd: 0 }}>{k.type}</Tag></Space>
              </div>
            ))}
            {!items.length && <div style={{ padding: 16, color: '#999', textAlign: 'center' }}>无 key</div>}
          </div>
        </Col>
        <Col span={14}>
          {sel ? (
            <Card size="small" title={<Space>{sel.key}<Tag color="blue">{sel.type}</Tag><Tag>TTL {sel.ttl}</Tag></Space>}
              extra={<Space><Button size="small" type="primary" onClick={() => { setNv({ key: sel.key, value: '', ttl: '' }); setOpenSet(true); }}>设值</Button>
                <Popconfirm title="删除该 key?" onConfirm={() => delKey(sel.key)}><Button size="small" danger>删除</Button></Popconfirm></Space>}>
              <pre style={{ maxHeight: 320, overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#0d1117', color: '#d4e0ea', padding: 10, borderRadius: 6, fontSize: 12 }}>{sel.preview || '(空)'}</pre>
            </Card>
          ) : <Alert type="info" showIcon message="点左侧 key 查看内容;新建/设值会覆盖原值(字符串类型)" />}
        </Col>
      </Row>
      <Modal title={`${nv.key ? '设值' : '新建'} key (字符串)`} open={openSet} onCancel={() => setOpenSet(false)} onOk={saveKey} okText="保存" width={520}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input addonBefore="Key" value={nv.key} onChange={(e) => setNv({ ...nv, key: e.target.value })} placeholder="my:key" />
          <Input.TextArea rows={5} value={nv.value} onChange={(e) => setNv({ ...nv, value: e.target.value })} placeholder="value(字符串)" />
          <Input addonBefore="TTL秒" value={nv.ttl} onChange={(e) => setNv({ ...nv, ttl: e.target.value })} placeholder="0=永久" />
        </Space>
      </Modal>
    </div>
  );
}

function MongoGui({ conn }: any) {
  const [dbs, setDbs] = useState<string[]>([]);
  const [db, setDb] = useState(conn.database || '');
  const [colls, setColls] = useState<string[]>([]);
  const [coll, setColl] = useState('');
  const [docs, setDocs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [openIns, setOpenIns] = useState(false);
  const [docJson, setDocJson] = useState('{\n  "name": "示例"\n}');
  const [err, setErr] = useState('');

  useEffect(() => { api.get(`/db/conns/${conn.id}/browse`).then((r: any) => setDbs(r.dbs || [])).catch((e) => setErr(e.message)); }, [conn.id]);
  useEffect(() => { if (db) api.get(`/db/conns/${conn.id}/tables`, { db }).then((r: any) => { setColls(r.tables || []); setColl(''); setDocs([]); }).catch((e) => setErr(e.message)); }, [db, conn.id]);
  const load = async (c: string) => {
    setColl(c); setBusy(true); setErr('');
    try { const r = await api.get(`/db/conns/${conn.id}/mongo/docs`, { db, collection: c, limit: 50 }); setDocs(r.docs || []); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const insert = async () => {
    try { await api.post(`/db/conns/${conn.id}/mongo/insert`, { db, collection: coll, doc: JSON.parse(docJson) }); message.success('已插入'); setOpenIns(false); load(coll); }
    catch (e: any) { message.error(e.message.includes('JSON') || e.message.includes('insert') ? '插入失败(JSON 解析或结构错误): ' + e.message : e.message); }
  };
  const del = async (id: string) => {
    try { await api.post(`/db/conns/${conn.id}/mongo/delete`, { db, collection: coll, id }); message.success('已删除'); load(coll); }
    catch (e: any) { message.error(e.message); }
  };
  const keys = [...new Set(docs.flatMap((d) => Object.keys(d)).slice(0, 12))];

  return (
    <div>
      {err && <Alert type="error" showIcon style={{ marginBottom: 8 }} message={err} closable onClose={() => setErr('')} />}
      <Space wrap style={{ marginBottom: 8 }}>
        <Select style={{ width: 180 }} value={db} onChange={setDb} options={dbs.map((x) => ({ value: x, label: x }))} />
        <Select style={{ width: 200 }} value={coll} onChange={load} options={colls.map((x) => ({ value: x, label: x }))} placeholder="选集合" />
        {coll && <Button type="primary" icon={<PlusOutlined />} onClick={() => { setDocJson('{\n  "name": "新文档"\n}'); setOpenIns(true); }}>新增文档</Button>}
      </Space>
      {coll && (
        <Table rowKey="_id" size="small" loading={busy} dataSource={docs} pagination={{ pageSize: 10 }}
          columns={[
            { title: '_id', dataIndex: '_id', width: 200, ellipsis: true },
            ...keys.filter((k) => k !== '_id').map((k) => ({ title: k, dataIndex: k, ellipsis: true, render: (v: any) => (typeof v === 'object' ? JSON.stringify(v) : String(v)) })),
            { title: '操作', width: 80, render: (_: any, r: any) => <Popconfirm title="删除该文档?" onConfirm={() => del(r._id)}><Button size="small" danger type="text">删除</Button></Popconfirm> },
          ] as any} scroll={{ x: 'max-content' }} />
      )}
      <Modal title={`新增文档 → ${db}.${coll}`} open={openIns} onCancel={() => setOpenIns(false)} onOk={insert} okText="插入" width={620}>
        <Alert type="info" showIcon style={{ marginBottom: 8 }} message={"_id 会自动生成;对象字段请用合法 JSON;不支持 $oid 语法,可省略 _id"} />
        <Input.TextArea rows={12} value={docJson} onChange={(e) => setDocJson(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} spellCheck={false} />
      </Modal>
    </div>
  );
}
