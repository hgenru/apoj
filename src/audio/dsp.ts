import type { AudioClip } from "../types/audio";

export interface SplitOptions {
  targetSeconds: number;
  minSeconds?: number;
  maxSeconds?: number;
}

export interface TrimOptions {
  threshold?: number;
  paddingMs?: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function quantile(values: Float32Array, fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * clamp(fraction, 0, 1))];
}

export function rmsEnvelope(
  samples: Float32Array,
  sampleRate: number,
  windowMs = 24,
  hopMs = 12,
): { values: Float32Array; hopSamples: number } {
  const windowSamples = Math.max(1, Math.round((windowMs / 1000) * sampleRate));
  const hopSamples = Math.max(1, Math.round((hopMs / 1000) * sampleRate));
  const frameCount = Math.max(1, Math.ceil(samples.length / hopSamples));
  const values = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hopSamples;
    const end = Math.min(samples.length, start + windowSamples);
    let sum = 0;
    for (let index = start; index < end; index += 1) {
      sum += samples[index] * samples[index];
    }
    values[frame] = Math.sqrt(sum / Math.max(1, end - start));
  }

  const smoothed = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    let sum = 0;
    let count = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      const cursor = index + offset;
      if (cursor >= 0 && cursor < values.length) {
        sum += values[cursor];
        count += 1;
      }
    }
    smoothed[index] = sum / count;
  }

  return { values: smoothed, hopSamples };
}

export function trimSilence(clip: AudioClip, options: TrimOptions = {}): AudioClip {
  if (clip.samples.length === 0) return clip;
  const { values, hopSamples } = rmsEnvelope(clip.samples, clip.sampleRate);
  const noiseFloor = quantile(values, 0.2);
  const activeReference = quantile(values, 0.85);
  const threshold = options.threshold ?? Math.max(0.008, Math.min(noiseFloor * 2.8, activeReference * 0.35));
  const paddingSamples = Math.round(((options.paddingMs ?? 90) / 1000) * clip.sampleRate);

  let firstFrame = -1;
  let lastFrame = -1;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] >= threshold) {
      if (firstFrame === -1) firstFrame = index;
      lastFrame = index;
    }
  }

  if (firstFrame === -1) return clip;
  const start = Math.max(0, firstFrame * hopSamples - paddingSamples);
  const end = Math.min(clip.samples.length, (lastFrame + 1) * hopSamples + paddingSamples);
  return { samples: clip.samples.slice(start, end), sampleRate: clip.sampleRate };
}

function boundaryCandidates(
  energy: Float32Array,
  desiredFrame: number,
  radiusFrames: number,
  lowerFrame: number,
  upperFrame: number,
): number[] {
  const start = Math.max(lowerFrame, desiredFrame - radiusFrames);
  const end = Math.min(upperFrame, desiredFrame + radiusFrames);
  const candidates: Array<{ frame: number; energy: number; distance: number }> = [];

  for (let frame = start; frame <= end; frame += 1) {
    const current = energy[frame] ?? 0;
    const before = energy[Math.max(0, frame - 1)] ?? current;
    const after = energy[Math.min(energy.length - 1, frame + 1)] ?? current;
    if (current <= before && current <= after) {
      candidates.push({ frame, energy: current, distance: Math.abs(frame - desiredFrame) });
    }
  }

  candidates.sort((a, b) => a.energy - b.energy || a.distance - b.distance);
  const selected = candidates.slice(0, 36).map(({ frame }) => frame);
  selected.push(clamp(desiredFrame, lowerFrame, upperFrame));
  return [...new Set(selected)].sort((a, b) => a - b);
}

/**
 * Chooses all boundaries together. Quiet valleys are preferred, while a duration
 * penalty keeps legato/noisy recordings balanced when no useful silence exists.
 */
