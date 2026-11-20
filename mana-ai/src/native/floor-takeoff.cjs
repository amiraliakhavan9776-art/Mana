"use strict";
// Deterministic synthetic rectangular geometry only. Not pricing, a measured
// quantity certification, or a construction decision. All external values are
// explicit SI decimal strings; no binary floating-point or implicit rounding.
const SCALE = 1000000n;
const AREA_SCALE = SCALE * SCALE;
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function fixed(value, maximum) {
  // Bound before regex/BigInt. Canonical syntax excludes exponent, separators,
  // signs, leading zeros, whitespace, units, and more than six decimal places.
  if (typeof value !== "string" || value.length > 12 || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})$|^(?:0|[1-9][0-9]*)$/.test(value)) fail("INVALID_DECIMAL");
  const [whole, fraction = ""] = value.split(".");
  const n = BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0"));
  if (n > maximum * SCALE) fail("OUT_OF_RANGE");
  return n;
}
function decimal(n, places) {
  const scale = 10n ** BigInt(places);
  const whole = n / scale;
  const fraction = (n % scale).toString().padStart(places, "0").replace(/0+$/, "");
  return whole.toString() + (fraction ? "." + fraction : "");
}
function calculateFloorTakeoff(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail("INVALID_INPUT");
  const keys = Reflect.ownKeys(input);
  const expected = ["length_m", "width_m", "excluded_area_m2"];
  if (keys.length !== 3 || !expected.every(k => keys.includes(k))) fail("INVALID_INPUT");
  // Reject accessors rather than evaluating caller-supplied getters.
  const values = expected.map(k => { const d = Object.getOwnPropertyDescriptor(input,k); if (!d || !("value" in d) || !d.enumerable) fail("INVALID_INPUT"); return d.value; });
  const length = fixed(values[0], 100n), width = fixed(values[1], 100n), excluded = fixed(values[2], 10000n);
  const gross = length * width;
  const excludedArea = excluded * SCALE;
  const difference = gross - excludedArea;
  return Object.freeze({
    schema: "MANA_RECTANGULAR_FLOOR_TAKEOFF_V1",
    unit: "m2",
    gross_area_m2: decimal(gross, 12),
    excluded_area_m2: decimal(excludedArea, 12),
    net_area_m2: decimal(difference < 0n ? 0n : difference, 12),
    clamped: difference < 0n,
    scope: "synthetic_rectangle_nonpricing",
    modelCalls: 0
  });
}
module.exports = {calculateFloorTakeoff};
