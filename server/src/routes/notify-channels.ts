// 通知通道管理: Telegram / 钉钉 / 企业微信 Webhook
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';

const CFG = 'notify-channels.json';

interface Channel {
  id: string;
  name: string;
  type: 'telegram' | 'dingtalk' | 'wecom' | 'webhook';
  config: Record<string, string>; // botToken/chatId/webhookUrl 等
  enabled: boolean;
}

function getChannels(): Channel[] {
  return store.read<Channel[]>(CFG, []);
}

function saveChannels(ch: Channel[]) { store.write(CFG, ch); }

// 发送单条消息
async function sendMsg(ch: Channel, title: string, body: string): Promise<string | null> {
  try {
    if (ch.type === 'telegram') {
      const { botToken, chatId } = ch.config;
      const text = `*${title}*\n${body}`;
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      });
      const j = await res.json() as any;
      return j.ok ? null : (j.description || 'Telegram 发送失败');
    }

    if (ch.type === 'dingtalk') {
      const url = ch.config.webhookUrl;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: { title, text: `# ${title}\n\n${body}` },
        }),
      });
      const j = await res.json() as any;
      return j.errcode === 0 ? null : (j.errmsg || '钉钉发送失败');
    }

    if (ch.type === 'wecom') {
      const url = ch.config.webhookUrl;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: { content: `# ${title}\n${body}` },
        }),
      });
      const j = await res.json() as any;
      return j.errcode === 0 ? null : (j.errmsg || '企业微信发送失败');
    }

    if (ch.type === 'webhook') {
      const url = ch.config.webhookUrl;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
      if (!res.ok) return `Webhook HTTP ${res.status}`;
      return null;
    }

    return '未知渠道类型';
  } catch (e: any) {
    return e.message;
  }
}

export async function register(fastify: FastifyInstance) {
  // 获取所有通知渠道
  fastify.get('/notify/channels', async () => {
    return { channels: getChannels() };
  });

  // 新增/更新渠道
  fastify.post('/notify/channels', async (req) => {
    const { id, name, type, config, enabled } = req.body as any;
    if (!name || !type) return { error: '缺少 name 或 type' };
    const channels = getChannels();
    const exist = channels.find(c => c.id === id);
    if (exist) {
      Object.assign(exist, { name, type, config, enabled: enabled ?? true });
    } else {
      channels.push({
        id: id || `ch_${Date.now()}`,
        name, type, config: config || {},
        enabled: enabled ?? true,
      });
    }
    saveChannels(channels);
    return { ok: true };
  });

  // 删除渠道
  fastify.delete('/notify/channels/:id', async (req: any) => {
    const { id } = req.params;
    const channels = getChannels().filter(c => c.id !== id);
    saveChannels(channels);
    return { ok: true };
  });

  // 测试发送
  fastify.post('/notify/channels/test', async (req) => {
    const { id } = req.body as any;
    const ch = getChannels().find(c => c.id === id);
    if (!ch) return { error: '渠道不存在' };
    const err = await sendMsg(ch, '🔔 轸宿智汇平台 - 测试消息', `这是一条测试消息\n发送时间: ${new Date().toLocaleString('zh-CN')}\n\n如果收到此消息，说明通知通道配置正确 ✅`);
    return err ? { ok: false, error: err } : { ok: true };
  });

  // 发送通知（供其他模块调用）
  fastify.post('/notify/send', async (req) => {
    const { title, body, channelId } = req.body as any;
    if (!title) return { error: '缺少 title' };
    const channels = channelId
      ? getChannels().filter(c => c.id === channelId && c.enabled)
      : getChannels().filter(c => c.enabled);
    if (channels.length === 0) return { ok: true, sent: 0, msg: '无可用通知渠道' };
    const results = await Promise.all(channels.map(async (ch) => {
      const err = await sendMsg(ch, title, body || '');
      return { channel: ch.name, ok: !err, error: err };
    }));
    return { ok: true, sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results };
  });
}

// 供其他模块导入使用
export { sendMsg, getChannels };