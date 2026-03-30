import { SyncManager } from './collab/sync';
import { Annotation, Bookmark, Stroke } from './types';

interface ExportData {
  exportedAt: string;
  annotations: Annotation[];
  threads: Record<string, { parent: Annotation; replies: Annotation[] }>;
  orphanedReplies: Annotation[];
  strokes: Stroke[];
  bookmarks: Bookmark[];
}

function gatherExportData(sync: SyncManager): ExportData {
  const annotations = sync.getAnnotations();
  const strokes = sync.getStrokes();
  const bookmarks = sync.getBookmarks();

  // Separate top-level annotations from thread replies
  const topLevel = annotations.filter(a => !a.parentId);
  const replies = annotations.filter(a => a.parentId);

  const threads: Record<string, { parent: Annotation; replies: Annotation[] }> = {};
  const topLevelIds = new Set(topLevel.map(a => a.id));
  const orphanedReplies: Annotation[] = [];

  for (const reply of replies) {
    if (reply.parentId && topLevelIds.has(reply.parentId)) {
      if (!threads[reply.parentId]) {
        const parent = topLevel.find(a => a.id === reply.parentId) as Annotation;
        threads[reply.parentId] = { parent, replies: [] };
      }
      threads[reply.parentId].replies.push(reply);
    } else {
      orphanedReplies.push(reply);
    }
  }

  // Sort replies within each thread by timestamp
  for (const thread of Object.values(threads)) {
    thread.replies.sort((a, b) => a.timestamp - b.timestamp);
  }
  orphanedReplies.sort((a, b) => a.timestamp - b.timestamp);

  return {
    exportedAt: new Date().toISOString(),
    annotations: topLevel,
    threads,
    orphanedReplies,
    strokes,
    bookmarks,
  };
}

export function exportJSON(sync: SyncManager): void {
  const data = gatherExportData(sync);
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, `splatcast-export-${Date.now()}.json`, 'application/json');
}

export function exportCSV(sync: SyncManager): void {
  const data = gatherExportData(sync);
  const rows: string[][] = [];

  // Header
  rows.push([
    'category', 'id', 'type', 'label',
    'x', 'y', 'z',
    'endX', 'endY', 'endZ',
    'userId', 'color', 'timestamp', 'parentId',
  ]);

  // Annotations
  for (const a of data.annotations) {
    rows.push(annotationRow('annotation', a));
  }

  // Thread replies
  for (const thread of Object.values(data.threads)) {
    for (const reply of thread.replies) {
      rows.push(annotationRow('reply', reply));
    }
  }

  // Orphaned replies (parent annotation was deleted)
  for (const reply of data.orphanedReplies) {
    rows.push(annotationRow('orphaned-reply', reply));
  }

  // Bookmarks
  for (const b of data.bookmarks) {
    rows.push([
      'bookmark', b.id, 'bookmark', csvEscape(b.name),
      String(b.target[0]), String(b.target[1]), String(b.target[2]),
      '', '', '',
      b.userId, b.color, String(b.timestamp), '',
    ]);
  }

  // Strokes (one row per stroke, points serialized)
  for (const s of data.strokes) {
    const pointsStr = s.points.map(p => `${p.x}:${p.y}`).join(';');
    rows.push([
      'stroke', s.id, 'stroke', csvEscape(pointsStr),
      '', '', '',
      '', '', '',
      s.userId, s.color, String(s.timestamp), '',
    ]);
  }

  const csv = rows.map(r => r.join(',')).join('\n');
  downloadFile(csv, `splatcast-export-${Date.now()}.csv`, 'text/csv');
}

function annotationRow(category: string, a: Annotation): string[] {
  return [
    category, a.id, a.type, csvEscape(a.label),
    String(a.position[0]), String(a.position[1]), String(a.position[2]),
    a.endPosition ? String(a.endPosition[0]) : '',
    a.endPosition ? String(a.endPosition[1]) : '',
    a.endPosition ? String(a.endPosition[2]) : '',
    a.userId, a.color, String(a.timestamp), a.parentId ?? '',
  ];
}

function csvEscape(value: string): string {
  // Neutralize formula injection: prefix dangerous leading characters with a single quote
  let sanitized = value;
  if (/^[=+\-@\t\r]/.test(sanitized)) {
    sanitized = `'${sanitized}`;
  }
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
