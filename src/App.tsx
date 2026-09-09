import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { AudioEngine } from "./audio/AudioEngine";
import { createDemoClip } from "./audio/demo";
import {
  assembleReveal,
  buildChallenge,
  fadeEdges,
  findSmartBoundaries,
  makeAdaptiveVoiceGate,
  reverseClip,
  sliceClip,
  trimSilence,
} from "./audio/dsp";
import { LiveWaveform } from "./components/LiveWaveform";
import { SetupDialog } from "./components/SetupDialog";
import { WaveformEditor } from "./components/WaveformEditor";
import { locale, setLocale, t } from "./i18n";
import type { AudioClip, AudioDeviceChoice, GameSettings } from "./types/audio";

type Stage = "home" | "source" | "edit" | "handoff" | "challenge" | "reveal";
type ChallengeStatus = "starting" | "playing" | "between" | "ready" | "waiting" | "recording" | "saved" | "missed";

interface CapturedAttempt {
  clip: AudioClip;
  voiceDetected: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DEFAULT_SETTINGS: GameSettings = {
  channelMode: "mix",
  controlMode: "auto",
  targetChunkSeconds: 2.1,
  repeats: 2,
  voiceThresholdDb: -42,
  silenceMs: 950,
};

const PARTY_TIMING = {
  firstListenLeadInMs: 1_500,
  betweenRepeatsMs: 2_000,
  beforeRecordingMs: 2_400,
  afterSavedMs: 3_000,
} as const;

function readSettings(): GameSettings {
  try {
    const saved = JSON.parse(localStorage.getItem("apoj-settings") ?? "null") as Partial<GameSettings> | null;
    const migrated = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
    // Move installations that still have the original defaults to the calmer,
    // shorter-chunk party defaults without overwriting deliberate choices.
    if (saved?.targetChunkSeconds === 2.6) migrated.targetChunkSeconds = DEFAULT_SETTINGS.targetChunkSeconds;
    if (saved?.silenceMs === 700) migrated.silenceMs = DEFAULT_SETTINGS.silenceMs;
    migrated.targetChunkSeconds = Math.min(3.4, Math.max(1.4, migrated.targetChunkSeconds));
    return migrated;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

export default function App() {
  const engine = new AudioEngine();
  const [stage, setStage] = createSignal<Stage>("home");
  const [setupOpen, setSetupOpen] = createSignal(false);
  const [setupPurpose, setSetupPurpose] = createSignal<"round" | "settings">("settings");
  const [setupDeviceDirty, setSetupDeviceDirty] = createSignal(false);
  const [setupBusy, setSetupBusy] = createSignal(false);
  const [micReady, setMicReady] = createSignal(false);
  const [devices, setDevices] = createSignal<AudioDeviceChoice[]>([]);
  const [selectedDevice, setSelectedDevice] = createSignal("");
  const [settings, setSettings] = createSignal<GameSettings>(readSettings());
  const [error, setError] = createSignal("");
  const [level, setLevel] = createSignal(0);
  const [liveWaveform, setLiveWaveform] = createSignal<number[]>([]);
  const [sourceRecording, setSourceRecording] = createSignal(false);
  const [recordSeconds, setRecordSeconds] = createSignal(0);
  const [sourceClip, setSourceClip] = createSignal<AudioClip>();
  const [boundaries, setBoundaries] = createSignal<number[]>([]);
  const [attempts, setAttempts] = createSignal<AudioClip[]>([]);
  const [challengeIndex, setChallengeIndex] = createSignal(0);
  const [challengeStatus, setChallengeStatus] = createSignal<ChallengeStatus>("starting");
  const [challengeRepeat, setChallengeRepeat] = createSignal(1);
  const [challengeCountdown, setChallengeCountdown] = createSignal<number>();
  const [extraListen, setExtraListen] = createSignal(false);
  const [demoMode, setDemoMode] = createSignal(false);
  const [redoRequested, setRedoRequested] = createSignal(false);
  const [installPrompt, setInstallPrompt] = createSignal<BeforeInstallPromptEvent>();
  const [installed, setInstalled] = createSignal(
    window.matchMedia("(display-mode: standalone)").matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  );
  let sourceTimer: number | undefined;
  let challengeRun = 0;
  let stopCurrentAttempt: (() => void) | undefined;
  let startCurrentAttempt: (() => void) | undefined;
  let requestReplay: (() => void) | undefined;
  let requestManualRecord: (() => void) | undefined;
  let requestSavedRedo: (() => void) | undefined;
  let requestSavedNext: (() => void) | undefined;
  let requestMissedRetry: (() => void) | undefined;

  const challengeClips = createMemo(() => {
    const clip = sourceClip();
    return clip ? buildChallenge(clip, boundaries()) : [];
  });
  const revealClip = createMemo(() => (attempts().length ? assembleReveal(attempts()) : undefined));

  createEffect(() => {
    localStorage.setItem("apoj-settings", JSON.stringify(settings()));
    engine.setChannelMode(settings().channelMode);
  });

  createEffect(() => {
    document.title = `${t("app.name")} — ${t("app.tagline")}`;
  });

  createEffect(() => {
    if (!micReady()) {
      setLevel(0);
      return;
    }
    const timer = window.setInterval(() => {
      const currentLevel = engine.getLevel();
      setLevel(currentLevel);
      if (sourceRecording() || challengeStatus() === "waiting" || challengeStatus() === "recording") {
        setLiveWaveform((current) => [...current.slice(-1_799), currentLevel]);
      }
    }, 45);
    onCleanup(() => window.clearInterval(timer));
  });

  onCleanup(() => {
    challengeRun += 1;
    window.clearInterval(sourceTimer);
    void engine.dispose();
  });

  onMount(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(undefined);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    onCleanup(() => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    });
  });

  const installApp = async () => {
    const prompt = installPrompt();
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setInstallPrompt(undefined);
  };

  const connectMicrophone = async () => {
    setSetupBusy(true);
    setError("");
    try {
      const inputs = await engine.initialize(selectedDevice() || undefined, settings().channelMode);
      setDevices(inputs);
      setMicReady(true);
      setSetupDeviceDirty(false);
    } catch (cause) {
      setMicReady(false);
      setError(cause instanceof Error && cause.message === "audio-unsupported" ? t("error.unsupported") : t("error.permission"));
    } finally {
      setSetupBusy(false);
    }
  };

  const beginRound = () => {
    setError("");
    setDemoMode(false);
    if (!micReady()) {
      setSetupPurpose("round");
      setSetupOpen(true);
      return;
    }
    setStage("source");
  };

  const finishSetup = () => {
    setSetupOpen(false);
    if (setupPurpose() === "round") setStage("source");
  };

  const loadDemo = () => {
    const clip = trimSilence(createDemoClip());
    setDemoMode(true);
    setSourceClip(clip);
    setBoundaries(findSmartBoundaries(clip, { targetSeconds: settings().targetChunkSeconds }));
    setStage("edit");
  };

  const startSourceRecording = () => {
    setError("");
    try {
      setLiveWaveform([]);
      engine.startRecording();
      setSourceRecording(true);
      const startedAt = performance.now();
      setRecordSeconds(0);
      sourceTimer = window.setInterval(() => setRecordSeconds((performance.now() - startedAt) / 1000), 100);
    } catch {
      setError(t("error.recording"));
    }
  };

  const stopSourceRecording = async () => {
    window.clearInterval(sourceTimer);
    setSourceRecording(false);
    try {
      const rawClip = await engine.stopRecording();
      const clip = trimSilence(rawClip);
      setSourceClip(clip);
      setBoundaries(findSmartBoundaries(clip, { targetSeconds: settings().targetChunkSeconds }));
      setStage("edit");
    } catch {
      setError(t("error.recording"));
    }
  };

  const splitAgain = () => {
    const clip = sourceClip();
    if (clip) setBoundaries(findSmartBoundaries(clip, { targetSeconds: settings().targetChunkSeconds }));
  };

  const playEditorChunk = (start: number, end: number, reversed: boolean) => {
    const clip = sourceClip();
    if (!clip) return;
    const piece = fadeEdges(sliceClip(clip, start, end));
    void engine.play(reversed ? reverseClip(piece) : piece);
  };

  const waitWithCountdown = async (milliseconds: number, token: number) => {
    const deadline = performance.now() + milliseconds;
    while (token === challengeRun) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) break;
      setChallengeCountdown(Math.ceil(remaining / 1_000));
      await delay(Math.min(200, remaining));
    }
    setChallengeCountdown(undefined);
  };

  const captureAutomaticAttempt = async (
    token: number,
    expectedClip: AudioClip,
    ambientLevels: number[],
  ): Promise<CapturedAttempt | undefined> => {
    if (demoMode()) {
      setLiveWaveform([]);
      setChallengeStatus("waiting");
      await delay(220);
      setChallengeStatus("recording");
      await delay(420);
      return { clip: expectedClip, voiceDetected: true };
    }

    setLiveWaveform([]);
    engine.startRecording();
    setChallengeStatus("waiting");
    const gate = makeAdaptiveVoiceGate(settings().voiceThresholdDb, ambientLevels);
    const startedAt = performance.now();
    const maximumMs = Math.max(8_000, (expectedClip.samples.length / expectedClip.sampleRate) * 2_200 + 3_000);
    let voicedFrames = 0;
    let silentMs = 0;
    let voiceStarted = false;
    let voiceStartedAt = 0;

    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearInterval(timer);
        stopCurrentAttempt = undefined;
        startCurrentAttempt = undefined;
        resolve();
      };
      stopCurrentAttempt = finish;
      startCurrentAttempt = () => {
        voiceStarted = true;
        voiceStartedAt = performance.now();
        setChallengeStatus("recording");
      };
      const timer = window.setInterval(() => {
        if (token !== challengeRun) return finish();
        const currentLevel = engine.getLevel();
        if (!voiceStarted) {
          voicedFrames = currentLevel >= gate.startThreshold ? voicedFrames + 1 : 0;
          if (voicedFrames >= 5) {
            voiceStarted = true;
            voiceStartedAt = performance.now();
            setChallengeStatus("recording");
          }
        } else {
          silentMs = currentLevel >= gate.stopThreshold ? 0 : silentMs + 50;
          if (performance.now() - voiceStartedAt >= 600 && silentMs >= settings().silenceMs) finish();
        }
        if (performance.now() - startedAt >= maximumMs) finish();
      }, 50);
    });

    const recorded = await engine.stopRecording();
    return {
      clip: trimSilence(recorded, { threshold: gate.trimThreshold }),
      voiceDetected: voiceStarted,
    };
  };

  const captureManualAttempt = async (token: number, expectedClip: AudioClip): Promise<CapturedAttempt | undefined> => {
    setLiveWaveform([]);
    if (!demoMode()) engine.startRecording();
    setChallengeStatus("recording");

    await new Promise<void>((resolve) => {
      let finished = false;
      stopCurrentAttempt = () => {
        if (finished) return;
        finished = true;
        stopCurrentAttempt = undefined;
        resolve();
      };
    });

    if (demoMode()) return { clip: expectedClip, voiceDetected: true };
    const recorded = await engine.stopRecording();
    if (token !== challengeRun) return undefined;
    return { clip: trimSilence(recorded), voiceDetected: true };
  };

  const waitForReplayChoice = (token: number) => new Promise<{ replay: boolean; ambientLevels: number[] }>((resolve) => {
    let settled = false;
    let timer: number | undefined;
    const ambientLevels: number[] = [];
    const deadline = performance.now() + PARTY_TIMING.beforeRecordingMs;
    const update = () => {
      ambientLevels.push(engine.getLevel());
      setChallengeCountdown(Math.max(1, Math.ceil((deadline - performance.now()) / 1_000)));
    };
    const finish = (replay: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      requestReplay = undefined;
      setChallengeCountdown(undefined);
      resolve({ replay: replay && token === challengeRun, ambientLevels });
    };
    requestReplay = () => finish(true);
    update();
    const interval = window.setInterval(update, 100);
    timer = window.setTimeout(() => finish(false), PARTY_TIMING.beforeRecordingMs);
  });

  const waitForManualReadyChoice = (token: number) => new Promise<"replay" | "record" | "cancel">((resolve) => {
    let settled = false;
    const finish = (choice: "replay" | "record") => {
      if (settled) return;
      settled = true;
      requestReplay = undefined;
      requestManualRecord = undefined;
      resolve(token === challengeRun ? choice : "cancel");
    };
    requestReplay = () => finish("replay");
    requestManualRecord = () => finish("record");
  });

  const waitForSavedChoice = (token: number) => new Promise<boolean>((resolve) => {
    let settled = false;
    let timer: number | undefined;
    let interval: number | undefined;
    const deadline = performance.now() + PARTY_TIMING.afterSavedMs;
    const update = () => setChallengeCountdown(Math.max(1, Math.ceil((deadline - performance.now()) / 1_000)));
    const finish = (redo: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      requestSavedRedo = undefined;
      requestSavedNext = undefined;
      setChallengeCountdown(undefined);
      resolve(redo && token === challengeRun);
    };
    requestSavedRedo = () => finish(true);
    requestSavedNext = () => finish(false);
    if (settings().controlMode === "manual") return;
    update();
    interval = window.setInterval(update, 100);
    timer = window.setTimeout(() => finish(false), PARTY_TIMING.afterSavedMs);
  });

  const waitForMissedRetry = (token: number) => new Promise<boolean>((resolve) => {
    requestMissedRetry = () => {
      requestMissedRetry = undefined;
      resolve(token === challengeRun);
    };
  });

  const runChallenge = async () => {
    const token = ++challengeRun;
    setAttempts([]);
    setChallengeIndex(0);
    setStage("challenge");
    setChallengeStatus("starting");
    await waitWithCountdown(PARTY_TIMING.firstListenLeadInMs, token);
    let index = 0;

    try {
      while (index < challengeClips().length && token === challengeRun) {
        const clip = challengeClips()[index];
        setChallengeIndex(index);
        setRedoRequested(false);
        setExtraListen(false);

        for (let repeat = 0; repeat < settings().repeats; repeat += 1) {
          setChallengeRepeat(repeat + 1);
          setChallengeStatus("playing");
          await engine.play(clip);
          if (repeat + 1 < settings().repeats) {
            setChallengeStatus("between");
            await waitWithCountdown(PARTY_TIMING.betweenRepeatsMs, token);
          }
        }

        let ambientLevels: number[] = [];
        while (token === challengeRun) {
          setChallengeStatus("ready");
          if (settings().controlMode === "auto") {
            const choice = await waitForReplayChoice(token);
            if (!choice.replay) {
              ambientLevels = choice.ambientLevels;
              break;
            }
          } else {
            const choice = await waitForManualReadyChoice(token);
            if (choice === "cancel") return;
            if (choice === "record") break;
          }
          setExtraListen(true);
          setChallengeStatus("playing");
          await engine.play(clip);
          setExtraListen(false);
        }
        if (token !== challengeRun) return;
        if (!demoMode()) await engine.beep(820, 110);
        const captured = settings().controlMode === "auto"
          ? await captureAutomaticAttempt(token, clip, ambientLevels)
          : await captureManualAttempt(token, clip);
        if (!captured || token !== challengeRun) return;
        if (redoRequested()) {
          setAttempts((current) => current.slice(0, index));
          continue;
        }
        if (!captured.voiceDetected) {
          setChallengeStatus("missed");
          if (!await waitForMissedRetry(token)) return;
          continue;
        }
        const attempt = captured.clip;
        const nextAttempts = attempts().slice(0, index);
        nextAttempts[index] = attempt;
        setAttempts(nextAttempts);
        setChallengeStatus("saved");
        const redo = await waitForSavedChoice(token);
        if (token !== challengeRun) return;
        if (redo) {
          setAttempts((current) => current.slice(0, index));
          continue;
        }
        index += 1;
      }

      if (token === challengeRun) setStage("reveal");
    } catch {
      if (token === challengeRun) {
        setError(t("error.recording"));
        setStage("handoff");
      }
    }
  };

  const cancelRound = async () => {
    challengeRun += 1;
    stopCurrentAttempt?.();
    startCurrentAttempt = undefined;
    requestReplay?.();
    requestManualRecord?.();
    requestSavedRedo?.();
    requestSavedNext?.();
    requestMissedRetry?.();
    engine.stopPlayback();
    if (sourceRecording()) {
      window.clearInterval(sourceTimer);
      setSourceRecording(false);
      try {
        await engine.stopRecording();
      } catch {
        // Returning home is still safe if the recorder already stopped.
      }
    }
    setStage("home");
    setSourceClip(undefined);
    setBoundaries([]);
    setAttempts([]);
    setError("");
  };

  return (
    <div class="app-shell">
      <div class="ambient ambient--one" />
      <div class="ambient ambient--two" />

      <header class="topbar">
        <button class="brand" type="button" onClick={() => void cancelRound()} aria-label={t("app.backHome")}>
          <span class="brand__mark">↶</span>
          <span>{t("app.name")}</span>
        </button>
        <Show when={stage() === "home" || stage() === "edit"}>
          <div class="topbar__actions">
            <div class="language-switcher" role="group" aria-label={t("app.language")}>
              <button classList={{ active: locale() === "ru" }} onClick={() => setLocale("ru")}>RU</button>
              <button classList={{ active: locale() === "en" }} onClick={() => setLocale("en")}>EN</button>
            </div>
            <button
              class="button button--small button--ghost"
              type="button"
              onClick={() => {
                setSetupPurpose("settings");
                setSetupOpen(true);
              }}
            >
              ⚙ {t("app.settings")}
            </button>
          </div>
        </Show>
        <Show when={stage() === "challenge"}>
          <button class="button button--ghost topbar__round-exit" type="button" onClick={() => void cancelRound()}>
            {t("challenge.cancel")}
          </button>
        </Show>
      </header>

      <main class="main-content">
        <Switch>
          <Match when={stage() === "home"}>
            <section class="lobby" data-testid="home-screen">
              <div class="lobby__panel">
                <h1>{t("home.titleTop")}</h1>
                <p class="lobby__description">{t("home.description")}</p>
                <div classList={{ "lobby__sound": true, "lobby__sound--ready": micReady() }}>
                  <span>●</span>
                  {micReady() ? t("home.soundReady") : t("home.soundMissing")}
                </div>
                <div class="lobby__actions">
                  <button class="button button--primary party-button" onClick={beginRound}>{t("home.start")} <span>→</span></button>
                  <button class="button button--ghost party-button" onClick={loadDemo}>{t("home.demo")}</button>
                </div>
                <Show when={installPrompt() && !installed()}>
                  <button class="install-button" type="button" onClick={() => void installApp()}>↓ {t("app.install")}</button>
                </Show>
              </div>
              <div class="hero__visual" aria-hidden="true">
                <div class="vinyl vinyl--back"><span>Ж</span></div>
                <div class="vinyl vinyl--front"><span>А</span></div>
                <div class="reverse-arrow">↶</div>
              </div>
            </section>
          </Match>

          <Match when={stage() === "source"}>
            <section class="party-stage source-stage" data-testid="source-screen">
              <div class="party-stage__heading">
                <div>
                  <p class="party-stage__kicker">{t("record.playerOne")}</p>
                  <h1>{t("record.title")}</h1>
                </div>
                <aside class="secret-tip">🙉 {t("record.secretTip")}</aside>
              </div>
              <div class="source-wave-panel">
                <LiveWaveform values={liveWaveform()} active={sourceRecording()} />
              </div>
              <div class="source-dock">
                <div class="source-dock__status">
                  <span classList={{ "source-dock__dot": true, "source-dock__dot--active": sourceRecording() }} />
                  <div>
                    <span>{sourceRecording() ? t("record.listening") : t("record.ready")}</span>
                    <strong>{formatClock(recordSeconds())}</strong>
                  </div>
                </div>
                <button
                  classList={{ "button": true, "button--primary": !sourceRecording(), "button--secondary": sourceRecording(), "party-button": true }}
                  aria-label={sourceRecording() ? t("record.stop") : t("record.start")}
                  onClick={() => sourceRecording() ? void stopSourceRecording() : startSourceRecording()}
                >
                  {sourceRecording() ? `■ ${t("record.stop")}` : `● ${t("record.start")}`}
                </button>
              </div>
              <Show when={error()}><p class="error-message">{error()}</p></Show>
            </section>
          </Match>

          <Match when={stage() === "edit" && sourceClip()}>
            {(clip) => (
              <section class="stage stage--wide edit-stage" data-testid="edit-screen">
                <div class="stage-heading">
                  <div>
                    <h1>{t("edit.title")}</h1>
                  </div>
                  <p>{t("edit.chunkCount", {
                    count: Math.max(0, boundaries().length - 1),
                    duration: (clip().samples.length / clip().sampleRate).toFixed(1),
                  })}</p>
                </div>
                <p class="stage__hint stage__hint--left">{t("edit.hint")}</p>
                <WaveformEditor clip={clip()} boundaries={boundaries()} onChange={setBoundaries} onPlay={playEditorChunk} />
                <div class="stage-actions stage-actions--end">
                  <button class="button button--ghost party-button" onClick={splitAgain}>↻ {t("edit.auto")}</button>
                  <button class="button button--primary party-button" onClick={() => setStage("handoff")}>{t("edit.accept")} <span>→</span></button>
                </div>
              </section>
            )}
          </Match>

          <Match when={stage() === "handoff"}>
            <section class="stage stage--center handoff party-handoff" data-testid="handoff-screen">
              <p class="mode-pill">{settings().controlMode === "auto" ? t("setup.modeAuto") : t("setup.modeManual")}</p>
              <div class="handoff__icon" aria-hidden="true">🎤<span>→</span></div>
              <h1>{t("handoff.inviteBack")}</h1>
              <p class="stage__hint">{t("handoff.description")}</p>
              <button class="button button--primary party-button" onClick={() => void runChallenge()}>{t("handoff.start")} <span>→</span></button>
            </section>
          </Match>

          <Match when={stage() === "challenge"}>
            <section class="challenge-screen" data-testid="challenge-screen">
              <div class="challenge-scoreboard">
                <div class="challenge-scoreboard__count">
                  <span>{t("challenge.fragment")}</span>
                  <strong>{challengeIndex() + 1} / {challengeClips().length}</strong>
                </div>
                <div class="challenge-scoreboard__track" role="progressbar" aria-valuemin="1" aria-valuemax={challengeClips().length} aria-valuenow={challengeIndex() + 1}>
                  <For each={challengeClips()}>
                    {(_, index) => (
                      <span classList={{ complete: index() < challengeIndex(), current: index() === challengeIndex() }} />
                    )}
                  </For>
                </div>
                <div class="mode-pill mode-pill--score">
                  {settings().controlMode === "auto" ? t("setup.modeAuto") : t("setup.modeManual")}
                </div>
              </div>

              <div class="challenge-screen__visual">
                <Show
                  when={challengeStatus() === "waiting" || challengeStatus() === "recording"}
                  fallback={
                    <div classList={{ "challenge-orb": true, [`challenge-orb--${challengeStatus()}`]: true }}>
                      <Show when={challengeStatus() === "starting"}>{challengeCountdown() ?? 1}</Show>
                      <Show when={challengeStatus() === "playing"}>◖</Show>
                      <Show when={challengeStatus() === "between"}>{challengeCountdown() ?? 1}</Show>
                      <Show when={challengeStatus() === "ready"}>
                        {settings().controlMode === "auto" ? challengeCountdown() ?? 1 : "●"}
                      </Show>
                      <Show when={challengeStatus() === "saved"}>✓</Show>
                      <Show when={challengeStatus() === "missed"}>?</Show>
                    </div>
                  }
                >
                  <div class="challenge-live-wave">
                    <LiveWaveform values={liveWaveform()} active={challengeStatus() === "recording"} tone="mint" />
                  </div>
                </Show>
              </div>

              <div class="challenge-screen__command" aria-live="polite">
                <p class="challenge-screen__phase">
                  <Switch>
                    <Match when={["starting", "playing", "between"].includes(challengeStatus())}>{t("challenge.phaseListen")}</Match>
                    <Match when={challengeStatus() === "ready"}>{t("challenge.phaseReady")}</Match>
                    <Match when={challengeStatus() === "waiting" || challengeStatus() === "recording"}>{t("challenge.phaseSing")}</Match>
                    <Match when={challengeStatus() === "saved"}>{t("challenge.phaseSaved")}</Match>
                    <Match when={challengeStatus() === "missed"}>{t("challenge.phaseRetry")}</Match>
                  </Switch>
                </p>
                <h1>
                  <Switch>
                    <Match when={challengeStatus() === "starting"}>{t("challenge.getReadyListen")}</Match>
                    <Match when={challengeStatus() === "playing"}>
                      {extraListen()
                        ? t("challenge.listenExtra")
                        : t("challenge.listenRepeat", { current: challengeRepeat(), total: settings().repeats })}
                    </Match>
                    <Match when={challengeStatus() === "between"}>{t("challenge.betweenRepeats")}</Match>
                    <Match when={challengeStatus() === "ready"}>
                      {settings().controlMode === "auto" ? t("challenge.repeatSoon") : t("challenge.manualReady")}
                    </Match>
                    <Match when={challengeStatus() === "waiting"}>{t("challenge.waitVoice")}</Match>
                    <Match when={challengeStatus() === "recording"}>{t("challenge.recording")}</Match>
                    <Match when={challengeStatus() === "saved"}>{t("challenge.saved")}</Match>
                    <Match when={challengeStatus() === "missed"}>{t("challenge.missed")}</Match>
                  </Switch>
                </h1>
                <div class="challenge-screen__support">
                  <Show when={challengeStatus() === "ready" && settings().controlMode === "auto"}>{t("challenge.autoStarts")}</Show>
                  <Show when={challengeStatus() === "waiting"}>{t("challenge.autoListening")}</Show>
                  <Show when={challengeStatus() === "saved" && settings().controlMode === "auto" && challengeCountdown()}>
                    {t("challenge.nextSoon", { seconds: challengeCountdown()! })}
                  </Show>
                  <Show when={challengeStatus() === "saved" && settings().controlMode === "manual"}>{t("challenge.manualSaved")}</Show>
                </div>
              </div>

              <div class="challenge-screen__controls">
                <Show when={challengeStatus() === "ready"}>
                  <button class="button button--secondary party-button" onClick={() => requestReplay?.()}>↶ {t("challenge.listenAgain")}</button>
                  <Show when={settings().controlMode === "manual"}>
                    <button class="button button--primary party-button" onClick={() => requestManualRecord?.()}>● {t("challenge.startRecording")}</button>
                  </Show>
                </Show>
                <Show when={challengeStatus() === "waiting"}>
                  <button class="button button--secondary party-button" onClick={() => startCurrentAttempt?.()}>{t("challenge.startManual")}</button>
                </Show>
                <Show when={challengeStatus() === "recording"}>
                  <button class="button button--secondary party-button" onClick={() => stopCurrentAttempt?.()}>■ {t("challenge.stop")}</button>
                  <button
                    class="button button--ghost party-button"
                    onClick={() => {
                      setRedoRequested(true);
                      stopCurrentAttempt?.();
                    }}
                  >
                    ↶ {t("challenge.discard")}
                  </button>
                </Show>
                <Show when={challengeStatus() === "saved"}>
                  <button class="button button--secondary party-button" onClick={() => requestSavedRedo?.()}>↶ {t("challenge.redo")}</button>
                  <Show when={settings().controlMode === "manual"}>
                    <button class="button button--primary party-button" onClick={() => requestSavedNext?.()}>{t("challenge.next")} →</button>
                  </Show>
                </Show>
                <Show when={challengeStatus() === "missed"}>
                  <button class="button button--primary party-button" onClick={() => requestMissedRetry?.()}>↻ {t("challenge.tryAgain")}</button>
                </Show>
              </div>
            </section>
          </Match>

          <Match when={stage() === "reveal"}>
            <section class="stage stage--center reveal" data-testid="reveal-screen">
              <p class="eyebrow">{t("reveal.eyebrow")}</p>
              <div class="reveal__burst" aria-hidden="true"><span>↶</span></div>
              <h1>{t("reveal.title")}</h1>
              <p class="stage__hint">{t("reveal.description")}</p>
              <div class="reveal__actions">
                <button class="button button--primary button--large" onClick={() => revealClip() && void engine.play(revealClip()!)}>▶ {t("reveal.playResult")}</button>
                <button class="button button--ghost" onClick={() => sourceClip() && void engine.play(sourceClip()!)}>▶ {t("reveal.playOriginal")}</button>
              </div>
              <button class="button button--quiet" onClick={() => void cancelRound()}>↻ {t("reveal.newRound")}</button>
            </section>
          </Match>
        </Switch>
      </main>

      <SetupDialog
        open={setupOpen()}
        purpose={setupPurpose()}
        busy={setupBusy()}
        ready={micReady()}
        deviceDirty={setupDeviceDirty()}
        error={error()}
        devices={devices()}
        selectedDevice={selectedDevice()}
        settings={settings()}
        level={level()}
        onClose={() => setSetupOpen(false)}
        onDone={finishSetup}
        onConnect={() => void connectMicrophone()}
        onDeviceChange={(deviceId) => {
          setSelectedDevice(deviceId);
          setSetupDeviceDirty(true);
        }}
        onSettingsChange={setSettings}
      />
    </div>
  );
}
