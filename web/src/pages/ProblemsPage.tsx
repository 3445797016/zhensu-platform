import { useEffect, useMemo, useState } from 'react';
import { Table, Input, Select, Space, Tag, Button, Card, Typography, Tooltip } from 'antd';
import { BookOutlined, SearchOutlined, CodeOutlined, FieldTimeOutlined, DatabaseOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const DIFF_COLOR: Record<string, string> = { 简单: 'green', 中等: 'orange', 困难: 'red' };

export default function ProblemsPage() {
  const nav = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [byCat, setByCat] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [kw, setKw] = useState('');
  const [cat, setCat] = useState('全部');
  const [diff, setDiff] = useState('全部');

  useEffect(() => {
    api.get('/problems').then((r) => {
      setList(r.problems || []);
      setByCat(r.byCategory || {});
      setTotal(r.total || 0);
    }).catch(() => setList([])).finally(() => setLoading(false));
  }, []);

  const cats = useMemo(() => Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]), [byCat]);

  const data = useMemo(() => list.filter((p) => {
    if (cat !== '全部' && p.category !== cat) return false;
    if (diff !== '全部' && p.difficulty !== diff) return false;
    if (kw) {
      const t = `${p.title} ${p.no} ${p.category} ${(p.tags || []).join(' ')}`.toLowerCase();
      if (!t.includes(kw.toLowerCase())) return false;
    }
    return true;
  }), [list, cat, diff, kw]);

  const columns = [
    { title: '#', width: 64, render: (_: any, r: any) => <span style={{ color: '#aaa' }}>{r.no || '—'}</span> },
    {
      title: '题目', render: (_: any, r: any) => (
        <a onClick={() => nav(`/solve/${r.id}`)} style={{ fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          <CodeOutlined style={{ marginRight: 6, color: '#1677ff' }} />{r.title}
        </a>
      ),
    },
    { title: '分类', width: 110, render: (_: any, r: any) => <Tag color="geekblue">{r.category}</Tag> },
    { title: '难度', width: 90, render: (_: any, r: any) => <Tag color={DIFF_COLOR[r.difficulty] || 'default'}>{r.difficulty}</Tag> },
    { title: '标签', width: 220, render: (_: any, r: any) => <Space size={4} wrap>{(r.tags || []).map((t: string) => <Tag key={t} style={{ marginInlineEnd: 0 }}>{t}</Tag>)}</Space> },
    {
      title: '复杂度', width: 170, render: (_: any, r: any) => (
        <Space size={6} style={{ fontSize: 12, color: '#888' }}>
          <Tooltip title="时间复杂度"><span><FieldTimeOutlined /> {r.time}</span></Tooltip>
          <Tooltip title="空间复杂度"><span><DatabaseOutlined /> {r.space}</span></Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card size="small" title={
        <Space><BookOutlined style={{ color: '#1677ff' }} /><b>算法题库</b>
          <Tag color="blue">{total} 题</Tag><Tag>{cats.length} 类算法</Tag>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>点击题目进入解题页(力扣式界面) · 数据资源 problems/ 可扩展</Typography.Text>
        </Space>
      } styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '10px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #f0f0f0' }}>
          <Input allowClear prefix={<SearchOutlined />} placeholder="搜索题名 / 题号 / 标签" value={kw} onChange={(e) => setKw(e.target.value)} style={{ width: 260 }} />
          <Select style={{ width: 170 }} value={cat} onChange={setCat} options={[{ value: '全部', label: '全部分类' }, ...cats.map((c) => ({ value: c, label: `${c} (${byCat[c]})` }))]} />
          <Select style={{ width: 130 }} value={diff} onChange={setDiff} options={['全部', '简单', '中等', '困难'].map((d) => ({ value: d, label: d === '全部' ? '全部难度' : d }))} />
          <div style={{ marginLeft: 'auto' }}>
            <Button type="primary" icon={<CodeOutlined />} onClick={() => nav('/code')}>去在线编程练手</Button>
          </div>
        </div>
        <Table
          rowKey="id" size="middle" loading={loading}
          dataSource={data} columns={columns as any} pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 题` }}
          onRow={(r) => ({ onClick: () => nav(`/solve/${r.id}`), style: { cursor: 'pointer' } })}
        />
      </Card>
    </div>
  );
}
