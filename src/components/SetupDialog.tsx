import { For, Show, type Component } from "solid-js";
import type { AudioDeviceChoice, GameSettings } from "../types/audio";
import { t } from "../i18n";
import { LevelMeter } from "./LevelMeter";

interface SetupDialogProps {
  open: boolean;
  purpose: "round" | "settings";
  busy: boolean;
  ready: boolean;
  deviceDirty: boolean;
  error: string;
  devices: AudioDeviceChoice[];
  selectedDevice: string;
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

  return (
    <Show when={props.open}>
      <div class="modal-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && props.onClose()}>
        <section class="setup-card" role="dialog" aria-modal="true" aria-labelledby="setup-title">
          <div class="setup-card__header">
            <div>
              <p class="eyebrow">{t("setup.eyebrow")}</p>
              <h2 id="setup-title">{t("setup.title")}</h2>
            </div>
            <button class="icon-button" type="button" onClick={props.onClose} aria-label={t("common.close")}>×</button>
          </div>

          <div class="settings-grid">
            <label class="field field--wide">
              <span>{t("setup.input")}</span>
              <select value={props.selectedDevice} onChange={(event) => props.onDeviceChange(event.currentTarget.value)}>
                <option value="">{t("setup.defaultInput")}</option>
                <For each={props.devices}>{(device) => <option value={device.deviceId}>{device.label}</option>}</For>
              </select>
              <small>{t("setup.deviceHint")}</small>
            </label>

            <label class="field">
              <span>{t("setup.channel")}</span>
              <select
                value={props.settings.channelMode}
                onChange={(event) => patchSettings({ channelMode: event.currentTarget.value as GameSettings["channelMode"] })}
              >
                <option value="mix">{t("setup.channelMix")}</option>
                <option value="left">{t("setup.channelLeft")}</option>
                <option value="right">{t("setup.channelRight")}</option>
              </select>
            </label>

            <label class="field">
              <span>{t("setup.repeats")}</span>
              <div class="segmented" role="group" aria-label={t("setup.repeats")}>
                <button type="button" classList={{ active: props.settings.repeats === 1 }} onClick={() => patchSettings({ repeats: 1 })}>{t("setup.once")}</button>
                <button type="button" classList={{ active: props.settings.repeats === 2 }} onClick={() => patchSettings({ repeats: 2 })}>{t("setup.twice")}</button>
              </div>
            </label>

            <label class="field field--wide">
              <span>{t("setup.chunkLength")} <strong>{t("common.seconds", { value: props.settings.targetChunkSeconds.toFixed(1) })}</strong></span>
              <input
                type="range"
                min="1.6"
                max="4.2"
                step="0.1"
                value={props.settings.targetChunkSeconds}
                onInput={(event) => patchSettings({ targetChunkSeconds: Number(event.currentTarget.value) })}
              />
              <div class="range-labels"><small>{t("setup.harder")}</small><small>{t("setup.easier")}</small></div>
            </label>

            <label class="field field--wide">
              <span>{t("setup.sensitivity")} <strong>{props.settings.voiceThresholdDb} dB</strong></span>
              <input
                type="range"
                min="-55"
                max="-28"
                step="1"
                value={props.settings.voiceThresholdDb}
                onInput={(event) => patchSettings({ voiceThresholdDb: Number(event.currentTarget.value) })}
              />
              <small>{t("setup.sensitivityHint")}</small>
            </label>
          </div>

          <div class="sound-check">
            <div class="sound-check__status">
              <span classList={{ "status-dot": true, "status-dot--ready": props.ready }} />
              <span>{props.ready ? t("setup.ready") : t("setup.notReady")}</span>
            </div>
            <LevelMeter level={props.level} />
            <small>{t("setup.outputHint")}</small>
          </div>

          <Show when={props.error}><p class="error-message" role="alert">{props.error}</p></Show>
          <div class="setup-actions">
            <button class="button button--ghost" type="button" onClick={props.onClose}>{t("common.close")}</button>
            <Show
              when={props.ready && !props.deviceDirty}
              fallback={
                <button class="button button--primary" type="button" disabled={props.busy} onClick={props.onConnect}>
                  {props.busy ? t("setup.connecting") : props.deviceDirty ? t("setup.applyInput") : t("setup.checkMic")}
                </button>
              }
            >
              <button class="button button--quiet" type="button" disabled={props.busy} onClick={props.onConnect}>
                {props.busy ? t("setup.connecting") : t("setup.reconnect")}
              </button>
              <button class="button button--primary" type="button" onClick={props.onDone}>
                {props.purpose === "round" ? t("setup.startRound") : t("common.done")} <span>→</span>
              </button>
            </Show>
          </div>
        </section>
      </div>
    </Show>
  );
};
