export interface AudioClip {
  samples: Float32Array;
  sampleRate: number;
}

export type ChannelMode = "mix" | "left" | "right";

export interface GameSettings {
  channelMode: ChannelMode;
  targetChunkSeconds: number;
  repeats: 1 | 2;
  voiceThresholdDb: number;
  silenceMs: number;
}

export interface AudioDeviceChoice {
  deviceId: string;
  label: string;
}
