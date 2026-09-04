import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, List, Space, Progress, Alert, Spin, Descriptions, Empty, Button } from 'antd';
import { RobotOutlined, CloudServerOutlined, ContainerOutlined, ClusterOutlined, ToolOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { api } from '../api';

export default function Dashboard() {
  const [data, setData] = useState<any>({ loading: true });
  const load = async () => {
    const [agents, dstat, hosts, alerts, tools, kov] = await Promise.allSettled([
      api.get('/agents/overview'), api.get('/docker/status'),
      api.get('/hosts'), api.get('/monitor/alerts'),
      api.get('/tools'), api.get('/k8s/ready'),
    ]);
    const g = (i: number) => (agents.status === 'fulfilled' ? agents.value : {});
    setData({
      loading: false,
      agents: agents.status === 'fulfilled' ? agents.value : null,
      docker: dstat.status === 'fulfilled' ? dstat.value : { ok: false, error: 'Docker 不可用' },
      hosts: hosts.status === 'fulfilled' ? hosts.value : [],
      alerts: alerts.status === 'fulfilled' ? alerts.value : [],
      toolsDef: tools.status === 'fulfilled' ? tools.value : { tools: [] },
      k8s: kov.status === 'fulfilled' ? kov.value : { ready: false },
    });
  };
  useEffect(() => { load(); }, []);
  const d = data;
  if (d.loading) return <center style={{ marginTop: 120 }}><Spin size="large" /></center>;

  const toolsTotal = d.toolsDef?.tools?.length || 0;
  return (
    <div>
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message="轸宿智汇平台 · 控制台"
        description="管理本地 Agent · 宿主机/VM · Docker · Kubernetes · 中间件 · DevOps · 监控告警，并支持 AI 对话式运维。工具未安装时会给出安装指引，装好即自动纳入管理。" />

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} lg={4}><Card><Statistic title="Agent" value={d.agents?.agents?.length || 0} prefix={<RobotOutlined />} suffix={<Tag color="blue">pi / opencode</Tag>} /></Card></Col>
        <Col xs={12} sm={8} lg={4}><Card><Statistic title="宿主机/VM" value={d.hosts?.length || 0} prefix={<CloudServerOutlined />} /></Card></Col>
        <Col xs={12} sm={8} lg={4}><Card><Statistic title="Docker" value={d.docker?.ok ? '在线' : '离线'} prefix={<ContainerOutlined />} valueStyle={{ color: d.docker?.ok ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
        <Col xs={12} sm={8} lg={4}><Card><Statistic title="Kubernetes" value={d.k8s?.ready ? '就绪' : '未连接'} prefix={<ClusterOutlined />} valueStyle={{ color: d.k8s?.ready ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
        <Col xs={12} sm={8} lg={4}><Card><Statistic title="工具/中间件" value={toolsTotal} prefix={<ToolOutlined />} /></Card></Col>
        <Col xs={12} sm={8} lg={4}><Card><Statistic title="未处理告警" value={d.alerts?.filter?.((a: any) => !a.ack).length || 0} prefix={<CloseCircleOutlined />} valueStyle={{ color: d.alerts?.filter?.((a: any) => !a.ack).length ? '#fa8c16' : undefined }} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Agent 运行状态" size="small">
            {!d.agents ? <Empty /> : (
              <List size="small" dataSource={d.agents.agents || []}
                renderItem={(a: any) => (
                  <List.Item actions={[<Tag color={a.installed ? 'green' : 'red'}>{a.installed ? '已安装' : '未安装'}</Tag>, <Tag color={a.running > 0 ? 'blue' : 'default'}>{a.running > 0 ? `运行中 ×${a.running}` : '未运行'}</Tag>]}>
                    <List.Item.Meta title={<Space>{a.name}<Tag>{a.version || '-'}</Tag></Space>} description={`会话数 ${a.sessionCount ?? '-'}`} />
                  </List.Item>
                )} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="宿主机/VM" size="small" extra={<Button size="small" onClick={load}>刷新</Button>}>
            {d.hosts?.length === 0 ? <Empty description="尚未添加主机，请到「宿主机 / VM」添加" /> : (
              <List size="small" dataSource={d.hosts || []}
                renderItem={(h: any) => (
                  <List.Item actions={[<Tag color={h.kind === 'local' ? 'gold' : 'geekblue'}>{h.kind === 'local' ? '本机' : 'SSH'}</Tag>]}>
                    <List.Item.Meta title={h.name} description={`${h.kind === 'ssh' ? `${h.user}@${h.host}:${h.port}` : 'local'} ${h.os || ''}`} />
                  </List.Item>
                )} />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Docker 服务" size="small">
            {d.docker?.ok ? (
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="版本">{d.docker.version?.Version}</Descriptions.Item>
                <Descriptions.Item label="存储驱动">{d.docker.info?.Driver}</Descriptions.Item>
                <Descriptions.Item label="镜像数">{d.docker.info?.Images}</Descriptions.Item>
                <Descriptions.Item label="运行容器">{d.docker.info?.ContainersRunning}</Descriptions.Item>
              </Descriptions>
            ) : <Alert type="warning" message={d.docker?.error || 'Docker 不可用'} />}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="最新告警" size="small">
            {d.alerts?.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无告警" /> : (
              <List size="small" dataSource={(d.alerts || []).slice(0, 5)} renderItem={(a: any) => (
                <List.Item><Space><Tag color={a.ack ? 'default' : 'error'}>{a.kind}</Tag><span>{a.hostName}: {a.message}</span></Space></List.Item>
              )} />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
