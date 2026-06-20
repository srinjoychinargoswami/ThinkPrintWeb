import axios from 'axios';
import type { SliceSettings } from '../types';

// Get backend URL from environment variable or default to localhost
const BACKEND_URL = (import.meta.env as any).REACT_APP_BACKEND_URL || 'http://localhost:3000';

const api = axios.create({ 
  baseURL: `${BACKEND_URL}/api`, 
  timeout: 60000 
});

export interface GenerateResult {
  id?: string;
  prompt?: string;
  openscad: string;
  code?: string;
  parameters?: Array<{
    name: string;
    min: number;
    step: number;
    max: number;
  }>;
  createdAt?: string;
  error?: string;
}

export interface CompileResult {
  stl: string | null;
  stats: {
    vertices: number;
    faces: number;
    fileSize: number;
    compilationTime: number;
  };
  error?: string | null;
}

export interface SliceResult {
  gcode: string | null;
  stats: {
    print_time_minutes: number;
    filament_grams: number;
    layers: number;
  } | null;
  slicer_used?: string;
  printer_model?: string;
  filament_type?: string;
  error?: string | null;
}

export interface ConvertResult {
  '3mf': string | null;
  stats: {
    vertices: number;
    faces: number;
    fileSize: number;
  };
  error?: string | null;
}

export const apiClient = {
  generate: (prompt: string) => api.post<GenerateResult>('/designs/generate', { prompt }),
  compileStl: (code: string) => api.post<CompileResult>('/compile-stl', { code }),
  sliceGcode: (stl: string, settings: SliceSettings) =>
    api.post<SliceResult>('/slice-gcode', { stl, settings }),
  convertTo3mf: (stl: string, code: string) =>
    api.post<ConvertResult>('/convert-stl-to-3mf', { stl, code }),
};

export default apiClient;