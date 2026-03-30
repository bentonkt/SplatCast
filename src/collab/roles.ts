import * as Y from 'yjs';
import { UserRole } from '../types';
import { SyncManager } from './sync';

export class RoleManager {
  private rolesMap: Y.Map<string>;
  private localUserId: string;
  private onChangeCallbacks: Array<() => void> = [];
  private badge: HTMLDivElement;

  constructor(
    private sync: SyncManager,
    localUserId: string,
  ) {
    this.localUserId = localUserId;
    this.rolesMap = this.sync.doc.getMap<string>('userRoles');

    this.badge = this.createRoleBadge();

    this.rolesMap.observe(() => {
      for (const cb of this.onChangeCallbacks) {
        cb();
      }
      this.updateBadge();
    });

    // Wait for initial sync before assigning a role so we know
    // whether another user has already claimed editor.
    if (this.sync.provider.synced) {
      this.assignDefaultRole();
    } else {
      const handler = (synced: boolean) => {
        if (synced) {
          this.sync.provider.off('sync', handler);
          this.assignDefaultRole();
        }
      };
      this.sync.provider.on('sync', handler);
    }
  }

  private assignDefaultRole() {
    if (this.rolesMap.has(this.localUserId)) {
      this.updateBadge();
      return;
    }
    // Check if any existing user already has editor role
    const hasEditor = Array.from(this.rolesMap.values()).some((r) => r === 'editor');
    const defaultRole: UserRole = hasEditor ? 'commenter' : 'editor';
    this.rolesMap.set(this.localUserId, defaultRole);
    this.updateBadge();
  }

  getLocalRole(): UserRole {
    return (this.rolesMap.get(this.localUserId) as UserRole) ?? 'commenter';
  }

  getRoleForUser(userId: string): UserRole {
    return (this.rolesMap.get(userId) as UserRole) ?? 'commenter';
  }

  setRoleForUser(userId: string, role: UserRole) {
    if (this.getLocalRole() !== 'editor') return;
    this.rolesMap.set(userId, role);
  }

  canAnnotate(): boolean {
    const role = this.getLocalRole();
    return role === 'commenter' || role === 'editor';
  }

  canEdit(): boolean {
    return this.getLocalRole() === 'editor';
  }

  canView(): boolean {
    return true;
  }

  onChange(callback: () => void) {
    this.onChangeCallbacks.push(callback);
  }

  private createRoleBadge(): HTMLDivElement {
    const badge = document.createElement('div');
    badge.id = 'role-badge';
    badge.style.cssText = `
      position:fixed;bottom:16px;right:16px;z-index:150;
      padding:6px 14px;border-radius:20px;
      background:rgba(30,30,50,0.9);border:1px solid rgba(255,255,255,0.15);
      font:12px/1.4 system-ui,sans-serif;color:#fff;
      display:flex;align-items:center;gap:6px;
      pointer-events:none;
    `;
    this.updateBadgeEl(badge);
    document.body.appendChild(badge);
    return badge;
  }

  private updateBadge() {
    this.updateBadgeEl(this.badge);
  }

  private updateBadgeEl(badge: HTMLDivElement) {
    const role = this.getLocalRole();
    const roleColors: Record<UserRole, string> = {
      viewer: '#888',
      commenter: '#ffd93d',
      editor: '#4ecdc4',
    };
    const roleLabels: Record<UserRole, string> = {
      viewer: 'Viewer',
      commenter: 'Commenter',
      editor: 'Editor',
    };
    badge.innerHTML = '';

    const dot = document.createElement('span');
    dot.className = 'role-dot';
    dot.style.cssText = `
      width:8px;height:8px;border-radius:50%;
      background:${roleColors[role]};
    `;
    badge.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'role-label';
    label.textContent = roleLabels[role];
    badge.appendChild(label);
  }
}
