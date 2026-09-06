// AI 智能助手：既是通用问答/编程助手，也能通过工具执行运维动作。
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { Host, run, describeHost } from '../lib/host.js';
import { defaultProviders, chat, Provider } from '../lib/llm.js';
import { TOOLS } from '../modules/tools.js';
import { audit } from '../lib/audit.js';
import { enc, dec } from '../lib/secure.js';

const sysPrompt = `你是一个能力全面、善于深度思考的 AI 助手（运维 + 通用）。

【通用能力】你可以回答任何问题：编程/算法（含代码与解释）、计算机与运维知识、系统设计、Debug、写作、理论等。回答要准确、条理清晰、可用中文；写代码尽量完整可运行并附简要说明。例如用户问“C++ 实现 N 皇后”，你应直接给出高质量回溯实现+分析，不要调用任何工具。

【运维工具】当且仅当用户需要你在“实际机器上操作”（查看/安装/更新组件、管理服务/进程/中间件、查 docker/k8s、探测状态）时，你才需要使用工具：
在回复中严格输出如下格式的独立一行（只输出一次，可结合自然语言，系统会自动执行并把结果返回给你）：
[CALL]{"host":"<hostId或local>","command":"<bash命令>","reason":"<为什么执行>"}[/CALL]
命令须单条自包含 bash；危险命令(rm -rf /, mkfs, :(){})会被拒绝。执行前先解释计划，执行后据返回继续。
注意：这条 [CALL] 标记不会显示给用户，它会自动执行；执行结果会以“[工具返回]”形式回到你的上下文。请基于真实返回继续回答，不要编造输出。

判断规则：纯问答/纯给代码 -> 不调工具直接答；要实际改机器/查机器实况 -> 说明后调工具。`;

// 流式文本过滤器：把 [CALL]...[/CALL] 段从“发给前端展示的文本”中剥离，
// 避免用户看到原始 JSON 标记（乱码）。模型可能逐字/逐小段输出，标记会跨 chunk，
// 因此用“保留尾部少量字符作为可能的前缀缓冲”的状态机处理。
// 返回 { push(d), flush() }：flush 在整段流结束后调用，吐出末尾滞留的正常文本。
function makeStripFilter(onClean: (t: string) => void) {
  let buf = '';        // 未决策缓冲
  let inside = false;  // 是否正处于 [CALL]...[/CALL] 内
  return {
    push(d: string) {
      buf += d;
      for (;;) {
        if (!inside) {
          const i = buf.indexOf('[CALL]');
          if (i >= 0) {
            if (i > 0) onClean(buf.slice(0, i));   // 标记前正常文本
            buf = buf.slice(i + 6);
            inside = true;
            continue;
          }
          // 无完整标记：输出除末尾 5 字符外的部分（末尾可能是跨 chunk 的 [CALL] 前缀）
          if (buf.length > 5) { onClean(buf.slice(0, buf.length - 5)); buf = buf.slice(-5); }
          break;
        } else {
          const j = buf.indexOf('[/CALL]');
          if (j >= 0) { buf = buf.slice(j + 7); inside = false; continue; }
          // 仍在标记内：丢弃全部，仅保留末尾 6 字符以防 [/CALL] 跨 chunk
          if (buf.length > 6) buf = buf.slice(-6);
          break;
        }
      }
    },
    flush() {
      if (!inside && buf.length) { onClean(buf); buf = ''; }  // 流结束，剩余为正常文本
    },
  };
}

