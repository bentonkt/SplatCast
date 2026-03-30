import { Annotation, SpatialSubscription, SpatialTask } from '../types';
import { SyncManager } from './sync';

function isInsideBounds(
  pos: [number, number, number],
  min: [number, number, number],
  max: [number, number, number],
): boolean {
  return (
    pos[0] >= min[0] && pos[0] <= max[0] &&
    pos[1] >= min[1] && pos[1] <= max[1] &&
    pos[2] >= min[2] && pos[2] <= max[2]
  );
}

export class SpatialSubscriptionPanel {
  private subs: SpatialSubscription[] = [];
  private panel: HTMLDivElement;
  private listEl: HTMLDivElement;
  private toggleBtn: HTMLButtonElement;
  private overlay: HTMLDivElement;
  private toastContainer: HTMLDivElement;
  private drawMode = false;
  private drawStart: [number, number] | null = null;
  private drawRect: HTMLDivElement | null = null;
  private knownAnnotationIds = new Set<string>();
  private knownTaskIds = new Set<string>();
  readonly userId: string;

  constructor(
    private canvas: HTMLCanvasElement,
    private sync: SyncManager,
  ) {
    this.userId = crypto.randomUUID().slice(0, 8);

    // Seed known IDs so existing annotations don't trigger notifications
    for (const a of this.sync.getAnnotations()) {
      this.knownAnnotationIds.add(a.id);
    }
    for (const t of this.sync.getTasks()) {
      this.knownTaskIds.add(t.id);
    }

    this.overlay = document.createElement('div');
    this.overlay.id = 'subscription-overlay';
    this.overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    document.body.appendChild(this.overlay);

    this.toastContainer = document.createElement('div');
    this.toastContainer.id = 'subscription-toasts';
    this.toastContainer.style.cssText = `
      position:absolute;bottom:60px;right:16px;
      display:flex;flex-direction:column;gap:6px;
      z-index:200;pointer-events:none;
    `;
    document.body.appendChild(this.toastContainer);

    this.toggleBtn = this.createToggleButton();
    this.panel = this.createPanel();
    this.listEl = this.panel.querySelector('#subscription-list')!;

    document.body.appendChild(this.toggleBtn);
    document.body.appendChild(this.panel);

    document.addEventListener('keydown', this.onKeyDown);

    this.sync.onSubscriptionsChange((subs) => {
      this.subs = subs;
      this.renderBoxOverlays();
      this.renderList();
    });

    this.sync.onAnnotationsChange((annotations) => {
      this.checkAnnotations(annotations);
    });

    this.sync.onTasksChange((tasks) => {
      this.checkTasks(tasks);
    });

    this.subs = this.sync.getSubscriptions();
    this.renderBoxOverlays();
    this.renderList();
  }

  private createToggleButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'subscription-toggle-btn';
    btn.textContent = '\u{1F514}';
    btn.title = 'Spatial Subscriptions (J)';
    btn.style.cssText = `
      position:absolute;top:12px;right:240px;z-index:100;
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
    panel.id = 'subscription-panel';
    panel.style.cssText = `
      position:absolute;top:50px;right:240px;
      display:none;flex-direction:column;gap:6px;
      padding:10px;min-width:260px;max-width:320px;max-height:400px;
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
    title.textContent = 'Spatial Subscriptions';
    title.style.cssText = 'font-weight:bold;font-size:14px;';
    header.appendChild(title);

    const drawBtn = document.createElement('button');
    drawBtn.id = 'subscription-draw-btn';
    drawBtn.textContent = '+ Draw Box';
    drawBtn.title = 'Click and drag on the scene to define a watch region';
    drawBtn.style.cssText = `
      border:none;border-radius:4px;padding:4px 10px;
      background:rgba(255,255,255,0.15);color:white;cursor:pointer;
      font-size:12px;font-family:system-ui,sans-serif;
    `;
    drawBtn.addEventListener('click', () => this.toggleDrawMode());
    header.appendChild(drawBtn);

    panel.appendChild(header);

    const list = document.createElement('div');
    list.id = 'subscription-list';
    list.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    panel.appendChild(list);

