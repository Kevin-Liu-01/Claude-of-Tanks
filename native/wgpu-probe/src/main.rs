//! The renderer probe on native Metal: the web probe's scene (wasm/wgpu-probe — one terrain mesh, N tank meshes, a
//! 2048² depth shadow pass then a lit pass sampling it, one draw per object at a dynamic uniform offset), drawn by wgpu
//! into an offscreen 1280 × 720 target (the web probe's canvas) and timed as the web probe times it: 30 warm frames,
//! then `rounds` blocks of `frames` frames back to back, the encode and submit (the draw calls) on the wall clock and on
//! the thread's own CPU clock, and the time until the GPU has finished the block. Prints one JSON line.
//!
//!   cot-wgpu-probe-native <scene.bin> <frames> <rounds>

use std::future::Future;
use std::sync::Arc;
use std::task::{Context, Poll, Wake};
use std::time::Instant;

use bytemuck::{Pod, Zeroable};

const SHADOW_SIZE: u32 = 2048;
const OBJECT_STRIDE: u64 = 256;
const WIDTH: u32 = 1280;
const HEIGHT: u32 = 720;
const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Bgra8Unorm;

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

fn look_at(eye: [f32; 3], target: [f32; 3], up: [f32; 3]) -> Mat4 {
    let f = normalize(sub(target, eye));
    let s = normalize(cross(f, up));
    let u = cross(s, f);
    [s[0], u[0], -f[0], 0.0, s[1], u[1], -f[1], 0.0, s[2], u[2], -f[2], 0.0, -dot(s, eye), -dot(u, eye), dot(f, eye), 1.0]
}

fn perspective(fov_y: f32, aspect: f32, near: f32, far: f32) -> Mat4 {
    let f = 1.0 / (fov_y * 0.5).tan();
    let nf = 1.0 / (near - far);
    [f / aspect, 0.0, 0.0, 0.0, 0.0, f, 0.0, 0.0, 0.0, 0.0, far * nf, -1.0, 0.0, 0.0, near * far * nf, 0.0]
}

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

/// The scene file (tools/wgpu-probe-scenes.mjs): eight u32 lengths, then the arrays.
struct Scene {
    terrain: (Vec<f32>, Vec<f32>, Vec<u32>),
    tank: (Vec<f32>, Vec<f32>, Vec<u32>),
    poses: Vec<f32>,
    colors: Vec<f32>,
}

fn read_scene(path: &str) -> Scene {
    let bytes = std::fs::read(path).expect("the scene file");
    let u32_at = |i: usize| u32::from_le_bytes(bytes[i * 4..i * 4 + 4].try_into().unwrap());
    let lengths: Vec<usize> = (0..8).map(|i| u32_at(i) as usize).collect();
    let mut at = 32;
    let mut f32s = |n: usize| {
        let v = (0..n).map(|k| f32::from_le_bytes(bytes[at + k * 4..at + k * 4 + 4].try_into().unwrap())).collect::<Vec<_>>();
        at += n * 4;
        v
    };
    let tp = f32s(lengths[0]);
    let tn = f32s(lengths[1]);
    let ti: Vec<u32> = f32s(lengths[2]).into_iter().map(f32::to_bits).collect();
    let kp = f32s(lengths[3]);
    let kn = f32s(lengths[4]);
    let ki: Vec<u32> = f32s(lengths[5]).into_iter().map(f32::to_bits).collect();
    let poses = f32s(lengths[6]);
    let colors = f32s(lengths[7]);
    Scene { terrain: (tp, tn, ti), tank: (kp, kn, ki), poses, colors }
}

struct ThreadWaker(std::thread::Thread);
impl Wake for ThreadWaker {
    fn wake(self: Arc<Self>) {
        self.0.unpark();
    }
}

/// Run a future to completion on this thread (wgpu's native requests resolve at once).
fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = std::pin::pin!(future);
    let waker = Arc::new(ThreadWaker(std::thread::current())).into();
    let mut cx = Context::from_waker(&waker);
    loop {
        if let Poll::Ready(value) = future.as_mut().poll(&mut cx) {
            return value;
        }
        std::thread::park();
    }
}

