import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal, RefreshCw } from 'lucide-react';
import {
  extractParametersFromOpenSCAD,
  updateParameterInCode,
  type ScadParameter,
} from '../lib/parameterExtract';
import { extractColorsFromOpenSCAD } from '../lib/colorExtract';

interface ParametersPanelProps {
  scadCode: string;
  onCodeChange: (newCode: string) => void;
  isCompiling?: boolean;
}

export default function ParametersPanel({
  scadCode,
  onCodeChange,
  isCompiling = false,
}: ParametersPanelProps) {
  const baseParams = useMemo(() => extractParametersFromOpenSCAD(scadCode), [scadCode]);
  const colors = useMemo(() => extractColorsFromOpenSCAD(scadCode), [scadCode]);

  // Local immediate values for smooth sliders; reset when source code changes.
  const [values, setValues] = useState<Record<string, number>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const next: Record<string, number> = {};
    baseParams.forEach((p) => {
      next[p.name] = p.value;
    });
    setValues(next);
  }, [scadCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (param: ScadParameter, raw: number) => {
    setValues((prev) => ({ ...prev, [param.name]: raw }));

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const updated = updateParameterInCode(scadCode, param.name, raw);
      if (updated !== scadCode) onCodeChange(updated);
    }, 400);
  };

  const primaryCss = `rgb(${colors.primary
    .map((c) => Math.round(c * 255))
    .join(',')})`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider font-mono">
            Parameters
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-500 uppercase">Color</span>
          <span
            className="h-4 w-4 rounded border border-slate-700"
            style={{ backgroundColor: primaryCss }}
            title={primaryCss}
          />
          {isCompiling && <RefreshCw className="h-3.5 w-3.5 text-indigo-400 animate-spin" />}
        </div>
      </div>

      <div className="flex-1 space-y-4 py-1 overflow-y-auto max-h-[350px] pr-1">
        {baseParams.length === 0 ? (
          <p className="text-xs text-slate-500 font-medium">No adjustable parameters found</p>
        ) : (
          baseParams.map((p) => {
            const current = values[p.name] ?? p.value;
            return (
              <div
                key={p.name}
                className="space-y-1 bg-slate-950 p-3 rounded-lg border border-slate-800"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">{p.label}</span>
                  <span className="text-xs font-mono font-bold text-indigo-400">{current}</span>
                </div>
                <input
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={current}
                  disabled={isCompiling}
                  onChange={(e) => handleChange(p, parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-50"
                />
                <div className="flex justify-between text-[8px] font-mono text-slate-600">
                  <span>{p.min}</span>
                  <span>{p.max}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
