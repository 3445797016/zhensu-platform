// AI 智能助手：既是通用问答/编程助手，也能通过工具执行运维动作。
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { Host, run, describeHost } from '../lib/host.js';
import { defaultProviders, chat, Provider } from '../lib/llm.js';
import { TOOLS } from '../modules/tools.js';

const sysPrompt = `你是一个能力全面、善于深度思考的 AI 助手（运维 + 通用）。

【通用能力】你可以回答任何问题：编程/算法（含代码与解释）、计算机与运维知识、系统设计、Debug、写作、理论等。回答要准确、条理清晰、可用中文；写代码尽量完整可运行并附简要说明。例如用户问“C++ 实现 N 皇后”，你应直接给出高质量回溯实现+分析，不要调用任何工具。

【运维工具】当且仅当用户需要你在“实际机器上操作”（查看/安装/更新组件、管理服务/进程/中间件、查 docker/k8s、探测状态）时，你才需要使用工具：
在回复中严格输出如下格式的独立一行（只输出一次，可结合自然语言）：
[CALL]{"host":"<hostId或local>","command":"<bash命令>","reason":"<为什么执行>"}[/CALL]
命令须单条自包含 bash；危险命令(rm -rf /, mkfs, :(){})会被拒绝。执行前先解释计划，执行后据返回继续。

判断规则：纯问答/纯给代码 -> 不调工具直接答；要实际改机器/查机器实况 -> 说明后调工具。`;

function saveSelected(p: Provider) {
  store.write('ai', { ...store.read('ai', {}), selected: { id: p.id, model: p.defaultModel, baseURL: p.baseURL } });
}

function masked(p: Provider) { return { ...p, apiKey: p.apiKey ? '***' : '' }; }

// 基于 SSE 的真实流式多步 agent 循环
async function runLoop(providers: Provider[], messages: any[], onEvent: (kind: string, data: any) => void, signal?: AbortSignal) {
  const msgs = [...messages];
  for (let step = 0; step < 5; step++) {
    let content = '';
    await chat(providers[0], msgs, { stream: true, onDelta: (d) => { content += d; onEvent('delta', d); }, signal });
    msgs.push({ role: 'assistant', content });
    const m = content.match(/\[CALL\](\{[\s\S]*?\})\[\/CALL\]/);
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
      return { def: { ...def, baseURL: ov.baseURL || def.baseURL, defaultModel: ov.model || def.defaultModel }, apiKey: ov.apiKey || def.apiKey };
    });
  }

  fastify.get('/ai/config', () => {
    const cfg = store.read<any>('ai', {});
    const providers = mergedProviders().map(({ def, apiKey }) => ({
      id: def.id, name: def.name, baseURL: def.baseURL, defaultModel: def.defaultModel,
      models: def.models || [def.defaultModel], configured: !!apiKey,
    }));
    const selId = cfg.selected?.id;
    const selDef = mergedProviders().find((x) => x.def.id === selId);
    return {
      providers,
      selected: selDef
        ? { id: selDef.def.id, model: cfg.selected?.model || selDef.def.defaultModel, baseURL: selDef.def.baseURL, configured: !!selDef.apiKey, models: selDef.def.models || [] }
        : (providers[0] ? { id: providers[0].id, model: providers[0].defaultModel, baseURL: providers[0].baseURL, configured: providers[0].configured, models: providers[0].models || [] } : null),
      hosts: store.list<Host>('hosts').map((h) => ({ id: h.id, name: h.name, kind: h.kind })),
    };
  });

  fastify.put('/ai/config', (req, reply) => {
    const { providerId, model, baseURL, apiKey } = req.body as any;
    const all = mergedProviders();
    const found = all.find((x) => x.def.id === providerId);
    if (!found) return reply.code(400).send({ error: '未知提供商' });
    const cfg = store.read<any>('ai', {});
    cfg.providers = cfg.providers || {};
    const ov = { ...(cfg.providers[providerId] || {}), model: model || undefined, baseURL: baseURL || undefined };
    if (apiKey && apiKey !== '***') ov.apiKey = apiKey;   // '***' 表示保留原 key
    else if (!apiKey) delete ov.apiKey;                    // 空则不写 key
    cfg.providers[providerId] = ov;
    cfg.selected = { id: providerId, model: model || undefined };
    store.write('ai', cfg);
    return { ok: true };
  });

  fastify.get('/ai/chat', { schema: {} }, async (req, reply) => {
    const q = req.query as any;
    const message = String(q.message || '');
    const cfg = store.read<any>('ai', {});
    const merged = mergedProviders();
    // 选择当前 provider：默认取已保存 selected
    const selId = cfg.selected?.id;
    let chosen = merged.find((x) => x.def.id === selId) || merged.find((x) => x.def.id === (q.model || '')) || merged[0];
    if (!chosen) {
      reply.header('content-type', 'text/event-stream; charset=utf-8');
      reply.raw.write('event: err\ndata: ' + JSON.stringify({ error: '无可用模型提供商' }) + '\n\n');
      reply.raw.end();
      return;
    }
    const model = cfg.selected?.model || chosen.def.defaultModel;
    const p: Provider = { ...chosen.def, defaultModel: model, apiKey: chosen.apiKey };
    if (!p.apiKey) {
      reply.header('content-type', 'text/event-stream; charset=utf-8');
      reply.raw.write('event: err\ndata: ' + JSON.stringify({ error: '未配置 API Key。请在「AI 设置」为 ' + p.name + ' 填入 key。' }) + '\n\n');
      reply.raw.end();
      return;
    }
    reply.header('content-type', 'text/event-stream; charset=utf-8');
    reply.header('cache-control', 'no-cache');
    reply.header('connection', 'keep-alive');
    const res = reply.raw;
    const hostsInfo = store.list<Host>('hosts').map((h) => `${h.name}(${h.kind})${h.host ? '@' + h.host : ''} id=${h.id}`).join('\n');
    const toolsInfo = TOOLS.map((t) => `${t.name}(${t.id})`).join('、');
    const codeMode = (q as any).code;   // 在线编程助手传入当前代码
    // RAG：本地知识库检索（未禁用且索引非空时）
    let kbCtx = '';
    try {
      if (store.read<any>('ai', {}).kb !== false) {
        const { search } = await import('../modules/kb.js');
        const hits = search(codeMode ? (message + ' ' + codeMode.slice(0, 500)) : message, 6);
        if (hits.length) {
          kbCtx = '\n\n[本地知识库检索结果，可据此回答/引用]\n' + hits.map((h) => `【${h.file}】…${h.text.slice(0, 700)}…`).join('\n');
        }
      }
    } catch { /* kb 不可用则忽略 */ }
    let sys = sysPrompt + `\n\n当前可管理主机:\n${hostsInfo || '（无，请先添加主机）'}\n可探测工具: ${toolsInfo}` + kbCtx;
    if (codeMode) sys += '\n\n[用户正在编辑器里的代码，请结合它给出解释/修改建议/报错分析，可用 markdown]\n```\n' + codeMode.slice(0, 12000) + '\n```';
    const msgs: any[] = [
      { role: 'system', content: sys },
      { role: 'user', content: message },
    ];
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
  });
}
