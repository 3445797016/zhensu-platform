// ═══════════════════════════════════════════════════════════════════════════
// PentAGI 集成 · 任务控制台（任务详情抽屉，可迁移）
// − 总览：风险发现(CVE) + 靶机画像 + 阶段报告
// − 时间线：Agent 思考 / 执行 / 汇报
// − 子任务 / Agent 协作 / 终端控制台 / 原始数据
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Drawer, Tabs, Button, Space, Tag, Typography, Progress, Row, Col, Statistic,
  Empty, List, Collapse, Timeline, Descriptions, Segmented, Switch, Tooltip,
  Popconfirm, message, Input, Card, Alert,
} from 'antd';
import {
  ReloadOutlined, StopOutlined, DeleteOutlined, SendOutlined, BulbOutlined,
  CodeOutlined, FileTextOutlined, CheckCircleOutlined, FileOutlined, EditOutlined,
  InfoCircleOutlined, BugOutlined, ClockCircleOutlined, CloseCircleOutlined,
  SyncOutlined, BorderOutlined, CopyOutlined, DownloadOutlined, AimOutlined,
  DesktopOutlined, NodeIndexOutlined, PartitionOutlined, MessageOutlined,
  ThunderboltOutlined, DownOutlined, UpOutlined,
} from '@ant-design/icons';
import Markdown from '../components/Markdown';
import { stripAnsi } from './api';
import {
  statusColor, statusText, isActive, MSG_TYPE, extractTarget, extractPorts,
  extractCVEs, cveMeta, formatDuration, fmtTime, parseHostFacts, subtaskProgress,
} from './lib';

const { Text, Paragraph, Title } = Typography;

const MSG_ICON: Record<string, any> = {
  thoughts: <BulbOutlined />,
  terminal: <CodeOutlined />,
  report: <FileTextOutlined />,
  done: <CheckCircleOutlined />,
  file: <FileOutlined />,
  input: <EditOutlined />,
};
const msgIcon = (t: string) => MSG_ICON[t] || <InfoCircleOutlined />;

/** 时间线节点色（Timeline 需真实色值，不能直接用 AntD 预设名） */
const MSG_HEX: Record<string, string> = {
  thoughts: '#722ed1', terminal: '#2f54eb', report: '#52c41a',
  done: '#13c2c2', file: '#fa8c16', input: '#8c8c8c',
};

const SUB_ICON: Record<string, any> = {
  finished: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  running: <SyncOutlined spin style={{ color: '#1677ff' }} />,
  waiting: <ClockCircleOutlined style={{ color: '#faad14' }} />,
  failed: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
  created: <BorderOutlined style={{ color: '#bfbfbf' }} />,
};
const subIcon = (s: string) => SUB_ICON[s] || <BorderOutlined style={{ color: '#bfbfbf' }} />;

interface Props {
  open: boolean;
  id: number | string | null;
  detail: any;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onStop: (id: number | string) => void;
  onDelete: (id: number | string) => void;
  onSend: (id: number | string, text: string) => void;
  defaultTab?: string;
}

