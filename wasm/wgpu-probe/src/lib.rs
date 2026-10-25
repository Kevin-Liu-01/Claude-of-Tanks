//! The wgpu renderer probe: one terrain mesh and N tank meshes (the geometry
//! web/scene.mjs builds and hands to both this probe and the three.js one),
//! a directional light with a 2048² depth shadow map (a depth-only pass from
//! the light, then a lit pass sampling it with a 3 × 3 comparison PCF), one
//! draw per object with its matrices at a dynamic uniform offset — the work
//! three.js's WebGLRenderer does for the same scene, so frame times compare.

use bytemuck::{Pod, Zeroable};
use wasm_bindgen::prelude::*;
use web_sys::HtmlCanvasElement;

const SHADOW_SIZE: u32 = 2048;
const OBJECT_STRIDE: u64 = 256;

type Mat4 = [f32; 16];

fn mul(a: &Mat4, b: &Mat4) -> Mat4 {
    let mut out = [0.0; 16];
    for c in 0..4 {
        for r in 0..4 {
            out[c * 4 + r] = (0..4).map(|k| a[k * 4 + r] * b[c * 4 + k]).sum();
        }
    }
    out
}

fn sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

fn normalize(a: [f32; 3]) -> [f32; 3] {
    let l = (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).sqrt();
    [a[0] / l, a[1] / l, a[2] / l]
}

