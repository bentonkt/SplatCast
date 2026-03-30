import { SyncManager } from './sync';
import { PinManager } from '../annotations/pins';
import { DrawManager } from '../annotations/draw';
import { Annotation, Stroke } from '../types';

export class TimelinePanel {
  private active = false;
  private panel: HTMLDivElement;
  private btn: HTMLButtonElement;
  private slider: HTMLInputElement;
  private playBtn: HTMLButtonElement;
  private timeLabel: HTMLDivElement;
  private countLabel: HTMLDivElement;
  private timestamps: number[] = [];
  private playing = false;
  private playInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private sync: SyncManager,
    private pins: PinManager,
    private draw: DrawManager,
  ) {
    this.btn = this.createToggleButton();
    document.body.appendChild(this.btn);

    this.panel = this.createPanel();
    document.body.appendChild(this.panel);

    this.slider = this.panel.querySelector('#timeline-slider') as HTMLInputElement;
    this.playBtn = this.panel.querySelector('#timeline-play-btn') as HTMLButtonElement;
    this.timeLabel = this.panel.querySelector('#timeline-time-label') as HTMLDivElement;
    this.countLabel = this.panel.querySelector('#timeline-count-label') as HTMLDivElement;

    this.slider.addEventListener('input', () => {
      this.onSliderChange();
    });

    this.playBtn.addEventListener('click', () => {
      this.togglePlayback();
    });

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.toggle();
      }
    });

    this.sync.onAnnotationsChange(() => this.updateTimestamps());
    this.sync.onStrokesChange(() => this.updateTimestamps());
    this.updateTimestamps();
  }

  private createToggleButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'timeline-toggle';
    btn.textContent = 'Timeline';
    btn.title = 'Time-travel playback (P)';
    btn.style.cssText = `
      position:absolute;bottom:12px;left:420px;z-index:100;
      padding:8px 16px;border:2px solid transparent;border-radius:6px;
      background:rgba(0,0,0,0.6);color:#fff;cursor:pointer;
      font-family:monospace;font-size:14px;pointer-events:auto;
    `;
    btn.addEventListener('click', () => this.toggle());
    return btn;
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'timeline-panel';
    panel.style.cssText = `
      position:absolute;bottom:52px;left:50%;transform:translateX(-50%);
      display:none;padding:12px 20px;min-width:400px;
      background:rgba(30,30,50,0.95);border-radius:10px;
      border:1px solid rgba(255,255,255,0.2);z-index:100;
      font-family:monospace;color:#ddd;
      box-shadow:0 4px 16px rgba(0,0,0,0.5);
    `;

    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <button id="timeline-play-btn" style="
          width:32px;height:32px;border:none;border-radius:50%;
          background:rgba(78,205,196,0.3);color:#4ecdc4;cursor:pointer;
          font-size:16px;display:flex;align-items:center;justify-content:center;
        " title="Play/Pause">&#9654;</button>
        <input id="timeline-slider" type="range" min="0" max="100" value="100" step="1" style="
          flex:1;height:6px;cursor:pointer;accent-color:#4ecdc4;
        " />
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#888;">
        <div id="timeline-time-label">All annotations</div>
        <div id="timeline-count-label">0 items</div>
      </div>
    `;

    return panel;
  }

  private toggle() {
    this.active = !this.active;
    this.btn.style.borderColor = this.active ? '#4ecdc4' : 'transparent';
    this.btn.style.background = this.active ? 'rgba(78,205,196,0.25)' : 'rgba(0,0,0,0.6)';
    this.panel.style.display = this.active ? 'block' : 'none';

    if (!this.active) {
      this.stopPlayback();
      // Reset filter — show all annotations
      this.pins.setTimeFilter(null);
      this.draw.setTimeFilter(null);
      this.slider.value = String(this.timestamps.length > 0 ? this.timestamps.length - 1 : 0);
      this.timeLabel.textContent = 'All annotations';
      this.updateCountLabel();
    } else {
      this.updateTimestamps();
    }
  }

  private updateTimestamps() {
    const annotations: Annotation[] = this.sync.getAnnotations();
    const strokes: Stroke[] = this.sync.getStrokes();

    const allTimes: number[] = [];
    for (const a of annotations) {
      if (a.timestamp) allTimes.push(a.timestamp);
    }
    for (const s of strokes) {
      if (s.timestamp) allTimes.push(s.timestamp);
    }

    allTimes.sort((a, b) => a - b);
    this.timestamps = allTimes;

    const max = this.timestamps.length > 0 ? this.timestamps.length - 1 : 0;
    this.slider.max = String(max);

    // If not actively filtering, keep slider at max
    if (!this.active || this.pins.getTimeFilter() === null) {
      this.slider.value = String(max);
    }

    this.updateCountLabel();
  }

  private onSliderChange() {
    const idx = parseInt(this.slider.value, 10);
    if (this.timestamps.length === 0) return;

    // If slider at max, show all (no filter)
    if (idx >= this.timestamps.length - 1) {
      this.pins.setTimeFilter(null);
      this.draw.setTimeFilter(null);
      this.timeLabel.textContent = 'All annotations';
    } else {
      const cutoff = this.timestamps[idx];
      this.pins.setTimeFilter(cutoff);
      this.draw.setTimeFilter(cutoff);
      this.timeLabel.textContent = this.formatTime(cutoff);
    }
    this.updateCountLabel();
  }

  private updateCountLabel() {
    const total = this.timestamps.length;
    const idx = parseInt(this.slider.value, 10);
    const shown = Math.min(idx + 1, total);
    this.countLabel.textContent = `${shown} / ${total} items`;
  }

  private formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  private togglePlayback() {
    if (this.playing) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  private startPlayback() {
    if (this.timestamps.length === 0) return;
    this.playing = true;
    this.playBtn.innerHTML = '&#9646;&#9646;'; // pause icon
    this.playBtn.style.background = 'rgba(255,107,107,0.3)';
    this.playBtn.style.color = '#ff6b6b';

    // Start from beginning if at end
    const currentIdx = parseInt(this.slider.value, 10);
    if (currentIdx >= this.timestamps.length - 1) {
      this.slider.value = '0';
      this.onSliderChange();
    }

    this.playInterval = setInterval(() => {
      const idx = parseInt(this.slider.value, 10);
      if (idx >= this.timestamps.length - 1) {
        this.stopPlayback();
        return;
      }
      this.slider.value = String(idx + 1);
      this.onSliderChange();
    }, 800);
  }

  private stopPlayback() {
    this.playing = false;
    this.playBtn.innerHTML = '&#9654;'; // play icon
    this.playBtn.style.background = 'rgba(78,205,196,0.3)';
    this.playBtn.style.color = '#4ecdc4';
    if (this.playInterval) {
      clearInterval(this.playInterval);
      this.playInterval = null;
    }
  }
}
