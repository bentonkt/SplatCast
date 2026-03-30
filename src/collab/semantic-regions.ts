import { SemanticRegion } from '../types';
import { SyncManager } from './sync';
import { RoleManager } from './roles';

const PRESET_LABELS = [
  { label: 'Structural Column', color: '#e74c3c' },
  { label: 'HVAC Duct', color: '#3498db' },
  { label: 'Exterior Wall', color: '#2ecc71' },
  { label: 'Interior Wall', color: '#27ae60' },
  { label: 'Floor Slab', color: '#9b59b6' },
  { label: 'Ceiling', color: '#f39c12' },
  { label: 'Piping', color: '#1abc9c' },
  { label: 'Electrical', color: '#e67e22' },
  { label: 'Window', color: '#00bcd4' },
  { label: 'Door', color: '#8bc34a' },
];

export class SemanticRegionPanel {
  private regions: SemanticRegion[] = [];
  private panel: HTMLDivElement;
  private listEl: HTMLDivElement;
  private toggleBtn: HTMLButtonElement;
  private overlay: HTMLDivElement;
  private drawMode = false;
  private drawStart: [number, number] | null = null;
  private drawRect: HTMLDivElement | null = null;
  private filterLabel = '';
  private filterInput: HTMLInputElement;
  readonly userId: string;

  constructor(
    private canvas: HTMLCanvasElement,
    private sync: SyncManager,
  ) {
    this.userId = crypto.randomUUID().slice(0, 8);

    this.overlay = document.createElement('div');
    this.overlay.id = 'semantic-overlay';
    this.overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    document.body.appendChild(this.overlay);

    this.toggleBtn = this.createToggleButton();
    this.panel = this.createPanel();
    this.listEl = this.panel.querySelector('#semantic-region-list')!;
    this.filterInput = this.panel.querySelector('#semantic-filter-input')!;

    document.body.appendChild(this.toggleBtn);
    document.body.appendChild(this.panel);

    document.addEventListener('keydown', this.onKeyDown);

    this.sync.onSemanticRegionsChange((regions) => {
      this.regions = regions;
      this.renderOverlays();
      this.renderList();
    });

    this.regions = this.sync.getSemanticRegions();
    this.renderOverlays();
    this.renderList();
  }

  private createToggleButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'semantic-toggle-btn';
    btn.textContent = '\u{1F3F7}';
    btn.title = 'Semantic Regions (K)';
    btn.style.cssText = `
      position:absolute;top:12px;right:280px;z-index:100;
      width:36px;height:36px;border:none;border-radius:6px;
      background:rgba(30,30,50,0.85);color:white;cursor:pointer;
      font-size:18px;display:flex;align-items:center;justify-content:center;
      border:1px solid rgba(255,255,255,0.15);
    `;
    btn.addEventListener('click', () => this.togglePanel());
    return btn;
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'semantic-panel';
    panel.style.cssText = `
      position:absolute;top:50px;right:280px;
      display:none;flex-direction:column;gap:6px;
      padding:10px;min-width:280px;max-width:340px;max-height:460px;
      background:rgba(30,30,50,0.92);border-radius:8px;
      border:1px solid rgba(255,255,255,0.15);z-index:100;
      font-family:system-ui,sans-serif;color:white;font-size:13px;
      pointer-events:auto;overflow-y:auto;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;
      padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.15);
      margin-bottom:4px;
    `;
    const title = document.createElement('span');
    title.textContent = 'Semantic Regions';
    title.style.cssText = 'font-weight:bold;font-size:14px;';
    header.appendChild(title);

    const tagBtn = document.createElement('button');
    tagBtn.id = 'semantic-tag-btn';
    tagBtn.textContent = '+ Tag Region';
    tagBtn.title = 'Click and drag on the scene to tag a region';
    tagBtn.style.cssText = `
      border:none;border-radius:4px;padding:4px 10px;
      background:rgba(255,255,255,0.15);color:white;cursor:pointer;
      font-size:12px;font-family:system-ui,sans-serif;
    `;
    tagBtn.addEventListener('click', () => this.toggleDrawMode());
    header.appendChild(tagBtn);

    panel.appendChild(header);

