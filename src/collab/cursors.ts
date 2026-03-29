import { CursorPresence } from '../types';
import { SyncManager } from './sync';

const CURSOR_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#74b9ff', '#fd79a8'];

export class CursorManager {
  private overlay: HTMLDivElement;
  private userId: string;
  private color: string;
  private cursorElements: Map<number, HTMLDivElement> = new Map();

  constructor(
    private canvas: HTMLCanvasElement,
    private sync: SyncManager,
  ) {
    this.userId = crypto.randomUUID().slice(0, 8);
    const colorIndex = this.sync.getLocalClientId() % CURSOR_COLORS.length;
    this.color = CURSOR_COLORS[colorIndex];

    this.overlay = document.createElement('div');
    this.overlay.id = 'cursor-overlay';
    this.overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    document.body.appendChild(this.overlay);

    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);

    this.sync.onCursorChange((cursors) => {
      this.renderCursors(cursors);
    });
  }

  private onMouseMove = (e: MouseEvent) => {
    const cursor: CursorPresence = {
      userId: this.userId,
      color: this.color,
      x: e.clientX,
      y: e.clientY,
      name: `User ${this.userId.slice(0, 4)}`,
    };
    this.sync.setLocalCursor(cursor);
  };

  private onMouseLeave = () => {
    this.sync.setLocalCursor({
      userId: this.userId,
      color: this.color,
      x: -1,
      y: -1,
      name: `User ${this.userId.slice(0, 4)}`,
    });
  };

  private renderCursors(cursors: Map<number, CursorPresence>) {
    // Remove stale cursors
    for (const [clientId, el] of this.cursorElements) {
      if (!cursors.has(clientId)) {
        el.remove();
        this.cursorElements.delete(clientId);
      }
    }

    for (const [clientId, cursor] of cursors) {
      // Hide offscreen cursors
      if (cursor.x < 0 || cursor.y < 0) {
        const existing = this.cursorElements.get(clientId);
        if (existing) {
          existing.style.display = 'none';
        }
        continue;
      }

      let el = this.cursorElements.get(clientId);
      if (!el) {
        el = document.createElement('div');
        el.className = 'remote-cursor';
        el.style.cssText = `
          position:absolute;pointer-events:none;
          transition:left 0.1s linear, top 0.1s linear;
        `;

        const dot = document.createElement('div');
        dot.className = 'cursor-dot';
        dot.style.cssText = `
          width:12px;height:12px;border-radius:50%;
          border:2px solid white;
          box-shadow:0 2px 4px rgba(0,0,0,0.5);
        `;
        el.appendChild(dot);

        const label = document.createElement('div');
        label.className = 'cursor-label';
        label.style.cssText = `
          position:absolute;left:14px;top:-4px;
          background:rgba(0,0,0,0.75);color:white;
          font-size:11px;padding:2px 6px;border-radius:3px;
          white-space:nowrap;font-family:monospace;
        `;
        el.appendChild(label);

        this.overlay.appendChild(el);
        this.cursorElements.set(clientId, el);
      }

      el.style.display = '';
      el.style.left = `${cursor.x - 6}px`;
      el.style.top = `${cursor.y - 6}px`;

      const dot = el.querySelector('.cursor-dot') as HTMLDivElement;
      dot.style.background = cursor.color;

      const label = el.querySelector('.cursor-label') as HTMLDivElement;
      label.textContent = cursor.name;
      label.style.borderLeft = `2px solid ${cursor.color}`;
    }
  }

  destroy() {
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.overlay.remove();
  }
}
