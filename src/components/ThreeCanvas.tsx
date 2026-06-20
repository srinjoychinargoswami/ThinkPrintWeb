import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CADVisualNode } from "../types";
import { buildCompositeCAD } from "../lib/cadEvaluator";
import { Maximize2, Minimize2, ZoomIn, ZoomOut, Check, RefreshCw } from "lucide-react";

interface ThreeCanvasProps {
  visualTree: CADVisualNode | null;
  parameters: Record<string, number>;
  onMeshCompiled?: (mesh: THREE.Mesh | null) => void;
}

export default function ThreeCanvas({ visualTree, parameters, onMeshCompiled }: ThreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controls, setControls] = useState<OrbitControls | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Initialize Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0f172a"); // Dark slate background for cosmic premium feel
    sceneRef.current = scene;

    // Add cozy ambient fog
    scene.fog = new THREE.FogExp2("#0f172a", 0.002);

    // 2. Initialize Camera
    const aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(45, aspect, 1, 1000);
    // Position camera diagonally looking downwards
    camera.position.set(120, 120, 120);

    // 3. Initialize WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    
    // Clear previous children
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Orbit Controls
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.05;
    orbit.maxPolarAngle = Math.PI / 2 + 0.1; // allow looking slightly from below
    orbit.minDistance = 10;
    orbit.maxDistance = 400;
    setControls(orbit);

    // 5. Lights & Shadow Casting
    const ambientLight = new THREE.AmbientLight("#f8fafc", 0.65);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight("#ffffff", 0.85);
    dirLight.position.set(100, 150, 100);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    const d = 100;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight("#ffedd5", 0.35, 150);
    pointLight.position.set(-60, 40, -60);
    scene.add(pointLight);

    // 6. Grid & Ground Shadow Plane
    const gridHelper = new THREE.GridHelper(200, 40, "#334155", "#1e293b");
    gridHelper.position.y = -0.5;
    scene.add(gridHelper);

    // Ground shadow receiver
    const shadowGeo = new THREE.PlaneGeometry(300, 300);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.4 });
    const groundPlane = new THREE.Mesh(shadowGeo, shadowMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.6;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // Corner Axes Helper for orientation reference
    const axesHelper = new THREE.AxesHelper(30);
    // Shift axis slightly to remain unobtrusive
    axesHelper.position.set(-90, 0.1, -90);
    scene.add(axesHelper);

    // 7. Render Loop
    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    // 8. Track Resizing
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };
    
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      orbit.dispose();
      renderer.dispose();
    };
  }, []);

  // Update design mesh when visualTree or sliders change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !visualTree) return;

    setLoading(true);

    // Clean up previous compiled CAD mesh
    if (meshRef.current) {
      scene.remove(meshRef.current);
      // Recursively dispose geometries & materials
      meshRef.current.traverse((child: any) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
      meshRef.current = null;
    }

    try {
      // Build composite CAD geometry and apply slider selections
      const compositeMesh = buildCompositeCAD(visualTree, parameters);
      
      if (compositeMesh) {
        compositeMesh.castShadow = true;
        compositeMesh.receiveShadow = true;
        
        // Auto-center mesh in workspace for clean viewport focus
        const box = new THREE.Box3().setFromObject(compositeMesh);
        const center = new THREE.Vector3();
        box.getCenter(center);
        
        // Offset so base rests on the workbench floor
        compositeMesh.position.sub(center);
        compositeMesh.position.y += (box.max.y - box.min.y) / 2;

        scene.add(compositeMesh);
        meshRef.current = compositeMesh;

        // Callback with the final compilable model
        if (onMeshCompiled) {
          onMeshCompiled(compositeMesh);
        }
      } else {
        if (onMeshCompiled) onMeshCompiled(null);
      }
    } catch (e) {
      console.error("Failed to build 3D CAD mesh:", e);
      if (onMeshCompiled) onMeshCompiled(null);
    } finally {
      setTimeout(() => setLoading(false), 80);
    }
  }, [visualTree, parameters, onMeshCompiled]);

  const handleResetCamera = () => {
    if (controls) {
      controls.reset();
      controls.target.set(0, 0, 0);
    }
  };

  return (
    <div className={`relative flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition-all duration-300 ${isFullscreen ? "fixed inset-4 z-50 shadow-2xl" : "h-[450px]"}`}>
      {/* 3D Toolbar overlay */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950/85 backdrop-blur border border-slate-800 pointer-events-auto">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono font-medium text-slate-300">WebGL CAD Preview</span>
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={handleResetCamera}
            className="p-1.5 rounded-lg bg-slate-950/85 backdrop-blur border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            title="Reset camera view"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg bg-slate-950/85 backdrop-blur border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            title={isFullscreen ? "Exit full screen" : "Enter full screen"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider font-mono">Updating Visual CSG...</span>
          </div>
        </div>
      )}

      {/* Grid Canvas Wrapper */}
      <div id="three-view-canvas" ref={containerRef} className="flex-1 w-full bg-slate-950" />

      {/* Interactive mouse guides */}
      <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between text-[10px] font-mono text-slate-500 pointer-events-none md:flex-row flex-col gap-1">
        <div className="flex gap-2">
          <span>🖱️ Left Click + Drag: Rotate</span>
          <span>🖱️ Scroll Wheel: Zoom</span>
          <span>🖱️ Right Click + Drag: Pan</span>
        </div>
        <div>
          <span>Scale: MM workbench</span>
        </div>
      </div>
    </div>
  );
}
