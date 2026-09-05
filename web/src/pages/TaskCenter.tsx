import { useEffect, useState } from 'react';
import { Card, Table, Button, Tag, Space, Select, Modal, Input, message, Progress, Tooltip } from 'antd';
import { PlusOutlined, ReloadOutlined, HistoryOutlined } from '@ant-design/icons';
import { api } from '../api';

export default function TaskCenter() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [hosts, setHosts] = useState<any[]>([{ id: 'local', name: '本机(Linux)' }]);
  const [open, setOpen] = useState(false);
  const [script, setScript] = useState('');
  const [title, setTitle] = useState('');
  const [hostId, setHostId] = useState('local');
  const [detail, setDetail] = useState<any>(null);

  const load = () => api.get('/tasks').then((r) => setTasks(r.tasks || [])).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 4000); api.get('/hosts').then((h) => h.length && setHosts(h)); return () => clearInterval(t); }, []);

  const create = async () => {
    try { await api.post('/tasks', { type: 'script', title: title || 'Shell 任务', hostId, script }); message.success('任务已创建'); setOpen(false); setScript(''); setTitle(''); load(); }
    catch (e: any) { message.error(e.message); }
  };
  const statusColor: any = { running: 'processing', ok: 'success', fail: 'error', cancelled: 'default', pending: 'default' };

  const openDetail = async (id: string) => {
    try { const r = await api.get(`/tasks/${id}`); setDetail(r); } catch { /* */ }
  };

  const cols = [
    { title: '类型', width: 110, dataIndex: 'type', render: (t: string) => <Tag color="purple">{t}</Tag> },
    { title: '标题', dataIndex: 'title', render: (t: string, r: any) => <a onClick={() => openDetail(r.id)}>{t}</a> },
    { title: '主机', width: 130, dataIndex: 'host' },
    { title: '状态', width: 110, dataIndex: 'status', render: (s: string) => <Tag color={statusColor[s]}>{s}</Tag> },
    { title: '耗时/创建', width: 190, render: (_: any, r: any) => { const ms = r.finished && r.started ? new Date(r.finished).getTime() - new Date(r.started).getTime() : 0; return <span style={{ fontSize: 12 }}>{ms ? Math.round(ms / 1000) + 's' : '-'} · {new Date(r.created).toLocaleString()}</span>; } },
    { title: '结果', dataIndex: 'result', render: (t: string) => <span style={{ fontSize: 12, color: '#888' }}>{t || '-'}</span> },
  ];

  return (
    <Card size="small" title={<Space><HistoryOutlined style={{ color: '#1677ff' }} /><b>任务中心</b><Tag color="blue">自动刷新 4s</Tag></Space>}
      extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新建 Shell 任务</Button></Space>}>
      <Table rowKey="id" size="small" dataSource={tasks} columns={cols as any} pagination={{ pageSize: 15 }} />
      <Modal title="新建 Shell 任务(在所选主机后台执行)" open={open} onCancel={() => setOpen(false)} onOk={create} okText="创建并运行" width={640} destroyOnClose>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space><span style={{ width: 60 }}>标题</span><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="任务标题(可空)" style={{ width: 420 }} /></Space>
          <Space><span style={{ width: 60 }}>主机</span><Select style={{ width: 420 }} value={hostId} onChange={setHostId} options={hosts.map((h) => ({ value: h.id, label: h.name }))} /></Space>
          <div style={{ fontWeight: 600 }}>脚本内容</div>
          <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={10} spellCheck={false} placeholder={'#!/bin/bash\necho 开始\nsleep 3\necho 完成'} style={{ fontFamily: 'monospace', fontSize: 12.5, border: '1px solid #eee', borderRadius: 6, padding: 8 }} />
        </Space>
      </Modal>
      <Modal title="任务日志" open={!!detail} onCancel={() => setDetail(null)} footer={null} width={720}>
        <Tag color="purple">{detail?.title}</Tag> <Tag>{detail?.status}</Tag>
        {detail?.status === 'running' && <Progress size="small" percent={60} status="active" showInfo={false} style={{ margin: '8px 0' }} />}
        <pre style={{ maxHeight: '60vh', overflow: 'auto', background: '#0d1117', color: '#d4e0ea', padding: 12, borderRadius: 8, fontSize: 12.5, whiteSpace: 'pre-wrap' }}>
          {(detail?.log || []).join('\n') || '(暂无日志)'}
        </pre>
      </Modal>
    </Card>
  );
}
