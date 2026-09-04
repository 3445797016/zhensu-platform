import { useEffect, useMemo, useRef, useState } from 'react';
import { Row, Col, Card, Button, Space, Select, Tag, Typography, Segmented, Drawer, Alert, Spin, Tooltip, Empty } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, CodeOutlined, ClearOutlined, UploadOutlined, CheckCircleFilled, CloseCircleFilled, FieldTimeOutlined, BookOutlined } from '@ant-design/icons';
import MonacoEditor from '@monaco-editor/react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import CodeAssistant from '../components/CodeAssistant';

const HELLO: Record<string, string> = {
  c: '#include <stdio.h>\nint main(){ printf("Hello, 轸宿智汇 C!\\n"); return 0; }',
  cpp: '#include <iostream>\nint main(){ std::cout << "Hello, 轸宿智汇 C++!" << std::endl; return 0; }',
  rust: 'fn main() { println!("Hello, 轸宿智汇 Rust!"); }',
  java: 'public class Main {\n  public static void main(String[] a) {\n    System.out.println("Hello, 轸宿智汇 Java!");\n  }\n}',
  python: 'print("Hello, 轸宿智汇 Python!")',
  javascript: 'console.log("Hello, 轸宿智汇 JavaScript!");',
  typescript: 'const greet: (s: string) => string = (n) => `Hello, 轸宿智汇 ${n}!`;\nconsole.log(greet("TypeScript"));',
  r: 'cat("Hello, 轸宿智汇 R!\\n")',
};
const STDN: Record<string, string> = {
  c: '#include <stdio.h>\nint main(){ int a,b; if(scanf("%d %d",&a,&b)!=2) return 0; printf("sum=%d\\n",a+b); return 0; }',
  cpp: '#include <iostream>\nint main(){ int a,b; std::cin>>a>>b; std::cout<<"sum="<<a+b<<"\\n"; }',
  rust: 'use std::io::{self, Read};\nfn main() { let mut s=String::new(); io::stdin().read_to_string(&mut s).unwrap(); let v:Vec<i32>=s.split_whitespace().map(|x|x.parse().unwrap()).collect(); println!("sum={}",v.iter().sum::<i32>()); }',
  java: 'import java.util.*;\npublic class Main { public static void main(String[] a){ Scanner sc=new Scanner(System.in); int s=0; while(sc.hasNextInt()) s+=sc.nextInt(); System.out.println("sum="+s); } }',
  python: 'import sys\nnums=list(map(int, sys.stdin.read().split()))\nprint("sum=", sum(nums))',
  javascript: 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const n=s.trim().split(/\\s+/).map(Number);console.log("sum=",n.reduce((a,b)=>a+(b||0),0));});',
  typescript: 'let s = ""; process.stdin.on("data", (d: Buffer) => s += d).on("end", () => { const n = s.trim().split(/\\s+/).map(Number); console.log("sum=", n.reduce((a: number, b: number) => a + (b || 0), 0)); });',
  r: 'nums <- as.numeric(strsplit(readLines(file("stdin"))[1], " ")[[1]])\ncat("sum=", sum(nums), "\\n")',
};
const SORT: Record<string, string> = {
  python: 'def qsort(a):\n    return a if len(a)<=1 else qsort([x for x in a[1:] if x<a[0]])+[a[0]]+qsort([x for x in a[1:] if x>=a[0]])\nprint(qsort([5,3,8,1,9,2]))',
  c: '#include <stdio.h>\nint cmp(const void*a,const void*b){return *(int*)a-*(int*)b;}\nint main(){int a[]={5,3,8,1,9,2},n=6;qsort(a,n,4,cmp);for(int i=0;i<n;i++)printf("%d ",a[i]);return 0;}',
  javascript: 'const qsort = a => a.length<=1?a:[...qsort(a.filter(x=>x<a[0])),a[0],...qsort(a.filter(x=>x>a[0]))];\nconsole.log(qsort([5,3,8,1,9,2]).join(" "));',
};
const TEMPLATES: Record<string, { name: string; code: string }[]> = {};
['c','cpp','rust','java','python','javascript','typescript','r'].forEach((k) => {
  TEMPLATES[k] = [{ name: 'Hello', code: HELLO[k] }, { name: '读取stdin求和', code: STDN[k] }];
  if (SORT[k]) TEMPLATES[k].push({ name: '快排示例', code: SORT[k] });
});

