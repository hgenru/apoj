import { For, createMemo, type Component } from "solid-js";
import { t } from "../i18n";
import type { AudioClip } from "../types/audio";

interface PlaybackWaveformProps {
  clip: AudioClip;
  progress: number;
}

const WIDTH = 1000;
const HEIGHT = 230;
const BAR_COUNT = 125;

export const PlaybackWaveform: Component<PlaybackWaveformProps> = (props) => {
  const bars = createMemo(() => {
    const samplesPerBar = Math.max(1, Math.ceil(props.clip.samples.length / BAR_COUNT));
    return Array.from({ length: BAR_COUNT }, (_, bar) => {
      const start = bar * samplesPerBar;
      const end = Math.min(props.clip.samples.length, start + samplesPerBar);
      let peak = 0;
      for (let index = start; index < end; index += 1) {
        peak = Math.max(peak, Math.abs(props.clip.samples[index]));
      }
      return peak;
    });
  });
  const progress = () => Math.min(1, Math.max(0, props.progress));

  return (
    <div
      class="playback-waveform"
      role="progressbar"
      aria-label={t("preview.progress")}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={Math.round(progress() * 100)}
    >
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
        <line class="playback-waveform__center" x1="0" x2={WIDTH} y1={HEIGHT / 2} y2={HEIGHT / 2} />
        <For each={bars()}>
          {(peak, index) => {
            const slotWidth = WIDTH / BAR_COUNT;
            const amplitude = Math.max(3, Math.min(HEIGHT * 0.42, peak * HEIGHT * 0.46));
            return (
              <rect
                classList={{ "playback-waveform__bar": true, played: (index() + 0.5) / BAR_COUNT <= progress() }}
                x={index() * slotWidth + 1.5}
                y={HEIGHT / 2 - amplitude}
                width={Math.max(2, slotWidth - 3)}
                height={amplitude * 2}
                rx="2"
              />
            );
          }}
        </For>
        <line
          class="playback-waveform__playhead"
          x1={progress() * WIDTH}
          x2={progress() * WIDTH}
          y1="10"
          y2={HEIGHT - 10}
        />
      </svg>
    </div>
  );
};
