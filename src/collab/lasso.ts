import { SyncManager } from './sync';
import { SplatRenderer } from '../renderer/splat-renderer';
import { OrbitCamera } from '../renderer/camera';

export class LassoPanel {
  private btn: HTMLButtonElement;
  private hideBtn: HTMLButtonElement;
  private isolateBtn: HTMLButtonElement;
  private showAllBtn: HTMLButtonElement;
  private toolbar: HTMLDivElement;
  private svg: SVGSVGElement;
  private active = false;
  private drawing = false;
  private lassoPoints: { x: number; y: number }[] = [];
  private pathEl: SVGPathElement;

  constructor(
    private canvas: HTMLCanvasElement,
    private sync: SyncManager,
    private renderer: SplatRenderer,
    private camera: OrbitCamera,
  ) {
    this.btn = this.createToggleButton();
    document.body.appendChild(this.btn);

    this.toolbar = this.createToolbar();
    document.body.appendChild(this.toolbar);

    this.svg = this.createSvgOverlay();
    document.body.appendChild(this.svg);

    this.pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.pathEl.setAttribute('fill', 'rgba(78,205,196,0.15)');
    this.pathEl.setAttribute('stroke', '#4ecdc4');
    this.pathEl.setAttribute('stroke-width', '2');
    this.pathEl.setAttribute('stroke-dasharray', '6 3');
    this.svg.appendChild(this.pathEl);

    this.hideBtn = this.toolbar.querySelector('#lasso-hide-btn')!;
    this.isolateBtn = this.toolbar.querySelector('#lasso-isolate-btn')!;
    this.showAllBtn = this.toolbar.querySelector('#lasso-show-all-btn')!;

    this.hideBtn.addEventListener('click', () => this.applySelection('hide'));
    this.isolateBtn.addEventListener('click', () => this.applySelection('isolate'));
    this.showAllBtn.addEventListener('click', () => this.showAll());

    this.svg.addEventListener('mousedown', this.onMouseDown);
    this.svg.addEventListener('mousemove', this.onMouseMove);
    this.svg.addEventListener('mouseup', this.onMouseUp);

    document.addEventListener('keydown', this.onKeyDown);

    // Sync hidden splats from other users
    this.sync.onHiddenSplatsChange((indices) => {
      this.renderer.setHiddenIndices(new Set(indices));
      this.updateShowAllVisibility(indices.length);
    });

    // Apply any initial hidden state
    const initial = this.sync.getHiddenSplats();
    if (initial.length > 0) {
      this.renderer.setHiddenIndices(new Set(initial));
      this.updateShowAllVisibility(initial.length);
    }
  }