    return panel;
  }

  private togglePanel() {
    const isVisible = this.panel.style.display === 'flex';
    this.panel.style.display = isVisible ? 'none' : 'flex';
    this.toggleBtn.style.background = isVisible
      ? 'rgba(30,30,50,0.85)'
      : 'rgba(78,205,196,0.5)';
  }

  private toggleDrawMode() {
    this.drawMode = !this.drawMode;
    const drawBtn = this.panel.querySelector('#subscription-draw-btn') as HTMLButtonElement;
    drawBtn.style.background = this.drawMode
      ? 'rgba(78,205,196,0.5)'
      : 'rgba(255,255,255,0.15)';
    drawBtn.textContent = this.drawMode ? 'Drawing...' : '+ Draw Box';
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
    this.drawRect.id = 'subscription-draw-rect';
    this.drawRect.style.cssText = `
      position:absolute;pointer-events:none;
      border:2px dashed rgba(78,205,196,0.8);
      background:rgba(78,205,196,0.1);
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
    const rect = this.canvas.getBoundingClientRect();

    const startNx = ((this.drawStart[0] - rect.left) / rect.width) * 2 - 1;
    const startNy = -(((this.drawStart[1] - rect.top) / rect.height) * 2 - 1);
    const endNx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const endNy = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    const minX = Math.min(startNx, endNx);
    const maxX = Math.max(startNx, endNx);
    const minY = Math.min(startNy, endNy);
    const maxY = Math.max(startNy, endNy);

    // Skip tiny accidental drags
    if (Math.abs(maxX - minX) < 0.02 && Math.abs(maxY - minY) < 0.02) {
      if (this.drawRect) {
        this.drawRect.remove();
        this.drawRect = null;
      }
      this.drawStart = null;
      return;
    }

    const name = prompt('Subscription name:');
    if (!name) {
      if (this.drawRect) {
        this.drawRect.remove();
        this.drawRect = null;
      }
      this.drawStart = null;
      return;
    }

    const sub: SpatialSubscription = {
      id: crypto.randomUUID().slice(0, 8),
      name,
      min: [minX, minY, -1],
      max: [maxX, maxY, 1],
      createdBy: this.userId,
      timestamp: Date.now(),
    };

    this.sync.addSubscription(sub);

    if (this.drawRect) {
      this.drawRect.remove();
      this.drawRect = null;
    }
    this.drawStart = null;

    // Exit draw mode
    this.toggleDrawMode();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    if (e.key === 'j' || e.key === 'J') {
      this.togglePanel();
    }
  };

  private checkAnnotations(annotations: Annotation[]) {
    for (const a of annotations) {
      if (this.knownAnnotationIds.has(a.id)) continue;
      this.knownAnnotationIds.add(a.id);

      for (const sub of this.subs) {
        if (isInsideBounds(a.position, sub.min, sub.max)) {
          this.showToast(sub.name, `New ${a.type}: "${a.label || 'annotation'}"`);
        }
      }
    }
  }

  private checkTasks(tasks: SpatialTask[]) {
    for (const t of tasks) {
      if (this.knownTaskIds.has(t.id)) continue;
      this.knownTaskIds.add(t.id);

      for (const sub of this.subs) {
        if (isInsideBounds(t.position, sub.min, sub.max)) {
          this.showToast(sub.name, `New task: "${t.title}"`);
        }
      }
    }
  }

  private showToast(subName: string, message: string) {
    const toast = document.createElement('div');
    toast.className = 'subscription-toast';
    toast.style.cssText = `
      padding:8px 14px;border-radius:6px;
      background:rgba(78,205,196,0.9);color:#1a1a2e;
      font-family:system-ui,sans-serif;font-size:13px;font-weight:600;
      box-shadow:0 2px 12px rgba(0,0,0,0.4);
      pointer-events:auto;cursor:default;
      animation:toast-slide-in 0.3s ease-out;
    `;
    toast.innerHTML = `<div style="font-size:11px;opacity:0.7;">${subName}</div><div>${message}</div>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  private renderBoxOverlays() {
    this.overlay.innerHTML = '';
    const rect = this.canvas.getBoundingClientRect();

    for (const sub of this.subs) {
      const left = ((sub.min[0] + 1) / 2) * rect.width;
      const right = ((sub.max[0] + 1) / 2) * rect.width;
      const top = ((1 - sub.max[1]) / 2) * rect.height;
      const bottom = ((1 - sub.min[1]) / 2) * rect.height;

      const box = document.createElement('div');
      box.className = 'subscription-box';
      box.dataset.subId = sub.id;
      box.style.cssText = `
        position:absolute;pointer-events:none;
        left:${left}px;top:${top}px;
        width:${right - left}px;height:${bottom - top}px;
        border:2px solid rgba(78,205,196,0.6);
        background:rgba(78,205,196,0.08);
        border-radius:4px;
      `;

      const label = document.createElement('div');
      label.className = 'subscription-box-label';
      label.textContent = sub.name;
      label.style.cssText = `
        position:absolute;top:-18px;left:4px;
        font-family:system-ui,sans-serif;font-size:10px;
        color:rgba(78,205,196,0.9);font-weight:600;
        white-space:nowrap;
      `;
      box.appendChild(label);

      this.overlay.appendChild(box);
    }
  }

  private renderList() {
    this.listEl.innerHTML = '';

    if (this.subs.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#888;padding:8px 0;text-align:center;font-size:12px;';
      empty.textContent = 'No subscriptions yet. Click "+ Draw Box" then drag on the scene.';
      this.listEl.appendChild(empty);
      return;
    }

    for (const sub of this.subs) {
      const row = document.createElement('div');
      row.className = 'subscription-row';
      row.dataset.subId = sub.id;
      row.style.cssText = `
        display:flex;align-items:center;justify-content:space-between;gap:6px;
        padding:6px 8px;border-radius:6px;
        background:rgba(255,255,255,0.06);
        border-left:3px solid rgba(78,205,196,0.7);
      `;

      const nameEl = document.createElement('span');
      nameEl.className = 'subscription-name';
      nameEl.textContent = sub.name;
      nameEl.style.cssText = 'font-weight:600;font-size:13px;flex:1;';
      row.appendChild(nameEl);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'subscription-delete-btn';
      deleteBtn.textContent = '\u00D7';
      deleteBtn.style.cssText = `
        border:none;background:none;color:#888;cursor:pointer;
        font-size:16px;padding:0 2px;line-height:1;
      `;
      deleteBtn.addEventListener('click', () => this.sync.removeSubscription(sub.id));
      row.appendChild(deleteBtn);

      this.listEl.appendChild(row);
    }
  }
}
