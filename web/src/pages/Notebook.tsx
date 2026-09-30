import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Card, Button, Space, Tag, Typography, Input, message, Modal, Spin, Alert,
  Tooltip, Dropdown, List, Empty, Divider, Popconfirm, Select
} from 'antd';
import {
  PlusOutlined, PlayCircleOutlined, DeleteOutlined, StopOutlined,
  CodeOutlined, FileAddOutlined, FolderOpenOutlined, ReloadOutlined,
  CheckCircleOutlined, CloseCircleOutlined, DownOutlined, UpOutlined,
  CopyOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import { api } from '../api';

const { Text, Paragraph } = Typography;
const msg = message;

// ====== 代码输入组件 (简易 Monaco) ======
function CodeInput({ value, onChange, onRun, running }: {
  value: string; onChange: (v: string) => void;
  onRun: () => void; running: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const textRef = useRef<any>(null);

  return (
    <div style={{
      border: focused ? '1px solid #1677ff' : '1px solid #d9d9d9',
      borderRadius: 6,
      overflow: 'hidden',
      background: '#1e1e1e',
    }}>
      {/* 工具栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 8px', background: '#2d2d2d', borderBottom: '1px solid #333',
      }}>
        <Text style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>python</Text>
        <Space size={4}>
          <Tooltip title="运行此格 (Ctrl+Enter)">
            <Button size="small" type="text"
              icon={<PlayCircleOutlined style={{ color: running ? '#faad14' : '#52c41a' }} />}
              onClick={onRun} loading={running}
              style={{ color: '#ccc' }}
            />
          </Tooltip>
        </Space>
      </div>
      {/* 编辑区 */}
      <textarea
        ref={textRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onRun();
          }
          // Tab 缩进
          if (e.key === 'Tab') {
            e.preventDefault();
            const ta = e.target as HTMLTextAreaElement;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const newVal = value.substring(0, start) + '    ' + value.substring(end);
            onChange(newVal);
            requestAnimationFrame(() => {
              ta.selectionStart = ta.selectionEnd = start + 4;
            });
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="# 输入 Python 代码..."
        style={{
          width: '100%', minHeight: 60, maxHeight: 400,
          padding: '8px 12px',
          background: '#1e1e1e', color: '#d4d4d4',
          border: 'none', outline: 'none',
          fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
          fontSize: 13, lineHeight: 1.6,
          resize: 'vertical',
          tabSize: 4,
        }}
        spellCheck={false}
      />
    </div>
  );
}

// ====== 输出组件 ======
function CellOutput({ output, error, running }: { output: string; error: string; running: boolean }) {
  if (running) return <Spin size="small" style={{ margin: '8px 0' }} />;
  if (!output && !error) return null;

  const content = error || output;
  const isErr = !!error;

  return (
    <div style={{
      marginTop: 4, padding: '8px 12px',
      background: isErr ? '#2d1b1b' : '#0d1b2a',
      borderRadius: 6,
      border: isErr ? '1px solid #5c1a1a' : '1px solid #1a3a5c',
      maxHeight: 300, overflow: 'auto',
    }}>
      <Space size={4} style={{ marginBottom: 4, display: 'flex' }}>
        {isErr
          ? <Tag color="red" style={{ fontSize: 10, lineHeight: '16px' }}>ERROR</Tag>
          : <Tag color="green" style={{ fontSize: 10, lineHeight: '16px' }}>OUTPUT</Tag>
        }
      </Space>
      <pre style={{
        margin: 0, color: isErr ? '#ff6b6b' : '#7ec699',
        fontFamily: "'Fira Code', Consolas, monospace",
        fontSize: 12, lineHeight: 1.5,
        whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      }}>{content}</pre>
    </div>
  );
}

// ====== Notebook 主组件 ======
export default function NotebookPage() {
  const [notebooks, setNotebooks] = useState<any[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [cells, setCells] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [kernelAlive, setKernelAlive] = useState(false);
  const [runningCells, setRunningCells] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [newName, setNewName] = useState('');

  const loadList = async () => {
    try {
      const r = await api.get('/notebook');
      setNotebooks(r || []);
    } catch { /* */ }
  };

  const loadNotebook = async (id: string) => {
    setLoading(true);
    try {
      const r = await api.get(`/notebook/${id}`);
      if (r.error) { msg.error(r.error); return; }
      setCurrentId(r.id);
      setName(r.name);
      setCells(r.cells || []);
      setKernelAlive(r.kernelAlive || false);
    } catch (e: any) {
      msg.error('加载失败: ' + e.message);
    }
    setLoading(false);
  };

  const saveCells = useCallback(async (id: string, newCells: any[]) => {
    try {
      await api.put(`/notebook/${id}`, { cells: newCells });
    } catch { /* */ }
  }, []);

  useEffect(() => { loadList(); }, []);

  // 创建 notebook
  const doCreate = async () => {
    try {
      const r = await api.post('/notebook', { name: newName || undefined });
      if (r.ok) {
        msg.success('已创建');
        setCreateModal(false);
        setNewName('');
        loadList();
        setCurrentId(r.notebook.id);
        setCells(r.notebook.cells);
        setName(r.notebook.name);
      }
    } catch (e: any) {
      msg.error('创建失败: ' + e.message);
    }
  };

  // 删除 notebook
  const doDelete = async (id: string) => {
    try {
      await api.del(`/notebook/${id}`);
      msg.success('已删除');
      if (currentId === id) {
        setCurrentId(null);
        setCells([]);
        setName('');
      }
      loadList();
    } catch (e: any) { msg.error('删除失败: ' + e.message); }
  };

  // 启动/停止 kernel
  const startKernel = async () => {
    if (!currentId) return;
    try {
      const r = await api.post(`/notebook/${currentId}/start`);
      if (r.ok) { setKernelAlive(true); msg.success('Kernel 已启动'); }
      else msg.error(r.error || '启动失败');
    } catch (e: any) { msg.error(e.message); }
  };
  const stopKernel = async () => {
    if (!currentId) return;
    try {
      await api.post(`/notebook/${currentId}/stop`);
      setKernelAlive(false);
      msg.success('Kernel 已停止');
    } catch (e: any) { msg.error(e.message); }
  };

  // 添加 cell
  const addCell = (afterIndex?: number) => {
    const newCell = { id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, code: '', output: '', error: '', time: new Date().toISOString() };
    let newCells: any[];
    if (afterIndex !== undefined) {
      newCells = [...cells];
      newCells.splice(afterIndex + 1, 0, newCell);
    } else {
      newCells = [...cells, newCell];
    }
    setCells(newCells);
    if (currentId) saveCells(currentId, newCells);
  };

  // 删除 cell
  const delCell = (idx: number) => {
    if (cells.length <= 1) return;
    const newCells = cells.filter((_, i) => i !== idx);
    setCells(newCells);
    if (currentId) saveCells(currentId, newCells);
  };

  // 执行 cell
  const runCell = async (idx: number) => {
    if (!currentId) return;
    const cell = cells[idx];
    if (!cell || !cell.code.trim()) return;

    setRunningCells(prev => new Set(prev).add(cell.id));
    // 清空旧输出
    const newCells = cells.map((c, i) => i === idx ? { ...c, output: '', error: '' } : c);
    setCells(newCells);

    try {
      const r = await api.post(`/notebook/${currentId}/exec`, { code: cell.code });
      const updated = newCells.map((c, i) =>
        i === idx ? { ...c, output: r.output || '', error: r.stderr || '', time: new Date().toISOString() } : c
      );
      setCells(updated);
      if (currentId) saveCells(currentId, updated);
    } catch (e: any) {
      const updated = newCells.map((c, i) =>
        i === idx ? { ...c, error: e.message, time: new Date().toISOString() } : c
      );
      setCells(updated);
    }
    setRunningCells(prev => { const n = new Set(prev); n.delete(cell.id); return n; });
  };

  // 执行所有 cells
  const runAll = async () => {
    if (!currentId) return;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].code.trim()) await runCell(i);
    }
  };

  // 更新 cell 代码
  const updateCode = (idx: number, code: string) => {
    const newCells = cells.map((c, i) => i === idx ? { ...c, code } : c);
    setCells(newCells);
    // 自动保存延迟
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      if (currentId) saveCells(currentId, newCells);
    }, 2000);
  };

  const autoSaveRef = useRef<any>(null);

  // 移动 cell
  const moveCell = (idx: number, dir: 'up' | 'down') => {
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === cells.length - 1) return;
    const newCells = [...cells];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    [newCells[idx], newCells[swap]] = [newCells[swap], newCells[idx]];
    setCells(newCells);
    if (currentId) saveCells(currentId, newCells);
  };

  if (!currentId) {
    return (
      <Card size="small" title={<Space><CodeOutlined />Jupyter Notebook</Space>}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>新建 Notebook</Button>}>
        {notebooks.length === 0 ? (
          <Empty description="暂无 Notebook" style={{ marginTop: 60 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>创建第一个 Notebook</Button>
          </Empty>
        ) : (
          <List
            dataSource={notebooks}
            renderItem={(item: any) => (
              <List.Item
                actions={[
                  <Button size="small" type="primary" onClick={() => loadNotebook(item.id)}>打开</Button>,
                  <Popconfirm title="确定删除?" onConfirm={() => doDelete(item.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={<CodeOutlined style={{ fontSize: 20, color: '#1677ff' }} />}
                  title={item.name}
                  description={
                    <Space size={12}>
                      <Text type="secondary">{item.cells} 个单元格</Text>
                      <Tag color={item.kernelAlive ? 'green' : 'default'}>{item.kernelAlive ? 'Kernel 运行中' : 'Kernel 已停止'}</Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>{new Date(item.updated).toLocaleString()}</Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
        {/* 创建弹窗 */}
        <Modal title="新建 Notebook" open={createModal} onOk={doCreate} onCancel={() => setCreateModal(false)}>
          <Input placeholder="Notebook 名称 (可选)" value={newName} onChange={(e) => setNewName(e.target.value)} onPressEnter={doCreate} />
        </Modal>
      </Card>
    );
  }

  // ===== 笔记本编辑视图 =====
  return (
    <div>
      {/* 顶栏 */}
      <Card size="small" style={{ marginBottom: 8, padding: '4px 0' }}
        title={
          <Space>
            <Button type="text" icon={<FolderOpenOutlined />} onClick={() => { setCurrentId(null); loadList(); }} />
            <Input variant="borderless" value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (currentId) api.put(`/notebook/${currentId}`, { name: e.target.value }).catch(() => {});
              }}
              style={{ fontSize: 16, fontWeight: 600, width: 300 }}
            />
            <Tag>{kernelAlive ? 'Kernel 运行中' : 'Kernel 已停止'}</Tag>
          </Space>
        }
        extra={
          <Space wrap>
            <Button size="small" icon={<ThunderboltOutlined />} onClick={runAll}>全部运行</Button>
            {kernelAlive
              ? <Button size="small" icon={<StopOutlined />} onClick={stopKernel}>停止 Kernel</Button>
              : <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={startKernel}>启动 Kernel</Button>
            }
            <Button size="small" icon={<PlusOutlined />} onClick={() => addCell()}>添加单元格</Button>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => currentId && loadNotebook(currentId)} />
            <Popconfirm title="删除此 Notebook?" onConfirm={() => { doDelete(currentId); }}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        }
      />

      {/* 单元格列表 */}
      {loading ? <center style={{ margin: 80 }}><Spin size="large" /></center> : (
        <div>
          {!kernelAlive && (
            <Alert type="info" showIcon message="Kernel 未启动"
              description="点击「启动 Kernel」启动 Python 解释器。在 Kernel 运行前，代码不会被实际执行。"
              style={{ marginBottom: 12 }}
              action={<Button size="small" icon={<PlayCircleOutlined />} onClick={startKernel}>启动</Button>}
            />
          )}
          {cells.map((cell, idx) => (
            <Card key={cell.id} size="small" style={{ marginBottom: 8 }}
              bodyStyle={{ padding: 0 }}
            >
              {/* Cell 工具栏 */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '2px 8px', background: '#f5f5f5', borderBottom: '1px solid #f0f0f0',
              }}>
                <Space size={4}>
                  <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                    [{idx + 1}]
                  </Text>
                  {cell.time && (
                    <Text type="secondary" style={{ fontSize: 10 }}>
                      {new Date(cell.time).toLocaleTimeString()}
                    </Text>
                  )}
                </Space>
                <Space size={2}>
                  <Tooltip title="向上移动"><Button type="text" size="small" icon={<UpOutlined />} disabled={idx === 0} onClick={() => moveCell(idx, 'up')} /></Tooltip>
                  <Tooltip title="向下移动"><Button type="text" size="small" icon={<DownOutlined />} disabled={idx === cells.length - 1} onClick={() => moveCell(idx, 'down')} /></Tooltip>
                  <Tooltip title="上方插入"><Button type="text" size="small" icon={<FileAddOutlined />} onClick={() => addCell(idx - 1)} /></Tooltip>
                  <Tooltip title="下方插入"><Button type="text" size="small" icon={<PlusOutlined />} onClick={() => addCell(idx)} /></Tooltip>
                  <Popconfirm title="删除此单元格?" onConfirm={() => delCell(idx)}>
                    <Tooltip title="删除"><Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={cells.length <= 1} /></Tooltip>
                  </Popconfirm>
                </Space>
              </div>
              {/* 代码输入 */}
              <CodeInput
                value={cell.code}
                onChange={(v) => updateCode(idx, v)}
                onRun={() => runCell(idx)}
                running={runningCells.has(cell.id)}
              />
              {/* 输出 */}
              <div style={{ padding: '4px 8px 8px' }}>
                <CellOutput
                  output={cell.output}
                  error={cell.error}
                  running={runningCells.has(cell.id)}
                />
              </div>
            </Card>
          ))}
          {/* 底部添加按钮 */}
          <center style={{ margin: '16px 0' }}>
            <Button icon={<PlusOutlined />} onClick={() => addCell()}>添加单元格</Button>
          </center>
        </div>
      )}
    </div>
  );
}