import * as THREE from "three";
import { CSG } from "three-csg-ts";
import { CADVisualNode } from "../types";

/**
 * Evaluates a parametric expression or number using values from active parameters
 */
export function evaluateExpression(expr: number | string | undefined, params: Record<string, number>): number {
  if (expr === undefined) return 0;
  if (typeof expr === "number") return expr;
  if (!expr) return 0;

  let sanitized = expr.toString().trim();
  
  // Replace true/false
  if (sanitized === "true") return 1;
  if (sanitized === "false") return 0;

  // Replace variable names with their active slider values
  // We sort parameter names from longest to shortest to avoid replacing substrings (e.g. 'thickness' before 'thick')
  const sortedKeys = Object.keys(params).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const val = params[key];
    const regex = new RegExp(`\\b${key}\\b`, "g");
    sanitized = sanitized.replace(regex, val.toString());
  }

  // Double check the string for safety before evaluation
  // Only allow arithmetic, digits, variables already replaced
  const safeRegex = /^[0-9.+\-*/()\s]+$/;
  if (!safeRegex.test(sanitized)) {
    // If it contains characters that are not basic math, return a fallback default
    const num = parseFloat(sanitized);
    return isNaN(num) ? 0 : num;
  }

  try {
    const result = new Function(`return (${sanitized});`)();
    return typeof result === "number" && !isNaN(result) ? result : 0;
  } catch (err) {
    console.error(`CAD: Failed to evaluate math: "${expr}" (sanitized as "${sanitized}"):`, err);
    return 0;
  }
}

/**
 * Build THREE.Mesh objects from a custom visual tree node and its parameter values
 */
