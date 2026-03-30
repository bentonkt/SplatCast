import { SyncManager } from './sync';
import { SplatRenderer, parseSplatBuffer, parsePlyBuffer, computeBounds } from '../renderer/splat-renderer';
import { SplatData, DeviationResult } from '../types';

/**
 * Deviation colormap overlay — loads a reference scene, computes per-splat
 * nearest-neighbor geometric deviation, and renders a continuous green/yellow/red
 * color gradient overlay with adjustable tolerance for construction verification.
 */
export class DeviationColormapPanel {
  private panel: HTMLDivElement;
  private toggleBtn: HTMLButtonElement;
  private active = false;
  private overlay: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;
  private tolerance = 0.5;
  private toleranceSlider!: HTMLInputElement;
  private toleranceValue!: HTMLSpanElement;
  private statusLabel!: HTMLSpanElement;
  private computeBtn!: HTMLButtonElement;
  private dropZone!: HTMLDivElement;
  private referenceData: SplatData | null = null;
  private deviationResult: DeviationResult | null = null;

  constructor(
    private sync: SyncManager,
    private renderer: SplatRenderer,
  ) {
    this.overlay = document.createElement('canvas');
    this.overlay.id = 'deviation-overlay';
    this.overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:50;display:none;';
    document.body.appendChild(this.overlay);
    this.overlayCtx = this.overlay.getContext('2d')!;

    this.toggleBtn = this.createToggleButton();
    document.body.appendChild(this.toggleBtn);
    this.panel = this.createPanel();
    document.body.appendChild(this.panel);

    document.addEventListener('keydown', this.onKeyDown);

    this.sync.onDeviationChange((result) => {
      this.deviationResult = result;
      this.updateStatus();
      this.renderOverlay();
    });

    const canvas = this.renderer.getCanvas();
    if (canvas) {
      const rerender = () => {
        if (this.active && this.deviationResult) this.renderOverlay();
      };
      canvas.addEventListener('mouseup', rerender);
      canvas.addEventListener('wheel', rerender);
      canvas.addEventListener('touchend', rerender);
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.toggle();
    }
  };

  private toggle() {
    this.active = !this.active;
    this.panel.style.display = this.active ? 'block' : 'none';
    this.toggleBtn.style.borderColor = this.active ? '#4ecdc4' : 'transparent';
    this.overlay.style.display = this.active ? 'block' : 'none';
    if (this.active && this.deviationResult) {
      this.renderOverlay();
    }
  }

