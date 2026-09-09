import type { AudioClip } from "../types/audio";

export function createDemoClip(sampleRate = 12_000): AudioClip {
  const phraseLengths = [1.75, 2.05, 1.55, 2.2, 1.8];
  const gap = 0.18;
  const padding = 0.35;
  const duration = padding * 2 + phraseLengths.reduce((sum, value) => sum + value, 0) + gap * 4;
  const samples = new Float32Array(Math.round(duration * sampleRate));
  let cursor = padding;

  phraseLengths.forEach((length, phraseIndex) => {
    const start = Math.round(cursor * sampleRate);
    const end = Math.round((cursor + length) * sampleRate);
    for (let index = start; index < end; index += 1) {
      const localTime = (index - start) / sampleRate;
      const envelope = Math.min(1, localTime * 12, (length - localTime) * 12);
      const wobble = Math.sin(localTime * Math.PI * 2 * (2.2 + phraseIndex * 0.13)) * 12;
      const carrier = Math.sin((localTime * (175 + phraseIndex * 18) + wobble) * Math.PI * 2);
      samples[index] = carrier * envelope * (0.35 + 0.12 * Math.sin(localTime * 7));
    }
    cursor += length + gap;
  });

  return { samples, sampleRate };
}
