import { SyncManager } from './sync';
import { SplatRenderer, computeBounds } from '../renderer/splat-renderer';
import { Defect, SplatData } from '../types';

/**
 * AI-assisted defect detection — analyzes splat density, color, and opacity
 * to flag regions that deviate significantly from their local neighborhood.
 * Uses statistical outlier detection (z-score based) rather than external APIs.
 */
export class DefectDetector {
  private panel: HTMLDivElement;
  private toggleBtn: HTMLButtonElement;
  private active = false;
  private overlay: HTMLDivElement;
  private defects: Defect[] = [];
  private sensitivity = 2.0; // z-score threshold
  private sensSlider!: HTMLInputElement;
  private countLabel!: HTMLSpanElement;
  private listEl!: HTMLDivElement;
  private runBtn!: HTMLButtonElement;

  constructor(
    private sync: SyncManager,
    private renderer: SplatRenderer,
  ) {
    this.overlay = document.createElement('div');
    this.overlay.id = 'defect-overlay';
    this.overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:50;';
    document.body.appendChild(this.overlay);

    this.toggleBtn = this.createToggleButton();
    document.body.appendChild(this.toggleBtn);
    this.panel = this.createPanel();
    document.body.appendChild(this.panel);

    document.addEventListener('keydown', this.onKeyDown);

    // Listen for synced defects from other users
    this.sync.onDefectsChange((defects) => {
      this.defects = defects;
      this.updateCountLabel();
      this.renderOverlay();
    });

    // Re-render overlay on camera changes (markers must track 3D positions)
    const canvas = this.renderer.getCanvas();
    if (canvas) {
      const rerender = () => {
        if (this.active) this.renderOverlay();
      };
      canvas.addEventListener('mouseup', rerender);
      canvas.addEventListener('wheel', rerender);
      canvas.addEventListener('touchend', rerender);
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    if (e.key === 'g' || e.key === 'G') {
      this.toggle();
    }
  };

  private toggle() {
    this.active = !this.active;
    this.panel.style.display = this.active ? 'block' : 'none';
    this.toggleBtn.style.borderColor = this.active ? '#ff6b6b' : 'transparent';
    this.overlay.style.display = this.active ? 'block' : 'none';
    if (this.active) {
      this.renderOverlay();
    }
  }

  private createToggleButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'defect-toggle';
    btn.textContent = '\u{1F50D}'; // magnifying glass
    btn.title = 'Defect Detection (G)';
    btn.style.cssText = `
      position:absolute;bottom:96px;right:12px;
      width:36px;height:36px;border:2px solid transparent;border-radius:6px;
      background:rgba(30,30,50,0.85);cursor:pointer;font-size:18px;
      display:flex;align-items:center;justify-content:center;
      color:white;pointer-events:auto;z-index:100;
    `;
    btn.addEventListener('click', () => this.toggle());
    return btn;
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'defect-panel';
    panel.style.cssText = `
      display:none;position:absolute;bottom:140px;right:12px;z-index:200;
      width:280px;background:rgba(22,33,62,0.95);color:#fff;font-family:monospace;
      border-radius:8px;padding:12px;font-size:13px;
      border:1px solid rgba(255,255,255,0.12);
    `;

    const title = document.createElement('div');
    title.textContent = 'Defect Detection';
    title.style.cssText = 'font-weight:bold;font-size:14px;margin-bottom:8px;color:#ff6b6b;';
    panel.appendChild(title);

    // Sensitivity slider
    const sensRow = document.createElement('div');
    sensRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';

    const sensLabel = document.createElement('label');
    sensLabel.textContent = 'Sensitivity:';
    sensLabel.style.cssText = 'flex-shrink:0;';
    sensRow.appendChild(sensLabel);

    this.sensSlider = document.createElement('input');
    this.sensSlider.id = 'defect-sensitivity';
    this.sensSlider.type = 'range';
    this.sensSlider.min = '0.5';
    this.sensSlider.max = '4';
    this.sensSlider.step = '0.1';
    this.sensSlider.value = '2';
    this.sensSlider.style.cssText = 'flex:1;accent-color:#ff6b6b;';
    this.sensSlider.addEventListener('input', () => {
      this.sensitivity = parseFloat(this.sensSlider.value);
      sensValue.textContent = this.sensitivity.toFixed(1);
    });
    sensRow.appendChild(this.sensSlider);

    const sensValue = document.createElement('span');
    sensValue.id = 'defect-sensitivity-value';
    sensValue.textContent = '2.0';
    sensValue.style.cssText = 'min-width:28px;text-align:right;color:#888;';
    sensRow.appendChild(sensValue);
    panel.appendChild(sensRow);

    // Run button
    this.runBtn = document.createElement('button');
    this.runBtn.id = 'defect-run-btn';
    this.runBtn.textContent = 'Run Analysis';
    this.runBtn.style.cssText = `
      width:100%;padding:8px;border:none;border-radius:4px;
      background:#ff6b6b;color:#fff;font-family:monospace;font-size:13px;
      cursor:pointer;font-weight:bold;margin-bottom:8px;
    `;
    this.runBtn.addEventListener('click', () => this.runDetection());
    panel.appendChild(this.runBtn);

    // Count label
    const countRow = document.createElement('div');
    countRow.style.cssText = 'margin-bottom:8px;';
    this.countLabel = document.createElement('span');
    this.countLabel.id = 'defect-count';
    this.countLabel.textContent = 'No defects detected';
    this.countLabel.style.cssText = 'color:#888;';
    countRow.appendChild(this.countLabel);
    panel.appendChild(countRow);

    // Defect list
    this.listEl = document.createElement('div');
    this.listEl.id = 'defect-list';
    this.listEl.style.cssText = 'max-height:200px;overflow-y:auto;';
    panel.appendChild(this.listEl);

    return panel;
  }

