import { SplatData } from '../types';
import { OrbitCamera } from './camera';

const WGSL_SHADER = /* wgsl */`
struct Uniforms {
  view: mat4x4<f32>,
  proj: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) color: vec4<f32>,
  @location(2) size: f32,
};

struct VertexOutput {
  @builtin(position) clip_position: vec4<f32>,
  @location(0) color: vec4<f32>,
  @builtin(point_size) point_size: f32,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let view_pos = uniforms.view * vec4<f32>(in.position, 1.0);
  out.clip_position = uniforms.proj * view_pos;
  out.color = in.color;
  // Scale point size by distance (perspective)
  let dist = -view_pos.z;
  out.point_size = max(1.0, in.size * 200.0 / max(dist, 0.1));
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Premultiplied alpha output for correct blending
  return vec4<f32>(in.color.rgb * in.color.a, in.color.a);
}
`;

// Vertex layout: position(xyz) + color(rgba) + size(f32) = 8 * 4 = 32 bytes
const VERTEX_STRIDE = 32;

export class SplatRenderer {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private vertexCount = 0;
  // CPU-side copies for per-frame depth sorting
  private splatPositions: Float32Array | null = null;
  private sortedIndices: Uint32Array | null = null;
  private depthBuffer: Float32Array | null = null;

  constructor(private canvas: HTMLCanvasElement, private camera: OrbitCamera) {}

  async init(): Promise<boolean> {
    if (!navigator.gpu) {
      console.warn('WebGPU not supported');
      return false;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      console.warn('No WebGPU adapter found');
      return false;
    }

    this.device = await adapter.requestDevice();

    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
    if (!this.context) {
      console.warn('Could not get WebGPU canvas context');
      return false;
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format,
      alphaMode: 'premultiplied',
    });

    // Uniform buffer: 2x mat4x4 = 128 bytes
    this.uniformBuffer = this.device.createBuffer({
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const shaderModule = this.device.createShaderModule({ code: WGSL_SHADER });

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      }],
    });

    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{
        binding: 0,
        resource: { buffer: this.uniformBuffer },
      }],
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: VERTEX_STRIDE,
          attributes: [
            { shaderLocation: 0, offset: 0,  format: 'float32x3' }, // position
            { shaderLocation: 1, offset: 12, format: 'float32x4' }, // color
            { shaderLocation: 2, offset: 28, format: 'float32'   }, // size
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format,
          blend: {
            color: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
          writeMask: GPUColorWrite.ALL,
        }],
      },
      primitive: {
        topology: 'point-list',
      },
    });

    return true;
  }

  loadSplats(data: SplatData) {
    if (!this.device) return;

    const count = data.count;
    const buf = new Float32Array(count * 8); // 8 floats per vertex = 32 bytes
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const base = i * 8;
      // position
      const px = data.positions[i * 3 + 0];
      const py = data.positions[i * 3 + 1];
      const pz = data.positions[i * 3 + 2];
      buf[base + 0] = px;
      buf[base + 1] = py;
      buf[base + 2] = pz;
      positions[i * 3 + 0] = px;
      positions[i * 3 + 1] = py;
      positions[i * 3 + 2] = pz;
      // color
      buf[base + 3] = data.colors[i * 4 + 0];
      buf[base + 4] = data.colors[i * 4 + 1];
      buf[base + 5] = data.colors[i * 4 + 2];
      buf[base + 6] = data.colors[i * 4 + 3];
      // size (derive from covariance scale, or default 0.05)
      const cx = data.covariances[i * 6 + 0];
      const cy = data.covariances[i * 6 + 3];
      const cz = data.covariances[i * 6 + 5];
      buf[base + 7] = Math.sqrt((cx + cy + cz) / 3) || 0.05;
    }

    if (this.vertexBuffer) this.vertexBuffer.destroy();
    if (this.indexBuffer) this.indexBuffer.destroy();

    this.vertexBuffer = this.device.createBuffer({
      size: buf.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, buf);

    // Index buffer for depth-sorted draw order
    const indices = new Uint32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
    this.indexBuffer = this.device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.indexBuffer, 0, indices);

    this.splatPositions = positions;
    this.sortedIndices = indices;
    this.depthBuffer = new Float32Array(count);
    this.vertexCount = count;
  }

  /** Sort splat indices back-to-front by view-space depth */
  private sortByDepth(viewMatrix: Float32Array) {
    if (!this.splatPositions || !this.sortedIndices || !this.depthBuffer) return;

    const positions = this.splatPositions;
    const indices = this.sortedIndices;
    const depths = this.depthBuffer;
    const count = this.vertexCount;

    // Extract view-space Z row from view matrix (row 2 in column-major)
    const m2  = viewMatrix[2];
    const m6  = viewMatrix[6];
    const m10 = viewMatrix[10];
    const m14 = viewMatrix[14];

    // Compute view-space depth for each splat
    for (let i = 0; i < count; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];
      depths[i] = m2 * px + m6 * py + m10 * pz + m14;
    }

    // Sort indices back-to-front (most negative depth = farthest)
    indices.sort((a: number, b: number) => depths[a] - depths[b]);
  }

  render() {
    if (!this.device || !this.context || !this.pipeline || !this.uniformBuffer || !this.bindGroup) return;
    if (!this.vertexBuffer || !this.indexBuffer || this.vertexCount === 0) return;

    const aspect = this.canvas.width / this.canvas.height;
    const view = this.camera.getViewMatrix();
    const proj = this.camera.getProjectionMatrix(aspect);

    // Sort splats back-to-front for correct alpha blending
    this.sortByDepth(view);
    if (this.sortedIndices) {
      this.device.queue.writeBuffer(this.indexBuffer, 0, this.sortedIndices);
    }

    // Upload uniforms: view (64 bytes) then proj (64 bytes)
    this.device.queue.writeBuffer(this.uniformBuffer, 0, view);
    this.device.queue.writeBuffer(this.uniformBuffer, 64, proj);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint32');
    pass.drawIndexed(this.vertexCount);
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  destroy() {
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.uniformBuffer?.destroy();
    this.device?.destroy();
    this.device = null;
    this.context = null;
    this.pipeline = null;
    this.bindGroup = null;
    this.vertexBuffer = null;
    this.indexBuffer = null;
    this.splatPositions = null;
    this.sortedIndices = null;
    this.depthBuffer = null;
  }
}

