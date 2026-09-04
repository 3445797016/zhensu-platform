import { useEffect, useRef, useState } from 'react';
import { Button, Space, Input, Tag, Alert, Spin, Typography } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import Markdown from './Markdown';

interface Msg { role: 'user' | 'ai'; text: string; error?: string; }

const QUICK = ['解释这段代码', '帮我找 Bug 并修复', '给代码加详细中文注释', '用别的语言重写并保持逻辑'];

export default function CodeAssistant({ code, language }: { code: string; language: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef(code);
  codeRef.current = code;
  const langRef = useRef(language);
  langRef.current = language;

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);

  const send = async (text: string) => {
    const t = text.trim(); if (!t || busy) return;
    const arr: Msg[] = [...msgs, { role: 'user', text: t }, { role: 'ai', text: '' }];
    setMsgs(arr); setInput(''); setBusy(true);
    const ai = arr[arr.length - 1];
    const handle = (block: string) => {
      let ev = 'message'; const data: string[] = [];
      for (const raw of block.split('\n')) {
        if (raw.startsWith('event:')) ev = raw.slice(6).trim();
        else if (raw.startsWith('data:')) data.push(raw.slice(5).trim());
      }
      if (!data.length) return;
      const payload = data.join('\n');
      try {
        if (ev === 'delta') { let s: any = payload; try { s = JSON.parse(payload); } catch { s = payload; } ai.text += typeof s === 'string' ? s : JSON.stringify(s); setMsgs([...arr]); }
        else if (ev === 'err') { try { const d = JSON.parse(payload); ai.error = d?.error || 'AI 服务错误'; } catch { ai.error = 'AI 服务错误'; } setBusy(false); setMsgs([...arr]); }
        else if (ev === 'done') { setBusy(false); setMsgs([...arr]); }
      } catch { /* ignore */ }
    };
    try {
      const intro = `当前语言 ${langRef.current}。请针对我编辑器里的代码${t}。`;
      const resp = await fetch('/api/ai/chat?message=' + encodeURIComponent(intro) + '&code=' + encodeURIComponent(codeRef.current));
      if (!resp.body) throw new Error('无响应');
      const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const b = buf.slice(0, i); buf = buf.slice(i + 2); if (b.trim()) handle(b); } }
      if (buf.trim()) handle(buf);
    } catch (e: any) {
      if (!ai.error) { ai.error = '连接失败：' + (e?.message || e); setMsgs([...arr]); }
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 8 }}>
        <Tag color="purple" icon={<RobotOutlined />}>代码助手</Tag>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>自动附带当前编辑器代码 + 本地知识库(RAG)</Typography.Text>
      </div>
      <Space size={6} wrap style={{ marginBottom: 8 }}>
        {QUICK.map((q) => <Button key={q} size="small" disabled={busy} onClick={() => send(q)}>{q}</Button>)}
      </Space>
      <div ref={listRef} style={{ flex: 1, overflow: 'auto', border: '1px solid #e5e6eb', borderRadius: 8, padding: 8, background: '#fff' }}>
        {msgs.length === 0 && <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>询问任意编程问题，或点上方快捷按钮。回答会基于你编辑器里的代码。</Typography.Paragraph>}
        {msgs.map((m, i) => m.role === 'user' ? (
          <div key={i} style={{ textAlign: 'right', marginBottom: 8 }}>
            <span style={{ display: 'inline-block', background: '#e6f0ff', color: '#1f2328', padding: '5px 10px', borderRadius: 10, fontSize: 13, maxWidth: '95%' }}>{m.text}</span>
          </div>
        ) : (
          <div key={i} style={{ marginBottom: 8 }}>
            {m.error && <Alert type="error" showIcon message={m.error} />}
            <div style={{ fontSize: 13 }}>{m.text ? <Markdown text={m.text} /> : (busy ? <Spin size="small" /> : null)}</div>
          </div>
        ))}
      </div>
      <Space.Compact style={{ marginTop: 8, width: '100%' }}>
        <Input placeholder="问代码相关问题..." value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
          onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); send(input); } }} />
        <Button type="primary" icon={<SendOutlined />} loading={busy} disabled={!code.trim()} onClick={() => send(input)}>发送</Button>
      </Space.Compact>
    </div>
  );
}
