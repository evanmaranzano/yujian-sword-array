// 极简事件总线：交互层只发归一化语义事件，表现层订阅；互不 import
// 事件约定见 docs/04 §5.2：session:state / session:acquire / session:release /
// hand:frame / gesture:burst / health
export class Bus {
  constructor() { this._map = new Map(); }
  on(name, fn) {
    if (!this._map.has(name)) this._map.set(name, new Set());
    this._map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) { this._map.get(name)?.delete(fn); }
  emit(name, payload) {
    const set = this._map.get(name);
    if (!set) return;
    for (const fn of [...set]) { try { fn(payload); } catch (e) { console.error('[bus]', name, e); } }
  }
}
