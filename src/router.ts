/**
 * Simple client-side router for room-based URLs.
 * Routes: / → lobby, /room/<id> → viewer
 */

export interface RouteResult {
  type: 'lobby' | 'room';
  roomId?: string;
}

export function parseRoute(): RouteResult {
  const path = window.location.pathname;

  // Match /room/<id> pattern
  const match = path.match(/^\/room\/([a-zA-Z0-9_-]+)$/);
  if (match) {
    return { type: 'room', roomId: match[1] };
  }

  // Also support legacy ?room= query param for backwards compat
  const params = new URLSearchParams(window.location.search);
  const queryRoom = params.get('room');
  if (queryRoom) {
    return { type: 'room', roomId: queryRoom };
  }

  return { type: 'lobby' };
}

export function generateRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function navigateToRoom(roomId: string): void {
  window.location.href = `/room/${roomId}`;
}
