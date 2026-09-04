import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Typography } from 'antd';

// 浅色主题下的 Markdown 渲染：标题/表格/代码块/行内码/列表 都美观展示
export default function Markdown({ text }: { text: string }) {
  return (
    <div className="md-body" style={{ lineHeight: 1.75, wordBreak: 'break-word' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 style={{ fontSize: 20, margin: '14px 0 8px', borderBottom: '1px solid #e8e8e8', paddingBottom: 4 }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontSize: 17, margin: '12px 0 6px' }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontSize: 15, margin: '10px 0 4px' }}>{children}</h3>,
          p: ({ children }) => <p style={{ margin: '6px 0' }}>{children}</p>,
          ul: ({ children }) => <ul style={{ paddingLeft: 22, margin: '6px 0' }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: 22, margin: '6px 0' }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
          strong: ({ children }) => <strong>{children}</strong>,
          hr: () => <hr style={{ border: 'none', borderTop: '1px solid #e8e8e8', margin: '12px 0' }} />,
          blockquote: ({ children }) => <blockquote style={{ margin: '8px 0', padding: '2px 12px', borderLeft: '3px solid #d0d7de', color: '#57606a', background: '#f6f8fa', borderRadius: 4 }}>{children}</blockquote>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '8px 0' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead style={{ background: '#f6f8fa' }}>{children}</thead>,
          th: ({ children }) => <th style={{ border: '1px solid #d0d7de', padding: '6px 10px', textAlign: 'left' }}>{children}</th>,
          td: ({ children }) => <td style={{ border: '1px solid #d0d7de', padding: '6px 10px' }}>{children}</td>,
          code: ({ inline, children, className }) => {
            // 语言标签（若存在）剥离只显示内容；也可用于扩展高亮
            if (inline) return <code style={{ background: '#eef1f6', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em', fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{children}</code>;
            return <pre style={{ background: '#0d1117', color: '#e6edf3', padding: 12, borderRadius: 8, overflow: 'auto', fontSize: 13, lineHeight: 1.5 }}><code style={{ background: 'none', color: 'inherit', fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{children}</code></pre>;
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
