import { useEffect, useRef, useState } from 'react';
import { Card, Input, Button, Space, Tag, App, Modal, Select, AutoComplete, Typography, Alert, Divider, Tooltip, Spin, Badge, Popconfirm } from 'antd';
import { SendOutlined, SettingOutlined, RobotOutlined, UserOutlined, WarningOutlined, DeleteOutlined } from '@ant-design/icons';
import { api } from '../api';
import Markdown from '../components/Markdown';

interface Msg { role: 'user' | 'ai'; text: string; tools?: any[]; error?: string; }

const SUGGEST = [
  '用 C++ 写一个 N 皇后解法',
  '解释一下 HTTPS 握手过程',
  '用 free -m 查看本机内存',
  '检查所有主机的磁盘占用',
  '帮我写个 bash 备份脚本',
  'K8s 里 Deployment 和 StatefulSet 区别',
];

export default function AIChat() {
  const [cfg, setCfg] = useState<any>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [fProv, setFProv] = useState('');
  const [fName, setFName] = useState('');
  const [fBase, setFBase] = useState('');
  const [fModel, setFModel] = useState('');
  const [fKey, setFKey] = useState('');
  const [fClearKey, setFClearKey] = useState(false);
  const [fAdd, setFAdd] = useState(false);
  const provSel = cfg?.providers?.find((p: any) => p.id === fProv);
  const { message } = App.useApp();
  const listRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState('');

  useEffect(() => { api.get('/ai/config').then((c) => { setCfg(c); const s = c.selected || c.providers?.[0]; if (s) { setFProv(s.id); setFModel(s.model || s.defaultModel || ''); setFBase(s.baseURL || ''); setFName(s.name || ''); } }); }, []);

  const send = async (text: string) => {
    const t = text.trim(); if (!t || busy) return;
    // 把已展示的对话转成可发给后端的多轮上下文(history)。
    // 注意顺序:用户消息 -> assistant 文本 -> 该轮的每个工具返回(作为 user 消息,模拟后端内部[工具返回])。
    const hist: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const m of msgs) {
      if (m.role === 'user') { hist.push({ role: 'user', content: m.text }); continue; }
      if (m.text) hist.push({ role: 'assistant', content: m.text });
      for (const tk of (m.tools || [])) {
        if (!tk || tk.running) continue;
        const part: string[] = [];
        if (tk.ok !== undefined) part.push(`[工具执行${tk.ok ? '成功' : '失败'} 主机=${tk.host || '-'} 退出码=${tk.code ?? '?'}]`);
        if (tk.stdout) part.push('STDOUT:\n' + String(tk.stdout).slice(0, 3000));
        if (tk.stderr) part.push('STDERR:\n' + String(tk.stderr).slice(0, 1500));
        if (tk.error) part.push('错误: ' + tk.error);
        if (part.length) hist.push({ role: 'user', content: part.join('\n') });
      }
    }
    const newMsgs: Msg[] = [...msgs, { role: 'user', text: t }, { role: 'ai', text: '', tools: [] }];
    setMsgs(newMsgs); setInput(''); setBusy(true);
    const ai = newMsgs[newMsgs.length - 1];
    const handle = (block: string) => {
      let ev = 'message'; const datas: string[] = [];
      for (const raw of block.split('\n')) {
        if (raw.startsWith('event:')) ev = raw.slice(6).trim();
        else if (raw.startsWith('data:')) datas.push(raw.slice(5).trim());
        // 以 ':' 开头的行为心跳注释，忽略
      }
      if (!datas.length) return;
      const payload = datas.join('\n');
      try {
        if (ev === 'delta') { let s = payload; try { s = JSON.parse(payload); } catch { s = payload; } ai.text += typeof s === 'string' ? s : JSON.stringify(s); setMsgs([...newMsgs]); }
        else if (ev === 'tool') { ai.tools!.push(JSON.parse(payload)); setMsgs([...newMsgs]); }
        else if (ev === 'err') { const d = JSON.parse(payload); ai.error = d?.error || 'AI 服务返回错误'; setBusy(false); setMsgs([...newMsgs]); }
        else if (ev === 'done') { setBusy(false); setMsgs([...newMsgs]); }
      } catch { /* ignore 单个坏帧 */ }
    };
    try {
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: t, history: hist }),
      });
      if (!resp.ok || !resp.body) throw new Error('请求失败 HTTP ' + resp.status);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); if (block.trim()) handle(block); }
      }
      if (buf.trim()) handle(buf);
    } catch (e: any) {
      if (!ai.error) { ai.error = '与 AI 的连接失败：' + (e?.message || e) + '。请到「AI 设置」检查模型与 Key 后重试。'; setMsgs([...newMsgs]); }
    } finally {
      setBusy(false);
    }
  };

  const saveCfg = async () => {
    try {
      const list = cfg?.providers || [];
      const isAdd = fAdd;
      // 新增自定义:从名称生成合法 id(如 custom-mylocal)
      let provId = fProv;
      let display = '';
      if (isAdd) {
        const slug = (fName || 'custom').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom';
        provId = slug.startsWith('custom') ? slug : 'custom-' + slug;
        display = fName.trim() || provId;
        if (!fBase.trim()) { message.warning('请填写 API 地址(baseURL)'); return; }
        if (!fModel.trim()) { message.warning('请填写模型 ID'); return; }
      } else {
        const prov = list.find((p: any) => p.id === provId);
        display = prov?.name || provId;
        if (!fBase.trim()) { message.warning('API 地址不能为空'); return; }
      }
      // key 语义:填了新 key→覆盖;勾选清除→清空;否则保留
      const keyPayload = fKey ? fKey : (fClearKey ? '' : '***');
      await api.put('/ai/config', {
        providerId: provId, name: isAdd ? display : undefined,
        model: fModel.trim(), baseURL: fBase.trim(), apiKey: keyPayload,
        models: isAdd ? [fModel.trim()] : undefined,
      });
      message.success('已保存并切换到 ' + display);
      setCfgOpen(false); setFKey(''); setFClearKey(false); setFAdd(false);
      const c = await api.get('/ai/config'); setCfg(c);
      const sel = c.selected || c.providers?.[0];
      if (sel) { setFProv(sel.id); setFModel(sel.model || sel.defaultModel || ''); setFBase(sel.baseURL || ''); setFName(sel.name || ''); }
    } catch (e: any) { message.error('保存失败: ' + (e?.message || e)); }
  };

  const delProvider = async (id: string) => {
    try {
      await api.del('/ai/config/' + encodeURIComponent(id));
      message.success('已删除');
      const c = await api.get('/ai/config'); setCfg(c);
      const s = c.selected || c.providers?.[0];
      if (s) { setFProv(s.id); setFModel(s.model || s.defaultModel || ''); setFBase(s.baseURL || ''); setFName(s.name || ''); }
    } catch (e: any) { message.error(String(e?.message || e)); }
  };

  const pickProv = (v: string) => {
    if (v === '__add') { setFAdd(true); setFProv('__add'); setFName(''); setFBase(''); setFModel(''); return; }
    setFAdd(false); setFProv(v);
    const p = cfg?.providers?.find((x: any) => x.id === v);
    if (p) { setFModel(p.defaultModel || p.models?.[0] || ''); setFBase(p.baseURL || ''); setFName(p.name || ''); }
  };

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)' }}>
      <Card size="small" style={{ flex: 1, display: 'flex', flexDirection: 'column' }} styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%', padding: 12 } }}>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Tag color="purple" icon={<RobotOutlined />}>AI 运维助手</Tag>
            {cfg?.selected && <Tag>模型: {cfg.providers?.find((p: any) => p.id === cfg.selected.id)?.name} / {cfg.selected.model}</Tag>}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>既是通用问答/编程助手（可问算法、K8s/Docker 原理等），需要时也会在主机上执行运维动作</Typography.Text>
          </Space>
          <Space>
            {msgs.length > 0 && <Button size="small" icon={<DeleteOutlined />} onClick={() => { setMsgs([]); message.info('已清空对话(上下文重置)'); }}>清空</Button>}
            <Button size="small" icon={<SettingOutlined />} onClick={() => setCfgOpen(true)}>AI 设置</Button>
          </Space>
        </div>
        <Divider style={{ margin: '6px 0 10px' }} />
        <div ref={listRef} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {msgs.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', color: '#888' }}>
              <RobotOutlined style={{ fontSize: 48, color: '#4f8cff' }} />
              <h3>智能运维助手</h3>
              <Space wrap style={{ justifyContent: 'center' }}>{SUGGEST.map((s) => <Button key={s} onClick={() => send(s)}>{s}</Button>)}</Space>
            </div>
          )}
          {msgs.map((m, i) => m.role === 'user' ? (
            <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '72%' }}><div style={{ background: '#4f8cff', color: '#fff', padding: '8px 12px', borderRadius: 12, borderBottomRightRadius: 2 }}>{m.text}</div></div>
          ) : (
            <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '85%', display: 'flex', gap: 8 }}>
              <RobotOutlined style={{ marginTop: 6, color: '#b37feb' }} />
              <div style={{ width: '100%' }}>
                {m.error && <Alert type="error" showIcon message={m.error} />}
                <div style={{ background: '#ffffff', border: '1px solid #e5e6eb', padding: '10px 14px', borderRadius: 12, width: '100%' }}>{m.text ? <Markdown text={m.text} /> : (m.tools?.length ? '' : <Spin size="small" />)}</div>
                {m.tools?.map((t: any, j: number) => (
                  <Card key={j} size="small" style={{ marginTop: 8 }} styles={{ body: { padding: 8 } }}>
                    <Space size={4} wrap>
                      {t.running ? <Tag color="processing">正在执行</Tag> : <Tag color={t.ok ? 'green' : 'red'}>{t.ok ? '✓ 执行成功' : '✗ 失败'}</Tag>}
                      {t.host && <Tag>{t.host}</Tag>}
                    </Space>
                    {t.command && <pre style={{ background: '#f6f8fa', padding: 6, borderRadius: 6, margin: '6px 0', fontSize: 12, overflow: 'auto' }}>$ {t.command}</pre>}
                    {t.reason && <Typography.Text type="secondary" style={{ fontSize: 12 }}>原因: {t.reason}</Typography.Text>}
                    {t.running && <Typography.Text type="secondary" style={{ fontSize: 12 }}>执行中…</Typography.Text>}
                    {!t.running && !t.stdout && !t.error && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.ok ? '✓ 命令已执行（无输出，退出码 ' + (t.code ?? 0) + '）' : '（无输出，退出码 ' + (t.code ?? '?') + '）'}</Typography.Text>}
                    {t.stdout && <pre style={{ background: '#f6f8fa', padding: 6, borderRadius: 6, fontSize: 11, maxHeight: 200, overflow: 'auto', margin: 0 }}>{t.stdout}</pre>}
                    {t.error && <Alert type="error" message={t.error} style={{ marginTop: 4 }} />}
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Divider style={{ margin: '10px 0 8px' }} />
        <Space.Compact style={{ width: '100%' }}>
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} value={input} placeholder={cfg?.selected?.configured ? '描述你要做的运维操作，如：在本机安装 nginx 并启动...' : '当前模型未配置 Key，请先点「AI 设置」配置后再对话'} disabled={!cfg?.selected?.configured || busy} onChange={(e) => setInput(e.target.value)} onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); send(input); } }} />
          <Button type="primary" icon={<SendOutlined />} loading={busy} disabled={!cfg?.selected?.configured} onClick={() => send(input)}>发送</Button>
        </Space.Compact>
      </Card>

      <Modal title={fAdd ? '新增自定义提供商' : 'AI 提供商设置'} open={cfgOpen} onCancel={() => { setCfgOpen(false); setFAdd(false); setFKey(''); setFClearKey(false); }} onOk={saveCfg} okText={fAdd ? '添加并切换' : '保存'} width={560} footer={null}>
        {cfg && (<div style={{ display: 'grid', gap: 12 }}>
          <Alert type={fAdd ? 'warning' : 'info'} showIcon style={{ marginBottom: 4 }} message={fAdd
            ? '自定义提供商:填名称 + OpenAI 兼容 API 地址 + 模型 + Key(可留空,按地址鉴权需填)。例如本地服务 http://127.0.0.1:3080/v1。'
            : '预置已自动读取 pi 中的 Key。可编辑 API 地址指向自定义/本地端点,并手动填 Key。' + (provSel?.configured ? ' 当前已配置 Key。' : '')} />
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center', gap: 6 }}>
            <Typography.Text>{fAdd ? '名称' : '提供商'}</Typography.Text>
            {fAdd
              ? <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="如: 我的本地模型" />
              : <Select style={{ width: '100%' }} value={fProv} onChange={pickProv} options={[
                  ...(cfg.providers || []).map((p: any) => ({ value: p.id, label: `${p.name}${p.custom ? ' (自定义)' : ''} ${p.configured ? '·已配Key' : ''}` })),
                  { value: '__add', label: '➕ 新增自定义提供商' },
                ]} />}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center', gap: 6 }}>
            <Typography.Text>API 地址(baseURL)</Typography.Text>
            <Input value={fBase} onChange={(e) => setFBase(e.target.value)} placeholder="https://api.openai.com/v1 或 http://127.0.0.1:3080/v1" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center', gap: 6 }}>
            <Typography.Text>模型 ID</Typography.Text>
            <AutoComplete value={fModel} onChange={setFModel} style={{ width: '100%' }}
              options={fAdd ? undefined : ((cfg.providers.find((p: any) => p.id === fProv)?.models || [fModel]).map((m: string) => ({ value: m })))}
              placeholder="如 deepseek-chat / gpt-4o-mini" filterOption={(v: any, o: any) => o?.value ? String(o.value).toLowerCase().includes(String(v).toLowerCase()) : false} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center', gap: 6 }}>
            <Typography.Text>API Key{provSel?.configured && !fAdd ? <Typography.Text type="secondary" style={{ fontSize: 11 }}> (已配置)</Typography.Text> : null}</Typography.Text>
            <Space.Compact style={{ width: '100%' }}>
              <Input.Password value={fKey} onChange={(e) => setFKey(e.target.value)} placeholder={fClearKey ? '将清除已保存 Key' : (provSel?.configured ? '留空 = 保留已配置 Key' : 'sk-…(可留空,若该地址无需鉴权)' )} />
              {provSel?.configured && !fAdd && <Button onClick={() => { setFClearKey(!fClearKey); setFKey(''); }} type={fClearKey ? 'primary' : 'default'} danger={fClearKey}>{fClearKey ? '取消清除' : '清除 Key'}</Button>}
            </Space.Compact>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <Space>
              <Button type="primary" onClick={saveCfg}>{fAdd ? '添加并切换' : '保存'}</Button>
              <Button onClick={() => { setCfgOpen(false); setFAdd(false); }}>取消</Button>
            </Space>
            {!fAdd && provSel?.custom && <Popconfirm title="删除该自定义提供商?" onConfirm={() => delProvider(fProv)}><Button danger size="small">删除</Button></Popconfirm>}
          </div>
        </div>)}
      </Modal>
    </div>
  );
}
