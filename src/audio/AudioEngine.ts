import type { AudioClip, AudioDeviceChoice, ChannelMode } from "../types/audio";

type StopResolver = (clip: AudioClip) => void;

export class AudioEngine {
  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private recorder?: AudioWorkletNode;
  private analyser?: AnalyserNode;
  private silentGain?: GainNode;
  private levelBuffer = new Float32Array(1024);
  private stopResolver?: StopResolver;
  private activePlayback?: AudioBufferSourceNode;
  private activePlaybackResolve?: () => void;
  private workletLoaded = false;

  get ready() {
    return Boolean(this.context && this.stream && this.recorder);
  }

  get sampleRate() {
    return this.context?.sampleRate ?? 48_000;
  }

  async initialize(deviceId: string | undefined, channelMode: ChannelMode): Promise<AudioDeviceChoice[]> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("audio-unsupported");
    }

    await this.disposeInput();
    const audio: MediaTrackConstraints = {
      channelCount: { ideal: 2 },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    this.context ??= new AudioContext({ latencyHint: "interactive" });
    if (this.context.state === "suspended") await this.context.resume();
    if (!this.workletLoaded) {
      await this.context.audioWorklet.addModule("/pcm-recorder.worklet.js");
      this.workletLoaded = true;
    }

    this.source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;
    this.levelBuffer = new Float32Array(this.analyser.fftSize);

    this.recorder = new AudioWorkletNode(this.context, "pcm-recorder", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.recorder.port.onmessage = (event: MessageEvent<{ type: string; samples?: Float32Array }>) => {
      if (event.data.type !== "stopped" || !event.data.samples || !this.stopResolver) return;
      const resolve = this.stopResolver;
      this.stopResolver = undefined;
      resolve({ samples: event.data.samples, sampleRate: this.sampleRate });
    };
    this.setChannelMode(channelMode);

    this.silentGain = this.context.createGain();
    this.silentGain.gain.value = 0;
    this.source.connect(this.analyser);
    this.source.connect(this.recorder);
    this.recorder.connect(this.silentGain).connect(this.context.destination);
    return this.listInputs();
  }

  async listInputs(): Promise<AudioDeviceChoice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    let unnamed = 1;
    return devices
      .filter((device) => device.kind === "audioinput")
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label || `Аудиовход ${unnamed++}`,
      }));
  }

  setChannelMode(channelMode: ChannelMode) {
    this.recorder?.port.postMessage({ type: "configure", channelMode });
  }

  async resume() {
    if (this.context?.state === "suspended") await this.context.resume();
  }

  startRecording() {
    if (!this.recorder || this.stopResolver) throw new Error("recording-unavailable");
    this.recorder.port.postMessage({ type: "start" });
  }

  stopRecording(): Promise<AudioClip> {
    if (!this.recorder) return Promise.reject(new Error("recording-unavailable"));
    if (this.stopResolver) return Promise.reject(new Error("recording-stopping"));
    return new Promise<AudioClip>((resolve) => {
      this.stopResolver = resolve;
      this.recorder?.port.postMessage({ type: "stop" });
    });
  }

  getLevel(): number {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuffer);
    let sum = 0;
    for (const value of this.levelBuffer) sum += value * value;
    return Math.sqrt(sum / this.levelBuffer.length);
  }

  async play(clip: AudioClip): Promise<void> {
    if (clip.samples.length === 0) return;
    this.context ??= new AudioContext({ latencyHint: "interactive" });
    await this.resume();
    this.stopPlayback();
    const buffer = this.context.createBuffer(1, clip.samples.length, clip.sampleRate);
    buffer.getChannelData(0).set(clip.samples);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    this.activePlayback = source;
    await new Promise<void>((resolve) => {
      source.onended = () => {
        if (this.activePlayback === source) this.activePlayback = undefined;
        this.activePlaybackResolve = undefined;
        resolve();
      };
      this.activePlaybackResolve = resolve;
      source.start();
    });
  }

  stopPlayback() {
    if (!this.activePlayback) return;
    const resolve = this.activePlaybackResolve;
    this.activePlayback.onended = null;
    try {
      this.activePlayback.stop();
    } catch {
      // The source may already have ended between frames.
    }
    this.activePlayback.disconnect();
    this.activePlayback = undefined;
    this.activePlaybackResolve = undefined;
    resolve?.();
  }

  async beep(frequency = 660, durationMs = 100) {
    this.context ??= new AudioContext({ latencyHint: "interactive" });
    await this.resume();
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.13, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + durationMs / 1000 + 0.02);
    await new Promise((resolve) => window.setTimeout(resolve, durationMs + 25));
  }

  private async disposeInput() {
    this.source?.disconnect();
    this.recorder?.disconnect();
    this.analyser?.disconnect();
    this.silentGain?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.source = undefined;
    this.recorder = undefined;
    this.analyser = undefined;
    this.silentGain = undefined;
    this.stream = undefined;
    this.stopResolver = undefined;
  }

  async dispose() {
    this.stopPlayback();
    await this.disposeInput();
    await this.context?.close();
    this.context = undefined;
    this.workletLoaded = false;
  }
}
