import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';

interface ThreeMFViewerProps {
  mfBase64: string | null;
  isLoading?: boolean;
}

export default function ThreeMFViewer({ mfBase64, isLoading = false }: ThreeMFViewerProps) {
  const mountRef   = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    if (!mfBase64 || !mountRef.current) return;

    const container = mountRef.current;
    const width  = container.clientWidth  || 600;
    const height = container.clientHeight || 400;

    const scene    = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dir1.position.set(100, 200, 150);
    dir1.castShadow = true;
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x88aaff, 0.3);
    dir2.position.set(-100, -50, -100);
    scene.add(dir2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.05;
    controls.autoRotate     = true;
    controls.autoRotateSpeed = 1.2;

    // Decode base64 → ArrayBuffer
    const binary = atob(mfBase64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const arrayBuffer = bytes.buffer;

    // ThreeMFLoader parses the 3MF including color groups
    const loader = new ThreeMFLoader();
    const group  = loader.parse(arrayBuffer) as THREE.Group;

    // 3MF is Z-up, Three.js is Y-up
    group.rotation.set(-Math.PI / 2, 0, 0);

    // Compute bounding box to center and fit camera
    const box    = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    box.getCenter(center);
    group.position.sub(center);
    scene.add(group);

    const size   = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fitDist = maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.set(0, 0, fitDist * 1.4);
    camera.near = fitDist * 0.01;
    camera.far  = fitDist * 20;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();

    // Grid
    const grid = new THREE.GridHelper(maxDim * 2, 20, 0x1e293b, 0x1e293b);
    grid.position.y = -maxDim * 0.5;
    scene.add(grid);

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

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
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };

    return () => {
      if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    };
  }, [mfBase64]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950" style={{ height: 400 }}>
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-2" />
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Generating 3MF...</span>
        </div>
      )}
      {!mfBase64 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-slate-600 font-mono text-sm">Convert to 3MF to see colors</p>
        </div>
      )}
      <div ref={mountRef} className="w-full h-full" />
    </div>
  );
}
