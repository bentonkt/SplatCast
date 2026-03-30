import { SplatRenderer } from './splat-renderer';
import { OrbitCamera } from './camera';

export class SplatInspector {
  private active = false;
  private tooltip: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private renderer: SplatRenderer;
  private camera: OrbitCamera;
  private dragDistance = 0;
  private mouseDownPos: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement, renderer: SplatRenderer, camera: OrbitCamera) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.camera = camera;

    this.tooltip = document.createElement('div');
    this.tooltip.id = 'splat-inspector-tooltip';
    this.tooltip.style.cssText = `
      position:absolute;display:none;z-index:200;
      background:rgba(20,20,40,0.95);border:1px solid rgba(255,255,255,0.2);
      border-radius:8px;padding:10px 14px;pointer-events:none;
      font-family:monospace;font-size:12px;color:#ddd;
      line-height:1.6;white-space:nowrap;
      box-shadow:0 4px 16px rgba(0,0,0,0.5);
    `;
    document.body.appendChild(this.tooltip);

    this.createToggleButton();

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'i' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.toggle();
      }
    });

    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this.active) return;
      this.mouseDownPos = { x: e.clientX, y: e.clientY };
      this.dragDistance = 0;
    });

    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.active || !this.mouseDownPos) return;
      const dx = e.clientX - this.mouseDownPos.x;
      const dy = e.clientY - this.mouseDownPos.y;
      this.dragDistance = Math.sqrt(dx * dx + dy * dy);
    });

    canvas.addEventListener('mouseup', (e: MouseEvent) => {
      if (!this.active) return;
      if (this.dragDistance < 5 && this.mouseDownPos) {
        this.inspect(e.clientX, e.clientY);
      }
      this.mouseDownPos = null;
      this.dragDistance = 0;
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
    btn.id = 'inspector-btn';
    btn.textContent = '\uD83D\uDD0D';
    btn.title = 'Splat inspector (I)';
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
    const btn = document.getElementById('inspector-btn') as HTMLButtonElement | null;
    if (btn) {
      btn.style.borderColor = this.active ? '#4ecdc4' : 'transparent';
      btn.style.background = this.active ? 'rgba(78,205,196,0.25)' : 'rgba(255,255,255,0.1)';
    }
    if (!this.active) {
      this.tooltip.style.display = 'none';
    }
    this.canvas.style.cursor = this.active ? 'crosshair' : '';
  }

  isActive(): boolean {
    return this.active;
  }

  private inspect(clientX: number, clientY: number) {
    const data = this.renderer.getSplatData();
    if (!data || data.count === 0) {
      this.tooltip.style.display = 'none';
      return;
    }

    const aspect = this.canvas.width / this.canvas.height;
    const view = this.camera.getViewMatrix();
    const proj = this.camera.getProjectionMatrix(aspect);

    // Find nearest splat to click position in screen space
    let bestIdx = -1;
    let bestDist = Infinity;
    const threshold = 20; // pixels

    for (let i = 0; i < data.count; i++) {
      const px = data.positions[i * 3];
      const py = data.positions[i * 3 + 1];
      const pz = data.positions[i * 3 + 2];

      // World -> clip space
      const vx = view[0] * px + view[4] * py + view[8] * pz + view[12];
      const vy = view[1] * px + view[5] * py + view[9] * pz + view[13];
      const vz = view[2] * px + view[6] * py + view[10] * pz + view[14];
      const vw = view[3] * px + view[7] * py + view[11] * pz + view[15];

      const cx = proj[0] * vx + proj[4] * vy + proj[8] * vz + proj[12] * vw;
      const cy = proj[1] * vx + proj[5] * vy + proj[9] * vz + proj[13] * vw;
      const cw = proj[3] * vx + proj[7] * vy + proj[11] * vz + proj[15] * vw;

      if (cw <= 0) continue; // behind camera

      const ndcX = cx / cw;
      const ndcY = cy / cw;

      const screenX = (ndcX + 1) / 2 * this.canvas.width;
      const screenY = (1 - ndcY) / 2 * this.canvas.height;

      const dx = screenX - clientX;
      const dy = screenY - clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < bestDist && dist < threshold) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) {
      this.tooltip.style.display = 'none';
      return;
    }

    // Extract properties
    const x = data.positions[bestIdx * 3].toFixed(3);
    const y = data.positions[bestIdx * 3 + 1].toFixed(3);
    const z = data.positions[bestIdx * 3 + 2].toFixed(3);

    const r = data.colors[bestIdx * 4];
    const g = data.colors[bestIdx * 4 + 1];
    const b = data.colors[bestIdx * 4 + 2];
    const a = data.colors[bestIdx * 4 + 3];

    const c00 = data.covariances[bestIdx * 6];
    const c11 = data.covariances[bestIdx * 6 + 3];
    const c22 = data.covariances[bestIdx * 6 + 5];
    const scale = Math.sqrt((c00 + c11 + c22) / 3);

    const r8 = Math.round(r * 255);
    const g8 = Math.round(g * 255);
    const b8 = Math.round(b * 255);
    const hexColor = `#${r8.toString(16).padStart(2, '0')}${g8.toString(16).padStart(2, '0')}${b8.toString(16).padStart(2, '0')}`;

    this.tooltip.innerHTML = `
      <div style="font-weight:bold;margin-bottom:4px;color:#4ecdc4;">Splat #${bestIdx}</div>
      <div><span style="color:#888;">XYZ:</span> ${x}, ${y}, ${z}</div>
      <div><span style="color:#888;">RGB:</span> <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${hexColor};vertical-align:middle;margin-right:4px;border:1px solid rgba(255,255,255,0.3);"></span>${r8}, ${g8}, ${b8}</div>
      <div><span style="color:#888;">Opacity:</span> ${a.toFixed(3)}</div>
      <div><span style="color:#888;">Scale:</span> ${scale.toFixed(4)}</div>
    `;
    this.tooltip.style.display = 'block';

    // Position tooltip near cursor, keeping it on-screen
    let tooltipX = clientX + 16;
    let tooltipY = clientY - 16;
    const tooltipRect = this.tooltip.getBoundingClientRect();
    if (tooltipX + tooltipRect.width > window.innerWidth) {
      tooltipX = clientX - tooltipRect.width - 16;
    }
    if (tooltipY < 0) {
      tooltipY = clientY + 16;
    }
    this.tooltip.style.left = `${tooltipX}px`;
    this.tooltip.style.top = `${tooltipY}px`;
  }
}
