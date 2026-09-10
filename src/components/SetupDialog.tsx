import { For, Show, createEffect, createSignal, onCleanup, type Component } from "solid-js";
import { thresholdFromVoiceLevels } from "../audio/calibration";
import type { AudioDeviceChoice, GameSettings } from "../types/audio";
import { t } from "../i18n";
import { LevelMeter } from "./LevelMeter";

interface SetupDialogProps {
  open: boolean;
  purpose: "round" | "settings";
  busy: boolean;
  ready: boolean;
  error: string;
  devices: AudioDeviceChoice[];
  selectedDevice: string;
  activeDeviceLabel: string;
  settings: GameSettings;
  level: number;
  onClose: () => void;
  onDone: () => void;
  onConnect: () => void;
  onDeviceChange: (deviceId: string) => void;
  onSettingsChange: (settings: GameSettings) => void;
}

export const SetupDialog: Component<SetupDialogProps> = (props) => {
  const patchSettings = (patch: Partial<GameSettings>) => props.onSettingsChange({ ...props.settings, ...patch });
  const [calibrationState, setCalibrationState] = createSignal<"idle" | "listening" | "done" | "missed">("idle");
  const [calibrationSeconds, setCalibrationSeconds] = createSignal(3);
  let calibrationTimer: number | undefined;
  let calibrationDeadline = 0;
  let calibrationLevels: number[] = [];

  const stopCalibration = () => {
    window.clearInterval(calibrationTimer);
    calibrationTimer = undefined;
  };

  const close = () => {
    stopCalibration();
    setCalibrationState("idle");
    props.onClose();
  };

  const startCalibration = () => {
    if (!props.ready || calibrationState() === "listening") return;
    stopCalibration();
    calibrationLevels = [];
    calibrationDeadline = performance.now() + 3_000;
    setCalibrationSeconds(3);
    setCalibrationState("listening");
    calibrationTimer = window.setInterval(() => {
      calibrationLevels.push(props.level);
      const remaining = Math.max(0, calibrationDeadline - performance.now());
      setCalibrationSeconds(Math.max(1, Math.ceil(remaining / 1_000)));
      if (remaining > 0) return;
      stopCalibration();
      const threshold = thresholdFromVoiceLevels(calibrationLevels);
      if (threshold === undefined) {
        setCalibrationState("missed");
      } else {
        patchSettings({ voiceThresholdDb: threshold });
        setCalibrationState("done");
      }
    }, 50);
  };

  createEffect(() => {
    if (!props.open) {
      stopCalibration();
      setCalibrationState("idle");
    }
  });
  onCleanup(stopCalibration);

  return (
    <Show when={props.open}>
      <div class="modal-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && close()}>
        <section class="setup-card" role="dialog" aria-modal="true" aria-labelledby="setup-title" onKeyDown={(event) => event.key === "Escape" && close()}>
          <div class="setup-card__header">
            <div>
              <p class="eyebrow">{t("setup.eyebrow")}</p>
              <h2 id="setup-title">{t("setup.title")}</h2>
            </div>
            <button class="icon-button" type="button" onClick={close} aria-label={t("common.close")}><span aria-hidden="true">×</span></button>
          </div>

          <div class="setup-layout">
            <section class="setup-section">
              <div class="setup-section__heading">
                <span aria-hidden="true">01</span>
                <h3>{t("setup.audioTitle")}</h3>
              </div>

              <label class="field" for="setup-input">
                <span>{t("setup.input")}</span>
                <select
                  id="setup-input"
                  value={props.selectedDevice}
                  disabled={props.busy}
                  onChange={(event) => props.onDeviceChange(event.currentTarget.value)}
                >
                  <option value="">{t("setup.defaultInput")}</option>
                  <For each={props.devices}>{(device) => <option value={device.deviceId}>{device.label}</option>}</For>
                </select>
              </label>

              <div class="field">
                <span>{t("setup.channel")}</span>
                <div class="segmented segmented--large" role="group" aria-label={t("setup.channel")}>
                  <button type="button" aria-pressed={props.settings.channelMode === "mix"} classList={{ active: props.settings.channelMode === "mix" }} onClick={() => patchSettings({ channelMode: "mix" })}>{t("setup.channelMix")}</button>
                  <button type="button" aria-pressed={props.settings.channelMode === "left"} classList={{ active: props.settings.channelMode === "left" }} onClick={() => patchSettings({ channelMode: "left" })}>{t("setup.channelLeft")}</button>
                  <button type="button" aria-pressed={props.settings.channelMode === "right"} classList={{ active: props.settings.channelMode === "right" }} onClick={() => patchSettings({ channelMode: "right" })}>{t("setup.channelRight")}</button>
                </div>
              </div>

              <div class="sound-check">
                <div class="sound-check__status">
                  <span classList={{ "status-dot": true, "status-dot--ready": props.ready && !props.busy }} />
                  <span title={props.activeDeviceLabel}>
                    {props.busy
                      ? t("setup.connecting")
                      : props.ready
                        ? t("setup.activeInput", { device: props.activeDeviceLabel || t("setup.defaultInput") })
                        : t("setup.notReady")}
                  </span>
                </div>
                <LevelMeter level={props.level} />
              </div>
            </section>

            <section class="setup-section">
              <div class="setup-section__heading">
                <span aria-hidden="true">02</span>
                <h3>{t("setup.roundTitle")}</h3>
              </div>

              <div class="field">
                <span>{t("setup.repeats")}</span>
                <div class="segmented segmented--large" role="group" aria-label={t("setup.repeats")}>
                  <button type="button" aria-pressed={props.settings.repeats === 1} classList={{ active: props.settings.repeats === 1 }} onClick={() => patchSettings({ repeats: 1 })}>{t("setup.once")}</button>
                  <button type="button" aria-pressed={props.settings.repeats === 2} classList={{ active: props.settings.repeats === 2 }} onClick={() => patchSettings({ repeats: 2 })}>{t("setup.twice")}</button>
                  <button type="button" aria-pressed={props.settings.repeats === 3} classList={{ active: props.settings.repeats === 3 }} onClick={() => patchSettings({ repeats: 3 })}>{t("setup.thrice")}</button>
                </div>
              </div>

              <label class="field">
                <span>{t("setup.chunkLength")} <strong>{t("common.seconds", { value: props.settings.targetChunkSeconds.toFixed(1) })}</strong></span>
                <input
                  type="range"
                  min="1.4"
                  max="3.4"
                  step="0.1"
                  value={props.settings.targetChunkSeconds}
                  onInput={(event) => patchSettings({ targetChunkSeconds: Number(event.currentTarget.value) })}
                />
                <div class="range-labels"><small>{t("setup.shortChunks")}</small><small>{t("setup.longChunks")}</small></div>
              </label>

              <label class="field">
                <span>{t("setup.sensitivity")} <strong>{props.settings.voiceThresholdDb} dB</strong></span>
                <input
                  type="range"
                  min="-55"
                  max="-28"
                  step="1"
                  value={props.settings.voiceThresholdDb}
                  onInput={(event) => {
                    setCalibrationState("idle");
                    patchSettings({ voiceThresholdDb: Number(event.currentTarget.value) });
                  }}
                />
                <div class="range-labels"><small>{t("setup.quieterVoice")}</small><small>{t("setup.louderVoice")}</small></div>
                <div class="calibration-row">
                  <button class="button button--ghost calibration-button" type="button" disabled={!props.ready || calibrationState() === "listening"} onClick={startCalibration}>
                    {calibrationState() === "listening"
                      ? t("setup.calibrating", { seconds: calibrationSeconds() })
                      : t("setup.calibrate")}
                  </button>
                  <span class="calibration-result" aria-live="polite">
                    {!props.ready
                      ? t("setup.calibrationNeedsMic")
                      : calibrationState() === "done"
                        ? t("setup.calibrated", { level: props.settings.voiceThresholdDb })
                        : calibrationState() === "missed" ? t("setup.calibrationMissed") : t("setup.sensitivityHint")}
                  </span>
                </div>
              </label>
            </section>
          </div>

          <Show when={props.error}><p class="error-message" role="alert">{props.error}</p></Show>
          <div class="setup-actions">
            <button class="button button--ghost" type="button" onClick={close}>{t("common.close")}</button>
            <Show
              when={props.ready && !props.busy}
              fallback={
                <button class="button button--primary" type="button" data-tv-default disabled={props.busy} onClick={props.onConnect}>
                  {props.busy ? t("setup.connecting") : t("setup.connectMic")}
                </button>
              }
            >
              <button class="button button--primary" type="button" data-tv-default onClick={props.onDone}>
                {props.purpose === "round" ? t("setup.startRound") : t("common.done")}
              </button>
            </Show>
          </div>
        </section>
      </div>
    </Show>
  );
};