// 基于 SSE 的真实流式多步 agent 循环。
// onEvent: delta(干净文本) / tool(工具执行状态与结果) / done / err
async function runLoop(providers: Provider[], messages: any[], onEvent: (kind: string, data: any) => void, signal?: AbortSignal) {
  const msgs = [...messages];
  for (let step = 0; step < 5; step++) {
    let content = '';
    const strip = makeStripFilter((t) => onEvent('delta', t));
    await chat(providers[0], msgs, { stream: true, onDelta: (d) => { content += d; strip.push(d); }, signal });
    strip.flush();
    msgs.push({ role: 'assistant', content });
    const m = content.match(/\[CALL\]\s*(\{[\s\S]*?\})\s*\[\/CALL\]/);
    if (!m) break;
    let call: any; try { call = JSON.parse(m[1]); } catch { break; }
    if (/rm\s+-rf\s+\/|mkfs\.|:\(\)\s*\{|>\/dev\/sda/.test(call.command)) {
      onEvent('tool', { ok: false, error: '危险命令已拦截' });
      msgs.push({ role: 'user', content: '[系统] 命令被安全拦截。' });
      continue;
    }
    const hosts = store.list<Host>('hosts');
    const h = call.host === 'local' || !call.host ? { id: 'local', kind: 'local', name: '本机' } as Host : hosts.find((x) => x.id === call.host);
    if (!h) { onEvent('tool', { ok: false, error: `找不到主机 ${call.host}` }); break; }
    onEvent('tool', { running: true, reason: call.reason, host: describeHost(h), command: call.command });
    const r = await run(h, call.command, 120000);
    onEvent('tool', { ok: r.code === 0, code: r.code, stdout: r.stdout.slice(0, 4000), stderr: r.stderr.slice(0, 1500), host: h.name });
    msgs.push({ role: 'user', content: `[工具返回] 主机 ${h.name} 退出码 ${r.code}\nSTDOUT:\n${r.stdout.slice(0, 5000)}\nSTDERR:\n${r.stderr.slice(0, 1500)}` });
  }
  onEvent('done', {});
}

export async function register(fastify: FastifyInstance) {
  // 合并配置：默认预置(含 pi 注入 key) + 用户在页面保存的覆盖(model/baseURL/apiKey)
  function mergedProviders(): { def: Provider; apiKey: string }[] {
    const cfg = store.read<any>('ai', {});
    const ovs = cfg.providers || {};
    return defaultProviders().map((def) => {
      const ov = ovs[def.id] || {};
      return { def: { ...def, baseURL: ov.baseURL || def.baseURL, defaultModel: ov.model || def.defaultModel }, apiKey: dec(ov.apiKey) || ov.apiKey || def.apiKey };
    });
  }

  fastify.get('/ai/config', () => {
    const cfg = store.read<any>('ai', {});
    const defaults = mergedProviders();
    const defIds = new Set(defaults.map((x) => x.def.id));
    const providers: any[] = defaults.map(({ def, apiKey }) => ({
      id: def.id, name: def.name, baseURL: def.baseURL, defaultModel: def.defaultModel,
      models: def.models || [def.defaultModel], configured: !!apiKey,
    }));
    // 自定义提供商(不在预置列表,由用户在设置中新增)
    for (const [id, ovRaw] of Object.entries(cfg.providers || {})) {
      const ov: any = ovRaw;
      if (defIds.has(id) || !ov || typeof ov !== 'object') continue;
      if (!ov.baseURL) continue;
      const model = ov.model || 'default';
      providers.push({
        id, name: ov.name || id,
        baseURL: ov.baseURL, defaultModel: model,
        models: Array.isArray(ov.models) && ov.models.length ? ov.models : [model],
        configured: !!dec(ov.apiKey), custom: true,
      });
    }
    const selId = cfg.selected?.id;
    const selDef = providers.find((x) => x.id === selId);
    return {
      providers,
      selected: selDef
        ? { id: selDef.id, model: cfg.selected?.model || selDef.defaultModel, baseURL: selDef.baseURL, configured: selDef.configured, models: selDef.models || [] }
        : (providers[0] ? { id: providers[0].id, model: providers[0].defaultModel, baseURL: providers[0].baseURL, configured: providers[0].configured, models: providers[0].models || [] } : null),
      hosts: store.list<Host>('hosts').map((h) => ({ id: h.id, name: h.name, kind: h.kind })),
    };
  });

  fastify.put('/ai/config', (req, reply) => {
    const { providerId, name, model, baseURL, apiKey, models } = req.body as any;
    const id = String(providerId || '').trim();
    if (!id || /[^\w.:/-]/.test(id)) return reply.code(400).send({ error: '非法提供商 id' });
    const defaults = mergedProviders();
    const defIds = new Set(defaults.map((x) => x.def.id));
    const isCustom = !defIds.has(id);
    const cfg = store.read<any>('ai', {});
    cfg.providers = cfg.providers || {};
    const old = cfg.providers[id] || {};
    const ov: any = { ...old };
    if (model !== undefined) ov.model = model || undefined;
    if (baseURL !== undefined) ov.baseURL = String(baseURL || '').trim() || undefined;
    if (name !== undefined) ov.name = String(name || '').trim() || undefined;
    if (Array.isArray(models) && models.length) ov.models = models.map(String);
    if (apiKey && apiKey !== '***') ov.apiKey = enc(apiKey) as string;
    else if (apiKey === '') delete ov.apiKey;                 // 显式空串=清除 key
    if (isCustom && !ov.baseURL) return reply.code(400).send({ error: '自定义提供商必须填写 API 地址(baseURL)' });
    if (!ov.model && ov.models?.length) ov.model = ov.models[0];
    cfg.providers[id] = ov;
    cfg.selected = { id, model: ov.model || undefined };
    store.write('ai', cfg);
    audit('ai', 'config', isCustom ? `保存自定义提供商 ${name || id}` : `更新 ${id}`, 'web');
    return { ok: true };
  });

  fastify.delete('/ai/config/:id', (req, reply) => {
    const id = String((req.params as any).id || '');
    const cfg = store.read<any>('ai', {});
    const defaults = mergedProviders();
    if (defaults.some((x) => x.def.id === id)) {
      // 预置提供商:仅清除其覆盖配置
      if (cfg.providers) delete cfg.providers[id];
      if (cfg.selected?.id === id) cfg.selected = undefined;
      store.write('ai', cfg);
      return { ok: true, note: '预置提供商已重置为默认' };
    }
    if (cfg.providers) delete cfg.providers[id];
    if (cfg.selected?.id === id) cfg.selected = undefined;
    store.write('ai', cfg);
    audit('ai', 'config', `删除提供商 ${id}`, 'web');
    return { ok: true };
  });

  // 统一聊天处理：GET(query: message/code/history) 或 POST(body: {message, code, history})
  async function chatHandler(req: any, reply: any) {
    const q = (req.query || {}) as any;
    const b = (req.body || {}) as any;
    const message = String(q.message ?? b.message ?? '').trim();
    let history: any[] = Array.isArray(b.history) ? b.history : [];
    if (!history.length && q.history) { try { const h = JSON.parse(q.history); if (Array.isArray(h)) history = h; } catch { history = []; } }
    const codeMode = q.code ?? b.code;
    if (!message) {
      reply.header('content-type', 'text/event-stream; charset=utf-8');
      reply.raw.write('event: err\ndata: ' + JSON.stringify({ error: '消息不能为空' }) + '\n\n');
      reply.raw.end(); return;
    }
    const cfg = store.read<any>('ai', {});
    const merged = mergedProviders();
    const selId = cfg.selected?.id;
    let chosen = merged.find((x) => x.def.id === selId) || merged.find((x) => x.def.id === (q.model || '')) || merged[0];
    if (!chosen) {
      reply.header('content-type', 'text/event-stream; charset=utf-8');
      reply.raw.write('event: err\ndata: ' + JSON.stringify({ error: '无可用模型提供商' }) + '\n\n');
      reply.raw.end(); return;
    }
    const model = cfg.selected?.model || chosen.def.defaultModel;
    const p: Provider = { ...chosen.def, defaultModel: model, apiKey: chosen.apiKey };
    if (!p.apiKey) {
      reply.header('content-type', 'text/event-stream; charset=utf-8');
      reply.raw.write('event: err\ndata: ' + JSON.stringify({ error: '未配置 API Key。请在「AI 设置」为 ' + p.name + ' 填入 key。' }) + '\n\n');
      reply.raw.end(); return;
    }
    reply.header('content-type', 'text/event-stream; charset=utf-8');
    reply.header('cache-control', 'no-cache');
    reply.header('connection', 'keep-alive');
    const res = reply.raw;

    // 知识库检索（异步取一次即可）
    let kbCtx = '';
    try {
      if (cfg.kb !== false) {
        const { search } = await import('../modules/kb.js');
        const hits = search(codeMode ? (message + ' ' + String(codeMode).slice(0, 500)) : message, 6);
        if (hits.length) kbCtx = '\n\n[本地知识库检索结果，可据此回答/引用]\n' + hits.map((h: any) => `【${h.file}】…${h.text.slice(0, 700)}…`).join('\n');
      }
    } catch { /* kb 不可用则忽略 */ }

    // —— 多轮上下文：信任前端传来的 history，但做数量/长度防护 ——
    const cleanHist: any[] = [];
    for (const h of (history || []).slice(-24)) {          // 最多保留最近 24 条
      const role = h?.role === 'assistant' ? 'assistant' : 'user';
      const content = String(h?.content ?? '');
      if (!content.trim()) continue;
      cleanHist.push({ role, content: content.slice(0, 6000) });
    }
    const hostsInfo = store.list<Host>('hosts').map((h) => `${h.name}(${h.kind})${h.host ? '@' + h.host : ''} id=${h.id}`).join('\n');
    const toolsInfo = TOOLS.map((t) => `${t.name}(${t.id})`).join('、');
    let sys = sysPrompt + `\n\n当前可管理主机:\n${hostsInfo || '（无，请先添加主机）'}\n可探测工具: ${toolsInfo}` + kbCtx;
    if (codeMode) sys += '\n\n[用户正在编辑器里的代码，请结合它给出解释/修改建议/报错分析，可用 markdown]\n```\n' + String(codeMode).slice(0, 12000) + '\n```';
    const msgs: any[] = [{ role: 'system', content: sys }, ...cleanHist, { role: 'user', content: message }];

    const ac = new AbortController();
    req.raw.on('close', () => ac.abort());
    const send = (ev: string, data: any) => { if (!res.destroyed) res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); };
    // 心跳：避免长命令执行期间无数据流导致连接被判定中断
    const hb = setInterval(() => { if (!res.destroyed) res.write(': keepalive\n\n'); }, 10000);
    try {
      await runLoop([p], msgs, (kind, data) => send(kind, data), ac.signal);
    } catch (e: any) {
      send('err', { error: String(e?.message || e) });
    } finally {
      clearInterval(hb);
    }
    res.end();
  }

  fastify.get('/ai/chat', { schema: {} }, chatHandler);
  fastify.post('/ai/chat', { schema: {} }, chatHandler);
}
