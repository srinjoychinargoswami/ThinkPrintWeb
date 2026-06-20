/**
 * Viewer3MF — renders a 3MF file (base64-encoded) using Three.js's built-in
 * 3MFLoader. Supports the full 3MF color spec: colorgroups, basematerials,
 * texture 2D, and vertex colors. Since Three.js r0.137+ the loader is bundled
 * and imports from 'three/examples/jsm/loaders/3MFLoader.js'.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Palette, RotateCcw, ZoomIn } from 'lucide-react';

interface Viewer3MFProps {
  /** Base64-encoded 3MF file data */
  mfBase64: string | null;
  /** Optional: extracted color palette to display as swatches */
  colorPalette?: string[];
  isLoading?: boolean;
  className?: string;
}

export default function Viewer3MF({
  mfBase64,
  colorPalette,
  isLoading = false,
  className = '',
}: Viewer3MFProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef  = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number>(0);
  const sceneRef     = useRef<THREE.Scene | null>(null);

  const [parseError, setParseError] = useState<string | null>(null);
  const [stats, setStats]           = useState<{ meshes: number; vertices: number } | null>(null);

  // ─── Reset viewer ──────────────────────────────────────────────────────────
  const resetView = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current || !sceneRef.current) return;
    const box = new THREE.Box3().setFromObject(sceneRef.current);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    cameraRef.current.position.set(center.x, center.y + maxDim * 0.8, center.z + maxDim * 2);
    cameraRef.current.lookAt(center);
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  }, []);

  // ─── Three.js scene lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Renderer ────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── Scene ────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827); // slate-900
    sceneRef.current = scene;

    // Grid
    const grid = new THREE.GridHelper(200, 40, 0x1e293b, 0x1e293b);
    scene.add(grid);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(8, 15, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8899ff, 0.35);
    fill.position.set(-8, 5, -10);
    scene.add(fill);

    // ── Camera ───────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.01, 5000);
    camera.position.set(0, 80, 160);
    cameraRef.current = camera;

    // ── Controls ─────────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 1;
    controls.maxDistance = 3000;
    controlsRef.current = controls;

    // ── Render loop ───────────────────────────────────────────────────────────
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ── ResizeObserver ────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth, h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      rendererRef.current = null;
      cameraRef.current   = null;
      controlsRef.current = null;
      sceneRef.current    = null;
    };
  }, []);

  // ─── Load 3MF whenever mfBase64 changes ────────────────────────────────────
  useEffect(() => {
    if (!mfBase64 || !sceneRef.current) return;

    setParseError(null);
    setStats(null);

    // Remove any previously loaded model group (keep lights + grid)
    sceneRef.current.children
      .filter(c => (c as any).__isModel)
      .forEach(c => {
        sceneRef.current!.remove(c);
        c.traverse((obj: any) => {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
          else obj.material?.dispose();
        });
      });

    try {
      // Decode base64 → ArrayBuffer
      const bin = atob(mfBase64);
      const ab  = new ArrayBuffer(bin.length);
      const u8  = new Uint8Array(ab);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);

      // Three.js 3MFLoader.parse() accepts ArrayBuffer and returns THREE.Group
      const loader = new ThreeMFLoader();
      const group  = loader.parse(ab) as THREE.Group;
      (group as any).__isModel = true;

      // Rotate: 3MF uses Z-up, Three.js uses Y-up
      group.rotation.set(-Math.PI / 2, 0, 0);

      // Enable shadows on all meshes; tally stats
      let meshCount = 0, vertCount = 0;
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow    = true;
          obj.receiveShadow = true;
          meshCount++;
          vertCount += (obj.geometry.attributes.position?.count ?? 0);
        }
      });

      sceneRef.current!.add(group);
      setStats({ meshes: meshCount, vertices: vertCount });

      // Auto-fit camera to loaded model
      const box    = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      const size   = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 1);
      if (cameraRef.current && controlsRef.current) {
        cameraRef.current.position.set(center.x, center.y + maxDim, center.z + maxDim * 2);
        cameraRef.current.lookAt(center);
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }
    } catch (err: any) {
      console.error('[Viewer3MF] Parse error:', err);
      setParseError(err?.message || 'Failed to parse 3MF file.');
    }
  }, [mfBase64]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`relative flex flex-col rounded-xl overflow-hidden border border-slate-800 bg-slate-900 shadow-xl ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-pink-400" />
          <span className="text-xs font-semibold font-mono text-slate-300 uppercase tracking-wider">
            Full Color 3MF Viewer
          </span>
          {stats && (
            <span className="text-[10px] font-mono text-slate-500">
              {stats.meshes} mesh{stats.meshes !== 1 ? 'es' : ''} · {stats.vertices.toLocaleString()} verts
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {colorPalette && colorPalette.length > 0 && (
            <div className="flex items-center gap-1">
              {colorPalette.slice(0, 6).map((hex, i) => (
                <span
                  key={i}
                  title={hex}
                  className="h-4 w-4 rounded-full border border-slate-700 shadow"
                  style={{ backgroundColor: hex }}
                />
              ))}
              {colorPalette.length > 6 && (
                <span className="text-[10px] text-slate-500 font-mono">+{colorPalette.length - 6}</span>
              )}
            </div>
          )}
          <button
            onClick={resetView}
            title="Reset camera"
            className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas container */}
      <div ref={containerRef} className="w-full" style={{ height: 380 }}>
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 z-10">
            <div className="h-8 w-8 border-2 border-pink-500 border-t-transparent animate-spin rounded-full" />
            <p className="text-xs text-slate-400 font-mono">Generating 3MF with colors…</p>
          </div>
        )}

        {/* Empty state */}
        {!mfBase64 && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
            <ZoomIn className="h-10 w-10 text-slate-700" />
            <p className="text-sm text-slate-500">Click <span className="text-pink-400 font-semibold">View with All Colors</span> to convert the design to 3MF and see every color from the OpenSCAD code.</p>
          </div>
        )}

        {/* Parse error */}
        {parseError && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6">
            <p className="text-xs text-red-400 font-mono text-center">{parseError}</p>
          </div>
        )}
      </div>

      {/* Footer tip */}
      <div className="px-4 py-2 border-t border-slate-800 bg-slate-950/50">
        <p className="text-[10px] text-slate-600 font-mono">
          Colors are extracted from OpenSCAD <code className="text-slate-500">color()</code> statements and embedded in the 3MF file. Drag to rotate · scroll to zoom · right-drag to pan.
        </p>
      </div>
    </div>
  );
}
