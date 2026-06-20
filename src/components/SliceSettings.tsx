import React, { useState } from 'react';
import { Printer, Sliders, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

export interface SliceSettingsData {
  layer_height: number;
  infill_density: number;
  wall_line_count: number;
  support_enabled: boolean;
  printer_model: string;
}

interface SliceSettingsProps {
  stlBase64: string | null;
  onSlice: (settings: SliceSettingsData) => void;
  loading: boolean;
}

// 44 printers available in Polyslice — subset shown in UI
const PRINTER_OPTIONS = [
  "Ender3",
  "Ender3V2",
  "Ender3Pro",
  "Ender3S1",
  "Ender5",
  "PrusaI3MK3S",
  "PrusaMini",
  "PrusaXL",
  "CR10",
  "CR10S5",
  "AnycubicI3Mega",
  "ArtillerySidewinderX1",
  "UltimakerS5",
  "FlashForgeCreatorPro",
  "Raise3DPro2",
];

export default function SliceSettings({ stlBase64, onSlice, loading }: SliceSettingsProps) {
  const [printerModel, setPrinterModel]   = useState("Ender3");
  const [layerHeight, setLayerHeight]     = useState(0.2);
  const [infillDensity, setInfillDensity] = useState(20);
  const [wallLines, setWallLines]         = useState(3);
  const [supportEnabled, setSupportEnabled] = useState(false);
  const [showAdvanced, setShowAdvanced]   = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const handleSlice = () => {
    if (!stlBase64) {
      setError('No STL available. Generate and compile a design first.');
      return;
    }
    setError(null);
    onSlice({
      layer_height:   layerHeight,
      infill_density: infillDensity,
      wall_line_count: wallLines,
      support_enabled: supportEnabled,
      printer_model:  printerModel,
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <Printer className="h-4 w-4 text-orange-400" />
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider font-mono">
          Slice Settings
        </h3>
        <span className="ml-auto text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border border-orange-800 bg-orange-950/40 text-orange-400">
          Polyslice v26.4
        </span>
      </div>

      {/* Printer selector */}
      <div className="space-y-1.5">
        <label className="text-xs text-slate-400 font-medium font-mono">Printer Model</label>
        <div className="relative">
          <select
            value={printerModel}
            onChange={(e) => setPrinterModel(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono appearance-none focus:outline-none focus:border-orange-600 transition"
          >
            {PRINTER_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {/* Layer height */}
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-slate-400 font-medium">Layer Height</span>
          <span className="text-orange-400 font-mono font-semibold">{layerHeight.toFixed(2)}mm</span>
        </div>
        <input
          type="range" min={0.05} max={0.4} step={0.05} value={layerHeight}
          onChange={(e) => setLayerHeight(parseFloat(e.target.value))}
          className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
        />
        <div className="flex justify-between text-[9px] text-slate-600 font-mono mt-0.5">
          <span>0.05 (fine)</span><span>0.4 (draft)</span>
        </div>
      </div>

      {/* Infill */}
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-slate-400 font-medium">Infill Density</span>
          <span className="text-pink-400 font-mono font-semibold">{infillDensity}%</span>
        </div>
        <input
          type="range" min={5} max={100} step={5} value={infillDensity}
          onChange={(e) => setInfillDensity(parseInt(e.target.value, 10))}
          className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
        />
      </div>

      {/* Advanced toggle */}
      <button
        onClick={() => setShowAdvanced((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 font-mono transition"
      >
        <Sliders className="h-3 w-3" />
        {showAdvanced ? 'Hide' : 'Show'} advanced settings
        {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {showAdvanced && (
        <div className="space-y-4 bg-slate-950 border border-slate-800 rounded-lg p-4">
          {/* Wall lines */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400 font-medium">Wall Lines</span>
              <span className="text-indigo-400 font-mono font-semibold">{wallLines} ({(wallLines * 0.4).toFixed(1)}mm)</span>
            </div>
            <input
              type="range" min={1} max={8} step={1} value={wallLines}
              onChange={(e) => setWallLines(parseInt(e.target.value, 10))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
          {/* Support */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs text-slate-400 font-medium">Support Structures</span>
            <span
              onClick={() => setSupportEnabled((s) => !s)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${supportEnabled ? 'bg-orange-600' : 'bg-slate-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${supportEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </span>
          </label>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs bg-amber-950/30 border border-amber-900/50 p-3 rounded-lg text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      <button
        onClick={handleSlice}
        disabled={loading || !stlBase64}
        className="w-full py-2.5 rounded-lg font-bold text-sm transition text-white bg-orange-600 hover:bg-orange-500 active:bg-orange-700 flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <><RefreshCw className="h-4 w-4 animate-spin" /> Slicing with Polyslice...</>
        ) : (
          <><Printer className="h-4 w-4" /> Generate G-Code</>
        )}
      </button>
    </div>
  );
}
