import { sha256 } from './campaignPlan.mjs';

export function requireCampaignReview(receipt, receiptBytes, review, currentDigest) {
  if (!receipt.finished || !Array.isArray(receipt.errors) || receipt.errors.length) throw Error('Campaign is incomplete');
  if (review.receiptSha256 !== sha256(receiptBytes)) throw Error('Review is for another campaign receipt');
  if (!review.accepted || !review.reviewedAt || !review.notes?.trim() || !review.audioNotes?.trim()) throw Error('Explicit visual and audio review required');
  if (review.sourceDigest !== currentDigest || receipt.inputs.some(input => input.sourceDigest !== currentDigest)) throw Error('Rendering sources changed; recapture before publishing');
  const files = [...receipt.outputs, ...receipt.inputs.flatMap(input => [input.video, ...input.posters])];
  const reviewed = new Set(review.hashes ?? []);
  for (const file of files) if (!/^[a-f0-9]{64}$/.test(file.sha256) || !reviewed.has(file.sha256)) throw Error(`Unreviewed media hash: ${file.sha256}`);
  for (const scene of receipt.plan.scenes) {
    const row = review.scenes?.[scene.id];
    if (!row?.accepted || !row.notes?.trim()) throw Error(`Scene needs visual acceptance: ${scene.id}`);
  }
  for (const kind of ['trailer', 'loop']) if (receipt.outputs.filter(file => file.kind === kind).length !== 1) throw Error(`Require exactly one ${kind}`);
  return files;
}
export function publicCampaignProvenance(receipt, review) {
  return {
    title: receipt.title, notice: receipt.notice, receiptSha256: review.receiptSha256,
    sourceDigest: review.sourceDigest, encoderVersion: receipt.encoderVersion,
    toolFiles: receipt.toolFiles, plan: receipt.plan,
    sources: receipt.inputs.map((input, index) => ({
      id: receipt.plan.scenes[index].id, revision: input.revision, sourceDigest: input.sourceDigest,
      receiptSha256: input.receiptSha256, renderer: input.renderer,
      videoSha256: input.video.sha256, posterHashes: input.posters.map(file => ({ format: file.format, sha256: file.sha256 })),
    })),
    sound: { provenance: receipt.sound.provenance, note: receipt.sound.note, events: receipt.sound.events, sampleRate: receipt.sound.sampleRate, peak: receipt.sound.peak, rms: receipt.sound.rms },
    review: { reviewedAt: review.reviewedAt, notes: review.notes, audioNotes: review.audioNotes, scenes: review.scenes, hashes: review.hashes },
  };
}
export function assertPortablePublication(value) {
  const text = JSON.stringify(value);
  if (/(?:\/Users\/|\/private\/|\/tmp\/|\/var\/folders\/|file:\/\/|[A-Z]:\\\\Users\\\\)/.test(text)) throw Error('Public provenance contains a private filesystem path');
}
export function campaignCaptions(plan) {
  const timestamp = seconds => {
    const ms = Math.round(seconds * 1000);
    return `00:${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  };
  const text = value => String(value).replace(/[<>\r\n]/g, ' ');
  return 'WEBVTT\n\n' + plan.scenes.map(scene => `${timestamp(scene.offset)} --> ${timestamp(scene.offset + scene.duration)}\n${text(scene.title)} — in-engine staged scene\n[Engine rumble${scene.id.includes('crossfire') ? ', gunfire and impacts' : ''}]\n`).join('\n')
    + `\n${timestamp(plan.endOffset)} --> ${timestamp(plan.duration)}\nClaude of Tanks — ${text(plan.cta)}\n`;
}

/** Saved recipes start on the actual recorded pose, including offset captures. */
export function publishedPosterScene(poster, video) {
  return { ...poster.scene, fxTime: poster.fxTimeMs ?? (video.startMs ?? 0) + poster.frame / video.fps * 1000 };
}
export function publishedFilmScene(video) {
  return { ...video.scene, fxTime: video.startMs ?? video.scene.fxTime ?? 0 };
}

function videoStream(probe) {
  const stream = probe.streams?.find(row => row.codec_type === 'video');
  if (!stream) throw Error('Movie is missing a video stream');
  return stream;
}
function frameRate(stream) {
  const [numerator, denominator = 1] = String(stream.r_frame_rate).split('/').map(Number);
  return numerator / denominator;
}
/** The distribution ladder only downsizes; capture masters are never rewritten. */
export function campaignWebProfile(source, mobile = false, audio = false) {
  const video = videoStream(source), fps = frameRate(video), frames = Number(video.nb_frames);
  const width = mobile ? 960 : 1920, height = mobile ? 540 : 1080;
  if (video.width < width || video.height < height || video.width / video.height !== 16 / 9) throw Error('Web video must not upscale or distort its source');
  if (![24, 30, 60].includes(fps) || !Number.isInteger(frames) || frames < 1) throw Error('Invalid source movie cadence');
  if (audio && !source.streams.some(row => row.codec_type === 'audio')) throw Error('Soundtrack missing from hero film');
  return { width, height, fps, frames, duration: frames / fps, audio, codec: 'h264', pixelFormat: 'yuv420p', crf: 21,
    maxrateKbps: mobile ? 1800 : 6000, bufferKbits: mobile ? 3600 : 12000, audioKbps: audio ? 192 : 0 };
}
export function campaignWebArguments(input, output, profile) {
  return ['-i', input, '-map', '0:v:0', ...(profile.audio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '192k'] : ['-an']),
    '-vf', `scale=${profile.width}:${profile.height}:flags=lanczos,setsar=1`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(profile.crf), '-maxrate:v', `${profile.maxrateKbps}k`,
    '-bufsize:v', `${profile.bufferKbits}k`, '-pix_fmt', profile.pixelFormat, '-threads', '4', '-movflags', '+faststart', output];
}
export function validateCampaignWebEncode(probe, profile, bytes) {
  const video = videoStream(probe), audio = probe.streams.filter(row => row.codec_type === 'audio');
  if (video.codec_name !== profile.codec || video.pix_fmt !== profile.pixelFormat) throw Error('Web codec mismatch');
  if (video.width !== profile.width || video.height !== profile.height) throw Error('Web dimensions mismatch');
  if (frameRate(video) !== profile.fps || Number(video.nb_frames) !== profile.frames) throw Error('Web encode changed frame cadence or count');
  const videoDuration = Number(video.duration ?? probe.format?.duration);
  if (!Number.isFinite(videoDuration) || Math.abs(videoDuration - profile.duration) > .51 / profile.fps) throw Error('Web encode changed movie duration');
  if (profile.audio ? audio.length !== 1 || audio[0].codec_name !== 'aac' : audio.length !== 0) throw Error('Web soundtrack mismatch');
  const byteBudget = (profile.duration * (profile.maxrateKbps + profile.audioKbps) + profile.bufferKbits) * 1000 / 8 * 1.02;
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > byteBudget) throw Error('Web movie exceeds its bounded delivery budget');
  return { width: video.width, height: video.height, fps: frameRate(video), frames: Number(video.nb_frames), duration: videoDuration,
    codec: video.codec_name, pixelFormat: video.pix_fmt, audioCodec: audio[0]?.codec_name ?? null, bytes, byteBudget: Math.floor(byteBudget) };
}
