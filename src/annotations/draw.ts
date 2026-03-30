import { Stroke, StrokePoint } from '../types';
import { SyncManager } from '../collab/sync';

export class DrawManager {
  private strokes: Stroke[] = [];
  private currentStroke: StrokePoint[] = [];
  private drawing = false;
  private drawingEnabled = false;
  private svgOverlay: SVGSVGElement;
  private userId: string;

  constructor(
    private canvas: HTMLCanvasElement,
    private sync: SyncManager,
  ) {
    this.userId = crypto.randomUUID().slice(0, 8);

    this.svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgOverlay.id = 'draw-overlay';
    this.svgOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    document.body.appendChild(this.svgOverlay);

    this.canvas.addEventListener('mousedown', this.onMouseDown, { capture: true });
    window.addEventListener('mousemove', this.onMouseMove, { capture: true });
    window.addEventListener('mouseup', this.onMouseUp, { capture: true });
    this.canvas.addEventListener('touchstart', this.onTouchStart, { capture: true });
    this.canvas.addEventListener('touchmove', this.onTouchMove, { capture: true });
    this.canvas.addEventListener('touchend', this.onTouchEnd, { capture: true });
    document.addEventListener('keydown', this.onKeyDown);

    this.sync.onStrokesChange((strokes) => {
      this.strokes = strokes;
      this.renderStrokes();
    });

    this.strokes = this.sync.getStrokes();
    this.renderStrokes();

    this.createToggleButton();
  }

  private createToggleButton() {
    const btn = document.createElement('button');
    btn.id = 'draw-toggle';
    btn.textContent = 'Draw';
    btn.style.cssText = `
      position:absolute;top:10px;right:10px;z-index:100;
      padding:8px 16px;border:2px solid #fff;border-radius:6px;
      background:rgba(0,0,0,0.6);color:#fff;cursor:pointer;
      font-family:monospace;font-size:14px;
    `;
    btn.addEventListener('click', () => {
      this.drawingEnabled = !this.drawingEnabled;
      btn.style.background = this.drawingEnabled ? 'rgba(255,100,100,0.8)' : 'rgba(0,0,0,0.6)';
      btn.textContent = this.drawingEnabled ? 'Drawing...' : 'Draw';
      this.canvas.style.cursor = this.drawingEnabled ? 'crosshair' : '';
    });
    document.body.appendChild(btn);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const btn = document.getElementById('draw-toggle') as HTMLButtonElement;
      if (btn) btn.click();
    }
  };

  private normalizePoint(clientX: number, clientY: number): StrokePoint {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }

  private denormalizePoint(p: StrokePoint): StrokePoint {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: p.x * rect.width + rect.left,
      y: p.y * rect.height + rect.top,
    };
  }

  private onMouseDown = (e: MouseEvent) => {
    if (!this.drawingEnabled) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.drawing = true;
    this.currentStroke = [this.normalizePoint(e.clientX, e.clientY)];
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.drawing) return;
    e.stopImmediatePropagation();
    this.currentStroke.push(this.normalizePoint(e.clientX, e.clientY));
    this.renderStrokes();
  };

  private onMouseUp = (e: MouseEvent) => {
    if (!this.drawing) return;
    e.stopImmediatePropagation();
    this.finishStroke();
  };

  private onTouchStart = (e: TouchEvent) => {
    if (!this.drawingEnabled || e.touches.length !== 1) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.drawing = true;
    const t = e.touches[0];
    this.currentStroke = [this.normalizePoint(t.clientX, t.clientY)];
  };

  private onTouchMove = (e: TouchEvent) => {
    if (!this.drawing || e.touches.length !== 1) return;
    e.stopImmediatePropagation();
    const t = e.touches[0];
    this.currentStroke.push(this.normalizePoint(t.clientX, t.clientY));
    this.renderStrokes();
  };

  private onTouchEnd = (e: TouchEvent) => {
    if (!this.drawing) return;
    e.stopImmediatePropagation();
    this.finishStroke();
  };

  private finishStroke() {
    this.drawing = false;
    if (this.currentStroke.length > 1) {
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        points: this.currentStroke,
        color: this.getColor(),
        userId: this.userId,
        timestamp: Date.now(),
      };
      this.currentStroke = [];
      this.sync.addStroke(stroke);
    } else {
      this.currentStroke = [];
    }
  }

  private getColor(): string {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd'];
    const index = parseInt(this.userId, 16) % colors.length;
    return colors[index];
  }

  private pointsToPathData(points: StrokePoint[]): string {
    if (points.length === 0) return '';
    const pixelPoints = points.map((p) => this.denormalizePoint(p));
    const [first, ...rest] = pixelPoints;
    return `M ${first.x} ${first.y}` + rest.map((p) => ` L ${p.x} ${p.y}`).join('');
  }

  private renderStrokes() {
    this.svgOverlay.innerHTML = '';
    for (const stroke of this.strokes) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', this.pointsToPathData(stroke.points));
      path.setAttribute('stroke', stroke.color);
      path.setAttribute('stroke-width', '3');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.classList.add('stroke-path');
      this.svgOverlay.appendChild(path);
    }
    // Render current in-progress stroke (already in normalized coords)
    if (this.currentStroke.length > 1) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', this.pointsToPathData(this.currentStroke));
      path.setAttribute('stroke', this.getColor());
      path.setAttribute('stroke-width', '3');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('opacity', '0.6');
      path.classList.add('stroke-path');
      this.svgOverlay.appendChild(path);
    }
  }

  destroy() {
    this.canvas.removeEventListener('mousedown', this.onMouseDown, { capture: true });
    window.removeEventListener('mousemove', this.onMouseMove, { capture: true });
    window.removeEventListener('mouseup', this.onMouseUp, { capture: true });
    this.canvas.removeEventListener('touchstart', this.onTouchStart, { capture: true });
    this.canvas.removeEventListener('touchmove', this.onTouchMove, { capture: true });
    this.canvas.removeEventListener('touchend', this.onTouchEnd, { capture: true });
    document.removeEventListener('keydown', this.onKeyDown);
    this.svgOverlay.remove();
    const btn = document.getElementById('draw-toggle');
    if (btn) btn.remove();
  }
}
