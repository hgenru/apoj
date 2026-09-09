import type { Component } from "solid-js";
import { t } from "../i18n";

interface LevelMeterProps {
  level: number;
  compact?: boolean;
}

export const LevelMeter: Component<LevelMeterProps> = (props) => {
  const percent = () => Math.min(100, Math.max(1.5, Math.sqrt(props.level) * 190));
  const state = () => (props.level > 0.7 ? "hot" : props.level > 0.012 ? "good" : "quiet");
  return (
    <div class={`level-meter ${props.compact ? "level-meter--compact" : ""}`} aria-label={t("meter.label")}>
      <div class={`level-meter__fill level-meter__fill--${state()}`} style={{ width: `${percent()}%` }} />
    </div>
  );
};
