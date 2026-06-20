export interface ColorInfo {
  primary: [number, number, number]; // RGB 0-1
  palette: Record<string, [number, number, number]>;
}

const COLOR_MAP: Record<string, [number, number, number]> = {
  black: [0.1, 0.1, 0.1],
  white: [1, 1, 1],
  gray: [0.5, 0.5, 0.5],
  grey: [0.5, 0.5, 0.5],
  silver: [0.75, 0.75, 0.75],
  red: [1, 0, 0],
  green: [0, 0.8, 0],
  blue: [0, 0.3, 1],
  yellow: [1, 1, 0],
  cyan: [0, 1, 1],
  magenta: [1, 0, 1],
  orange: [1, 0.647, 0],
  purple: [0.627, 0.125, 0.941],
  brown: [0.647, 0.165, 0.165],
  gold: [1, 0.843, 0],
  chrome: [0.85, 0.85, 0.9],
};

const DEFAULT_PRIMARY: [number, number, number] = [0.39, 0.4, 0.45]; // slate gray

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Normalize an RGB triple. OpenSCAD accepts both 0-1 floats and 0-255 ints.
 * If any component is > 1 we assume 0-255 range and divide.
 */
function normalizeRGB(r: number, g: number, b: number): [number, number, number] {
  const scale = r > 1 || g > 1 || b > 1 ? 255 : 1;
  return [clamp01(r / scale), clamp01(g / scale), clamp01(b / scale)];
}

export function extractColorsFromOpenSCAD(code: string): ColorInfo {
  const palette: Record<string, [number, number, number]> = {};
  let primary: [number, number, number] | null = null;

  if (!code) {
    return { primary: DEFAULT_PRIMARY, palette };
  }

  // Pattern 1: color_map array definition, e.g.
  //   color_map = [[1,0,0], [0,1,0]];  or  colors = ["red", "blue"];
  const colorMapMatch = code.match(/(?:color_map|colors|palette)\s*=\s*\[([\s\S]*?)\]\s*;/i);
  if (colorMapMatch) {
    const body = colorMapMatch[1];
    // numeric triples inside the array
    const tripleRe = /\[\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/g;
    let tm: RegExpExecArray | null;
    let idx = 0;
    while ((tm = tripleRe.exec(body)) !== null) {
      const rgb = normalizeRGB(parseFloat(tm[1]), parseFloat(tm[2]), parseFloat(tm[3]));
      palette[`map_${idx}`] = rgb;
      if (!primary) primary = rgb;
      idx++;
    }
    // named colors inside the array
    const nameRe = /"([a-zA-Z]+)"/g;
    let nm: RegExpExecArray | null;
    while ((nm = nameRe.exec(body)) !== null) {
      const name = nm[1].toLowerCase();
      if (COLOR_MAP[name]) {
        palette[name] = COLOR_MAP[name];
        if (!primary) primary = COLOR_MAP[name];
      }
    }
  }

  // Pattern 2: color([r,g,b]) or color([r,g,b,a]) statements
  const rgbRe = /color\s*\(\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\]/g;
  let m: RegExpExecArray | null;
  let rgbIdx = 0;
  while ((m = rgbRe.exec(code)) !== null) {
    const rgb = normalizeRGB(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    palette[`rgb_${rgbIdx}`] = rgb;
    if (!primary) primary = rgb;
    rgbIdx++;
  }

  // Pattern 3: color("name") statements
  const nameStmtRe = /color\s*\(\s*"([a-zA-Z]+)"/g;
  while ((m = nameStmtRe.exec(code)) !== null) {
    const name = m[1].toLowerCase();
    const rgb = COLOR_MAP[name];
    if (rgb) {
      palette[name] = rgb;
      if (!primary) primary = rgb;
    }
  }

  return {
    primary: primary || DEFAULT_PRIMARY,
    palette,
  };
}
