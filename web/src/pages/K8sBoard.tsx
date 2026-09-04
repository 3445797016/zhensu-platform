import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Button, Progress, Space, Empty, Spin, Alert, Select, Badge, Tooltip } from 'antd';
import { ReloadOutlined, ClusterOutlined, HddOutlined, CloudServerOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { api } from '../api';

const EV_LEVEL: any = { Warning: 'error', Normal: 'default' };

export default function ClusterBoard() {
  const [ov, setOv] = useState<any>(null);
  const [topN, setTopN] = useState<any>(null);
  const [summary, setSummary] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [nsSel, setNsSel] = useState<string>('_all');
  const [nsList, setNsList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [o, t, s] = await Promise.all([api.get('/k8s/overview'), api.get('/k8s/top/nodes'), api.get('/k8s/summary')]);
      setOv(o); setTopN(t); setSummary(s);
      setNsList((s || []).map((x: any) => x.ns));
      const evNs = nsSel === '_all' ? '' : nsSel;
      const e = await api.get('/k8s/events', { ns: evNs || undefined });
      setEvents(e.items || []);
    } catch (e: any) { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (ov?.current) load(); }, [nsSel]);

  if (!ov) return <center style={{ marginTop: 80 }}><Spin size="large" /></center>;

  const nodes = ov.nodes?.items || [];
  const totalDeployments = summary.reduce((a: any, x: any) => a + x.deployments, 0);
  const totalPods = summary.reduce((a: any, x: any) => a + x.pods, 0);
  const runningPods = summary.reduce((a: any, x: any) => a + x.runningPods, 0);

  return (
    <div>
      {!ov.version?.available && <Alert type="warning" style={{ marginBottom: 12 }} showIcon message="未连接集群" description="请配置 kubectl 指向集群后刷新。" />}
      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={load}>刷新</Button>
        <Tag color="geekblue" icon={<ClusterOutlined />}>集群: {ov.current || '未连接'}</Tag>
        <Tag>版本: {ov.version?.gitVersion || '-'}</Tag>
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="节点" value={nodes.length} prefix={<CloudServerOutlined />} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="命名空间" value={ov.namespaces} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Deployments" value={totalDeployments} prefix={<ThunderboltOutlined />} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Pod" value={runningPods} suffix={`/ ${totalPods}`} valueStyle={{ color: runningPods === totalPods && totalPods > 0 ? '#52c41a' : undefined }} /></Card></Col>
      </Row>

      {/* 节点资源用量 */}
      <Card title={<Space><HddOutlined /> 节点资源用量</Space>} size="small" style={{ marginTop: 16 }}>
        {!topN?.ok ? <Alert type="info" showIcon message={topN?.error || 'metrics-server 未提供用量，仅显示状态'} /> :
        <Row gutter={[16, 16]}>
          {topN.items.map((n: any) => (
            <Col xs={24} md={12} key={n.name}>
              <Card size="small">
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <b>{n.name}</b><Tag>control-plane</Tag>
                </Space>
                <div style={{ marginTop: 8 }}><Progress percent={parseInt(n.cpuPct) || 0} strokeColor="#4f8cff" format={() => `CPU ${n.cpu} (${n.cpuPct})`} /></div>
                <div><Progress percent={parseInt(n.memPct) || 0} strokeColor="#52c41a" format={() => `内存 ${n.mem} (${n.memPct})`} /></div>
              </Card>
            </Col>
          ))}
        </Row>}
      </Card>

      {/* 命名空间资源聚合 */}
      <Card title="命名空间资源概览" size="small" style={{ marginTop: 16 }}>
        <Table rowKey="ns" size="small" dataSource={summary} pagination={false} scroll={{ x: 700 }}
          columns={[
            { title: '命名空间', dataIndex: 'ns', render: (v: string) => v === '合计' ? <b>{v}</b> : <Tag color="blue">{v}</Tag> },
            { title: 'Deploy', dataIndex: 'deployments', align: 'right' },
            { title: 'Pods(运行/总)', render: (_: any, r: any) => r.ns === '合计' ? <b>{r.runningPods}/{r.pods}</b> : `${r.runningPods}/${r.pods}` },
            { title: 'Service', dataIndex: 'services', align: 'right' },
            { title: 'ConfigMap', dataIndex: 'configmaps', align: 'right' },
          ]} />
      </Card>

      {/* 集群事件 */}
      <Card title="集群事件流" size="small" style={{ marginTop: 16 }} extra={
        <Select value={nsSel} onChange={setNsSel} size="small" style={{ width: 180 }} options={[{ value: '_all', label: '全部命名空间' }, ...nsList.map((n) => ({ value: n, label: n }))]} />
      }>
        {events.length === 0 ? <Empty description="无事件" image={Empty.PRESENTED_IMAGE_SIMPLE} /> :
        <Table rowKey={(r: any) => r.metadata?.uid || (r.metadata?.name + r.lastTimestamp)} size="small" dataSource={events} pagination={{ pageSize: 12 }}
          columns={[
            { title: '级别', render: (_: any, r: any) => <Tag color={EV_LEVEL[r.type] || 'default'}>{r.type}</Tag> },
            { title: '命名空间', dataIndex: ['involvedObject', 'namespace'], width: 110 },
            { title: '对象', render: (_: any, r: any) => <span><Tag>{r.involvedObject?.kind}</Tag>{r.involvedObject?.name}</span> },
            { title: '原因', dataIndex: 'reason' },
            { title: '消息', dataIndex: 'message', ellipsis: true },
            { title: '次数', dataIndex: 'count', width: 60, align: 'right' },
            { title: '时间', dataIndex: 'lastTimestamp', width: 170, render: (t: string) => t ? new Date(t).toLocaleString() : '-' },
          ]} />}
      </Card>
    </div>
  );
}