/**
 * Load a .splat binary file (32 bytes per splat):
 *   position: 3x f32 (12 bytes)
 *   scale:    3x f32 (12 bytes)
 *   color:    4x u8  (4 bytes)
 *   rotation: 4x u8  (4 bytes)
 */
export async function loadSplatFile(url: string): Promise<SplatData> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch splat file: ${resp.status}`);
  const buffer = await resp.arrayBuffer();

  const BYTES_PER_SPLAT = 32;
  const count = Math.floor(buffer.byteLength / BYTES_PER_SPLAT);

  const positions   = new Float32Array(count * 3);
  const colors      = new Float32Array(count * 4);
  const covariances = new Float32Array(count * 6);

  const view = new DataView(buffer);

  for (let i = 0; i < count; i++) {
    const offset = i * BYTES_PER_SPLAT;

    // Position (3x f32)
    positions[i * 3 + 0] = view.getFloat32(offset + 0,  true);
    positions[i * 3 + 1] = view.getFloat32(offset + 4,  true);
    positions[i * 3 + 2] = view.getFloat32(offset + 8,  true);

    // Scale (3x f32) — use as diagonal covariance
    const sx = view.getFloat32(offset + 12, true);
    const sy = view.getFloat32(offset + 16, true);
    const sz = view.getFloat32(offset + 20, true);
    covariances[i * 6 + 0] = sx * sx;
    covariances[i * 6 + 3] = sy * sy;
    covariances[i * 6 + 5] = sz * sz;

    // Color (4x u8 normalized to 0-1)
    colors[i * 4 + 0] = view.getUint8(offset + 24) / 255;
    colors[i * 4 + 1] = view.getUint8(offset + 25) / 255;
    colors[i * 4 + 2] = view.getUint8(offset + 26) / 255;
    colors[i * 4 + 3] = view.getUint8(offset + 27) / 255;

    // Bytes 28-31 are quaternion rotation (ignored for now)
  }

  return { positions, colors, covariances, count };
}

interface PlyProperty {
  name: string;
  type: string;
  byteSize: number;
}

const PLY_TYPE_SIZES: Record<string, number> = {
  char: 1, uchar: 1, int8: 1, uint8: 1,
  short: 2, ushort: 2, int16: 2, uint16: 2,
  int: 4, uint: 4, int32: 4, uint32: 4,
  float: 4, float32: 4,
  double: 8, float64: 8,
};

function readPlyValue(view: DataView, offset: number, type: string): number {
  switch (type) {
    case 'char':   case 'int8':    return view.getInt8(offset);
    case 'uchar':  case 'uint8':   return view.getUint8(offset);
    case 'short':  case 'int16':   return view.getInt16(offset, true);
    case 'ushort': case 'uint16':  return view.getUint16(offset, true);
    case 'int':    case 'int32':   return view.getInt32(offset, true);
    case 'uint':   case 'uint32':  return view.getUint32(offset, true);
    case 'float':  case 'float32': return view.getFloat32(offset, true);
    case 'double': case 'float64': return view.getFloat64(offset, true);
    default: throw new Error(`Unknown PLY type: ${type}`);
  }
}

/**
 * Load a .ply binary file containing Gaussian splat data.
 * Supports binary_little_endian format with vertex properties:
 *   x, y, z          — position
 *   scale_0..2       — scale (or sx, sy, sz)
 *   f_dc_0..2        — SH DC color (or red, green, blue as uchar)
 *   opacity           — opacity (sigmoid-encoded float or uchar)
 *   rot_0..3         — rotation quaternion (ignored for now)
 */
export async function loadPlyFile(url: string): Promise<SplatData> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch PLY file: ${resp.status}`);
  const buffer = await resp.arrayBuffer();

  // Parse ASCII header
  const headerBytes = new Uint8Array(buffer);
  let headerEnd = -1;
  for (let i = 0; i < Math.min(headerBytes.length, 4096); i++) {
    if (headerBytes[i] === 0x65 && // 'e'
        headerBytes[i + 1] === 0x6e && // 'n'
        headerBytes[i + 2] === 0x64 && // 'd'
        headerBytes[i + 3] === 0x5f && // '_'
        headerBytes[i + 4] === 0x68 && // 'h'
        headerBytes[i + 5] === 0x65 && // 'e'
        headerBytes[i + 6] === 0x61 && // 'a'
        headerBytes[i + 7] === 0x64 && // 'd'
        headerBytes[i + 8] === 0x65 && // 'e'
        headerBytes[i + 9] === 0x72) { // 'r'
      // Find the newline after "end_header"
      let j = i + 10;
      while (j < headerBytes.length && headerBytes[j] !== 0x0a) j++;
      headerEnd = j + 1;
      break;
    }
  }
  if (headerEnd === -1) throw new Error('Invalid PLY file: could not find end_header');

  const headerText = new TextDecoder().decode(headerBytes.slice(0, headerEnd));
  const headerLines = headerText.split('\n').map(l => l.trim());

  if (headerLines[0] !== 'ply') throw new Error('Invalid PLY file: missing magic');

  const formatLine = headerLines.find(l => l.startsWith('format '));
  if (!formatLine || !formatLine.includes('binary_little_endian')) {
    throw new Error('Only binary_little_endian PLY format is supported');
  }

  let vertexCount = 0;
  const properties: PlyProperty[] = [];
  let inVertexElement = false;

  for (const line of headerLines) {
    if (line.startsWith('element vertex')) {
      vertexCount = parseInt(line.split(/\s+/)[2], 10);
      inVertexElement = true;
    } else if (line.startsWith('element ') && inVertexElement) {
      inVertexElement = false;
    } else if (line.startsWith('property ') && inVertexElement) {
      const parts = line.split(/\s+/);
      const type = parts[1];
      const name = parts[2];
      const byteSize = PLY_TYPE_SIZES[type];
      if (byteSize === undefined) throw new Error(`Unknown PLY property type: ${type}`);
      properties.push({ name, type, byteSize });
    }
  }

  if (vertexCount === 0) throw new Error('PLY file has no vertices');

  // Build property offset map
  const propOffset: Record<string, { offset: number; type: string }> = {};
  let stride = 0;
  for (const prop of properties) {
    propOffset[prop.name] = { offset: stride, type: prop.type };
    stride += prop.byteSize;
  }

  const getProp = (name: string): { offset: number; type: string } | undefined => propOffset[name];

  // Detect color property names
  const hasShColor = getProp('f_dc_0') !== undefined;
  const hasUcharColor = getProp('red') !== undefined;

  // Detect scale property names
  const hasScale = getProp('scale_0') !== undefined;
  const hasAltScale = getProp('sx') !== undefined;

  const positions   = new Float32Array(vertexCount * 3);
  const colors      = new Float32Array(vertexCount * 4);
  const covariances = new Float32Array(vertexCount * 6);

  const dataView = new DataView(buffer, headerEnd);

  for (let i = 0; i < vertexCount; i++) {
    const base = i * stride;

    // Position (required: x, y, z)
    const xProp = getProp('x')!;
    const yProp = getProp('y')!;
    const zProp = getProp('z')!;
    positions[i * 3 + 0] = readPlyValue(dataView, base + xProp.offset, xProp.type);
    positions[i * 3 + 1] = readPlyValue(dataView, base + yProp.offset, yProp.type);
    positions[i * 3 + 2] = readPlyValue(dataView, base + zProp.offset, zProp.type);

    // Scale → diagonal covariance
    let sx = 0.05, sy = 0.05, sz = 0.05;
    if (hasScale) {
      const s0 = getProp('scale_0')!;
      const s1 = getProp('scale_1')!;
      const s2 = getProp('scale_2')!;
      // Gaussian splatting PLY files store log(scale)
      sx = Math.exp(readPlyValue(dataView, base + s0.offset, s0.type));
      sy = Math.exp(readPlyValue(dataView, base + s1.offset, s1.type));
      sz = Math.exp(readPlyValue(dataView, base + s2.offset, s2.type));
    } else if (hasAltScale) {
      const sxP = getProp('sx')!;
      const syP = getProp('sy')!;
      const szP = getProp('sz')!;
      sx = readPlyValue(dataView, base + sxP.offset, sxP.type);
      sy = readPlyValue(dataView, base + syP.offset, syP.type);
      sz = readPlyValue(dataView, base + szP.offset, szP.type);
    }
    covariances[i * 6 + 0] = sx * sx;
    covariances[i * 6 + 3] = sy * sy;
    covariances[i * 6 + 5] = sz * sz;

    // Color
    if (hasShColor) {
      // SH DC coefficients → linear RGB (SH0 = C * 0.28209479...)
      const SH_C0 = 0.28209479177387814;
      const dc0 = getProp('f_dc_0')!;
      const dc1 = getProp('f_dc_1')!;
      const dc2 = getProp('f_dc_2')!;
      colors[i * 4 + 0] = Math.max(0, Math.min(1, readPlyValue(dataView, base + dc0.offset, dc0.type) * SH_C0 + 0.5));
      colors[i * 4 + 1] = Math.max(0, Math.min(1, readPlyValue(dataView, base + dc1.offset, dc1.type) * SH_C0 + 0.5));
      colors[i * 4 + 2] = Math.max(0, Math.min(1, readPlyValue(dataView, base + dc2.offset, dc2.type) * SH_C0 + 0.5));
    } else if (hasUcharColor) {
      const rP = getProp('red')!;
      const gP = getProp('green')!;
      const bP = getProp('blue')!;
      colors[i * 4 + 0] = readPlyValue(dataView, base + rP.offset, rP.type) / 255;
      colors[i * 4 + 1] = readPlyValue(dataView, base + gP.offset, gP.type) / 255;
      colors[i * 4 + 2] = readPlyValue(dataView, base + bP.offset, bP.type) / 255;
    } else {
      colors[i * 4 + 0] = 0.8;
      colors[i * 4 + 1] = 0.8;
      colors[i * 4 + 2] = 0.8;
    }

    // Opacity
    const opacityProp = getProp('opacity');
    if (opacityProp) {
      const raw = readPlyValue(dataView, base + opacityProp.offset, opacityProp.type);
      // Gaussian splatting stores opacity as logit (sigmoid-encoded)
      if (opacityProp.type === 'float' || opacityProp.type === 'float32' || opacityProp.type === 'double' || opacityProp.type === 'float64') {
        colors[i * 4 + 3] = 1.0 / (1.0 + Math.exp(-raw)); // sigmoid
      } else {
        colors[i * 4 + 3] = raw / 255;
      }
    } else {
      const alphaProp = getProp('alpha');
      if (alphaProp) {
        colors[i * 4 + 3] = readPlyValue(dataView, base + alphaProp.offset, alphaProp.type) / 255;
      } else {
        colors[i * 4 + 3] = 1.0;
      }
    }
  }

  return { positions, colors, covariances, count: vertexCount };
}

/** Load a splat scene file, auto-detecting format from URL extension */
export async function loadSplatScene(url: string): Promise<SplatData> {
  const pathname = new URL(url, 'file://').pathname.toLowerCase();
  if (pathname.endsWith('.ply')) {
    return loadPlyFile(url);
  }
  return loadSplatFile(url);
}
