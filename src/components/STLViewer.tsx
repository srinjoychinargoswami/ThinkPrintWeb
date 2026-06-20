import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface STLViewerProps {
  stlBase64: string | null;
  isLoading?: boolean;
}

export default function STLViewer({ stlBase64, isLoading = false }: STLViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Tear down previous scene
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    if (!stlBase64 || !mountRef.current) return;

    const container = mountRef.current;
    const width  = container.clientWidth  || 600;
    const height = container.clientHeight || 400;

    // Scene setup
    const scene    = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // slate-900 equivalent

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    camera.position.set(0, 0, 200);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(100, 200, 150);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x8899ff, 0.4);
    fillLight.position.set(-100, -50, -100);
    scene.add(fillLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.05;
    controls.enableZoom     = true;
    controls.autoRotate     = true;
    controls.autoRotateSpeed = 1.2;

    // Load STL
    const loader = new STLLoader();
    const stlArrayBuffer = Uint8Array.from(atob(stlBase64), (c) => c.charCodeAt(0)).buffer;
    const geometry = loader.parse(stlArrayBuffer);
    geometry.computeVertexNormals();

    // Center model
    geometry.computeBoundingBox();
    const box    = geometry.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);

    // Auto-fit camera to model
    const size    = new THREE.Vector3();
    box.getSize(size);
    const maxDim  = Math.max(size.x, size.y, size.z);
    const fitDist = maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.set(0, 0, fitDist * 1.4);
    camera.near = fitDist * 0.01;
    camera.far  = fitDist * 20;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();

    // Gray material (solid slate)
    const material = new THREE.MeshPhongMaterial({
      color: 0x94a3b8,       // slate-400
      specular: 0x334155,    // subtle highlight
      shininess: 40,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Grid helper
    const gridHelper = new THREE.GridHelper(maxDim * 2, 20, 0x1e293b, 0x1e293b);
    gridHelper.position.y = -size.z / 2 - 0.5;
    scene.add(gridHelper);

    // Resize handler
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    cleanupRef.current = () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };

    return () => {
      if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    };
  }, [stlBase64]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950" style={{ height: 400 }}>
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-2" />
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Compiling STL...</span>
        </div>
      )}
      {!stlBase64 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-slate-600 font-mono text-sm">Compile OpenSCAD to see 3D preview</p>
        </div>
      )}
      <div ref={mountRef} className="w-full h-full" />
    </div>
  );
}