struct Probe {
    device: wgpu::Device,
    queue: wgpu::Queue,
    color: wgpu::TextureView,
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
    poses: Vec<[f32; 4]>,
    colors: Vec<[f32; 4]>,
    staging: Vec<u8>,
}

impl Probe {
    fn new(scene: &Scene) -> (Probe, String) {
        let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
        descriptor.backends = wgpu::Backends::METAL;
        let instance = wgpu::Instance::new(descriptor);
        let adapter = block_on(instance.request_adapter(&wgpu::RequestAdapterOptions { power_preference: wgpu::PowerPreference::HighPerformance, ..Default::default() }))
            .expect("a Metal adapter");
        let info = adapter.get_info();
        let (device, queue) = block_on(adapter.request_device(&wgpu::DeviceDescriptor::default())).expect("a device");
        let texture = |label, format, usage, size: u32, height: u32| {
            device.create_texture(&wgpu::TextureDescriptor {
                label: Some(label),
                size: wgpu::Extent3d { width: size, height, depth_or_array_layers: 1 },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format,
                usage,
                view_formats: &[],
            })
        };
        let color = texture("color", FORMAT, wgpu::TextureUsages::RENDER_ATTACHMENT, WIDTH, HEIGHT).create_view(&Default::default());
        let depth = texture("depth", wgpu::TextureFormat::Depth32Float, wgpu::TextureUsages::RENDER_ATTACHMENT, WIDTH, HEIGHT).create_view(&Default::default());
        let shadow = texture("shadow", wgpu::TextureFormat::Depth32Float, wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING, SHADOW_SIZE, SHADOW_SIZE);
        let shadow_view = shadow.create_view(&Default::default());
        let shadow_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            compare: Some(wgpu::CompareFunction::LessEqual),
            ..Default::default()
        });
        let aspect = WIDTH as f32 / HEIGHT as f32;
        let view_proj = mul(&perspective(50f32.to_radians(), aspect, 1.0, 2000.0), &look_at([0.0, 60.0, 140.0], [0.0, 0.0, 0.0], [0.0, 1.0, 0.0]));
        let light_dir = normalize([-0.4, -1.0, -0.3]);
        let light_eye = [-light_dir[0] * 200.0, -light_dir[1] * 200.0, -light_dir[2] * 200.0];
        let light_view_proj = mul(&ortho(-80.0, 80.0, -80.0, 80.0, 1.0, 400.0), &look_at(light_eye, [0.0, 0.0, 0.0], [0.0, 1.0, 0.0]));
        let globals = Globals { view_proj, light_view_proj, light_dir: [light_dir[0], light_dir[1], light_dir[2], 0.0] };
        use wgpu::util::DeviceExt;
        let globals_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("globals"), contents: bytemuck::bytes_of(&globals), usage: wgpu::BufferUsages::UNIFORM });
        let tanks = scene.poses.len() / 4;
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
                wgpu::BindGroupLayoutEntry { binding: 2, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Comparison), count: None },
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
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("probe"),
            source: wgpu::ShaderSource::Wgsl(include_str!("../../../wasm/wgpu-probe/src/probe.wgsl").into()),
        });
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
                targets: &[Some(wgpu::ColorTargetState { format: FORMAT, blend: None, write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState { cull_mode: Some(wgpu::Face::Back), ..Default::default() },
            depth_stencil: Some(depth_state(Default::default())),
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });
        let probe = Probe {
            terrain: mesh(&device, &scene.terrain.0, &scene.terrain.1, &scene.terrain.2),
            tank: mesh(&device, &scene.tank.0, &scene.tank.1, &scene.tank.2),
            device,
            queue,
            color,
            depth,
            shadow_view,
            shadow_pipeline,
            main_pipeline,
            shadow_globals,
            main_globals,
            objects,
            object_buffer,
            poses: scene.poses.chunks_exact(4).map(|p| [p[0], p[1], p[2], p[3]]).collect(),
            colors: scene.colors.chunks_exact(3).map(|c| [c[0], c[1], c[2], 1.0]).collect(),
            staging: vec![0; (OBJECT_STRIDE * (tanks as u64 + 1)) as usize],
        };
        (probe, format!("{} ({:?}, {:?})", info.name, info.backend, info.device_type))
    }

    /// One frame at time `t`: the web probe's frame, into the offscreen target.
    fn frame(&mut self, t: f32) {
        let mut write = |slot: usize, model: Mat4, color: [f32; 4]| {
            let at = slot * OBJECT_STRIDE as usize;
            self.staging[at..at + std::mem::size_of::<Object>()].copy_from_slice(bytemuck::bytes_of(&Object { model, color }));
        };
        let identity = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0];
        write(0, identity, [0.42, 0.5, 0.32, 1.0]);
        for (i, (p, c)) in self.poses.iter().zip(&self.colors).enumerate() {
            let yaw = p[3] + t * 0.4;
            let (s, co) = yaw.sin_cos();
            write(i + 1, [co, 0.0, -s, 0.0, 0.0, 1.0, 0.0, 0.0, s, 0.0, co, 0.0, p[0], p[1], p[2], 1.0], *c);
        }
        self.queue.write_buffer(&self.object_buffer, 0, &self.staging);
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
                    view: &self.color,
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
    }

    fn settle(&self) {
        self.device.poll(wgpu::PollType::wait_indefinitely()).expect("the GPU finishes");
    }
}

