import { useEffect, useState } from 'react';
import { Select, Button, Space, Tag, Card, Row, Col, Spin, App, Drawer, Descriptions, Empty, Alert, Statistic, Badge, Collapse, Modal, Input, Popconfirm, Popover, Tooltip, Divider } from 'antd';
import { ReloadOutlined, ScanOutlined, RocketOutlined, DeleteOutlined, SettingOutlined, FileTextOutlined, PauseCircleOutlined, PlayCircleOutlined, ExperimentOutlined } from '@ant-design/icons';
import { api } from '../api';

const CAT_LABEL: any = { observability: '可观测性', data: '数据存储', messaging: '消息队列', cache: '缓存', gateway: '网关', container: '容器管理', monitor: '监控', storage: '存储', devops: 'DevOps', security: '渗透测试' };
const CAT_COLOR: any = { observability: 'geekblue', data: 'green', messaging: 'purple', cache: 'volcano', gateway: 'cyan', container: 'blue', monitor: 'magenta', storage: 'orange', devops: 'gold', security: 'red' };

export default function Tools() {
  const [catalog, setCatalog] = useState<any>(null);
  const [hostId, setHostId] = useState('');
  const [hosts, setHosts] = useState<any[]>([]);
  const [scan, setScan] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [instances, setInstances] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mirror, setMirror] = useState('');
  const [instLogs, setInstLogs] = useState<any>(null);
  const { message } = App.useApp();

  const loadCat = async () => {
    setCatalog(await api.get('/tools'));
    setSettings(await api.get('/settings'));
    setMirror((await api.get('/settings')).dockerRegistryMirror || '');
  };
  const loadInst = async () => setInstances(await api.get('/tools/instances'));
  useEffect(() => { loadCat(); loadInst(); (async () => { const h = await api.get('/hosts'); setHosts([{ id: 'local', name: '本机(local)' }, ...h]); })(); }, []);

  const doScan = async () => {
    setScanning(true);
    try { const r = await api.get('/tools/probe/all', { hostId: hostId || undefined }); setScan(r); } catch (e: any) { message.error(e.message); }
    setScanning(false);
  };
  const showTool = async (id: string) => {
    setDetail({ id, loading: true });
    const r = await api.get('/tools/probe/' + id, { hostId: hostId || undefined });
    setDetail({ ...r, loading: false });
  };

  const deploy = async (tool: any) => {
    if (!hostId && tool.id !== 'local') { message.info('请先选择目标主机'); return; }
    const hid = hostId || 'local';
    message.loading({ content: `正在部署 ${tool.name} ...（可能需拉取镜像）`, key: 'dep' });
    try {
      const r = await api.post('/tools/' + tool.id + '/deploy', { hostId: hid });
      message.destroy('dep');
      r.ok ? (message.success(tool.name + ' 部署成功'), loadInst()) : message.error(tool.name + ' 部署失败: ' + r.error);
    } catch (e: any) { message.destroy('dep'); message.error(e.message); }
  };
  const undeploy = async (tool: any) => {
    const hid = hostId || 'local';
    const r = await api.post('/tools/' + tool.id + '/undeploy', { hostId: hid });
    r.ok ? (message.success('已卸载 ' + tool.name), loadInst()) : message.error('卸载失败: ' + (r.output || ''));
  };
  const instAction = async (inst: any, action: string) => {
    const r = await api.post('/tools/instance/' + inst.containerName + '/' + action, { hostId: inst.hostId });
    r.ok ? (message.success(action + ' 成功'), loadInst()) : message.error(action + ' 失败: ' + (r.output || r.error));
  };
  const instLog = async (inst: any) => {
    setInstLogs({ loading: true });
    const r = await api.get('/tools/instance/' + inst.containerName + '/logs', { hostId: inst.hostId, tail: 300 });
    setInstLogs({ ...r, name: inst.containerName, loading: false });
  };
  const saveSettings = async () => { await api.put('/settings', { ...settings, dockerRegistryMirror: mirror }); message.success('已保存镜像源'); setSettingsOpen(false); setSettings({ ...settings, dockerRegistryMirror: mirror }); };

  if (!catalog) return <center style={{ marginTop: 120 }}><Spin size="large" /></center>;

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select value={hostId} onChange={setHostId} style={{ width: 200 }} options={hosts.map((h) => ({ value: h.id, label: h.name }))} />
        <Button type="primary" icon={<ScanOutlined />} loading={scanning} onClick={doScan}>全量扫描 {hostId ? '' : '本机'}</Button>
        <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>镜像源设置</Button>
        <Button icon={<ReloadOutlined />} onClick={() => { loadCat(); loadInst(); }}>刷新</Button>
        <Alert type="info" showIcon style={{ paddingInline: 10 }}
          message={`共 ${catalog.tools.length} 个工具。标有「可一键部署」的工具可在目标主机用 Docker 拉起（需可访问镜像源，可到「镜像源设置」填国内加速源）。`} />
      </Space>

      {/* 已部署实例 */}
      {instances.length > 0 && (
        <Card size="small" title={<Space><ExperimentOutlined style={{ color: '#52c41a' }} /> 已部署实例（{instances.length}）</Space>} style={{ marginBottom: 16 }}>
          <Row gutter={[12, 12]}>
            {instances.map((ins: any) => (
              <Col xs={12} sm={8} md={6} key={ins.id}>
                <Card size="small" styles={{ body: { padding: 12 } }}>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <b>{ins.toolName}</b>
                      <Badge status={ins.running === false ? 'error' : ins.containerState === 'running' ? 'processing' : 'default'} text={ins.running === false ? '停止' : ins.containerState === 'running' ? '运行' : ins.containerState} />
                    </Space>
                    <span style={{ fontSize: 11, color: '#888' }}>{ins.containerName} @ {ins.hostName}</span>
                    <span style={{ fontSize: 11, color: '#555' }}>{ins.image}</span>
                    <Space size={2} wrap>
                      {ins.running ? <Button size="small" icon={<PauseCircleOutlined />} onClick={() => instAction(ins, 'stop')}>停</Button>
                        : <Button size="small" icon={<PlayCircleOutlined />} onClick={() => instAction(ins, 'start')}>启</Button>}
                      <Button size="small" icon={<ReloadOutlined />} onClick={() => instAction(ins, 'restart')}>重启</Button>
                      <Button size="small" icon={<FileTextOutlined />} onClick={() => instLog(ins)}>日志</Button>
                      <Popconfirm title="移除该容器?" onConfirm={() => instAction(ins, 'rm')}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
                    </Space>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {scan?.summary && <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={4}><Card size="small"><Statistic title="工具总数" value={scan.summary.total} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="已检测到" value={scan.summary.detected} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="运行中" value={scan.summary.running} valueStyle={{ color: '#4f8cff' }} /></Card></Col>
        <Col span={12}><Card size="small" title="按类别">{(Object.entries(scan.summary.byCategory || {}) as any).map(([c, v]: any) => <Tag key={c} color={CAT_COLOR[c]}>{CAT_LABEL[c]}: {v}</Tag>)}</Card></Col>
      </Row>}

      {Object.keys(catalog.categories).map((cat) => {
        const tools = catalog.categories[cat];
        const states = scan?.results?.filter((r: any) => catalog.tools.find((t: any) => t.id === r.id)?.category === cat) || [];
        const running = states.filter((s: any) => s.running).length;
        return (
          <Card key={cat} size="small" title={<Space><Tag color={CAT_COLOR[cat]}>{CAT_LABEL[cat]}</Tag><span style={{ fontSize: 12, color: '#888' }}>{tools.length} 个{scan ? ` · 运行 ${running}` : ''}</span></Space>} style={{ marginBottom: 16 }}>
            <Row gutter={[12, 12]}>
              {tools.map((t: any) => {
                const st = scan?.results?.find((r: any) => r.id === t.id);
                const def = catalog.tools.find((x: any) => x.id === t.id);
                const deployed = instances.find((i: any) => i.toolId === t.id && i.hostId === (hostId || 'local'));
                return (
                  <Col xs={12} sm={8} md={6} lg={4} key={t.id}>
                    <Card hoverable size="small" onClick={() => showTool(t.id)} styles={{ body: { padding: 12 } }}>
                      <Space direction="vertical" size={6} style={{ width: '100%' }}>
                        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                          <b style={{ fontSize: 13 }}>{t.name}</b>
                          {st ? statusIcon(st) : <Tag>未扫描</Tag>}
                        </Space>
                        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ fontSize: 12, color: '#888' }}>端口 {t.port ?? '-'}</span>
                          {def?.deployable && (
                            <Popover content={def.template?.image} trigger="hover">
                              {deployed
                                ? <Popconfirm title={`卸载 ${t.name} 容器?`} onConfirm={(e: any) => { e?.stopPropagation?.(); undeploy(def); }}><Button size="small" danger onClick={(e) => e.stopPropagation()} icon={<DeleteOutlined />}>卸载</Button></Popconfirm>
                                : <Button size="small" type="primary" ghost onClick={(e) => { e.stopPropagation(); deploy(def); }} icon={<RocketOutlined />}>一键部署</Button>}
                            </Popover>
                          )}
                        </Space>
                      </Space>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          </Card>
        );
      })}

      {/* 工具详情 */}
      <Drawer title={detail?.tool?.name || '工具详情'} width={620} open={!!detail} onClose={() => setDetail(null)}>
        {detail?.loading ? <Spin /> : detail && (
          <>
            {detail.running ? <Alert type="success" showIcon message="该工具正在运行" />
              : detail.detected ? <Alert type="warning" showIcon message="检测到部分组件，未完全确认运行中" />
                : <Alert type="info" showIcon message="未检测到运行。可「一键部署」或用下方安装指引" />}
            <Descriptions column={1} size="small" bordered style={{ marginTop: 12 }}>
              <Descriptions.Item label="类别"><Tag color={CAT_COLOR[detail.tool?.category]}>{CAT_LABEL[detail.tool?.category]}</Tag></Descriptions.Item>
              <Descriptions.Item label="默认端口">{detail.tool?.port ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="systemd">{detail.tool?.systemd?.join(', ') || '-'}</Descriptions.Item>
              <Descriptions.Item label="Docker 镜像">{detail.tool?.template?.image || '无模板'}</Descriptions.Item>
              <Descriptions.Item label="服务状态">{detail.service || '未发现'}</Descriptions.Item>
              <Descriptions.Item label="端口开放">{detail.portOpen ? '是' : '否'}</Descriptions.Item>
            </Descriptions>
            <Divider />
            <Space>
              {detail.tool?.deployable && <Button type="primary" icon={<RocketOutlined />} onClick={() => { deploy(detail.tool); setDetail(null); }}>一键部署</Button>}
            </Space>
            <Collapse style={{ marginTop: 12 }} items={[
              { key: '1', label: '安装指引（可复制到主机执行）', children: <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f8fa', padding: 12, borderRadius: 8 }}>{detail.installHint || detail.tool?.install}</pre> },
              { key: '2', label: '原始探测输出', children: <pre style={{ maxHeight: 300, overflow: 'auto', background: '#f6f8fa', padding: 12, borderRadius: 8, fontSize: 11 }}>{detail.raw}</pre> },
            ]} />
          </>
        )}
      </Drawer>

      {/* 实例日志 */}
      <Drawer title={`日志 · ${instLogs?.name || ''}`} width={820} open={!!instLogs} onClose={() => setInstLogs(null)} footer={null}>
        {instLogs?.loading ? <Spin /> : <pre style={{ background: '#f6f8fa', color: '#1f2328', padding: 12, borderRadius: 8, maxHeight: '82vh', overflow: 'auto', fontSize: 12 }}>{instLogs?.content || instLogs?.error || '（空）'}</pre>}
      </Drawer>

      {/* 设置 */}
      <Modal title="Docker 镜像源设置" open={settingsOpen} onCancel={() => setSettingsOpen(false)} onOk={saveSettings} okText="保存" width={480}>
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="若无法直连 Docker Hub，可填国内镜像加速源，如 https://docker.m.daocloud.io 或 https://docker.1ms.run（一键部署会以 源/镜像名 拉取）。" />
        <Input value={mirror} onChange={(e) => setMirror(e.target.value)} placeholder="https://docker.m.daocloud.io（留空则直连官方源）" />
      </Modal>
    </div>
  );
}

function statusIcon(st: any) {
  if (st.running) return <Badge status="processing" text={<span style={{ color: '#52c41a' }}>运行中</span>} />;
  if (st.detected) return <Badge status="warning" text="部分" />;
  return <Badge status="default" text="未装" />;
}
