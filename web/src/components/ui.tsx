import type { ReactNode } from 'react';
import { Progress } from 'antd';

/* ═══════════════ 通用 UI 小部件(全站复用, 统一视觉语言) ═══════════════ */

/** 渐变统计卡: 用于各页顶部 KPI */
export function StatCard({ title, value, suffix, icon, color = '#2f6bff', hint, progress, onClick, loading }: {
  title: ReactNode; value: ReactNode; suffix?: ReactNode; icon?: ReactNode;
  color?: string; hint?: ReactNode; progress?: number; onClick?: () => void; loading?: boolean;
}) {
  return (
    <div className={'ui-stat' + (onClick ? ' clickable' : '')} style={{ ['--c' as any]: color }} onClick={onClick}>
      <div className="ui-stat-top">
        {icon && <span className="ui-stat-icon">{icon}</span>}
        <div style={{ minWidth: 0 }}>
          <div className="ui-stat-value">
            {loading ? '—' : value}{suffix && <span className="ui-stat-suffix">{suffix}</span>}
          </div>
          <div className="ui-stat-title">{title}</div>
        </div>
      </div>
      {typeof progress === 'number' && <Progress percent={progress} showInfo={false} strokeColor={color} size="small" />}
      {hint && <div className="ui-stat-hint">{hint}</div>}
    </div>
  );
}

/** 工具条: 左侧操作 + 右侧附加 */
export function Toolbar({ children, extra }: { children?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="ui-toolbar">
      {children}
      {extra && <div className="ui-toolbar-extra">{extra}</div>}
    </div>
  );
}

/** 区块标题 */
export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="ui-section-title">
      {children}
      {extra && <span className="ui-section-extra">{extra}</span>}
    </div>
  );
}

/** 统一空状态 */
export function EmptyHint({ icon, text, action }: { icon?: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      {icon && <div className="ui-empty-icon">{icon}</div>}
      <div>{text || '暂无数据'}</div>
      {action}
    </div>
  );
}
