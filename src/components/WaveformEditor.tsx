import { For, createMemo, createSignal, type Component } from "solid-js";
import type { AudioClip } from "../types/audio";
import { t } from "../i18n";

interface WaveformEditorProps {
  clip: AudioClip;
  boundaries: number[];
  onChange: (boundaries: number[]) => void;
  onPlay: (start: number, end: number, reversed: boolean) => void;
}

const WIDTH = 1000;
const HEIGHT = 230;

function formatSeconds(seconds: number) {
  return t("common.seconds", { value: seconds.toFixed(1).replace(".", ",") });
}

export const WaveformEditor: Component<WaveformEditorProps> = (props) => {
  let svg!: SVGSVGElement;
  const [selected, setSelected] = createSignal(0);
  const [dragging, setDragging] = createSignal<number | null>(null);

  const waveformPath = createMemo(() => {
    const bins = 500;
    const samplesPerBin = Math.max(1, Math.floor(props.clip.samples.length / bins));
    const center = HEIGHT / 2;
    let path = "";
    for (let bin = 0; bin < bins; bin += 1) {
      const start = bin * samplesPerBin;
      const end = Math.min(props.clip.samples.length, start + samplesPerBin);
      let peak = 0;
      for (let index = start; index < end; index += 1) peak = Math.max(peak, Math.abs(props.clip.samples[index]));
      const x = (bin / (bins - 1)) * WIDTH;
      const amplitude = Math.max(1.5, peak * (HEIGHT * 0.43));
      path += `M${x.toFixed(2)},${(center - amplitude).toFixed(2)}V${(center + amplitude).toFixed(2)}`;
    }
    return path;
  });

  const chunks = createMemo(() =>
    props.boundaries.slice(0, -1).map((start, index) => ({ start, end: props.boundaries[index + 1], index })),
  );

  const xForSample = (sample: number) => (sample / Math.max(1, props.clip.samples.length)) * WIDTH;

  const updateDrag = (clientX: number) => {
    const index = dragging();
    if (index === null) return;
    const rect = svg.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const minimumGap = Math.round(props.clip.sampleRate * 0.55);
    const next = [...props.boundaries];
    next[index] = Math.round(
      Math.min(next[index + 1] - minimumGap, Math.max(next[index - 1] + minimumGap, ratio * props.clip.samples.length)),
    );
    props.onChange(next);
  };

  const playSelected = (reversed: boolean) => {
    const chunk = chunks()[selected()];
    if (chunk) props.onPlay(chunk.start, chunk.end, reversed);
  };

  return (
    <div class="waveform-editor">
      <svg
        ref={svg}
        class="waveform"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        aria-label={t("editor.waveformLabel")}
        onPointerMove={(event) => updateDrag(event.clientX)}
        onPointerUp={(event) => {
          setDragging(null);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => setDragging(null)}
      >
        <For each={chunks()}>
          {(chunk) => (
            <rect
              classList={{ "wave-region": true, "wave-region--selected": selected() === chunk.index }}
              x={xForSample(chunk.start)}
              y="0"
              width={xForSample(chunk.end - chunk.start)}
              height={HEIGHT}
              onPointerDown={() => setSelected(chunk.index)}
            />
          )}
        </For>
        <path class="waveform__path" d={waveformPath()} />
        <For each={chunks()}>
          {(chunk) => (
            <g class="chunk-label" onPointerDown={() => setSelected(chunk.index)}>
              <circle cx={(xForSample(chunk.start) + xForSample(chunk.end)) / 2} cy="27" r="16" />
              <text x={(xForSample(chunk.start) + xForSample(chunk.end)) / 2} y="32">{chunk.index + 1}</text>
            </g>
          )}
        </For>
        <For each={props.boundaries.slice(1, -1)}>
          {(boundary, offset) => (
            <g
              class="boundary-handle"
              transform={`translate(${xForSample(boundary)} 0)`}
              onPointerDown={(event) => {
                setDragging(offset() + 1);
                svg.setPointerCapture(event.pointerId);
                event.preventDefault();
              }}
            >
              <line y1="0" y2={HEIGHT} />
              <rect x="-12" y="92" width="24" height="46" rx="12" />
              <circle cx="-3.5" cy="115" r="1.6" />
              <circle cx="3.5" cy="115" r="1.6" />
            </g>
          )}
        </For>
      </svg>

      <div class="waveform-meta">
        <div>
          <span>{t("common.chunk", { number: selected() + 1 })}</span>
          <strong>{formatSeconds((chunks()[selected()]?.end - chunks()[selected()]?.start) / props.clip.sampleRate)}</strong>
        </div>
        <div class="waveform-actions">
          <button class="button button--ghost waveform-button" onClick={() => playSelected(false)}>▶ {t("editor.playNormal")}</button>
          <button class="button button--secondary waveform-button" onClick={() => playSelected(true)}>↶ {t("editor.playReverse")}</button>
        </div>
      </div>
    </div>
  );
};
