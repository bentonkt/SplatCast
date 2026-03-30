import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

let roomCounter = 0;
function uniqueRoom(prefix: string): string {
  return `${prefix}-${Date.now()}-${roomCounter++}`;
}

async function waitForAppReady(page: import('@playwright/test').Page, room?: string) {
  const url = room ? `/room/${room}` : '/';
  await page.goto(url);
  await expect(page.locator('canvas#canvas')).toBeVisible();
  await page.waitForFunction(() => {
    const c = document.getElementById('canvas') as HTMLCanvasElement;
    return c && c.width > 0 && c.height > 0;
  }, { timeout: 10000 });
  await page.waitForSelector('#annotation-toolbar', { timeout: 5000 });
  await page.waitForSelector('#pin-overlay', { timeout: 5000 });
}

test('BCF export button appears in toolbar', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('bcf'));
  const btn = page.locator('#export-bcf-btn');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('BCF');
});

test('clicking BCF export triggers .bcfzip download', async ({ page }) => {
  const room = uniqueRoom('bcf');
  await waitForAppReady(page, room);

  // Place an annotation first
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(300);

  // Click BCF export
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-bcf-btn').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^splatcast-export-\d+\.bcfzip$/);
});

test('BCF export contains valid ZIP with bcf.version and topic folders', async ({ page }) => {
  const room = uniqueRoom('bcf');
  await waitForAppReady(page, room);

  // Place an annotation
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(300);

  // Download BCF
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-bcf-btn').click();
  const download = await downloadPromise;

  // Save to temp file and read
  const filePath = path.join('test-results', `bcf-test-${Date.now()}.bcfzip`);
  await download.saveAs(filePath);

  // Use JSZip to inspect contents
  const JSZip = (await import('jszip')).default;
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);

  // Must have bcf.version
  const versionFile = zip.file('bcf.version');
  expect(versionFile).not.toBeNull();
  const versionContent = await versionFile!.async('string');
  expect(versionContent).toContain('VersionId="2.1"');

  // Must have project.bcfp
  const projectFile = zip.file('project.bcfp');
  expect(projectFile).not.toBeNull();
  const projectContent = await projectFile!.async('string');
  expect(projectContent).toContain('SplatCast Export');

  // Must have at least one topic folder with markup.bcf
  const markupFiles = Object.keys(zip.files).filter(name => name.endsWith('/markup.bcf'));
  expect(markupFiles.length).toBeGreaterThanOrEqual(1);

  // Read a markup file and verify it has valid XML structure
  const markupContent = await zip.file(markupFiles[0])!.async('string');
  expect(markupContent).toContain('<Markup');
  expect(markupContent).toContain('<Topic');
  expect(markupContent).toContain('<Title>');
  expect(markupContent).toContain('<CreationDate>');
  expect(markupContent).toContain('<CreationAuthor>');

  // Clean up
  fs.unlinkSync(filePath);
});

test('BCF export includes viewpoint with camera position', async ({ page }) => {
  const room = uniqueRoom('bcf');
  await waitForAppReady(page, room);

  // Place an annotation
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(300);

  // Download BCF
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-bcf-btn').click();
  const download = await downloadPromise;

  const filePath = path.join('test-results', `bcf-viewpoint-${Date.now()}.bcfzip`);
  await download.saveAs(filePath);

  const JSZip = (await import('jszip')).default;
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);

  // Find viewpoint files
  const viewpointFiles = Object.keys(zip.files).filter(name => name.endsWith('.bcfv'));
  expect(viewpointFiles.length).toBeGreaterThanOrEqual(1);

  // Verify viewpoint has camera elements
  const vpContent = await zip.file(viewpointFiles[0])!.async('string');
  expect(vpContent).toContain('<PerspectiveCamera>');
  expect(vpContent).toContain('<CameraViewPoint>');
  expect(vpContent).toContain('<CameraDirection>');
  expect(vpContent).toContain('<CameraUpVector>');
  expect(vpContent).toContain('<FieldOfView>');

  fs.unlinkSync(filePath);
});

