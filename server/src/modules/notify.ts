// 通知渠道:钉钉 / 飞书 / Server酱 / 通用 Webhook。
// 配置存于 store 'notify' → { channels: [{id,type,name,url,keyword?,enabled}] }
import { randomUUID } from 'node:crypto';
import { store } from '../lib/store.js';
import { dec } from '../lib/secure.js';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

export const NS = 'notify';
export interface Channel { id: string; type: string; name: string; url?: string; keyword?: string; enabled?: boolean; host?: string; port?: number; secure?: string; user?: string; password?: string; from?: string; to?: string; }

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

// ---------- 零依赖 SMTP 客户端(支持 TLS/STARTTLS/明文) ----------
function smtpSend(host: string, port: number, secure: string, user: string, pass: string, from: string, to: string[], subject: string, body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn0: any = net.connect(port, host);
    let sock: any = conn0; let buf = ''; let timer: any;
    const q: Array<{ code: number[]; cb: (code: number) => void }> = [];
    const fail = (e: string) => { clearTimeout(timer); try { sock.destroy(); } catch { /* */ } reject(new Error(e)); };
    const resp = (code: number[]) => new Promise<number>((res) => q.push({ code, cb: res }));
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        const code = parseInt(line.slice(0, 3));
        if (q.length && q[0].code.includes(code)) q.shift()!.cb(code);
      }
    };
    const ehloAndLogin = () => {
      sock.write('EHLO zhensu.local\r\n');
      resp([250]).then(login).catch(() => fail('SMTP 握手失败(检查服务器/端口/加密方式)'));
    };
    const startTls = (next: () => void) => {
      conn0.removeListener('data', onData); // 交给 TLS 层解密,避免明文解析器收到密文
      const t: any = tls.connect({ socket: conn0, servername: net.isIP(host) ? undefined : host });
      sock = t;
      t.on('data', onData);
      t.once('secureConnect', next);
      t.on('error', (e: any) => fail('TLS 失败: ' + e.message));
    };
    const login = () => {
      if (!user) return fromStep();
      const authErr = 'SMTP 认证失败(检查用户名/密码/授权码)';
      sock.write('AUTH LOGIN\r\n');
      resp([334])
        .then(() => { sock.write(Buffer.from(user).toString('base64') + '\r\n'); return resp([334, 535]); })
        .then((code) => { if (code === 535) throw new Error(authErr); sock.write(Buffer.from(pass).toString('base64') + '\r\n'); return resp([235, 535]); })
        .then((code) => { if (code === 535) throw new Error(authErr); fromStep(); })
        .catch(() => fail(authErr));
    };
    const fromStep = () => {
      sock.write('MAIL FROM:<' + from + '>\r\n');
      resp([250]).then(() => { let p: Promise<any> = Promise.resolve(); for (const rc of to) p = p.then(() => { sock.write('RCPT TO:<' + rc + '>\r\n'); return resp([250, 251]); }); return p; })
        .then(dataStep).catch(() => fail('SMTP 收件人被拒'));
    };
    const dataStep = () => {
      sock.write('DATA\r\n');
      resp([354]).then(() => {
        const enc = (s: string) => '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
        const b64 = Buffer.from(body, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
        const head = 'From: ' + from + '\r\nTo: ' + to.join(', ') + '\r\nSubject: ' + enc(subject) + '\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n';
        sock.write(head + b64 + '\r\n.\r\n');
        return resp([250]);
      }).then(() => { sock.write('QUIT\r\n'); clearTimeout(timer); try { sock.destroy(); } catch { /* */ } resolve(); })
        .catch(() => fail('SMTP 发送失败'));
    };
    timer = setTimeout(() => fail('SMTP 超时'), 20000);
    conn0.on('data', onData);
    conn0.on('error', (e) => fail('连接失败: ' + e.message));
    conn0.on('connect', () => {
      // 隐式 SSL(465):TCP 连接后立即 TLS 握手,无明文 220
      if (secure === 'ssl') return startTls(ehloAndLogin);
      resp([220]).then(() => {
        if (secure === 'starttls') {
          sock.write('EHLO zhensu.local\r\n');
          return resp([250]).then(() => { sock.write('STARTTLS\r\n'); return resp([220]); }).then(() => startTls(ehloAndLogin));
        }
        ehloAndLogin();
      }).catch(() => fail('SMTP 握手失败(检查服务器/端口/加密方式)'));
    });
  });
}

async function sendTo(ch: Channel, title: string, content: string) {
  const text = `【轸宿智汇】${title}\n${content}`.slice(0, 1800);
  switch (ch.type) {
    case 'dingtalk': // 钉钉自定义机器人
      await post(ch.url || '', { msgtype: 'text', text: { content: (ch.keyword ? ch.keyword + '\n' : '') + text } });
      break;
    case 'feishu': // 飞书自定义机器人
      await post(ch.url || '', { msg_type: 'text', content: { text } });
      break;
    case 'serverchan': // Server酱(方糖) https://sctapi.ftqq.com/<SENDKEY>.send
      await post(ch.url || '', { title, desp: content.slice(0, 1500) }, true);
      break;
    case 'webhook': // 通用 Webhook: POST JSON {title, content, time, source}
      await post(ch.url || '', { title, content: content.slice(0, 3000), time: new Date().toISOString(), source: 'opshub' });
      break;
    case 'email': {
      if (!ch.host || !ch.from || !ch.to) throw new Error('邮件渠道需填写 SMTP 服务器/发件人/收件人');
      await smtpSend(ch.host, ch.port || 587, ch.secure || 'starttls', ch.user || '', ch.password ? dec(ch.password) : '', ch.from, String(ch.to).split(/[,，;；\s]+/).filter(Boolean), title, content.slice(0, 4000));
      break;
    }
    default: break;
  }
}

// 通知所有启用的渠道(吞异常,不阻塞主流程)
export function notify(title: string, content: string) {
  // email 渠道无 url(用 host/port/user/password),其余渠道需有 url
  const chans = cfgChannels().filter((c) => c.enabled && (c.url || c.type === 'email'));
  if (!chans.length) return;
  for (const ch of chans) { sendTo(ch, title, content).catch(() => {}); }
}

// 直接测试某条渠道配置(不依赖已保存)
export async function testChannel(ch: Channel, title = '测试通知', content = '如果你收到这条消息,说明通知渠道配置正确 ✓') {
  await sendTo(ch, title, content);
}

export function newChannel(type: string): Channel {
  const defs: any = { dingtalk: { name: '钉钉机器人', url: 'https://oapi.dingtalk.com/robot/send?access_token=xxx' }, feishu: { name: '飞书机器人', url: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx' }, serverchan: { name: 'Server酱', url: 'https://sctapi.ftqq.com/<SENDKEY>.send' }, webhook: { name: 'Webhook', url: 'https://example.com/hook' }, email: { name: '邮件(SMTP)', host: '', port: 587, secure: 'starttls', user: '', password: '', from: '', to: '' } };
  const d = defs[type] || defs.webhook;
  return { id: randomUUID().slice(0, 8), type, name: d.name, url: d.url, host: d.host, port: d.port, secure: d.secure, user: d.user, password: d.password, from: d.from, to: d.to, enabled: false };
}
