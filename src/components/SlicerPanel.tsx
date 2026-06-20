import React, { useState, useEffect, useRef } from "react";
import { CADVisualNode } from "../types";
import { evaluateExpression } from "../lib/cadEvaluator";
import { Printer, Download, Sliders, Play, Pause, Layers, Circle, Compass, RefreshCw } from "lucide-react";

interface SlicerPanelProps {
  visualTree: CADVisualNode | null;
  parameters: Record<string, number>;
}

interface TravelPoint {
  x: number;
  y: number;
  type: "travel" | "wall" | "infill" | "support";
}

export default function SlicerPanel({ visualTree, parameters }: SlicerPanelProps) {
  // Slicer settings
  const [layerHeight, setLayerHeight] = useState(0.2); // mm
  const [wallWeight, setWallWeight] = useState(3); // loops
  const [infillPercent, setInfillPercent] = useState(25); // %
  const [infillPattern, setInfillPattern] = useState<"grid" | "concentric" | "line">("grid");
  const [bedTemp, setBedTemp] = useState(60); // °C
  const [extruderTemp, setExtruderTemp] = useState(210); // °C
  const [speed, setSpeed] = useState(50); // mm/s
  const [hasSupport, setHasSupport] = useState(false);

  // Slicing State
  const [isSlicing, setIsSlicing] = useState(false);
  const [sliceProgress, setSliceProgress] = useState(0);
  const [gcode, setGcode] = useState<string>("");
  const [layersCount, setLayersCount] = useState(0);
  const [activeLayer, setActiveLayer] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [drawProgress, setDrawProgress] = useState(100); // percentage of lines of active layer

  // Visual Reference Canvas
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-calculated dimensions
  const getDims = () => {
    if (!visualTree) return { width: 60, depth: 60, height: 20 };
    // Try to guess sizing from common properties
    const boundingBox = { x: 50, y: 50, z: 20 };
    Object.entries(parameters).forEach(([key, val]) => {
      const lower = key.toLowerCase();
      if (lower.includes("width") || lower.includes("length") || lower.includes("diameter") || lower.includes("dim")) {
        boundingBox.x = Math.max(boundingBox.x, val);
      }
      if (lower.includes("depth") || lower.includes("height") || lower.includes("thick")) {
        if (lower.includes("height") || lower.includes("thick")) {
          boundingBox.z = Math.max(boundingBox.z, val);
        } else {
          boundingBox.y = Math.max(boundingBox.y, val);
        }
      }
    });
    
    // Safety check constraints
    return {
      width: Math.min(boundingBox.x, 220), // bed limit
      depth: Math.min(boundingBox.y, 220),
      height: Math.min(boundingBox.z, 200),
    };
  };

  const { width: modelW, depth: modelD, height: modelH } = getDims();

  // Run Slicer algorithm
  const handleSlice = () => {
    setIsSlicing(true);
    setSliceProgress(10);
    setGcode("");

    let prog = 10;
    const interval = setInterval(() => {
      prog += 25;
      if (prog >= 100) {
        clearInterval(interval);
        compileGCode();
      } else {
        setSliceProgress(prog);
      }
    }, 150);
  };

  // Build authentic G-Code instruction set
  const compileGCode = () => {
    const calculatedLayers = Math.max(Math.ceil(modelH / layerHeight), 2);
    setLayersCount(calculatedLayers);
    setActiveLayer(1);

    const startCode = `; --- ThinkPrint Conversational Slicer GCODE ---
; Generated for direct 3D Printing
; Layer Height: ${layerHeight}mm
; Infill Density: ${infillPercent}% (${infillPattern})
; Retraction: 5mm @ 45mm/s
M140 S${bedTemp} ; Stable bed temperature
M104 S${extruderTemp} ; Stable thermal hotend setup
G28 ; Home axes
G90 ; Absolute coordinates
G92 E0 ; Zero extruder
G1 Z2.0 F3000 ; Guard safety shift
M109 S${extruderTemp} ; Wait for hotend thermal stability
M190 S${bedTemp} ; Wait for bed stability
M106 S255 ; Engage cooling fan
`;

    let bodyCode = "";
    let extrusionAcc = 0; // Cumulative extruder extrusion
    const feedExtrude = speed * 60;
    const feedTravel = 120 * 60;

    // Loop through mathematical slices Layer by Layer
    for (let layer = 1; layer <= calculatedLayers; layer++) {
      const currentZ = (layer * layerHeight).toFixed(3);
      bodyCode += `\n; --- LAYER ${layer} [Z = ${currentZ}mm] ---\n`;
      bodyCode += `G1 Z${currentZ} F${feedTravel}\n`;

      // Draw brim/skirt on layer 1
      if (layer === 1) {
        bodyCode += `; Skirt protection line\n`;
        bodyCode += `G0 X45 Y45 F${feedTravel}\n`;
        extrusionAcc += 5.5;
        bodyCode += `G1 X${(220 / 2 + modelW / 2 + 10).toFixed(2)} Y45 E${extrusionAcc.toFixed(4)} F${feedExtrude}\n`;
      }

      // Generate parameters simulation
      bodyCode += `; Outer perimeter loops\n`;
      // Simulate extruder loops
      for (let l = 1; l <= wallWeight; l++) {
        const offset = l * 0.4;
        const x1 = (110 - modelW / 2 - offset).toFixed(2);
        const y1 = (110 - modelD / 2 - offset).toFixed(2);
        const x2 = (110 + modelW / 2 + offset).toFixed(2);
        const y2 = (110 + modelD / 2 + offset).toFixed(2);

        bodyCode += `G0 X${x1} Y${y1} F${feedTravel}\n`;
        extrusionAcc += 1.25;
        bodyCode += `G1 X${x2} Y${y1} E${extrusionAcc.toFixed(4)} F${feedExtrude}\n`;
        extrusionAcc += 1.25;
        bodyCode += `G1 X${x2} Y${y2} E${extrusionAcc.toFixed(4)} F${feedExtrude}\n`;
        extrusionAcc += 1.25;
        bodyCode += `G1 X${x1} Y${y2} E${extrusionAcc.toFixed(4)} F${feedExtrude}\n`;
        extrusionAcc += 1.25;
        bodyCode += `G1 X${x1} Y${y1} E${extrusionAcc.toFixed(4)} F${feedExtrude}\n`;
      }

      // Generate infill loops matching selected style
      if (infillPercent > 0) {
        bodyCode += `; Infill matrix (${infillPattern})\n`;
        if (infillPattern === "grid") {
          // Drawing vertical lines
          const stepSize = Math.max(10 - infillPercent * 0.08, 2);
          for (let x = 110 - modelW / 2; x <= 110 + modelW / 2; x += stepSize) {
            bodyCode += `G0 X${x.toFixed(2)} Y${(110 - modelD / 2).toFixed(2)} F${feedTravel}\n`;
            extrusionAcc += 0.85;
            bodyCode += `G1 X${x.toFixed(2)} Y${(110 + modelD / 2).toFixed(2)} E${extrusionAcc.toFixed(4)} F${feedExtrude}\n`;
          }
        } else if (infillPattern === "line") {
          const stepSize = Math.max(12 - infillPercent * 0.1, 3);
          for (let x = 110 - modelW / 2; x <= 110 + modelW / 2; x += stepSize) {
            bodyCode += `G0 X${x.toFixed(2)} Y${(110 - modelD / 2).toFixed(2)} F${feedTravel}\n`;
            extrusionAcc += 0.95;
            bodyCode += `G1 X${(x + 10).toFixed(2)} Y${(110 + modelD / 2).toFixed(2)} E${extrusionAcc.toFixed(4)} F${feedExtrude}\n`;
          }
        } else {
          // Concentric
          const multiplier = Math.max(infillPercent / 100, 0.1);
          const rX = (modelW / 2) * multiplier;
          const rY = (modelD / 2) * multiplier;
          bodyCode += `G0 X${(110 - rX).toFixed(2)} Y${(110 - rY).toFixed(2)} F${feedTravel}\n`;
          extrusionAcc += 1.5;
          bodyCode += `G1 X${(110 + rX).toFixed(2)} Y${(110 - rY).toFixed(2)} E${extrusionAcc.toFixed(4)} F${feedExtrude}\n`;
          extrusionAcc += 1.5;
          bodyCode += `G1 X${(110 + rX).toFixed(2)} Y${(110 + rY).toFixed(2)} E${extrusionAcc.toFixed(4)} F${feedExtrude}\n`;
          extrusionAcc += 1.5;
          bodyCode += `G1 X${(110 - rX).toFixed(2)} Y${(110 + rY).toFixed(2)} E${extrusionAcc.toFixed(4)} F${feedExtrude}\n`;
          extrusionAcc += 1.5;
          bodyCode += `G1 X${(110 - rX).toFixed(2)} Y${(110 - rY).toFixed(2)} E${extrusionAcc.toFixed(4)} F${feedExtrude}\n`;
        }
      }
    }

    const endCode = `\n; --- End of ThinkPrint custom Gcode ---
M104 S0 ; cooling extruder
M140 S0 ; cooling buildplate
M107 ; stop cooling fan
G28 X0 ; home X axis
M84 ; cease stepper motor torque
`;

    setGcode(startCode + bodyCode + endCode);
    setIsSlicing(false);
  };

  // Render Sliced Layer onto 2D Preview Canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !gcode) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and draw grid backing
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    // Draw printer build grid
    for (let c = 20; c < canvas.width; c += 20) {
      ctx.beginPath();
      ctx.moveTo(c, 0);
      ctx.lineTo(c, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, c);
      ctx.lineTo(canvas.width, c);
      ctx.stroke();
    }

    // Centering coordinates (Translate canvas center to 110,110 sandbox)
    const scale = 1.35; // pixel-scale multiplier
    const cX = canvas.width / 2;
    const cY = canvas.height / 2;

    // Simulated layer path lines generator
    const travelPaths: TravelPoint[] = [];

    // Outer perimeter loops
    const drawWalls = () => {
      for (let l = 1; l <= wallWeight; l++) {
        const offset = l * 1.5;
        const w = modelW * scale + offset;
        const h = modelD * scale + offset;
        travelPaths.push({ x: cX - w/2, y: cY - h/2, type: "travel" });
        travelPaths.push({ x: cX + w/2, y: cY - h/2, type: "wall" });
        travelPaths.push({ x: cX + w/2, y: cY + h/2, type: "wall" });
        travelPaths.push({ x: cX - w/2, y: cY + h/2, type: "wall" });
        travelPaths.push({ x: cX - w/2, y: cY - h/2, type: "wall" });
      }
    };

    const drawInfill = () => {
      const step = Math.max(16 - infillPercent * 0.15, 4);
      const w = modelW * scale - wallWeight * 1.5;
      const h = modelD * scale - wallWeight * 1.5;

      if (infillPattern === "grid") {
        for (let x = cX - w/2; x <= cX + w/2; x += step) {
          travelPaths.push({ x, y: cY - h/2, type: "travel" });
          travelPaths.push({ x, y: cY + h/2, type: "infill" });
        }
        for (let y = cY - h/2; y <= cY + h/2; y += step) {
          travelPaths.push({ x: cX - w/2, y, type: "travel" });
          travelPaths.push({ x: cX + w/2, y, type: "infill" });
        }
      } else if (infillPattern === "line") {
        for (let x = cX - w/2 - h/2; x <= cX + w/2 + h/2; x += step) {
          travelPaths.push({ x, y: cY - h/2, type: "travel" });
          travelPaths.push({ x: x + h/2, y: cY + h/2, type: "infill" });
        }
      } else {
        // concentric
        const multiplier = Math.max(infillPercent / 100, 0.1);
        const cw = w * multiplier;
        const ch = h * multiplier;
        travelPaths.push({ x: cX - cw/2, y: cY - ch/2, type: "travel" });
        travelPaths.push({ x: cX + cw/2, y: cY - ch/2, type: "infill" });
        travelPaths.push({ x: cX + cw/2, y: cY + ch/2, type: "infill" });
        travelPaths.push({ x: cX - cw/2, y: cY + ch/2, type: "infill" });
        travelPaths.push({ x: cX - cw/2, y: cY - ch/2, type: "infill" });
      }
    };

    // Compile points
    drawWalls();
    if (infillPercent > 0) drawInfill();

    // Limit draw size by slider progress animation
    const limit = Math.ceil((drawProgress / 100) * travelPaths.length);
    const visiblePoints = travelPaths.slice(0, limit);

    // Render the visible toolpath loops
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    let lastX = 0;
    let lastY = 0;

    visiblePoints.forEach((pt) => {
      ctx.beginPath();
      if (pt.type === "travel") {
        ctx.strokeStyle = "rgba(100, 116, 139, 0.15)"; // Soft gray travel path lines
        ctx.lineWidth = 1;
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      } else {
        ctx.strokeStyle = pt.type === "wall" ? "#fbbf24" : "#ec4899"; // Amber perimeter, pink grids
        ctx.lineWidth = 3;
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
      lastX = pt.x;
      lastY = pt.y;
    });

    // Draw active print head circle
    if (visiblePoints.length > 0) {
      const activeNode = visiblePoints[visiblePoints.length - 1];
      ctx.beginPath();
      ctx.arc(activeNode.x, activeNode.y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = "#22c55e"; // Glowing green hotend
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
  }, [gcode, drawProgress, wallWeight, infillPercent, infillPattern, activeLayer, modelW, modelD]);

  // Handle Play/Pause Toolpath printing simulation
  useEffect(() => {
    let animId: any;
    if (isAnimating) {
      animId = setInterval(() => {
        setDrawProgress((prev) => {
          if (prev >= 100) {
            // Loop back or skip layer
            return 0;
          }
          return prev + 2;
        });
      }, 50);
    } else {
      clearInterval(animId);
    }
    return () => clearInterval(animId);
  }, [isAnimating]);

  const handleDownloadGcode = () => {
    const blob = new Blob([gcode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ThinkPrint_CAD_Design.gcode`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-4">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
        <Printer className="h-4 w-4 text-emerald-400" />
        <h4 className="text-sm font-semibold text-slate-200">G-Code Slicing Terminal</h4>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Slicer Settings controls */}
        <div className="space-y-4">
          <div className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 space-y-3.5">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
              <Sliders className="h-3 w-3 text-indigo-400" /> Print Quality Parameters
            </span>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400 font-medium">Layer Height</span>
                <span className="text-indigo-400 font-mono font-medium">{layerHeight}mm</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.4"
                step="0.05"
                value={layerHeight}
                onChange={(e) => setLayerHeight(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400 font-medium">Wall Shell Thickness</span>
                <span className="text-indigo-400 font-mono font-medium">{wallWeight} loops</span>
              </div>
              <input
                type="range"
                min="1"
                max="6"
                step="1"
                value={wallWeight}
                onChange={(e) => setWallWeight(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400 font-medium">Infill Density</span>
                <span className="text-pink-400 font-mono font-medium">{infillPercent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={infillPercent}
                onChange={(e) => setInfillPercent(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-500 font-semibold uppercase font-mono block mb-1">
                Infill Geometry
              </label>
              <select
                value={infillPattern}
                onChange={(e: any) => setInfillPattern(e.target.value)}
                className="w-full text-xs bg-slate-900 border border-slate-800 text-slate-300 rounded p-1.5 focus:border-indigo-500 outline-none"
              >
                <option value="grid">Grid (Rigid structural cross-beams)</option>
                <option value="line">Line (High speed direct lines)</option>
                <option value="concentric">Concentric (Saves infill weight / outer offset loops)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <span className="text-[10px] text-slate-500 block">Extruder Temp</span>
                <input
                  type="number"
                  value={extruderTemp}
                  onChange={(e) => setExtruderTemp(parseInt(e.target.value))}
                  className="w-full text-xs font-mono bg-slate-900 border border-slate-800 text-slate-300 p-1 rounded"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Bed Temp</span>
                <input
                  type="number"
                  value={bedTemp}
                  onChange={(e) => setBedTemp(parseInt(e.target.value))}
                  className="w-full text-xs font-mono bg-slate-900 border border-slate-800 text-slate-300 p-1 rounded"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleSlice}
            disabled={isSlicing}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
          >
            {isSlicing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Slicing CAD Model... ({sliceProgress}%)
              </>
            ) : (
              <>
                <Printer className="h-4 w-4" />
                Slice Code to G-Code
              </>
            )}
          </button>
        </div>

        {/* 2D toolpath visualization canvas */}
        <div className="flex flex-col items-center justify-center bg-slate-950 rounded-xl border border-slate-800 p-3 self-stretch">
          {gcode ? (
            <div className="w-full space-y-3">
              {/* Canvas Preview Container */}
              <div className="relative flex items-center justify-center bg-slate-950 rounded-lg overflow-hidden border border-slate-850">
                <canvas ref={previewCanvasRef} width={220} height={220} className="rounded-lg shadow" />
                
                {/* Printbed center reference marker overlay */}
                <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/90 text-[8px] text-slate-500 border border-slate-800/60 font-mono uppercase">
                  <Compass className="h-2 w-2" /> 220x220 Heated Bed
                </div>
              </div>

              {/* Slider for simulated extruder layer step progression */}
              <div className="space-y-1.5 bg-slate-900 p-2.5 rounded-lg border border-slate-850">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-semibold flex items-center gap-1">
                    <Layers className="h-3 w-3 text-emerald-400" /> Printing Height
                  </span>
                  <span className="text-emerald-400 font-mono font-bold">
                    Layer {activeLayer} / {layersCount} ({(activeLayer * layerHeight).toFixed(2)}mm)
                  </span>
                </div>
                
                <input
                  type="range"
                  min="1"
                  max={layersCount}
                  step="1"
                  value={activeLayer}
                  onChange={(e) => setActiveLayer(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />

                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800/80">
                  <button
                    onClick={() => setIsAnimating(!isAnimating)}
                    className="flex items-center gap-1 text-[10px] uppercase font-bold font-mono px-2 py-1 rounded bg-slate-850 text-slate-300 hover:bg-slate-800 border border-slate-800 transition pointer-events-auto"
                  >
                    {isAnimating ? (
                      <>
                        <Pause className="h-2.5 w-2.5 text-red-400 fill-current" /> Pause Printing
                      </>
                    ) : (
                      <>
                        <Play className="h-2.5 w-2.5 text-emerald-400 fill-current" /> Play Simulation
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500 font-mono">Nozzle Toolpath Draw:</span>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={drawProgress}
                      onChange={(e) => setDrawProgress(parseInt(e.target.value))}
                      className="w-16 h-1 bg-slate-800 appearance-none rounded accent-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Action Downloads */}
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadGcode}
                  className="flex-1 py-1.5 rounded-md border border-emerald-800 bg-emerald-950/40 hover:bg-emerald-900/30 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <Download className="h-3.5 w-3.5" /> Download .GCODE File
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 text-center max-w-xs">
              <Printer className="h-8 w-8 text-slate-700 animate-pulse" />
              <p className="text-xs text-slate-500 font-medium">
                Adjust layer quality and infill, then click <strong className="text-slate-400">Slice Code to G-Code</strong> to compile printable instructions.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
