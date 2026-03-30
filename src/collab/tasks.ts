import { SpatialTask, TaskPriority, TaskStatus } from '../types';
import { SyncManager } from './sync';

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: '#4ecdc4',
  medium: '#ffd93d',
  high: '#ff6b6b',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Open',
  'in-progress': 'In Progress',
  done: 'Done',
};

export class TaskManager {
  private tasks: SpatialTask[] = [];
  private overlay: HTMLDivElement;
  private panel: HTMLDivElement;
  private listEl: HTMLDivElement;
  private toggleBtn: HTMLButtonElement;
  private taskMode = false;
  readonly userId: string;

  constructor(
    private canvas: HTMLCanvasElement,
    private sync: SyncManager,
  ) {
    this.userId = crypto.randomUUID().slice(0, 8);

    this.overlay = document.createElement('div');
    this.overlay.id = 'task-overlay';
    this.overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    document.body.appendChild(this.overlay);

    this.toggleBtn = this.createToggleButton();
    this.panel = this.createPanel();
    this.listEl = this.panel.querySelector('#task-list')!;

    document.body.appendChild(this.toggleBtn);
    document.body.appendChild(this.panel);

    this.canvas.addEventListener('dblclick', this.onDoubleClick);
    document.addEventListener('keydown', this.onKeyDown);

    this.sync.onTasksChange((tasks) => {
      this.tasks = tasks;
      this.renderTaskMarkers();
      this.renderTaskList();
    });

    this.tasks = this.sync.getTasks();
    this.renderTaskMarkers();
    this.renderTaskList();
  }

  private createToggleButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'task-toggle-btn';
    btn.textContent = '\u{1F4CB}';
    btn.title = 'Tasks (K)';
    btn.style.cssText = `
      position:absolute;top:12px;right:200px;z-index:100;
      width:36px;height:36px;border:none;border-radius:6px;
      background:rgba(30,30,50,0.85);color:white;cursor:pointer;
      font-size:18px;display:flex;align-items:center;justify-content:center;
      border:1px solid rgba(255,255,255,0.15);
    `;
    btn.addEventListener('click', () => this.togglePanel());
    return btn;
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'task-panel';
    panel.style.cssText = `
      position:absolute;top:50px;right:200px;
      display:none;flex-direction:column;gap:6px;
      padding:10px;min-width:260px;max-width:320px;max-height:400px;
      background:rgba(30,30,50,0.92);border-radius:8px;
      border:1px solid rgba(255,255,255,0.15);z-index:100;
      font-family:system-ui,sans-serif;color:white;font-size:13px;
      pointer-events:auto;overflow-y:auto;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;
      padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.15);
      margin-bottom:4px;
    `;
    const title = document.createElement('span');
    title.textContent = 'Spatial Tasks';
    title.style.cssText = 'font-weight:bold;font-size:14px;';
    header.appendChild(title);

    const modeBtn = document.createElement('button');
    modeBtn.id = 'task-mode-btn';
    modeBtn.textContent = '+ Place';
    modeBtn.title = 'Double-click scene to place task';
    modeBtn.style.cssText = `
      border:none;border-radius:4px;padding:4px 10px;
      background:rgba(255,255,255,0.15);color:white;cursor:pointer;
      font-size:12px;font-family:system-ui,sans-serif;
    `;
    modeBtn.addEventListener('click', () => this.toggleTaskMode());
    header.appendChild(modeBtn);

    panel.appendChild(header);

    const list = document.createElement('div');
    list.id = 'task-list';
    list.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    panel.appendChild(list);

