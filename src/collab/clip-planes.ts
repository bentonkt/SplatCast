import { ClipPlanes } from '../types';
import { SyncManager } from './sync';
import { SplatRenderer } from '../renderer/splat-renderer';

const DEFAULT_RANGE = 2;

export class ClipPlanesPanel {
  private panel: HTMLDivElement;
  private sliders: Record<string, HTMLInputElement> = {};
  private enabled = false;
  private range = DEFAULT_RANGE;

  constructor(
    private sync: SyncManager,
    private renderer: SplatRenderer,
  ) {
    this.panel = this.createPanel();
    document.body.appendChild(this.panel);

    this.sync.onClipPlanesChange((planes) => {
      if (planes) {
        this.updateSlidersFromPlanes(planes);
        this.renderer.setClipPlanes(planes);
      }
    });

    // Apply initial state if already set
    const initial = this.sync.getClipPlanes();
    if (initial) {
      this.enabled = true;
      this.updateSlidersFromPlanes(initial);
      this.renderer.setClipPlanes(initial);
    }
  }

  setRange(extent: number) {
    this.range = Math.max(extent, 0.1);
    const axes = ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax'] as const;
    for (const key of axes) {
      const slider = this.sliders[key];
      if (!slider) continue;
      const isMin = key.endsWith('Min');
      slider.min = String(-this.range);
      slider.max = String(this.range);
      slider.value = String(isMin ? -this.range : this.range);
    }
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'clip-planes-panel';
    panel.style.cssText = `
      position:absolute;bottom:12px;right:12px;
      width:220px;padding:8px 12px;
      background:rgba(30,30,50,0.9);border-radius:8px;
      border:1px solid rgba(255,255,255,0.15);
      font:13px system-ui,sans-serif;color:#fff;
      z-index:100;pointer-events:auto;
      display:none;
    `;

    // Toggle button (always visible)
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'clip-planes-toggle';
    toggleBtn.textContent = '\u2702';
    toggleBtn.title = 'Toggle clipping planes';
    toggleBtn.style.cssText = `
      position:absolute;bottom:12px;right:12px;
      width:36px;height:36px;border:2px solid transparent;border-radius:6px;
      background:rgba(30,30,50,0.85);cursor:pointer;font-size:18px;
      display:flex;align-items:center;justify-content:center;
      color:white;pointer-events:auto;z-index:100;
      border-color:transparent;
    `;
    toggleBtn.addEventListener('click', () => {
      this.enabled = !this.enabled;
      panel.style.display = this.enabled ? 'block' : 'none';
      toggleBtn.style.borderColor = this.enabled ? '#4ecdc4' : 'transparent';
      toggleBtn.style.bottom = this.enabled ? '220px' : '12px';
      if (this.enabled) {
        this.publishClipPlanes();
      } else {
        // Reset to no clipping
        this.renderer.setClipPlanes({
          xMin: -1e6, xMax: 1e6,
          yMin: -1e6, yMax: 1e6,
          zMin: -1e6, zMax: 1e6,
        });
      }
    });
    document.body.appendChild(toggleBtn);

    const title = document.createElement('div');
    title.textContent = 'Clipping Planes';
    title.style.cssText = 'font-weight:bold;margin-bottom:8px;text-align:center;';
    panel.appendChild(title);

    const axes: { label: string; minKey: string; maxKey: string }[] = [
      { label: 'X', minKey: 'xMin', maxKey: 'xMax' },
      { label: 'Y', minKey: 'yMin', maxKey: 'yMax' },
      { label: 'Z', minKey: 'zMin', maxKey: 'zMax' },
    ];

    for (const axis of axes) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:6px;';

      const label = document.createElement('div');
      label.textContent = `${axis.label} axis`;
      label.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:2px;';
      row.appendChild(label);

      const sliderRow = document.createElement('div');
      sliderRow.style.cssText = 'display:flex;gap:4px;align-items:center;';

      const minSlider = this.createSlider(axis.minKey, -this.range);
      const maxSlider = this.createSlider(axis.maxKey, this.range);

      const minLabel = document.createElement('span');
      minLabel.style.cssText = 'font-size:10px;min-width:16px;';
      minLabel.textContent = 'min';

      const maxLabel = document.createElement('span');
      maxLabel.style.cssText = 'font-size:10px;min-width:16px;';
      maxLabel.textContent = 'max';

      sliderRow.appendChild(minLabel);
      sliderRow.appendChild(minSlider);
      sliderRow.appendChild(maxLabel);
      sliderRow.appendChild(maxSlider);

      row.appendChild(sliderRow);
      panel.appendChild(row);
    }

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.id = 'clip-planes-reset';
    resetBtn.textContent = 'Reset';
    resetBtn.style.cssText = `
      width:100%;padding:4px 0;margin-top:4px;
      background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);
      border-radius:4px;color:#fff;cursor:pointer;font:12px system-ui,sans-serif;
    `;
    resetBtn.addEventListener('click', () => {
      this.resetSliders();
      this.publishClipPlanes();
    });
    panel.appendChild(resetBtn);

    return panel;
  }

  private createSlider(key: string, defaultVal: number): HTMLInputElement {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.dataset.clipAxis = key;
    slider.min = String(-this.range);
    slider.max = String(this.range);
    slider.step = String(this.range / 50);
    slider.value = String(defaultVal);
    slider.style.cssText = 'flex:1;height:4px;cursor:pointer;accent-color:#4ecdc4;';

    slider.addEventListener('input', () => {
      this.publishClipPlanes();
    });

    this.sliders[key] = slider;
    return slider;
  }

  private publishClipPlanes() {
    const planes: ClipPlanes = {
      xMin: parseFloat(this.sliders['xMin'].value),
      xMax: parseFloat(this.sliders['xMax'].value),
      yMin: parseFloat(this.sliders['yMin'].value),
      yMax: parseFloat(this.sliders['yMax'].value),
      zMin: parseFloat(this.sliders['zMin'].value),
      zMax: parseFloat(this.sliders['zMax'].value),
    };
    this.renderer.setClipPlanes(planes);
    this.sync.setClipPlanes(planes);
  }

  private updateSlidersFromPlanes(planes: ClipPlanes) {
    this.sliders['xMin'].value = String(planes.xMin);
    this.sliders['xMax'].value = String(planes.xMax);
    this.sliders['yMin'].value = String(planes.yMin);
    this.sliders['yMax'].value = String(planes.yMax);
    this.sliders['zMin'].value = String(planes.zMin);
    this.sliders['zMax'].value = String(planes.zMax);
  }

  private resetSliders() {
    const axes = ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax'] as const;
    for (const key of axes) {
      const isMin = key.endsWith('Min');
      this.sliders[key].value = String(isMin ? -this.range : this.range);
    }
  }

  destroy() {
    this.panel.remove();
    const toggle = document.getElementById('clip-planes-toggle');
    if (toggle) toggle.remove();
  }
}