export function findSmartBoundaries(clip: AudioClip, options: SplitOptions): number[] {
  const totalSamples = clip.samples.length;
  if (totalSamples === 0) return [0];

  const duration = totalSamples / clip.sampleRate;
  const target = clamp(options.targetSeconds, 1, 8);
  const minSeconds = options.minSeconds ?? Math.max(0.85, target * 0.52);
  const maxSeconds = options.maxSeconds ?? target * 1.65;
  const minimumCount = Math.max(1, Math.ceil(duration / maxSeconds));
  const maximumCount = Math.max(1, Math.floor(duration / minSeconds));
  const chunkCount = clamp(Math.round(duration / target), minimumCount, maximumCount);
  if (chunkCount <= 1) return [0, totalSamples];

  const { values: energy, hopSamples } = rmsEnvelope(clip.samples, clip.sampleRate);
  const idealFrames = energy.length / chunkCount;
  const minFrames = Math.max(1, Math.floor((minSeconds * clip.sampleRate) / hopSamples));
  const maxFrames = Math.max(minFrames + 1, Math.ceil((maxSeconds * clip.sampleRate) / hopSamples));
  const radiusFrames = Math.max(2, Math.round(idealFrames * 0.48));
  const low = quantile(energy, 0.1);
  const high = Math.max(low + 1e-5, quantile(energy, 0.9));

  const layers: number[][] = [[0]];
  for (let boundary = 1; boundary < chunkCount; boundary += 1) {
    const lower = Math.max(boundary * minFrames, energy.length - (chunkCount - boundary) * maxFrames);
    const upper = Math.min(boundary * maxFrames, energy.length - (chunkCount - boundary) * minFrames);
    const desired = Math.round(boundary * idealFrames);
    layers.push(boundaryCandidates(energy, desired, radiusFrames, lower, upper));
  }
  layers.push([energy.length]);

  const costs: number[][] = layers.map((layer) => layer.map(() => Number.POSITIVE_INFINITY));
  const parents: number[][] = layers.map((layer) => layer.map(() => -1));
  costs[0][0] = 0;

  for (let layerIndex = 1; layerIndex < layers.length; layerIndex += 1) {
    const isFinal = layerIndex === layers.length - 1;
    for (let currentIndex = 0; currentIndex < layers[layerIndex].length; currentIndex += 1) {
      const frame = layers[layerIndex][currentIndex];
      const normalizedEnergy = isFinal ? 0 : clamp(((energy[frame] ?? low) - low) / (high - low), 0, 2);

      for (let previousIndex = 0; previousIndex < layers[layerIndex - 1].length; previousIndex += 1) {
        const previousFrame = layers[layerIndex - 1][previousIndex];
        const segmentFrames = frame - previousFrame;
        if (segmentFrames < minFrames || segmentFrames > maxFrames) continue;
        const durationPenalty = ((segmentFrames - idealFrames) / idealFrames) ** 2;
        const cost = costs[layerIndex - 1][previousIndex] + normalizedEnergy * 2.7 + durationPenalty * 1.15;
        if (cost < costs[layerIndex][currentIndex]) {
          costs[layerIndex][currentIndex] = cost;
          parents[layerIndex][currentIndex] = previousIndex;
        }
      }
    }
  }

  if (!Number.isFinite(costs.at(-1)?.[0])) {
    return Array.from({ length: chunkCount + 1 }, (_, index) =>
      index === chunkCount ? totalSamples : Math.round((index * totalSamples) / chunkCount),
    );
  }

  const frames = new Array<number>(layers.length);
  let cursor = 0;
  for (let layerIndex = layers.length - 1; layerIndex >= 0; layerIndex -= 1) {
    frames[layerIndex] = layers[layerIndex][cursor];
    cursor = parents[layerIndex][cursor];
  }

  return frames.map((frame, index) =>
    index === frames.length - 1 ? totalSamples : Math.min(totalSamples, frame * hopSamples),
  );
}

export function sliceClip(clip: AudioClip, start: number, end: number): AudioClip {
  return { samples: clip.samples.slice(start, end), sampleRate: clip.sampleRate };
}

export function reverseClip(clip: AudioClip): AudioClip {
  const samples = clip.samples.slice();
  samples.reverse();
  return { samples, sampleRate: clip.sampleRate };
}

export function fadeEdges(clip: AudioClip, fadeMs = 7): AudioClip {
  const samples = clip.samples.slice();
  const fadeSamples = Math.min(Math.floor(samples.length / 2), Math.round((fadeMs / 1000) * clip.sampleRate));
  for (let index = 0; index < fadeSamples; index += 1) {
    const gain = index / Math.max(1, fadeSamples);
    samples[index] *= gain;
    samples[samples.length - 1 - index] *= gain;
  }
  return { samples, sampleRate: clip.sampleRate };
}

export function buildChallenge(clip: AudioClip, boundaries: number[]): AudioClip[] {
  const chunks: AudioClip[] = [];
  for (let index = boundaries.length - 2; index >= 0; index -= 1) {
    chunks.push(fadeEdges(reverseClip(sliceClip(clip, boundaries[index], boundaries[index + 1]))));
  }
  return chunks;
}

export function concatenate(clips: AudioClip[]): AudioClip {
  if (clips.length === 0) return { samples: new Float32Array(), sampleRate: 48_000 };
  const sampleRate = clips[0].sampleRate;
  if (clips.some((clip) => clip.sampleRate !== sampleRate)) {
    throw new Error("Все фрагменты должны иметь одну частоту дискретизации");
  }
  const totalLength = clips.reduce((sum, clip) => sum + clip.samples.length, 0);
  const samples = new Float32Array(totalLength);
  let offset = 0;
  for (const clip of clips) {
    samples.set(clip.samples, offset);
    offset += clip.samples.length;
  }
  return { samples, sampleRate };
}

export function assembleReveal(attemptsInChallengeOrder: AudioClip[]): AudioClip {
  return reverseClip(concatenate(attemptsInChallengeOrder));
}

export function dbToAmplitude(db: number): number {
  return 10 ** (db / 20);
}