/// This thread's CPU time in ms: the encoding's own cost, which a loaded machine's waits do not inflate.
fn thread_cpu_ms() -> f64 {
    let mut ts = libc::timespec { tv_sec: 0, tv_nsec: 0 };
    // SAFETY: `ts` is a valid out pointer, and macOS has had the thread CPU clock since 10.12.
    unsafe { libc::clock_gettime(libc::CLOCK_THREAD_CPUTIME_ID, &mut ts) };
    ts.tv_sec as f64 * 1000.0 + ts.tv_nsec as f64 / 1e6
}

fn median(mut values: Vec<f64>) -> f64 {
    values.sort_by(|a, b| a.partial_cmp(b).unwrap());
    values[values.len() / 2]
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let scene = read_scene(&args[1]);
    let frames: usize = args.get(2).map_or(30, |a| a.parse().unwrap());
    let rounds: usize = args.get(3).map_or(3, |a| a.parse().unwrap());
    let (mut probe, adapter) = Probe::new(&scene);
    let tanks = probe.poses.len();
    let mut t = 0.0f32;
    for _ in 0..30 {
        t += 1.0 / 60.0;
        probe.frame(t);
    }
    probe.settle();
    let (mut cpu, mut thread, mut total) = (Vec::new(), Vec::new(), Vec::new());
    for _ in 0..rounds {
        let (t0, c0) = (Instant::now(), thread_cpu_ms());
        for _ in 0..frames {
            t += 1.0 / 60.0;
            probe.frame(t);
        }
        let (t1, c1) = (Instant::now(), thread_cpu_ms());
        probe.settle();
        let t2 = Instant::now();
        cpu.push((t1 - t0).as_secs_f64() * 1000.0 / frames as f64);
        thread.push((c1 - c0) / frames as f64);
        total.push((t2 - t0).as_secs_f64() * 1000.0 / frames as f64);
    }
    let (cpu_ms, thread_ms, frame_ms) = (median(cpu), median(thread), median(total));
    let draws = 2 * (tanks + 1);
    println!(
        "{{\"adapter\":\"{adapter}\",\"tanks\":{tanks},\"draws\":{draws},\"frames\":{frames},\"rounds\":{rounds},\"cpuMs\":{cpu_ms:.3},\"threadCpuMs\":{thread_ms:.3},\"frameMs\":{frame_ms:.3},\"cpuUsPerDraw\":{:.3},\"threadUsPerDraw\":{:.3}}}",
        cpu_ms * 1000.0 / draws as f64,
        thread_ms * 1000.0 / draws as f64
    );
}
