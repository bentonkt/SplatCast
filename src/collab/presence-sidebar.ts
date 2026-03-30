import { UserPresence } from '../types';
import { SyncManager } from './sync';
import { getUserColor } from './user-colors';

export class PresenceSidebar {
  private sidebar: HTMLDivElement;
  private userList: HTMLDivElement;
  private countBadge: HTMLSpanElement;
  readonly userId: string;
  private color: string;
  private name: string;

  constructor(private sync: SyncManager) {
    this.userId = crypto.randomUUID().slice(0, 8);
    this.color = getUserColor(this.userId);
    this.name = `User ${this.userId.slice(0, 4)}`;

    this.sidebar = document.createElement('div');
    this.sidebar.id = 'presence-sidebar';
    this.sidebar.style.cssText = `
      position:fixed;top:60px;right:12px;z-index:150;
      width:180px;
      background:rgba(30,30,50,0.9);border-radius:8px;
      border:1px solid rgba(255,255,255,0.15);
      font:13px/1.4 system-ui,sans-serif;color:#fff;
      overflow:hidden;
    `;

    const header = document.createElement('div');
    header.id = 'presence-header';
    header.style.cssText = `
      padding:8px 12px;display:flex;align-items:center;justify-content:space-between;
      cursor:pointer;user-select:none;
      border-bottom:1px solid rgba(255,255,255,0.1);
    `;
    header.textContent = 'Users ';

    this.countBadge = document.createElement('span');
    this.countBadge.id = 'presence-count';
    this.countBadge.style.cssText = `
      background:rgba(78,205,196,0.3);padding:1px 7px;border-radius:10px;
      font-size:11px;margin-left:4px;
    `;
    this.countBadge.textContent = '1';
    header.appendChild(this.countBadge);

    this.userList = document.createElement('div');
    this.userList.id = 'presence-user-list';
    this.userList.style.cssText = 'padding:6px 0;';

    header.addEventListener('click', () => {
      const hidden = this.userList.style.display === 'none';
      this.userList.style.display = hidden ? '' : 'none';
    });

    this.sidebar.appendChild(header);
    this.sidebar.appendChild(this.userList);
    document.body.appendChild(this.sidebar);

    // Set local presence
    this.sync.setLocalPresence({
      userId: this.userId,
      color: this.color,
      name: this.name,
    });

    // Listen for changes
    this.sync.onPresenceChange((users) => {
      this.renderUsers(users);
    });

    // Initial render
    this.renderUsers(this.sync.getPresences());
  }

  private renderUsers(users: UserPresence[]) {
    this.countBadge.textContent = String(users.length);
    this.userList.innerHTML = '';

    for (const user of users) {
      const row = document.createElement('div');
      row.className = 'presence-user';
      row.dataset.userId = user.userId;
      const isLocal = user.userId === this.userId;
      row.style.cssText = `
        padding:4px 12px;display:flex;align-items:center;gap:8px;
        ${isLocal ? 'font-weight:bold;' : ''}
      `;

      const dot = document.createElement('span');
      dot.className = 'presence-dot';
      dot.style.cssText = `
        width:10px;height:10px;border-radius:50%;flex-shrink:0;
        background:${user.color};border:1px solid rgba(255,255,255,0.5);
      `;
      row.appendChild(dot);

      const nameEl = document.createElement('span');
      nameEl.className = 'presence-name';
      nameEl.textContent = isLocal ? `${user.name} (you)` : user.name;
      nameEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      row.appendChild(nameEl);

      this.userList.appendChild(row);
    }
  }

  destroy() {
    this.sidebar.remove();
  }
}
