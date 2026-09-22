import { useEffect, useMemo, useState } from 'react';
import {
  Card, Row, Col, Button, Space, Input, Tag, List, Alert, Switch, Empty, Divider,
  App, Progress, Typography, Tooltip, Badge,
} from 'antd';
import {
  ReloadOutlined, DatabaseOutlined, SearchOutlined, ThunderboltOutlined,
  FileTextOutlined, BlockOutlined, TagsOutlined, CheckCircleOutlined, FolderOpenOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { api } from '../api';
import { StatCard } from '../components/ui';

const { Text, Paragraph } = Typography;

/** 高亮检索词 */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q.trim()) return <>{text}</>;
  const re = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${re})`, 'gi'));
  return <>{parts.map((p, i) => p.toLowerCase() === q.toLowerCase()
    ? <mark key={i} style={{ background: '#fff1b8', padding: '0 2px', borderRadius: 3 }}>{p}</mark>
    : <span key={i}>{p}</span>)}</>;
}

export default function KnowledgeBase() {
  const [st, setSt] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [searching, setSearching] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [docFilter, setDocFilter] = useState('');
  const { message } = App.useApp();

  const load = async () => {
    try {
      const [s, d, k] = await Promise.all([api.get('/kb/status'), api.get('/kb/docs'), api.get('/kb/settings')]);
      setSt(s); setDocs(d); setEnabled(k.enabled !== false);
    } catch (e: any) { message.error('加载知识库失败: ' + e.message); }
  };
  useEffect(() => {
    load();
    const t = setInterval(async () => {
      try { const s = await api.get('/kb/status'); setSt(s); if (!s.job?.running) clearInterval(t); } catch { /* 静默重试 */ }
    }, 1500);
    return () => clearInterval(t);
  }, []);

  const rebuild = async () => { try { await api.post('/kb/rebuild'); message.success('开始重建索引（后台进行，可关闭本页）'); load(); } catch (e: any) { message.error('重建失败: ' + e.message); } };
  const toggle = async (v: boolean) => { try { setEnabled(v); await api.put('/kb/settings', { enabled: v }); message.success(v ? '已开启 AI 知识库检索' : '已关闭 AI 知识库检索'); } catch (e: any) { setEnabled(!v); message.error('切换失败: ' + e.message); } };
  const doSearch = async () => {
    if (!searching.trim()) { setResults([]); return; }
    setBusy(true);
    try { const r: any = await api.get('/kb/search', { q: searching, top: 10 }); setResults(r.results || []); }
    catch (e: any) { message.error('搜索失败: ' + e.message); }
    setBusy(false);
  };

  const job = st?.job;
  const shownDocs = useMemo(
    () => docs.filter((d) => !docFilter.trim() || String(d.file).toLowerCase().includes(docFilter.trim().toLowerCase())),
    [docs, docFilter],
  );
  const maxScore = Math.max(1, ...results.map((r) => Number(r.score) || 0));

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      {/* KPI */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}><StatCard icon={<FileTextOutlined />} color="#2f6bff" title="文档数" value={docs.length} /></Col>
        <Col xs={12} md={6}><StatCard icon={<BlockOutlined />} color="#7c3aed" title="文本块" value={st?.chunkCount || 0} /></Col>
        <Col xs={12} md={6}><StatCard icon={<TagsOutlined />} color="#0891b2" title="索引词条" value={st?.tokenCount || 0} /></Col>
        <Col xs={12} md={6}><StatCard icon={<CheckCircleOutlined />} color={enabled ? '#16a34a' : '#94a3b8'} title="AI 检索" value={enabled ? '已启用' : '已停用'} /></Col>
      </Row>

      <Alert type="info" showIcon
        message="本地知识库（RAG）"
        description={<span>扫描桌面 <Text code>knowledge</Text> 目录（支持 PDF / txt / md），抽取文本切块建立中文可检索索引。AI 智能运维与代码助手会自动引用检索结果回答。</span>}
      />

      {/* 索引管理 */}
      <Card size="small"
        title={<Space><DatabaseOutlined style={{ color: '#722ed1' }} /><b>索引管理</b>
          <Tag color="geekblue" style={{ marginRight: 0 }}><FolderOpenOutlined /> {st?.path || '-'}</Tag></Space>}
        extra={
          <Space>
            <Space size={6}><Text type="secondary" style={{ fontSize: 12 }}>AI 引用</Text><Switch size="small" checked={enabled} onChange={toggle} /></Space>
            <Button type="primary" size="small" icon={<ThunderboltOutlined />} loading={job?.running} onClick={rebuild}>
              {job?.running ? `索引中 ${job.done}/${job.total}` : '重建索引'}
            </Button>
          </Space>
        }>
        {job?.running && (
          <div style={{ marginBottom: 12 }}>
            <Space style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 12 }}>正在索引</Text><Text strong style={{ fontSize: 12 }}>{job.cur}</Text></Space>
            <Progress percent={job.total ? Math.round((job.done / job.total) * 100) : 0} status="active" size="small" />
          </div>
        )}
        {st?.chunkCount === 0 && !job?.running ? <Empty description="尚未建索引，点右上角「重建索引」" /> : (
          <>
            {docs.length > 4 && (
              <Input allowClear size="small" prefix={<SearchOutlined />} placeholder="筛选文档" value={docFilter}
                onChange={(e) => setDocFilter(e.target.value)} style={{ width: 220, marginBottom: 8 }} />
            )}
            <List size="small" dataSource={shownDocs} renderItem={(d: any) => (
              <List.Item>
                <Space>
                  <FileTextOutlined style={{ color: '#2f6bff' }} />
                  <Text>{d.file}</Text>
                  <Tag color="blue" style={{ marginRight: 0 }}>{d.chunkCount} 块</Tag>
                </Space>
              </List.Item>
            )} />
          </>
        )}
      </Card>

      {/* 语义检索 */}
      <Card size="small" title={<Space><ExperimentOutlined style={{ color: '#13c2c2' }} /><b>语义检索测试</b>{results.length ? <Badge count={results.length} color="#13c2c2" /> : null}</Space>}>
        <Input.Search enterButton={<><SearchOutlined /> 检索</>} loading={busy} value={searching}
          onChange={(e) => setSearching(e.target.value)} onSearch={doSearch} allowClear
          placeholder="输入问题，检索知识库，如：什么是注意力机制？vector 容器和数组区别" />
        {results.length > 0 && (
          <List style={{ marginTop: 12 }} itemLayout="vertical" dataSource={results} renderItem={(r: any, i: number) => {
            const score = Number(r.score) || 0;
            return (
              <List.Item key={i} style={{ padding: '10px 0' }}>
                <Space size={8} wrap style={{ marginBottom: 6 }}>
                  <Tag color="blue" icon={<FileTextOutlined />} style={{ marginRight: 0 }}>{r.file}</Tag>
                  <Tooltip title={`相关度 ${score}`}>
                    <Progress percent={Math.round((score / maxScore) * 100)} size="small" showInfo={false} style={{ width: 90 }} strokeColor={{ from: '#13c2c2', to: '#2f6bff' }} />
                  </Tooltip>
                  <Text type="secondary" style={{ fontSize: 12 }}>相关度 {score.toFixed ? score.toFixed(2) : score}</Text>
                  <Tag color="purple" style={{ marginRight: 0 }}>#{i + 1}</Tag>
                </Space>
                <Paragraph style={{ fontSize: 13, marginBottom: 0, color: '#333' }}>
                  <Highlight text={String(r.text || '').slice(0, 300)} q={searching} />
                </Paragraph>
              </List.Item>
            );
          }} />
        )}
        {!results.length && searching && !busy && <Empty style={{ padding: 20 }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配结果" />}
      </Card>
    </Space>
  );
}

