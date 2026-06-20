export interface CADParameter {
  name: string;
  default: number;
  min: number;
  max: number;
  step: number;
  description?: string;
}

export type CADNodeType = 'cube' | 'cylinder' | 'sphere' | 'union' | 'difference' | 'intersection';

export interface CADVisualNode {
  type: CADNodeType;
  size?: [number | string, number | string, number | string];
  h?: number | string;
  d?: number | string;
  r?: number | string;
  center?: boolean;
  translate?: [number | string, number | string, number | string];
  rotate?: [number | string, number | string, number | string];
  scale?: [number | string, number | string, number | string];
  color?: string;
  children?: CADVisualNode[];
  subtract?: boolean;
}

export interface CADDesign {
  id: string;
  prompt: string;
  openscad: string;
  parameters: CADParameter[];
  visualTree?: CADVisualNode;
  createdAt: string;
}

// --- Slicing & compilation pipeline types ---

export type QualityProfile = 'draft' | 'standard' | 'fine' | 'functional';

export interface SliceSettings {
  // Polyslice settings (primary)
  layer_height?: number;
  infill_density?: number;
  wall_line_count?: number;
  support_enabled?: boolean;
  printer_model?: string;
  // Legacy cura-style aliases (accepted but mapped server-side)
  infill?: number;
  wall_thickness?: number;
  support?: boolean;
  profile?: QualityProfile;
}

export interface SliceStats {
  print_time_minutes: number;
  filament_grams: number;
  layers: number;
  /** Polyslice: total filament extrusion length in mm */
  filament_length_mm?: number;
}

export interface ScadParameter {
  name: string;
  value: number;
  min: number;
  step: number;
  max: number;
  label: string;
}

export interface CompileStats {
  vertices: number;
  faces: number;
  fileSize: number;
  compilationTime: number;
}
