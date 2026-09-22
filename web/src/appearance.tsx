import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/* ═══════════════ 外观(主题 + 壁纸)全局状态 ═══════════════ */

export interface Wallpaper {
  type: 'none' | 'gradient' | 'color' | 'image';
  value: string;    // 渐变 CSS / 颜色 / 图片 URL 或 dataURL
  blur: number;     // 0-24 px
  dim: number;      // 0-0.8 图片暗化
  glass: boolean;   // 卡片/侧栏半透明毛玻璃
}
export const DEFAULT_WALLPAPER: Wallpaper = { type: 'none', value: '', blur: 0, dim: 0, glass: false };

export const GRADIENTS: { name: string; css: string }[] = [
  { name: '极光', css: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { name: '深海', css: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)' },
  { name: '晨曦', css: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
  { name: '青碧', css: 'linear-gradient(135deg, #096979 0%, #89f7fe 100%)' },
  { name: '紫罗兰', css: 'linear-gradient(135deg, #8e2de2 0%, #4a00e0 100%)' },
  { name: '熔岩', css: 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)' },
  { name: '森林', css: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
  { name: '夜空', css: 'radial-gradient(circle at 30% 20%, #1e3a8a 0%, #0b0f17 62%)' },
];

interface AppearanceCtx {
  dark: boolean;
  setDark: (v: boolean) => void;
  wallpaper: Wallpaper;
  setWallpaper: (w: Wallpaper) => void;
}
const Ctx = createContext<AppearanceCtx>(null as any);
export const useAppearance = () => useContext(Ctx);

function loadWallpaper(): Wallpaper {
  try { const s = localStorage.getItem('zs-wallpaper'); if (s) return { ...DEFAULT_WALLPAPER, ...JSON.parse(s) }; } catch { /* ignore */ }
  return DEFAULT_WALLPAPER;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('zs-theme') === 'dark'; } catch { return false; } });
  const [wallpaper, setWallpaper] = useState<Wallpaper>(loadWallpaper);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('zs-theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  }, [dark]);

  useEffect(() => {
    const el = document.documentElement;
    const has = wallpaper.type !== 'none' && !!wallpaper.value;
    el.classList.toggle('zs-has-wallpaper', has);
    el.classList.toggle('zs-glass', has && wallpaper.glass);
    try { localStorage.setItem('zs-wallpaper', JSON.stringify(wallpaper)); } catch { /* ignore */ }
  }, [wallpaper]);

  return <Ctx.Provider value={{ dark, setDark, wallpaper, setWallpaper }}>{children}</Ctx.Provider>;
}

/** 固定在最底层的壁纸图层 */
export function WallpaperLayer() {
  const { wallpaper } = useAppearance();
  if (wallpaper.type === 'none' || !wallpaper.value) return null;
  const style: CSSProperties = {
    filter: wallpaper.blur ? `blur(${wallpaper.blur}px)` : undefined,
    transform: wallpaper.blur ? 'scale(1.06)' : undefined,
  };
  if (wallpaper.type === 'color') {
    style.background = wallpaper.value;
  } else if (wallpaper.type === 'gradient') {
    style.backgroundImage = wallpaper.value;
  } else {
    style.backgroundImage = `linear-gradient(rgba(0,0,0,${wallpaper.dim}), rgba(0,0,0,${wallpaper.dim})), url(${JSON.stringify(wallpaper.value)})`;
  }
  return <div className="zs-wallpaper" style={style} />;
}
