// 音效：AudioContext 在启动时即创建（kiosk 纯挥手无点击，修 docs/03 H6），
// 每帧尝试 resume（配合 kiosk --autoplay-policy；普通浏览器则在首次手势后放行）。
export class Sfx {
  constructor() {
    this.ctx = null;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { /* 无声卡降级 */ }
    addEventListener('pointerdown', () => this.resume(), { once: true });
    addEventListener('keydown', () => this.resume(), { once: true });
  }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  // 齐发"嗖"
  whoosh(peak = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime, dur = 0.45;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(480, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + dur * 0.6);
    const g = ctx.createGain();
    const vol = 0.18 + 0.12 * Math.min(peak, 1.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(ctx.destination);
    src.start(t);
  }
  // 获锁"剑来"：短促金铁清音
  chime() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.04);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.05 + i * 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7 + i * 0.04);
      o.connect(g); g.connect(ctx.destination);
      o.start(t + i * 0.04); o.stop(t + 0.8);
    });
  }
}
