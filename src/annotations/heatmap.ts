import { Annotation } from '../types';
import { SyncManager } from '../collab/sync';

export class HeatmapOverlay {
  private canvas: HTMLCanvasElement;
  private heatCanvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private active = false;
  private annotations: Annotation[] = [];
  private sourceCanvas: HTMLCanvasElement;

  constructor(sourceCanvas: HTMLCanvasElement, sync: SyncManager) {
    this.sourceCanvas = sourceCanvas;

    this.heatCanvas = document.createElement('canvas');
    this.heatCanvas.id = 'heatmap-canvas';
    this.heatCanvas.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:50;display:none;';
    document.body.appendChild(this.heatCanvas);

    this.canvas = this.heatCanvas;
    this.ctx = this.heatCanvas.getContext('2d')!;

    this.createToggleButton();

    sync.onAnnotationsChange((annotations) => {
      this.annotations = annotations;
      if (this.active) this.render();
    });

    this.annotations = sync.getAnnotations();

    window.addEventListener('resize', () => {
      if (this.active) this.render();
    });

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.toggle();
      }
    });
  }

  private createToggleButton() {
    const toolbar = document.getElementById('annotation-toolbar');
    if (!toolbar) return;

    const sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:24px;background:rgba(255,255,255,0.2);margin:0 4px;';
    toolbar.appendChild(sep);

    const btn = document.createElement('button');
    btn.className = 'toolbar-toggle-btn';
    btn.id = 'heatmap-btn';
    btn.textContent = '\uD83D\uDD25';
    btn.title = 'Toggle annotation heatmap (H)';
    btn.style.cssText = `
      width:36px;height:36px;border:2px solid transparent;border-radius:6px;
      background:rgba(255,255,255,0.1);cursor:pointer;font-size:18px;
      display:flex;align-items:center;justify-content:center;
      color:white;pointer-events:auto;
    `;
    btn.addEventListener('click', () => this.toggle());
    toolbar.appendChild(btn);
  }

  toggle() {
    this.active = !this.active;
    this.heatCanvas.style.display = this.active ? 'block' : 'none';
    const btn = document.getElementById('heatmap-btn') as HTMLButtonElement | null;
    if (btn) {
      btn.style.borderColor = this.active ? '#4ecdc4' : 'transparent';
      btn.style.background = this.active ? 'rgba(78,205,196,0.25)' : 'rgba(255,255,255,0.1)';
    }
    if (this.active) this.render();
  }

  isActive(): boolean {
    return this.active;
  }

  private ndcToScreen(ndc: [number, number, number]): { x: number; y: number } {
    return {
      x: (ndc[0] + 1) / 2 * this.sourceCanvas.width,
      y: (1 - (ndc[1] + 1) / 2) * this.sourceCanvas.height,
    };
  }

  private render() {
    const w = this.sourceCanvas.width;
    const h = this.sourceCanvas.height;
    this.heatCanvas.width = w;
    this.heatCanvas.height = h;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    // Only top-level, non-resolved annotations
    const points = this.annotations
      .filter((a) => !a.parentId && !a.resolved)
      .map((a) => this.ndcToScreen(a.position));

    if (points.length === 0) return;

    // Draw intensity layer (grayscale alpha)
    const radius = Math.max(60, Math.min(w, h) * 0.12);
    for (const pt of points) {
      const gradient = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
      gradient.addColorStop(0, 'rgba(0,0,0,0.6)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(pt.x - radius, pt.y - radius, radius * 2, radius * 2);
    }

    // Colorize: read pixels and map intensity to heatmap colors
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha === 0) continue;
      const intensity = alpha / 255;
      const [r, g, b] = this.intensityToColor(intensity);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = Math.round(intensity * 180);
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private intensityToColor(t: number): [number, number, number] {
    // Blue -> Cyan -> Green -> Yellow -> Red
    if (t < 0.25) {
      const s = t / 0.25;
      return [0, Math.round(s * 255), 255];
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25;
      return [0, 255, Math.round((1 - s) * 255)];
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25;
      return [Math.round(s * 255), 255, 0];
    } else {
      const s = (t - 0.75) / 0.25;
      return [255, Math.round((1 - s) * 255), 0];
    }
  }

  destroy() {
    this.heatCanvas.remove();
  }
}