fn dot(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// A right-handed view matrix (camera looks down −Z).
fn look_at(eye: [f32; 3], target: [f32; 3], up: [f32; 3]) -> Mat4 {
    let f = normalize(sub(target, eye));
    let s = normalize(cross(f, up));
    let u = cross(s, f);
    [s[0], u[0], -f[0], 0.0, s[1], u[1], -f[1], 0.0, s[2], u[2], -f[2], 0.0, -dot(s, eye), -dot(u, eye), dot(f, eye), 1.0]
}

/// Perspective projection to WebGPU's 0..1 depth.
fn perspective(fov_y: f32, aspect: f32, near: f32, far: f32) -> Mat4 {
    let f = 1.0 / (fov_y * 0.5).tan();
    let nf = 1.0 / (near - far);
    [f / aspect, 0.0, 0.0, 0.0, 0.0, f, 0.0, 0.0, 0.0, 0.0, far * nf, -1.0, 0.0, 0.0, near * far * nf, 0.0]
}

/// Orthographic projection to WebGPU's 0..1 depth.
fn ortho(l: f32, r: f32, b: f32, t: f32, n: f32, f: f32) -> Mat4 {
    [2.0 / (r - l), 0.0, 0.0, 0.0, 0.0, 2.0 / (t - b), 0.0, 0.0, 0.0, 0.0, 1.0 / (n - f), 0.0, -(r + l) / (r - l), -(t + b) / (t - b), n / (n - f), 1.0]
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Globals {
    view_proj: Mat4,
    light_view_proj: Mat4,
    light_dir: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Object {
    model: Mat4,
    color: [f32; 4],
}

struct Mesh {
    positions: wgpu::Buffer,
    normals: wgpu::Buffer,
    indices: wgpu::Buffer,
    count: u32,
}

#[wasm_bindgen]
pub struct Probe {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    depth: wgpu::TextureView,
    shadow_view: wgpu::TextureView,
    shadow_pipeline: wgpu::RenderPipeline,
    main_pipeline: wgpu::RenderPipeline,
    shadow_globals: wgpu::BindGroup,
    main_globals: wgpu::BindGroup,
    objects: wgpu::BindGroup,
    object_buffer: wgpu::Buffer,
    terrain: Mesh,
    tank: Mesh,
    /// Per tank: x, y, z, the yaw at t = 0.
    poses: Vec<[f32; 4]>,
    colors: Vec<[f32; 4]>,
    staging: Vec<u8>,
    terrain_color: [f32; 4],
}

fn mesh(device: &wgpu::Device, positions: &[f32], normals: &[f32], indices: &[u32]) -> Mesh {
    use wgpu::util::DeviceExt;
    let buffer = |label, contents: &[u8], usage| device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some(label), contents, usage });
    Mesh {
        positions: buffer("positions", bytemuck::cast_slice(positions), wgpu::BufferUsages::VERTEX),
        normals: buffer("normals", bytemuck::cast_slice(normals), wgpu::BufferUsages::VERTEX),
        indices: buffer("indices", bytemuck::cast_slice(indices), wgpu::BufferUsages::INDEX),
        count: indices.len() as u32,
    }
}

/// Build the probe on `canvas`: the meshes, the tank poses (x, y, z, yaw per tank) and colours (r, g, b per tank).
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub async fn create_probe(
    canvas: HtmlCanvasElement,
    terrain_positions: Vec<f32>,
    terrain_normals: Vec<f32>,
    terrain_indices: Vec<u32>,
    tank_positions: Vec<f32>,
    tank_normals: Vec<f32>,
    tank_indices: Vec<u32>,
    poses: Vec<f32>,
    colors: Vec<f32>,
) -> Result<Probe, JsValue> {
    let (width, height) = (canvas.width(), canvas.height());
    let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
    descriptor.backends = wgpu::Backends::BROWSER_WEBGPU;
    let instance = wgpu::Instance::new(descriptor);
    let surface = instance.create_surface(wgpu::SurfaceTarget::Canvas(canvas)).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions { power_preference: wgpu::PowerPreference::HighPerformance, compatible_surface: Some(&surface), ..Default::default() })
        .await
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let (device, queue) = adapter.request_device(&wgpu::DeviceDescriptor::default()).await.map_err(|e| JsValue::from_str(&e.to_string()))?;
    let caps = surface.get_capabilities(&adapter);
    let format = caps.formats.iter().copied().find(|f| !f.is_srgb()).unwrap_or(caps.formats[0]);
    surface.configure(
        &device,
        &wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width,
            height,
            present_mode: wgpu::PresentMode::Fifo,
            desired_maximum_frame_latency: 2,
            alpha_mode: caps.alpha_modes[0],
            view_formats: vec![],
            color_space: Default::default(),
        },
    );
    let depth = device
        .create_texture(&wgpu::TextureDescriptor {
            label: Some("depth"),
            size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        })
        .create_view(&Default::default());
    let shadow = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("shadow"),
        size: wgpu::Extent3d { width: SHADOW_SIZE, height: SHADOW_SIZE, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Depth32Float,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    let shadow_view = shadow.create_view(&Default::default());
    let shadow_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        compare: Some(wgpu::CompareFunction::LessEqual),
        ..Default::default()
    });

    // the camera and the light are fixed (the three.js probe places its camera and light the same way)
    let aspect = width as f32 / height as f32;
    let view_proj = mul(&perspective(50f32.to_radians(), aspect, 1.0, 2000.0), &look_at([0.0, 60.0, 140.0], [0.0, 0.0, 0.0], [0.0, 1.0, 0.0]));
    let light_dir = normalize([-0.4, -1.0, -0.3]);
    let light_eye = [-light_dir[0] * 200.0, -light_dir[1] * 200.0, -light_dir[2] * 200.0];
    let light_view_proj = mul(&ortho(-80.0, 80.0, -80.0, 80.0, 1.0, 400.0), &look_at(light_eye, [0.0, 0.0, 0.0], [0.0, 1.0, 0.0]));
    let globals = Globals { view_proj, light_view_proj, light_dir: [light_dir[0], light_dir[1], light_dir[2], 0.0] };
    use wgpu::util::DeviceExt;
    let globals_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("globals"),
        contents: bytemuck::bytes_of(&globals),
        usage: wgpu::BufferUsages::UNIFORM,
    });
    let tanks = poses.len() / 4;
    let object_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("objects"),
        size: OBJECT_STRIDE * (tanks as u64 + 1),
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let uniform_entry = |binding, dynamic| wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: dynamic, min_binding_size: None },
        count: None,
    };
    let shadow_globals_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: None, entries: &[uniform_entry(0, false)] });
    let main_globals_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: None,
        entries: &[
            uniform_entry(0, false),
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Depth, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 2,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Comparison),
                count: None,
            },
        ],
    });
    let object_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: None, entries: &[uniform_entry(0, true)] });
    let shadow_globals = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &shadow_globals_layout,
        entries: &[wgpu::BindGroupEntry { binding: 0, resource: globals_buffer.as_entire_binding() }],
    });
    let main_globals = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &main_globals_layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: globals_buffer.as_entire_binding() },
            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&shadow_view) },
            wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Sampler(&shadow_sampler) },
        ],
    });
    let objects = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &object_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding { buffer: &object_buffer, offset: 0, size: wgpu::BufferSize::new(std::mem::size_of::<Object>() as u64) }),
        }],
    });

    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("probe"), source: wgpu::ShaderSource::Wgsl(include_str!("probe.wgsl").into()) });
    let vertex_buffers = [
        Some(wgpu::VertexBufferLayout { array_stride: 12, step_mode: wgpu::VertexStepMode::Vertex, attributes: &wgpu::vertex_attr_array![0 => Float32x3] }),
        Some(wgpu::VertexBufferLayout { array_stride: 12, step_mode: wgpu::VertexStepMode::Vertex, attributes: &wgpu::vertex_attr_array![1 => Float32x3] }),
    ];
    let depth_state = |bias| wgpu::DepthStencilState {
        format: wgpu::TextureFormat::Depth32Float,
        depth_write_enabled: Some(true),
        depth_compare: Some(wgpu::CompareFunction::Less),
        stencil: Default::default(),
        bias,
    };
    let shadow_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: None, bind_group_layouts: &[Some(&shadow_globals_layout), Some(&object_layout)], immediate_size: 0 });
    let shadow_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("shadow"),
        layout: Some(&shadow_layout),
        vertex: wgpu::VertexState { module: &shader, entry_point: Some("vs_shadow"), buffers: &vertex_buffers[..1], compilation_options: Default::default() },
        fragment: None,
        primitive: wgpu::PrimitiveState { cull_mode: Some(wgpu::Face::Back), ..Default::default() },
        depth_stencil: Some(depth_state(wgpu::DepthBiasState { constant: 2, slope_scale: 2.0, clamp: 0.0 })),
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });
    let main_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: None, bind_group_layouts: &[Some(&main_globals_layout), Some(&object_layout)], immediate_size: 0 });
    let main_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("main"),
        layout: Some(&main_layout),
        vertex: wgpu::VertexState { module: &shader, entry_point: Some("vs_main"), buffers: &vertex_buffers, compilation_options: Default::default() },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            targets: &[Some(wgpu::ColorTargetState { format, blend: None, write_mask: wgpu::ColorWrites::ALL })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState { cull_mode: Some(wgpu::Face::Back), ..Default::default() },
        depth_stencil: Some(depth_state(Default::default())),
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });

    Ok(Probe {
        terrain: mesh(&device, &terrain_positions, &terrain_normals, &terrain_indices),
        tank: mesh(&device, &tank_positions, &tank_normals, &tank_indices),
        device,
        queue,
        surface,
        depth,
        shadow_view,
        shadow_pipeline,
        main_pipeline,
        shadow_globals,
        main_globals,
        objects,
        object_buffer,
        poses: poses.chunks_exact(4).map(|p| [p[0], p[1], p[2], p[3]]).collect(),
        colors: colors.chunks_exact(3).map(|c| [c[0], c[1], c[2], 1.0]).collect(),
        staging: vec![0; (OBJECT_STRIDE * (tanks as u64 + 1)) as usize],
        terrain_color: [0.42, 0.5, 0.32, 1.0],
    })
}

