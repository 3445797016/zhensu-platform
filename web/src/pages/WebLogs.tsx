import { useEffect, useState } from 'react';
import { Card, Table, Tag, Space, Button, Input, Select, Row, Col, message, Alert } from 'antd';
import { FileSearchOutlined, ApiOutlined, CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import { api } from '../api';
import { StatCard } from '../components/ui';

export default function WebLogs() {
  const [hosts, setHosts] = useState<any[]>([{ id: 'local', name: '本机(Linux)' }]);
  const [host, setHost] = useState('local');
  const [path, setPath] = useState('/var/log/nginx/access.log');
  const [lines, setLines] = useState('50000');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/hosts').then((h) => h.length && setHosts(h)); }, []);
  const stat = async () => {
    setLoading(true); setData(null);
    try { setData(await api.get('/weblog/stat', { host, path, lines })); } catch (e: any) { message.error(e.message); setData({ error: e.message }); }
    setLoading(false);
  };
  const table = (title: string, rows: any[]) => (
    <Card size="small" title={title} style={{ marginBottom: 12 }}>
      <Table rowKey={(_, i) => String(i)} size="small" dataSource={(rows || []).map(([k, v]) => ({ k, v }))} pagination={{ pageSize: 8 }}
        columns={[{ title: 'Key', dataIndex: 'k', render: (k: string) => <code style={{ fontSize: 12 }}>{k}</code> }, { title: '次数', width: 120, dataIndex: 'v', render: (v: number) => <Tag color={v > 1000 ? 'volcano' : v > 100 ? 'orange' : 'default'}>{v}</Tag> }]} />
    </Card>);

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }} title={<Space><FileSearchOutlined style={{ color: '#1677ff' }} /><b>访问日志统计</b><Tag>tail 最近行聚合</Tag></Space>}
        extra={<Button type="primary" loading={loading} onClick={stat}>开始统计</Button>}>
        <Space wrap>
          <Select style={{ width: 190 }} value={host} onChange={setHost} options={hosts.map((h: any) => ({ value: h.id, label: h.name }))} />
          <Input style={{ width: 360 }} value={path} onChange={(e) => setPath(e.target.value)} placeholder="/var/log/nginx/access.log" addonBefore="日志" />
          <Input style={{ width: 130 }} value={lines} onChange={(e) => setLines(e.target.value)} addonBefore="行数" />
        </Space>
        <div style={{ marginTop: 8 }}><Alert type="info" showIcon message="支持 nginx/apache combined 格式。不知道日志路径?用「文件管理」到 /var/log 找 access.log,或到 nginx 配置看 access_log 指令。" /></div>
      </Card>
      {data?.error && <Alert type="error" message={data.error} />}
      {data && !data.error && (<>
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col xs={12} sm={8} md={4}><StatCard title="总请求" value={data.total} icon={<ApiOutlined />} color="#2f6bff" /></Col>
          <Col xs={12} sm={8} md={4}><StatCard title="成功 (<400)" value={data.ok} icon={<CheckCircleOutlined />} color="#16a34a" /></Col>
          <Col xs={12} sm={8} md={4}><StatCard title="4xx" value={data.err4} icon={<WarningOutlined />} color="#f59e0b" /></Col>
          <Col xs={12} sm={8} md={4}><StatCard title="5xx" value={data.err5} icon={<CloseCircleOutlined />} color="#ef4444" /></Col>
          <Col xs={24} sm={16} md={8}><StatCard title="日志文件" value={<span style={{ fontSize: 14 }}>{data.file}</span>} icon={<FileTextOutlined />} color="#7c3aed" /></Col>
        </Row>
        <Row gutter={12}>
          <Col xs={24} lg={12}>{table('Top 访问来源 IP', data.topIps)}</Col>
          <Col xs={24} lg={12}>{table('Top 请求路径', data.topPaths)}</Col>
          <Col xs={24} lg={12}>{table('HTTP 状态码', data.status)}</Col>
          <Col xs={24} lg={12}>{table('Top UA(浏览器/爬虫)', data.topUa)}</Col>
        </Row>
      </>)}
    </div>
  );
}
