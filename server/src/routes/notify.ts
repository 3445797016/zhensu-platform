// 通知渠道路由:读取/保存渠道、测试发送
import type { FastifyInstance } from 'fastify';
import { audit } from '../lib/audit.js';
import { cfgChannels, saveChannels, testChannel, newChannel, NS, notify } from '../modules/notify.js';
import { store } from '../lib/store.js';

export async function register(fastify: FastifyInstance) {
  fastify.get('/notify/config', () => ({ channels: cfgChannels() }));

  fastify.put('/notify/config', (req, reply) => {
    const { channels } = req.body as any;
    if (!Array.isArray(channels)) return reply.code(400).send({ error: 'channels 需为数组' });
    saveChannels(channels.map((c: any) => ({ id: String(c.id || ''), type: String(c.type || 'webhook'), name: String(c.name || c.type), url: String(c.url || ''), keyword: c.keyword ? String(c.keyword) : undefined, enabled: !!c.enabled })));
    audit('notify', 'config', `保存 ${channels.length} 个通知渠道`, 'web');
    return { ok: true, channels: cfgChannels() };
  });

  fastify.post('/notify/channel', (req, reply) => {
    const { type } = req.body as any;
    const ch = newChannel(String(type || 'webhook'));
    const list = cfgChannels(); list.push(ch);
    saveChannels(list);
    return { ok: true, channel: ch };
  });

  fastify.post('/notify/test', async (req, reply) => {
    const { channel } = req.body as any;
    if (!channel?.url) return reply.code(400).send({ error: '缺少 url' });
    try {
      await testChannel(channel);
      return { ok: true, msg: '测试消息已发送,请查看手机/群' };
    } catch (e: any) { return reply.code(500).send({ error: '发送失败: ' + String(e?.message || e) }); }
  });

  // 立即重放一条最近告警(便于验证链路)
  fastify.post('/notify/resend', () => {
    const last = store.list<any>('alerts').sort((a, b) => String(b.time).localeCompare(String(a.time)))[0];
    if (!last) return { ok: false, msg: '暂无告警记录可重放' };
    notify(`[重放] ${last.message || '告警'}`, `${last.hostName || ''} ${last.value || ''} @ ${last.time || ''}`);
    return { ok: true, msg: '已重放最近告警到所有启用的通知渠道' };
  });
}
