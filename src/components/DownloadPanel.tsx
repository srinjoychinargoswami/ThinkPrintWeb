import React from 'react';
import { Download, Code2, Boxes, FileBox, FileDigit } from 'lucide-react';

interface DownloadPanelProps {
  stlBase64: string | null;
  scadCode: string | null;
  gcodeText: string | null;
  onDownload3mf: () => void;
  isConverting3mf?: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// base64 string decodes to roughly length * 3/4 bytes (minus padding)
function base64ByteSize(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function triggerBlobDownload(data: BlobPart, mime: string, filename: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function base64ToUint8(base64: string): Uint8Array {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export default function DownloadPanel({
  stlBase64,
  scadCode,
  gcodeText,
  onDownload3mf,
  isConverting3mf = false,
}: DownloadPanelProps) {
  const stlSize = stlBase64 ? base64ByteSize(stlBase64) : 0;
  const scadSize = scadCode ? new Blob([scadCode]).size : 0;
  const gcodeSize = gcodeText ? new Blob([gcodeText]).size : 0;

  const handleStl = () => {
    if (!stlBase64) return;
    triggerBlobDownload(base64ToUint8(stlBase64), 'model/stl', 'thinkprint_model.stl');
  };

  const handleScad = () => {
    if (!scadCode) return;
    triggerBlobDownload(scadCode, 'text/plain', 'thinkprint_model.scad');
  };

  const handleGcode = () => {
    if (!gcodeText) return;
    triggerBlobDownload(gcodeText, 'text/plain', 'thinkprint_model.gcode');
  };

  const btnBase =
    'flex flex-col items-start gap-1 py-3 px-4 rounded-xl border text-left transition disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider font-mono border-b border-slate-800 pb-3">
        Downloads
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* STL */}
        <button
          onClick={handleStl}
          disabled={!stlBase64}
          className={`${btnBase} bg-indigo-950/30 border-indigo-800 hover:bg-indigo-900/40 text-indigo-300`}
          title="Binary STL mesh"
        >
          <div className="flex items-center gap-1.5 font-bold text-sm">
            <Boxes className="h-4 w-4" /> STL
          </div>
          <span className="text-[10px] font-mono text-slate-400">{formatBytes(stlSize)}</span>
        </button>

        {/* 3MF */}
        <button
          onClick={onDownload3mf}
          disabled={!stlBase64 || isConverting3mf}
          className={`${btnBase} bg-emerald-950/30 border-emerald-800 hover:bg-emerald-900/40 text-emerald-300`}
          title="3MF includes color metadata for Cura"
        >
          <div className="flex items-center gap-1.5 font-bold text-sm">
            <FileBox className="h-4 w-4" /> {isConverting3mf ? '3MF…' : '3MF'}
          </div>
          <span className="text-[10px] font-mono text-slate-400">color metadata · Cura</span>
        </button>

        {/* OpenSCAD */}
        <button
          onClick={handleScad}
          disabled={!scadCode}
          className={`${btnBase} bg-slate-950 border-slate-800 hover:bg-slate-800 text-slate-300`}
          title="OpenSCAD source"
        >
          <div className="flex items-center gap-1.5 font-bold text-sm">
            <Code2 className="h-4 w-4 text-indigo-400" /> SCAD
          </div>
          <span className="text-[10px] font-mono text-slate-400">{formatBytes(scadSize)}</span>
        </button>

        {/* G-Code */}
        <button
          onClick={handleGcode}
          disabled={!gcodeText}
          className={`${btnBase} bg-slate-950 border-slate-800 hover:bg-slate-800 text-slate-300`}
          title="Sliced G-Code"
        >
          <div className="flex items-center gap-1.5 font-bold text-sm">
            <FileDigit className="h-4 w-4 text-emerald-400" /> G-Code
          </div>
          <span className="text-[10px] font-mono text-slate-400">{formatBytes(gcodeSize)}</span>
        </button>
      </div>
    </div>
  );
}