  private createToggleButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'lasso-toggle-btn';
    btn.textContent = '\u2B55';
    btn.title = 'Lasso select (L)';
    btn.style.cssText = `
      position:absolute;bottom:12px;left:300px;
      width:36px;height:36px;border:2px solid transparent;border-radius:6px;
      background:rgba(30,30,50,0.85);cursor:pointer;font-size:16px;
      display:flex;align-items:center;justify-content:center;
      color:white;pointer-events:auto;z-index:100;
    `;
    btn.addEventListener('click', () => this.toggleLassoMode());
    return btn;
  }

  private createToolbar(): HTMLDivElement {
    const div = document.createElement('div');
    div.id = 'lasso-toolbar';
    div.style.cssText = `
      position:absolute;bottom:54px;left:300px;
      display:none;flex-direction:row;gap:4px;
      padding:4px;border-radius:6px;
      background:rgba(30,30,50,0.9);border:1px solid rgba(78,205,196,0.4);
      z-index:200;pointer-events:auto;
    `;

    const mkBtn = (id: string, label: string, title: string) => {
      const b = document.createElement('button');
      b.id = id;
      b.textContent = label;
      b.title = title;
      b.style.cssText = `
        padding:4px 8px;border:1px solid rgba(78,205,196,0.4);border-radius:4px;
        background:rgba(30,30,50,0.85);color:#4ecdc4;cursor:pointer;
        font:12px system-ui,sans-serif;
      `;
      return b;
    };

    div.appendChild(mkBtn('lasso-hide-btn', 'Hide', 'Hide selected splats'));
    div.appendChild(mkBtn('lasso-isolate-btn', 'Isolate', 'Show only selected splats'));
    div.appendChild(mkBtn('lasso-show-all-btn', 'Show All', 'Show all splats'));

    return div;
  }

  private createSvgOverlay(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'lasso-overlay';
    svg.style.cssText = `
      position:absolute;top:0;left:0;width:100%;height:100%;
      pointer-events:none;z-index:50;
    `;
    return svg;
  }

  private toggleLassoMode() {
    this.active = !this.active;
    this.btn.style.borderColor = this.active ? '#4ecdc4' : 'transparent';
    this.toolbar.style.display = this.active ? 'flex' : 'none';
    this.svg.style.pointerEvents = this.active ? 'auto' : 'none';
    this.svg.style.cursor = this.active ? 'crosshair' : 'default';
    if (!this.active) {
      this.clearLasso();
    }
  }

  private onMouseDown = (e: MouseEvent) => {
    if (!this.active || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.drawing = true;
    this.lassoPoints = [{ x: e.clientX, y: e.clientY }];
    this.updatePath();
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.drawing) return;
    e.preventDefault();
    e.stopPropagation();
    this.lassoPoints.push({ x: e.clientX, y: e.clientY });
    this.updatePath();
  };

  private onMouseUp = (e: MouseEvent) => {
    if (!this.drawing) return;
    e.preventDefault();
    e.stopPropagation();
    this.drawing = false;
    // Close the path
    if (this.lassoPoints.length > 2) {
      this.updatePath(true);
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.toggleLassoMode();
    }
  };

  private updatePath(closed = false) {
    if (this.lassoPoints.length === 0) {
      this.pathEl.setAttribute('d', '');
      return;
    }
    let d = `M ${this.lassoPoints[0].x} ${this.lassoPoints[0].y}`;
    for (let i = 1; i < this.lassoPoints.length; i++) {
      d += ` L ${this.lassoPoints[i].x} ${this.lassoPoints[i].y}`;
    }
    if (closed) d += ' Z';
    this.pathEl.setAttribute('d', d);
  }

  private clearLasso() {
    this.lassoPoints = [];
    this.pathEl.setAttribute('d', '');
    this.drawing = false;
  }

  private applySelection(mode: 'hide' | 'isolate') {
    if (this.lassoPoints.length < 3) return;

    const positions = this.renderer.getSplatPositions();
    const count = this.renderer.getSplatCount();
    if (!positions || count === 0) return;

    const aspect = this.canvas.width / this.canvas.height;
    const view = this.camera.getViewMatrix();
    const proj = this.camera.getProjectionMatrix(aspect);

    // Build combined view-projection matrix
    const vp = mulMat4(proj, view);

    // Find splats inside the lasso polygon
    const selectedIndices: number[] = [];
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;

    for (let i = 0; i < count; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];

      // Project to clip space
      const cx = vp[0] * px + vp[4] * py + vp[8] * pz + vp[12];
      const cy = vp[1] * px + vp[5] * py + vp[9] * pz + vp[13];
      const cw = vp[3] * px + vp[7] * py + vp[11] * pz + vp[15];

      if (cw <= 0) continue; // Behind camera

      // NDC to screen
      const ndcX = cx / cw;
      const ndcY = cy / cw;
      const screenX = (ndcX * 0.5 + 0.5) * canvasW;
      const screenY = (1 - (ndcY * 0.5 + 0.5)) * canvasH;

      if (pointInPolygon(screenX, screenY, this.lassoPoints)) {
        selectedIndices.push(i);
      }
    }

    if (selectedIndices.length === 0) {
      this.clearLasso();
      return;
    }

    const currentHidden = new Set(this.sync.getHiddenSplats());

    let newHidden: number[];
    if (mode === 'hide') {
      // Add selected to hidden
      for (const idx of selectedIndices) {
        currentHidden.add(idx);
      }
      newHidden = Array.from(currentHidden);
    } else {
      // Isolate: hide everything except selected
      const selectedSet = new Set(selectedIndices);
      newHidden = [];
      for (let i = 0; i < count; i++) {
        if (!selectedSet.has(i)) {
          newHidden.push(i);
        }
      }
    }

    this.renderer.setHiddenIndices(new Set(newHidden));
    this.sync.setHiddenSplats(newHidden);
    this.updateShowAllVisibility(newHidden.length);
    this.clearLasso();
  }

  private showAll() {
    this.renderer.setHiddenIndices(new Set());
    this.sync.setHiddenSplats([]);
    this.updateShowAllVisibility(0);
    this.clearLasso();
  }

  private updateShowAllVisibility(hiddenCount: number) {
    this.showAllBtn.style.opacity = hiddenCount > 0 ? '1' : '0.4';
  }

  destroy() {
    document.removeEventListener('keydown', this.onKeyDown);
    this.svg.removeEventListener('mousedown', this.onMouseDown);
    this.svg.removeEventListener('mousemove', this.onMouseMove);
    this.svg.removeEventListener('mouseup', this.onMouseUp);
    this.btn.remove();
    this.toolbar.remove();
    this.svg.remove();
  }
}

/** Point-in-polygon test using ray casting */
function pointInPolygon(x: number, y: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Multiply two column-major 4x4 matrices */
function mulMat4(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}