/// A shareable handle to a JavaScript resolve function (one thread on the web; the callback runs on it).
struct SendFn(js_sys::Function);
// SAFETY: wasm32-unknown-unknown without atomics has one thread; the callback is invoked on it.
unsafe impl Send for SendFn {}

#[wasm_bindgen]
impl Probe {
    /// Draw one frame at time `t` (seconds): the tanks turn on their spots, as the three.js probe's do.
    pub fn frame(&mut self, t: f32) {
        // per-object uniforms: the terrain at slot 0, the tanks after it
        let mut write = |slot: usize, model: Mat4, color: [f32; 4]| {
            let at = slot * OBJECT_STRIDE as usize;
            self.staging[at..at + std::mem::size_of::<Object>()].copy_from_slice(bytemuck::bytes_of(&Object { model, color }));
        };
        let identity = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0];
        write(0, identity, self.terrain_color);
        for (i, (p, c)) in self.poses.iter().zip(&self.colors).enumerate() {
            let yaw = p[3] + t * 0.4;
            let (s, co) = yaw.sin_cos();
            let model = [co, 0.0, -s, 0.0, 0.0, 1.0, 0.0, 0.0, s, 0.0, co, 0.0, p[0], p[1], p[2], 1.0];
            write(i + 1, model, *c);
        }
        self.queue.write_buffer(&self.object_buffer, 0, &self.staging);

        let frame = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(frame) | wgpu::CurrentSurfaceTexture::Suboptimal(frame) => frame,
            _ => return,
        };
        let view = frame.texture.create_view(&Default::default());
        let mut encoder = self.device.create_command_encoder(&Default::default());
        let draw = |pass: &mut wgpu::RenderPass, mesh: &Mesh, slot: u32, normals: bool| {
            pass.set_bind_group(1, &self.objects, &[slot * OBJECT_STRIDE as u32]);
            pass.set_vertex_buffer(0, mesh.positions.slice(..));
            if normals {
                pass.set_vertex_buffer(1, mesh.normals.slice(..));
            }
            pass.set_index_buffer(mesh.indices.slice(..), wgpu::IndexFormat::Uint32);
            pass.draw_indexed(0..mesh.count, 0, 0..1);
        };
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("shadow"),
                color_attachments: &[],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.shadow_view,
                    depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Store }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.shadow_pipeline);
            pass.set_bind_group(0, &self.shadow_globals, &[]);
            draw(&mut pass, &self.terrain, 0, false);
            for i in 0..self.poses.len() as u32 {
                draw(&mut pass, &self.tank, i + 1, false);
            }
        }
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("main"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color { r: 0.62, g: 0.72, b: 0.82, a: 1.0 }), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.depth,
                    depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Discard }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.main_pipeline);
            pass.set_bind_group(0, &self.main_globals, &[]);
            draw(&mut pass, &self.terrain, 0, true);
            for i in 0..self.poses.len() as u32 {
                draw(&mut pass, &self.tank, i + 1, true);
            }
        }
        self.queue.submit([encoder.finish()]);
        self.queue.present(frame);
    }

    /// A promise that resolves once the GPU has finished every frame submitted so far.
    pub fn settle(&self) -> js_sys::Promise {
        let queue = self.queue.clone();
        js_sys::Promise::new(&mut |resolve, _reject| {
            let resolve = SendFn(resolve);
            queue.on_submitted_work_done(move || {
                let _ = resolve.0.call0(&JsValue::NULL);
            });
        })
    }
}
