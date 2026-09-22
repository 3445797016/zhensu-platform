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
          h1: ({ children }) => <h1 style={{ fontSize: 20, margin: '14px 0 8px', borderBottom: '1px solid var(--zs-border)', paddingBottom: 4 }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontSize: 17, margin: '12px 0 6px' }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontSize: 15, margin: '10px 0 4px' }}>{children}</h3>,
          p: ({ children }) => <p style={{ margin: '6px 0' }}>{children}</p>,
          ul: ({ children }) => <ul style={{ paddingLeft: 22, margin: '6px 0' }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: 22, margin: '6px 0' }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
          strong: ({ children }) => <strong>{children}</strong>,
          hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--zs-border)', margin: '12px 0' }} />,
          blockquote: ({ children }) => <blockquote style={{ margin: '8px 0', padding: '2px 12px', borderLeft: '3px solid var(--zs-border)', color: 'var(--zs-text-2)', background: 'var(--zs-surface-2)', borderRadius: 4 }}>{children}</blockquote>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '8px 0' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead style={{ background: 'var(--zs-surface-2)' }}>{children}</thead>,
          th: ({ children }) => <th style={{ border: '1px solid var(--zs-border)', padding: '6px 10px', textAlign: 'left' }}>{children}</th>,
          td: ({ children }) => <td style={{ border: '1px solid var(--zs-border)', padding: '6px 10px' }}>{children}</td>,
          code: ({ children, className }) => {
            // react-markdown v9+ 移除了 inline 属性：无语言类名且无换行即视为行内代码
            const isInline = !className && !String(children ?? '').includes('\n');
            if (isInline) return <code style={{ background: 'var(--zs-border-2)', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em', fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{children}</code>;
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
