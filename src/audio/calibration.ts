const MIN_THRESHOLD_DB = -55;
const MAX_THRESHOLD_DB = -28;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Places the minimum gate comfortably below a normal singing level. The live
 * room calibration still raises the gate when party noise is louder.
 */
export function thresholdFromVoiceLevels(levels: number[]) {
  const usable = levels.filter((level) => Number.isFinite(level) && level > 0.00001).sort((a, b) => a - b);
  if (usable.length === 0) return undefined;
  const voiceLevel = usable[Math.floor((usable.length - 1) * 0.8)];
  if (voiceLevel < 0.001) return undefined;
  const voiceDb = 20 * Math.log10(voiceLevel);
  return clamp(Math.round(voiceDb - 12), MIN_THRESHOLD_DB, MAX_THRESHOLD_DB);
}
