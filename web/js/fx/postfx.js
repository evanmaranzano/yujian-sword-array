// 后处理：pmndrs/postprocessing v6.39.4（Zlib，零依赖 ESM）——
// 选择性辉光（只让剑/法阵发光，山月不泛白，治"糊白饼"）+ 暗角 + 胶片颗粒 + ACES。
// 替代旧的 UnrealBloom + Afterimage + MSAA4 全屏链（docs/04 V2/V11/H5）。
import {
  EffectComposer, RenderPass, EffectPass, SelectiveBloomEffect,
  ToneMappingEffect, ToneMappingMode, VignetteEffect, NoiseEffect, BlendFunction,
} from '../../vendor/postprocessing/index.js';
import * as THREE from 'three';
import { FX } from '../fx.config.js';

export class PostFX {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0,                 // 暗场 bloom 下几何 AA 收益小（docs/03 H5）
    });
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new SelectiveBloomEffect(scene, camera, {
      intensity: FX.bloom.intensity,
      luminanceThreshold: FX.bloom.luminanceThreshold,
      luminanceSmoothing: FX.bloom.luminanceSmoothing,
      mipmapBlur: true,
      radius: FX.bloom.radius,
    });
    this.bloom.inverted = false;
    this.selection = this.bloom.selection;

    // SelectiveBloom 带 DEPTH 属性，单独一个 pass 避免与其它效果合并冲突
    this.bloomPass = new EffectPass(camera, this.bloom);
    this.composer.addPass(this.bloomPass);
    this.bloomEnabled = true;

    const vignette = new VignetteEffect({ offset: FX.vignette.offset, darkness: FX.vignette.darkness });
    const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY });
    noise.blendMode.opacity.value = FX.grain;
    this.composer.addPass(new EffectPass(camera, vignette, noise));

    this.tonemap = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    // v5 降过曝：ACES 默认曝光偏高，压到 0.72
    this.tonemap.exposure = FX.exposure;
    this.composer.addPass(new EffectPass(camera, this.tonemap));

    // 让 SelectiveBloom 的辉光也过 ACES：tone mapping pass 已在链尾
    renderer.toneMapping = THREE.NoToneMapping;
  }

  add(...objs) { for (const o of objs) if (o) this.selection.add(o); }

  // 低画质开关：关掉辉光 pass（自适应画质兜底用；光晕壳不透明度补偿由 director.applyLowGlow 做）
  setBloomEnabled(on) {
    this.bloomPass.enabled = !!on;
    this.bloomEnabled = !!on;
  }

  render(dt) { this.composer.render(dt); }
  setSize(w, h) { this.composer.setSize(w, h); }
}