export function buildCADMesh(
  node: CADVisualNode,
  params: Record<string, number>,
  materialMap: Map<string, THREE.Material> = new Map()
): THREE.Mesh | null {
  if (!node) return null;

  // Create base material for this node
  const colorStr = node.color || "#64748b";
  let material = materialMap.get(colorStr);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorStr),
      roughness: 0.4,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    materialMap.set(colorStr, material);
  }

  let mesh: THREE.Mesh | null = null;

  // 1. Compile Primitives
  if (node.type === "cube") {
    const size = node.size || [10, 10, 10];
    const sx = evaluateExpression(size[0], params) || 1;
    const sy = evaluateExpression(size[1], params) || 1;
    const sz = evaluateExpression(size[2], params) || 1;
    
    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    
    // OpenSCAD cube(center=false) has the origin at the bottom-left corner [0, 0, 0]
    // THREE.BoxGeometry centers the cube around [0, 0, 0]
    if (!node.center) {
      geometry.translate(sx / 2, sy / 2, sz / 2);
    }
    mesh = new THREE.Mesh(geometry, material);

  } else if (node.type === "cylinder") {
    const height = evaluateExpression(node.h || node.size?.[2], params) || 10;
    const diameter = evaluateExpression(node.d || node.r ? (node.d ? node.d : (typeof node.r === "number" ? node.r * 2 : `(${node.r}) * 2`)) : 2, params) || 4;
    const radius = diameter / 2;
    
    // Cylinder segments set for premium smooth render (matches fn=60)
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 48);
    
    // OpenSCAD cylinder is Z-up, starting from base Z=0 (if center is false)
    // ThreeJS cylinder is Y-up, centered at [0,0,0]
    geometry.rotateX(Math.PI / 2); // rotate to Z-up
    if (!node.center) {
      geometry.translate(0, 0, height / 2); // stick the base on Z=0
    }
    mesh = new THREE.Mesh(geometry, material);

  } else if (node.type === "sphere") {
    const diameter = evaluateExpression(node.d || (typeof node.r === "number" ? node.r * 2 : `(${node.r}) * 2`) || 10, params);
    const radius = diameter / 2;
    
    const geometry = new THREE.SphereGeometry(radius, 32, 16);
    mesh = new THREE.Mesh(geometry, material);

  } else if (node.type === "union" || node.type === "difference" || node.type === "intersection") {
    // Process boolean groups
    const children = node.children || [];
    if (children.length === 0) return null;

    // Construct children compiled meshes
    const compiledChildren = children
      .map((c) => buildCADMesh({ ...c, color: c.color || node.color }, params, materialMap))
      .filter((m) => m !== null) as THREE.Mesh[];

    if (compiledChildren.length === 0) return null;

    if (node.type === "union") {
      let combined = compiledChildren[0];
      for (let i = 1; i < compiledChildren.length; i++) {
        try {
          combined.updateMatrixWorld();
          compiledChildren[i].updateMatrixWorld();
          const combinedCSG = CSG.fromMesh(combined);
          const childCSG = CSG.fromMesh(compiledChildren[i]);
          const resultCSG = combinedCSG.union(childCSG);
          combined = CSG.toMesh(resultCSG, combined.matrix, combined.material);
        } catch (e) {
          console.warn("CAD CSG Union failure, falling back to simple visual grouping", e);
          // Fallback: group them in scene rather than hard CSG subtraction error
          combined.add(compiledChildren[i]);
        }
      }
      mesh = combined;

    } else if (node.type === "difference") {
      let base = compiledChildren[0];
      for (let i = 1; i < compiledChildren.length; i++) {
        try {
          base.updateMatrixWorld();
          compiledChildren[i].updateMatrixWorld();
          const baseCSG = CSG.fromMesh(base);
          const subtractCSG = CSG.fromMesh(compiledChildren[i]);
          const resultCSG = baseCSG.subtract(subtractCSG);
          base = CSG.toMesh(resultCSG, base.matrix, base.material);
        } catch (e) {
          console.warn("CAD CSG Difference failure, visual fallback active for subtracting meshes", e);
          // Visual fallback: color subtraction red and show in scene
          const redMaterial = new THREE.MeshStandardMaterial({
            color: 0xef4444,
            transparent: true,
            opacity: 0.35,
            wireframe: true,
          });
          compiledChildren[i].material = redMaterial;
          base.add(compiledChildren[i]);
        }
      }
      mesh = base;

    } else if (node.type === "intersection") {
      let base = compiledChildren[0];
      for (let i = 1; i < compiledChildren.length; i++) {
        try {
          base.updateMatrixWorld();
          compiledChildren[i].updateMatrixWorld();
          const baseCSG = CSG.fromMesh(base);
          const intersectCSG = CSG.fromMesh(compiledChildren[i]);
          const resultCSG = baseCSG.intersect(intersectCSG);
          base = CSG.toMesh(resultCSG, base.matrix, base.material);
        } catch (e) {
          console.error("CAD CSG Intersection failure:", e);
        }
      }
      mesh = base;
    }
  }

  // Apply transforms if a primitive mesh is instantiated
  if (mesh) {
    if (node.translate) {
      const tx = evaluateExpression(node.translate[0], params);
      const ty = evaluateExpression(node.translate[1], params);
      const tz = evaluateExpression(node.translate[2], params);
      mesh.position.set(tx, ty, tz);
    }
    
    if (node.rotate) {
      const rx = (evaluateExpression(node.rotate[0], params) * Math.PI) / 180;
      const ry = (evaluateExpression(node.rotate[1], params) * Math.PI) / 180;
      const rz = (evaluateExpression(node.rotate[2], params) * Math.PI) / 180;
      mesh.rotation.set(rx, ry, rz);
    }

    if (node.scale) {
      const sx = evaluateExpression(node.scale[0], params) || 1;
      const sy = evaluateExpression(node.scale[1], params) || 1;
      const sz = evaluateExpression(node.scale[2], params) || 1;
      mesh.scale.set(sx, sy, sz);
    }
  }

  return mesh;
}

/**
 * Compiles visualTree CSG recursively, separating subtract nodes on root level if they aren't enclosed
 */
