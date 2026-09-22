import { useEffect, useState } from 'react';
import {
  Card, Row, Col, Tag, Space, Button, Alert, Spin, Typography,
  Input, message, Modal, Divider, Descriptions, Table, Tooltip, InputNumber
} from 'antd';
import {
  PlayCircleOutlined, StopOutlined, ReloadOutlined, SettingOutlined,
  DatabaseOutlined, CloudServerOutlined, KeyOutlined, LinkOutlined,
  CheckCircleOutlined, CloseCircleOutlined, EditOutlined, FolderOpenOutlined
} from '@ant-design/icons';
import { api } from '../api';
import { StatCard } from '../components/ui';

const msg = message;

export default function MinIO() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [configModal, setConfigModal] = useState(false);
  const [config, setConfig] = useState<any>({});

  const load = async () => {
    setLoading(true);
    try {
      const s = await api.get('/minio/status');
      setStatus(s);
    } catch (e: any) {
      msg.error('加载 MinIO 状态失败: ' + e.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  const doStart = async () => {
    try {
      const r = await api.post('/minio/start');
      if (r.ok) { msg.success('MinIO 已启动'); load(); }
      else msg.error(r.error || '启动失败');
    } catch (e: any) {
      msg.error('启动失败: ' + e.message);
    }
  };

  const doStop = async () => {
    try {
      const r = await api.post('/minio/stop');
      if (r.ok) { msg.success('MinIO 已停止'); load(); }
      else msg.error(r.error || '停止失败');
    } catch (e: any) {
      msg.error('停止失败: ' + e.message);
    }
  };

  const loadConfig = async () => {
    try {
      const c = await api.get('/minio/config');
      setConfig(c);
      setConfigModal(true);
    } catch (e: any) {
      msg.error('读取配置失败: ' + e.message);
    }
  };

  const saveConfig = async () => {
    try {
      const r = await api.post('/minio/config', config);
      if (r.ok) { msg.success('配置已保存'); setConfigModal(false); }
      else msg.error(r.error || '保存失败');
    } catch (e: any) {
      msg.error('保存失败: ' + e.message);
    }
  };

  if (loading && !status) return <center style={{ marginTop: 120 }}><Spin size="large" /></center>;

  return (
    <div>
      {/* 状态卡片 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={12} lg={8}>
          <StatCard title="MinIO 服务" value={status?.running ? '运行中' : '已停止'}
            icon={status?.running ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            color={status?.running ? '#16a34a' : '#ef4444'}
            hint={status?.pid ? `PID: ${status.pid}` : undefined} />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard title="API 端点" value={<span style={{ fontSize: 16 }}>{status?.endpoint || '-'}</span>}
            icon={<CloudServerOutlined />} color="#2f6bff"
            hint={status?.running ? `端口 ${status.port}` : undefined} />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard title="数据目录" value={<span style={{ fontSize: 14 }}>{status?.dataDir || '-'}</span>}
            icon={<FolderOpenOutlined />} color="#7c3aed"
            hint={status?.running ? `控制台: ${status.consoleUrl}` : undefined} />
        </Col>
      </Row>

      {/* 快捷操作 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={doStart}
            disabled={status?.running}>启动 MinIO</Button>
          <Button danger icon={<StopOutlined />} onClick={doStop}
            disabled={!status?.running}>停止 MinIO</Button>
          <Button icon={<EditOutlined />} onClick={loadConfig}>编辑配置</Button>
          {status?.running && (
            <Button type="link" icon={<LinkOutlined />} href={status.consoleUrl} target="_blank">
              打开控制台
            </Button>
          )}
        </Space>
      </Card>

      {/* MinIO 说明 */}
      <Card size="small" title={<Space><DatabaseOutlined />MinIO 对象存储</Space>}>
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="默认用户名">minioadmin</Descriptions.Item>
          <Descriptions.Item label="默认密码">minioadmin</Descriptions.Item>
          <Descriptions.Item label="API 端口">{status?.port || 9000}</Descriptions.Item>
          <Descriptions.Item label="控制台端口">{status?.consolePort || 9001}</Descriptions.Item>
          <Descriptions.Item label="数据目录">{status?.dataDir || '/data/minio'}</Descriptions.Item>
        </Descriptions>
        {!status?.running && (
          <Alert
            type="info" showIcon
            message="MinIO 未启动"
            description="MinIO 是一个高性能的 S3 兼容对象存储服务。点击「启动 MinIO」按钮即可开始使用。启动后可在浏览器中打开控制台管理存储桶和文件。"
            style={{ marginTop: 12 }}
          />
        )}
        {status?.running && (
          <Alert
            type="success" showIcon
            message="MinIO 正在运行"
            description={`API 端点: ${status.endpoint} | 控制台: ${status.consoleUrl}
登录凭据可在「编辑配置」中修改。点击「打开控制台」进入 Web 管理界面。`}
            style={{ marginTop: 12 }}
          />
        )}
      </Card>

      {/* 配置编辑弹窗 */}
      <Modal
        title="MinIO 配置"
        open={configModal}
        onCancel={() => setConfigModal(false)}
        onOk={saveConfig}
        okText="保存"
        width={500}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Typography.Text strong>API 端口</Typography.Text>
            <InputNumber
              style={{ width: '100%', marginTop: 4 }}
              value={config.port}
              onChange={(v) => setConfig({ ...config, port: v })}
              min={1024}
              max={65535}
            />
          </div>
          <div>
            <Typography.Text strong>控制台端口</Typography.Text>
            <InputNumber
              style={{ width: '100%', marginTop: 4 }}
              value={config.consolePort}
              onChange={(v) => setConfig({ ...config, consolePort: v })}
              min={1024}
              max={65535}
            />
          </div>
          <div>
            <Typography.Text strong>用户名</Typography.Text>
            <Input
              style={{ marginTop: 4 }}
              value={config.rootUser}
              onChange={(e) => setConfig({ ...config, rootUser: e.target.value })}
            />
          </div>
          <div>
            <Typography.Text strong>密码</Typography.Text>
            <Input.Password
              style={{ marginTop: 4 }}
              value={config.rootPassword || ''}
              onChange={(e) => setConfig({ ...config, rootPassword: e.target.value })}
              placeholder="修改密码请输入新密码"
            />
          </div>
          <div>
            <Typography.Text strong>数据目录</Typography.Text>
            <Input
              style={{ marginTop: 4 }}
              value={config.dataDir}
              onChange={(e) => setConfig({ ...config, dataDir: e.target.value })}
              placeholder="/data/minio"
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
}