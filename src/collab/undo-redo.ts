import { SyncManager } from './sync';

export class UndoRedoToolbar {
  private toolbar: HTMLDivElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;

  constructor(private sync: SyncManager) {
    this.toolbar = document.createElement('div');
    this.toolbar.id = 'undo-redo-toolbar';
    this.toolbar.style.cssText = `
      position:absolute;bottom:16px;left:50%;transform:translateX(-50%);
      display:flex;gap:4px;padding:6px 10px;
      background:rgba(30,30,50,0.85);border-radius:8px;
      border:1px solid rgba(255,255,255,0.15);z-index:100;
    `;

    this.undoBtn = this.createButton('undo-btn', '\u21A9', 'Undo (Ctrl+Z)');
    this.redoBtn = this.createButton('redo-btn', '\u21AA', 'Redo (Ctrl+Shift+Z)');

    this.toolbar.appendChild(this.undoBtn);
    this.toolbar.appendChild(this.redoBtn);
    document.body.appendChild(this.toolbar);

    this.updateButtonStates();

    this.sync.onUndoRedoChange(() => {
      this.updateButtonStates();
    });

    document.addEventListener('keydown', this.onKeyDown);
  }

  private createButton(id: string, label: string, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = id;
    btn.textContent = label;
    btn.title = title;
    btn.style.cssText = `
      width:36px;height:36px;border:2px solid transparent;border-radius:6px;
      background:rgba(255,255,255,0.1);cursor:pointer;font-size:18px;
      display:flex;align-items:center;justify-content:center;
      color:white;pointer-events:auto;
    `;
    btn.addEventListener('click', () => {
      if (id === 'undo-btn') {
        this.sync.undo();
      } else {
        this.sync.redo();
      }
      this.updateButtonStates();
    });
    return btn;
  }

  private updateButtonStates() {
    const canUndo = this.sync.canUndo();
    const canRedo = this.sync.canRedo();
    this.undoBtn.disabled = !canUndo;
    this.undoBtn.style.opacity = canUndo ? '1' : '0.3';
    this.redoBtn.disabled = !canRedo;
    this.redoBtn.style.opacity = canRedo ? '1' : '0.3';
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Don't intercept when typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') {
      e.preventDefault();
      this.sync.redo();
      this.updateButtonStates();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      this.sync.undo();
      this.updateButtonStates();
    }
  };

  destroy() {
    document.removeEventListener('keydown', this.onKeyDown);
    this.toolbar.remove();
  }
}
