import { describe, expect, it } from "vitest";
import { thresholdFromVoiceLevels } from "./calibration";

describe("voice threshold calibration", () => {
  it("places the gate below a measured singing voice", () => {
    expect(thresholdFromVoiceLevels([0.08, 0.1, 0.12, 0.14, 0.16])).toBe(-29);
  });

  it("ignores invalid samples and clamps very quiet input", () => {
    expect(thresholdFromVoiceLevels([0, Number.NaN, 0.0001])).toBeUndefined();
  });

  it("does not allow an unsafe high threshold", () => {
    expect(thresholdFromVoiceLevels([0.8, 0.9, 1])).toBe(-28);
  });
});