export default function MissionDrawer({ open, id, detail, loading, onClose, onRefresh, onStop, onDelete, onSend, defaultTab }: Props) {
  const [inputText, setInputText] = useState('');

  const flow = detail?.flow;
  const subtasks: any[] = detail?.subtasks || [];
  const msglogs: any[] = detail?.msglogs || [];
  const termlogs: any[] = detail?.termlogs || [];
  const agentlogs: any[] = detail?.agentlogs || [];
  const tasks: any[] = detail?.tasks || [];
  const task = tasks[0];

  const prog = subtaskProgress(subtasks);

  // 汇总所有文本用于风险发现
  const { cves, findings } = useMemo(() => {
    const texts: string[] = [
      task?.input, task?.result,
      ...subtasks.flatMap((s) => [s.title, s.description, s.context, s.result]),
      ...msglogs.flatMap((m) => [m.message, m.thinking, m.result]),
      ...agentlogs.flatMap((a) => [a.task, a.result]),
      ...termlogs.map((t) => t.text),
    ].filter(Boolean) as string[];
    const found = extractCVEs(...texts);
    const detailed = found.map((cve) => {
      let evidence = '';
      for (const t of texts) {
        const idx = t.toUpperCase().indexOf(cve);
        if (idx >= 0) { evidence = t.slice(Math.max(0, idx - 80), idx + 120).replace(/\s+/g, ' ').trim(); break; }
      }
      const vuln = /vulnerable/i.test(texts.join(' '));
      return { cve, ...cveMeta(cve), evidence, vuln };
    });
    return { cves: found, findings: detailed };
  }, [task, subtasks, msglogs, agentlogs, termlogs]);

  const ports = useMemo(
    () => extractPorts(task?.input || '', ...termlogs.slice(0, 20).map((t) => t.text)),
    [task, termlogs],
  );
  const facts = useMemo(() => parseHostFacts(task?.input), [task]);
  const target = facts.target || extractTarget(flow?.title, task?.input) || '未识别';

  const reports = useMemo(
    () => msglogs.filter((m) => (m.type === 'report' || m.type === 'done') && (m.result || m.message)).slice().reverse(),
    [msglogs],
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="92%"
      destroyOnClose
      styles={{ body: { padding: 0, background: 'var(--zs-bg)' }, header: { display: 'none' } }}
      footer={isActive(flow?.status) ? (
        <Space.Compact style={{ width: '100%' }}>
          <Input.TextArea
            autoSize={{ minRows: 1, maxRows: 3 }}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="给运行中的 AI 追加指令 / 修正方向（会接到当前任务上下文）"
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => { if (id != null && inputText.trim()) { onSend(id, inputText.trim()); setInputText(''); } }}
            style={{ height: 'auto', minHeight: 32 }}
          >
            发送
          </Button>
        </Space.Compact>
      ) : null}
    >
      {loading && !flow ? (
        <div style={{ padding: 80, textAlign: 'center' }}>
          <SyncOutlined spin style={{ fontSize: 28, color: '#2f6bff' }} />
          <div style={{ marginTop: 12, color: '#888' }}>正在加载任务详情…</div>
        </div>
      ) : !flow ? (
        <div style={{ padding: 80 }}><Empty description="任务不存在或已被删除" /></div>
      ) : (
        <>
          {/* ── 头部 ── */}
          <div style={{ background: 'var(--zs-surface)', padding: '18px 24px 14px', borderBottom: '1px solid var(--zs-border)' }}>
            <Row align="top" gutter={16}>
              <Col flex="auto">
                <Space align="center" size={10} wrap>
                  <Tag color={statusColor(flow.status)} style={{ marginRight: 0 }}>{statusText(flow.status)}</Tag>
                  <Title level={4} style={{ margin: 0 }}>{flow.title || `任务 #${flow.id}`}</Title>
                </Space>
                <Space size={8} wrap style={{ marginTop: 10 }}>
                  <span className="pg-hero-chip" style={{ background: '#f0f5ff', borderColor: '#d6e4ff', color: '#1d39c4' }}>
                    <AimOutlined /> {target}
                  </span>
                  {flow.model_provider_name && <Tag color="blue">Provider: {flow.model_provider_name}</Tag>}
                  {flow.model && <Tag color="geekblue">{flow.model}</Tag>}
                  {flow.language && <Tag>{flow.language}</Tag>}
                  <Text type="secondary" style={{ fontSize: 12 }}>创建 {fmtTime(flow.created_at)}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>· 耗时 {formatDuration(flow.created_at, isActive(flow.status) ? undefined : flow.updated_at)}</Text>
                </Space>
              </Col>
              <Col>
                <Space>
                  <Tooltip title="刷新"><Button icon={<ReloadOutlined />} onClick={onRefresh}>刷新</Button></Tooltip>
                  {isActive(flow.status) && (
                    <Popconfirm title="停止该任务？" onConfirm={() => id != null && onStop(id)}>
                      <Button danger icon={<StopOutlined />}>停止</Button>
                    </Popconfirm>
                  )}
                  <Popconfirm title="删除该任务？（不影响 PentAGI 服务）" onConfirm={() => id != null && onDelete(id)}>
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </Col>
            </Row>
            <div style={{ marginTop: 14 }}>
              <Space style={{ marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>子任务进度</Text>
                <Text strong style={{ fontSize: 12 }}>{prog.done} / {prog.total}</Text>
              </Space>
              <Progress percent={prog.percent} strokeColor={{ from: '#2447b8', to: '#7c3aed' }} size="small" />
            </div>
          </div>

          <Tabs
            defaultActiveKey={defaultTab || 'overview'}
            style={{ padding: '0 24px 24px' }}
            items={[
              {
                key: 'overview', label: <span><ThunderboltOutlined />总览</span>,
                children: (
                  <OverviewTab
                    prog={prog} subtasks={subtasks} msglogs={msglogs} termlogs={termlogs}
                    agentlogs={agentlogs} findings={findings} facts={facts} ports={ports}
                    reports={reports} task={task}
                  />
                ),
              },
              {
                key: 'timeline', label: <span><ClockCircleOutlined />执行时间线</span>,
                children: <TimelineTab msglogs={msglogs} />,
              },
              {
                key: 'subtasks', label: <span><PartitionOutlined />子任务 ({subtasks.length})</span>,
                children: <SubtasksTab subtasks={subtasks} />,
              },
              {
                key: 'agents', label: <span><NodeIndexOutlined />Agent 协作 ({agentlogs.length})</span>,
                children: <AgentsTab agentlogs={agentlogs} />,
              },
              {
                key: 'console', label: <span><CodeOutlined />终端控制台 ({termlogs.length})</span>,
                children: <ConsoleTab termlogs={termlogs} />,
              },
              {
                key: 'raw', label: <span><FileTextOutlined />原始数据</span>,
                children: <RawTab detail={detail} />,
              },
            ]}
          />
        </>
      )}
    </Drawer>
  );
}

/* ═══════════════════ 总览 ═══════════════════ */
function OverviewTab({ prog, subtasks, msglogs, termlogs, agentlogs, findings, facts, ports, reports, task }: any) {
  const messages = msglogs.filter((m: any) => m.type === 'thoughts' || m.type === 'terminal').length;
  return (
    <Space direction="vertical" size={14} style={{ width: '100%', paddingTop: 6 }}>
      <Row gutter={12}>
        <Col span={6}><MiniStat icon={<PartitionOutlined />} color="#2447b8" label="子任务完成" value={`${prog.done}/${prog.total}`} /></Col>
        <Col span={6}><MiniStat icon={<MessageOutlined />} color="#7c3aed" label="推理/执行消息" value={messages} /></Col>
        <Col span={6}><MiniStat icon={<CodeOutlined />} color="#08979c" label="终端交互" value={termlogs.length} /></Col>
        <Col span={6}><MiniStat icon={<NodeIndexOutlined />} color="#d46b08" label="Agent 调用" value={agentlogs.length} /></Col>
      </Row>

      {/* 风险发现 */}
      <Card size="small" title={<span><BugOutlined style={{ color: '#f5222d' }} /> 风险发现 {findings.length > 0 && <Tag color="red">{findings.length} 项</Tag>}</span>}>
        {findings.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂未从日志中识别到 CVE，任务可能仍在信息收集阶段" />
        ) : (
          <Row gutter={[12, 12]}>
            {findings.map((f: any) => (
              <Col xs={24} md={12} key={f.cve}>
                <div className={`pg-finding ${f.severity}`} style={{ padding: '12px 14px' }}>
                  <Space align="center" wrap size={8}>
                    <Tag color={f.severity === 'critical' ? 'red' : f.severity === 'high' ? 'orange' : 'blue'}>
                      {f.severity.toUpperCase()}
                    </Tag>
                    <Text strong className="pg-mono">{f.cve}</Text>
                    {f.vuln && <Tag icon={<CheckCircleOutlined />} color="error">已验证可利用</Tag>}
                  </Space>
                  <div style={{ marginTop: 6, fontWeight: 600 }}>{f.name}</div>
                  {f.evidence && (
                    <Paragraph type="secondary" className="pg-mono" style={{ fontSize: 12, marginTop: 6, marginBottom: 0, maxHeight: 66, overflow: 'hidden' }}>
                      …{f.evidence}…
                    </Paragraph>
                  )}
                </div>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      <Row gutter={12}>
        {/* 靶机画像 */}
        <Col xs={24} lg={12}>
          <Card size="small" title={<span><DesktopOutlined /> 靶机画像</span>} style={{ height: '100%' }}>
            <Descriptions column={1} size="small" items={[
              { key: 't', label: '目标', children: <Text className="pg-mono" copyable>{facts.target || '-'}</Text> },
              { key: 'h', label: '主机名', children: facts.hostname || '-' },
              { key: 'o', label: '操作系统', children: facts.os || '-' },
              { key: 'w', label: '域/工作组', children: facts.workgroup || '-' },
              {
                key: 'p', label: '开放端口',
                children: ports.length ? (
                  <Space size={4} wrap>{ports.map((p: string) => <Tag key={p} color="geekblue" className="pg-mono">{p}</Tag>)}</Space>
                ) : '-',
              },
            ]} />
            {facts.services && <Alert style={{ marginTop: 10 }} type="info" showIcon message="已知服务" description={<span className="pg-mono" style={{ fontSize: 12 }}>{facts.services}</span>} />}
          </Card>
        </Col>

        {/* 阶段报告 */}
        <Col xs={24} lg={12}>
          <Card size="small" title={<span><FileTextOutlined /> 阶段报告 ({reports.length})</span>} style={{ height: '100%', maxHeight: 420, overflow: 'auto' }}>
            {reports.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无阶段报告" />
            ) : (
              <Collapse
                ghost
                size="small"
                items={reports.slice(0, 12).map((r: any, i: number) => ({
                  key: String(r.id ?? i),
                  label: (
                    <Space size={6}>
                      {msgIcon(r.type)}
                      <Text style={{ fontSize: 13 }}>{String(r.message || '').slice(0, 60) || `报告 #${r.id}`}</Text>
                    </Space>
                  ),
                  children: (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{fmtTime(r.created_at)}</Text>
                      <div style={{ marginTop: 6 }}>
                        <Markdown text={String(r.result || r.message || '')} />
                      </div>
                    </div>
                  ),
                }))}
              />
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

function MiniStat({ icon, color, label, value }: any) {
  return (
    <Card size="small" className="pg-stat" styles={{ body: { padding: '12px 14px' } }}>
      <Space align="center" size={10}>
        <div className="pg-stat-icon" style={{ background: `${color}14`, color }}>{icon}</div>
        <div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>{label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
        </div>
      </Space>
    </Card>
  );
}

/* ═══════════════════ 时间线 ═══════════════════ */
function TimelineTab({ msglogs }: { msglogs: any[] }) {
  const items = msglogs.slice().reverse().map((m) => {
    const meta = MSG_TYPE[m.type] || { color: 'gray', label: m.type };
    return {
      color: MSG_HEX[m.type] || 'gray',
      dot: <span style={{ fontSize: 14 }}>{msgIcon(m.type)}</span>,
      children: (
        <div className="pg-timeline-msg pg-fade-in">
          <Space size={8} wrap>
            <Tag color={meta.color} style={{ marginRight: 0 }}>{meta.label}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>{fmtTime(m.created_at)}</Text>
            {m.subtask_id && <Tag bordered={false}>子任务 #{m.subtask_id}</Tag>}
          </Space>
          {m.thinking && (
            <Collapse ghost size="small" style={{ marginTop: 4 }} items={[{ key: '1', label: <Text type="secondary" style={{ fontSize: 12 }}><BulbOutlined /> 思考过程</Text>, children: <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#666', marginBottom: 0 }}>{m.thinking}</Paragraph> }]} />
          )}
          <div style={{ marginTop: 6 }}>
            <Markdown text={String(m.message || '')} />
          </div>
          {m.result && String(m.result).length > 2 && (
            <Collapse ghost size="small" style={{ marginTop: 2 }} items={[{
              key: 'r',
              label: <Text type="secondary" style={{ fontSize: 12 }}>{String(m.result).slice(0, 60)}…（展开）</Text>,
              children: m.result_format === 'markdown'
                ? <Markdown text={String(m.result)} />
                : <pre className="pg-mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#f6f8fa', padding: 10, borderRadius: 6, marginBottom: 0 }}>{stripAnsi(String(m.result)).slice(0, 4000)}</pre>,
            }]} />
          )}
        </div>
      ),
    };
  });
  return msglogs.length === 0
    ? <Empty description="暂无消息" style={{ padding: 40 }} />
    : <Timeline mode="left" items={items} style={{ marginTop: 12 }} />;
}

/* ═══════════════════ 子任务 ═══════════════════ */
function SubtasksTab({ subtasks }: { subtasks: any[] }) {
  if (!subtasks.length) return <Empty description="暂无子任务" style={{ padding: 40 }} />;
  return (
    <List
      style={{ marginTop: 6 }}
      dataSource={subtasks.slice().sort((a, b) => a.id - b.id)}
      renderItem={(s: any) => (
        <List.Item className="pg-fade-in">
          <List.Item.Meta
            avatar={<span style={{ fontSize: 18 }}>{subIcon(s.status)}</span>}
            title={
              <Space size={8} wrap>
                <Text strong>#{s.id} {s.title}</Text>
                <Tag color={statusColor(s.status)}>{statusText(s.status)}</Tag>
              </Space>
            }
            description={
              <div>
                {s.description && <Paragraph type="secondary" style={{ fontSize: 12.5, marginBottom: 4 }} ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}>{s.description}</Paragraph>}
                {s.result && (
                  <Collapse ghost size="small" items={[{ key: 'r', label: <Text style={{ fontSize: 12 }}><FileTextOutlined /> 查看结果</Text>, children: <Markdown text={String(s.result)} /> }]} />
                )}
              </div>
            }
          />
        </List.Item>
      )}
    />
  );
}

/* ═══════════════════ Agent 协作 ═══════════════════ */
function AgentsTab({ agentlogs }: { agentlogs: any[] }) {
  if (!agentlogs.length) return <Empty description="暂无 Agent 日志" style={{ padding: 40 }} />;
  return (
    <List
      style={{ marginTop: 6 }}
      dataSource={agentlogs.slice().reverse()}
      renderItem={(a: any) => (
        <List.Item className="pg-fade-in">
          <div style={{ width: '100%' }}>
            <Space size={6} wrap>
              <Tag color="blue">{a.initiator}</Tag>
              <ThunderboltOutlined style={{ color: '#faad14' }} />
              <Tag color="cyan">{a.executor}</Tag>
            </Space>
            <Collapse ghost size="small" style={{ marginTop: 4 }} items={[{
              key: 't',
              label: <Text style={{ fontSize: 12.5 }}>{String(a.task || '').replace(/\s+/g, ' ').slice(0, 90)}…</Text>,
              children: (
                <div>
                  <Paragraph className="pg-mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{a.task}</Paragraph>
                  {a.result && <Alert type="success" message="执行结果" description={<Paragraph className="pg-mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginBottom: 0 }}>{String(a.result).slice(0, 3000)}</Paragraph>} />}
                </div>
              ),
            }]} />
          </div>
        </List.Item>
      )}
    />
  );
}

/* ═══════════════════ 终端控制台 ═══════════════════ */
function ConsoleTab({ termlogs }: { termlogs: any[] }) {
  const [filter, setFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(
    () => termlogs.filter((t) => filter === 'all' || t.type === filter),
    [termlogs, filter],
  );
  const lineCount = rows.reduce((n, r) => n + String(r.text || '').split('\n').length, 0);

  useEffect(() => {
    if (autoScroll && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [rows, autoScroll]);

  const copyAll = async () => {
    try { await navigator.clipboard.writeText(rows.map((r) => (r.type === 'stdin' ? '$ ' : '') + stripAnsi(r.text)).join('\n')); message.success('已复制'); }
    catch { message.error('复制失败'); }
  };
  const download = () => {
    const blob = new Blob([rows.map((r) => stripAnsi(r.text)).join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pentagi-terminal-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ paddingTop: 8 }}>
      <Space style={{ marginBottom: 10 }} wrap>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(String(v))}
          options={[
            { label: `全部 ${termlogs.length}`, value: 'all' },
            { label: '命令 stdin', value: 'stdin' },
            { label: '输出 stdout', value: 'stdout' },
            { label: '错误 stderr', value: 'stderr' },
          ]}
        />
        <Space size={4}>
          <Switch size="small" checked={autoScroll} onChange={setAutoScroll} />
          <Text type="secondary" style={{ fontSize: 12 }}>自动滚动</Text>
        </Space>
        <Button size="small" icon={<CopyOutlined />} onClick={copyAll}>复制</Button>
        <Button size="small" icon={<DownloadOutlined />} onClick={download}>下载</Button>
        <Text type="secondary" style={{ fontSize: 12 }}>{lineCount} 行</Text>
      </Space>
      <div className="pg-console">
        <div className="pg-console-bar">
          <span className="pg-dot-mac" style={{ background: '#ff5f56' }} />
          <span className="pg-dot-mac" style={{ background: '#ffbd2e' }} />
          <span className="pg-dot-mac" style={{ background: '#27c93f' }} />
          <Text style={{ color: '#8b95c9', fontSize: 12, marginLeft: 8 }} className="pg-mono">pentagi-shell — 沙箱执行记录</Text>
        </div>
        <div className="pg-console-body" ref={bodyRef}>
          {rows.length === 0 ? (
            <span style={{ color: '#5b678f' }}>（暂无终端输出）</span>
          ) : rows.map((r, i) => (
            r.type === 'stdin'
              ? <div key={i} className="pg-console-stdin">$ {stripAnsi(String(r.text || '')).trim()}</div>
              : <div key={i} className={r.type === 'stderr' ? 'pg-console-stderr' : undefined}>{stripAnsi(String(r.text || ''))}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ 原始数据 ═══════════════════ */
function RawTab({ detail }: { detail: any }) {
  const txt = JSON.stringify(detail, null, 2);
  return (
    <div style={{ paddingTop: 8 }}>
      <Button size="small" icon={<CopyOutlined />} onClick={() => navigator.clipboard.writeText(txt).then(() => message.success('已复制')).catch(() => message.error('复制失败'))} style={{ marginBottom: 10 }}>复制 JSON</Button>
      <pre className="pg-mono" style={{ background: '#fff', border: '1px solid #eef0f4', borderRadius: 8, padding: 14, maxHeight: '58vh', overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap' }}>{txt}</pre>
    </div>
  );
}
