// 通天阵盘 · 青光符文法阵（DAGENG / TAICHI 模式专属）
// 旋转的古法道家/仙道八卦符文光盘，平铺于剑阵底部，散发幽蓝天青神光。
import * as THREE from 'three';

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
uniform float uTime;
uniform float uOpacity;

void main() {
  vec2 center = vec2(0.5, 0.5);
  float dist = distance(vUv, center);
  if (dist > 0.5) discard;

  // 1. 同心能量光环
  float ring1 = smoothstep(0.48, 0.485, dist) - smoothstep(0.49, 0.495, dist);
  float ring2 = smoothstep(0.42, 0.424, dist) - smoothstep(0.428, 0.432, dist);
  float ring3 = smoothstep(0.32, 0.324, dist) - smoothstep(0.328, 0.332, dist);
  float ringInner = smoothstep(0.14, 0.145, dist) - smoothstep(0.15, 0.155, dist);

  // 2. 旋转符文光圈（极坐标角向明暗交替）
  float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
  float runes1 = sin(angle * 14.0 + uTime * 0.8) * 0.5 + 0.5;
  float runeRing1 = smoothstep(0.34, 0.41, dist) * runes1 * smoothstep(0.42, 0.35, dist);

  float runes2 = cos(angle * 9.0 - uTime * 0.5) * 0.5 + 0.5;
  float runeRing2 = smoothstep(0.22, 0.31, dist) * runes2 * smoothstep(0.32, 0.23, dist);

  // 3. 核心法眼微光
  float coreGlow = smoothstep(0.15, 0.0, dist) * (0.6 + 0.4 * sin(uTime * 2.5));

  // 华夏青蓝仙气色调：青内核 + 湛蓝边缘
  vec3 color = vec3(0.15, 0.85, 1.0);
  vec3 outerColor = vec3(0.04, 0.38, 0.95);
  vec3 finalColor = mix(color, outerColor, dist * 2.0);

  float alpha = (ring1 * 1.3 + ring2 * 0.95 + ring3 * 0.85 + ringInner * 0.75 +
                 runeRing1 * 0.7 + runeRing2 * 0.55 + coreGlow * 0.45) * uOpacity;

  gl_FragColor = vec4(finalColor, alpha);
}
`;

export class MagicCircle {
  constructor(scene) {
    this.uniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 阵盘网格：大庚原版 40x40~50x50 广阔阵面，置于剑阵底部
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.scale.set(45, 45, 1);
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.opacity = 0;
    this.targetOpacity = 0;
  }

  setMode(active) {
    this.targetOpacity = active ? 0.95 : 0.0;
  }

  update(dt, t, center) {
    this.uniforms.uTime.value = t;

    const k = 1 - Math.exp(-6.5 * dt);
    this.opacity += (this.targetOpacity - this.opacity) * k;
    this.uniforms.uOpacity.value = this.opacity;

    if (this.opacity < 0.01) {
      this.mesh.visible = false;
      return;
    }

    this.mesh.visible = true;
    if (center) {
      this.mesh.position.set(center.x, center.y - 12.0, center.z || 0);
    }

    this.mesh.rotation.z = t * 0.12;
  }
}
