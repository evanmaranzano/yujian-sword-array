// Ribbon 拖尾渲染器——几何/环形节点缓冲引擎移植自 honzaap/SlashSaber 的
// src/game/libs/TrailRenderer.ts（Creative Commons Attribution 4.0，
// https://github.com/honzaap/SlashSaber；原算法 © Mark Kellogg, TrailRendererJS）。
// 本项目做的改动：TS→ESM JS、BufferAttribute 改 setUsage、新增软边加色发光材质
// （createGlowMaterial，剑气 ribbon 用），原 Base 材质保留。
// 用法：initialize(material, length, dragTexture, headWidth, headGeometry, targetObject)
//      每帧 advance()（跟随 Object3D）或 advanceWithPositionAndOrientation(pos, tangent)
import * as THREE from 'three';

const MAX_HEAD_VERTICES = 128;
const _sv1 = new THREE.Vector3();

const vertexVars = [
  'attribute float nodeID;',
  'attribute float nodeVertexID;',
  'attribute vec3 nodeCenter;',
  'uniform float minID;',
  'uniform float maxID;',
  'uniform float trailLength;',
  'uniform float maxTrailLength;',
  'uniform float verticesPerNode;',
  'uniform vec2 textureTileFactor;',
  'uniform vec4 headColor;',
  'uniform vec4 tailColor;',
  'varying vec4 vColor;',
  'varying float vFraction;',
  'varying float vCross;',
].join('\n');

const core = [
  'float fraction = ( maxID - nodeID ) / max(0.0001, maxID - minID );',
  'vFraction = fraction;',
  'vCross = clamp( nodeVertexID / max(1.0, verticesPerNode - 1.0), 0.0, 1.0 );',
  'vColor = ( 1.0 - fraction ) * headColor + fraction * tailColor;',
  'vec4 realPosition = vec4( ( 1.0 - fraction ) * position.xyz + fraction * nodeCenter.xyz, 1.0 );',
].join('\n');

// 加色发光 ribbon：沿尾衰减 + 横截面软边（剑气/刀光用，替代全屏 Afterimage）
const GLOW_VERTEX = `${vertexVars}
void main() {
  ${core}
  gl_Position = projectionMatrix * modelViewMatrix * realPosition;
}`;

const GLOW_FRAGMENT = `
precision highp float;
varying vec4 vColor;
varying float vFraction;
varying float vCross;
void main() {
  float edge = pow(sin(vCross * 3.14159265), 0.8);   // 中脊实、两缘虚
  float along = pow(1.0 - vFraction, 1.6);            // 尾端淡出
  gl_FragColor = vec4(vColor.rgb, vColor.a * edge * along);
}`;

const BASE_VERTEX = `${vertexVars}
void main() {
  ${core}
  gl_Position = projectionMatrix * viewMatrix * realPosition;
}`;
const BASE_FRAGMENT = `
precision highp float;
varying vec4 vColor;
void main() { gl_FragColor = vColor; }`;

export class TrailRenderer extends THREE.Object3D {
  constructor(scene, orientToMovement = false) {
    super();
    this.active = false;
    this.orientToMovement = orientToMovement;
    this.scene = scene;
    this.geometry = null;
    this.mesh = null;
    this.nodeCenters = null;
    this.lastNodeCenter = null;
    this.currentNodeCenter = null;
    this.lastOrientationDir = null;
    this.nodeIDs = null;
    this.currentLength = 0;
    this.currentEnd = 0;
    this.currentNodeID = 0;
    this.length = 0;
    this.dragTexture = 0;
    this.targetObject = null;
    this.material = null;
    this.localHeadGeometry = null;
    this.verticesPerNode = 0;
    this.vertexCount = 0;
    this.faceCount = 0;
    this.facesPerNode = 0;
    this.faceIndicesPerNode = 0;

    this._m44 = new THREE.Matrix4();
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._offset = new THREE.Vector3();
    this._worldOri = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._pos = new THREE.Vector3();
  }

  static get MaxHeadVertices() { return MAX_HEAD_VERTICES; }
  static get PositionComponentCount() { return 3; }
  static get UVComponentCount() { return 3; }
  static get IndicesPerFace() { return 3; }
  static get FacesPerQuad() { return 2; }

