import { useEffect, useRef, useState } from 'react';
import { Modal, Button, Space, App } from 'antd';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { wsUrl } from '../api';

export default function TerminalModal({ host, open, onClose }: { host: any; open: boolean; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);
  const { message } = App.useApp();
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!open) return;
    const term = new Terminal({ cursorBlink: true, fontSize: 13, theme: { background: '#ffffff', foreground: '#1f2328', cursor: '#1f2328', selectionBackground: '#d0e0ff', black: '#1f2328', white: '#6e7781' }, scrollback: 3000 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(boxRef.current!);
    fit.fit();
    termRef.current = term;
    term.writeln('\x1b[36m=== 轸宿智汇 · 远程终端 ===\x1b[0m');
    term.writeln('正在连接 ' + host.name + ' ...');
    let buf = '';
    term.onData((d) => {
      if (wsRef.current?.readyState === 1) wsRef.current.send(d);
      else buf += d;
    });
    const ws = new WebSocket(wsUrl('/api/ws/shell/' + host.id));
    wsRef.current = ws;
    ws.onopen = () => { setConnected(true); if (buf) ws.send(buf); buf = ''; };
    ws.onmessage = (e) => term.write(e.data);
    ws.onclose = () => { setConnected(false); term.writeln('\r\n\x1b[31m[连接已关闭]\x1b[0m'); };
    ws.onerror = () => { setConnected(false); term.writeln('\r\n\x1b[31m[连接错误]\x1b[0m'); message.error('连接失败'); };
    return () => { try { ws.close(); } catch {} term.dispose(); };
  }, [open, host.id]);

  return (
    <Modal title={`终端 · ${host.name}`} width={820} open={open} onCancel={onClose} footer={null}
      style={{ top: 20 }} destroyOnClose
      styles={{ body: { padding: 0, background: '#ffffff', borderRadius: 8 } }}>
      <div ref={boxRef} style={{ height: 460, padding: 4 }} />
    </Modal>
  );
}
