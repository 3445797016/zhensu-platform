// ═══════════════════════════════════════════════════════════════════════════
// PentAGI 集成 · AI 渗透页面（可迁移）
// ---------------------------------------------------------------------------
// 通过 ops-hub 后端 /api/pentagi/* 适配层与 PentAGI 引擎交互。
// 迁移：拷贝本目录到 web/src/pentagi/，并在 web/src/App.tsx 注册菜单与路由：
//   import PentagiPage from './pentagi/PentagiPage';
//   MENU: { key: '/pentagi', icon: <ThunderboltOutlined />, label: 'AI 渗透 (PentAGI)' }
//   ROUTE: <Route path="/pentagi" element={<PentagiPage />} />
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card, Table, Tag, Space, Button, Modal, Form, Input, InputNumber, Switch, Select, Alert,
  Descriptions, Typography, Popconfirm, message, Empty, Row, Col, Segmented, Tooltip, Badge,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, SettingOutlined, StopOutlined, DeleteOutlined,
  EyeOutlined, ThunderboltOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined,
  RocketOutlined, AimOutlined, DesktopOutlined, BugOutlined, ClockCircleOutlined, SearchOutlined,
} from '@ant-design/icons';
import { pentagiApi, PROVIDERS } from './api';
import { statusColor, statusText, isActive, extractTarget, formatDuration, relTime, fmtTime, parseHostFacts } from './lib';
import MissionDrawer from './MissionDrawer';
import './pentagi.css';

const { Text } = Typography;

const StatusDot = ({ s }: { s?: string }) => (
  <span>
    <span className={`pg-dot ${s || ''}`} />
    <span style={{ color: s === 'failed' ? '#ff4d4f' : s === 'finished' ? '#52c41a' : undefined }}>{statusText(s)}</span>
  </span>
);