  initialize(material, length, dragTexture, localHeadWidth, localHeadGeometry, targetObject) {
    this.deactivate();
    this.destroyMesh();

    this.length = length > 0 ? length + 1 : 0;
    this.dragTexture = !dragTexture ? 0 : 1;
    this.targetObject = targetObject;

    this.initializeLocalHeadGeometry(localHeadWidth, localHeadGeometry);
    this.nodeIDs = [];
    this.nodeCenters = [];
    for (let i = 0; i < this.length; i++) {
      this.nodeIDs[i] = -1;
      this.nodeCenters[i] = new THREE.Vector3();
    }
    this.material = material;
    this.initializeGeometry();
    this.initializeMesh();

    this.material.uniforms.trailLength.value = 0;
    this.material.uniforms.minID.value = 0;
    this.material.uniforms.maxID.value = 0;
    this.material.uniforms.dragTexture.value = this.dragTexture;
    this.material.uniforms.maxTrailLength.value = this.length;
    this.material.uniforms.verticesPerNode.value = this.verticesPerNode;
    if (this.material.uniforms.textureTileFactor) {
      this.material.uniforms.textureTileFactor.value = new THREE.Vector2(1, 1);
    }
    this.reset();
  }

  initializeLocalHeadGeometry(localHeadWidth, localHeadGeometry) {
    this.localHeadGeometry = [];
    if (!localHeadGeometry) {
      const halfWidth = (localHeadWidth || 1.0) / 2.0;
      this.localHeadGeometry.push(new THREE.Vector3(-halfWidth, 0, 0));
      this.localHeadGeometry.push(new THREE.Vector3(halfWidth, 0, 0));
      this.verticesPerNode = 2;
    } else {
      this.verticesPerNode = 0;
      for (let i = 0; i < localHeadGeometry.length && i < MAX_HEAD_VERTICES; i++) {
        const v = localHeadGeometry[i];
        if (v && v.isVector3) this.localHeadGeometry.push(v.clone());
      }
      this.verticesPerNode = this.localHeadGeometry.length;
    }
    this.facesPerNode = (this.verticesPerNode - 1) * 2;
    this.faceIndicesPerNode = this.facesPerNode * 3;
  }

