import { describe, expect, it } from "vitest";
import { assembleReveal, buildChallenge, findSmartBoundaries, makeAdaptiveVoiceGate, trimSilence } from "./dsp";
import type { AudioClip } from "../types/audio";

function makeClip(seconds: number, sampleRate = 1_000): AudioClip {
  return { samples: new Float32Array(Math.round(seconds * sampleRate)), sampleRate };
}

function fillTone(clip: AudioClip, startSeconds: number, endSeconds: number, amplitude = 0.5) {
  const start = Math.round(startSeconds * clip.sampleRate);
  const end = Math.round(endSeconds * clip.sampleRate);
  for (let index = start; index < end; index += 1) {
    clip.samples[index] = Math.sin(index * 0.17) * amplitude;
  }
}

describe("smart audio preparation", () => {
  it("trims only the quiet edges and keeps padding", () => {
    const clip = makeClip(4);
    fillTone(clip, 1, 3);
    const trimmed = trimSilence(clip, { paddingMs: 100 });
    expect(trimmed.samples.length / clip.sampleRate).toBeGreaterThan(2.1);
    expect(trimmed.samples.length / clip.sampleRate).toBeLessThan(2.35);
  });

  it("places boundaries in nearby quiet valleys", () => {
    const clip = makeClip(6.3);
    fillTone(clip, 0, 1.92);
    fillTone(clip, 2.12, 4.05);
    fillTone(clip, 4.25, 6.3);
    const boundaries = findSmartBoundaries(clip, { targetSeconds: 2.1 });
    const seconds = boundaries.map((sample) => sample / clip.sampleRate);
    expect(seconds).toHaveLength(4);
    expect(seconds[1]).toBeGreaterThan(1.85);
    expect(seconds[1]).toBeLessThan(2.2);
    expect(seconds[2]).toBeGreaterThan(3.95);
    expect(seconds[2]).toBeLessThan(4.35);
  });

  it("keeps chunks balanced when there are no pauses", () => {
    const clip = makeClip(7.8);
    fillTone(clip, 0, 7.8);
    const boundaries = findSmartBoundaries(clip, { targetSeconds: 2.1 });
    const durations = boundaries.slice(1).map((end, index) => (end - boundaries[index]) / clip.sampleRate);
    expect(durations).toHaveLength(4);
    for (const duration of durations) {
      expect(duration).toBeGreaterThan(1.7);
      expect(duration).toBeLessThan(2.2);
    }
  });

  it("gently lengthens chunks for a longer performance", () => {
    const shortClip = makeClip(10);
    const longClip = makeClip(30);
    fillTone(shortClip, 0, 10);
    fillTone(longClip, 0, 30);

    expect(findSmartBoundaries(shortClip, { targetSeconds: 2.3 })).toHaveLength(5);
    expect(findSmartBoundaries(longClip, { targetSeconds: 2.3 })).toHaveLength(13);
  });

  it("sets the voice gate above steady room noise but ignores a single bump", () => {
    const gate = makeAdaptiveVoiceGate(-42, [0.009, 0.01, 0.01, 0.011, 0.4]);
    expect(gate.startThreshold).toBeCloseTo(0.024, 3);
    expect(gate.stopThreshold).toBeCloseTo(0.0145, 3);
    expect(gate.startThreshold).toBeGreaterThan(gate.stopThreshold);
  });

  it("implements the APОЖ double-reversal order", () => {
    const source: AudioClip = { samples: Float32Array.from([1, 2, 3, 4, 5, 6]), sampleRate: 1 };
    const challenge = buildChallenge(source, [0, 2, 4, 6]).map((clip) => ({
      ...clip,
      // Disable the deliberately tiny playback fade at this toy sample rate.
      samples: clip.samples,
    }));
    const reveal = assembleReveal(challenge);
    expect(Array.from(reveal.samples)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps a short pause between reconstructed answers", () => {
    const attempts: AudioClip[] = [
      { samples: Float32Array.from([3, 4]), sampleRate: 1_000 },
      { samples: Float32Array.from([1, 2]), sampleRate: 1_000 },
    ];
    const reveal = assembleReveal(attempts, 2);
    expect(Array.from(reveal.samples)).toEqual([2, 1, 0, 0, 4, 3]);
  });
});
