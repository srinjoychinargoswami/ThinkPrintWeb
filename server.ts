import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import dotenv from "dotenv";
import * as zlib from "zlib";
import * as THREE from "three";

dotenv.config({ path: ".env.local" });

const app = express();
const PORT = 3000;
const DESIGNS_DIR = path.join(process.cwd(), "data", "designs");

if (!fs.existsSync(DESIGNS_DIR)) {
  fs.mkdirSync(DESIGNS_DIR, { recursive: true });
}

app.use(express.json({ limit: "15mb" }));

const XAI_API_KEY = process.env.XAI_API_KEY;
const GROK_API_URL = "https://api.x.ai/v1/chat/completions";

if (!XAI_API_KEY) {
  console.warn("WARNING: XAI_API_KEY is not defined. Falling back to offline template generation.");
}

// ── Polyslice slicer singleton ────────────────────────────────────────────────
// Lazy-loaded so the heavy Three.js-based module doesn't block startup.
let _polyslice: any = null;
let _PolysliceClass: any = null;
let _PrinterClass: any = null;
let _FilamentClass: any = null;

async function getPolyslice(): Promise<any> {
  if (_polyslice) return _polyslice;
  try {
    const mod = await import("@jgphilpott/polyslice");
    // CJS default export wraps the named exports
    const exports = mod.default ?? mod;
    _PolysliceClass = exports.Polyslice;
    _PrinterClass   = exports.Printer;
    _FilamentClass  = exports.Filament;
    const printer  = new _PrinterClass("Ender3");
    const filament = new _FilamentClass("GenericPLA");
    _polyslice = new _PolysliceClass({
      printer,
      filament,
      infillPattern:  "triangles",
      infillDensity:  20,
      verbose: false,
    });
    console.log("[Polyslice] Module ready");
    return _polyslice;
  } catch (err: any) {
    throw new Error(`Polyslice failed to load: ${err?.message || String(err)}`);
  }
}

// Pre-warm the module at startup so the first slice request isn't slow
getPolyslice().catch((e) => console.warn("[Polyslice] Pre-warm failed:", e?.message || String(e)));

// ── Designs CRUD ─────────────────────────────────────────────────────────────

app.get("/api/designs", (req, res) => {
  try {
    const files = fs.readdirSync(DESIGNS_DIR);
    const designs = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(DESIGNS_DIR, f), "utf-8")); }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(designs);
  } catch (error: any) {
    console.error("[/api/designs GET] Error:", error?.message || String(error) || "Unknown error");
    res.status(500).json({ error: "Failed to load designs: " + (error?.message || String(error)) });
  }
});

