import { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Tag, Input, App, Tooltip, Popconfirm, Badge, Typography, Alert } from 'antd';
import { ReloadOutlined, SaveOutlined, ToolOutlined, CheckCircleFilled, ExclamationCircleFilled, SettingOutlined } from '@ant-design/icons';
import { api } from '../api';

const { Text } = Typography;

const kindColor: Record<string, string> = { language: 'blue', build: 'purple', framework: 'cyan', runtime: 'geekblue' };
const kindLabel: Record<string, string> = { language: '语言/编译器', build: '构建工具', framework: '框架', runtime: '运行时' };

// ================= 本地构建工具配置(Global Tool Configuration) =================
export default function BuildTools() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ id: string; path: string } | null>(null);
  const { message } = App.useApp();

  const load = async () => { setLoading(true); try { setList(await api.get('/build-tools')); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const probeOne = async (id: string) => {
    const r = await api.post(`/build-tools/${id}/probe`, {});
    message.info(`${r.name}: ${r.ok ? r.version : '未检测到'}`);
    load();
  };
  const savePath = async (id: string, path: string) => {
    await api.put(`/build-tools/${id}`, { path });
    message.success('已保存,构建步骤将自动注入该路径');
    setEditing(null); load();
  };

  const cols = [
    { title: '工具', dataIndex: 'name', render: (v: string, r: any) => <Space><ToolOutlined style={{ color: '#4f8cff' }} /><b>{v}</b><Tag color={kindColor[r.kind]}>{kindLabel[r.kind]}</Tag></Space> },
    { title: '状态', render: (_: any, r: any) => r.detected ? <Badge status="success" text={<Text style={{ color: '#389e0d' }}>已检测到</Text>} /> : <Badge status="default" text={<Text type="secondary">未安装</Text>} /> },
    { title: '版本/路径', dataIndex: 'version', render: (v: string, r: any) => <div><div>{v || '-'}</div>{r.path && <Text code style={{ fontSize: 11 }}>{r.path}</Text>}</div> },
    { title: '环境变量', dataIndex: 'envVar', render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    {
      title: '操作', width: 300, render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => probeOne(r.id)}>检测</Button>
          <Button size="small" icon={<SettingOutlined />} onClick={() => setEditing({ id: r.id, path: r.path || '' })}>配置路径</Button>
          <Tooltip title={r.install}><Button size="small" type="link">安装指引</Button></Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Card size="small">
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={load}>重新检测全部</Button>
        <Text type="secondary">本地编译器/构建器配置(等价 Jenkins Global Tool Configuration),构建步骤会自动注入已配置工具到 PATH 与 HOME 环境变量</Text>
      </Space>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="未安装的工具可点击「安装指引」查看安装命令;手动指定路径后,构建时会自动注入如 JAVA_HOME、MAVEN_HOME、GOROOT 等环境变量。" />
      <Table rowKey="id" dataSource={list} columns={cols} size="middle" loading={loading} pagination={false} />

      <Card size="small" title={editing ? `配置工具路径 · ${list.find((t) => t.id === editing.id)?.name || ''}` : ''} style={{ display: editing ? 'block' : 'none', marginTop: 12 }}>
        <Space>
          <Input style={{ width: 420 }} placeholder="/usr/lib/jvm/java-17-openjdk-amd64 或 /opt/maven" value={editing?.path || ''} onChange={(e) => setEditing((s) => (s ? { ...s, path: e.target.value } : s))} />
          <Button type="primary" icon={<SaveOutlined />} onClick={() => editing && savePath(editing.id, editing.path.trim())}>保存</Button>
          <Button onClick={() => setEditing(null)}>取消</Button>
        </Space>
      </Card>
    </Card>
  );
}
