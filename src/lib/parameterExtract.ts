export interface ScadParameter {
  name: string;
  value: number;
  min: number;
  step: number;
  max: number;
  label: string;
}

function toLabel(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Extract adjustable parameters from OpenSCAD customizer comments.
 * Supports:
 *   width = 80; // [50:5:150]   (min:step:max)
 *   width = 80; // [50:150]      (min:max, step inferred)
 * Skips reserved special variables (those beginning with `$`, e.g. $fn).
 */
export function extractParametersFromOpenSCAD(code: string): ScadParameter[] {
  const params: ScadParameter[] = [];
  const seen = new Set<string>();

  if (!code) return params;

  const lines = code.split('\n');
  // name = value ; // [a:b:c]  OR  [a:b]
  const lineRe =
    /^\s*(\$?\w+)\s*=\s*(-?[\d.]+)\s*;\s*\/\/\s*\[\s*(-?[\d.]+)\s*(?::\s*(-?[\d.]+)\s*)?(?::\s*(-?[\d.]+)\s*)?\]/;

  for (const line of lines) {
    const m = line.match(lineRe);
    if (!m) continue;

    const name = m[1];
    if (name.startsWith('$')) continue; // skip $fn etc.
    if (seen.has(name)) continue;

    const value = parseFloat(m[2]);
    const a = parseFloat(m[3]);
    const b = m[4] !== undefined ? parseFloat(m[4]) : undefined;
    const c = m[5] !== undefined ? parseFloat(m[5]) : undefined;

    let min: number;
    let step: number;
    let max: number;

    if (b !== undefined && c !== undefined) {
      // [min:step:max]
      min = a;
      step = b;
      max = c;
    } else if (b !== undefined) {
      // [min:max]
      min = a;
      max = b;
      step = inferStep(min, max, value);
    } else {
      // [max] only — treat as 0..max
      min = 0;
      max = a;
      step = inferStep(min, max, value);
    }

    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) continue;
    if (!Number.isFinite(step) || step <= 0) step = inferStep(min, max, value);

    seen.add(name);
    params.push({
      name,
      value: Number.isFinite(value) ? value : min,
      min,
      step,
      max,
      label: toLabel(name),
    });
  }

  return params;
}

function inferStep(min: number, max: number, value: number): number {
  const range = max - min;
  // If the default has decimals, use a fine step; otherwise integer-ish step.
  const hasDecimals = !Number.isInteger(value) || !Number.isInteger(min) || !Number.isInteger(max);
  if (hasDecimals) return Math.max(range / 100, 0.1);
  return Math.max(Math.round(range / 50) || 1, 1);
}

/**
 * Replace `name = oldValue;` with `name = newValue;` preserving any trailing
 * customizer comment. Only the first assignment of the variable is updated.
 */
export function updateParameterInCode(code: string, name: string, value: number): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match: <indent>name = <number> ;   (keep everything after the `;`)
  const re = new RegExp(`(^\\s*${escaped}\\s*=\\s*)(-?[\\d.]+)(\\s*;)`, 'm');
  if (!re.test(code)) return code;
  return code.replace(re, `$1${value}$3`);
}