  initializeGeometry() {
    this.vertexCount = this.length * this.verticesPerNode;
    this.faceCount = this.length * this.facesPerNode;
    const geometry = new THREE.BufferGeometry();
    const mk = (arr, size) => {
      const a = new THREE.BufferAttribute(arr, size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    geometry.setAttribute('nodeID', mk(new Float32Array(this.vertexCount), 1));
    geometry.setAttribute('nodeVertexID', mk(new Float32Array(this.vertexCount), 1));
    geometry.setAttribute('nodeCenter', mk(new Float32Array(this.vertexCount * 3), 3));
    geometry.setAttribute('position', mk(new Float32Array(this.vertexCount * 3), 3));
    geometry.setAttribute('uv', mk(new Float32Array(this.vertexCount * 3), 3));
    geometry.setIndex(mk(new Uint32Array(this.faceCount * 3), 1));
    this.geometry = geometry;
  }

  zeroVertices() {
    const p = this.geometry.getAttribute('position');
    for (let i = 0; i < this.vertexCount; i++) {
      p.array[i * 3] = 0; p.array[i * 3 + 1] = 0; p.array[i * 3 + 2] = 0;
    }
    p.needsUpdate = true;
  }

  zeroIndices() {
    const idx = this.geometry.getIndex();
    idx.array.fill(0);
    idx.needsUpdate = true;
  }

  formInitialFaces() {
    this.zeroIndices();
    for (let i = 0; i < this.length - 1; i++) this.connectNodes(i, i + 1);
    this.geometry.getIndex().needsUpdate = true;
  }

  initializeMesh() {
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
  }

  destroyMesh() {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh = null; }
  }

  reset() {
    this.currentLength = 0;
    this.currentEnd = -1;
    this.lastNodeCenter = null;
    this.currentNodeCenter = null;
    this.lastOrientationDir = null;
    this.currentNodeID = 0;
    this.formInitialFaces();
    this.zeroVertices();
    this.geometry.setDrawRange(0, 0);
  }

  updateUniforms() {
    this.material.uniforms.minID.value = this.currentLength < this.length ? 0 : this.currentNodeID - this.length;
    this.material.uniforms.maxID.value = this.currentNodeID;
    this.material.uniforms.trailLength.value = this.currentLength;
    this.material.uniforms.maxTrailLength.value = this.length;
    this.material.uniforms.verticesPerNode.value = this.verticesPerNode;
  }

  advance() {
    if (!this.targetObject) return;
    this.targetObject.updateMatrixWorld();
    this._m44.copy(this.targetObject.matrixWorld);
    this.advanceWithTransform(this._m44);
    this.updateUniforms();
  }

  advanceWithPositionAndOrientation(position, tangent) {
    this.advanceGeometry({ position, tangent }, null);
    this.updateUniforms();
  }

  // 相机对向 ribbon：直接给节点中心与"宽度向量"（世界坐标，应垂直于运动方向
  // 且大致垂直于视线）。2 顶点 head，宽度即 side 向量全长。
  advanceWorld(center, side) {
    const nextIndex = this.currentEnd + 1 >= this.length ? 0 : this.currentEnd + 1;
    if (!this._localHead) {
      this._localHead = Array.from({ length: MAX_HEAD_VERTICES }, () => new THREE.Vector3());
      this._localHead2 = Array.from({ length: MAX_HEAD_VERTICES }, () => new THREE.Vector3());
    }
    const positions = this.geometry.getAttribute('position');
    this.updateNodeCenter(nextIndex, center);
    const half = _sv1.copy(side).multiplyScalar(0.5);
    this._localHead[0].copy(center).sub(half);
    this._localHead[1].copy(center).add(half);
    for (let i = 0; i < 2; i++) {
      const pi = (this.verticesPerNode * nextIndex + i) * TrailRenderer.PositionComponentCount;
      const v = this._localHead[i];
      positions.array[pi] = v.x; positions.array[pi + 1] = v.y; positions.array[pi + 2] = v.z;
    }
    positions.needsUpdate = true;
    this._postAdvance(nextIndex);
    this.updateUniforms();
  }

  _postAdvance(nextIndex) {
    if (this.currentLength >= 1) {
      this.connectNodes(this.currentEnd, nextIndex);
      if (this.currentLength >= this.length) {
        const disconnectIndex = this.currentEnd + 1 >= this.length ? 0 : this.currentEnd + 1;
        this.disconnectNodes(disconnectIndex);
      }
    }
    if (this.currentLength < this.length) this.currentLength++;
    this.currentEnd++;
    if (this.currentEnd >= this.length) this.currentEnd = 0;
    if (this.currentLength >= 1) {
      this.geometry.setDrawRange(
        0,
        this.currentLength < this.length
          ? (this.currentLength - 1) * this.faceIndicesPerNode
          : this.currentLength * this.faceIndicesPerNode);
    }
    this.updateNodeID(this.currentEnd, this.currentNodeID);
    this.currentNodeID++;
  }

  advanceWithTransform(matrix) { this.advanceGeometry(null, matrix); }

  advanceGeometry(positionAndOrientation, transformMatrix) {
    const nextIndex = this.currentEnd + 1 >= this.length ? 0 : this.currentEnd + 1;
    if (transformMatrix) this.updateNodePositionsFromTransformMatrix(nextIndex, transformMatrix);
    else this.updateNodePositionsFromOrientationTangent(nextIndex, positionAndOrientation.position, positionAndOrientation.tangent);

    if (this.currentLength >= 1) {
      this.connectNodes(this.currentEnd, nextIndex);
      if (this.currentLength >= this.length) {
        const disconnectIndex = this.currentEnd + 1 >= this.length ? 0 : this.currentEnd + 1;
        this.disconnectNodes(disconnectIndex);
      }
    }
    if (this.currentLength < this.length) this.currentLength++;
    this.currentEnd++;
    if (this.currentEnd >= this.length) this.currentEnd = 0;

    if (this.currentLength >= 1) {
      this.geometry.setDrawRange(
        0,
        this.currentLength < this.length
          ? (this.currentLength - 1) * this.faceIndicesPerNode
          : this.currentLength * this.faceIndicesPerNode);
    }
    this.updateNodeID(this.currentEnd, this.currentNodeID);
    this.currentNodeID++;
  }

  updateHead() {
    if (this.currentEnd < 0 || !this.targetObject) return;
    this.targetObject.updateMatrixWorld();
    this._m4.copy(this.targetObject.matrixWorld);
    this.updateNodePositionsFromTransformMatrix(this.currentEnd, this._m4);
  }

  updateNodeID(nodeIndex, id) {
    this.nodeIDs[nodeIndex] = id;
    const nodeIDs = this.geometry.getAttribute('nodeID');
    const nodeVertexIDs = this.geometry.getAttribute('nodeVertexID');
    for (let i = 0; i < this.verticesPerNode; i++) {
      const b = nodeIndex * this.verticesPerNode + i;
      nodeIDs.array[b] = id;
      nodeVertexIDs.array[b] = i;
    }
    nodeIDs.needsUpdate = true;
    nodeVertexIDs.needsUpdate = true;
  }

  updateNodeCenter(nodeIndex, center) {
    this.lastNodeCenter = this.currentNodeCenter;
    this.currentNodeCenter = this.nodeCenters[nodeIndex];
    this.currentNodeCenter.copy(center);
    const c = this.geometry.getAttribute('nodeCenter');
    for (let i = 0; i < this.verticesPerNode; i++) {
      const b = (nodeIndex * this.verticesPerNode + i) * 3;
      c.array[b] = center.x; c.array[b + 1] = center.y; c.array[b + 2] = center.z;
    }
    c.needsUpdate = true;
  }

  _tempHead(v) {
    if (!this._localHead) {
      this._localHead = Array.from({ length: MAX_HEAD_VERTICES }, () => new THREE.Vector3());
      this._localHead2 = Array.from({ length: MAX_HEAD_VERTICES }, () => new THREE.Vector3());
    }
    return this._localHead[v];
  }

  updateNodePositionsFromOrientationTangent(nodeIndex, center, tangent) {
    const positions = this.geometry.getAttribute('position');
    this.updateNodeCenter(nodeIndex, center);
    if (!this._localHead) {
      this._localHead = Array.from({ length: MAX_HEAD_VERTICES }, () => new THREE.Vector3());
      this._localHead2 = Array.from({ length: MAX_HEAD_VERTICES }, () => new THREE.Vector3());
    }
    this._offset.copy(center);
    const t0 = new THREE.Vector3(1, 0, 0);
    this._q.setFromUnitVectors(t0, tangent);
    for (let i = 0; i < this.localHeadGeometry.length; i++) {
      const v = this._localHead[i];
      v.copy(this.localHeadGeometry[i]);
      v.applyQuaternion(this._q);
      v.add(this._offset);
    }
    for (let i = 0; i < this.localHeadGeometry.length; i++) {
      const pi = (this.verticesPerNode * nodeIndex + i) * TrailRenderer.PositionComponentCount;
      const v = this._localHead[i];
      positions.array[pi] = v.x; positions.array[pi + 1] = v.y; positions.array[pi + 2] = v.z;
    }
    positions.needsUpdate = true;
  }

  static getMatrix3FromMatrix4(m3, m4) {
    const e = m4.elements;
    m3.set(e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]);
  }

