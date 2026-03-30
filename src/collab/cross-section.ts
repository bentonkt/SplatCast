import { SyncManager } from './sync';
import { SplatRenderer } from '../renderer/splat-renderer';
import { RoleManager } from './roles';

type SliceAxis = 'X' | 'Y' | 'Z';

interface SliceConfig {
  axis: SliceAxis;
  position: number;
  thickness: number;
}

export class CrossSectionExporter {
  private panel: HTMLDivElement;
  private toggleBtn: HTMLButtonElement;
  private active = false;
  private range = 2;
  private posSlider!: HTMLInputElement;
  private thickSlider!: HTMLInputElement;
  private axisSelect!: HTMLSelectElement;
  private previewSvg!: SVGSVGElement;

  constructor(
    private sync: SyncManager,
    private renderer: SplatRenderer,
  ) {
    this.toggleBtn = this.createToggleButton();
    document.body.appendChild(this.toggleBtn);
    this.panel = this.createPanel();
    document.body.appendChild(this.panel);

    document.addEventListener('keydown', this.onKeyDown);
  }

  setRange(extent: number) {
    this.range = Math.max(extent, 0.1);
    this.posSlider.min = String(-this.range);
    this.posSlider.max = String(this.range);
    this.posSlider.step = String(this.range / 50);
    this.posSlider.value = '0';
    this.thickSlider.max = String(this.range);
    this.thickSlider.step = String(this.range / 50);
    this.thickSlider.value = String(this.range * 0.1);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    if (e.key === 'x' || e.key === 'X') {
      this.toggle();
    }
  };

  private toggle() {
    this.active = !this.active;
    this.panel.style.display = this.active ? 'block' : 'none';
    this.toggleBtn.style.borderColor = this.active ? '#4ecdc4' : 'transparent';
    if (this.active) {
      this.updatePreview();
    }
  }

