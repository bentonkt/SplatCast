const USER_COLORS = [
  '#ff6b6b', // red
  '#4ecdc4', // teal
  '#45b7d1', // blue
  '#96ceb4', // sage
  '#ffd93d', // yellow
  '#c084fc', // purple
  '#fb923c', // orange
  '#34d399', // emerald
  '#f472b6', // pink
  '#60a5fa', // sky
] as const;

/**
 * Deterministically map a userId to a consistent color.
 * Uses a simple hash to distribute users across the palette.
 */
function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getUserColor(userId: string): string {
  const index = hashUserId(userId) % USER_COLORS.length;
  return USER_COLORS[index];
}

export function createColorIndicator(userId: string): HTMLDivElement {
  const color = getUserColor(userId);
  const el = document.createElement('div');
  el.id = 'user-color-indicator';
  el.style.cssText = `
    position: fixed; bottom: 16px; left: 16px; z-index: 1000;
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; border-radius: 20px;
    background: rgba(0,0,0,0.7); color: #fff;
    font: 12px/1 monospace; pointer-events: none;
  `;
  const dot = document.createElement('span');
  dot.style.cssText = `
    width: 12px; height: 12px; border-radius: 50%;
    background: ${color}; display: inline-block;
    border: 2px solid white; flex-shrink: 0;
  `;
  el.appendChild(dot);
  const label = document.createElement('span');
  label.textContent = `You (${userId})`;
  el.appendChild(label);
  return el;
}
