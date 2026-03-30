import { UserPresence, UserRole } from '../types';
import { SyncManager } from './sync';
import { getUserColor } from './user-colors';
import { RoleManager } from './roles';

export class PresenceSidebar {
  private sidebar: HTMLDivElement;
  private userList: HTMLDivElement;
  private countBadge: HTMLSpanElement;
  readonly userId: string;
  private color: string;
  private name: string;
  private followingUserId: string | null = null;
  private followBanner: HTMLDivElement | null = null;
  private onFollowChange: ((userId: string | null) => void) | null = null;
  private roleManager: RoleManager | null = null;

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
      role: 'commenter',
    });

    // Listen for changes
    this.sync.onPresenceChange((users) => {
      this.renderUsers(users);
    });

    // Initial render
    this.renderUsers(this.sync.getPresences());
  }

  setRoleManager(roleManager: RoleManager) {
    this.roleManager = roleManager;
    // Update local presence with the actual role
    this.sync.setLocalPresence({
      userId: this.userId,
      color: this.color,
      name: this.name,
      role: roleManager.getLocalRole(),
    });
    roleManager.onChange(() => {
      this.sync.setLocalPresence({
        userId: this.userId,
        color: this.color,
        name: this.name,
        role: roleManager.getLocalRole(),
      });
      this.renderUsers(this.sync.getPresences());
    });
  }

  setFollowChangeHandler(handler: (userId: string | null) => void) {
    this.onFollowChange = handler;
  }

  followUser(userId: string) {
    this.followingUserId = userId;
    this.renderUsers(this.sync.getPresences());
    this.showFollowBanner(userId);
    this.onFollowChange?.(userId);
  }

  unfollow() {
    if (!this.followingUserId) return;
    this.followingUserId = null;
    this.renderUsers(this.sync.getPresences());
    this.hideFollowBanner();
    this.onFollowChange?.(null);
  }

  getFollowingUserId(): string | null {
    return this.followingUserId;
  }

  private showFollowBanner(userId: string) {
    this.hideFollowBanner();
    const users = this.sync.getPresences();
    const user = users.find((u) => u.userId === userId);
    const name = user ? user.name : userId;

    const banner = document.createElement('div');
    banner.id = 'follow-banner';
    banner.style.cssText = `
      position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:200;
      background:rgba(78,205,196,0.9);color:#1a1a2e;
      padding:8px 16px;border-radius:8px;
      font:13px/1.4 system-ui,sans-serif;font-weight:bold;
      display:flex;align-items:center;gap:10px;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
    `;

    const text = document.createElement('span');
    text.textContent = `Following ${name}`;
    banner.appendChild(text);

    const unfollowBtn = document.createElement('button');
    unfollowBtn.id = 'unfollow-btn';
    unfollowBtn.textContent = 'Unfollow';
    unfollowBtn.style.cssText = `
      padding:3px 10px;border:1px solid #1a1a2e;border-radius:4px;
      background:rgba(26,26,46,0.2);color:#1a1a2e;cursor:pointer;
      font:12px system-ui,sans-serif;font-weight:bold;
    `;
    unfollowBtn.addEventListener('click', () => this.unfollow());
    banner.appendChild(unfollowBtn);

    document.body.appendChild(banner);
    this.followBanner = banner;
  }

  private hideFollowBanner() {
    if (this.followBanner) {
      this.followBanner.remove();
      this.followBanner = null;
    }
  }

  private renderUsers(users: UserPresence[]) {
    this.countBadge.textContent = String(users.length);
    this.userList.innerHTML = '';

    for (const user of users) {
      const row = document.createElement('div');
      row.className = 'presence-user';
      row.dataset.userId = user.userId;
      const isLocal = user.userId === this.userId;
      const isFollowing = user.userId === this.followingUserId;
      row.style.cssText = `
        padding:4px 12px;display:flex;align-items:center;gap:8px;
        ${isLocal ? 'font-weight:bold;' : ''}
        ${isFollowing ? 'background:rgba(78,205,196,0.15);' : ''}
      `;

      const dot = document.createElement('span');
      dot.className = 'presence-dot';
      dot.style.cssText = `
        width:10px;height:10px;border-radius:50%;flex-shrink:0;
        background:${user.color};border:1px solid rgba(255,255,255,0.5);
      `;
      row.appendChild(dot);

      const nameContainer = document.createElement('div');
      nameContainer.style.cssText = 'overflow:hidden;flex:1;display:flex;flex-direction:column;gap:1px;';

      const nameEl = document.createElement('span');
      nameEl.className = 'presence-name';
      nameEl.textContent = isLocal ? `${user.name} (you)` : user.name;
      nameEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      nameContainer.appendChild(nameEl);

      const userRole = this.roleManager ? this.roleManager.getRoleForUser(user.userId) : (user.role ?? 'commenter');
      const roleColors: Record<UserRole, string> = {
        viewer: '#888',
        commenter: '#ffd93d',
        editor: '#4ecdc4',
      };
      const roleEl = document.createElement('span');
      roleEl.className = 'presence-role';
      roleEl.textContent = userRole;
      roleEl.style.cssText = `font-size:10px;color:${roleColors[userRole]};text-transform:capitalize;`;
      nameContainer.appendChild(roleEl);

      row.appendChild(nameContainer);

      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'display:flex;gap:4px;align-items:center;flex-shrink:0;';

      if (!isLocal && this.roleManager && this.roleManager.getLocalRole() === 'editor') {
        const roleSelect = document.createElement('select');
        roleSelect.className = 'role-select';
        roleSelect.dataset.userId = user.userId;
        roleSelect.style.cssText = `
          padding:1px 2px;border:1px solid rgba(255,255,255,0.2);border-radius:3px;
          background:rgba(0,0,0,0.3);color:#fff;cursor:pointer;
          font:9px system-ui,sans-serif;flex-shrink:0;
        `;
        const roles: UserRole[] = ['viewer', 'commenter', 'editor'];
        for (const r of roles) {
          const opt = document.createElement('option');
          opt.value = r;
          opt.textContent = r.charAt(0).toUpperCase() + r.slice(1);
          opt.selected = r === userRole;
          roleSelect.appendChild(opt);
        }
        roleSelect.addEventListener('change', (e) => {
          e.stopPropagation();
          const newRole = roleSelect.value as UserRole;
          this.roleManager!.setRoleForUser(user.userId, newRole);
        });
        btnContainer.appendChild(roleSelect);
      }

      if (!isLocal) {
        const followBtn = document.createElement('button');
        followBtn.className = 'follow-btn';
        followBtn.dataset.userId = user.userId;
        followBtn.textContent = isFollowing ? 'Unfollow' : 'Follow';
        followBtn.style.cssText = `
          padding:1px 6px;border:1px solid rgba(78,205,196,0.5);border-radius:3px;
          background:${isFollowing ? 'rgba(78,205,196,0.3)' : 'transparent'};
          color:#4ecdc4;cursor:pointer;font:10px system-ui,sans-serif;flex-shrink:0;
        `;
        followBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isFollowing) {
            this.unfollow();
          } else {
            this.followUser(user.userId);
          }
        });
        btnContainer.appendChild(followBtn);
      }

      row.appendChild(btnContainer);
      this.userList.appendChild(row);
    }
  }

  destroy() {
    this.hideFollowBanner();
    this.sidebar.remove();
  }
}