export default function PentagiPage() {
  const [state, setState] = useState<any>(null);
  const [flows, setFlows] = useState<any[]>([]);
  const [targets, setTargets] = useState<{ hosts: any[]; docker: any[]; total?: number }>({ hosts: [], docker: [] });
  const [loading, setLoading] = useState(false);
  const [connErr, setConnErr] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // 配置弹窗
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgForm] = Form.useForm();
  const [testing, setTesting] = useState(false);

  // 新建任务弹窗
  const [newOpen, setNewOpen] = useState(false);
  const [newForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  // 详情抽屉
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const timer = useRef<any>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // 深链接初始标签页：挂载时固定一次（openDetail 会重写 URL，避免被清掉）
  const [deepTab] = useState<string | undefined>(() => new URLSearchParams(window.location.search).get('tab') || undefined);

  const loadState = useCallback(async () => {
    try { const r: any = await pentagiApi.state(); setState(r.state); return r.state; }
    catch (e: any) { setConnErr(String(e?.message || e)); return null; }
  }, []);

  const loadFlows = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await pentagiApi.flows();
      setFlows(r.flows || []);
      if (r.state) setState(r.state);
      setConnErr('');
      setLastRefresh(new Date());
    } catch (e: any) {
      setConnErr(String(e?.message || e));
    } finally { setLoading(false); }
  }, []);

  const loadTargets = useCallback(async () => {
    try { const r: any = await pentagiApi.targets(); setTargets({ hosts: r.hosts || [], docker: r.docker || [], total: r.total }); }
    catch { /* ignore */ }
  }, []);

  const loadDetail = useCallback(async (id: number | string) => {
    try { const r: any = await pentagiApi.detail(id); setDetail(r); }
    catch (e: any) { message.error(String(e?.message || e)); }
    finally { setDetailLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const s = await loadState();
      if (!s?.baseUrl) setCfgOpen(true);
      else loadFlows();
      loadTargets();
    })();
  }, [loadState, loadFlows, loadTargets]);

  // 轮询：有进行中的任务（或详情打开）时每 5 秒刷新
  useEffect(() => {
    const need = detailOpen || flows.some((f) => isActive(f.status));
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (need && state?.baseUrl) {
      timer.current = setInterval(() => {
        loadFlows();
        if (detailOpen && detailId != null) loadDetail(detailId);
      }, 5000);
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [detailOpen, detailId, flows, state?.baseUrl, loadFlows, loadDetail]);

  // ── 配置 ──────────────────────────────────────────────────────────────
  const openConfig = () => {
    cfgForm.setFieldsValue({
      enabled: state?.enabled ?? true,
      baseUrl: state?.baseUrl || '',
      token: '',
      email: state?.email || '',
      password: '',
      provider: state?.provider || 'deepseek',
      insecure: state?.insecure ?? true,
      timeout: state?.timeout || 120000,
    });
    setCfgOpen(true);
  };

  const doTest = async () => {
    setTesting(true);
    try {
      const v = await cfgForm.validateFields();
      const body: any = { ...v };
      if (!body.token) delete body.token;
      if (!body.password) delete body.password;
      const r: any = await pentagiApi.test(body);
      setState(r.state);
      message.success(`连接成功，当前共 ${r.total} 个任务`);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(`连接失败：${String(e?.message || e)}`);
    } finally { setTesting(false); }
  };

  const doSaveConfig = async () => {
    try {
      const v = await cfgForm.validateFields();
      const body: any = { ...v };
      if (!body.token) delete body.token;      // 留空=不改
      if (!body.password) delete body.password;
      const r: any = await pentagiApi.saveConfig(body);
      setState(r.state);
      setCfgOpen(false);
      message.success('配置已保存');
      loadFlows();
      loadTargets();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(String(e?.message || e));
    }
  };

  // ── 任务操作 ───────────────────────────────────────────────────────────
  const openNew = () => {
    newForm.setFieldsValue({ provider: state?.provider || 'deepseek', target: '', requirement: '', input: '' });
    setNewOpen(true);
  };

  const doCreate = async () => {
    try {
      const v = await newForm.validateFields();
      if (!v.input && !v.target) { message.warning('请填写目标地址，或直接填写完整任务内容'); return; }
      setCreating(true);
      const r: any = await pentagiApi.create({
        provider: v.provider, target: v.target, requirement: v.requirement, input: v.input,
      });
      message.success(`任务已创建：${r.flow?.title || ('#' + r.flow?.id)}`);
      setNewOpen(false);
      await loadFlows();
      if (r.flow?.id != null) openDetail(r.flow.id);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(String(e?.message || e));
    } finally { setCreating(false); }
  };

  const openDetail = (id: number | string) => {
    setDetailId(id); setDetail(null); setDetailOpen(true); setDetailLoading(true);
    setSearchParams({ flow: String(id) }, { replace: true });
    loadDetail(id);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSearchParams({}, { replace: true });
  };

  // 深链接：/pentagi?flow=<id> 直接打开任务控制台（便于分享/刷新保持）
  useEffect(() => {
    const fid = searchParams.get('flow');
    if (fid) openDetail(fid);
    // 仅在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doStop = async (id: number | string) => {
    try { await pentagiApi.stop(id); message.success('已发送停止指令'); loadFlows(); if (detailOpen) loadDetail(id); }
    catch (e: any) { message.error(String(e?.message || e)); }
  };
  const doDelete = async (id: number | string) => {
    try { await pentagiApi.remove(id); message.success('已删除'); if (detailId === id) closeDetail(); loadFlows(); }
    catch (e: any) { message.error(String(e?.message || e)); }
  };
  const doSendInput = async (id: number | string, text: string) => {
    try { await pentagiApi.input(id, text); message.success('已提交追加指令'); loadDetail(id); }
    catch (e: any) { message.error(String(e?.message || e)); }
  };

  // ── 统计 & 过滤 ─────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: flows.length,
    running: flows.filter((f) => f.status === 'running').length,
    finished: flows.filter((f) => f.status === 'finished').length,
    failed: flows.filter((f) => f.status === 'failed').length,
  }), [flows]);

  const shown = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return flows.filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (!kw) return true;
      const t = `${f.title || ''} ${extractTarget(f.title)} ${f.id}`.toLowerCase();
      return t.includes(kw);
    });
  }, [flows, keyword, statusFilter]);

  const columns = [
    { title: '状态', dataIndex: 'status', width: 100, render: (s: string) => <StatusDot s={s} /> },
    {
      title: '任务', dataIndex: 'title', ellipsis: true,
      render: (t: string, r: any) => {
        const target = extractTarget(r.title);
        const facts = parseHostFacts(r.input);
        const tgt = target || facts.target;
        return (
          <div>
            <Text strong>{t || `任务 #${r.id}`}</Text>
            {tgt && <Tag color="blue" style={{ marginLeft: 8 }}><AimOutlined /> {tgt}</Tag>}
          </div>
        );
      },
    },
    {
      title: '模型', dataIndex: 'model_provider_name', width: 190, ellipsis: true,
      render: (p: string, r: any) => (
        <Space size={4} wrap>
          {p && <Tag color="geekblue" style={{ marginRight: 0 }}>{p}</Tag>}
          {r.model && <Text type="secondary" style={{ fontSize: 12 }} className="pg-mono">{r.model}</Text>}
        </Space>
      ),
    },
    { title: '耗时', width: 110, render: (_: any, r: any) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDuration(r.created_at, isActive(r.status) ? undefined : r.updated_at)}</Text> },
    { title: '创建时间', dataIndex: 'created_at', width: 110, render: (t: string) => <Tooltip title={fmtTime(t)}><Text type="secondary" style={{ fontSize: 12 }}>{relTime(t)}</Text></Tooltip> },
    {
      title: '操作', width: 200, render: (_: any, r: any) => (
        <Space size={2} onClick={(e) => e.stopPropagation()}>
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>详情</Button>
          {isActive(r.status) && (
            <Popconfirm title="停止该任务？" onConfirm={() => doStop(r.id)}>
              <Button size="small" type="link" icon={<StopOutlined />}>停止</Button>
            </Popconfirm>
          )}
          <Popconfirm title="删除该任务？（不影响 PentAGI 服务）" onConfirm={() => doDelete(r.id)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={14}>
      {/* ── Hero 横幅 ── */}
      <div className="pg-hero">
        <div className="pg-hero-inner">
          <Row align="middle" gutter={16}>
            <Col flex="auto">
              <Space align="center" size={14}>
                <div className="pg-hero-icon"><ThunderboltOutlined /></div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: .3 }}>AI 自主渗透引擎 · PentAGI</div>
                  <div style={{ opacity: .82, fontSize: 13, marginTop: 2 }}>自动规划 · 工具调用 · 漏洞验证 · 报告生成</div>
                </div>
              </Space>
            </Col>
            <Col>
              <Space wrap>
                <Button className="pg-hero-btn" icon={<SettingOutlined />} onClick={openConfig}>连接配置</Button>
                <Button className="pg-hero-btn" icon={<ReloadOutlined />} onClick={loadFlows} loading={loading}>刷新</Button>
                <Button className="pg-hero-btn pg-hero-btn-primary" icon={<PlusOutlined />} onClick={openNew} disabled={!state?.baseUrl}>新建任务</Button>
              </Space>
            </Col>
          </Row>
          <Space size={8} wrap style={{ marginTop: 14 }}>
            {state?.baseUrl
              ? <span className="pg-hero-chip"><CheckCircleOutlined /> {state.baseUrl}</span>
              : <span className="pg-hero-chip"><CloseCircleOutlined /> 未配置连接</span>}
            {state?.auth && <span className="pg-hero-chip">认证：{state.auth === 'token' ? 'API Token' : state.auth === 'account' ? '账号' : '无'}</span>}
            {state?.provider && <span className="pg-hero-chip">默认模型：{state.provider}</span>}
            {lastRefresh && <span className="pg-hero-chip"><ClockCircleOutlined /> 更新于 {lastRefresh.toLocaleTimeString('zh-CN', { hour12: false })}</span>}
          </Space>
        </div>
      </div>

      {connErr && (
        <Alert type="error" showIcon message={`PentAGI 连接异常：${connErr}`}
          action={<Button size="small" onClick={openConfig}>去配置</Button>} />
      )}

      {/* ── 统计卡 ── */}
      <Row gutter={12}>
        <Col xs={12} md={6}><Stat icon={<RocketOutlined />} color="#2447b8" label="任务总数" value={stats.total} /></Col>
        <Col xs={12} md={6}><Stat icon={<SyncOutlined spin={stats.running > 0} />} color="#1677ff" label="运行中" value={stats.running} /></Col>
        <Col xs={12} md={6}><Stat icon={<CheckCircleOutlined />} color="#52c41a" label="已完成" value={stats.finished} /></Col>
        <Col xs={12} md={6}><Stat icon={<DesktopOutlined />} color="#7c3aed" label="可用靶机来源" value={targets.total ?? (targets.hosts.length + targets.docker.length)} /></Col>
      </Row>

      {/* ── 任务列表 ── */}
      <Card
        size="small"
        title={<Space><BugOutlined style={{ color: '#722ed1' }} /><span>渗透任务</span><Badge count={shown.length} color="#722ed1" showZero /></Space>}
        extra={
          <Space wrap>
            <Segmented
              size="small"
              value={statusFilter}
              onChange={(v) => setStatusFilter(String(v))}
              options={[
                { label: '全部', value: 'all' },
                { label: `运行中 ${stats.running}`, value: 'running' },
                { label: `等待 ${flows.filter((f) => f.status === 'waiting').length}`, value: 'waiting' },
                { label: `已完成 ${stats.finished}`, value: 'finished' },
                { label: `失败 ${stats.failed}`, value: 'failed' },
              ]}
            />
            <Input allowClear size="small" prefix={<SearchOutlined />} placeholder="搜索标题 / 目标 / ID"
              value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 200 }} />
          </Space>
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={shown}
          columns={columns as any}
          rowClassName={() => 'pg-flow-row'}
          onRow={(r) => ({ onClick: () => openDetail(r.id) })}
          pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description={state?.baseUrl ? (keyword || statusFilter !== 'all' ? '没有匹配的任务' : '暂无任务，点右上角「新建任务」') : '请先配置 PentAGI 连接'} /> }}
        />
      </Card>

      {/* ── 配置弹窗 ── */}
      <Modal title="PentAGI 连接配置" open={cfgOpen} onCancel={() => setCfgOpen(false)} onOk={doSaveConfig}
        okText="保存" cancelText="取消" width={620}
        footer={[
          <Button key="test" onClick={doTest} loading={testing}>测试连接</Button>,
          <Button key="cancel" onClick={() => setCfgOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" onClick={doSaveConfig}>保存</Button>,
        ]}>
        <Alert style={{ marginBottom: 12 }} type="info" showIcon
          message="认证方式二选一"
          description="推荐在 PentAGI → Settings → PentAGI API 生成 API Token 填入下方；若留空则使用账号密码登录。" />
        <Form form={cfgForm} layout="vertical">
          <Form.Item name="enabled" label="启用集成" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="baseUrl" label="PentAGI 地址" rules={[{ required: true, message: '请填写地址' }]}>
            <Input placeholder="https://192.168.147.129:8443" />
          </Form.Item>
          <Form.Item name="token" label="API Token（推荐，留空则不修改）">
            <Input.Password placeholder={state?.hasToken ? '已配置（留空保持不变）' : '粘贴 PentAGI API Token'} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="email" label="账号邮箱（备用）"><Input placeholder="admin@pentagi.com" /></Form.Item></Col>
            <Col span={12}><Form.Item name="password" label="账号口令（备用，留空不修改）"><Input.Password placeholder={state?.hasPassword ? '已配置' : ''} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="provider" label="默认 Provider">
                <Select options={PROVIDERS.map((p) => ({ value: p, label: p }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="timeout" label="超时(毫秒)"><InputNumber min={5000} step={1000} style={{ width: '100%' }} /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="insecure" label="接受自签名证书" valuePropName="checked"><Switch /></Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ── 新建任务弹窗 ── */}
      <Modal title="新建 AI 渗透任务" open={newOpen} onCancel={() => setNewOpen(false)} onOk={doCreate}
        okText="创建并开始" cancelText="取消" confirmLoading={creating} width={700}>
        <Form form={newForm} layout="vertical">
          <Form.Item name="provider" label="LLM Provider">
            <Select options={PROVIDERS.map((p) => ({ value: p, label: p }))} />
          </Form.Item>
          <Form.Item label="从靶机库选择（可选，自动填充目标）">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="选择后自动填入目标地址"
              options={[
                ...targets.hosts.map((h) => ({ value: h.address || h.name, label: `[主机] ${h.name}${h.address ? ' · ' + h.address : ''}` })),
                ...targets.docker.map((d) => ({ value: d.name, label: `[${d.kind}] ${d.name} · ${d.image}` })),
              ]}
              onChange={(v) => { if (v) newForm.setFieldValue('target', String(v)); }}
            />
          </Form.Item>
          <Form.Item name="target" label="目标地址（IP / 域名 / URL）"
            tooltip="仅对自有或已授权目标执行；填写后系统会自动生成标准渗透提示词">
            <Input placeholder="例如 192.168.147.128 或 http://192.168.147.128/dvwa" />
          </Form.Item>
          <Form.Item name="requirement" label="补充要求（可选）">
            <Input.TextArea rows={2} placeholder="例如：重点测 SMB / 弱口令；只做信息收集；登录凭据 admin/password" />
          </Form.Item>
          <Form.Item name="input" label="完整任务内容（高级，可选；填写后将忽略上面的目标/要求）">
            <Input.TextArea rows={5} placeholder="留空即可，系统会依据目标自动生成英文渗透提示词（效果更稳）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 任务控制台抽屉 ── */}
      <MissionDrawer
        open={detailOpen}
        id={detailId}
        detail={detail}
        loading={detailLoading}
        onClose={closeDetail}
        onRefresh={() => detailId != null && loadDetail(detailId)}
        onStop={doStop}
        onDelete={doDelete}
        onSend={doSendInput}
        defaultTab={deepTab}
      />
    </Space>
  );
}

function Stat({ icon, color, label, value }: any) {
  return (
    <Card size="small" className="pg-stat" styles={{ body: { padding: '14px 16px' } }}>
      <Space align="center" size={12}>
        <div className="pg-stat-icon" style={{ background: `${color}16`, color }}>{icon}</div>
        <div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>{label}</div>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15 }}>{value}</div>
        </div>
      </Space>
    </Card>
  );
}
