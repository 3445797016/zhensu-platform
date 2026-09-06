import { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Input, Tag, Select, Breadcrumb, Modal, message, Drawer, Alert, Popconfirm, Tooltip, Upload } from 'antd';
import { FolderOutlined, FileTextOutlined, FileOutlined, ReloadOutlined, UploadOutlined, PlusOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, HomeOutlined } from '@ant-design/icons';
import { api } from '../api';

export default function FilesPage() {
  const [hosts, setHosts] = useState<any[]>([]);
  const [host, setHost] = useState('local');
  const [path, setPath] = useState('/');
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<any>(null);          // 编辑文件
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<any>(null);        // mkdir/rename/new
  const [modalVal, setModalVal] = useState('');

  const load = async (p?: string) => {
    setLoading(true);
    try { const r = await api.get('/files/ls', { host, path: p ?? path }); setPath(r.path); setEntries(r.entries || []); } catch (e: any) { message.error(e.message); }
    setLoading(false);
  };
  useEffect(() => { api.get('/hosts').then((h) => setHosts(h.length ? h : [{ id: 'local', name: '本机(Linux)' }])); }, []);
  useEffect(() => { if (host) load('/'); }, [host]);

  const go = (dir: string) => load(dir);
  const up = () => { const p = path === '/' ? '/' : path.replace(/\/[^/]+$/, '') || '/'; load(p); };
  const fmtSize = (n: number) => n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : n >= 1024 ? (n / 1024).toFixed(1) + 'KB' : n + 'B';

  const openFile = async (e: any) => {
    if (e.type !== 'f') return;
    const r = await api.get('/files/read', { host, path: path + '/' + e.name });
    setEdit(r); setContent(r.binary ? '' : r.content);
    if (r.binary) message.warning('二进制文件无法在线编辑,可下载处理');
  };
  const saveFile = async () => {
    setSaving(true);
    try { await api.post('/files/write', { host, path: edit.path, content }); message.success('已保存'); setEdit(null); load(); }
    catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  const upload = async (file: File) => {
    const data = await new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(',')[1] || ''); rd.readAsDataURL(file); });
    try { await api.post('/files/upload', { host, path: path + '/' + file.name, data }); message.success('上传完成'); load(); } catch (e: any) { message.error(e.message); }
  };
  const download = async (e: any) => {
    const r = await api.get('/files/download', { host, path: path + '/' + e.name });
    const a = document.createElement('a'); a.href = 'data:application/octet-stream;base64,' + r.data; a.download = e.name; a.click();
  };
  const doModal = async () => {
    const val = modalVal.trim(); if (!val) return;
    try {
      if (modal.kind === 'mkdir') await api.post('/files/mkdir', { host, path: path + '/' + val });
      if (modal.kind === 'new') await api.post('/files/write', { host, path: path + '/' + val, content: '' });
      if (modal.kind === 'rename') await api.post('/files/mv', { host, from: path + '/' + modal.old, to: path + '/' + val });
      message.success('完成'); setModal(null); load();
    } catch (e: any) { message.error(e.message); }
  };

  const cols = [
    { title: '名称', render: (_: any, r: any) => <a onClick={() => (r.type === 'd' ? go(path + '/' + r.name) : openFile(r))} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {r.type === 'd' ? <FolderOutlined style={{ color: '#faad14' }} /> : r.type === 'f' ? <FileTextOutlined style={{ color: '#4f8cff' }} /> : <FileOutlined />}{r.name}</a> },
    { title: '类型', width: 90, render: (_: any, r: any) => r.type === 'd' ? <Tag>目录</Tag> : r.type === 'f' ? <Tag color="blue">文件</Tag> : <Tag>链接</Tag> },
    { title: '大小', width: 110, dataIndex: 'size', render: (s: number, r: any) => (r.type === 'f' ? fmtSize(s) : '-') },
    { title: '权限', width: 90, dataIndex: 'perm' },
    { title: '修改时间', dataIndex: 'mtime', render: (t: string) => t ? new Date(t).toLocaleString() : '-' },
    { title: '操作', width: 220, render: (_: any, r: any) => (
      <Space size={4}>
        {r.type === 'f' && <><Tooltip title="编辑"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => openFile(r)} /></Tooltip>
          <Tooltip title="下载"><Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => download(r)} /></Tooltip></>}
        {r.type === 'd' && <Tooltip title="新建文件"><Button size="small" type="text" icon={<PlusOutlined />} onClick={() => setModal({ kind: 'new', dir: true })} /></Tooltip>}
        <Tooltip title="重命名"><Button size="small" type="text" onClick={() => { setModal({ kind: 'rename', old: r.name }); setModalVal(r.name); }}>改名</Button></Tooltip>
        <Popconfirm title={`删除 ${r.name}?`} onConfirm={async () => { try { await api.post('/files/rm', { host, path: path + '/' + r.name }); load(); } catch (e: any) { message.error(e.message); } }}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>) },
  ];

  return (
    <Card size="small" title={<Space><FolderOutlined style={{ color: '#faad14' }} /><b>文件管理器</b><Tag>本机与 SSH 主机通用</Tag></Space>}
      extra={<Space>
        <Select style={{ width: 190 }} value={host} onChange={setHost} options={hosts.map((h: any) => ({ value: h.id, label: h.name }))} />
        <Input style={{ width: 340 }} value={path} onChange={(e) => setPath(e.target.value)} onPressEnter={() => load(path)} suffix={<Button size="small" type="text" icon={<HomeOutlined />} onClick={() => load('/')}>根</Button>} />
        <Button size="small" onClick={up}>上级</Button>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => load()}>刷新</Button>
      </Space>}>
      <Space wrap style={{ marginBottom: 10 }}>
        <Breadcrumb items={path.split('/').filter(Boolean).map((s, i, a) => ({ title: s }))} />
        <Button size="small" icon={<PlusOutlined />} onClick={() => { setModal({ kind: 'mkdir' }); setModalVal(''); }}>新建目录</Button>
        <Upload showUploadList={false} beforeUpload={(file) => { upload(file as unknown as File); return false; }}>
          <Button size="small" icon={<UploadOutlined />}>上传文件</Button>
        </Upload>
      </Space>
      <Table rowKey="name" size="small" loading={loading} dataSource={entries} columns={cols as any} pagination={false} scroll={{ y: 'calc(100vh - 320px)' }} />

      <Modal title="新建 / 目录 / 重命名" open={!!modal} onCancel={() => setModal(null)} onOk={doModal} okText="确定" width={420}>
        <Input placeholder={modal?.kind === 'rename' ? '新名字' : modal?.kind === 'mkdir' ? '目录名' : '文件名'} value={modalVal} onChange={(e) => setModalVal(e.target.value)} onPressEnter={doModal} />
      </Modal>

      <Drawer title={`编辑: ${edit?.path || ''}`} open={!!edit} width={640} onClose={() => setEdit(null)} extra={<Button type="primary" loading={saving} onClick={saveFile} disabled={edit?.binary}>保存</Button>}>
        {edit?.truncated && <Alert type="warning" showIcon style={{ marginBottom: 8 }} message={`文件较大,仅显示前 ${edit.size} 字符前的内容(编辑会覆盖全文,请谨慎)`} />}
        <textarea value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false}
          style={{ width: '100%', height: 'calc(100vh - 240px)', fontFamily: 'SFMono-Regular, Consolas, monospace', fontSize: 12.5, border: '1px solid #eee', borderRadius: 6, padding: 10 }} />
      </Drawer>
    </Card>
  );
}
