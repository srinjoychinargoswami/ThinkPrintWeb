import axios from 'axios';
import type { SliceSettings } from '../types';

const api = axios.create({ baseURL: '/api', timeout: 60000 });

export interface GenerateResult {
  id?: string;
  prompt?: string;
  openscad: string;
  // The existing /designs/generate endpoint returns the full design object;
  // `code` is provided as a convenience alias by the client wrapper.
  code?: string;
  parameters?: unknown[];
  createdAt?: string;
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
