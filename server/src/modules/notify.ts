// 通知渠道:钉钉 / 飞书 / Server酱 / 通用 Webhook。
// 配置存于 store 'notify' → { channels: [{id,type,name,url,keyword?,enabled}] }
import { randomUUID } from 'node:crypto';
import { store } from '../lib/store.js';
import http from 'node:http';
import https from 'node:https';

export const NS = 'notify';
export interface Channel { id: string; type: string; name: string; url: string; keyword?: string; enabled?: boolean; }

export function cfgChannels(): Channel[] { return store.read<any>(NS, {}).channels || []; }
export function saveChannels(channels: Channel[]) { store.write(NS, { ...store.read<any>(NS, {}), channels }); }

function post(url: string, body: any, form = false, timeout = 8000): Promise<void> {
  return new Promise((resolve) => {
    let u: URL;
    try { u = new URL(url); } catch { resolve(); return; }
    const mod = u.protocol === 'https:' ? https : http;
    const payload = form ? new URLSearchParams(body).toString() : JSON.stringify(body);
    const req = mod.request({
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search, method: 'POST',
      headers: {
        'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => { res.resume(); res.on('end', () => resolve()); });
    req.on('error', () => resolve());
    req.setTimeout(timeout, () => { req.destroy(); resolve(); });
    req.write(payload); req.end();
  });
}

async function sendTo(ch: Channel, title: string, content: string) {
  const text = `【轸宿智汇】${title}\n${content}`.slice(0, 1800);
  switch (ch.type) {
    case 'dingtalk': // 钉钉自定义机器人
      await post(ch.url, { msgtype: 'text', text: { content: (ch.keyword ? ch.keyword + '\n' : '') + text } });
      break;
    case 'feishu': // 飞书自定义机器人
      await post(ch.url, { msg_type: 'text', content: { text } });
      break;
    case 'serverchan': // Server酱(方糖) https://sctapi.ftqq.com/<SENDKEY>.send
      await post(ch.url, { title, desp: content.slice(0, 1500) }, true);
      break;
    case 'webhook': // 通用 Webhook: POST JSON {title, content, time, source}
      await post(ch.url, { title, content: content.slice(0, 3000), time: new Date().toISOString(), source: 'opshub' });
      break;
    default: break;
  }
}

// 通知所有启用的渠道(吞异常,不阻塞主流程)
export function notify(title: string, content: string) {
  const chans = cfgChannels().filter((c) => c.enabled && c.url);
  if (!chans.length) return;
  for (const ch of chans) { sendTo(ch, title, content).catch(() => {}); }
}

// 直接测试某条渠道配置(不依赖已保存)
export async function testChannel(ch: Channel, title = '测试通知', content = '如果你收到这条消息,说明通知渠道配置正确 ✓') {
  await sendTo(ch, title, content);
}

export function newChannel(type: string): Channel {
  const defs: any = { dingtalk: { name: '钉钉机器人', url: 'https://oapi.dingtalk.com/robot/send?access_token=xxx' }, feishu: { name: '飞书机器人', url: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx' }, serverchan: { name: 'Server酱', url: 'https://sctapi.ftqq.com/<SENDKEY>.send' }, webhook: { name: 'Webhook', url: 'https://example.com/hook' } };
  const d = defs[type] || defs.webhook;
  return { id: randomUUID().slice(0, 8), type, name: d.name, url: d.url, enabled: false };
}
