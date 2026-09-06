// Monaco 编辑器本地化:让 @monaco-editor/react 从本机 /monaco/vs 加载,
// 不再依赖 cdn.jsdelivr.net —— 离线/内网也能使用所有编辑器页面。
import { loader } from '@monaco-editor/react';

loader.config({ paths: { vs: '/monaco/vs' } });