    // Filter input
    const filterRow = document.createElement('div');
    filterRow.style.cssText = 'display:flex;gap:4px;margin-bottom:4px;';
    const filterInput = document.createElement('input');
    filterInput.id = 'semantic-filter-input';
    filterInput.type = 'text';
    filterInput.placeholder = 'Filter by label...';
    filterInput.style.cssText = `
      flex:1;padding:4px 8px;border:1px solid rgba(255,255,255,0.2);
      border-radius:4px;background:rgba(0,0,0,0.3);color:white;
      font-size:12px;font-family:system-ui,sans-serif;outline:none;
    `;
    filterInput.addEventListener('input', () => {
      this.filterLabel = filterInput.value.toLowerCase();
      this.renderOverlays();
      this.renderList();
    });
    filterRow.appendChild(filterInput);
    panel.appendChild(filterRow);

    const list = document.createElement('div');
    list.id = 'semantic-region-list';
    list.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    panel.appendChild(list);

    return panel;
  }

  private togglePanel() {
    const isVisible = this.panel.style.display === 'flex';
    this.panel.style.display = isVisible ? 'none' : 'flex';
    this.toggleBtn.style.background = isVisible
      ? 'rgba(30,30,50,0.85)'
      : 'rgba(155,89,182,0.5)';
  }

  private toggleDrawMode() {
    this.drawMode = !this.drawMode;
    const tagBtn = this.panel.querySelector('#semantic-tag-btn') as HTMLButtonElement;
    tagBtn.style.background = this.drawMode
      ? 'rgba(155,89,182,0.5)'
      : 'rgba(255,255,255,0.15)';
    tagBtn.textContent = this.drawMode ? 'Drawing...' : '+ Tag Region';
    this.canvas.style.cursor = this.drawMode ? 'crosshair' : '';

    if (this.drawMode) {
      this.canvas.addEventListener('mousedown', this.onDrawStart);
      this.canvas.addEventListener('mousemove', this.onDrawMove);
      this.canvas.addEventListener('mouseup', this.onDrawEnd);
    } else {
      this.canvas.removeEventListener('mousedown', this.onDrawStart);
      this.canvas.removeEventListener('mousemove', this.onDrawMove);
      this.canvas.removeEventListener('mouseup', this.onDrawEnd);
      if (this.drawRect) {
        this.drawRect.remove();
        this.drawRect = null;
      }
      this.drawStart = null;
    }
  }

  private onDrawStart = (e: MouseEvent) => {
    if (!this.drawMode) return;
    e.preventDefault();
    e.stopPropagation();
    this.drawStart = [e.clientX, e.clientY];

    this.drawRect = document.createElement('div');
    this.drawRect.id = 'semantic-draw-rect';
    this.drawRect.style.cssText = `
      position:absolute;pointer-events:none;
      border:2px dashed rgba(155,89,182,0.8);
      background:rgba(155,89,182,0.1);
      z-index:150;
    `;
    document.body.appendChild(this.drawRect);
  };

  private onDrawMove = (e: MouseEvent) => {
    if (!this.drawStart || !this.drawRect) return;
    const x = Math.min(this.drawStart[0], e.clientX);
    const y = Math.min(this.drawStart[1], e.clientY);
    const w = Math.abs(e.clientX - this.drawStart[0]);
    const h = Math.abs(e.clientY - this.drawStart[1]);
    this.drawRect.style.left = `${x}px`;
    this.drawRect.style.top = `${y}px`;
    this.drawRect.style.width = `${w}px`;
    this.drawRect.style.height = `${h}px`;
  };

  private onDrawEnd = (e: MouseEvent) => {
    if (!this.drawStart) return;

    const rm = (window as Record<string, unknown>)['__roleManager'] as RoleManager | undefined;
    if (rm && !rm.canEdit()) {
      this.cleanupDraw();
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const startNx = ((this.drawStart[0] - rect.left) / rect.width) * 2 - 1;
    const startNy = -(((this.drawStart[1] - rect.top) / rect.height) * 2 - 1);
    const endNx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const endNy = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    const minX = Math.min(startNx, endNx);
    const maxX = Math.max(startNx, endNx);
    const minY = Math.min(startNy, endNy);
    const maxY = Math.max(startNy, endNy);

    if (Math.abs(maxX - minX) < 0.02 && Math.abs(maxY - minY) < 0.02) {
      this.cleanupDraw();
      return;
    }

    // Show label picker
    this.showLabelPicker(minX, maxX, minY, maxY);
  };

  private showLabelPicker(minX: number, maxX: number, minY: number, maxY: number) {
    // Remove any existing picker
    const existing = document.getElementById('semantic-label-picker');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.id = 'semantic-label-picker';
    picker.style.cssText = `
      position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      padding:16px;min-width:260px;max-height:380px;overflow-y:auto;
      background:rgba(30,30,50,0.96);border-radius:10px;
      border:1px solid rgba(155,89,182,0.4);z-index:300;
      font-family:system-ui,sans-serif;color:white;font-size:13px;
      pointer-events:auto;box-shadow:0 8px 32px rgba(0,0,0,0.6);
    `;

    const pickerTitle = document.createElement('div');
    pickerTitle.textContent = 'Assign Semantic Label';
    pickerTitle.style.cssText = 'font-weight:bold;font-size:14px;margin-bottom:10px;';
    picker.appendChild(pickerTitle);

    // Preset buttons
    const presetsDiv = document.createElement('div');
    presetsDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;';
    for (const preset of PRESET_LABELS) {
      const btn = document.createElement('button');
      btn.className = 'semantic-preset-btn';
      btn.dataset.label = preset.label;
      btn.style.cssText = `
        padding:4px 10px;border:1px solid ${preset.color}40;border-radius:4px;
        background:${preset.color}20;color:${preset.color};cursor:pointer;
        font-size:11px;font-family:system-ui,sans-serif;
      `;
      btn.textContent = preset.label;
      btn.addEventListener('click', () => {
        this.createRegion(preset.label, preset.color, minX, maxX, minY, maxY);
        picker.remove();
        this.cleanupDraw();
        this.toggleDrawMode();
      });
      presetsDiv.appendChild(btn);
    }
    picker.appendChild(presetsDiv);

    // Custom label input
    const customRow = document.createElement('div');
    customRow.style.cssText = 'display:flex;gap:4px;';
    const customInput = document.createElement('input');
    customInput.id = 'semantic-custom-input';
    customInput.type = 'text';
    customInput.placeholder = 'Custom label...';
    customInput.style.cssText = `
      flex:1;padding:6px 8px;border:1px solid rgba(255,255,255,0.2);
      border-radius:4px;background:rgba(0,0,0,0.3);color:white;
      font-size:12px;font-family:system-ui,sans-serif;outline:none;
    `;
    const customBtn = document.createElement('button');
    customBtn.id = 'semantic-custom-btn';
    customBtn.textContent = 'Add';
    customBtn.style.cssText = `
      padding:6px 12px;border:none;border-radius:4px;
      background:rgba(155,89,182,0.6);color:white;cursor:pointer;
      font-size:12px;font-family:system-ui,sans-serif;
    `;
    const addCustom = () => {
      const label = customInput.value.trim();
      if (!label) return;
      const hue = Math.floor(Math.random() * 360);
      const color = `hsl(${hue}, 70%, 55%)`;
      this.createRegion(label, color, minX, maxX, minY, maxY);
      picker.remove();
      this.cleanupDraw();
      this.toggleDrawMode();
    };
    customBtn.addEventListener('click', addCustom);
    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addCustom();
      if (e.key === 'Escape') {
        picker.remove();
        this.cleanupDraw();
        this.toggleDrawMode();
      }
    });
    customRow.appendChild(customInput);
    customRow.appendChild(customBtn);
    picker.appendChild(customRow);

    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'semantic-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      margin-top:8px;padding:4px 12px;border:1px solid rgba(255,255,255,0.2);
      border-radius:4px;background:none;color:#888;cursor:pointer;
      font-size:12px;font-family:system-ui,sans-serif;width:100%;
    `;
    cancelBtn.addEventListener('click', () => {
      picker.remove();
      this.cleanupDraw();
      this.toggleDrawMode();
    });
    picker.appendChild(cancelBtn);

    document.body.appendChild(picker);
    customInput.focus();
  }

  private createRegion(label: string, color: string, minX: number, maxX: number, minY: number, maxY: number) {
    const region: SemanticRegion = {
      id: crypto.randomUUID().slice(0, 8),
      label,
      color,
      min: [minX, minY, -1],
      max: [maxX, maxY, 1],
      createdBy: this.userId,
      timestamp: Date.now(),
    };
    this.sync.addSemanticRegion(region);
  }

  private cleanupDraw() {
    if (this.drawRect) {
      this.drawRect.remove();
      this.drawRect = null;
    }
    this.drawStart = null;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    if (e.key === 'k' || e.key === 'K') {
      this.togglePanel();
    }
  };

  private getFilteredRegions(): SemanticRegion[] {
    if (!this.filterLabel) return this.regions;
    return this.regions.filter((r) =>
      r.label.toLowerCase().includes(this.filterLabel),
    );
  }

  private renderOverlays() {
    this.overlay.innerHTML = '';
    const rect = this.canvas.getBoundingClientRect();
    const filtered = this.getFilteredRegions();

    for (const region of filtered) {
      const left = ((region.min[0] + 1) / 2) * rect.width;
      const right = ((region.max[0] + 1) / 2) * rect.width;
      const top = ((1 - region.max[1]) / 2) * rect.height;
      const bottom = ((1 - region.min[1]) / 2) * rect.height;

      const box = document.createElement('div');
      box.className = 'semantic-region-box';
      box.dataset.regionId = region.id;
      box.style.cssText = `
        position:absolute;pointer-events:none;
        left:${left}px;top:${top}px;
        width:${right - left}px;height:${bottom - top}px;
        border:2px solid ${region.color}99;
        background:${region.color}14;
        border-radius:4px;
      `;

      const label = document.createElement('div');
      label.className = 'semantic-region-label';
      label.textContent = region.label;
      label.style.cssText = `
        position:absolute;top:-20px;left:4px;
        font-family:system-ui,sans-serif;font-size:10px;
        color:${region.color};font-weight:600;
        white-space:nowrap;background:rgba(30,30,50,0.8);
        padding:1px 6px;border-radius:3px;
      `;
      box.appendChild(label);

      this.overlay.appendChild(box);
    }
  }

  private renderList() {
    this.listEl.innerHTML = '';
    const filtered = this.getFilteredRegions();

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#888;padding:8px 0;text-align:center;font-size:12px;';
      empty.textContent = this.filterLabel
        ? 'No matching regions.'
        : 'No regions yet. Click "+ Tag Region" then drag on the scene.';
      this.listEl.appendChild(empty);
      return;
    }

    for (const region of filtered) {
      const row = document.createElement('div');
      row.className = 'semantic-region-row';
      row.dataset.regionId = region.id;
      row.style.cssText = `
        display:flex;align-items:center;justify-content:space-between;gap:6px;
        padding:6px 8px;border-radius:6px;
        background:rgba(255,255,255,0.06);
        border-left:3px solid ${region.color};
      `;

      const colorDot = document.createElement('div');
      colorDot.style.cssText = `
        width:10px;height:10px;border-radius:50%;flex-shrink:0;
        background:${region.color};
      `;
      row.appendChild(colorDot);

      const nameEl = document.createElement('span');
      nameEl.className = 'semantic-region-name';
      nameEl.textContent = region.label;
      nameEl.style.cssText = 'font-weight:600;font-size:13px;flex:1;';
      row.appendChild(nameEl);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'semantic-region-delete-btn';
      deleteBtn.textContent = '\u00D7';
      deleteBtn.style.cssText = `
        border:none;background:none;color:#888;cursor:pointer;
        font-size:16px;padding:0 2px;line-height:1;
      `;
      deleteBtn.addEventListener('click', () => {
        const rm = (window as Record<string, unknown>)['__roleManager'] as RoleManager | undefined;
        if (rm && !rm.canEdit()) return;
        this.sync.removeSemanticRegion(region.id);
      });
      row.appendChild(deleteBtn);

      this.listEl.appendChild(row);
    }
  }
}