  private createToggleButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'deviation-toggle';
    btn.textContent = '\u{1F308}'; // rainbow
    btn.title = 'Deviation Colormap (M)';
    btn.style.cssText = `
      position:absolute;bottom:136px;right:12px;
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
    panel.id = 'deviation-panel';
    panel.style.cssText = `
      display:none;position:absolute;bottom:180px;right:12px;z-index:200;
      width:280px;background:rgba(22,33,62,0.95);color:#fff;font-family:monospace;
      border-radius:8px;padding:12px;font-size:13px;
      border:1px solid rgba(255,255,255,0.12);
    `;

    const title = document.createElement('div');
    title.textContent = 'Deviation Colormap';
    title.style.cssText = 'font-weight:bold;font-size:14px;margin-bottom:8px;color:#4ecdc4;';
    panel.appendChild(title);

    // Drop zone for reference scene
    this.dropZone = document.createElement('div');
    this.dropZone.id = 'deviation-drop-zone';
    this.dropZone.textContent = 'Drop reference .splat/.ply here';
    this.dropZone.style.cssText = `
      border:2px dashed rgba(255,255,255,0.3);border-radius:6px;
      padding:16px;text-align:center;margin-bottom:8px;
      color:rgba(255,255,255,0.5);font-size:12px;cursor:pointer;
    `;
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZone.style.borderColor = '#4ecdc4';
      this.dropZone.style.color = '#4ecdc4';
    });
    this.dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZone.style.borderColor = 'rgba(255,255,255,0.3)';
      this.dropZone.style.color = 'rgba(255,255,255,0.5)';
    });
    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZone.style.borderColor = 'rgba(255,255,255,0.3)';
      this.dropZone.style.color = 'rgba(255,255,255,0.5)';
      const file = e.dataTransfer?.files[0];
      if (file) this.loadReference(file);
    });
    panel.appendChild(this.dropZone);

    // Tolerance slider
    const tolRow = document.createElement('div');
    tolRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';

    const tolLabel = document.createElement('label');
    tolLabel.textContent = 'Tolerance:';
    tolLabel.style.cssText = 'flex-shrink:0;';
    tolRow.appendChild(tolLabel);

    this.toleranceSlider = document.createElement('input');
    this.toleranceSlider.id = 'deviation-tolerance';
    this.toleranceSlider.type = 'range';
    this.toleranceSlider.min = '0.01';
    this.toleranceSlider.max = '2';
    this.toleranceSlider.step = '0.01';
    this.toleranceSlider.value = '0.5';
    this.toleranceSlider.style.cssText = 'flex:1;accent-color:#4ecdc4;';
    this.toleranceSlider.addEventListener('input', () => {
      this.tolerance = parseFloat(this.toleranceSlider.value);
      this.toleranceValue.textContent = this.tolerance.toFixed(2);
      if (this.deviationResult) {
        this.renderOverlay();
      }
    });
    tolRow.appendChild(this.toleranceSlider);

    this.toleranceValue = document.createElement('span');
    this.toleranceValue.id = 'deviation-tolerance-value';
    this.toleranceValue.textContent = '0.50';
    this.toleranceValue.style.cssText = 'min-width:36px;text-align:right;color:#888;';
    tolRow.appendChild(this.toleranceValue);
    panel.appendChild(tolRow);

    // Compute button
    this.computeBtn = document.createElement('button');
    this.computeBtn.id = 'deviation-compute-btn';
    this.computeBtn.textContent = 'Compute Deviation';
    this.computeBtn.style.cssText = `
      width:100%;padding:8px;border:none;border-radius:4px;
      background:#4ecdc4;color:#1a1a2e;font-family:monospace;font-size:13px;
      cursor:pointer;font-weight:bold;margin-bottom:8px;
    `;
    this.computeBtn.addEventListener('click', () => this.computeDeviation());
    panel.appendChild(this.computeBtn);

    // Status label
    const statusRow = document.createElement('div');
    statusRow.style.cssText = 'margin-bottom:4px;';
    this.statusLabel = document.createElement('span');
    this.statusLabel.id = 'deviation-status';
    this.statusLabel.textContent = 'No reference loaded';
    this.statusLabel.style.cssText = 'color:#888;font-size:12px;';
    statusRow.appendChild(this.statusLabel);
    panel.appendChild(statusRow);

    // Legend
    const legend = document.createElement('div');
    legend.id = 'deviation-legend';
    legend.style.cssText = `
      display:flex;align-items:center;gap:4px;font-size:11px;color:#aaa;margin-top:4px;
    `;
    const gradientBar = document.createElement('div');
    gradientBar.style.cssText = `
      flex:1;height:10px;border-radius:3px;
      background:linear-gradient(to right, #00ff00, #ffff00, #ff0000);
    `;
    const labelLow = document.createElement('span');
    labelLow.textContent = '0';
    const labelHigh = document.createElement('span');
    labelHigh.textContent = 'tol';
    legend.appendChild(labelLow);
    legend.appendChild(gradientBar);
    legend.appendChild(labelHigh);
    panel.appendChild(legend);

    return panel;
  }

  private async loadReference(file: File) {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.splat') && !name.endsWith('.ply')) {
      this.statusLabel.textContent = 'Invalid file (use .splat or .ply)';
      return;
    }

    this.dropZone.textContent = 'Loading...';
    try {
      const buffer = await file.arrayBuffer();
      this.referenceData = name.endsWith('.ply')
        ? parsePlyBuffer(buffer)
        : parseSplatBuffer(buffer);
      this.dropZone.textContent = `Reference: ${file.name} (${this.referenceData.count} splats)`;
      this.statusLabel.textContent = 'Reference loaded — click Compute';
      this.statusLabel.style.color = '#4ecdc4';
    } catch {
      this.dropZone.textContent = 'Drop reference .splat/.ply here';
      this.statusLabel.textContent = 'Failed to load reference';
      this.statusLabel.style.color = '#ff6b6b';
    }
  }

  computeDeviation() {
    const currentData = this.renderer.getSplatData();
    if (!currentData || currentData.count === 0) {
      this.statusLabel.textContent = 'No scene loaded';
      this.statusLabel.style.color = '#ff6b6b';
      return;
    }

    // If no reference loaded, compare against self (compute internal variance)
    const refData = this.referenceData || currentData;

    this.computeBtn.textContent = 'Computing...';
    this.computeBtn.disabled = true;

    requestAnimationFrame(() => {
      const result = this.computeNearestNeighborDeviation(currentData, refData);
      this.deviationResult = result;
      this.sync.setDeviationResult(result);
      this.updateStatus();
      this.renderOverlay();
      this.computeBtn.textContent = 'Compute Deviation';
      this.computeBtn.disabled = false;
    });
  }

  /**
   * Compute per-splat nearest-neighbor distance from currentData to refData.
   * Uses a spatial grid for efficient lookups.
   */
  private computeNearestNeighborDeviation(current: SplatData, reference: SplatData): DeviationResult {
    const count = current.count;
    const deviations: number[] = new Array(count);

    // Build grid over reference positions for fast nearest-neighbor
    const bounds = computeBounds(reference);
    const cellSize = Math.max(bounds.extent * 0.05, 0.001);
    const grid = new Map<string, number[]>();

    for (let i = 0; i < reference.count; i++) {
      const gx = Math.floor(reference.positions[i * 3] / cellSize);
      const gy = Math.floor(reference.positions[i * 3 + 1] / cellSize);
      const gz = Math.floor(reference.positions[i * 3 + 2] / cellSize);
      const key = `${gx},${gy},${gz}`;
      const list = grid.get(key);
      if (list) {
        list.push(i);
      } else {
        grid.set(key, [i]);
      }
    }

    let maxDeviation = 0;

    for (let i = 0; i < count; i++) {
      const cx = current.positions[i * 3];
      const cy = current.positions[i * 3 + 1];
      const cz = current.positions[i * 3 + 2];

      const gx = Math.floor(cx / cellSize);
      const gy = Math.floor(cy / cellSize);
      const gz = Math.floor(cz / cellSize);

      let minDist = Infinity;

      // Search 3x3x3 neighborhood in grid
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const nkey = `${gx + dx},${gy + dy},${gz + dz}`;
            const cell = grid.get(nkey);
            if (!cell) continue;
            for (const j of cell) {
              const rx = reference.positions[j * 3];
              const ry = reference.positions[j * 3 + 1];
              const rz = reference.positions[j * 3 + 2];
              const dx2 = cx - rx;
              const dy2 = cy - ry;
              const dz2 = cz - rz;
              const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2 + dz2 * dz2);
              if (dist < minDist) minDist = dist;
            }
          }
        }
      }

      // If no neighbors found in grid (isolated splat), use large deviation
      if (minDist === Infinity) minDist = cellSize * 3;

      deviations[i] = minDist;
      if (minDist > maxDeviation) maxDeviation = minDist;
    }

    return {
      deviations,
      maxDeviation,
      tolerance: this.tolerance,
      count,
    };
  }

  private updateStatus() {
    if (!this.deviationResult) {
      this.statusLabel.textContent = 'No reference loaded';
      this.statusLabel.style.color = '#888';
      return;
    }
    const avgDev = this.deviationResult.deviations.reduce((s, v) => s + v, 0) / this.deviationResult.count;
    this.statusLabel.textContent = `${this.deviationResult.count} splats — avg deviation: ${avgDev.toFixed(4)} — max: ${this.deviationResult.maxDeviation.toFixed(4)}`;
    this.statusLabel.style.color = '#4ecdc4';
  }

  /**
   * Render per-splat deviation as colored circles projected onto the viewport.
   * Green = 0 deviation, Yellow = half tolerance, Red = at/above tolerance.
   */
  private renderOverlay() {
    const canvas = this.renderer.getCanvas();
    if (!canvas) return;

    const w = canvas.width;
    const h = canvas.height;
    this.overlay.width = w;
    this.overlay.height = h;

    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, w, h);

    if (!this.active || !this.deviationResult) return;

    const data = this.renderer.getSplatData();
    if (!data) return;

    const aspect = w / h;
    const cam = (window as Record<string, unknown>)['__camera'] as { getViewMatrix: () => Float32Array; getProjectionMatrix: (aspect: number) => Float32Array } | undefined;
    if (!cam) return;

    const view = cam.getViewMatrix();
    const proj = cam.getProjectionMatrix(aspect);

    const deviations = this.deviationResult.deviations;
    const tol = this.tolerance;
    const count = Math.min(data.count, deviations.length);

    // Render as a density-like overlay: accumulate deviation colors
    // For performance, sample evenly if count is very large
    const step = count > 5000 ? Math.ceil(count / 5000) : 1;

    for (let i = 0; i < count; i += step) {
      const x = data.positions[i * 3];
      const y = data.positions[i * 3 + 1];
      const z = data.positions[i * 3 + 2];

      // View transform
      const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
      const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
      const vz = view[2] * x + view[6] * y + view[10] * z + view[14];
      const vw = view[3] * x + view[7] * y + view[11] * z + view[15];

      // Projection
      const cx2 = proj[0] * vx + proj[4] * vy + proj[8] * vz + proj[12] * vw;
      const cy2 = proj[1] * vx + proj[5] * vy + proj[9] * vz + proj[13] * vw;
      const cw2 = proj[3] * vx + proj[7] * vy + proj[11] * vz + proj[15] * vw;

      if (cw2 <= 0) continue;

      const ndcX = cx2 / cw2;
      const ndcY = cy2 / cw2;

      const sx = (ndcX * 0.5 + 0.5) * w;
      const sy = (1.0 - (ndcY * 0.5 + 0.5)) * h;

      if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;

      const t = Math.min(deviations[i] / tol, 1.0);
      const [r, g, b] = deviationToColor(t);

      const radius = 4 + t * 4;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.4 + t * 0.4})`;
      ctx.fill();
    }
  }
}

/**
 * Map a normalized deviation [0..1] to green → yellow → red.
 */
function deviationToColor(t: number): [number, number, number] {
  if (t < 0.5) {
    // Green → Yellow
    const s = t / 0.5;
    return [Math.round(s * 255), 255, 0];
  } else {
    // Yellow → Red
    const s = (t - 0.5) / 0.5;
    return [255, Math.round((1 - s) * 255), 0];
  }
}
