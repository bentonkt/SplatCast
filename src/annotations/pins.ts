import { Annotation } from '../types';
import { SyncManager } from '../collab/sync';

export class PinManager {
  private pins: Annotation[] = [];
  private overlay: HTMLDivElement;
  private userId: string;

  constructor(
    private canvas: HTMLCanvasElement,
    private sync: SyncManager,
  ) {
    this.userId = crypto.randomUUID().slice(0, 8);

    this.overlay = document.createElement('div');
    this.overlay.id = 'pin-overlay';
    this.overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    document.body.appendChild(this.overlay);

    this.canvas.addEventListener('dblclick', this.onDoubleClick);
    this.sync.onAnnotationsChange((annotations) => {
      this.pins = annotations;
      this.renderPins();
    });

    this.pins = this.sync.getAnnotations();
    this.renderPins();
  }

  private onDoubleClick = (e: MouseEvent) => {
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      position: [
        (e.clientX / this.canvas.width) * 2 - 1,
        -((e.clientY / this.canvas.height) * 2 - 1),
        0,
      ],
      label: '',
      color: this.getColor(),
      userId: this.userId,
      timestamp: Date.now(),
    };
    this.sync.addAnnotation(annotation);
  };

  private getColor(): string {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd'];
    const index = parseInt(this.userId, 16) % colors.length;
    return colors[index];
  }

  private renderPins() {
    this.overlay.innerHTML = '';
    for (const pin of this.pins) {
      const el = document.createElement('div');
      const x = (pin.position[0] + 1) / 2 * this.canvas.width;
      const y = (1 - (pin.position[1] + 1) / 2) * this.canvas.height;
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
  }

  destroy() {
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
    this.overlay.remove();
  }
}
