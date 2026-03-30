import { Annotation, AnnotationType } from '../types';
import { SyncManager } from '../collab/sync';

export class PinManager {
  private pins: Annotation[] = [];
  private overlay: HTMLDivElement;
  private toolbar: HTMLDivElement;
  private userId: string;
  private mode: AnnotationType = 'pin';
  private arrowStart: [number, number, number] | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private sync: SyncManager,
  ) {
    this.userId = crypto.randomUUID().slice(0, 8);

    this.overlay = document.createElement('div');
    this.overlay.id = 'pin-overlay';
    this.overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    document.body.appendChild(this.overlay);

    this.toolbar = this.createToolbar();
    document.body.appendChild(this.toolbar);

    this.canvas.addEventListener('dblclick', this.onDoubleClick);
    this.sync.onAnnotationsChange((annotations) => {
      this.pins = annotations;
      this.renderPins();
    });

    this.pins = this.sync.getAnnotations();
    this.renderPins();
  }

  private createToolbar(): HTMLDivElement {
    const toolbar = document.createElement('div');
    toolbar.id = 'annotation-toolbar';
    toolbar.style.cssText = `
      position:absolute;top:12px;left:50%;transform:translateX(-50%);
      display:flex;gap:4px;padding:6px 10px;
      background:rgba(30,30,50,0.85);border-radius:8px;
      border:1px solid rgba(255,255,255,0.15);z-index:100;
    `;

    const modes: { type: AnnotationType; label: string; title: string }[] = [
      { type: 'pin', label: '\u{1F4CD}', title: 'Pin (double-click to place)' },
      { type: 'arrow', label: '\u{27A1}', title: 'Arrow (double-click start, then end)' },
      { type: 'text', label: '\u{1F524}', title: 'Text label (double-click to place)' },
    ];

    for (const m of modes) {
      const btn = document.createElement('button');
      btn.className = 'toolbar-btn';
      btn.dataset.mode = m.type;
      btn.textContent = m.label;
      btn.title = m.title;
      btn.style.cssText = `
        width:36px;height:36px;border:2px solid transparent;border-radius:6px;
        background:rgba(255,255,255,0.1);cursor:pointer;font-size:18px;
        display:flex;align-items:center;justify-content:center;
        color:white;pointer-events:auto;
      `;
      btn.addEventListener('click', () => {
        this.setMode(m.type);
      });
      toolbar.appendChild(btn);
    }

    this.updateToolbarSelection(toolbar);
    return toolbar;
  }

  private setMode(mode: AnnotationType) {
    this.mode = mode;
    this.arrowStart = null;
    this.updateToolbarSelection(this.toolbar);
  }

  private updateToolbarSelection(toolbar: HTMLDivElement) {
    const buttons = toolbar.querySelectorAll<HTMLButtonElement>('.toolbar-btn');
    for (const btn of buttons) {
      const isActive = btn.dataset.mode === this.mode;
      btn.style.borderColor = isActive ? '#4ecdc4' : 'transparent';
      btn.style.background = isActive ? 'rgba(78,205,196,0.25)' : 'rgba(255,255,255,0.1)';
    }
  }

  private toNdc(clientX: number, clientY: number): [number, number, number] {
    return [
      (clientX / this.canvas.width) * 2 - 1,
      -((clientY / this.canvas.height) * 2 - 1),
      0,
    ];
  }

  private onDoubleClick = (e: MouseEvent) => {
    const pos = this.toNdc(e.clientX, e.clientY);

    if (this.mode === 'pin') {
      this.sync.addAnnotation({
        id: crypto.randomUUID(),
        type: 'pin',
        position: pos,
        label: '',
        color: this.getColor(),
        userId: this.userId,
        timestamp: Date.now(),
      });
    } else if (this.mode === 'arrow') {
      if (this.arrowStart === null) {
        this.arrowStart = pos;
      } else {
        this.sync.addAnnotation({
          id: crypto.randomUUID(),
          type: 'arrow',
          position: this.arrowStart,
          endPosition: pos,
          label: '',
          color: this.getColor(),
          userId: this.userId,
          timestamp: Date.now(),
        });
        this.arrowStart = null;
      }
    } else if (this.mode === 'text') {
      const label = prompt('Enter label text:');
      if (label) {
        this.sync.addAnnotation({
          id: crypto.randomUUID(),
          type: 'text',
          position: pos,
          label,
          color: this.getColor(),
          userId: this.userId,
          timestamp: Date.now(),
        });
      }
    }
  };

  private getColor(): string {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd'];
    const index = parseInt(this.userId, 16) % colors.length;
    return colors[index];
  }

  private ndcToScreen(ndc: [number, number, number]): { x: number; y: number } {
    return {
      x: (ndc[0] + 1) / 2 * this.canvas.width,
      y: (1 - (ndc[1] + 1) / 2) * this.canvas.height,
    };
  }

  private renderPins() {
    this.overlay.innerHTML = '';
    for (const pin of this.pins) {
      const annotationType = pin.type ?? 'pin';
      if (annotationType === 'pin') {
        this.renderPin(pin);
      } else if (annotationType === 'arrow') {
        this.renderArrow(pin);
      } else if (annotationType === 'text') {
        this.renderText(pin);
      }
    }
  }

  private renderPin(pin: Annotation) {
    const { x, y } = this.ndcToScreen(pin.position);
    const el = document.createElement('div');
    el.dataset.annotationType = 'pin';
    el.style.cssText = `
      position:absolute;left:${x - 8}px;top:${y - 8}px;
      width:16px;height:16px;border-radius:50%;
      background:${pin.color};border:2px solid white;
      pointer-events:auto;cursor:pointer;
      box-shadow:0 2px 4px rgba(0,0,0,0.5);
    `;
    el.title = `${pin.userId} — ${new Date(pin.timestamp).toLocaleTimeString()}`;
    this.overlay.appendChild(el);
  }

  private renderArrow(pin: Annotation) {
    if (!pin.endPosition) return;
    const start = this.ndcToScreen(pin.position);
    const end = this.ndcToScreen(pin.endPosition);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.annotationType = 'arrow';
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    svg.setAttribute('width', String(this.canvas.width));
    svg.setAttribute('height', String(this.canvas.height));

    // Define arrowhead marker
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    const markerId = `arrowhead-${pin.id}`;
    marker.setAttribute('id', markerId);
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', pin.color);
    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(start.x));
    line.setAttribute('y1', String(start.y));
    line.setAttribute('x2', String(end.x));
    line.setAttribute('y2', String(end.y));
    line.setAttribute('stroke', pin.color);
    line.setAttribute('stroke-width', '3');
    line.setAttribute('marker-end', `url(#${markerId})`);
    svg.appendChild(line);

    this.overlay.appendChild(svg);
  }

  private renderText(pin: Annotation) {
    const { x, y } = this.ndcToScreen(pin.position);
    const el = document.createElement('div');
    el.dataset.annotationType = 'text';
    el.style.cssText = `
      position:absolute;left:${x}px;top:${y}px;
      padding:4px 8px;border-radius:4px;
      background:${pin.color};color:#000;
      font:bold 13px/1.3 system-ui,sans-serif;
      pointer-events:auto;cursor:pointer;white-space:nowrap;
      box-shadow:0 2px 4px rgba(0,0,0,0.5);
    `;
    el.textContent = pin.label;
    el.title = `${pin.userId} — ${new Date(pin.timestamp).toLocaleTimeString()}`;
    this.overlay.appendChild(el);
  }

  destroy() {
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
    this.overlay.remove();
    this.toolbar.remove();
  }
}