    return panel;
  }

  private togglePanel() {
    const isVisible = this.panel.style.display === 'flex';
    this.panel.style.display = isVisible ? 'none' : 'flex';
    this.toggleBtn.style.background = isVisible
      ? 'rgba(30,30,50,0.85)'
      : 'rgba(78,205,196,0.5)';
  }

  private toggleTaskMode() {
    this.taskMode = !this.taskMode;
    const modeBtn = this.panel.querySelector('#task-mode-btn') as HTMLButtonElement;
    modeBtn.style.background = this.taskMode
      ? 'rgba(78,205,196,0.5)'
      : 'rgba(255,255,255,0.15)';
    modeBtn.textContent = this.taskMode ? 'Placing...' : '+ Place';
    this.canvas.style.cursor = this.taskMode ? 'crosshair' : '';
  }

  private onDoubleClick = (e: MouseEvent) => {
    if (!this.taskMode) return;

    const rect = this.canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    const position: [number, number, number] = [nx, ny, 0];

    const title = prompt('Task title:');
    if (!title) return;

    const assignee = prompt('Assignee (name):') ?? '';
    const priorityInput = prompt('Priority (low/medium/high):') ?? 'medium';
    const priority: TaskPriority = (['low', 'medium', 'high'].includes(priorityInput)
      ? priorityInput
      : 'medium') as TaskPriority;

    const task: SpatialTask = {
      id: crypto.randomUUID().slice(0, 8),
      title,
      position,
      assignee,
      priority,
      status: 'open',
      createdBy: this.userId,
      timestamp: Date.now(),
    };

    this.sync.addTask(task);

    // Exit task mode after placing
    this.toggleTaskMode();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    if (e.key === 'k' || e.key === 'K') {
      this.togglePanel();
    }
  };

  private renderTaskMarkers() {
    this.overlay.innerHTML = '';
    for (const task of this.tasks) {
      const marker = document.createElement('div');
      marker.className = 'task-marker';
      marker.dataset.taskId = task.id;
      marker.dataset.taskStatus = task.status;

      const rect = this.canvas.getBoundingClientRect();
      const screenX = ((task.position[0] + 1) / 2) * rect.width;
      const screenY = ((1 - task.position[1]) / 2) * rect.height;

      const isDone = task.status === 'done';
      marker.style.cssText = `
        position:absolute;pointer-events:auto;cursor:pointer;
        left:${screenX - 12}px;top:${screenY - 12}px;
        width:24px;height:24px;border-radius:4px;
        background:${isDone ? '#666' : PRIORITY_COLORS[task.priority]};
        opacity:${isDone ? 0.5 : 1};
        display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:bold;color:#1a1a2e;
        border:2px solid rgba(255,255,255,0.3);
        box-shadow:0 2px 8px rgba(0,0,0,0.4);
      `;
      marker.textContent = isDone ? '\u2713' : task.priority[0].toUpperCase();
      marker.title = `${task.title} (${STATUS_LABELS[task.status]})`;

      marker.addEventListener('click', () => {
        this.panel.style.display = 'flex';
        this.toggleBtn.style.background = 'rgba(78,205,196,0.5)';
      });

      this.overlay.appendChild(marker);
    }
  }

  private renderTaskList() {
    this.listEl.innerHTML = '';

    if (this.tasks.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#888;padding:8px 0;text-align:center;font-size:12px;';
      empty.textContent = 'No tasks yet. Click "+ Place" then double-click the scene.';
      this.listEl.appendChild(empty);
      return;
    }

    const sorted = [...this.tasks].sort((a, b) => {
      const statusOrder: Record<TaskStatus, number> = { open: 0, 'in-progress': 1, done: 2 };
      const priorityOrder: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
      if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    for (const task of sorted) {
      const row = document.createElement('div');
      row.className = 'task-row';
      row.dataset.taskId = task.id;
      row.style.cssText = `
        display:flex;flex-direction:column;gap:4px;
        padding:8px;border-radius:6px;
        background:rgba(255,255,255,0.06);
        border-left:3px solid ${PRIORITY_COLORS[task.priority]};
        ${task.status === 'done' ? 'opacity:0.5;' : ''}
      `;

      const titleRow = document.createElement('div');
      titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;';

      const titleEl = document.createElement('span');
      titleEl.className = 'task-title';
      titleEl.textContent = task.title;
      titleEl.style.cssText = `font-weight:600;font-size:13px;flex:1;${task.status === 'done' ? 'text-decoration:line-through;' : ''}`;
      titleRow.appendChild(titleEl);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'task-delete-btn';
      deleteBtn.textContent = '\u00D7';
      deleteBtn.style.cssText = `
        border:none;background:none;color:#888;cursor:pointer;
        font-size:16px;padding:0 2px;line-height:1;
      `;
      deleteBtn.addEventListener('click', () => this.sync.removeTask(task.id));
      titleRow.appendChild(deleteBtn);

      row.appendChild(titleRow);

      const metaRow = document.createElement('div');
      metaRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;color:#aaa;';

      const priorityBadge = document.createElement('span');
      priorityBadge.className = 'task-priority';
      priorityBadge.textContent = PRIORITY_LABELS[task.priority];
      priorityBadge.style.cssText = `
        padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;
        background:${PRIORITY_COLORS[task.priority]}33;color:${PRIORITY_COLORS[task.priority]};
      `;
      metaRow.appendChild(priorityBadge);

      if (task.assignee) {
        const assigneeEl = document.createElement('span');
        assigneeEl.className = 'task-assignee';
        assigneeEl.textContent = `@${task.assignee}`;
        metaRow.appendChild(assigneeEl);
      }

      row.appendChild(metaRow);

      const statusRow = document.createElement('div');
      statusRow.style.cssText = 'display:flex;gap:4px;margin-top:2px;';

      const statuses: TaskStatus[] = ['open', 'in-progress', 'done'];
      for (const s of statuses) {
        const sBtn = document.createElement('button');
        sBtn.className = 'task-status-btn';
        sBtn.dataset.status = s;
        sBtn.textContent = STATUS_LABELS[s];
        sBtn.style.cssText = `
          border:none;border-radius:3px;padding:2px 8px;
          font-size:10px;cursor:pointer;font-family:system-ui,sans-serif;
          background:${task.status === s ? 'rgba(78,205,196,0.4)' : 'rgba(255,255,255,0.1)'};
          color:${task.status === s ? '#4ecdc4' : '#888'};
          font-weight:${task.status === s ? '600' : '400'};
        `;
        sBtn.addEventListener('click', () => {
          this.sync.updateTask(task.id, { status: s });
        });
        statusRow.appendChild(sBtn);
      }

      row.appendChild(statusRow);
      this.listEl.appendChild(row);
    }
  }
}
