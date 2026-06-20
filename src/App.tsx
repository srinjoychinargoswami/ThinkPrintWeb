import React, { useState, useCallback } from 'react';
import { Cpu, Sparkles, ChevronRight, AlertCircle, Download, Trash2, RefreshCw, Package } from 'lucide-react';
import { apiClient } from './api/client';
import type { SliceStats } from './types';
import STLViewer from './components/STLViewer';
import ThreeMFViewer from './components/ThreeMFViewer';
import CodeEditor from './components/CodeEditor';
import SliceSettings, { type SliceSettingsData } from './components/SliceSettings';
import GCodeViewer from './components/GCodeViewer';
import DesignHistory from './components/DesignHistory';
import ParametersPanel from './components/ParametersPanel';
import type { CADDesign } from './types';

// ── Extended stats for Polyslice ─────────────────────────────────────────────
interface ExtendedSliceStats extends SliceStats {
  filament_length_mm?: number;
}

// ── Loading state keys ────────────────────────────────────────────────────────
interface LoadingState {
  generate: boolean;
  compile:  boolean;
  convert:  boolean;
  slice:    boolean;
}

export default function App() {
  const [prompt, setPrompt] = useState('watch with 40mm case, black case, white dial');

  // Pipeline state
  const [scadCode,   setScadCode]   = useState<string | null>(null);
  const [stlBase64,  setStlBase64]  = useState<string | null>(null);
  const [mf3Base64,  setMf3Base64]  = useState<string | null>(null);
  const [gcode,      setGcode]      = useState<string>('');
  const [gcodeStats, setGcodeStats] = useState<ExtendedSliceStats | null>(null);
  const [slicerUsed,  setSlicerUsed]  = useState<string | undefined>(undefined);
  const [printerModel, setPrinterModel] = useState<string | undefined>(undefined);
  const [filamentType, setFilamentType] = useState<string | undefined>(undefined);

  const [design,     setDesign]     = useState<CADDesign | null>(null);
  const [compileStats, setCompileStats] = useState<any>(null);

  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState<LoadingState>({ generate: false, compile: false, convert: false, slice: false });

  const [activeTab, setActiveTab] = useState<'stl' | '3mf'>('stl');

  const setLoad = (key: keyof LoadingState, val: boolean) =>
    setLoading((l) => ({ ...l, [key]: val }));

  // ── Step 1: Generate OpenSCAD via Grok ──────────────────────────────────────
  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoad('generate', true);
    setError(null);
    // Reset downstream state
    setScadCode(null); setStlBase64(null); setMf3Base64(null);
    setGcode(''); setGcodeStats(null);

    try {
      const res  = await apiClient.generate(prompt);
      const data = res.data;
      if (data.error) throw new Error(data.error);
      setScadCode(data.openscad);
      setDesign(data);
      pendo.track('design_generated', {
        prompt: prompt.substring(0, 200),
        design_id: data.id || '',
        parameter_count: data.parameters?.length || 0,
        code_length: data.openscad?.length || 0,
        created_at: data.createdAt || '',
      });
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Generation failed');
    } finally {
      setLoad('generate', false);
    }
  };

  // ── Step 2: Compile OpenSCAD → STL ──────────────────────────────────────────
  const handleCompile = useCallback(async (code: string) => {
    if (!code) return;
    setLoad('compile', true);
    setError(null);
    setStlBase64(null); setMf3Base64(null);
    setGcode(''); setGcodeStats(null);

    try {
      const res  = await apiClient.compileStl(code);
      const data = res.data;
      if (data.error || !data.stl) throw new Error(data.error || 'Compile returned no STL');
      setStlBase64(data.stl);
      setCompileStats(data.stats);
      setActiveTab('stl');
      pendo.track('openscad_compiled', {
        vertices: data.stats?.vertices || 0,
        faces: data.stats?.faces || 0,
        file_size_bytes: data.stats?.fileSize || 0,
        compilation_time_seconds: data.stats?.compilationTime || 0,
        code_length: code.length,
      });
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Compilation failed');
    } finally {
      setLoad('compile', false);
    }
  }, []);

  // ── Step 3: Convert STL → 3MF with colors ────────────────────────────────────
  const handleConvertTo3mf = async () => {
    if (!stlBase64) return;
    setLoad('convert', true);
    setError(null);

    try {
      const res  = await apiClient.convertTo3mf(stlBase64, scadCode || '');
      const data = res.data;
      if (data.error || !data['3mf']) throw new Error(data.error || '3MF conversion returned no data');
      setMf3Base64(data['3mf']);
      setActiveTab('3mf');
      pendo.track('stl_converted_to_3mf', {
        color_count: (scadCode || '').match(/color\s*\(/g)?.length || 0,
        vertices: compileStats?.vertices || 0,
        faces: compileStats?.faces || 0,
        file_size_bytes: Math.ceil(data['3mf'].length * 3 / 4),
      });
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || '3MF conversion failed');
    } finally {
      setLoad('convert', false);
    }
  };

  // ── Step 4: Slice STL → G-code via Polyslice ────────────────────────────────
  const handleSlice = async (settings: SliceSettingsData) => {
    if (!stlBase64) return;
    setLoad('slice', true);
    setError(null);
    setGcode(''); setGcodeStats(null);

    try {
      const res  = await apiClient.sliceGcode(stlBase64, settings as any);
      const data = res.data;
      if (data.error || !data.gcode) throw new Error(data.error || 'Slicing returned no G-code');
      setGcode(data.gcode);
      setGcodeStats(data.stats || null);
      setSlicerUsed(data.slicer_used);
      setPrinterModel(data.printer_model);
      setFilamentType(data.filament_type);
      pendo.track('model_sliced', {
        printer_model: data.printer_model || '',
        layer_height: settings.layer_height || 0,
        infill_density: settings.infill_density || 0,
        wall_line_count: settings.wall_line_count || 0,
        support_enabled: !!settings.support_enabled,
        print_time_minutes: data.stats?.print_time_minutes || 0,
        filament_grams: data.stats?.filament_grams || 0,
        layers: data.stats?.layers || 0,
        filament_length_mm: data.stats?.filament_length_mm || 0,
        slicer_used: data.slicer_used || '',
        filament_type: data.filament_type || '',
      });
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Slicing failed');
    } finally {
      setLoad('slice', false);
    }
  };

  // ── Downloads ─────────────────────────────────────────────────────────────
  const downloadFile = (b64: string, filename: string, mime = 'application/octet-stream') => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const url   = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a     = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadStl = () => {
    if (!stlBase64) return;
    downloadFile(stlBase64, 'model.stl', 'model/stl');
    pendo.track('file_downloaded', {
      file_type: 'stl',
      file_name: 'model.stl',
      file_size_bytes: Math.ceil(stlBase64.length * 3 / 4),
      mime_type: 'model/stl',
    });
  };
  const handleDownloadMf3 = () => {
    if (!mf3Base64) return;
    downloadFile(mf3Base64, 'model.3mf', 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml');
    pendo.track('file_downloaded', {
      file_type: '3mf',
      file_name: 'model.3mf',
      file_size_bytes: Math.ceil(mf3Base64.length * 3 / 4),
      mime_type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
    });
  };
  const handleDownloadCode = () => {
    if (!scadCode) return;
    const url = URL.createObjectURL(new Blob([scadCode], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = 'model.scad'; a.click(); URL.revokeObjectURL(url);
    pendo.track('file_downloaded', {
      file_type: 'scad',
      file_name: 'model.scad',
      file_size_bytes: scadCode.length,
      mime_type: 'text/plain',
    });
  };
  const handleDownloadGcode = () => {
    if (!gcode) return;
    const filename = `design_${Date.now()}.gcode`;
    const url = URL.createObjectURL(new Blob([gcode], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
    pendo.track('file_downloaded', {
      file_type: 'gcode',
      file_name: filename,
      file_size_bytes: gcode.length,
      mime_type: 'text/plain',
    });
  };

  // Load a saved design
  const handleLoadDesign = (d: CADDesign) => {
    setScadCode(d.openscad);
    setDesign(d);
    setPrompt(d.prompt);
    setStlBase64(null); setMf3Base64(null);
    setGcode(''); setGcodeStats(null);
    setError(null);
    pendo.track('design_loaded_from_history', {
      design_id: d.id,
      prompt: d.prompt.substring(0, 200),
      parameter_count: d.parameters?.length || 0,
      design_created_at: d.createdAt || '',
    });
  };

  const anyLoading = Object.values(loading).some(Boolean);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ── Top bar ── */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-orange-500 flex items-center justify-center shadow-lg">
              <Cpu className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold font-mono text-slate-100 leading-none">ThinkPrint</h1>
              <p className="text-[10px] text-slate-500 font-mono">AI → OpenSCAD → STL → 3MF → G-Code</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
            <span className="px-2 py-0.5 rounded-full border border-orange-800 bg-orange-950/30 text-orange-400">Polyslice v26.4</span>
            <span className="px-2 py-0.5 rounded-full border border-indigo-800 bg-indigo-950/30 text-indigo-400">Grok API</span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 bg-red-950/30 border border-red-800/60 rounded-xl p-4">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-300">Error</p>
              <p className="text-xs text-red-400 mt-0.5 break-words">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400 text-xs font-mono">✕</button>
          </div>
        )}

        {/* Pipeline steps indicator */}
        <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500 overflow-x-auto pb-1">
          {(['Prompt', 'OpenSCAD', 'STL', '3MF', 'G-Code'] as const).map((step, i) => (
            <React.Fragment key={step}>
              <span className={`px-2 py-0.5 rounded whitespace-nowrap ${
                (i === 0 && scadCode)   ? 'text-indigo-400 border border-indigo-800' :
                (i === 1 && stlBase64)  ? 'text-indigo-400 border border-indigo-800' :
                (i === 2 && mf3Base64)  ? 'text-indigo-400 border border-indigo-800' :
                (i === 3 && gcode)      ? 'text-orange-400 border border-orange-800' :
                'text-slate-600 border border-slate-800'
              }`}>{step}</span>
              {i < 4 && <ChevronRight className="h-3 w-3 shrink-0 text-slate-700" />}
            </React.Fragment>
          ))}
        </div>

        {/* ── STEP 1: Prompt + Generate ─────────────────────────────── */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider font-mono">
              1 · Generate Design
            </h2>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !anyLoading && handleGenerate()}
              placeholder="Describe your 3D design..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-600 font-mono transition"
            />
            <button
              onClick={handleGenerate}
              disabled={loading.generate || !prompt.trim()}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {loading.generate ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating...</> : <><Sparkles className="h-4 w-4" /> Generate</>}
            </button>
          </div>
        </section>

        {/* ── STEP 2: OpenSCAD Code Editor + Compile ───────────────── */}
        {scadCode !== null && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">2 · OpenSCAD Code</span>
            </div>
            <CodeEditor
              code={scadCode}
              onCompile={handleCompile}
              isCompiling={loading.compile}
            />
            {/* Parameters panel if design has params */}
            {design?.parameters && design.parameters.length > 0 && stlBase64 && (
              <ParametersPanel
                parameters={design.parameters}
                code={scadCode}
                onRecompile={handleCompile}
                isCompiling={loading.compile}
              />
            )}
          </section>
        )}

        {/* ── STEP 3: 3D Viewer (STL / 3MF tabs) + Actions ────────── */}
        {(stlBase64 || loading.compile) && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">3 · 3D Preview</span>
              {compileStats && (
                <span className="text-[10px] font-mono text-slate-600">
                  {compileStats.faces?.toLocaleString()} faces · {(compileStats.fileSize / 1024).toFixed(0)}KB
                </span>
              )}
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-slate-800">
              {(['stl', '3mf'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  disabled={tab === '3mf' && !mf3Base64}
                  className={`px-4 py-2 text-xs font-mono font-semibold transition border-b-2 ${
                    activeTab === tab
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed'
                  }`}
                >
                  {tab === 'stl' ? 'STL View' : '3MF Colors'}
                </button>
              ))}
            </div>

            {activeTab === 'stl' ? (
              <STLViewer stlBase64={stlBase64} isLoading={loading.compile} />
            ) : (
              <ThreeMFViewer mfBase64={mf3Base64} isLoading={loading.convert} />
            )}

            {/* Action row */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleConvertTo3mf}
                disabled={loading.convert || !stlBase64}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-950/40 border border-emerald-800 hover:bg-emerald-900/40 text-emerald-400 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading.convert ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Converting...</> : <><Package className="h-3.5 w-3.5" /> Convert to 3MF</>}
              </button>
              <button onClick={handleDownloadStl} disabled={!stlBase64}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed">
                <Download className="h-3.5 w-3.5" /> STL
              </button>
              {mf3Base64 && (
                <button onClick={handleDownloadMf3}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition">
                  <Download className="h-3.5 w-3.5" /> 3MF
                </button>
              )}
              {scadCode && (
                <button onClick={handleDownloadCode}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition">
                  <Download className="h-3.5 w-3.5" /> .scad
                </button>
              )}
            </div>
          </section>
        )}

        {/* ── STEP 4: Slice Settings ────────────────────────────────── */}
        {stlBase64 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">4 · Slice to G-Code</span>
            </div>
            <SliceSettings
              stlBase64={stlBase64}
              onSlice={handleSlice}
              loading={loading.slice}
            />
          </section>
        )}

        {/* ── STEP 5: G-Code viewer ─────────────────────────────────── */}
        {(gcode || loading.slice) && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">5 · G-Code</span>
            </div>
            <GCodeViewer
              gcode={gcode}
              stats={gcodeStats ?? undefined}
              slicerUsed={slicerUsed}
              printerModel={printerModel}
              filamentType={filamentType}
              isLoading={loading.slice}
              onDownload={handleDownloadGcode}
            />
          </section>
        )}

        {/* ── Design History ────────────────────────────────────────── */}
        <section>
          <DesignHistory onSelectDesign={handleLoadDesign} />
        </section>

      </div>
    </div>
  );
}
