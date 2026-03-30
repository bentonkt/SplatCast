import JSZip from 'jszip';
import { SyncManager } from './collab/sync';
import { Annotation, SpatialTask, CameraState } from './types';

/** Escape XML special characters */
function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateGuid(): string {
  return crypto.randomUUID();
}

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function bcfVersionXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Version VersionId="2.1" xsi:noNamespaceSchemaLocation="version.xsd"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <DetailedVersion>2.1</DetailedVersion>
</Version>`;
}

function projectXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ProjectExtension xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:noNamespaceSchemaLocation="project.xsd">
  <Project ProjectId="${generateGuid()}">
    <Name>SplatCast Export</Name>
  </Project>
</ProjectExtension>`;
}

interface BcfTopic {
  guid: string;
  title: string;
  description: string;
  author: string;
  creationDate: string;
  status: string;
  priority: string;
  assignee: string;
  type: string;
}

function topicFromAnnotation(a: Annotation): BcfTopic {
  return {
    guid: generateGuid(),
    title: a.label || `${a.type} annotation`,
    description: `${a.type} annotation at position (${a.position[0].toFixed(3)}, ${a.position[1].toFixed(3)}, ${a.position[2].toFixed(3)})`,
    author: a.userId,
    creationDate: toIso(a.timestamp),
    status: a.resolved ? 'Closed' : 'Open',
    priority: 'Normal',
    assignee: '',
    type: 'Comment',
  };
}

function topicFromTask(t: SpatialTask): BcfTopic {
  const statusMap: Record<string, string> = {
    'open': 'Open',
    'in-progress': 'Active',
    'done': 'Closed',
  };
  const priorityMap: Record<string, string> = {
    'low': 'Low',
    'medium': 'Normal',
    'high': 'Critical',
  };
  return {
    guid: generateGuid(),
    title: t.title,
    description: `Task at position (${t.position[0].toFixed(3)}, ${t.position[1].toFixed(3)}, ${t.position[2].toFixed(3)})`,
    author: t.createdBy,
    creationDate: toIso(t.timestamp),
    status: statusMap[t.status] || 'Open',
    priority: priorityMap[t.priority] || 'Normal',
    assignee: t.assignee,
    type: 'Issue',
  };
}

function markupXml(topic: BcfTopic, viewpointGuid: string, hasSnapshot: boolean): string {
  const assignedLine = topic.assignee
    ? `    <AssignedTo>${xmlEscape(topic.assignee)}</AssignedTo>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:noNamespaceSchemaLocation="markup.xsd">
  <Topic Guid="${topic.guid}" TopicType="${xmlEscape(topic.type)}" TopicStatus="${xmlEscape(topic.status)}">
    <Title>${xmlEscape(topic.title)}</Title>
    <Priority>${xmlEscape(topic.priority)}</Priority>
    <CreationDate>${topic.creationDate}</CreationDate>
    <CreationAuthor>${xmlEscape(topic.author)}</CreationAuthor>
    <Description>${xmlEscape(topic.description)}</Description>
${assignedLine ? assignedLine + '\n' : ''}  </Topic>
  <Viewpoints Guid="${viewpointGuid}">
    <Viewpoint>${viewpointGuid}.bcfv</Viewpoint>
${hasSnapshot ? `    <Snapshot>${viewpointGuid}.png</Snapshot>` : ''}
  </Viewpoints>
</Markup>`;
}

function viewpointXml(viewpointGuid: string, camera: CameraState): string {
  const pos = camera.position;
  const target = camera.target;
  // Direction = target - position (normalized)
  const dx = target[0] - pos[0];
  const dy = target[1] - pos[1];
  const dz = target[2] - pos[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const dir = len > 0 ? [dx / len, dy / len, dz / len] : [0, 0, -1];

  return `<?xml version="1.0" encoding="UTF-8"?>
<VisualizationInfo Guid="${viewpointGuid}"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:noNamespaceSchemaLocation="visinfo.xsd">
  <PerspectiveCamera>
    <CameraViewPoint>
      <X>${pos[0]}</X>
      <Y>${pos[1]}</Y>
      <Z>${pos[2]}</Z>
    </CameraViewPoint>
    <CameraDirection>
      <X>${dir[0]}</X>
      <Y>${dir[1]}</Y>
      <Z>${dir[2]}</Z>
    </CameraDirection>
    <CameraUpVector>
      <X>${camera.up[0]}</X>
      <Y>${camera.up[1]}</Y>
      <Z>${camera.up[2]}</Z>
    </CameraUpVector>
    <FieldOfView>${camera.fov}</FieldOfView>
  </PerspectiveCamera>
</VisualizationInfo>`;
}

/** Capture current canvas as PNG blob */
function captureSnapshotBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/**
 * Export annotations and tasks as a BCF 2.1 .bcfzip file.
 * Each annotation/task becomes a BCF topic with a viewpoint and snapshot.
 */
export async function exportBCF(
  sync: SyncManager,
  canvas: HTMLCanvasElement,
): Promise<void> {
  const zip = new JSZip();

  // BCF version file
  zip.file('bcf.version', bcfVersionXml());
  zip.file('project.bcfp', projectXml());

  // Get camera state for viewpoints
  const cam = (window as Record<string, unknown>)['__camera'] as
    { getState(): CameraState } | undefined;
  const cameraState: CameraState = cam
    ? cam.getState()
    : { position: [0, 5, 0], target: [0, 0, 0], up: [0, 1, 0], fov: 60 };

  // Capture current viewport as snapshot
  const snapshotBlob = await captureSnapshotBlob(canvas);

  // Gather annotations (top-level only, no thread replies)
  const annotations = sync.getAnnotations().filter((a) => !a.parentId);
  const tasks = sync.getTasks();

  // Create topics from annotations
  for (const annotation of annotations) {
    const topic = topicFromAnnotation(annotation);
    const viewpointGuid = generateGuid();
    const folder = zip.folder(topic.guid)!;

    folder.file('markup.bcf', markupXml(topic, viewpointGuid, snapshotBlob !== null));
    folder.file(`${viewpointGuid}.bcfv`, viewpointXml(viewpointGuid, cameraState));

    if (snapshotBlob) {
      folder.file(`${viewpointGuid}.png`, snapshotBlob);
    }
  }

  // Create topics from tasks
  for (const task of tasks) {
    const topic = topicFromTask(task);
    const viewpointGuid = generateGuid();
    const folder = zip.folder(topic.guid)!;

    folder.file('markup.bcf', markupXml(topic, viewpointGuid, snapshotBlob !== null));
    folder.file(`${viewpointGuid}.bcfv`, viewpointXml(viewpointGuid, cameraState));

    if (snapshotBlob) {
      folder.file(`${viewpointGuid}.png`, snapshotBlob);
    }
  }

  // If nothing to export, create a single empty-state topic
  if (annotations.length === 0 && tasks.length === 0) {
    const topic: BcfTopic = {
      guid: generateGuid(),
      title: 'SplatCast Export (no issues)',
      description: 'No annotations or tasks were present at time of export.',
      author: 'SplatCast',
      creationDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      status: 'Open',
      priority: 'Normal',
      assignee: '',
      type: 'Comment',
    };
    const viewpointGuid = generateGuid();
    const folder = zip.folder(topic.guid)!;
    folder.file('markup.bcf', markupXml(topic, viewpointGuid, false));
    folder.file(`${viewpointGuid}.bcfv`, viewpointXml(viewpointGuid, cameraState));
  }

  // Generate and download
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `splatcast-export-${Date.now()}.bcfzip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
