import React, { useState, useEffect } from 'react';
import { Code2, Edit3, Check, RefreshCw, Copy } from 'lucide-react';

interface CodeEditorProps {
  code: string;
  onCompile: (code: string) => void;
  isCompiling: boolean;
}

export default function CodeEditor({ code, onCompile, isCompiling }: CodeEditorProps) {
  const [editMode, setEditMode]   = useState(false);
  const [editedCode, setEditedCode] = useState(code);
  const [copied, setCopied]       = useState(false);

  // Sync editedCode when upstream code changes (new design generated)
  useEffect(() => {
    if (!editMode) setEditedCode(code);
  }, [code, editMode]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editMode ? editedCode : code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const handleDoneEditing = () => {
    setEditMode(false);
  };

  const displayCode = editMode ? editedCode : code;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <Code2 className="h-4 w-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider font-mono">
          OpenSCAD Code
        </h3>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-mono font-semibold transition ${
              editMode
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {editMode ? (
              <><Check className="h-3 w-3" /> Done Editing</>
            ) : (
              <><Edit3 className="h-3 w-3" /> Edit</>
            )}
          </button>
        </div>
      </div>

      {/* Code area */}
      {editMode ? (
        <textarea
          value={editedCode}
          onChange={(e) => setEditedCode(e.target.value)}
          spellCheck={false}
          className="w-full bg-slate-950 text-indigo-300 font-mono text-[12px] p-3 rounded-lg border border-indigo-800/60 outline-none resize-none leading-relaxed focus:border-indigo-500 transition"
          style={{ height: 280 }}
          placeholder="OpenSCAD code..."
        />
      ) : (
        <pre
          className="w-full bg-slate-950 text-slate-300 font-mono text-[11px] p-3 rounded-lg border border-slate-800 overflow-auto leading-relaxed"
          style={{ height: 280, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {code || <span className="text-slate-600 italic">No code generated yet. Enter a prompt and click Generate.</span>}
        </pre>
      )}

      {/* Compile button */}
      <button
        onClick={() => {
          if (editMode) handleDoneEditing();
          onCompile(editMode ? editedCode : code);
        }}
        disabled={isCompiling || !displayCode.trim()}
        className="w-full py-2.5 rounded-lg font-semibold text-sm transition text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isCompiling ? (
          <><RefreshCw className="h-4 w-4 animate-spin" /> Compiling OpenSCAD...</>
        ) : (
          <><Code2 className="h-4 w-4" /> Compile to STL</>
        )}
      </button>

      {editMode && (
        <p className="text-[10px] text-indigo-400/70 font-mono text-center">
          Editing mode — changes compile on "Compile to STL"
        </p>
      )}
    </div>
  );
}