  private updateCountLabel() {
    const n = this.defects.length;
    this.countLabel.textContent = n === 0
      ? 'No defects detected'
      : `${n} defect${n > 1 ? 's' : ''} found`;
    this.countLabel.style.color = n > 0 ? '#ff6b6b' : '#888';
  }

  runDetection() {
    const data = this.renderer.getSplatData();
    if (!data || data.count === 0) {
      this.defects = [];
      this.sync.setDefects([]);
      this.updateCountLabel();
      this.renderDefectList();
      this.renderOverlay();
      return;
    }

    this.runBtn.textContent = 'Analyzing...';
    this.runBtn.disabled = true;

    // Use requestAnimationFrame to allow UI update before heavy computation
    requestAnimationFrame(() => {
      const defects = this.analyzeDefects(data);
      this.defects = defects;
      this.sync.setDefects(defects);
      this.updateCountLabel();
      this.renderDefectList();
      this.renderOverlay();
      this.runBtn.textContent = 'Run Analysis';
      this.runBtn.disabled = false;
    });
  }

  /**
   * Statistical anomaly detection over splat properties.
   * Computes global statistics, then flags splats whose properties
   * deviate beyond the sensitivity threshold (z-score).
   */
  private analyzeDefects(data: SplatData): Defect[] {
    const count = data.count;
    const threshold = this.sensitivity;
    const defects: Defect[] = [];

    // --- 1. Density anomalies: use a spatial grid to count neighbors ---
    const bounds = computeBounds(data);
    const cellSize = Math.max(bounds.extent * 0.1, 0.001);
    const densities = new Float32Array(count);
    const gridMap = new Map<string, number[]>();

    // Assign splats to grid cells
    for (let i = 0; i < count; i++) {
      const gx = Math.floor(data.positions[i * 3] / cellSize);
      const gy = Math.floor(data.positions[i * 3 + 1] / cellSize);
      const gz = Math.floor(data.positions[i * 3 + 2] / cellSize);
      const key = `${gx},${gy},${gz}`;
      const list = gridMap.get(key);
      if (list) {
        list.push(i);
      } else {
        gridMap.set(key, [i]);
      }
    }

    // Count neighbors (including self cell + 26 neighbors)
    for (let i = 0; i < count; i++) {
      const gx = Math.floor(data.positions[i * 3] / cellSize);
      const gy = Math.floor(data.positions[i * 3 + 1] / cellSize);
      const gz = Math.floor(data.positions[i * 3 + 2] / cellSize);
      let neighborCount = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const nkey = `${gx + dx},${gy + dy},${gz + dz}`;
            const cell = gridMap.get(nkey);
            if (cell) neighborCount += cell.length;
          }
        }
      }
      densities[i] = neighborCount;
    }

    // Compute density statistics
    const densityStats = computeStats(densities, count);

    // --- 2. Color anomalies: per-splat luminance deviation ---
    const luminances = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = data.colors[i * 4];
      const g = data.colors[i * 4 + 1];
      const b = data.colors[i * 4 + 2];
      luminances[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    const lumStats = computeStats(luminances, count);

    // --- 3. Opacity anomalies ---
    const opacities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      opacities[i] = data.colors[i * 4 + 3];
    }
    const opStats = computeStats(opacities, count);

    // --- Flag outliers ---
    for (let i = 0; i < count; i++) {
      const pos: [number, number, number] = [
        data.positions[i * 3],
        data.positions[i * 3 + 1],
        data.positions[i * 3 + 2],
      ];

      // Low density outliers (sparse regions)
      if (densityStats.std > 0) {
        const zDensity = (densities[i] - densityStats.mean) / densityStats.std;
        if (zDensity < -threshold) {
          defects.push({
            id: `density-${i}`,
            splatIndex: i,
            position: pos,
            type: 'density',
            severity: Math.min(1, Math.abs(zDensity) / (threshold * 2)),
            description: `Sparse region (z=${zDensity.toFixed(1)})`,
          });
          continue; // one defect per splat
        }
      }

      // Color outlier
      if (lumStats.std > 0) {
        const zLum = Math.abs(luminances[i] - lumStats.mean) / lumStats.std;
        if (zLum > threshold) {
          defects.push({
            id: `color-${i}`,
            splatIndex: i,
            position: pos,
            type: 'color',
            severity: Math.min(1, zLum / (threshold * 2)),
            description: `Color outlier (z=${zLum.toFixed(1)})`,
          });
          continue;
        }
      }

      // Opacity outlier (very low or very high compared to mean)
      if (opStats.std > 0) {
        const zOp = Math.abs(opacities[i] - opStats.mean) / opStats.std;
        if (zOp > threshold) {
          defects.push({
            id: `opacity-${i}`,
            splatIndex: i,
            position: pos,
            type: 'opacity',
            severity: Math.min(1, zOp / (threshold * 2)),
            description: `Opacity outlier (z=${zOp.toFixed(1)})`,
          });
        }
      }
    }

    // Limit to top 100 by severity
    defects.sort((a, b) => b.severity - a.severity);
    return defects.slice(0, 100);
  }

  private renderDefectList() {
    this.listEl.innerHTML = '';
    const typeColors: Record<string, string> = {
      density: '#ffd93d',
      color: '#4ecdc4',
      opacity: '#ff6b6b',
    };

    for (const d of this.defects.slice(0, 20)) {
      const row = document.createElement('div');
      row.className = 'defect-item';
      row.style.cssText = `
        padding:4px 6px;margin-bottom:4px;border-radius:4px;
        background:rgba(255,255,255,0.05);display:flex;align-items:center;gap:6px;
        font-size:11px;
      `;
      const dot = document.createElement('span');
      dot.style.cssText = `width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${typeColors[d.type] || '#fff'};`;
      row.appendChild(dot);

      const text = document.createElement('span');
      text.textContent = `${d.type}: ${d.description}`;
      text.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      row.appendChild(text);

      this.listEl.appendChild(row);
    }

    if (this.defects.length > 20) {
      const more = document.createElement('div');
      more.textContent = `+${this.defects.length - 20} more...`;
      more.style.cssText = 'color:#888;font-size:11px;padding:4px;';
      this.listEl.appendChild(more);
    }
  }

  /**
   * Render defect markers as colored circles projected onto the 2D viewport.
   * This uses simple perspective projection matching the camera.
   */
  private renderOverlay() {
    this.overlay.innerHTML = '';
    if (!this.active || this.defects.length === 0) return;

    const canvas = this.renderer.getCanvas();
    if (!canvas) return;

    const w = canvas.width;
    const h = canvas.height;
    const aspect = w / h;

    // We need view and projection matrices from the camera to project 3D → 2D
    // Access camera through the renderer's public methods
    const viewMatrix = (window as Record<string, unknown>)['__camera'] as { getViewMatrix: () => Float32Array; getProjectionMatrix: (aspect: number) => Float32Array } | undefined;
    if (!viewMatrix) return;

    const view = viewMatrix.getViewMatrix();
    const proj = viewMatrix.getProjectionMatrix(aspect);

    const typeColors: Record<string, string> = {
      density: '#ffd93d',
      color: '#4ecdc4',
      opacity: '#ff6b6b',
    };

    for (const defect of this.defects) {
      const [x, y, z] = defect.position;

      // Multiply by view matrix (column-major)
      const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
      const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
      const vz = view[2] * x + view[6] * y + view[10] * z + view[14];
      const vw = view[3] * x + view[7] * y + view[11] * z + view[15];

      // Multiply by projection matrix
      const cx = proj[0] * vx + proj[4] * vy + proj[8] * vz + proj[12] * vw;
      const cy = proj[1] * vx + proj[5] * vy + proj[9] * vz + proj[13] * vw;
      const cw = proj[3] * vx + proj[7] * vy + proj[11] * vz + proj[15] * vw;

      if (cw <= 0) continue; // behind camera

      const ndcX = cx / cw;
      const ndcY = cy / cw;

      // NDC to screen
      const sx = (ndcX * 0.5 + 0.5) * w;
      const sy = (1.0 - (ndcY * 0.5 + 0.5)) * h;

      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;

      const marker = document.createElement('div');
      marker.className = 'defect-marker';
      const color = typeColors[defect.type] || '#fff';
      const size = 12 + defect.severity * 12;
      marker.style.cssText = `
        position:absolute;
        left:${sx - size / 2}px;top:${sy - size / 2}px;
        width:${size}px;height:${size}px;
        border-radius:50%;
        border:2px solid ${color};
        background:${color}33;
        pointer-events:none;
      `;
      this.overlay.appendChild(marker);
    }
  }
}

function computeStats(arr: Float32Array, count: number): { mean: number; std: number } {
  if (count === 0) return { mean: 0, std: 0 };
  let sum = 0;
  for (let i = 0; i < count; i++) sum += arr[i];
  const mean = sum / count;
  let sqSum = 0;
  for (let i = 0; i < count; i++) {
    const d = arr[i] - mean;
    sqSum += d * d;
  }
  const std = Math.sqrt(sqSum / count);
  return { mean, std };
}
