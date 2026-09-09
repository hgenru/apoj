import { For, createMemo, type Component } from "solid-js";
import { t } from "../i18n";

interface LiveWaveformProps {
  values: number[];
  active: boolean;
  tone?: "coral" | "mint";
}

const WIDTH = 960;
const HEIGHT = 260;
const BAR_COUNT = 96;

export const LiveWaveform: Component<LiveWaveformProps> = (props) => {
  const bars = createMemo(() => {
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
      aria-label={t("waveform.liveLabel")}
    >
      <line class="live-waveform__center" x1="0" x2={WIDTH} y1={HEIGHT / 2} y2={HEIGHT / 2} />
      <For each={bars()}>
        {(value, index) => {
          const slotWidth = WIDTH / BAR_COUNT;
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
      <ShowEmpty when={bars().length === 0} />
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
