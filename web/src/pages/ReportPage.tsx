import { useEffect, useState } from 'react';
import { Card, Space, Button, Tag, Table, Drawer, App, Input, TimePicker, Switch, Popconfirm, Typography, Alert, Divider } from 'antd';
import { FileTextOutlined, PlusOutlined, DeleteOutlined, SendOutlined, DownloadOutlined, ReloadOutlined, ScheduleOutlined, CopyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../api';
import Markdown from '../components/Markdown';

const { Text } = Typography;

export default function ReportPage() {
  const { message } = App.useApp();
  const [list, setList] = useState<any[]>([]);
  const [scheds, setScheds] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pushOnGen, setPushOnGen] = useState(false);

  const load = async () => { setList(await api.get('/report/list')); setScheds(await api.get('/report/schedules')); };
  useEffect(() => { load(); }, []);

  const gen = async (push: boolean) => {
    setBusy(true);
    try {
      const r = await api.post('/report/generate', { push });
      setCurrent(r.report); setViewId(r.report.id);
      message.success(r.report.pushed ? '报告已生成并推送到通知渠道' : '报告已生成');
      load();
    } catch (e: any) { message.error('生成失败: ' + (e?.message || e)); }
    setBusy(false);
  };

  const open = async (id: string) => {
    setViewId(id);
    const d = await api.get('/report/' + id);
    setCurrent(d);
  };

  const dl = () => {
    if (!current) return;
    const blob = new Blob([current.markdown], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${current.title.replace(/[:： ]/g, '-')}.md`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const saveScheds = async (next: any[]) => { await api.put('/report/schedules', { schedules: next }); setScheds(next); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card size="small" title={<Space><FileTextOutlined /><b>巡检报告</b><Tag color="green">监控/告警/Ansible/任务 一键汇总</Tag></Space>}
        extra={<Space>
          <Switch checked={pushOnGen} onChange={setPushOnGen} checkedChildren="推送" unCheckedChildren="仅生成" />
          <Button type="primary" icon={<FileTextOutlined />} loading={busy} onClick={() => gen(pushOnGen)}>生成报告{pushOnGen ? '并推送' : ''}</Button>
        </Space>}>
        <Alert type="info" showIcon message="汇总当前纳管主机健康、未恢复告警、Ansible 执行、最近任务与审计,生成 Markdown 报告。可推送至已配置的通知渠道(系统→通知),并支持每日定时自动生成。" />
      </Card>

      <div style={{ display: 'flex', gap: 12 }}>
        {/* 左:历史与定时 */}
        <Card size="small" style={{ flex: 1 }} title={<Space><FileTextOutlined />历史报告</Space>}
          extra={<Space><Button size="small" icon={<ReloadOutlined />} onClick={load} /></Space>}>
          <Table size="small" rowKey="id" dataSource={list} pagination={{ pageSize: 8, showSizeChanger: false }}
            columns={[
              { title: '时间', width: 170, dataIndex: 'generated', render: (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false }) },
              { title: '标题', dataIndex: 'title', ellipsis: true },
              { title: '类型', width: 90, dataIndex: 'kind', render: (v: string, r: any) => <Tag color={r.pushed ? 'purple' : 'default'}>{r.pushed ? '已推送' : (v || 'manual')}</Tag> },
              { title: '操作', width: 150, render: (_: any, r: any) => (<Space>
                <Button size="small" onClick={() => open(r.id)}>查看</Button>
                <Popconfirm title="推送到通知渠道?" onConfirm={async () => { await api.post('/report/generate', { push: true }); message.success('已推送(生成一份新报告)'); load(); }}><Button size="small" type="primary" ghost icon={<SendOutlined />} /></Popconfirm>
                <Popconfirm title="删除该报告?" onConfirm={async () => { await api.del('/report/' + r.id); load(); if (viewId === r.id) { setViewId(null); setCurrent(null); } }}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
              </Space>) },
            ]} />
        </Card>

        {/* 右:定时 */}
        <Card size="small" style={{ flex: 1 }} title={<Space><ScheduleOutlined />每日定时推送</Space>}>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {scheds.length === 0 && <Alert type="warning" showIcon message="尚未配置定时。添加后,每天到点自动生成并推送到通知渠道。" />}
            {scheds.map((s) => (
              <Space key={s.id} style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                <Space>
                  <TimePicker size="small" format="HH:mm" value={s.time ? dayjs(s.time, 'HH:mm') : undefined} onChange={(v) => saveScheds(scheds.map((x) => x.id === s.id ? { ...x, time: v ? v.format('HH:mm') : '' } : x))} />
                  <Text type="secondary" style={{ fontSize: 12 }}>每日 {s.time || '-'} 自动推送</Text>
                </Space>
                <Space>
                  <Switch size="small" checked={!!s.enabled} onChange={(v) => saveScheds(scheds.map((x) => x.id === s.id ? { ...x, enabled: v } : x))} />
                  <Button size="small" icon={<SendOutlined />} onClick={async () => { await api.post('/report/schedules/run', { id: s.id }); message.success('已立即执行并推送'); load(); }}>立即</Button>
                  <Popconfirm title="删除该定时?" onConfirm={() => saveScheds(scheds.filter((x) => x.id !== s.id))}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
                </Space>
              </Space>
            ))}
            <Button icon={<PlusOutlined />} onClick={async () => {
              const id = 's' + Date.now();
              const next = [...scheds, { id, time: '08:30', enabled: true }];
              await saveScheds(next);
            }}>添加定时</Button>
            {scheds.some((s) => s.lastRun) && <Divider style={{ margin: '4px 0' }} />}
            {scheds.filter((s) => s.lastRun).map((s) => <Text key={s.id} type="secondary" style={{ fontSize: 12 }}>最近执行: {s.lastRun ? new Date(s.lastRun).toLocaleString('zh-CN', { hour12: false }) : '-'}</Text>)}
          </Space>
        </Card>
      </div>

      <Drawer title={current?.title || '报告'} width={860} open={!!viewId} onClose={() => { setViewId(null); setCurrent(null); }}
        extra={current && <Space>
          <Button size="small" icon={<SendOutlined />} onClick={async () => { await api.post('/report/generate', { push: true }); message.success('已推送'); load(); }}>推送到通知</Button>
          <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={dl}>下载 .md</Button>
        </Space>}>
        {current && <div style={{ background: '#fff', padding: '8px 16px', borderRadius: 8, border: '1px solid #eee' }}><Markdown text={current.markdown} /></div>}
      </Drawer>
    </div>
  );
}
