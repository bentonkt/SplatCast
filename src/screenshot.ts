/**
 * Captures the current viewport (WebGPU canvas + annotation overlays)
 * as a composite PNG and triggers a download.
 */
export async function captureScreenshot(canvas: HTMLCanvasElement): Promise<void> {
  const width = canvas.width;
  const height = canvas.height;

  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d')!;

  // 1. Draw the WebGPU canvas (splat scene)
  ctx.drawImage(canvas, 0, 0);

  // 2. Draw SVG overlays (draw strokes, arrows, measurements)
  await drawSvgOverlays(ctx, width, height);

  // 3. Draw HTML annotation elements (pins, text labels)
  drawHtmlAnnotations(ctx, canvas);

  // 4. Export as PNG and trigger download
  offscreen.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `splatcast-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

async function drawSvgOverlays(ctx: CanvasRenderingContext2D, width: number, height: number): Promise<void> {
  const svgElements: SVGSVGElement[] = [];

  // Collect SVGs from pin-overlay (arrows, measurements)
  const pinOverlay = document.getElementById('pin-overlay');
  if (pinOverlay) {
    svgElements.push(...Array.from(pinOverlay.querySelectorAll<SVGSVGElement>(':scope > svg')));
  }

  // Collect SVGs from draw-overlay (freehand strokes)
  const drawOverlay = document.getElementById('draw-overlay') as SVGSVGElement | null;
  if (drawOverlay && drawOverlay.children.length > 0) {
    svgElements.push(drawOverlay);
  }

  for (const svg of svgElements) {
    await drawSvgToCanvas(ctx, svg, width, height);
  }
}

function drawSvgToCanvas(ctx: CanvasRenderingContext2D, svg: SVGSVGElement, width: number, height: number): Promise<void> {
  return new Promise((resolve) => {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clone);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    img.src = url;
  });
}

function drawHtmlAnnotations(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const pinOverlay = document.getElementById('pin-overlay');
  if (!pinOverlay) return;

  const children = pinOverlay.children;
  for (let i = 0; i < children.length; i++) {
    const el = children[i] as HTMLElement;
    // Skip SVG elements — already handled
    if (el.tagName.toLowerCase() === 'svg') continue;

    const annotationType = el.dataset.annotationType;
    if (annotationType === 'pin') {
      drawPinToCanvas(ctx, el, canvas);
    } else if (annotationType === 'text') {
      drawTextToCanvas(ctx, el);
    }
  }
}

function drawPinToCanvas(ctx: CanvasRenderingContext2D, container: HTMLElement, canvas: HTMLCanvasElement): void {
  const style = container.style;
  const left = parseFloat(style.left) + 8; // center of 16px dot
  const top = parseFloat(style.top) + 8;

  // Find the pin dot for its color
  const dot = container.querySelector('.pin-dot') as HTMLElement | null;
  const color = dot ? dot.style.background : '#ff6b6b';

  // Draw pin dot
  ctx.beginPath();
  ctx.arc(left, top, 8, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw shadow
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(left, top, 8, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Draw label if present
  const labelEl = container.querySelector('.pin-label') as HTMLElement | null;
  if (labelEl && labelEl.textContent) {
    const text = labelEl.textContent;
    ctx.font = '12px system-ui, sans-serif';
    const metrics = ctx.measureText(text);
    const labelWidth = metrics.width + 12;
    const labelHeight = 20;
    const labelX = left - labelWidth / 2;
    const labelY = top + 12;

    // Label background
    ctx.fillStyle = 'rgba(30,30,50,0.85)';
    roundRect(ctx, labelX, labelY, labelWidth, labelHeight, 3);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    roundRect(ctx, labelX, labelY, labelWidth, labelHeight, 3);
    ctx.stroke();

    // Label text
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left, labelY + labelHeight / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}

function drawTextToCanvas(ctx: CanvasRenderingContext2D, el: HTMLElement): void {
  const left = parseFloat(el.style.left);
  const top = parseFloat(el.style.top);
  const text = el.textContent || '';
  const bgColor = el.style.background;

  ctx.font = 'bold 13px system-ui, sans-serif';
  const metrics = ctx.measureText(text);
  const padX = 8;
  const padY = 4;
  const w = metrics.width + padX * 2;
  const h = 18 + padY * 2;

  // Background
  ctx.fillStyle = bgColor;
  roundRect(ctx, left, top, w, h, 4);
  ctx.fill();

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  roundRect(ctx, left, top, w, h, 4);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Text
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + padX, top + h / 2);
  ctx.textBaseline = 'alphabetic';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
