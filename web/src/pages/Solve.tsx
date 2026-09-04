import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Space, Tag, Select, Button, Segmented, Spin, Alert, Tooltip, Card, Empty } from 'antd';
import {
  LeftOutlined, PlayCircleOutlined, PauseCircleOutlined, CheckCircleFilled, CloseCircleFilled,
  FieldTimeOutlined, UploadOutlined, ClearOutlined, EyeOutlined, EyeInvisibleOutlined,
  RocketOutlined, CodeOutlined, BulbOutlined, BookOutlined,
} from '@ant-design/icons';
import MonacoEditor from '@monaco-editor/react';
import { api } from '../api';
import Markdown from '../components/Markdown';
import CodeAssistant from '../components/CodeAssistant';

const DIFF_COLOR: Record<string, string> = { 简单: 'green', 中等: 'orange', 困难: 'red' };
const LANG_MAP: Record<string, string> = {
  cpp: 'cpp', 'c++': 'cpp', c: 'c', python: 'python', py: 'python', java: 'java',
  javascript: 'javascript', js: 'javascript', typescript: 'typescript', ts: 'typescript', rust: 'rust',
};

// 每语言可运行的占位模板(回显 stdin,便于测试输入通路后再实现解法)
const STARTER: Record<string, string> = {
  c: '#include <stdio.h>\nint main(){ char line[4096]; while (fgets(line, sizeof line, stdin)) fputs(line, stdout); return 0; }',
  cpp: '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    // TODO: 读取标准输入,实现你的解法\n    string line;\n    while (getline(cin, line)) cout << line << endl; // 占位:回显 stdin\n    return 0;\n}\n',
  rust: 'use std::io::{self, Read};\nfn main() {\n    let mut s = String::new();\n    io::stdin().read_to_string(&mut s).unwrap();\n    print!("{}", s); // 占位:回显 stdin\n}\n',
  java: 'import java.util.*;\npublic class Main {\n    public static void main(String[] a) {\n        // TODO: 读取标准输入,实现你的解法\n        Scanner sc = new Scanner(System.in);\n        while (sc.hasNextLine()) System.out.println(sc.nextLine()); // 占位:回显\n    }\n}\n',
  python: 'import sys\n\ndef main():\n    data = sys.stdin.read().split()\n    # TODO: 读取标准输入,实现你的解法\n    print(" ".join(data))  # 占位:回显 stdin\n\nif __name__ == "__main__":\n    main()\n',
  javascript: 'let s = "";\nprocess.stdin.on("data", d => s += d).on("end", () => {\n    const t = s.trim();\n    // TODO: 实现你的解法\n    console.log(t); // 占位:回显 stdin\n});\n',
  typescript: 'let s = "";\nprocess.stdin.on("data", (d: Buffer) => (s += d)).on("end", () => {\n    const t = s.trim();\n    // TODO: 实现你的解法\n    console.log(t); // 占位:回显 stdin\n});\n',
  r: 'input <- readLines(file("stdin"), warn = FALSE)\ncat(paste(input, collapse = " "), "\\n")  # 占位:回显\n',
};

function cleanStatement(md: string): string {
  return md.split('\n').filter((l) => {
    const t = l.trim();
    if (t.startsWith('# ')) return false;                       // 去掉重复的大标题
    if (t.startsWith('**难度**') || t.startsWith('**分类**') || t.startsWith('**标签**')) return false;
    return true;
  }).join('\n').trim();
}

