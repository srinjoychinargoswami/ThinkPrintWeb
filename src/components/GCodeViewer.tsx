import React, { useState } from 'react';
import { Download, Copy, Check, Clock, Box, Layers, Ruler, Cpu } from 'lucide-react';

interface PrintStats {
  print_time_minutes: number;
  filament_grams: number;
  layers: number;
  filament_length_mm: number;
}

interface GCodeViewerProps {
  gcode: string;
  stats?: PrintStats | null;
  slicerUsed?: string;
  printerModel?: string;
  filamentType?: string;
  isLoading?: boolean;
  onDownload?: () => void;
}

function formatTime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function GCodeViewer({
  gcode,
  stats,
  slicerUsed,
  printerModel,
  filamentType,
  isLoading = false,
  onDownload,
}: GCodeViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(gcode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const handleDownload = () => {
    if (onDownload) { onDownload(); return; }
    // Inline fallback
    const el = document.createElement('a');
    el.href = URL.createObjectURL(new Blob([gcode], { type: 'text/plain' }));
    el.download = `thinkprint_${Date.now()}.gcode`;
    el.click();
    URL.revokeObjectURL(el.href);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider font-mono">
          G-Code Output
        </h3>
        {isLoading && (
          <span className="text-[10px] font-mono text-indigo-400 animate-pulse">Slicing...</span>
        )}
      </div>

      {/* Engine / printer badges */}
      {(slicerUsed || printerModel) && gcode && (
        <div className="flex flex-wrap gap-2">
          {slicerUsed && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-orange-800 bg-orange-950/30 text-[10px] font-mono font-semibold text-orange-300 uppercase tracking-wider">
              <Cpu className="h-3 w-3 shrink-0" />{slicerUsed}
            </span>
          )}
          {printerModel && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-700 bg-slate-950 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              <Cpu className="h-3 w-3 shrink-0 text-indigo-400" />{printerModel}
            </span>
          )}
          {filamentType && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-700 bg-slate-950 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              {filamentType}
            </span>
          )}
        </div>
      )}

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col items-center gap-1">
            <Clock className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-mono font-bold text-slate-200">{formatTime(stats.print_time_minutes)}</span>
            <span className="text-[9px] uppercase font-mono text-slate-500">Print time</span>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col items-center gap-1">
            <Box className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-mono font-bold text-slate-200">{(stats.filament_grams || 0).toFixed(1)}g</span>
            <span className="text-[9px] uppercase font-mono text-slate-500">Filament</span>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col items-center gap-1">
            <Layers className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-mono font-bold text-slate-200">{stats.layers || 0}</span>
            <span className="text-[9px] uppercase font-mono text-slate-500">Layers</span>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col items-center gap-1">
            <Ruler className="h-4 w-4 text-sky-400" />
            <span className="text-sm font-mono font-bold text-slate-200">{stats.filament_length_mm || 0}mm</span>
            <span className="text-[9px] uppercase font-mono text-slate-500">Length</span>
          </div>
        </div>
      )}

      {/* G-code textarea */}
      <div className="relative">
        <textarea
          readOnly
          value={gcode}
          placeholder="Slice an STL to generate printable G-Code instructions."
          className="w-full bg-slate-950 text-emerald-400/90 font-mono text-[11px] p-3 rounded-lg border border-slate-800 outline-none resize-none leading-relaxed"
          style={{ height: 300 }}
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm rounded-lg">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider animate-pulse">Slicing...</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          disabled={!gcode}
          className="flex-1 py-2 rounded-lg bg-emerald-950/40 border border-emerald-800 hover:bg-emerald-900/40 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="h-3.5 w-3.5" /> Download G-Code
        </button>
        <button
          onClick={handleCopy}
          disabled={!gcode}
          className="flex-1 py-2 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <p className="text-[10px] text-slate-500 font-mono bg-slate-950/40 border border-slate-800 rounded p-2">
        G-Code generated by Polyslice. Compatible with Marlin-based printers (Ender3, Prusa, CR10, etc.)
      </p>
    </div>
  );
}
