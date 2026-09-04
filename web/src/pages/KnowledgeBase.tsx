import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Button, Space, Input, Tag, List, Alert, Switch, Spin, Empty, Divider, App } from 'antd';
import { ReloadOutlined, DatabaseOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { api } from '../api';

export default function KnowledgeBase() {
  const [st, setSt] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [searching, setSearching] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const { message } = App.useApp();

  const load = async () => { const s = await api.get('/kb/status'); setSt(s); setDocs(await api.get('/kb/docs')); const k = await api.get('/kb/settings'); setEnabled(k.enabled !== false); };
  useEffect(() => { load(); const t = setInterval(async () => { const s = await api.get('/kb/status'); setSt(s); if (!s.job?.running) clearInterval(t); }, 1500); return () => clearInterval(t); }, []);

  const rebuild = async () => { await api.post('/kb/rebuild'); message.success('开始重建索引（后台进行，可关闭本页）'); load(); };
  const toggle = async (v: boolean) => { setEnabled(v); await api.put('/kb/settings', { enabled: v }); message.success(v ? '已开启 AI 知识库检索' : '已关闭 AI 知识库检索'); };
  const doSearch = async () => { setBusy(true); const r = await api.get('/kb/search', { q: searching, top: 10 }); setResults(r.results || []); setBusy(false); };

  return (
    <div>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="本地知识库 (RAG)" description="扫描桌面 knowledge 目录(支持 PDF/txt/md)，抽取文本切块建立中文可检索索引。AI 智能运维与代码助手会自动引用检索结果回答。" />
      <Row gutter={[16, 16]}>
        <Col span={6}><Card><Statistic title="文档数" value={docs.length} /></Card></Col>
        <Col span={6}><Card><Statistic title="文本块" value={st?.chunkCount || 0} /></Card></Col>
        <Col span={6}><Card><Statistic title="索引词条" value={st?.tokenCount || 0} /></Card></Col>
        <Col span={6}><Card><Statistic title="知识库目录" value={st?.path || '-'} valueStyle={{ fontSize: 12 }} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginTop: 12 }} title="索引管理" extra={
        <Space><Switch checkedChildren="AI启用知识库" unCheckedChildren="AI停用知识库" checked={enabled} onChange={toggle} /><Button type="primary" icon={<ThunderboltOutlined />} loading={st?.job?.running} onClick={rebuild}>{st?.job?.running ? `索引中 ${st.job.done}/${st.job.total}: ${st.job.cur}` : '重建索引'}</Button></Space>
      }>
        {st?.chunkCount === 0 ? <Empty description="尚未建索引，点「重建索引」" /> : (
          <List size="small" dataSource={docs} renderItem={(d: any) => (
            <List.Item><Space><DatabaseOutlined /><span>{d.file}</span><Tag>{d.chunkCount} 块</Tag></Space></List.Item>
          )} />
        )}
      </Card>

      <Card size="small" style={{ marginTop: 12 }} title="语义检索测试">
        <Input.Search enterButton loading={busy} value={searching} onChange={(e) => setSearching(e.target.value)} onSearch={doSearch} placeholder="输入问题，检索知识库，如：什么是注意力机制？vector 容器和数组区别" />
        <List style={{ marginTop: 10 }} size="small" dataSource={results} renderItem={(r: any) => (
          <List.Item><div>
            <Space size={6}><Tag color="blue">{r.file}</Tag><Tag>{r.score}</Tag></Space>
            <div style={{ fontSize: 12, color: '#333' }}>{r.text.slice(0, 220)}</div>
          </div></List.Item>
        )} />
      </Card>
    </div>
  );
}
