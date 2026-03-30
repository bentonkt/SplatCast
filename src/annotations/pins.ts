import { Annotation, AnnotationType } from '../types';
import { SyncManager } from '../collab/sync';
import { getUserColor, createColorIndicator } from '../collab/user-colors';

export class PinManager {
  private pins: Annotation[] = [];
  private overlay: HTMLDivElement;
  private toolbar: HTMLDivElement;
  private colorIndicator: HTMLDivElement;
  readonly userId: string;
  private mode: AnnotationType = 'pin';
  private arrowStart: [number, number, number] | null = null;
  private measureStart: [number, number, number] | null = null;
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private multiTouchActive = false;

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

    this.colorIndicator = createColorIndicator(this.userId);
    document.body.appendChild(this.colorIndicator);

    this.canvas.addEventListener('dblclick', this.onDoubleClick);
    this.canvas.addEventListener('touchstart', this.onTouchStart);
    this.canvas.addEventListener('touchend', this.onTouchEnd);
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
      { type: 'measurement', label: '\u{1F4CF}', title: 'Measure (double-click two points)' },
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
    this.measureStart = null;
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
    this.handleAnnotation(e.clientX, e.clientY);
  };

  private onTouchStart = (e: TouchEvent) => {
    if (e.touches.length >= 2) {
      this.multiTouchActive = true;
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    if (e.changedTouches.length !== 1) return;

    // When all fingers are lifted after a multi-touch gesture, reset the flag
    // and discard this tap so pinch-release doesn't trigger annotation placement
    if (e.touches.length === 0 && this.multiTouchActive) {
      this.multiTouchActive = false;
      this.lastTapTime = 0;
      return;
    }

    // Still mid-gesture with remaining fingers — ignore
    if (this.multiTouchActive) return;

    const touch = e.changedTouches[0];
    const now = Date.now();
    const dx = touch.clientX - this.lastTapX;
    const dy = touch.clientY - this.lastTapY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (now - this.lastTapTime < 400 && dist < 30) {
      e.preventDefault();
      this.handleAnnotation(touch.clientX, touch.clientY);
      this.lastTapTime = 0;
    } else {
      this.lastTapTime = now;
      this.lastTapX = touch.clientX;
      this.lastTapY = touch.clientY;
    }
  };

  private handleAnnotation(clientX: number, clientY: number) {
    const pos = this.toNdc(clientX, clientY);

    if (this.mode === 'pin') {
      this.sync.addAnnotation({
        id: crypto.randomUUID(),
        type: 'pin',
        position: pos,
        label: '',
        color: getUserColor(this.userId),
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
          color: getUserColor(this.userId),
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
          color: getUserColor(this.userId),
          userId: this.userId,
          timestamp: Date.now(),
        });
      }
    } else if (this.mode === 'measurement') {
      if (this.measureStart === null) {
        this.measureStart = pos;
      } else {
        const dx = this.measureStart[0] - pos[0];
        const dy = this.measureStart[1] - pos[1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        this.sync.addAnnotation({
          id: crypto.randomUUID(),
          type: 'measurement',
          position: this.measureStart,
          endPosition: pos,
          label: distance.toFixed(2),
          color: getUserColor(this.userId),
          userId: this.userId,
          timestamp: Date.now(),
        });
        this.measureStart = null;
      }
    }
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
      } else if (annotationType === 'measurement') {
        this.renderMeasurement(pin);
      }
    }
  }

  private renderPin(pin: Annotation) {
    const { x, y } = this.ndcToScreen(pin.position);

    // Container for pin dot + label
    const container = document.createElement('div');
    container.dataset.annotationType = 'pin';
    container.dataset.annotationId = pin.id;
    container.dataset.userId = pin.userId;
    container.style.cssText = `
      position:absolute;left:${x - 8}px;top:${y - 8}px;
      pointer-events:auto;cursor:pointer;
    `;

    // Pin dot
    const dot = document.createElement('div');
    dot.className = 'pin-dot';
    dot.style.cssText = `
      width:16px;height:16px;border-radius:50%;
      background:${pin.color};border:2px solid white;
      box-shadow:0 2px 4px rgba(0,0,0,0.5);
    `;
    container.appendChild(dot);

    // Label (shown below pin if present)
    if (pin.label) {
      const label = document.createElement('div');
      label.className = 'pin-label';
      label.dataset.pinLabel = 'true';
      label.textContent = pin.label;
      label.style.cssText = `
        position:absolute;top:20px;left:50%;transform:translateX(-50%);
        padding:2px 6px;border-radius:3px;white-space:nowrap;
        background:rgba(30,30,50,0.85);color:#fff;
        font:12px/1.3 system-ui,sans-serif;
        border:1px solid ${pin.color};
        pointer-events:none;
      `;
      container.appendChild(label);
    }

    container.title = `${pin.userId} — ${new Date(pin.timestamp).toLocaleTimeString()}${pin.label ? '\n' + pin.label : ''}\nClick to edit label`;

    // Click to edit label
    container.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editPinLabel(pin);
    });

    this.overlay.appendChild(container);
  }

  private editPinLabel(pin: Annotation) {
    // Remove any existing label editor
    const existing = document.getElementById('pin-label-editor');
    if (existing) existing.remove();

    const { x, y } = this.ndcToScreen(pin.position);

    const editor = document.createElement('div');
    editor.id = 'pin-label-editor';
    editor.style.cssText = `
      position:absolute;left:${x + 12}px;top:${y - 4}px;
      z-index:200;pointer-events:auto;
      display:flex;gap:4px;align-items:center;
    `;

    const input = document.createElement('input');
    input.id = 'pin-label-input';
    input.type = 'text';
    input.value = pin.label;
    input.placeholder = 'Add label…';
    input.style.cssText = `
      width:160px;padding:4px 8px;border-radius:4px;
      border:2px solid ${pin.color};
      background:rgba(30,30,50,0.95);color:#fff;
      font:13px system-ui,sans-serif;outline:none;
    `;

    let cancelled = false;

    const save = () => {
      if (cancelled) return;
      const newLabel = input.value.trim();
      this.sync.updateAnnotation(pin.id, { label: newLabel });
      editor.remove();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        save();
      } else if (e.key === 'Escape') {
        cancelled = true;
        editor.remove();
      }
      e.stopPropagation();
    });

    input.addEventListener('blur', () => {
      save();
    });

    editor.appendChild(input);
    this.overlay.appendChild(editor);
    input.focus();
    input.select();
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

  private renderMeasurement(pin: Annotation) {
    if (!pin.endPosition) return;
    const start = this.ndcToScreen(pin.position);
    const end = this.ndcToScreen(pin.endPosition);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.annotationType = 'measurement';
    svg.dataset.annotationId = pin.id;
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    svg.setAttribute('width', String(this.canvas.width));
    svg.setAttribute('height', String(this.canvas.height));

    // Dashed measurement line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(start.x));
    line.setAttribute('y1', String(start.y));
    line.setAttribute('x2', String(end.x));
    line.setAttribute('y2', String(end.y));
    line.setAttribute('stroke', pin.color);
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '6 4');
    svg.appendChild(line);

    // Endpoint circles
    for (const pt of [start, end]) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(pt.x));
      circle.setAttribute('cy', String(pt.y));
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', pin.color);
      circle.setAttribute('stroke', 'white');
      circle.setAttribute('stroke-width', '1.5');
      svg.appendChild(circle);
    }

    // Distance label at midpoint
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const labelText = pin.label;
    const textWidth = labelText.length * 8 + 12;
    rect.setAttribute('x', String(midX - textWidth / 2));
    rect.setAttribute('y', String(midY - 12));
    rect.setAttribute('width', String(textWidth));
    rect.setAttribute('height', '22');
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', 'rgba(30,30,50,0.85)');
    rect.setAttribute('stroke', pin.color);
    rect.setAttribute('stroke-width', '1');
    svg.appendChild(rect);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(midX));
    text.setAttribute('y', String(midY + 4));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#fff');
    text.setAttribute('font-size', '12');
    text.setAttribute('font-family', 'system-ui, sans-serif');
    text.textContent = labelText;
    svg.appendChild(text);

    this.overlay.appendChild(svg);
  }

  destroy() {
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
    this.overlay.remove();
    this.toolbar.remove();
    this.colorIndicator.remove();
  }
}