  updateNodePositionsFromTransformMatrix(nodeIndex, matrix) {
    const positions = this.geometry.getAttribute('position');
    this._pos.set(0, 0, 0).applyMatrix4(matrix);
    this.updateNodeCenter(nodeIndex, this._pos);
    if (!this._localHead) {
      this._localHead = Array.from({ length: MAX_HEAD_VERTICES }, () => new THREE.Vector3());
      this._localHead2 = Array.from({ length: MAX_HEAD_VERTICES }, () => new THREE.Vector3());
    }
    for (let i = 0; i < this.localHeadGeometry.length; i++) this._localHead2[i].copy(this.localHeadGeometry[i]);
    for (let i = 0; i < this.localHeadGeometry.length; i++) this._localHead2[i].applyMatrix4(matrix);

    if (this.lastNodeCenter && this.orientToMovement) {
      if (!this._m3) this._m3 = new THREE.Matrix3();
      TrailRenderer.getMatrix3FromMatrix4(this._m3, matrix);
      this._worldOri.set(0, 0, -1).applyMatrix3(this._m3);
      this._dir.copy(this.currentNodeCenter).sub(this.lastNodeCenter).normalize();
      if (this._dir.lengthSq() <= 0.0001 && this.lastOrientationDir) this._dir.copy(this.lastOrientationDir);
      if (this._dir.lengthSq() > 0.0001) {
        if (!this.lastOrientationDir) this.lastOrientationDir = new THREE.Vector3();
        this._q.setFromUnitVectors(this._worldOri, this._dir);
        for (let i = 0; i < this.localHeadGeometry.length; i++) {
          const v = this._localHead2[i];
          this._offset2 = this._offset2 || new THREE.Vector3();
          this._offset2.copy(this.currentNodeCenter);
          v.sub(this._offset2).applyQuaternion(this._q).add(this._offset2);
        }
      }
    }
    for (let i = 0; i < this.localHeadGeometry.length; i++) {
      const pi = (this.verticesPerNode * nodeIndex + i) * TrailRenderer.PositionComponentCount;
      const v = this._localHead2[i];
      positions.array[pi] = v.x; positions.array[pi + 1] = v.y; positions.array[pi + 2] = v.z;
    }
    positions.needsUpdate = true;
  }