app.post("/api/designs/save", (req, res) => {
  try {
    const design = req.body;
    if (!design?.openscad) { res.status(400).json({ error: "Invalid design object" }); return; }
    const designId = design.id || `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const saved = { ...design, id: designId, createdAt: design.createdAt || new Date().toISOString() };
    fs.writeFileSync(path.join(DESIGNS_DIR, `${designId}.json`), JSON.stringify(saved, null, 2), "utf-8");
    res.json(saved);
  } catch (error: any) {
    console.error("[/api/designs/save] Error:", error?.message || String(error) || "Unknown error");
    res.status(500).json({ error: "Failed to save design: " + (error?.message || String(error)) });
  }
});

app.delete("/api/designs/:id", (req, res) => {
  try {
    const filePath = path.join(DESIGNS_DIR, `${req.params.id}.json`);
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); res.json({ success: true }); }
    else res.status(404).json({ error: "Design not found" });
  } catch (error: any) {
    console.error("[/api/designs DELETE] Error:", error?.message || String(error) || "Unknown error");
    res.status(500).json({ error: "Failed to delete design: " + (error?.message || String(error)) });
  }
});

// ── Grok code generation ──────────────────────────────────────────────────────

app.post("/api/designs/generate", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) { res.status(400).json({ error: "Prompt is required" }); return; }
  if (!XAI_API_KEY) {
    res.status(500).json({ error: "XAI_API_KEY is not configured. Please set it in your .env.local file." });
    return;
  }

  const systemInstruction = `You are ThinkPrint, an expert parametric CAD developer translating natural language requests into production-ready 3D printable designs.
Your task is to take a request, design a highly functional 3D printable object, and write clean, fully parametric OpenSCAD scripts.

You MUST follow these rules:
1. Always output ONLY valid OpenSCAD code. NO MARKDOWN FENCES. NO EXPLANATIONS.
2. Include adjustable top-level variables with customizer syntax:
   - e.g., width = 80; // [50:5:150] (variable = value; // [min:step:max])
3. Create realistic, useful 3D printable designs (brackets, watches, organizers, stands, boxes, gears).
4. Always include $fn = 60; for smooth circles.
5. Use color() statements for multi-color designs when appropriate.
6. Ensure all geometry is within reasonable bounds (±100 units).

OUTPUT ONLY THE OPENSCAD CODE. NO OTHER TEXT.`;

  try {
    console.log("[ThinkPrint CAD API] Generating design with Grok...");
    const response = await axios.post(
      GROK_API_URL,
      { model: "grok-3", messages: [{ role: "system", content: systemInstruction }, { role: "user", content: `Design and generate OpenSCAD code for: ${prompt}` }], temperature: 0.3, max_tokens: 2048 },
      { headers: { Authorization: `Bearer ${XAI_API_KEY}`, "Content-Type": "application/json" } }
    );

    if (!response.data?.choices?.[0]?.message?.content) throw new Error("No valid response from Grok API");

    let openscadCode = response.data.choices[0].message.content
      .replace(/^```openscad\n?/, "").replace(/^```scad\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "").trim();

    if (!openscadCode.includes("cylinder") && !openscadCode.includes("cube") && !openscadCode.includes("sphere")) {
      throw new Error("Generated code does not contain valid OpenSCAD primitives");
    }

    console.log("[ThinkPrint CAD API] Successfully generated OpenSCAD code with Grok");
    const parameters = extractParameters(openscadCode);
    const designId = `design_${Date.now()}`;
    const newDesign = { id: designId, prompt, openscad: openscadCode, parameters, createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(DESIGNS_DIR, `${designId}.json`), JSON.stringify(newDesign, null, 2), "utf-8");
    res.json(newDesign);
  } catch (error: any) {
    console.error("[/api/designs/generate] Error:", error?.message || String(error) || "Unknown error");
    res.status(500).json({ error: error?.message || "Failed to generate design with Grok API" });
  }
});

function extractParameters(code: string) {
  const parameters: any[] = [];
  const regex = /(\w+)\s*=\s*([\d.]+|true|false)\s*;\s*\/\/\s*\[([\d.]+):([\d.]+):([\d.]+)\]/g;
  let match;
  while ((match = regex.exec(code)) !== null) {
    const [, name, defaultValue, min, step, max] = match;
    parameters.push({ name, default: parseFloat(defaultValue), min: parseFloat(min), max: parseFloat(max), step: parseFloat(step), description: `Adjustable parameter: ${name}` });
  }
  return parameters;
}

// ── OpenSCAD WASM compilation ─────────────────────────────────────────────────
// FIX: Create fresh instance for EVERY compilation (don't reuse - causes memory leak)

async function executeOpenSCAD(code: string): Promise<{ buffer: Buffer; time: number }> {
  console.log("[OpenSCAD] Compiling with WASM...");
  const t0 = Date.now();
  
  try {
    // CREATE FRESH INSTANCE FOR EVERY COMPILATION (DO NOT REUSE)
    const { createOpenSCAD } = await import("openscad-wasm");
    const instance = await createOpenSCAD({
      print:    (t: string) => console.log("[openscad-wasm]", t),
      printErr: (t: string) => console.warn("[openscad-wasm stderr]", t),
    });
    
    // Render the code
    const stlString: string = await instance.renderToStl(code);
    
    if (!stlString?.length) {
      throw new Error("OpenSCAD WASM returned empty output — verify your OpenSCAD code.");
    }
    
    const buffer = Buffer.from(stlString, "binary");
    const elapsed = (Date.now() - t0) / 1000;
    console.log(`[OpenSCAD] WASM OK — ${elapsed.toFixed(2)}s, ${buffer.length} bytes`);
    return { buffer, time: elapsed };
    
  } catch (err: any) {
    throw new Error(
      `OpenSCAD compilation failed: ${err?.message || String(err)}`
    );
  }
}

// ── STL helpers ───────────────────────────────────────────────────────────────

interface STLStats { vertices: number; faces: number; }

function parseSTLStats(buf: Buffer): STLStats {
  if (buf.length < 84) return { vertices: 0, faces: 0 };
  const head = buf.slice(0, 256).toString("utf8").toLowerCase();
  if (head.startsWith("solid") && head.includes("facet")) {
    const faces = (buf.toString("utf8").match(/facet\s+normal/gi) || []).length;
    return { vertices: faces * 3, faces };
  }
  const faces = buf.readUInt32LE(80);
  const expected = 84 + faces * 50;
  if (expected > buf.length + 4 || faces <= 0) return { vertices: 0, faces: 0 };
  return { vertices: faces * 3, faces };
}

interface ParsedMesh {
  vertices: number[];
  triangles: number[];
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
}

function parseSTLMesh(buffer: Buffer): ParsedMesh {
  const vertexMap = new Map<string, number>();
  const vertices: number[] = [];
  const triangles: number[] = [];
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  const addVertex = (x: number, y: number, z: number): number => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    const existing = vertexMap.get(key);
    if (existing !== undefined) return existing;
    const idx = vertices.length / 3;
    vertices.push(x, y, z);
    vertexMap.set(key, idx);
    return idx;
  };

  const head = buffer.slice(0, 256).toString("utf8").toLowerCase();
  const isAscii = head.startsWith("solid") && head.includes("facet");

  if (isAscii) {
    const text = buffer.toString("utf8");
    const re = /vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g;
    let m: RegExpExecArray | null;
    const tri: number[] = [];
    while ((m = re.exec(text)) !== null) {
      tri.push(addVertex(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])));
      if (tri.length === 3) { triangles.push(tri[0], tri[1], tri[2]); tri.length = 0; }
    }
  } else {
    const faceCount = buffer.length >= 84 ? buffer.readUInt32LE(80) : 0;
    let offset = 84;
    for (let f = 0; f < faceCount && offset + 50 <= buffer.length; f++) {
      offset += 12;
      const idxs: number[] = [];
      for (let v = 0; v < 3; v++) {
        idxs.push(addVertex(buffer.readFloatLE(offset), buffer.readFloatLE(offset + 4), buffer.readFloatLE(offset + 8)));
        offset += 12;
      }
      offset += 2;
      triangles.push(idxs[0], idxs[1], idxs[2]);
    }
  }

  return {
    vertices,
    triangles,
    bounds: {
      minX: isFinite(minX) ? minX : 0, minY: isFinite(minY) ? minY : 0, minZ: isFinite(minZ) ? minZ : 0,
      maxX: isFinite(maxX) ? maxX : 100, maxY: isFinite(maxY) ? maxY : 100, maxZ: isFinite(maxZ) ? maxZ : 100,
    },
  };
}

// ── stlBufferToThreeGeometry ──────────────────────────────────────────────────
// Converts STL binary/ASCII buffer → THREE.BufferGeometry (non-indexed, for Polyslice)

function stlBufferToThreeGeometry(buffer: Buffer): THREE.BufferGeometry {
  const positions: number[] = [];
  const head = buffer.slice(0, 256).toString("utf8").toLowerCase();
  const isAscii = head.startsWith("solid") && head.includes("facet");

  if (isAscii) {
    const text = buffer.toString("utf8");
    const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      positions.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    }
  } else {
    const faceCount = buffer.length >= 84 ? buffer.readUInt32LE(80) : 0;
    let offset = 84;
    for (let f = 0; f < faceCount && offset + 50 <= buffer.length; f++) {
      offset += 12; // skip normal
      for (let v = 0; v < 3; v++) {
        positions.push(
          buffer.readFloatLE(offset),
          buffer.readFloatLE(offset + 4),
          buffer.readFloatLE(offset + 8)
        );
        offset += 12;
      }
      offset += 2; // attribute byte count
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}

// ── POST /api/compile-stl ─────────────────────────────────────────────────────

app.post("/api/compile-stl", async (req, res) => {
  const { code } = req.body || {};
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "OpenSCAD code is required", stl: null }); return;
  }
  try {
    const { buffer, time } = await executeOpenSCAD(code);
    const { vertices, faces } = parseSTLStats(buffer);
    res.json({ stl: buffer.toString("base64"), stats: { vertices, faces, fileSize: buffer.length, compilationTime: time }, error: null });
  } catch (error: any) {
    console.error("[/api/compile-stl] Error:", error?.message || String(error) || "Unknown error");
    res.status(500).json({ error: error?.message || "OpenSCAD compilation failed.", stl: null });
  }
});

// ── Polyslice slicing ─────────────────────────────────────────────────────────

interface SliceSettingsInput {
  layer_height?: number;
  infill_density?: number;
  wall_line_count?: number;
  support_enabled?: boolean;
  printer_model?: string;
}

interface PrintStats {
  print_time_minutes: number;
  filament_grams: number;
  layers: number;
  filament_length_mm: number;
}

// Valid printer model names (44 profiles in Polyslice)
const VALID_PRINTERS = [
  "Ender3", "Ender3V2", "Ender3Pro", "Ender3S1", "Ender5",
  "PrusaI3MK3S", "PrusaMini", "PrusaXL",
  "CR10", "CR10S5", "AnycubicI3Mega",
  "ArtillerySidewinderX1", "UltimakerS5", "FlashForgeCreatorPro",
  "Raise3DPro2",
];

async function sliceWithPolyslice(
  stlBuffer: Buffer,
  settings: SliceSettingsInput
): Promise<{ gcode: string; stats: PrintStats; slicer_used: string; printer_model: string; filament_type: string }> {
  const slicer = await getPolyslice();

  // Apply settings from request (mutate the singleton config)
  if (settings.layer_height != null) {
    slicer.layerHeight = Math.max(0.05, Math.min(0.4, settings.layer_height));
  }
  if (settings.infill_density != null) {
    slicer.infillDensity = Math.max(5, Math.min(100, settings.infill_density));
  }
  if (settings.wall_line_count != null) {
    // shellWallThickness = wallLines * nozzleDiameter (0.4mm default)
    slicer.shellWallThickness = Math.max(1, Math.min(8, settings.wall_line_count)) * 0.4;
  }
  if (settings.support_enabled != null) {
    slicer.supportEnabled = settings.support_enabled;
  }
  // Handle printer model swap
  if (settings.printer_model && VALID_PRINTERS.includes(settings.printer_model)) {
    const printer = new _PrinterClass(settings.printer_model);
    slicer.printer = printer;
    slicer.buildPlateWidth  = printer.getSizeX();
    slicer.buildPlateLength = printer.getSizeY();
    console.log(`[Polyslice] Using printer: ${settings.printer_model}`);
  }

  console.log(
    `[Polyslice] Slicing — layer=${slicer.layerHeight}mm infill=${slicer.infillDensity}% support=${slicer.supportEnabled}`
  );

  // Convert STL Buffer → THREE.BufferGeometry → THREE.Mesh
  const geometry = stlBufferToThreeGeometry(stlBuffer);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());

  // Slice! (synchronous in Polyslice)
  const gcode: string = slicer.slice(mesh);

  if (!gcode || gcode.length < 50) {
    throw new Error("Polyslice returned empty or invalid G-code. Check STL geometry.");
  }

  // Extract stats from slicer instance (populated after slice())
  const totalLayers       = slicer.totalLayers ?? 0;
  const filamentLengthMm  = slicer.totalFilamentLength ?? 0;
  const filamentRadius    = (slicer.filamentDiameter ?? 1.75) / 2;
  const volumeMm3         = Math.PI * filamentRadius * filamentRadius * filamentLengthMm;
  const densityGPerCm3    = slicer.filament?.getDensity ? slicer.filament.getDensity() : 1.24;
  const filamentGrams     = Math.round(((volumeMm3 / 1000) * densityGPerCm3) * 10) / 10;

  // Parse print time from G-code header (Polyslice embeds it as "; Estimated Print Time:")
  // Format can be "HH:MM:SS" or "Xh Ym Zs"
  let printTimeMinutes = 0;
  const timeMatch = gcode.match(/;\s*Estimated Print Time:\s*([\d:hms ]+)/i);
  if (timeMatch) {
    const timeStr = timeMatch[1].trim();
    const colonFmt = timeStr.match(/^(\d+):(\d+):(\d+)$/);
    if (colonFmt) {
      printTimeMinutes = Math.round(parseInt(colonFmt[1]) * 60 + parseInt(colonFmt[2]) + parseInt(colonFmt[3]) / 60);
    } else {
      const hMatch = timeStr.match(/(\d+)h/);
      const mMatch = timeStr.match(/(\d+)m/);
      const sMatch = timeStr.match(/(\d+)s/);
      printTimeMinutes = Math.round((hMatch ? parseInt(hMatch[1]) : 0) * 60 + (mMatch ? parseInt(mMatch[1]) : 0) + (sMatch ? parseInt(sMatch[1]) : 0) / 60);
    }
  }

  const printerName  = slicer.printer?.getName ? slicer.printer.getName() : (settings.printer_model || "Ender3");
  const filamentName = slicer.filament?.getName ? slicer.filament.getName() : "Generic PLA";

  console.log(`[Polyslice] Done — ${totalLayers} layers, ~${printTimeMinutes}min, ~${filamentGrams}g, ${filamentLengthMm.toFixed(1)}mm`);

  return {
    gcode,
    stats: {
      print_time_minutes: printTimeMinutes,
      filament_grams: filamentGrams,
      layers: totalLayers,
      filament_length_mm: Math.round(filamentLengthMm),
    },
    slicer_used: "Polyslice v26.4 (Three.js Native)",
    printer_model: printerName,
    filament_type: filamentName,
  };
}

// ── POST /api/slice-gcode ─────────────────────────────────────────────────────

app.post("/api/slice-gcode", async (req, res) => {
  const { stl, settings } = req.body || {};
  if (!stl || typeof stl !== "string") {
    res.status(400).json({ error: "STL base64 is required", gcode: null, stats: null }); return;
  }
  try {
    const stlBuffer = Buffer.from(stl, "base64");
    if (stlBuffer.length < 84) throw new Error("STL data appears corrupt or too small. Re-compile the design.");

    const { gcode, stats, slicer_used, printer_model, filament_type } = await sliceWithPolyslice(stlBuffer, settings || {});

    res.json({ gcode, stats, slicer_used, printer_model, filament_type, error: null });
  } catch (error: any) {
    console.error("[/api/slice-gcode] Error:", error?.message || String(error) || "Unknown error");
    console.error("[/api/slice-gcode] Stack:", error?.stack);
    res.status(500).json({
      error: error?.message || "G-code generation failed",
      gcode: null,
      stats: null,
      slicer_used: "Polyslice",
    });
  }
});

// ── 3MF conversion ────────────────────────────────────────────────────────────

const SERVER_COLOR_MAP: Record<string, [number, number, number]> = {
  black: [0.1, 0.1, 0.1], white: [1, 1, 1], gray: [0.5, 0.5, 0.5], grey: [0.5, 0.5, 0.5],
  silver: [0.75, 0.75, 0.75], red: [1, 0, 0], green: [0, 0.8, 0], blue: [0, 0.3, 1],
  yellow: [1, 1, 0], cyan: [0, 1, 1], magenta: [1, 0, 1], orange: [1, 0.647, 0],
  purple: [0.627, 0.125, 0.941], brown: [0.647, 0.165, 0.165], gold: [1, 0.843, 0], chrome: [0.85, 0.85, 0.9],
};

function extractAllColors(code: string): [number, number, number][] {
  if (!code) return [[0.39, 0.4, 0.45]];
  const colors: [number, number, number][] = [];
  const rgbRe = /color\s*\(\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = rgbRe.exec(code)) !== null) {
    let r = parseFloat(m[1]), g = parseFloat(m[2]), b = parseFloat(m[3]);
    const s = r > 1 || g > 1 || b > 1 ? 255 : 1;
    colors.push([r / s, g / s, b / s]);
  }
  const namedRe = /color\s*\(\s*"([a-zA-Z]+)"/g;
  while ((m = namedRe.exec(code)) !== null) {
    const c = SERVER_COLOR_MAP[m[1].toLowerCase()];
    if (c) colors.push(c);
  }
  const mapRe = /color_map\s*=\s*\[([^\]]+)\]/;
  const mapMatch = code.match(mapRe);
  if (mapMatch) {
    const names = mapMatch[1].match(/"([a-zA-Z]+)"/g) || [];
    for (const n of names) {
      const c = SERVER_COLOR_MAP[n.replace(/"/g, "").toLowerCase()];
      if (c) colors.push(c);
    }
  }
  if (colors.length === 0) colors.push([0.39, 0.4, 0.45]);
  return colors;
}

// ZIP builder (pure Node, no deps)
const CRC_TABLE = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries: { name: string; data: Buffer }[]): Buffer {
  const localParts: Buffer[] = [], centralParts: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nb = Buffer.from(e.name, "utf8"), crc = crc32(e.data);
    const comp = zlib.deflateRawSync(e.data);
    const stored = comp.length < e.data.length ? comp : e.data;
    const method = comp.length < e.data.length ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4); local.writeUInt16LE(0,6); local.writeUInt16LE(method,8);
    local.writeUInt16LE(0,10); local.writeUInt16LE(0,12); local.writeUInt32LE(crc,14);
    local.writeUInt32LE(stored.length,18); local.writeUInt32LE(e.data.length,22); local.writeUInt16LE(nb.length,26); local.writeUInt16LE(0,28);
    localParts.push(local, nb, stored);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt16LE(0,8);
    central.writeUInt16LE(method,10); central.writeUInt16LE(0,12); central.writeUInt16LE(0,14); central.writeUInt32LE(crc,16);
    central.writeUInt32LE(stored.length,20); central.writeUInt32LE(e.data.length,24); central.writeUInt16LE(nb.length,28);
    central.writeUInt16LE(0,30); central.writeUInt16LE(0,32); central.writeUInt16LE(0,34); central.writeUInt16LE(0,36);
    central.writeUInt32LE(0,38); central.writeUInt32LE(offset,42);
    centralParts.push(central, nb);
    offset += local.length + nb.length + stored.length;
  }
  const cd = Buffer.concat(centralParts), ld = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(0,4); end.writeUInt16LE(0,6);
  end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(cd.length,12); end.writeUInt32LE(ld.length,16); end.writeUInt16LE(0,20);
  return Buffer.concat([ld, cd, end]);
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":`&apos;`}[c] as string));
}

function toHex(rgb: [number, number, number]): string {
  return "#" + rgb.map(c => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("") + "FF";
}

function build3mfModelXml(mesh: ParsedMesh, colors: [number, number, number][]): string {
  const colorEntries = colors.map(c => `      <m:color color="${escapeXml(toHex(c))}"/>`).join("\n");
  const vertexLines = [];
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    vertexLines.push(`          <vertex x="${mesh.vertices[i]}" y="${mesh.vertices[i+1]}" z="${mesh.vertices[i+2]}"/>`);
  }
  const triLines = [];
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const colorIdx = Math.floor((i / 3) / Math.ceil(mesh.triangles.length / 3 / colors.length)) % colors.length;
    triLines.push(`          <triangle v1="${mesh.triangles[i]}" v2="${mesh.triangles[i+1]}" v3="${mesh.triangles[i+2]}" pid="1" p1="${colorIdx}"/>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
  xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <resources>
    <m:colorgroup id="1">
${colorEntries}
    </m:colorgroup>
    <object id="2" type="model">
      <mesh>
        <vertices>
${vertexLines.join("\n")}
        </vertices>
        <triangles>
${triLines.join("\n")}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="2"/>
  </build>
</model>`;
}

// ── POST /api/convert-stl-to-3mf ─────────────────────────────────────────────

app.post("/api/convert-stl-to-3mf", async (req, res) => {
  const { stl, code } = req.body || {};
  if (!stl || typeof stl !== "string") {
    res.status(400).json({ error: "STL base64 is required", "3mf": null }); return;
  }
  try {
    const buffer = Buffer.from(stl, "base64");
    const mesh = parseSTLMesh(buffer);
    if (mesh.triangles.length === 0) throw new Error("Could not parse triangles from STL.");

    const colors = extractAllColors(code || "");
    const modelXml = build3mfModelXml(mesh, colors);

    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

    const zip = buildZip([
      { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
      { name: "_rels/.rels",          data: Buffer.from(rels,          "utf8") },
      { name: "3D/3dmodel.model",    data: Buffer.from(modelXml,      "utf8") },
    ]);

    res.json({
      "3mf": zip.toString("base64"),
      stats: { vertices: mesh.vertices.length / 3, faces: mesh.triangles.length / 3, fileSize: zip.length, colors: colors.length },
      error: null,
    });
  } catch (error: any) {
    console.error("[/api/convert-stl-to-3mf] Error:", error?.message || String(error) || "Unknown error");
    res.status(500).json({ error: error?.message || "3MF conversion failed", "3mf": null });
  }
});

// ── Vite dev / production static serving ─────────────────────────────────────

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`ThinkPrint Server listening on port ${PORT}`));
}

startServer();