export default function Code() {
  const nav = useNavigate();
  const [langs, setLangs] = useState<any[]>([]);
  const [lang, setLang] = useState('c');
  const [code, setCode] = useState<string>(HELLO.c);
  const [stdin, setStdin] = useState('');
  const [showIn, setShowIn] = useState(false);
  const [out, setOut] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [resultTab, setResultTab] = useState<'out' | 'err'>('out');
  const [panelTab, setPanelTab] = useState<'run' | 'ai'>('run');

  useEffect(() => { api.get('/code/langs').then((r) => { const ls = r.langs || []; setLangs(ls); const c = ls.find((x: any) => x.available); if (c) switchLang(c.id, ls); }); }, []);
  const defCode = (id: string) => HELLO[id] || HELLO.c;
  const switchLang = (id: string, ls?: any[]) => { setLang(id); const cur = code; if (!Object.values(HELLO).includes(cur)) setCode(defCode(id)); setOut(null); };
  const loadTmpl = (id: string, name: string) => { const t = (TEMPLATES[lang] || []).find((x) => x.name === name); if (t) setCode(t.code); setOut(null); };
  const run = async () => {
    setRunning(true); setOut({ running: true });
    try { const r = await api.post('/code/run', { lang, code, stdin }); setOut(r); } catch (e: any) { setOut({ ok: false, stdout: '', stderr: e.message }); }
    setRunning(false);
  };

  const cur: any = langs.find((l) => l.id === lang);
  const langColor = (av: any) => (av ? 'green' : 'default');
  const outText = out?.stdout || '';
  const errText = out?.stderr || (out?.compile ? '(编译失败)' : '');

  return (
    <div style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部工具条 */}
      <Row gutter={12} style={{ marginBottom: 10 }} align="middle">
        <Col flex="auto">
          <Space wrap>
            <Select value={lang} onChange={switchLang} style={{ width: 220 }} options={langs.map((l) => ({ value: l.id, label: `${l.name} ${l.available ? '' : '(缺运行时)'}` }))} />
            <Tag icon={<CodeOutlined />}>在线编程</Tag>
            {langs.map((l) => <Tooltip key={l.id} title={l.version || '不可用'}><Tag color={l.available ? 'blue' : 'default'} onClick={() => switchLang(l.id)} style={{ cursor: 'pointer' }}>{l.id === lang ? <b>{l.name}</b> : l.name}</Tag></Tooltip>)}
          </Space>
        </Col>
        <Col>
          <Space>
            <Select placeholder="示例模板" style={{ width: 150 }} options={(TEMPLATES[lang] || []).map((t) => ({ value: t.name, label: t.name }))} onChange={(v) => loadTmpl(lang, v)} />
            <Button icon={<BookOutlined />} onClick={() => nav('/problems')}>题库刷题</Button>
            <Button icon={<UploadOutlined />} type={showIn ? 'primary' : 'default'} onClick={() => setShowIn(!showIn)}>标准输入</Button>
            <Button icon={<ClearOutlined />} onClick={() => { setOut(null); setCode(defCode(lang)); }}>重置</Button>
            <Button type="primary" size="large" icon={running ? <PauseCircleOutlined /> : <PlayCircleOutlined />} loading={running} onClick={run} disabled={!cur?.available}>{running ? '运行中' : '运行'}</Button>
          </Space>
        </Col>
      </Row>

      <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
        {/* 代码编辑区 */}
        <Card size="small" style={{ flex: 1, minWidth: 0 }} styles={{ body: { padding: 4, height: '100%' } }} title={<Space size={6}><CodeOutlined />{cur?.name} · {cur?.version || ''}</Space>}>
          <div style={{ height: 'calc(100% - 8px)', border: '1px solid #e5e6eb', borderRadius: 6, overflow: 'hidden' }}>
            <MonacoEditor height="100%" language={cur?.monaco || 'plaintext'} theme="light" value={code}
              onChange={(v) => setCode(v || '')} options={{ minimap: { enabled: true }, fontSize: 14, automaticLayout: true, scrollBeyondLastLine: false }} />
          </div>
        </Card>

        {/* 右侧：运行结果 / AI 助手 */}
        <div style={{ width: 420, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          {showIn && (
            <Card size="small" title="标准输入 stdin" styles={{ body: { padding: 6 } }}>
              <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} placeholder={'样例：\n5 3 8 1 9 2'} style={{ width: '100%', height: 90, fontFamily: 'monospace', padding: 8, boxSizing: 'border-box' }} />
            </Card>
          )}
          <Card size="small" style={{ flex: 1, minHeight: 0 }} styles={{ body: { padding: 6, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}>
            <Segmented block size="small" value={panelTab} onChange={(v: any) => setPanelTab(v)} style={{ marginBottom: 8 }} options={[{ label: '▶ 运行结果', value: 'run' }, { label: '🤖 AI 助手', value: 'ai' }]} />
            {panelTab === 'run' ? (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 6 }} wrap>
                  <Segmented size="small" value={resultTab} onChange={(v: any) => setResultTab(v)} options={[{ label: `输出${outText ? ' ' + outText.length : ''}`, value: 'out' }, { label: `错误${errText ? ' ' + (out?.stderr || '').length : ''}`, value: 'err' }]} />
                  {out && <Space size={4}>
                    {out.timedOut ? <Tag color="volcano">超时</Tag> : out.ok ? <Tag color="green" icon={<CheckCircleFilled />}>成功</Tag> : <Tag color="red" icon={<CloseCircleFilled />}>失败</Tag>}
                    {out.timeMs != null && <Tag icon={<FieldTimeOutlined />}>{out.timeMs}ms</Tag>}
                    {out.exit != null && <Tag>{out.exit === 0 ? 'exit 0' : `exit ${out.exit}`}</Tag>}
                    {out.compile && <Tag color="orange">编译</Tag>}
                  </Space>}
                </Space>
                <pre style={{ margin: 0, flex: 1, overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'SFMono-Regular, Consolas, monospace', fontSize: 13, lineHeight: 1.6, color: resultTab === 'err' ? '#cf222e' : '#1f2328', border: '1px solid #e5e6eb', borderRadius: 6, padding: 8 }}>
                  {resultTab === 'out' ? (outText || (out ? '(无输出)' : '点击 ▶ 运行，结果会显示在这里')) : (errText || '(无错误)')}
                </pre>
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0 }}>
                <CodeAssistant code={code} language={cur?.name || ''} />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