  connectNodes(srcNodeIndex, destNodeIndex) {
    const indices = this.geometry.getIndex();
    for (let i = 0; i < this.localHeadGeometry.length - 1; i++) {
      const srcVertexIndex = this.verticesPerNode * srcNodeIndex + i;
      const destVertexIndex = this.verticesPerNode * destNodeIndex + i;
      const faceIndex = ((srcNodeIndex * this.facesPerNode) + i * TrailRenderer.FacesPerQuad) * TrailRenderer.IndicesPerFace;
      indices.array[faceIndex] = srcVertexIndex;
      indices.array[faceIndex + 1] = destVertexIndex;
      indices.array[faceIndex + 2] = srcVertexIndex + 1;
      indices.array[faceIndex + 3] = destVertexIndex;
      indices.array[faceIndex + 4] = destVertexIndex + 1;
      indices.array[faceIndex + 5] = srcVertexIndex + 1;
    }
    indices.needsUpdate = true;
  }

  disconnectNodes(srcNodeIndex) {
    const indices = this.geometry.getIndex();
    for (let i = 0; i < this.localHeadGeometry.length - 1; i++) {
      const faceIndex = ((srcNodeIndex * this.facesPerNode) + i * TrailRenderer.FacesPerQuad) * TrailRenderer.IndicesPerFace;
      for (let k = 0; k < 6; k++) indices.array[faceIndex + k] = 0;
    }
    indices.needsUpdate = true;
  }

  deactivate() {
    if (this.active) { this.scene.remove(this.mesh); this.active = false; }
  }

  activate() {
    if (!this.active && this.mesh) { this.scene.add(this.mesh); this.active = true; }
  }

  static _uniforms() {
    return {
      trailLength: { value: 0 },
      verticesPerNode: { value: 0 },
      minID: { value: 0 },
      maxID: { value: 0 },
      dragTexture: { value: 0 },
      maxTrailLength: { value: 0 },
      textureTileFactor: { value: new THREE.Vector2(1, 1) },
      headColor: { value: new THREE.Vector4() },
      tailColor: { value: new THREE.Vector4() },
    };
  }

  static createMaterial(vertexShader, fragmentShader, customUniforms = {}) {
    Object.assign(customUniforms, TrailRenderer._uniforms());
    return new THREE.ShaderMaterial({
      uniforms: customUniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.NormalBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  // 原 SlashSaber 不透明 ribbon（保留）
  static createBaseMaterial(customUniforms) {
    return TrailRenderer.createMaterial(BASE_VERTEX, BASE_FRAGMENT, customUniforms);
  }

  // 本项目新增：加色软边发光 ribbon（剑气拖尾）
  static createGlowMaterial(headColor, tailColor) {
    const m = TrailRenderer.createMaterial(GLOW_VERTEX, GLOW_FRAGMENT);
    m.blending = THREE.AdditiveBlending;
    m.alphaTest = 0;
    m.uniforms.headColor.value.set(headColor.r, headColor.g, headColor.b, headColor.a ?? 1);
    m.uniforms.tailColor.value.set(tailColor.r, tailColor.g, tailColor.b, tailColor.a ?? 0);
    m.toneMapped = false;
    return m;
  }
}