test('BCF export includes snapshot PNG', async ({ page }) => {
  const room = uniqueRoom('bcf');
  await waitForAppReady(page, room);

  // Place an annotation
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(300);

  // Download BCF
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-bcf-btn').click();
  const download = await downloadPromise;

  const filePath = path.join('test-results', `bcf-snapshot-${Date.now()}.bcfzip`);
  await download.saveAs(filePath);

  const JSZip = (await import('jszip')).default;
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);

  // Find PNG snapshot files
  const pngFiles = Object.keys(zip.files).filter(name => name.endsWith('.png'));
  expect(pngFiles.length).toBeGreaterThanOrEqual(1);

  // Verify it's actual PNG data (starts with PNG magic bytes)
  const pngData = await zip.file(pngFiles[0])!.async('uint8array');
  expect(pngData.length).toBeGreaterThan(8);
  // PNG magic bytes: 137 80 78 71 13 10 26 10
  expect(pngData[0]).toBe(137);
  expect(pngData[1]).toBe(80);
  expect(pngData[2]).toBe(78);
  expect(pngData[3]).toBe(71);

  fs.unlinkSync(filePath);
});

test('BCF export with task includes task topic with priority and status', async ({ page }) => {
  const room = uniqueRoom('bcf');
  await waitForAppReady(page, room);

  // Open task panel and enter task mode
  await page.click('#task-toggle-btn');
  await expect(page.locator('#task-panel')).toBeVisible();

  page.on('dialog', async (dialog) => {
    if (dialog.message().includes('title')) {
      await dialog.accept('Fix foundation crack');
    } else if (dialog.message().includes('Assignee')) {
      await dialog.accept('Alice');
    } else if (dialog.message().includes('Priority')) {
      await dialog.accept('high');
    }
  });

  await page.click('#task-mode-btn');

  // Place a task via double-click
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  await page.mouse.dblclick(box!.x + box!.width / 3, box!.y + box!.height / 3);

  // Wait for task to be created
  await expect(page.locator('#task-overlay .task-marker')).toHaveCount(1, { timeout: 5000 });

  // Download BCF
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-bcf-btn').click();
  const download = await downloadPromise;

  const filePath = path.join('test-results', `bcf-task-${Date.now()}.bcfzip`);
  await download.saveAs(filePath);

  const JSZip = (await import('jszip')).default;
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);

  // Find markup files and check at least one contains our task
  const markupFiles = Object.keys(zip.files).filter(name => name.endsWith('/markup.bcf'));
  let foundTask = false;
  for (const mf of markupFiles) {
    const content = await zip.file(mf)!.async('string');
    if (content.includes('Fix foundation crack')) {
      foundTask = true;
      expect(content).toContain('TopicType="Issue"');
      expect(content).toContain('<Priority>');
      break;
    }
  }
  expect(foundTask).toBe(true);

  fs.unlinkSync(filePath);
});

test('BCF export with multiple annotations creates multiple topic folders', async ({ page }) => {
  const room = uniqueRoom('bcf');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();

  // Place two annotations
  await page.mouse.dblclick(box!.x + box!.width / 3, box!.y + box!.height / 3);
  await page.waitForTimeout(300);
  await page.mouse.dblclick(box!.x + box!.width * 2 / 3, box!.y + box!.height * 2 / 3);
  await page.waitForTimeout(300);

  // Download BCF
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-bcf-btn').click();
  const download = await downloadPromise;

  const filePath = path.join('test-results', `bcf-multi-${Date.now()}.bcfzip`);
  await download.saveAs(filePath);

  const JSZip = (await import('jszip')).default;
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);

  // Should have at least 2 topic folders with markup.bcf
  const markupFiles = Object.keys(zip.files).filter(name => name.endsWith('/markup.bcf'));
  expect(markupFiles.length).toBeGreaterThanOrEqual(2);

  fs.unlinkSync(filePath);
});
