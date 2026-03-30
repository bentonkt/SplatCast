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
  private splatVertexData: Float32Array | null = null;
  private sortedIndices: Uint32Array | null = null;

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
    this.splatVertexData = buf;
    this.sortedIndices = indices;
    this.vertexCount = count;
  }

  /** Sort splat indices back-to-front by view-space depth */
  private sortByDepth(viewMatrix: Float32Array) {
    if (!this.splatPositions || !this.sortedIndices) return;

    const positions = this.splatPositions;
    const indices = this.sortedIndices;
    const count = this.vertexCount;

    // Extract view-space Z row from view matrix (row 2 in column-major)
    const m2  = viewMatrix[2];
    const m6  = viewMatrix[6];
    const m10 = viewMatrix[10];
    const m14 = viewMatrix[14];

    // Compute view-space depth for each splat
    const depths = new Float32Array(count);
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
    this.splatVertexData = null;
    this.sortedIndices = null;
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
