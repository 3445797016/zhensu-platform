import { useEffect, useState } from 'react';
import { Card, Row, Col, Tag, Space, List, Descriptions, Progress, Empty, Spin, Tabs, Alert, Typography, Divider } from 'antd';
import { RobotOutlined, CodeOutlined } from '@ant-design/icons';
import { api } from '../api';

export default function Agents() {
  const [d, setD] = useState<any>(null);
  const load = async () => setD(await api.get('/agents/overview'));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  if (!d) return <center style={{ marginTop: 120 }}><Spin size="large" /></center>;
  const pi = d.agents?.find((a: any) => a.id === 'pi');
  const oc = d.agents?.find((a: any) => a.id === 'opencode');
  return (
    <div>
      <Alert style={{ marginBottom: 16 }} message="Agent 状态实时扫描" description={`发现引擎基于本机进程 + CLI 探测，缓存 20 秒。刷新按钮 / 每 30 秒自动刷新。`} type="info" showIcon />
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card title={<Space><RobotOutlined style={{ color: '#4f8cff' }} /> Pi Coding Agent</Space>}
            extra={pi?.running > 0 ? <Tag color="green">运行中 ×{pi.running}</Tag> : <Tag>未运行</Tag>}>
            {pi ? <AgentDetail a={pi} /> : <Empty />}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<Space><CodeOutlined style={{ color: '#52c41a' }} /> OpenCode</Space>}
            extra={oc?.running > 0 ? <Tag color="green">运行中 ×{oc.running}</Tag> : <Tag>未运行</Tag>}>
            {oc ? <AgentDetail a={oc} /> : <Empty />}
          </Card>
        </Col>
      </Row>
      <Card title="主机信息" style={{ marginTop: 16 }} size="small">
        <Descriptions column={4} size="small">
          <Descriptions.Item label="主机名">{d.host?.hostname}</Descriptions.Item>
          <Descriptions.Item label="平台">{d.host?.platform}</Descriptions.Item>
          <Descriptions.Item label="架构">{d.host?.arch}</Descriptions.Item>
          <Descriptions.Item label="Node">{d.host?.node}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}

function AgentDetail({ a }: any) {
  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Tag color={a.installed ? 'green' : 'red'}>{a.installed ? '已安装' : '未安装'}</Tag>
        <Tag>{a.version || '-'}</Tag>
        <Tag color="geekblue">会话 {a.sessionCount ?? 0}</Tag>
      </Space>
      {a.providers?.length > 0 && (
        <>
          <Divider orientation="left" style={{ margin: '8px 0' }} plain>已认证模型提供商</Divider>
          <Space wrap>
            {a.providers.map((p: any) => <Tag color="purple">{p.id} {p.configured ? '(已配置)' : ''}</Tag>)}
          </Space>
        </>
      )}
      {a.sessions?.length > 0 && (
        <>
          <Divider orientation="left" style={{ margin: '12px 0' }} plain>近期会话</Divider>
          <List size="small" dataSource={a.sessions.slice(0, 8)}
            renderItem={(s: any) => (
              <List.Item><Space><Typography.Text type="secondary">{new Date(s.mtime).toLocaleString()}</Typography.Text><span style={{ fontSize: 12 }}>{s.name}</span><Tag>{Math.round(s.size / 1024)}KB</Tag></Space></List.Item>
            )} />
        </>
      )}
    </>
  );
}
