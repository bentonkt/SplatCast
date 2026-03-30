import { Annotation, AnnotationType } from '../types';
import { SyncManager } from '../collab/sync';
import { getUserColor, createColorIndicator } from '../collab/user-colors';
import { captureScreenshot } from '../screenshot';
import { exportJSON, exportCSV } from '../export';

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
  private openThreadPinId: string | null = null;
  private showResolved = true;
  private timeFilterCutoff: number | null = null;

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
    document.addEventListener('keydown', this.onKeyDown);
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

    // Separator
    const sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:24px;background:rgba(255,255,255,0.2);margin:0 4px;';
    toolbar.appendChild(sep);

    // Screenshot button
    const screenshotBtn = document.createElement('button');
    screenshotBtn.className = 'toolbar-btn';
    screenshotBtn.id = 'screenshot-btn';
    screenshotBtn.textContent = '\u{1F4F7}';
    screenshotBtn.title = 'Export screenshot (S)';
    screenshotBtn.style.cssText = `
      width:36px;height:36px;border:2px solid transparent;border-radius:6px;
      background:rgba(255,255,255,0.1);cursor:pointer;font-size:18px;
      display:flex;align-items:center;justify-content:center;
      color:white;pointer-events:auto;
    `;
    screenshotBtn.addEventListener('click', () => {
      captureScreenshot(this.canvas);
    });
    toolbar.appendChild(screenshotBtn);

    // Export JSON button
    const jsonBtn = document.createElement('button');
    jsonBtn.className = 'toolbar-btn';
    jsonBtn.id = 'export-json-btn';
    jsonBtn.textContent = '{}';
    jsonBtn.title = 'Export annotations as JSON (E)';
    jsonBtn.style.cssText = `
      width:36px;height:36px;border:2px solid transparent;border-radius:6px;
      background:rgba(255,255,255,0.1);cursor:pointer;font-size:14px;
      display:flex;align-items:center;justify-content:center;
      color:white;pointer-events:auto;font-family:monospace;
    `;
    jsonBtn.addEventListener('click', () => {
      exportJSON(this.sync);
    });
    toolbar.appendChild(jsonBtn);

    // Export CSV button
    const csvBtn = document.createElement('button');
    csvBtn.className = 'toolbar-btn';
    csvBtn.id = 'export-csv-btn';
    csvBtn.textContent = 'CSV';
    csvBtn.title = 'Export annotations as CSV';
    csvBtn.style.cssText = `
      width:36px;height:36px;border:2px solid transparent;border-radius:6px;
      background:rgba(255,255,255,0.1);cursor:pointer;font-size:11px;
      display:flex;align-items:center;justify-content:center;
      color:white;pointer-events:auto;font-family:monospace;font-weight:bold;
    `;
    csvBtn.addEventListener('click', () => {
      exportCSV(this.sync);
    });
    toolbar.appendChild(csvBtn);

    // Separator before resolve filter
    const sep2 = document.createElement('div');
    sep2.style.cssText = 'width:1px;height:24px;background:rgba(255,255,255,0.2);margin:0 4px;';
    toolbar.appendChild(sep2);

    // Resolve filter toggle
    const resolveBtn = document.createElement('button');
    resolveBtn.className = 'toolbar-toggle-btn';
    resolveBtn.id = 'resolve-filter-btn';
    resolveBtn.textContent = '\u2705';
    resolveBtn.title = 'Toggle resolved annotations (R)';
    resolveBtn.style.cssText = `
      width:36px;height:36px;border:2px solid #4ecdc4;border-radius:6px;
      background:rgba(78,205,196,0.25);cursor:pointer;font-size:16px;
      display:flex;align-items:center;justify-content:center;
      color:white;pointer-events:auto;
    `;
    resolveBtn.addEventListener('click', () => {
      this.showResolved = !this.showResolved;
      this.updateResolveFilterButton(resolveBtn);
      this.renderPins();
    });
    toolbar.appendChild(resolveBtn);

    this.updateToolbarSelection(toolbar);
    return toolbar;
  }

  private setMode(mode: AnnotationType) {
    this.mode = mode;
    this.arrowStart = null;
    this.measureStart = null;
    this.updateToolbarSelection(this.toolbar);
  }

  private updateResolveFilterButton(btn: HTMLButtonElement) {
    if (this.showResolved) {
      btn.style.borderColor = '#4ecdc4';
      btn.style.background = 'rgba(78,205,196,0.25)';
      btn.title = 'Hide resolved annotations (R)';
    } else {
      btn.style.borderColor = 'transparent';
      btn.style.background = 'rgba(255,255,255,0.1)';
      btn.title = 'Show resolved annotations (R)';
    }
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

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    if (e.key === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      captureScreenshot(this.canvas);
    }
    if (e.key === 'e' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      exportJSON(this.sync);
    }
    if (e.key === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.showResolved = !this.showResolved;
      const btn = document.getElementById('resolve-filter-btn') as HTMLButtonElement | null;
      if (btn) this.updateResolveFilterButton(btn);
      this.renderPins();
    }
  };

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

  setTimeFilter(cutoff: number | null) {
    this.timeFilterCutoff = cutoff;
    this.renderPins();
  }

  getTimeFilter(): number | null {
    return this.timeFilterCutoff;
  }

  private renderPins() {
    this.overlay.innerHTML = '';
    // Only render top-level annotations (not replies), filtered by resolve state and time
    const topLevel = this.pins.filter((p) =>
      !p.parentId
      && (this.showResolved || !p.resolved)
      && (this.timeFilterCutoff === null || p.timestamp <= this.timeFilterCutoff)
    );
    for (const pin of topLevel) {
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

    // Refresh thread panel replies if open
    if (this.openThreadPinId) {
      this.refreshThreadReplies(this.openThreadPinId);
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
      background:${pin.resolved ? '#666' : pin.color};border:2px solid ${pin.resolved ? '#999' : 'white'};
      box-shadow:0 2px 4px rgba(0,0,0,0.5);
      ${pin.resolved ? 'opacity:0.5;' : ''}
    `;
    container.appendChild(dot);

    // Resolve/unresolve button
    const resolveBtn = document.createElement('button');
    resolveBtn.className = 'resolve-btn';
    resolveBtn.dataset.resolveBtn = 'true';
    resolveBtn.textContent = pin.resolved ? '\u21A9' : '\u2713';
    resolveBtn.title = pin.resolved ? 'Unresolve' : 'Resolve';
    resolveBtn.style.cssText = `
      position:absolute;top:-8px;left:-18px;
      width:18px;height:18px;border-radius:50%;
      background:${pin.resolved ? '#e67e22' : '#27ae60'};color:white;
      border:1.5px solid white;cursor:pointer;font-size:11px;
      display:flex;align-items:center;justify-content:center;
      pointer-events:auto;padding:0;line-height:1;
    `;
    resolveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.sync.updateAnnotation(pin.id, { resolved: !pin.resolved });
    });
    container.appendChild(resolveBtn);

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
        border:1px solid ${pin.resolved ? '#666' : pin.color};
        pointer-events:none;
        ${pin.resolved ? 'opacity:0.5;text-decoration:line-through;' : ''}
      `;
      container.appendChild(label);
    }

    // Reply count badge
    const replies = this.sync.getReplies(pin.id);
    if (replies.length > 0) {
      const badge = document.createElement('div');
      badge.className = 'thread-badge';
      badge.dataset.threadBadge = 'true';
      badge.textContent = String(replies.length);
      badge.style.cssText = `
        position:absolute;top:-6px;right:-10px;
        min-width:16px;height:16px;border-radius:8px;
        background:#4ecdc4;color:#000;
        font:bold 10px/16px system-ui,sans-serif;
        text-align:center;padding:0 3px;
        pointer-events:none;
      `;
      container.appendChild(badge);
    }

    container.title = `${pin.userId} — ${new Date(pin.timestamp).toLocaleTimeString()}${pin.label ? '\n' + pin.label : ''}\nClick to open thread`;

    // Click to open thread panel
    container.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openThreadPanel(pin);
    });

    this.overlay.appendChild(container);
  }

  private openThreadPanel(pin: Annotation) {
    // Remove any existing thread panel or label editor
    const existingPanel = document.getElementById('thread-panel');
    if (existingPanel) existingPanel.remove();
    const existingEditor = document.getElementById('pin-label-editor');
    if (existingEditor) existingEditor.remove();

    const { x, y } = this.ndcToScreen(pin.position);

    const panel = document.createElement('div');
    panel.id = 'thread-panel';
    panel.dataset.parentId = pin.id;
    panel.style.cssText = `
      position:absolute;left:${x + 20}px;top:${y - 4}px;
      z-index:200;pointer-events:auto;
      width:240px;max-height:300px;
      background:rgba(30,30,50,0.95);
      border:2px solid ${pin.color};border-radius:8px;
      display:flex;flex-direction:column;
      font:13px system-ui,sans-serif;color:#fff;
      box-shadow:0 4px 12px rgba(0,0,0,0.5);
    `;

    // Create reply input early so label Enter can focus it
    const replyInput = document.createElement('input');
    replyInput.id = 'thread-reply-input';
    replyInput.type = 'text';
    replyInput.placeholder = 'Reply…';
    replyInput.style.cssText = `
      width:100%;padding:4px 6px;border-radius:4px;box-sizing:border-box;
      border:1px solid rgba(255,255,255,0.2);
      background:rgba(255,255,255,0.1);color:#fff;
      font:13px system-ui,sans-serif;outline:none;
    `;

    // Header with label editor
    const header = document.createElement('div');
    header.style.cssText = 'padding:8px;border-bottom:1px solid rgba(255,255,255,0.15);';

    const labelInput = document.createElement('input');
    labelInput.id = 'pin-label-input';
    labelInput.type = 'text';
    labelInput.value = pin.label;
    labelInput.placeholder = 'Add label…';
    labelInput.style.cssText = `
      width:100%;padding:4px 6px;border-radius:4px;box-sizing:border-box;
      border:1px solid rgba(255,255,255,0.2);
      background:rgba(255,255,255,0.1);color:#fff;
      font:13px system-ui,sans-serif;outline:none;
    `;

    let labelDirty = false;
    let panelClosed = false;
    const originalLabel = pin.label;

    // Forward-declare closeOnOutside and escapeHandler so closePanel can remove them
    let closeOnOutside: ((e: MouseEvent) => void) | null = null;
    let escapeHandler: ((e: KeyboardEvent) => void) | null = null;

    const saveLabel = () => {
      if (!labelDirty || panelClosed) return;
      const newLabel = labelInput.value.trim();
      if (newLabel !== originalLabel) {
        this.sync.updateAnnotation(pin.id, { label: newLabel });
      }
      labelDirty = false;
    };

    const closePanel = () => {
      panelClosed = true;
      this.openThreadPinId = null;
      panel.remove();
      if (closeOnOutside) {
        document.removeEventListener('mousedown', closeOnOutside);
        closeOnOutside = null;
      }
      if (escapeHandler) {
        document.removeEventListener('keydown', escapeHandler);
        escapeHandler = null;
      }
    };

    labelInput.addEventListener('input', () => {
      labelDirty = true;
    });

    labelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveLabel();
        replyInput.focus();
      }
      // Let Escape propagate to the document-level handler
      if (e.key !== 'Escape') {
        e.stopPropagation();
      }
    });

    labelInput.addEventListener('blur', () => {
      saveLabel();
    });

    header.appendChild(labelInput);
    panel.appendChild(header);

    // Replies container
    const repliesContainer = document.createElement('div');
    repliesContainer.className = 'thread-replies';
    repliesContainer.style.cssText = `
      flex:1;overflow-y:auto;padding:4px 8px;
      max-height:160px;
    `;

    const replies = this.sync.getReplies(pin.id);
    for (const reply of replies) {
      const replyEl = document.createElement('div');
      replyEl.className = 'thread-reply';
      replyEl.dataset.replyId = reply.id;
      replyEl.style.cssText = `
        padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.08);
        display:flex;flex-direction:column;gap:2px;
      `;

      const replyHeader = document.createElement('span');
      replyHeader.style.cssText = `font-size:10px;color:${reply.color};`;
      replyHeader.textContent = `${reply.userId} \u00b7 ${new Date(reply.timestamp).toLocaleTimeString()}`;

      const replyText = document.createElement('span');
      replyText.style.cssText = 'font-size:12px;word-break:break-word;';
      replyText.textContent = reply.label;

      replyEl.appendChild(replyHeader);
      replyEl.appendChild(replyText);
      repliesContainer.appendChild(replyEl);
    }
    panel.appendChild(repliesContainer);

    // Reply input area
    const replyArea = document.createElement('div');
    replyArea.style.cssText = 'padding:8px;border-top:1px solid rgba(255,255,255,0.15);';

    replyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = replyInput.value.trim();
        if (text) {
          this.sync.addAnnotation({
            id: crypto.randomUUID(),
            type: 'pin',
            position: pin.position,
            label: text,
            color: getUserColor(this.userId),
            userId: this.userId,
            timestamp: Date.now(),
            parentId: pin.id,
          });
          replyInput.value = '';
        }
      }
      // Let Escape propagate to the document-level handler
      if (e.key !== 'Escape') {
        e.stopPropagation();
      }
    });

    replyArea.appendChild(replyInput);
    panel.appendChild(replyArea);

    // Close panel when clicking outside
    closeOnOutside = (e: MouseEvent) => {
      if (!panel.contains(e.target as Node)) {
        closePanel();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeOnOutside), 0);

    // Document-level Escape handler — works regardless of focus
    escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePanel();
      }
    };
    document.addEventListener('keydown', escapeHandler);

    this.openThreadPinId = pin.id;
    document.body.appendChild(panel);
    labelInput.focus();
    labelInput.select();
  }

  private refreshThreadReplies(parentId: string) {
    const panel = document.getElementById('thread-panel');
    if (!panel) return;

    const repliesContainer = panel.querySelector('.thread-replies');
    if (!repliesContainer) return;

    repliesContainer.innerHTML = '';
    const replies = this.sync.getReplies(parentId);
    for (const reply of replies) {
      const replyEl = document.createElement('div');
      replyEl.className = 'thread-reply';
      replyEl.dataset.replyId = reply.id;
      replyEl.style.cssText = `
        padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.08);
        display:flex;flex-direction:column;gap:2px;
      `;

      const replyHeader = document.createElement('span');
      replyHeader.style.cssText = `font-size:10px;color:${reply.color};`;
      replyHeader.textContent = `${reply.userId} \u00b7 ${new Date(reply.timestamp).toLocaleTimeString()}`;

      const replyText = document.createElement('span');
      replyText.style.cssText = 'font-size:12px;word-break:break-word;';
      replyText.textContent = reply.label;

      replyEl.appendChild(replyHeader);
      replyEl.appendChild(replyText);
      repliesContainer.appendChild(replyEl);
    }
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
    document.removeEventListener('keydown', this.onKeyDown);
    const threadPanel = document.getElementById('thread-panel');
    if (threadPanel) threadPanel.remove();
    this.overlay.remove();
    this.toolbar.remove();
    this.colorIndicator.remove();
  }
}
