import React, { useState, useEffect } from "react";
import { CADDesign } from "../types";
import { FolderHeart, Search, Trash2, Calendar, FileCode, CheckCircle2, RotateCcw } from "lucide-react";

interface DesignHistoryProps {
  onLoadDesign: (design: CADDesign) => void;
  activeDesignId: string | null;
  refreshCount: number;
}

export default function DesignHistory({ onLoadDesign, activeDesignId, refreshCount }: DesignHistoryProps) {
  const [designs, setDesigns] = useState<CADDesign[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load personal history from localStorage only
  const loadPersonalHistory = () => {
    try {
      const saved = localStorage.getItem('thinkprintweb_personal_designs');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to load personal history:', e);
      return [];
    }
  };

  // Save design to personal history
  const saveToPersonalHistory = (design: CADDesign) => {
    try {
      const history = loadPersonalHistory();
      // Check if design already exists
      const exists = history.some((d: CADDesign) => d.id === design.id);
      if (!exists) {
        history.unshift(design); // Add to top
        localStorage.setItem('thinkprintweb_personal_designs', JSON.stringify(history));
      }
    } catch (e) {
      console.error('Failed to save to personal history:', e);
    }
  };

  // Fetch ONLY personal designs (from localStorage)
  const fetchDesigns = async () => {
    setLoading(true);
    setError(null);
    try {
      const personalDesigns = loadPersonalHistory();
      setDesigns(personalDesigns);
    } catch (e: any) {
      console.error(e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDesigns();
  }, [refreshCount]);

  // Handle specific design removal
  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to permanently delete this CAD design from your personal history?")) return;

    try {
      const history = loadPersonalHistory();
      const updated = history.filter((d: CADDesign) => d.id !== id);
      localStorage.setItem('thinkprintweb_personal_designs', JSON.stringify(updated));
      setDesigns(updated);
    } catch (e: any) {
      alert("Failed to delete design: " + e.message);
    }
  };

  // Filter list by prompt name
  const filteredDesigns = designs.filter((d) =>
    d.prompt.toLowerCase().includes(search.toLowerCase()) ||
    d.openscad.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden p-4">
      <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <FolderHeart className="h-5 w-5 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">My Design History</h3>
        </div>
        <button
          onClick={fetchDesigns}
          className="text-[10px] text-slate-400 font-mono hover:text-indigo-400 transition flex items-center gap-1"
          title="Refresh history"
        >
          <RotateCcw className="h-3 w-3" /> refresh
        </button>
      </div>

      {/* Search Filter */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
        <input
          type="text"
          placeholder="Filter your designs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg outline-none focus:border-indigo-500 font-medium transition"
        />
      </div>

      {/* Personal designs list */}
      <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px] md:max-h-none pr-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <span className="flex h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Loading history...</span>
          </div>
        ) : error ? (
          <div className="text-center py-6">
            <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/50 p-2.5 rounded-lg">{error}</p>
          </div>
        ) : filteredDesigns.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <CheckCircle2 className="h-8 w-8 mx-auto text-slate-800 mb-2" />
            <p className="text-xs font-medium">No designs saved yet.</p>
            <p className="text-[10px] text-slate-600 mt-1 max-w-[150px] mx-auto">Generate a model with AI to save it to your personal history!</p>
          </div>
        ) : (
          filteredDesigns.map((d) => {
            const isActive = d.id === activeDesignId;
            const dateStr = new Date(d.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <div
                key={d.id}
                onClick={() => {
                  onLoadDesign(d);
                  saveToPersonalHistory(d);
                }}
                className={`group p-3 rounded-xl border cursor-pointer text-left transition relative ${isActive ? "bg-indigo-950/40 border-indigo-500 shadow-md" : "bg-slate-900/90 border-slate-850 hover:bg-slate-850 hover:border-slate-700"}`}
              >
                {/* Prompt block */}
                <h4 className="text-xs font-semibold text-slate-200 line-clamp-1 pr-6 uppercase tracking-tight">{d.prompt}</h4>
                
                {/* Visual labels */}
                <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-500 font-mono">
                  <Calendar className="h-3 w-3 text-slate-600" />
                  <span>{dateStr}</span>
                </div>

                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 font-mono">
                  <FileCode className="h-3 w-3 text-slate-600" />
                  <span>{d.parameters.length} custom sliders</span>
                </div>

                {/* Deletion button hidden until hover */}
                <button
                  onClick={(e) => handleDelete(d.id, e)}
                  className="absolute right-2 top-2 p-1.5 rounded bg-slate-950 border border-slate-800 hover:border-red-800 hover:bg-red-950/20 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition duration-200 z-10"
                  title="Delete from your history"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}