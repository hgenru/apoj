import { For, Show, createMemo, type Component } from "solid-js";
import { t } from "../i18n";
import type { AudioClip } from "../types/audio";

interface LiveWaveformProps {
  values: number[];
  active: boolean;
  tone?: "coral" | "mint";
  flow?: "history" | "rolling";
  guide?: AudioClip;
}

const WIDTH = 960;
const HEIGHT = 260;
const BAR_COUNT = 96;
const FRAME_MS = 45;

export const LiveWaveform: Component<LiveWaveformProps> = (props) => {
  const guideBars = createMemo(() => {
    const guide = props.guide;
    if (!guide?.samples.length) return [];
    const durationMs = (guide.samples.length / guide.sampleRate) * 1_000;
    const barCount = Math.max(1, Math.ceil(durationMs / FRAME_MS));
    const samplesPerBar = guide.samples.length / barCount;
    const peaks = Array.from({ length: barCount }, (_, bar) => {
      const start = Math.floor(bar * samplesPerBar);
      const end = Math.max(start + 1, Math.min(guide.samples.length, Math.floor((bar + 1) * samplesPerBar)));
      let peak = 0;
      for (let index = start; index < end; index += 1) peak = Math.max(peak, Math.abs(guide.samples[index]));
      return peak;
    });
    const sorted = [...peaks].sort((a, b) => a - b);
    const reference = Math.max(0.0001, sorted[Math.floor((sorted.length - 1) * 0.9)] ?? 0);
    return peaks.map((peak) => Math.min(1, peak / reference));
  });
  const timelineBarCount = () => guideBars().length || BAR_COUNT;
  const bars = createMemo(() => {
    if (props.flow === "rolling") return props.values.slice(-BAR_COUNT);
    if (guideBars().length) return props.values.slice(0, guideBars().length);
    if (props.values.length <= BAR_COUNT) return props.values;
    const bucketSize = props.values.length / BAR_COUNT;
    return Array.from({ length: BAR_COUNT }, (_, bucket) => {
      const start = Math.floor(bucket * bucketSize);
      const end = Math.max(start + 1, Math.floor((bucket + 1) * bucketSize));
      let peak = 0;
      for (let index = start; index < end; index += 1) peak = Math.max(peak, props.values[index] ?? 0);
      return peak;
    });
  });

  return (
    <svg
      classList={{
        "live-waveform": true,
        "live-waveform--active": props.active,
        "live-waveform--mint": props.tone === "mint",
      }}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={props.guide ? t("waveform.guidedLabel") : t("waveform.liveLabel")}
    >
      <For each={guideBars()}>
        {(value, index) => {
          const slotWidth = WIDTH / timelineBarCount();
          const amplitude = Math.max(3, value * HEIGHT * 0.4);
          return (
            <rect
              class="live-waveform__guide"
              x={index() * slotWidth + 1.5}
              y={HEIGHT / 2 - amplitude}
              width={Math.max(2, slotWidth - 3)}
              height={amplitude * 2}
              rx="2"
            />
          );
        }}
      </For>
      <line class="live-waveform__center" x1="0" x2={WIDTH} y1={HEIGHT / 2} y2={HEIGHT / 2} />
      <For each={bars()}>
        {(value, index) => {
          const slotWidth = WIDTH / timelineBarCount();
          const amplitude = Math.max(3, Math.min(HEIGHT * 0.43, Math.sqrt(Math.max(0, value)) * HEIGHT * 1.2));
          return (
            <rect
              class="live-waveform__bar"
              x={index() * slotWidth + 1.5}
              y={HEIGHT / 2 - amplitude}
              width={Math.max(2, slotWidth - 3)}
              height={amplitude * 2}
              rx="2"
            />
          );
        }}
      </For>
      <Show when={Boolean(props.guide) && props.active && bars().length > 0}>
        <line
          class="live-waveform__playhead"
          x1={Math.min(1, bars().length / timelineBarCount()) * WIDTH}
          x2={Math.min(1, bars().length / timelineBarCount()) * WIDTH}
          y1="12"
          y2={HEIGHT - 12}
        />
      </Show>
      <ShowEmpty when={bars().length === 0 && guideBars().length === 0} />
    </svg>
  );
};

const ShowEmpty: Component<{ when: boolean }> = (props) => (
  <g classList={{ "live-waveform__idle": true, "live-waveform__idle--hidden": !props.when }} aria-hidden="true">
    <For each={Array.from({ length: 48 })}>
      {(_, index) => <rect x={index() * 20 + 5} y="126" width="10" height="8" rx="4" />}
    </For>
  </g>
);