export function buildCompositeCAD(
  rootNode: CADVisualNode,
  params: Record<string, number>
): THREE.Mesh | null {
  if (!rootNode) return null;

  // Pre-process any top level node with subtract: true
  // If the root is a union but some children are explicitly marked as subtract,
  // we internally treat them as a 'difference' node
  if (rootNode.type === "union" && rootNode.children?.some((c) => c.subtract)) {
    const positiveChildren = rootNode.children.filter((c) => !c.subtract);
    const negativeChildren = rootNode.children.filter((c) => c.subtract);

    const posUnion: CADVisualNode = {
      type: "union",
      children: positiveChildren,
    };

    const diffNode: CADVisualNode = {
      type: "difference",
      children: [posUnion, ...negativeChildren],
    };

    return buildCADMesh(diffNode, params);
  }

  return buildCADMesh(rootNode, params);
}

/**
 * Generate 3D printable ASCII STL file contents from a THREE.Mesh
 */
export function exportToSTL(mesh: THREE.Mesh, name: string = "ThinkPrint_CAD_Design"): string {
  let stl = `solid ${name.replace(/\s+/g, "_")}\n`;
  
  const geometry = mesh.geometry;
  if (!geometry) return "";

  // Convert to non-indexed geometry to access absolute face coordinates easily
  const tempGeom = geometry.clone();
  const positionAttribute = tempGeom.getAttribute("position");
  const indexAttribute = tempGeom.getIndex();
  
  if (!positionAttribute) return "";

  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const targetMatrix = mesh.matrixWorld;

  if (indexAttribute) {
    const indices = indexAttribute.array;
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i];
      const i1 = indices[i + 1];
      const i2 = indices[i + 2];

      const vA = new THREE.Vector3().fromBufferAttribute(positionAttribute, i0).applyMatrix4(targetMatrix);
      const vB = new THREE.Vector3().fromBufferAttribute(positionAttribute, i1).applyMatrix4(targetMatrix);
      const vC = new THREE.Vector3().fromBufferAttribute(positionAttribute, i2).applyMatrix4(targetMatrix);

      // Compute normal
      const cb = new THREE.Vector3().subVectors(vC, vB);
      const ab = new THREE.Vector3().subVectors(vA, vB);
      normal.crossVectors(cb, ab).normalize();

      stl += `  facet normal ${normal.x} ${normal.y} ${normal.z}\n`;
      stl += `    outer loop\n`;
      stl += `      vertex ${vA.x} ${vA.y} ${vA.z}\n`;
      stl += `      vertex ${vB.x} ${vB.y} ${vB.z}\n`;
      stl += `      vertex ${vC.x} ${vC.y} ${vC.z}\n`;
      stl += `    endloop\n`;
      stl += `  endfacet\n`;
    }
  } else {
    for (let i = 0; i < positionAttribute.count; i += 3) {
      const vA = new THREE.Vector3().fromBufferAttribute(positionAttribute, i).applyMatrix4(targetMatrix);
      const vB = new THREE.Vector3().fromBufferAttribute(positionAttribute, i + 1).applyMatrix4(targetMatrix);
      const vC = new THREE.Vector3().fromBufferAttribute(positionAttribute, i + 2).applyMatrix4(targetMatrix);

      // Compute normal
      const cb = new THREE.Vector3().subVectors(vC, vB);
      const ab = new THREE.Vector3().subVectors(vA, vB);
      normal.crossVectors(cb, ab).normalize();

      stl += `  facet normal ${normal.x} ${normal.y} ${normal.z}\n`;
      stl += `    outer loop\n`;
      stl += `      vertex ${vA.x} ${vA.y} ${vA.z}\n`;
      stl += `      vertex ${vB.x} ${vB.y} ${vB.z}\n`;
      stl += `      vertex ${vC.x} ${vC.y} ${vC.z}\n`;
      stl += `    endloop\n`;
      stl += `  endfacet\n`;
    }
  }

  stl += `endsolid ${name.replace(/\s+/g, "_")}\n`;
  return stl;
}
