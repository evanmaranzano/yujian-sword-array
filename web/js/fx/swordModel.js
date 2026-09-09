// 华夏仙道飞剑 · 大庚剑阵 1:1 原版剑体几何体
// 完全采用大庚剑阵线上原版精密参数：
// - 剑刃：ConeGeometry(0.12, 2.5, 4)，scale(0.4, 1, 1)，沿 +Z 轴立起
// - 剑格：BoxGeometry(0.5, 0.08, 0.15)，平放于 Z = -0.2
// - 剑柄：CylinderGeometry(0.05, 0.06, 0.7, 6)，置于 Z = -0.6
// - 剑气光环：ConeGeometry(0.15, 2.6, 4)，scale(0.5, 1, 1)
import * as THREE from 'three';

export function mergeBufferGeometries(geometries) {
  let totalVerts = 0;
  let totalIndexCount = 0;

  const prepared = geometries.map((g) => {
    const pos = g.attributes.position;
    if (!g.attributes.normal) g.computeVertexNormals();
    const norm = g.attributes.normal;
    const idx = g.index;
    totalVerts += pos.count;
    totalIndexCount += idx ? idx.count : pos.count;
    return { pos, norm, idx };
  });

  const merged = new THREE.BufferGeometry();
  const allPos = new Float32Array(totalVerts * 3);
  const allNorm = new Float32Array(totalVerts * 3);
  const allIndices =
    totalVerts > 65535
      ? new Uint32Array(totalIndexCount)
      : new Uint16Array(totalIndexCount);

  let posPtr = 0,
    normPtr = 0,
    idxPtr = 0,
    vertCount = 0;
  for (const p of prepared) {
    allPos.set(p.pos.array, posPtr);
    posPtr += p.pos.array.length;
    allNorm.set(p.norm.array, normPtr);
    normPtr += p.norm.array.length;

    if (p.idx) {
      for (let i = 0; i < p.idx.count; i++) {
        allIndices[idxPtr++] = p.idx.array[i] + vertCount;
      }
    } else {
      for (let i = 0; i < p.pos.count; i++) {
        allIndices[idxPtr++] = i + vertCount;
      }
    }
    vertCount += p.pos.count;
  }

  merged.setAttribute('position', new THREE.BufferAttribute(allPos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(allNorm, 3));
  merged.setIndex(new THREE.BufferAttribute(allIndices, 1));
  return merged;
}

/**
 * 构造大庚剑阵原版飞剑几何体（1:1 原作源码参数）
 */
export function buildDagengSwordGeometry() {
  const bladeGeo = new THREE.ConeGeometry(0.12, 2.5, 4);
  bladeGeo.scale(0.4, 1, 1);
  bladeGeo.rotateX(Math.PI / 2);
  bladeGeo.translate(0, 0, 1.0);

  const guardGeo = new THREE.BoxGeometry(0.5, 0.08, 0.15);
  guardGeo.translate(0, 0, -0.2);

  const handleGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.7, 6);
  handleGeo.rotateX(Math.PI / 2);
  handleGeo.translate(0, 0, -0.6);

  return mergeBufferGeometries([bladeGeo, guardGeo, handleGeo]);
}

/**
 * 构造大庚剑阵原版剑气光环几何体（1:1 原作源码参数）
 */
export function buildDagengAuraGeometry() {
  const auraGeo = new THREE.ConeGeometry(0.15, 2.6, 4);
  auraGeo.scale(0.5, 1, 1);
  auraGeo.rotateX(Math.PI / 2);
  auraGeo.translate(0, 0, 1.0);
  return auraGeo;
}
