import { useEffect, useState } from 'react';
import { Card, Table, Tag, Space, Button, Input, Modal, message, Select, Popconfirm, Progress, Tooltip } from 'antd';
import { DatabaseOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined, DownloadOutlined, UndoOutlined } from '@ant-design/icons';
import { api } from '../api';

export default function BackupCenter() {
  const [list, setList] = useState<any[]>([]);
  const [hosts, setHosts] = useState<any[]>([{ id: 'local', name: '本机(Linux)' }]);
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState('');
  const [name, setName] = useState('');
  const [hostId, setHostId] = useState('local');
  const [restore, setRestore] = useState<any>(null);
  const [to, setTo] = useState('');

  const load = () => api.get('/backup').then((r) => setList(r.list || []));
  useEffect(() => { load(); const t = setInterval(load, 5000); api.get('/hosts').then((h) => h.length && setHosts(h)); return () => clearInterval(t); }, []);

  const create = async () => {
    if (!src.trim()) return message.warning('填写要备份的路径');
    try { await api.post('/backup', { host: hostId, src, name }); message.success('备份任务已创建'); setOpen(false); setSrc(''); load(); } catch (e: any) { message.error(e.message); }
  };
  const doRestore = async () => { try { await api.post(`/backup/${restore.id}/restore`, { to }); message.success('还原任务已创建'); setRestore(null); setTo(''); load(); } catch (e: any) { message.error(e.message); } };
  const download = async (b: any) => { try { const r = await api.get(`/backup/${b.id}/download`); const a = document.createElement('a'); a.href = 'data:application/gzip;base64,' + r.data; a.download = r.name; a.click(); } catch (e: any) { message.error(e.message); } };

  const cols = [
    { title: '名称', dataIndex: 'name', render: (t: string, r: any) => <b>{t}</b> },
    { title: '来源路径', dataIndex: 'src', render: (t: string) => <code style={{ fontSize: 12 }}>{t}</code> },
    { title: '主机', width: 130, dataIndex: 'host' },
    { title: '大小', width: 100, dataIndex: 'size', render: (s: number) => (s ? (s / 1048576).toFixed(1) + 'MB' : '-') },
    { title: '状态', width: 100, dataIndex: 'status', render: (s: string) => s === 'ok' ? <Tag color="green">完成</Tag> : s === 'running' ? <Tag color="processing">备份中…</Tag> : s === 'fail' ? <Tag color="red">失败</Tag> : <Tag>{s}</Tag> },
    { title: '时间', dataIndex: 'created', render: (t: string) => new Date(t).toLocaleString() },
    { title: '操作', width: 190, render: (_: any, r: any) => (
      <Space size={4}>
        <Tooltip title="下载归档"><Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => download(r)} disabled={r.status !== 'ok'} /></Tooltip>
        <Tooltip title="还原到指定目录"><Button size="small" type="text" icon={<UndoOutlined />} onClick={() => setRestore(r)} disabled={r.status !== 'ok'} /></Tooltip>
        <Popconfirm title="删除该备份归档?" onConfirm={async () => { try { await api.del('/backup/' + r.id); load(); } catch (e: any) { message.error(e.message); } }}><Button size="small" danger type="text" icon={<DeleteOutlined />} /></Popconfirm>
      </Space>) },
  ];

  return (
    <Card size="small" title={<Space><DatabaseOutlined style={{ color: '#52c41a' }} /><b>备份中心</b><Tag>归档目录 /var/backups/zhensu</Tag><Tag color="blue">走任务中心执行</Tag></Space>}
      extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新建备份</Button></Space>}>
      <Table rowKey="id" size="small" dataSource={list} columns={cols as any} pagination={false} />
      {list.some((b) => b.status === 'running') && <Progress percent={100} status="active" showInfo={false} style={{ marginTop: 8 }} />}
      <Modal title="新建备份" open={open} onCancel={() => setOpen(false)} onOk={create} okText="开始备份" width={520}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space><span style={{ width: 70 }}>主机</span><Select style={{ width: 380 }} value={hostId} onChange={setHostId} options={hosts.map((h: any) => ({ value: h.id, label: h.name }))} /></Space>
          <Space><span style={{ width: 70 }}>名称</span><Input style={{ width: 380 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="备份名称(可空,默认取目录名)" /></Space>
          <Space><span style={{ width: 70 }}>路径</span><Input style={{ width: 380 }} value={src} onChange={(e) => setSrc(e.target.value)} placeholder="/etc /var/www /home/xxx 或单个文件" /></Space>
        </Space>
      </Modal>
      <Modal title={`还原 "${restore?.name || ''}"`} open={!!restore} onCancel={() => setRestore(null)} onOk={doRestore} okText="开始还原(会创建目录,同名文件覆盖)" width={480}>
        <Input addonBefore="还原到" value={to} onChange={(e) => setTo(e.target.value)} placeholder="/restore/xxx(自动创建)" />
      </Modal>
    </Card>
  );
}
