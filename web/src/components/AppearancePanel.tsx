import { useState } from 'react';
import { Drawer, Segmented, Space, Button, Slider, Switch, Input, ColorPicker, Upload, Typography, Divider, App } from 'antd';
import { BgColorsOutlined, UploadOutlined, ClearOutlined, CheckOutlined } from '@ant-design/icons';
import { useAppearance, GRADIENTS, DEFAULT_WALLPAPER, type Wallpaper } from '../appearance';

const { Text } = Typography;

export default function AppearancePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wallpaper, setWallpaper } = useAppearance();
  const { message } = App.useApp();
  const [url, setUrl] = useState('');
  const patch = (p: Partial<Wallpaper>) => setWallpaper({ ...wallpaper, ...p });

  const setType = (t: Wallpaper['type']) => {
    if (t === 'none') return patch({ type: 'none', value: '' });
    if (t === 'gradient') return patch({ type: 'gradient', value: wallpaper.type === 'gradient' && wallpaper.value ? wallpaper.value : GRADIENTS[0].css });
    if (t === 'color') return patch({ type: 'color', value: wallpaper.type === 'color' && wallpaper.value ? wallpaper.value : '#0b1220' });
    return patch({ type: 'image', value: wallpaper.type === 'image' ? wallpaper.value : '' });
  };

  const uploadImg = (file: File) => {
    if (file.size > 2.5 * 1024 * 1024) { message.warning('图片过大(>2.5MB),请压缩后再上传,或改用图片 URL'); return false; }
    const rd = new FileReader();
    rd.onload = () => patch({ type: 'image', value: String(rd.result || '') });
    rd.readAsDataURL(file);
    return false;
  };

  const isImage = wallpaper.type === 'image';
  const active = wallpaper.type !== 'none' && !!wallpaper.value;

  return (
    <Drawer
      title={<Space><BgColorsOutlined />外观 / 壁纸</Space>}
      placement="right" width={400} open={open} onClose={onClose}
      extra={<Button size="small" icon={<ClearOutlined />} disabled={!active} onClick={() => setWallpaper({ ...DEFAULT_WALLPAPER })}>清除</Button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>壁纸类型</div>
          <Segmented block value={wallpaper.type} onChange={(v) => setType(v as Wallpaper['type'])}
            options={[{ label: '无', value: 'none' }, { label: '渐变', value: 'gradient' }, { label: '单色', value: 'color' }, { label: '图片', value: 'image' }]} />
        </div>

        {wallpaper.type === 'gradient' && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>渐变预设</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {GRADIENTS.map((g) => {
                const on = wallpaper.value === g.css;
                return (
                  <div key={g.name} onClick={() => patch({ type: 'gradient', value: g.css })} title={g.name}
                    style={{ position: 'relative', height: 58, borderRadius: 10, cursor: 'pointer', backgroundImage: g.css, border: on ? '2px solid #2f6bff' : '1px solid var(--zs-border)', boxShadow: on ? '0 0 0 3px rgba(47,107,255,.2)' : undefined }}>
                    {on && <span style={{ position: 'absolute', right: 4, bottom: 4, width: 18, height: 18, borderRadius: '50%', background: '#2f6bff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}><CheckOutlined /></span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {wallpaper.type === 'color' && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>背景颜色</div>
            <Space>
              <ColorPicker value={wallpaper.value || '#0b1220'} onChange={(_, hex) => patch({ type: 'color', value: hex })} showText />
              <Text type="secondary" style={{ fontSize: 12 }}>选一个纯色背景</Text>
            </Space>
          </div>
        )}

        {isImage && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>图片壁纸</div>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Space.Compact style={{ width: '100%' }}>
                <Input placeholder="粘贴图片 URL (https://…)" value={url} onChange={(e) => setUrl(e.target.value)} onPressEnter={() => url.trim() && patch({ type: 'image', value: url.trim() })} />
                <Button type="primary" onClick={() => url.trim() ? patch({ type: 'image', value: url.trim() }) : message.warning('请填写图片 URL')}>应用</Button>
              </Space.Compact>
              <Upload accept="image/*" showUploadList={false} beforeUpload={(f) => uploadImg(f as unknown as File)}>
                <Button icon={<UploadOutlined />}>本地上传图片(≤2.5MB)</Button>
              </Upload>
              {wallpaper.value && <div style={{ height: 110, borderRadius: 10, border: '1px solid var(--zs-border)', backgroundImage: `url(${JSON.stringify(wallpaper.value)})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
            </Space>
          </div>
        )}

        {active && (
          <>
            <Divider style={{ margin: '2px 0' }} />
            {isImage && (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>图片暗化遮罩 <Text type="secondary" style={{ fontSize: 12 }}>{Math.round(wallpaper.dim * 100)}%</Text></div>
                <Slider min={0} max={0.8} step={0.05} value={wallpaper.dim} onChange={(v) => patch({ dim: v as number })} tooltip={{ formatter: (v) => `${Math.round((v as number) * 100)}%` }} />
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>模糊 <Text type="secondary" style={{ fontSize: 12 }}>{wallpaper.blur}px</Text></div>
              <Slider min={0} max={24} value={wallpaper.blur} onChange={(v) => patch({ blur: v as number })} />
            </div>
            <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
              <div>
                <div style={{ fontWeight: 600 }}>毛玻璃</div>
                <Text type="secondary" style={{ fontSize: 12 }}>卡片/侧栏半透明,透出壁纸</Text>
              </div>
              <Switch checked={wallpaper.glass} onChange={(v) => patch({ glass: v })} />
            </Space>
          </>
        )}

        <Divider style={{ margin: '2px 0' }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          壁纸设置保存在本浏览器,不影响其他设备。图片建议用深色或已暗化,以获得最佳可读性;配合右上角 💡 深色模式效果更好。
        </Text>
      </div>
    </Drawer>
  );
}
