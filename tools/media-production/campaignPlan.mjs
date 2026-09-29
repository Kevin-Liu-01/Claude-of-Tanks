import { createHash } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const footageNotice = 'In-engine staged scenes · Original game models and effects';
export function rate(value) {
  const [n, d = 1] = String(value).split('/').map(Number);
  return n / d;
}
export function validateCapture(receipt, video, probe) {
  if (!receipt.finished || !Array.isArray(receipt.errors) || receipt.errors.length || !Array.isArray(receipt.maps)
      || !receipt.maps.length || receipt.maps.some(row => !row.complete)) throw Error('Incomplete capture receipt');
  if (!/^[a-f0-9]{64}$/.test(receipt.sourceDigest) || !receipt.revision) throw Error('Missing capture provenance');
  const stream = probe.streams?.find(row => row.codec_type === 'video');
  if (!stream || stream.width < 1920 || stream.height < 1080 || stream.width / stream.height !== 16 / 9) throw Error('Require native landscape HD or 4K input');
  if (![24, 30, 60].includes(video.fps) || rate(stream.r_frame_rate) !== video.fps) throw Error('Frame rate mismatch');
  if (!Number.isInteger(video.frames) || Number(stream.nb_frames) !== video.frames) throw Error('Frame count mismatch');
  if (Math.abs(Number(probe.format?.duration) - video.frames / video.fps) > 1 / video.fps + .005) throw Error('Duration mismatch');
  if (video.format !== 'landscape') throw Error('Require landscape film');
  return { width: stream.width, height: stream.height, fps: video.fps, duration: video.frames / video.fps };
}
function scenePlan(scene, input, index, offset) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(scene.id ?? '') || !scene.title?.trim() || !scene.description?.trim()) throw Error('Each scene needs a safe id, title and description');
  const start = scene.inSeconds ?? 0, duration = scene.durationSeconds ?? input.duration;
  if (![start, duration].every(Number.isFinite) || start < 0 || duration < 2 || start + duration > input.duration + .0001) throw Error('Trim exceeds captured footage');
  if (![start, duration].every(value => Math.abs(value * input.fps - Math.round(value * input.fps)) < .0001)) throw Error('Trims must land on captured frame boundaries');
  return { id: scene.id, title: scene.title.trim(), description: scene.description.trim(), index, start, duration, offset, fps: input.fps };
}
export function campaignPlan(job, inputs) {
  if (!job.title?.trim() || !Array.isArray(job.scenes) || job.scenes.length !== inputs.length || job.scenes.length < 2 || job.scenes.length > 6) throw Error('Campaign needs a title and two to six scenes');
  let offset = 0;
  const scenes = job.scenes.map((scene, index) => {
    const row = scenePlan(scene, inputs[index], index, offset); offset += row.duration; return row;
  });
  if (new Set(scenes.map(row => row.id)).size !== scenes.length) throw Error('Duplicate scene id');
  if (new Set(inputs.map(row => `${row.width}:${row.height}:${row.fps}`)).size !== 1) throw Error('All source films must share dimensions and frame rate');
  const endDuration = 2, duration = offset + endDuration;
  if (duration < 20 || duration > 30) throw Error('Hero edit must be 20–30 seconds including the 2-second end card');
  return { title: job.title.trim(), subtitle: job.subtitle ?? 'ARMOR. ATMOSPHERE. IMPACT.', cta: job.cta ?? 'PLAY FREE IN YOUR BROWSER', width: inputs[0].width, height: inputs[0].height, fps: inputs[0].fps, scenes, endDuration, endOffset: offset, duration };
}
const soundTypes = new Set(['fire', 'muzzle_flash', 'firing_moment', 'impact', 'explosion', 'explosion_moment', 'tank_kill', 'mg_burst']);
export function soundEvents(plan, captures) {
  const result = [];
  for (const scene of plan.scenes) {
    for (const effect of captures[scene.index].scene?.effects ?? []) {
      const sourceStartMs = captures[scene.index].startMs ?? 0;
      const time = ((effect.tMs ?? 0) - sourceStartMs) / 1000 - scene.start;
      if (!soundTypes.has(effect.type) || time < 0 || time >= scene.duration) continue;
      const at = scene.offset + time;
      if (result.some(row => row.type === effect.type && Math.abs(row.at - at) < .02)) continue;
      result.push({ type: effect.type, at, end: scene.offset + scene.duration, actor: effect.actor ?? null });
    }
  }
  return result.sort((a, b) => a.at - b.at);
}
