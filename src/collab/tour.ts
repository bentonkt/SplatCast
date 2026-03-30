import { Bookmark, TourState } from '../types';
import { SyncManager } from './sync';
import { OrbitCamera } from '../renderer/camera';

const TRANSITION_MS = 1500;
const HOLD_MS = 2000;

export class TourPanel {
  private btn: HTMLButtonElement;
  private playing = false;
  private animationTimer: number | null = null;
  private currentIndex = 0;
  private tourBookmarks: Bookmark[] = [];
  private indicator: HTMLDivElement;

  constructor(
    private sync: SyncManager,
    private camera: OrbitCamera,
  ) {
    this.btn = this.createButton();
    document.body.appendChild(this.btn);

    this.indicator = this.createIndicator();
    document.body.appendChild(this.indicator);

    this.sync.onTourStateChange((state) => {
      if (!state || !state.playing) {
        if (this.playing) {
          this.stopLocally();
        }
        return;
      }
      // Another user started/advanced the tour — follow along
      const awareness = this.sync.awareness.getLocalState();
      const localUserId = awareness?.['presence']?.userId ?? '';
      if (state.startedBy !== localUserId) {
        this.followTour(state);
      }
    });

    document.addEventListener('keydown', this.onKeyDown);
  }

  private createButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'tour-play-btn';
    btn.textContent = '\u25B6';
    btn.title = 'Play guided tour (T)';
    btn.style.cssText = `
      position:absolute;bottom:12px;left:260px;
      width:36px;height:36px;border:2px solid transparent;border-radius:6px;
      background:rgba(30,30,50,0.85);cursor:pointer;font-size:16px;
      display:flex;align-items:center;justify-content:center;
      color:white;pointer-events:auto;z-index:100;
    `;
    btn.addEventListener('click', () => this.toggle());
    return btn;
  }

  private createIndicator(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'tour-indicator';
    el.style.cssText = `
      position:absolute;top:12px;left:50%;transform:translateX(-50%);
      padding:6px 16px;border-radius:6px;
      background:rgba(30,30,50,0.9);border:1px solid rgba(78,205,196,0.4);
      font:13px system-ui,sans-serif;color:#4ecdc4;
      z-index:200;pointer-events:none;display:none;
    `;
    return el;
  }

  private toggle() {
    if (this.playing) {
      this.stop();
    } else {
      this.start();
    }
  }

  private start() {
    const bookmarks = this.sync.getBookmarks();
    if (bookmarks.length < 2) return;

    this.tourBookmarks = [...bookmarks].sort((a, b) => a.timestamp - b.timestamp);
    this.currentIndex = 0;
    this.playing = true;
    this.btn.textContent = '\u23F9';
    this.btn.style.borderColor = '#4ecdc4';

    this.publishTourState();
    this.playStep();
  }

  private stop() {
    this.stopLocally();
    this.sync.setTourState(null);
  }

  private stopLocally() {
    this.playing = false;
    this.btn.textContent = '\u25B6';
    this.btn.style.borderColor = 'transparent';
    this.indicator.style.display = 'none';
    if (this.animationTimer !== null) {
      cancelAnimationFrame(this.animationTimer);
      this.animationTimer = null;
    }
  }

  private publishTourState() {
    const awareness = this.sync.awareness.getLocalState();
    const userId = awareness?.['presence']?.userId ?? 'unknown';
    const state: TourState = {
      playing: this.playing,
      currentIndex: this.currentIndex,
      bookmarkIds: this.tourBookmarks.map((b) => b.id),
      startedBy: userId,
    };
    this.sync.setTourState(state);
  }

  private followTour(state: TourState) {
    // Resolve bookmarks from IDs
    const allBookmarks = this.sync.getBookmarks();
    const byId = new Map(allBookmarks.map((b) => [b.id, b]));
    this.tourBookmarks = state.bookmarkIds
      .map((id) => byId.get(id))
      .filter((b): b is Bookmark => b !== undefined);

    if (this.tourBookmarks.length < 2) return;

    this.currentIndex = state.currentIndex;
    this.playing = true;
    this.btn.textContent = '\u23F9';
    this.btn.style.borderColor = '#4ecdc4';
    this.playStep();
  }

  private playStep() {
    if (!this.playing || this.tourBookmarks.length === 0) return;

    const target = this.tourBookmarks[this.currentIndex];
    this.showIndicator(target.name, this.currentIndex + 1, this.tourBookmarks.length);

    // Animate camera to this bookmark
    const from = this.camera.getOrbitalState();
    const to = {
      theta: target.theta,
      phi: target.phi,
      radius: target.radius,
      target: target.target,
    };

    const startTime = performance.now();
    const animate = (now: number) => {
      if (!this.playing) return;
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / TRANSITION_MS);
      const eased = smootherstep(t);

      this.camera.setOrbitalState({
        theta: lerp(from.theta, to.theta, eased),
        phi: lerp(from.phi, to.phi, eased),
        radius: lerp(from.radius, to.radius, eased),
        target: [
          lerp(from.target[0], to.target[0], eased),
          lerp(from.target[1], to.target[1], eased),
          lerp(from.target[2], to.target[2], eased),
        ],
      });

      if (t < 1) {
        this.animationTimer = requestAnimationFrame(animate);
      } else {
        // Hold at this bookmark, then advance
        setTimeout(() => {
          if (!this.playing) return;
          this.currentIndex++;
          if (this.currentIndex >= this.tourBookmarks.length) {
            this.stop();
            return;
          }
          this.publishTourState();
          this.playStep();
        }, HOLD_MS);
      }
    };

    this.animationTimer = requestAnimationFrame(animate);
  }

  private showIndicator(name: string, step: number, total: number) {
    this.indicator.textContent = `Tour: ${name} (${step}/${total})`;
    this.indicator.style.display = 'block';
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.toggle();
    }
  };

  destroy() {
    document.removeEventListener('keydown', this.onKeyDown);
    this.stopLocally();
    this.btn.remove();
    this.indicator.remove();
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
