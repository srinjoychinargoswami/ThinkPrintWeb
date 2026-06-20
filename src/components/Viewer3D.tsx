import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box, AlertTriangle, RefreshCw } from 'lucide-react';
import { extractColorsFromOpenSCAD } from '../lib/colorExtract';

interface Viewer3DProps {
  stlBase64: string | null;
  scadCode: string;
  isLoading?: boolean;
}

interface MeshStats {
  vertices: number;
  faces: number;
  size: { x: number; y: number; z: number };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bytes = atob(base64);
  const buffer = new ArrayBuffer(bytes.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) view[i] = bytes.charCodeAt(i);
  return buffer;
}

export default function Viewer3D({ stlBase64, scadCode, isLoading = false }: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const frameRef = useRef<number>(0);

  const [stats, setStats] = useState<MeshStats | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // --- One-time scene setup ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    camera.position.set(60, 60, 120);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    // Lighting per spec
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(5, 10, 7.5);
    scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0x8888ff, 0.3);
    dir2.position.set(-5, -10, -7.5);
    scene.add(dir2);

    const grid = new THREE.GridHelper(100, 20, 0x334155, 0x1e293b);
    grid.position.y = 0;
    scene.add(grid);

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frameRef.current);
      resizeObserver.disconnect();
      controls.dispose();
      if (meshRef.current) {
        meshRef.current.geometry.dispose();
        (meshRef.current.material as THREE.Material).dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // --- Load / update STL geometry when inputs change ---
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls) return;

    // Remove old mesh
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      (meshRef.current.material as THREE.Material).dispose();
      meshRef.current = null;
    }

    setParseError(null);

    if (!stlBase64) {
      setStats(null);
      return;
    }

    try {
      const buffer = base64ToArrayBuffer(stlBase64);
      const loader = new STLLoader();
      const geometry = loader.parse(buffer);

      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const center = new THREE.Vector3();
      box.getCenter(center);
      const size = new THREE.Vector3();
      box.getSize(size);

      const colors = extractColorsFromOpenSCAD(scadCode);
      const [r, g, b] = colors.primary;
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(r, g, b),
        roughness: 0.45,
        metalness: 0.15,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      meshRef.current = mesh;

      // Auto-fit camera
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      camera.position.set(center.x, center.y + maxDim, center.z + maxDim * 2.5);
      camera.near = maxDim / 100;
      camera.far = maxDim * 100;
      camera.updateProjectionMatrix();
      camera.lookAt(center);
      controls.target.copy(center);
      controls.update();

      const posCount = geometry.getAttribute('position')?.count ?? 0;
      const faces = posCount / 3;
      setStats({
        vertices: posCount,
        faces,
        size: {
          x: Number(size.x.toFixed(1)),
          y: Number(size.y.toFixed(1)),
          z: Number(size.z.toFixed(1)),
        },
      });
    } catch (e) {
      console.error('Failed to parse STL:', e);
      setStats(null);
      setParseError('Failed to parse STL geometry. The model may be invalid or empty.');
    }
  }, [stlBase64, scadCode]);

  return (
    <div className="relative flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden h-[450px]">
      {/* Header overlay */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950/85 backdrop-blur border border-slate-800 pointer-events-none">
        <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-mono font-medium text-slate-300">WebGL STL Preview</span>
      </div>

      {/* Stats overlay */}
      {stats && (
        <div className="absolute top-3 right-3 z-10 px-3 py-2 rounded-lg bg-slate-950/85 backdrop-blur border border-slate-800 text-[10px] font-mono text-slate-400 leading-relaxed pointer-events-none">
          <div>{stats.faces.toLocaleString()} faces</div>
          <div>{stats.vertices.toLocaleString()} verts</div>
          <div className="text-slate-500">
            {stats.size.x} × {stats.size.y} × {stats.size.z} mm
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider font-mono">
              Compiling STL...
            </span>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {parseError && !isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/70 p-6">
          <div className="flex flex-col items-center gap-2 text-center max-w-sm">
            <AlertTriangle className="h-8 w-8 text-amber-400" />
            <p className="text-xs text-amber-400 font-medium">{parseError}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!stlBase64 && !isLoading && !parseError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-center max-w-xs">
            <Box className="h-10 w-10 text-slate-700" />
            <p className="text-xs text-slate-500 font-medium">
              Generate a design or adjust parameters to compile a 3D STL preview.
            </p>
          </div>
        </div>
      )}

      <div ref={containerRef} className="flex-1 w-full bg-slate-950" />

      {/* Mouse guides */}
      <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between text-[10px] font-mono text-slate-500 pointer-events-none">
        <span>Drag: rotate · Scroll: zoom · Right-drag: pan</span>
        <span>mm workbench</span>
      </div>
    </div>
  );
}
