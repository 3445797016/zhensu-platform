import { useEffect, useMemo, useState } from 'react';
import {
  Card, Table, Button, Tag, Space, Select, Modal, Input, message, Progress, Tooltip,
  Row, Col, Segmented, Empty, Typography, App, Badge,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, HistoryOutlined, CheckCircleOutlined, CloseCircleOutlined,
  SyncOutlined, ClockCircleOutlined, CloudServerOutlined, SearchOutlined, CopyOutlined,
  DownloadOutlined, CodeOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { api } from '../api';
import { StatCard } from '../components/ui';

const { Text } = Typography;

const STATUS_META: Record<string, { color: string; text: string }> = {
  running: { color: '#1677ff', text: '运行中' },
  ok: { color: '#52c41a', text: '成功' },
  fail: { color: '#ff4d4f', text: '失败' },
  error: { color: '#ff4d4f', text: '失败' },
  cancelled: { color: '#8c8c8c', text: '已取消' },
  pending: { color: '#faad14', text: '等待中' },
};
const meta = (s: string) => STATUS_META[s] || { color: '#8c8c8c', text: s || '-' };
const statusDot = (s: string) => <span className={`pg-dot ${s === 'ok' ? 'finished' : s === 'running' ? 'running' : s === 'fail' || s === 'error' ? 'failed' : s === 'pending' ? 'waiting' : 'created'}`} />;

const dur = (r: any) => {
  if (!r.started) return '-';
  const end = r.finished ? new Date(r.finished).getTime() : Date.now();
  const ms = end - new Date(r.started).getTime();
  if (!(ms > 0)) return '-';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
};
const rel = (t?: string) => {
  if (!t) return '-';
  const d = Date.now() - new Date(t).getTime();
  if (isNaN(d)) return '-';
  if (d < 60000) return '刚刚';
  const m = Math.floor(d / 60000); if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}小时前`;
  return new Date(t).toLocaleDateString('zh-CN');
};

export default function TaskCenter() {
  const { message: msg } = App.useApp();
  const [tasks, setTasks] = useState<any[]>([]);
  const [hosts, setHosts] = useState<any[]>([{ id: 'local', name: '本机(Linux)' }]);
  const [open, setOpen] = useState(false);
  const [script, setScript] = useState('');
  const [title, setTitle] = useState('');
  const [hostId, setHostId] = useState('local');
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('all');
  const [keyword, setKeyword] = useState('');

  const load = async () => {
    setLoading(true);
    try { const r = await api.get('/tasks'); setTasks(r.tasks || []); } catch { /* */ } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    api.get('/hosts').then((h) => h.length && setHosts(h));
    return () => clearInterval(t);
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      await api.post('/tasks', { type: 'script', title: title || 'Shell 任务', hostId, script });
      msg.success('任务已创建'); setOpen(false); setScript(''); setTitle(''); load();
    } catch (e: any) { msg.error(e.message); } finally { setCreating(false); }
  };

  const openDetail = async (id: string) => {
    try { setDetail(await api.get(`/tasks/${id}`)); } catch { /* */ }
  };

  const stats = useMemo(() => ({
    total: tasks.length,
    running: tasks.filter((t) => t.status === 'running' || t.status === 'pending').length,
    ok: tasks.filter((t) => t.status === 'ok').length,
    fail: tasks.filter((t) => t.status === 'fail' || t.status === 'error').length,
  }), [tasks]);

  const shown = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filter === 'running' && !(t.status === 'running' || t.status === 'pending')) return false;
      if (filter === 'ok' && t.status !== 'ok') return false;
      if (filter === 'fail' && !(t.status === 'fail' || t.status === 'error')) return false;
      if (!kw) return true;
      return `${t.title} ${t.host} ${t.type}`.toLowerCase().includes(kw);
    });
  }, [tasks, filter, keyword]);

  const cols = [
    { title: '状态', width: 96, dataIndex: 'status', render: (s: string) => <span>{statusDot(s)}<span style={{ color: meta(s).color }}>{meta(s).text}</span></span> },
    { title: '类型', width: 110, dataIndex: 'type', render: (t: string) => <Tag color="purple" style={{ marginRight: 0 }}>{t}</Tag> },
    { title: '标题', dataIndex: 'title', ellipsis: true, render: (t: string, r: any) => <a onClick={() => openDetail(r.id)}>{t}</a> },
    { title: '主机', width: 140, dataIndex: 'host', ellipsis: true, render: (h: string) => <Space size={4}><CloudServerOutlined style={{ color: '#8c8c8c' }} /><Text style={{ fontSize: 12.5 }}>{h}</Text></Space> },
    { title: '耗时', width: 90, render: (_: any, r: any) => <Text type="secondary" style={{ fontSize: 12 }}>{dur(r)}</Text> },
    { title: '创建', width: 100, dataIndex: 'created', render: (t: string) => <Tooltip title={t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : ''}><Text type="secondary" style={{ fontSize: 12 }}>{rel(t)}</Text></Tooltip> },
    { title: '结果', dataIndex: 'result', ellipsis: true, render: (t: string) => <Text type="secondary" style={{ fontSize: 12 }}>{t || '-'}</Text> },
    { title: '操作', width: 80, render: (_: any, r: any) => <Button size="small" type="link" onClick={() => openDetail(r.id)}>日志</Button> },
  ];

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      {/* KPI */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}><StatCard icon={<HistoryOutlined />} color="#2f6bff" title="任务总数" value={stats.total} /></Col>
        <Col xs={12} md={6}><StatCard icon={<SyncOutlined spin={stats.running > 0} />} color="#1677ff" title="运行中" value={stats.running} /></Col>
        <Col xs={12} md={6}><StatCard icon={<CheckCircleOutlined />} color="#16a34a" title="成功" value={stats.ok} /></Col>
        <Col xs={12} md={6}><StatCard icon={<CloseCircleOutlined />} color="#ef4444" title="失败" value={stats.fail} /></Col>
      </Row>

      <Card
        size="small"
        title={<Space><HistoryOutlined style={{ color: '#1677ff' }} /><b>任务中心</b><Badge status="processing" text={<Text type="secondary" style={{ fontSize: 12 }}>自动刷新 5s</Text>} /></Space>}
        extra={
          <Space wrap>
            <Segmented size="small" value={filter} onChange={(v) => setFilter(String(v))} options={[
              { label: '全部', value: 'all' }, { label: `运行中 ${stats.running}`, value: 'running' },
              { label: `成功 ${stats.ok}`, value: 'ok' }, { label: `失败 ${stats.fail}`, value: 'fail' },
            ]} />
            <Input allowClear size="small" prefix={<SearchOutlined />} placeholder="搜索标题/主机/类型" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 190 }} />
            <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新建 Shell 任务</Button>
          </Space>
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table rowKey="id" size="small" loading={loading} dataSource={shown} columns={cols as any}
          onRow={(r) => ({ style: { cursor: 'pointer' }, onClick: () => openDetail(r.id) })}
          pagination={{ pageSize: 12, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty style={{ padding: 30 }} description={filter !== 'all' || keyword ? '没有匹配的任务' : '暂无任务，点右上角「新建 Shell 任务」'} /> }} />
      </Card>

      {/* 新建任务 */}
      <Modal title={<Space><CodeOutlined />新建 Shell 任务 <Text type="secondary" style={{ fontSize: 12 }}>在所选主机后台执行</Text></Space>}
        open={open} onCancel={() => setOpen(false)} onOk={create} okText="创建并运行" confirmLoading={creating} width={680} destroyOnClose>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>任务标题</div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="任务标题（可空，默认 Shell 任务）" />
          </div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>执行主机</div>
            <Select style={{ width: '100%' }} value={hostId} onChange={setHostId} options={hosts.map((h) => ({ value: h.id, label: h.name }))} />
          </div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>脚本内容</div>
            <Input.TextArea value={script} onChange={(e) => setScript(e.target.value)} rows={11} spellCheck={false}
              placeholder={'#!/bin/bash\necho 开始\nsleep 3\necho 完成'}
              style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', fontSize: 12.5 }} />
          </div>
        </Space>
      </Modal>

      {/* 任务日志 */}
      <Modal title={<Space><ThunderboltOutlined />任务日志</Space>} open={!!detail} onCancel={() => setDetail(null)} footer={null} width={780}>
        <Space size={8} wrap style={{ marginBottom: 10 }}>
          <Tag color="purple">{detail?.title}</Tag>
          <Tag color={meta(detail?.status).color}>{meta(detail?.status).text}</Tag>
          {detail?.host && <Tag icon={<CloudServerOutlined />}>{detail.host}</Tag>}
          {detail?.started && <Tag icon={<ClockCircleOutlined />}>{dur(detail)}</Tag>}
        </Space>
        {detail?.status === 'running' && <Progress size="small" percent={60} status="active" showInfo={false} style={{ margin: '4px 0 10px' }} />}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
          <Button size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText((detail?.log || []).join('\n')).then(() => msg.success('已复制')).catch(() => msg.error('复制失败')); }}>复制</Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => {
            const b = new Blob([(detail?.log || []).join('\n')], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `task-${detail?.id || 'log'}.log`; a.click(); URL.revokeObjectURL(a.href);
          }}>下载</Button>
        </div>
        <pre style={{ maxHeight: '58vh', overflow: 'auto', background: '#0b1021', color: '#cdd6f4', padding: 14, borderRadius: 10, fontSize: 12.5, whiteSpace: 'pre-wrap', fontFamily: 'SFMono-Regular, Consolas, monospace' }}>
          {(detail?.log || []).join('\n') || '(暂无日志)'}
        </pre>
      </Modal>
    </Space>
  );
}