  private createToggleButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'cross-section-toggle';
    btn.textContent = '\u2702\uFE0F'; // ✂️ scissors
    btn.title = 'Cross-section 2D export (X)';
    btn.style.cssText = `
      position:absolute;bottom:56px;right:12px;
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
    panel.id = 'cross-section-panel';
    panel.style.cssText = `
      position:absolute;bottom:56px;right:56px;
      width:320px;padding:12px 14px;
      background:rgba(30,30,50,0.92);border-radius:8px;
      border:1px solid rgba(255,255,255,0.15);
      font:13px system-ui,sans-serif;color:#fff;
      z-index:200;pointer-events:auto;
      display:none;
    `;

    const title = document.createElement('div');
    title.textContent = 'Cross-Section Export';
    title.style.cssText = 'font-weight:bold;margin-bottom:10px;text-align:center;';
    panel.appendChild(title);

    // Axis selector
    const axisRow = this.createRow('Slice Axis');
    this.axisSelect = document.createElement('select');
    this.axisSelect.id = 'cross-section-axis';
    this.axisSelect.style.cssText = 'flex:1;background:#1a1a2e;color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:2px 4px;';
    for (const axis of ['X', 'Y', 'Z'] as const) {
      const opt = document.createElement('option');
      opt.value = axis;
      opt.textContent = `${axis} axis`;
      this.axisSelect.appendChild(opt);
    }
    this.axisSelect.addEventListener('change', () => this.updatePreview());
    axisRow.appendChild(this.axisSelect);
    panel.appendChild(axisRow);

    // Position slider
    const posRow = this.createRow('Position');
    this.posSlider = document.createElement('input');
    this.posSlider.type = 'range';
    this.posSlider.id = 'cross-section-position';
    this.posSlider.min = String(-this.range);
    this.posSlider.max = String(this.range);
    this.posSlider.step = String(this.range / 50);
    this.posSlider.value = '0';
    this.posSlider.style.cssText = 'flex:1;height:4px;cursor:pointer;accent-color:#4ecdc4;';
    this.posSlider.addEventListener('input', () => this.updatePreview());
    const posVal = document.createElement('span');
    posVal.id = 'cross-section-pos-val';
    posVal.style.cssText = 'min-width:40px;text-align:right;font-size:11px;';
    posVal.textContent = '0.00';
    posRow.appendChild(this.posSlider);
    posRow.appendChild(posVal);
    panel.appendChild(posRow);

    // Thickness slider
    const thickRow = this.createRow('Thickness');
    this.thickSlider = document.createElement('input');
    this.thickSlider.type = 'range';
    this.thickSlider.id = 'cross-section-thickness';
    this.thickSlider.min = '0.01';
    this.thickSlider.max = String(this.range);
    this.thickSlider.step = String(this.range / 50);
    this.thickSlider.value = String(this.range * 0.1);
    this.thickSlider.style.cssText = 'flex:1;height:4px;cursor:pointer;accent-color:#4ecdc4;';
    this.thickSlider.addEventListener('input', () => this.updatePreview());
    const thickVal = document.createElement('span');
    thickVal.id = 'cross-section-thick-val';
    thickVal.style.cssText = 'min-width:40px;text-align:right;font-size:11px;';
    thickVal.textContent = (this.range * 0.1).toFixed(2);
    thickRow.appendChild(this.thickSlider);
    thickRow.appendChild(thickVal);
    panel.appendChild(thickRow);

    // Preview area
    const previewContainer = document.createElement('div');
    previewContainer.style.cssText = 'margin-top:8px;background:#0a0a1a;border-radius:4px;border:1px solid rgba(255,255,255,0.1);overflow:hidden;';
    this.previewSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.previewSvg.id = 'cross-section-preview';
    this.previewSvg.setAttribute('width', '292');
    this.previewSvg.setAttribute('height', '200');
    this.previewSvg.style.cssText = 'display:block;';
    previewContainer.appendChild(this.previewSvg);
    panel.appendChild(previewContainer);

    // Point count label
    const countLabel = document.createElement('div');
    countLabel.id = 'cross-section-count';
    countLabel.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;text-align:center;';
    countLabel.textContent = '0 points in slice';
    panel.appendChild(countLabel);

    // Export SVG button
    const exportBtn = document.createElement('button');
    exportBtn.id = 'cross-section-export-btn';
    exportBtn.textContent = 'Export SVG';
    exportBtn.style.cssText = `
      width:100%;padding:6px 0;margin-top:8px;
      background:#4ecdc4;border:none;
      border-radius:4px;color:#000;cursor:pointer;font:bold 13px system-ui,sans-serif;
    `;
    exportBtn.addEventListener('click', () => this.exportSVG());
    panel.appendChild(exportBtn);

    return panel;
  }

  private createRow(label: string): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = 'min-width:70px;font-size:12px;color:rgba(255,255,255,0.7);';
    row.appendChild(lbl);
    return row;
  }

  private getSliceConfig(): SliceConfig {
    return {
      axis: this.axisSelect.value as SliceAxis,
      position: parseFloat(this.posSlider.value),
      thickness: parseFloat(this.thickSlider.value),
    };
  }

  private slicePoints(config: SliceConfig): { u: number; v: number; r: number; g: number; b: number }[] {
    const positions = this.renderer.getSplatPositions();
    const data = this.renderer.getSplatData();
    if (!positions || !data) return [];

    const count = this.renderer.getSplatCount();
    const axisMap: Record<SliceAxis, { sliceIdx: number; uIdx: number; vIdx: number }> = {
      X: { sliceIdx: 0, uIdx: 2, vIdx: 1 },
      Y: { sliceIdx: 1, uIdx: 0, vIdx: 2 },
      Z: { sliceIdx: 2, uIdx: 0, vIdx: 1 },
    };
    const { sliceIdx, uIdx, vIdx } = axisMap[config.axis];
    const half = config.thickness / 2;
    const lo = config.position - half;
    const hi = config.position + half;

    const result: { u: number; v: number; r: number; g: number; b: number }[] = [];
    for (let i = 0; i < count; i++) {
      const val = positions[i * 3 + sliceIdx];
      if (val >= lo && val <= hi) {
        result.push({
          u: positions[i * 3 + uIdx],
          v: positions[i * 3 + vIdx],
          r: data.colors[i * 4 + 0],
          g: data.colors[i * 4 + 1],
          b: data.colors[i * 4 + 2],
        });
      }
    }
    return result;
  }

  private updatePreview() {
    const config = this.getSliceConfig();

    // Update value labels
    const posVal = document.getElementById('cross-section-pos-val');
    if (posVal) posVal.textContent = config.position.toFixed(2);
    const thickVal = document.getElementById('cross-section-thick-val');
    if (thickVal) thickVal.textContent = config.thickness.toFixed(2);

    const points = this.slicePoints(config);
    const countLabel = document.getElementById('cross-section-count');
    if (countLabel) countLabel.textContent = `${points.length} points in slice`;

    this.renderSvg(this.previewSvg, points, config, 292, 200);
  }

  private renderSvg(
    svg: SVGSVGElement,
    points: { u: number; v: number; r: number; g: number; b: number }[],
    config: SliceConfig,
    width: number,
    height: number,
  ) {
    svg.innerHTML = '';
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', '#0a0a1a');
    svg.appendChild(bg);

    if (points.length === 0) {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', String(width / 2));
      t.setAttribute('y', String(height / 2));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', 'rgba(255,255,255,0.3)');
      t.setAttribute('font-size', '13');
      t.setAttribute('font-family', 'system-ui, sans-serif');
      t.textContent = 'No points in slice';
      svg.appendChild(t);
      return;
    }

    // Compute bounds of projected points
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const p of points) {
      if (p.u < uMin) uMin = p.u;
      if (p.u > uMax) uMax = p.u;
      if (p.v < vMin) vMin = p.v;
      if (p.v > vMax) vMax = p.v;
    }

    const uSpan = uMax - uMin || 1;
    const vSpan = vMax - vMin || 1;

    // Margin for labels
    const margin = 40;
    const plotW = width - margin * 2;
    const plotH = height - margin * 2;

    // Uniform scale to fit both axes
    const scale = Math.min(plotW / uSpan, plotH / vSpan);
    const offsetU = margin + (plotW - uSpan * scale) / 2;
    const offsetV = margin + (plotH - vSpan * scale) / 2;

    const toX = (u: number) => offsetU + (u - uMin) * scale;
    const toY = (v: number) => offsetV + (vMax - v) * scale; // flip V for screen coords

    // Axis labels
    const axisMap: Record<SliceAxis, { uLabel: string; vLabel: string }> = {
      X: { uLabel: 'Z', vLabel: 'Y' },
      Y: { uLabel: 'X', vLabel: 'Z' },
      Z: { uLabel: 'X', vLabel: 'Y' },
    };
    const { uLabel, vLabel } = axisMap[config.axis];

    // Grid lines
    const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gridGroup.setAttribute('class', 'grid');
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const uVal = uMin + (uSpan * i) / gridSteps;
      const vVal = vMin + (vSpan * i) / gridSteps;
      const x = toX(uVal);
      const y = toY(vVal);

      // Vertical grid line
      const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vLine.setAttribute('x1', String(x));
      vLine.setAttribute('y1', String(margin));
      vLine.setAttribute('x2', String(x));
      vLine.setAttribute('y2', String(height - margin));
      vLine.setAttribute('stroke', 'rgba(255,255,255,0.08)');
      vLine.setAttribute('stroke-width', '1');
      gridGroup.appendChild(vLine);

      // Horizontal grid line
      const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      hLine.setAttribute('x1', String(margin));
      hLine.setAttribute('y1', String(y));
      hLine.setAttribute('x2', String(width - margin));
      hLine.setAttribute('y2', String(y));
      hLine.setAttribute('stroke', 'rgba(255,255,255,0.08)');
      hLine.setAttribute('stroke-width', '1');
      gridGroup.appendChild(hLine);

      // U axis tick label
      const uTick = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      uTick.setAttribute('x', String(x));
      uTick.setAttribute('y', String(height - margin + 14));
      uTick.setAttribute('text-anchor', 'middle');
      uTick.setAttribute('fill', 'rgba(255,255,255,0.5)');
      uTick.setAttribute('font-size', '9');
      uTick.setAttribute('font-family', 'system-ui, sans-serif');
      uTick.textContent = uVal.toFixed(2);
      gridGroup.appendChild(uTick);

      // V axis tick label
      const vTick = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      vTick.setAttribute('x', String(margin - 4));
      vTick.setAttribute('y', String(y + 3));
      vTick.setAttribute('text-anchor', 'end');
      vTick.setAttribute('fill', 'rgba(255,255,255,0.5)');
      vTick.setAttribute('font-size', '9');
      vTick.setAttribute('font-family', 'system-ui, sans-serif');
      vTick.textContent = vVal.toFixed(2);
      gridGroup.appendChild(vTick);
    }
    svg.appendChild(gridGroup);

    // Axis labels
    const uAxisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    uAxisLabel.setAttribute('x', String(width / 2));
    uAxisLabel.setAttribute('y', String(height - 4));
    uAxisLabel.setAttribute('text-anchor', 'middle');
    uAxisLabel.setAttribute('fill', 'rgba(255,255,255,0.7)');
    uAxisLabel.setAttribute('font-size', '11');
    uAxisLabel.setAttribute('font-family', 'system-ui, sans-serif');
    uAxisLabel.textContent = uLabel;
    svg.appendChild(uAxisLabel);

    const vAxisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    vAxisLabel.setAttribute('x', '12');
    vAxisLabel.setAttribute('y', String(height / 2));
    vAxisLabel.setAttribute('text-anchor', 'middle');
    vAxisLabel.setAttribute('fill', 'rgba(255,255,255,0.7)');
    vAxisLabel.setAttribute('font-size', '11');
    vAxisLabel.setAttribute('font-family', 'system-ui, sans-serif');
    vAxisLabel.setAttribute('transform', `rotate(-90, 12, ${height / 2})`);
    vAxisLabel.textContent = vLabel;
    svg.appendChild(vAxisLabel);

    // Title
    const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    titleText.setAttribute('x', String(width / 2));
    titleText.setAttribute('y', '16');
    titleText.setAttribute('text-anchor', 'middle');
    titleText.setAttribute('fill', 'rgba(255,255,255,0.8)');
    titleText.setAttribute('font-size', '11');
    titleText.setAttribute('font-family', 'system-ui, sans-serif');
    titleText.setAttribute('class', 'cross-section-title');
    titleText.textContent = `${config.axis} = ${config.position.toFixed(2)} ± ${(config.thickness / 2).toFixed(2)}`;
    svg.appendChild(titleText);

    // Plot points
    const pointGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    pointGroup.setAttribute('class', 'points');
    for (const p of points) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(toX(p.u)));
      circle.setAttribute('cy', String(toY(p.v)));
      circle.setAttribute('r', '2');
      const r = Math.round(p.r * 255);
      const g = Math.round(p.g * 255);
      const b = Math.round(p.b * 255);
      circle.setAttribute('fill', `rgb(${r},${g},${b})`);
      pointGroup.appendChild(circle);
    }
    svg.appendChild(pointGroup);

    // Scale bar
    const scaleBarLen = this.niceScaleBar(uSpan, plotW);
    if (scaleBarLen > 0) {
      const barPxLen = scaleBarLen * scale;
      const barX = width - margin - barPxLen;
      const barY = margin - 8;

      const barLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      barLine.setAttribute('x1', String(barX));
      barLine.setAttribute('y1', String(barY));
      barLine.setAttribute('x2', String(barX + barPxLen));
      barLine.setAttribute('y2', String(barY));
      barLine.setAttribute('stroke', '#4ecdc4');
      barLine.setAttribute('stroke-width', '2');
      svg.appendChild(barLine);

      // End caps
      for (const x of [barX, barX + barPxLen]) {
        const cap = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        cap.setAttribute('x1', String(x));
        cap.setAttribute('y1', String(barY - 3));
        cap.setAttribute('x2', String(x));
        cap.setAttribute('y2', String(barY + 3));
        cap.setAttribute('stroke', '#4ecdc4');
        cap.setAttribute('stroke-width', '2');
        svg.appendChild(cap);
      }

      const barLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      barLabel.setAttribute('x', String(barX + barPxLen / 2));
      barLabel.setAttribute('y', String(barY - 6));
      barLabel.setAttribute('text-anchor', 'middle');
      barLabel.setAttribute('fill', '#4ecdc4');
      barLabel.setAttribute('font-size', '9');
      barLabel.setAttribute('font-family', 'system-ui, sans-serif');
      barLabel.setAttribute('class', 'scale-label');
      barLabel.textContent = scaleBarLen.toFixed(scaleBarLen < 1 ? 2 : 1);
      svg.appendChild(barLabel);
    }
  }

  private niceScaleBar(span: number, plotWidth: number): number {
    // Aim for a scale bar that's ~20% of the plot width
    const targetLen = span * 0.2;
    const magnitude = Math.pow(10, Math.floor(Math.log10(targetLen)));
    const candidates = [1, 2, 5, 10];
    let best = magnitude;
    for (const c of candidates) {
      const val = c * magnitude;
      if (val <= targetLen * 1.5 && val >= targetLen * 0.3) {
        best = val;
      }
    }
    // Don't draw if it would be tiny
    const pxLen = (best / span) * plotWidth;
    return pxLen > 20 ? best : 0;
  }

  private exportSVG() {
    const rm = (window as Record<string, unknown>)['__roleManager'] as RoleManager | undefined;
    if (rm && !rm.canAnnotate()) return;

    const config = this.getSliceConfig();
    const points = this.slicePoints(config);

    // Create a full-size export SVG (800x600)
    const exportW = 800;
    const exportH = 600;
    const exportSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    this.renderSvg(exportSvg, points, config, exportW, exportH);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(exportSvg);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cross-section-${config.axis}-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  destroy() {
    document.removeEventListener('keydown', this.onKeyDown);
    this.panel.remove();
    this.toggleBtn.remove();
  }
}