export default function SolvePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [langs, setLangs] = useState<any[]>([]);
  const [lang, setLang] = useState('cpp');
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showSol, setShowSol] = useState(false);
  const [code, setCode] = useState<string>(STARTER.cpp);
  const [tabs, setTabs] = useState<Record<string, string>>({});   // 每种语言保留各自代码
  const [stdin, setStdin] = useState('');
  const [showIn, setShowIn] = useState(false);
  const [out, setOut] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [consoleTab, setConsoleTab] = useState<'in' | 'out' | 'ai'>('out');
  const initedLang = useRef<string>('');

  useEffect(() => {
    api.get('/code/langs').then((r) => {
      const ls = r.langs || [];
      setLangs(ls);
      const c = ls.find((x: any) => x.id === 'cpp' && x.available) || ls.find((x: any) => x.available) || ls[0];
      if (c) { setLang(c.id); initedLang.current = c.id; setCode(STARTER[c.id] || STARTER.cpp); }
    });
  }, []);

  useEffect(() => {
    setLoading(true); setDetail(null); setShowSol(false); setOut(null);
    api.get(`/problems/${id}`).then((r) => {
      setDetail(r);
      const re = /```([a-zA-Z+]+)\n/g;
      const langsFound: string[] = [];
      let m: RegExpExecArray | null;
      const sol = r.solution || '';
      while ((m = re.exec(sol))) { const l = LANG_MAP[m[1].toLowerCase()]; if (l && !langsFound.includes(l)) langsFound.push(l); }
      // 题解含 cpp/python 时,编辑器默认语言跟随(更贴近题目)
      const prefer = (langsFound.find((l) => l === 'cpp') || langsFound[0] || initedLang.current || 'cpp');
      const curAvail = langs.find((x: any) => x.id === prefer);
      const target = curAvail ? prefer : initedLang.current || 'cpp';
      switchTo(target);
    }).catch(() => setDetail(null)).finally(() => setLoading(false));
  }, [id]);

  const setCodeLocal = (v: string) => { setCode(v); setTabs((p) => ({ ...p, [lang]: v })); };
  const switchTo = (lid: string) => {
    if (!lid || lid === lang) return;
    setLang(lid);
    const keep = tabs[lid];
    setCode(keep !== undefined ? keep : (STARTER[lid] || STARTER.cpp));
    setOut(null);
  };
  const reset = () => { const s = STARTER[lang] || STARTER.cpp; setCodeLocal(s); setStdin(''); setOut(null); };
  const run = async () => {
    setRunning(true); setOut({ running: true });
    try {
      const r = await api.post('/code/run', { lang, code, stdin });
      setOut(r); setConsoleTab('out');
    } catch (e: any) { setOut({ ok: false, stdout: '', stderr: e.message }); setConsoleTab('out'); }
    setRunning(false);
  };

  const solCodeOf = (target: string): string => {
    const re = /```([a-zA-Z+]+)\n([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    const sol = detail?.solution || '';
    while ((m = re.exec(sol))) if (LANG_MAP[m[1].toLowerCase()] === target) return m[2].replace(/\n$/, '');
    return '';
  };

  const cur: any = langs.find((l) => l.id === lang) || {};
  const meta = detail?.meta;
  const outText = out?.stdout || '';
  const errText = out?.stderr || (out?.compile ? '(编译失败)' : '');

  return (
    <div style={{ height: 'calc(100vh - 118px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 2px' }}>
        <Button icon={<LeftOutlined />} onClick={() => nav('/problems')}>题库</Button>
        <Spin spinning={loading} size="small">
          <Space size={6} wrap style={{ fontSize: 15 }}>
            {meta?.no ? <Tag style={{ marginInlineEnd: 0 }}>{meta.no}</Tag> : null}
            <b>{meta?.title || id}</b>
            {meta?.difficulty ? <Tag color={DIFF_COLOR[meta.difficulty] || 'default'} style={{ marginInlineEnd: 0 }}>{meta.difficulty}</Tag> : null}
            {meta?.category ? <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>{meta.category}</Tag> : null}
            {(meta?.tags || []).map((t: string) => <Tag key={t} color="cyan" style={{ marginInlineEnd: 0 }}>{t}</Tag>)}
            {meta?.time ? <span style={{ fontSize: 12, color: '#888' }}><FieldTimeOutlined /> {meta.time} · {meta.space}</span> : null}
          </Space>
        </Spin>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button type={showSol ? 'default' : 'primary'} icon={showSol ? <EyeInvisibleOutlined /> : <EyeOutlined />} onClick={() => setShowSol(!showSol)}>
            {showSol ? '隐藏题解' : '查看题解'}
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 10 }}>
        {/* 左侧：题目 + 题解 */}
        <Card size="small" style={{ width: '42%', minWidth: 380, display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, overflow: 'auto', minHeight: 0 } }}
          title={<Space size={6}><BookOutlined style={{ color: '#1677ff' }} />题目{showSol ? ' · 题解与图解' : ''}</Space>}>
          {!detail && loading ? <Spin style={{ margin: '60px auto', display: 'block' }} /> : !detail ? <Empty description="题目不存在或加载失败" /> : (
            <>
              {!showSol && detail.solution && (
                <Alert type="info" showIcon icon={<BulbOutlined />} style={{ marginBottom: 10 }}
                  message={<span>建议先在右侧编辑器动手实现,再点顶栏「查看题解」对照(题解含<b>图解</b>与参考代码)。</span>} />
              )}
              <Markdown text={showSol ? (detail.solution || '') : cleanStatement(detail.statement || '')} />
            </>
          )}
        </Card>

        {/* 右侧：编辑器 + 控制台 */}
        <Card size="small" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 8 } }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Space wrap>
              <Select value={lang} style={{ width: 200 }} onChange={switchTo}
                options={langs.map((l) => ({ value: l.id, label: `${l.name} ${l.available ? '' : '(缺运行时)'}` }))} />
              {(langs || []).map((l) => <Tag key={l.id} color={l.id === lang ? 'blue' : 'default'} style={{ cursor: 'pointer', marginInlineEnd: 0 }}
                onClick={() => l.available && switchTo(l.id)}>{l.id === lang ? <b>{l.name}</b> : l.name}</Tag>)}
            </Space>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <Tooltip title="如果显示题解了,可一键把该语言参考代码填入编辑器(函数式,可自行补 main)">
                <Button icon={<RocketOutlined />} disabled={!showSol || !solCodeOf(lang)}
                  onClick={() => { const c = solCodeOf(lang); if (c) { setCodeLocal(c); } }}>填入题解</Button>
              </Tooltip>
              <Button icon={<ClearOutlined />} onClick={reset}>重置</Button>
              <Button icon={<UploadOutlined />} type={showIn ? 'primary' : 'default'} onClick={() => { setShowIn(!showIn); if (!showIn) setConsoleTab('in'); }}>标准输入</Button>
              <Button type="primary" icon={running ? <PauseCircleOutlined /> : <PlayCircleOutlined />} loading={running} onClick={run} disabled={!cur.available}>
                {running ? '运行中' : '▶ 运行'}
              </Button>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, border: '1px solid #e5e6eb', borderRadius: 8, overflow: 'hidden' }}>
            <MonacoEditor height="100%" language={cur.monaco || 'plaintext'} theme="light" value={code}
              onChange={(v) => setCodeLocal(v || '')} options={{ minimap: { enabled: true }, fontSize: 13.5, automaticLayout: true, scrollBeyondLastLine: false }} />
          </div>

          {/* 控制台:标准输入 / 运行结果 / AI 助手 */}
          <div style={{ height: 190, marginTop: 8, border: '1px solid #e5e6eb', borderRadius: 8, display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
            <div style={{ padding: '6px 10px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Segmented size="small" value={consoleTab} onChange={(v: any) => setConsoleTab(v)}
                options={[
                  { label: `⌨ 标准输入${showIn ? '' : ''}`, value: 'in' },
                  { label: `▶ 运行结果${outText || errText ? ' ●' : ''}`, value: 'out' },
                  { label: '🤖 AI 助手', value: 'ai' },
                ]} />
              {consoleTab === 'out' && out && <Space size={4} style={{ marginLeft: 'auto' }}>
                {out.timedOut ? <Tag color="volcano">超时</Tag> : out.ok ? <Tag color="green" icon={<CheckCircleFilled />}>成功</Tag> : <Tag color="red" icon={<CloseCircleFilled />}>失败</Tag>}
                {out.timeMs != null && <Tag icon={<FieldTimeOutlined />}>{out.timeMs}ms</Tag>}
                {out.exit != null && <Tag>{out.exit === 0 ? 'exit 0' : `exit ${out.exit}`}</Tag>}
                {out.compile && <Tag color="orange">编译</Tag>}
              </Space>}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 8 }}>
              {consoleTab === 'in' && (
                <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} placeholder={'在此粘贴题目「示例」里的输入,再点 ▶ 运行\n例如:\n5 3 8 1 9 2'}
                  style={{ width: '100%', height: '100%', fontFamily: 'monospace', fontSize: 12.5, border: 'none', outline: 'none', resize: 'none', background: 'transparent' }} />
              )}
              {consoleTab === 'out' && (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'SFMono-Regular, Consolas, monospace', fontSize: 12.5, lineHeight: 1.6, color: errText && !outText ? '#cf222e' : '#1f2328' }}>
                  {outText || (errText ? errText : (out ? '(无输出)' : '点击 ▶ 运行,结果会显示在这里'))}
                </pre>
              )}
              {consoleTab === 'ai' && (
                <div style={{ height: '100%', overflow: 'auto' }}>
                  <CodeAssistant code={code} language={cur.name || ''} />
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
