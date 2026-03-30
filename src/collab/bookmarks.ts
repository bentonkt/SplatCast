import { SyncManager } from './sync';
import { OrbitCamera } from '../renderer/camera';
import { Bookmark } from '../types';

export class BookmarkPanel {
  private panel: HTMLDivElement;
  private listEl: HTMLDivElement;
  private addBtn: HTMLButtonElement;

  constructor(private sync: SyncManager, private camera: OrbitCamera) {
    this.panel = document.createElement('div');
    this.panel.id = 'bookmark-panel';
    this.panel.style.cssText = `
      position:absolute;bottom:60px;left:16px;
      display:flex;flex-direction:column;gap:6px;
      padding:10px;min-width:180px;max-width:240px;
      background:rgba(30,30,50,0.85);border-radius:8px;
      border:1px solid rgba(255,255,255,0.15);z-index:100;
      font-family:monospace;color:white;font-size:13px;
      pointer-events:auto;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;
      padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.15);
      margin-bottom:2px;
    `;
    const title = document.createElement('span');
    title.textContent = 'Bookmarks';
    title.style.cssText = 'font-weight:bold;font-size:14px;';
    header.appendChild(title);

    this.addBtn = document.createElement('button');
    this.addBtn.id = 'bookmark-add-btn';
    this.addBtn.textContent = '+';
    this.addBtn.title = 'Save current view (B)';
    this.addBtn.style.cssText = `
      width:28px;height:28px;border:none;border-radius:4px;
      background:rgba(255,255,255,0.15);color:white;cursor:pointer;
      font-size:16px;font-weight:bold;display:flex;align-items:center;
      justify-content:center;
    `;
    this.addBtn.addEventListener('click', () => this.saveBookmark());
    header.appendChild(this.addBtn);

    this.panel.appendChild(header);

    this.listEl = document.createElement('div');
    this.listEl.id = 'bookmark-list';
    this.listEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    this.panel.appendChild(this.listEl);

    document.body.appendChild(this.panel);

    this.renderBookmarks(this.sync.getBookmarks());
    this.sync.onBookmarksChange((bookmarks) => this.renderBookmarks(bookmarks));

    document.addEventListener('keydown', this.onKeyDown);
  }

  private saveBookmark() {
    const name = prompt('Bookmark name:');
    if (!name || !name.trim()) return;

    const orbital = this.camera.getOrbitalState();
    const awareness = this.sync.awareness.getLocalState();
    const userId = awareness?.['presence']?.userId ?? 'unknown';
    const color = awareness?.['presence']?.color ?? '#4ecdc4';

    const bookmark: Bookmark = {
      id: `bk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      theta: orbital.theta,
      phi: orbital.phi,
      radius: orbital.radius,
      target: orbital.target,
      userId,
      color,
      timestamp: Date.now(),
    };

    this.sync.addBookmark(bookmark);
  }

  private renderBookmarks(bookmarks: Bookmark[]) {
    this.listEl.innerHTML = '';

    const sorted = [...bookmarks].sort((a, b) => a.timestamp - b.timestamp);

    for (const bk of sorted) {
      const item = document.createElement('div');
      item.className = 'bookmark-item';
      item.dataset.bookmarkId = bk.id;
      item.style.cssText = `
        display:flex;align-items:center;gap:6px;padding:4px 6px;
        border-radius:4px;cursor:pointer;
        background:rgba(255,255,255,0.05);
      `;
      item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(255,255,255,0.12)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'rgba(255,255,255,0.05)';
      });

      const dot = document.createElement('span');
      dot.style.cssText = `
        width:8px;height:8px;border-radius:50%;flex-shrink:0;
        background:${bk.color};
      `;
      item.appendChild(dot);

      const label = document.createElement('span');
      label.textContent = bk.name;
      label.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      item.appendChild(label);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'bookmark-remove-btn';
      removeBtn.textContent = '\u00d7';
      removeBtn.title = 'Remove bookmark';
      removeBtn.style.cssText = `
        width:20px;height:20px;border:none;border-radius:3px;
        background:transparent;color:rgba(255,255,255,0.5);cursor:pointer;
        font-size:14px;display:flex;align-items:center;justify-content:center;
        flex-shrink:0;
      `;
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sync.removeBookmark(bk.id);
      });
      item.appendChild(removeBtn);

      item.addEventListener('click', () => {
        this.camera.setOrbitalState({
          theta: bk.theta,
          phi: bk.phi,
          radius: bk.radius,
          target: bk.target,
        });
      });

      this.listEl.appendChild(item);
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'b' || e.key === 'B') {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.saveBookmark();
      }
    }
  };

  destroy() {
    document.removeEventListener('keydown', this.onKeyDown);
    this.panel.remove();
  }
}
