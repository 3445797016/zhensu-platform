import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Tag, Space, Table, Button, Select, Alert, Spin, Descriptions,
  Typography, Tabs, Input, message, Divider, Progress, Badge, Tooltip, Modal, Empty
} from 'antd';
import {
  ReloadOutlined, PlayCircleOutlined, StopOutlined, SettingOutlined,
  NodeIndexOutlined, ThunderboltOutlined, ApiOutlined, SafetyOutlined,
  GlobalOutlined, ExperimentOutlined, EditOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import { api } from '../api';
import { StatCard } from '../components/ui';

const { TextArea } = Input;

// 直接使用 message API 而非 App.useApp (避免额外依赖)
const msg = message;

export default function VPN() {
  const [status, setStatus] = useState<any>(null);
  const [proxies, setProxies] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingDelay, setTestingDelay] = useState(false);
  const [testedNodes, setTestedNodes] = useState<Set<string>>(new Set());
  const [configContent, setConfigContent] = useState('');
  const [configModal, setConfigModal] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        api.get('/vpn/status'),
        api.get('/vpn/proxies'),
      ]);
      setStatus(s);
      setProxies(p.proxies || []);
      setGroups(p.groups || []);
    } catch (e: any) {
      msg.error('加载 VPN 状态失败: ' + e.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  // 批量延迟测试
  const testAllDelays = async () => {
    setTestingDelay(true);
    try {
      const names = proxies.map((p) => p.name);
      const r = await api.post('/vpn/proxies/delays', { names });
      if (r.results) {
        // 记录所有测试过的节点
        const tested = new Set<string>(r.results.map((x: any) => String(x.name)));
        setTestedNodes(tested);
        setProxies((prev) => prev.map((p) => {
          const updated = r.results.find((x: any) => x.name === p.name);
          return updated ? { ...p, delay: updated.delay, error: updated.error } : p;
        }));
      }
    } catch (e: any) {
      msg.error('延迟测试失败: ' + e.message);
    }
    setTestingDelay(false);
  };

  // 切换代理组
  const doSwitch = async (group: string, proxy: string) => {
    try {
      await api.post('/vpn/proxies/switch', { group, proxy });
      msg.success(`已切换到 ${proxy}`);
      load();
    } catch (e: any) {
      msg.error('切换失败: ' + e.message);
    }
  };

  // 重启 Clash
  const restartClash = async () => {
    try {
      const r = await api.post('/vpn/restart');
      r.ok ? msg.success('Clash 已重启') : msg.error(r.error || '重启失败');
      setTimeout(load, 3000);
    } catch (e: any) {
      msg.error('重启失败: ' + e.message);
    }
  };

  // 停止 Clash
  const stopClash = async () => {
    try {
      const r = await api.post('/vpn/stop');
      r.ok ? (msg.success('Clash 已停止'), load()) : msg.error(r.error || '停止失败');
    } catch (e: any) {
      msg.error('停止失败: ' + e.message);
    }
  };

  // 加载/保存配置
  const loadConfig = async () => {
    try {
      const r = await api.get('/vpn/config');
      setConfigContent(r.content || '');
      setConfigModal(true);
    } catch (e: any) {
      msg.error('读取配置失败: ' + e.message);
    }
  };
  const saveConfig = async () => {
    try {
      const r = await api.post('/vpn/config', { content: configContent });
      r.ok ? (msg.success('配置已保存'), setConfigModal(false)) : msg.error(r.error || '保存失败');
    } catch (e: any) {
      msg.error('保存失败: ' + e.message);
    }
  };

  if (loading && !status) return <center style={{ marginTop: 120 }}><Spin size="large" /></center>;

  const delayColor = (ms: number | null) => {
    if (ms === null) return '#999';
    if (ms < 100) return '#52c41a';
    if (ms < 300) return '#faad14';
    return '#ff4d4f';
  };

  const delayLevel = (ms: number | null) => {
    if (ms === null || ms === undefined) return '未知';
    if (ms < 100) return '优秀';
    if (ms < 200) return '良好';
    if (ms < 300) return '一般';
    if (ms < 500) return '缓慢';
    return '很差';
  };

  const proxyCols = [
    {
      title: '节点名称', dataIndex: 'name', key: 'name', width: 250,
      render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
    },
    { title: '类型', dataIndex: 'type', key: 'type', width: 100 },
    { title: '服务器', dataIndex: 'server', key: 'server', ellipsis: true },
    { title: '端口', dataIndex: 'port', key: 'port', width: 80 },
    {
      title: (
        <Space>
          <span>延迟</span>
          <Button size="small" icon={<ThunderboltOutlined />} loading={testingDelay} onClick={testAllDelays}>测速</Button>
        </Space>
      ),
      dataIndex: 'delay', key: 'delay', width: 180,
      render: (_: any, record: any) => {
        const v = record.delay;
        const isTested = testedNodes.has(record.name);
        if (v !== null && v !== undefined) {
          return (
            <Space>
              <Progress
                type="circle" size={28}
                percent={Math.min(Math.round((v / 500) * 100), 100)}
                strokeColor={delayColor(v)}
                format={() => ''}
              />
              <span style={{ color: delayColor(v), fontWeight: 600 }}>{v}ms</span>
              <Tag color={v < 200 ? 'green' : v < 400 ? 'orange' : 'red'}>{delayLevel(v)}</Tag>
            </Space>
          );
        }
        if (isTested) {
          const err = record.error || '';
          if (err.includes('timeout') || err.includes('Timeout')) {
            return <Tag color="red">⏱ 超时</Tag>;
          }
          if (err) {
            return <Tag color="orange">⚠ {err.substring(0, 20)}</Tag>;
          }
          return <Tag color="orange">⛔ 不可达</Tag>;
        }
        return <Tag>未测试</Tag>;
      },
    },
  ];

  return (
    <div>
      {/* 总览状态卡片 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Clash 代理" value={status?.clash?.running ? '运行中' : '已停止'}
            icon={status?.clash?.running ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            color={status?.clash?.running ? '#16a34a' : '#ef4444'}
            hint={status?.clash?.version || `PID: ${status?.clash?.pid || '-'}`} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="OpenVPN" value={status?.openvpn?.running ? '运行中' : '已停止'}
            icon={status?.openvpn?.running ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            color={status?.openvpn?.running ? '#16a34a' : '#94a3b8'}
            hint={`${status?.openvpn?.configs?.length || 0} 个配置`} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="代理节点" value={proxies.length} suffix="个" icon={<NodeIndexOutlined />} color="#2f6bff" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="系统代理" value={status?.systemProxy?.enabled ? '已启用' : '未设置'}
            icon={<ApiOutlined />} color={status?.systemProxy?.enabled ? '#16a34a' : '#94a3b8'}
            hint={status?.systemProxy?.http ? `HTTP: ${status.systemProxy.http}` : undefined} />
        </Col>
      </Row>

      {/* 快捷操作 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新状态</Button>
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={restartClash}
            disabled={status?.clash?.running}>启动 Clash</Button>
          <Button danger icon={<StopOutlined />} onClick={stopClash}
            disabled={!status?.clash?.running}>停止 Clash</Button>
          <Button icon={<EditOutlined />} onClick={loadConfig}>编辑配置</Button>
          <Button icon={<ExperimentOutlined />} onClick={testAllDelays} loading={testingDelay}>
            全局延迟测试
          </Button>
        </Space>
      </Card>

      {/* 代理组切换 */}
      {groups.length > 0 && (
        <Card size="small" title={<Space><SettingOutlined />代理组切换</Space>} style={{ marginBottom: 12 }}>
          <Row gutter={[16, 12]}>
            {groups.map((g) => (
              <Col key={g.name} xs={24} sm={12} lg={8}>
                <Space>
                  <Typography.Text strong style={{ fontSize: 13 }}>{g.name}</Typography.Text>
                  <Select
                    value={g.now || undefined}
                    style={{ minWidth: 180 }}
                    onChange={(v) => doSwitch(g.name, v)}
                    options={g.all.map((p: string) => ({ label: p, value: p }))}
                  />
                </Space>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* 节点表格 */}
      <Card
        size="small"
        title={<Space><GlobalOutlined />代理节点列表<Badge count={proxies.length} style={{ backgroundColor: '#4f8cff' }} /></Space>}
      >
        <Table
          rowKey="name"
          size="small"
          dataSource={proxies}
          columns={proxyCols as any}
          pagination={proxies.length > 20 ? { pageSize: 20 } : false}
          scroll={{ y: 'calc(100vh - 550px)' }}
        />
      </Card>

      {/* 配置编辑弹窗 */}
      <Modal
        title="编辑 Clash 配置"
        open={configModal}
        onCancel={() => setConfigModal(false)}
        onOk={saveConfig}
        okText="保存并应用"
        width={700}
      >
        <TextArea
          rows={20}
          value={configContent}
          onChange={(e) => setConfigContent(e.target.value)}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      </Modal>

      {/* 未检测到 Clash 的提示 */}
      {!status?.clash?.running && !loading && (
        <Alert
          type="info"
          showIcon
          message="Clash 代理未运行"
          description="Clash 是一个轻量级代理客户端，支持 VMess/Shadowsocks/Trojan 等多种协议。如未安装，可在 <strong>中间件 / 工具库</strong> 中配置或在服务器上手动启动。"
          style={{ marginTop: 12 }}
        />
      )}
    </div>
  );
}