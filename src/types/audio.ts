export interface AudioClip {
  samples: Float32Array;
  sampleRate: number;
}

export type ChannelMode = "mix" | "left" | "right";
export type ControlMode = "auto" | "manual";

export interface GameSettings {
  channelMode: ChannelMode;
  controlMode: ControlMode;
  targetChunkSeconds: number;
  repeats: 1 | 2;
  voiceThresholdDb: number;
  silenceMs: number;
}

export interface AudioDeviceChoice {
  deviceId: string;
  label: string;
}
