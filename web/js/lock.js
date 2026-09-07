// 手部会话锁：实现"以第一个锁定的人为准，围观不干扰"。
//
// 状态机：empty（无人）→ candidate（中心交互区见手，驻留确认中）→ locked（已锁定）
//   · empty：仅当手出现在中心交互区 ROI 内才进入 candidate；区外的手（路过、围观伸手）
//     不唤剑、不停止待机。
//   · candidate：必须在区内连续驻留 lockDwell 秒且帧间位移连续，才升级为 locked；
//     中途出区、跳变或中断超过 lockCandidateTtl 则重新开始。
//   · locked：后续检测只接受与上一接受帧位置连续（跳变 ≤ lockMaxJump）的同一只手；
//     别人的手在重检测边界替换了 landmarks[0] 时表现为大跳变 → 拒绝该帧（坐标不动）。
//     连续 lockHandLostTimeout 没有可接受帧（锁定者离场/被遮挡）才释放，下一位重新走
//     驻留确认；短暂遮挡后在原位附近重现则保持锁定。
//   · 掌尺度 palm > lockMaxPalm 的帧（手糊到镜头上）一律不算看见锁定者。
//
// 坐标约定：输入为镜像后的归一化屏幕坐标（与主循环消费的坐标同一坐标系）。
// 输出 {present, x, y, accepted, acquired, reset, session, phase, cand}：
//   present  — 是否存在"已锁定的人"（含丢失宽限，驱动本命剑/待机切换）
//   x,y      — 指数平滑后的锁定者坐标；present=false 时为 null
//   accepted — 本帧是否接受了新检测（false 时消费方不应向挥舞检测器喂点）
//   acquired — 本帧是否刚完成锁定（消费方可做一次性反馈）
//   reset    — 新会话/遮挡空档后恢复：消费方应清空速度历史，防跨空档伪齐发
//   phase    — 'idle' | 'candidate' | 'locked'（表现层三态反馈，docs/04 §5.2）
//   cand     — candidate 态驻留进度 0..1
import { CFG } from './config.js';

export class HandLock {
  constructor() {
    this.reset();
  }

  // 完全释放（如镜像翻转后坐标系改变）
  reset() {
    this.state = 'empty';        // empty | candidate | locked
    this.candStart = -1;
    this.lastT = -1;             // 最近一个"连续可接受"检测帧的时间
    this.lastX = 0.5;
    this.lastY = 0.5;
    this.sx = null;              // 平滑输出
    this.sy = null;
    this.session = 0;            // 每锁定一个新人 +1
  }

  _inRoi(x, y) {
    const [x0, y0, x1, y1] = CFG.lockRoi;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }

  // now=秒；seen=本帧是否检测到手；x,y=镜像后归一化掌心；palm=4:3 校正掌尺度（可空）
  update(now, seen, x, y, palm = null) {
    if (!CFG.lockEnabled) {
      // 调试旁路：见手即跟（旧行为），每帧接受、驻留立即锁定
      this.state = seen ? 'locked' : 'empty';
      if (seen) {
        if (this.session === 0 || this.sx === null) {
          this.session = Math.max(this.session, 1);
          this.sx = x; this.sy = y;
          this.lastT = now; this.lastX = x; this.lastY = y;
          return { present: true, x, y, accepted: true, acquired: true, reset: true, session: this.session, phase: 'locked', cand: 1 };
        }
        this._smooth(x, y);
        this.lastT = now; this.lastX = x; this.lastY = y;
        return { present: true, x: this.sx, y: this.sy, accepted: true, acquired: false, reset: false, session: this.session, phase: 'locked', cand: 1 };
      }
      this.sx = this.sy = null;
      return { present: false, x: null, y: null, accepted: false, acquired: false, reset: false, session: this.session, phase: 'idle', cand: 0 };
    }

    let acquired = false;
    let accepted = false;
    // 与上一接受帧间隔过大（遮挡/掉帧/连续拒绝）→ 恢复时要求速度历史清零
    let reset = this.state === 'locked' && this.lastT >= 0 && now - this.lastT > CFG.lockGapClear;

    const plausible = seen && (palm === null || palm <= CFG.lockMaxPalm);

    if (plausible) {
      if (this.state === 'empty') {
        if (this._inRoi(x, y)) {
          this.state = 'candidate';
          this.candStart = now;
          this.lastT = now; this.lastX = x; this.lastY = y;
        }
      } else if (this.state === 'candidate') {
        if (this._inRoi(x, y) && Math.hypot(x - this.lastX, y - this.lastY) <= CFG.lockMaxJump) {
          this.lastT = now; this.lastX = x; this.lastY = y;
          if (now - this.candStart >= CFG.lockDwell) {
            this._acquire(x, y);
            accepted = true;
            acquired = true;
            reset = true;
          }
        } else {
          // 出区或跳变：本次驻留确认作废（下一帧若在区内重新计时）
          this.state = 'empty';
          this.sx = this.sy = null;
        }
      } else { // locked
        if (Math.hypot(x - this.lastX, y - this.lastY) <= CFG.lockMaxJump) {
          this.lastT = now; this.lastX = x; this.lastY = y;
          this._smooth(x, y);
          accepted = true;
        }
        // 跳变帧：判为他人/误检，拒绝（不动 lastT/坐标）
      }
    }

    // 超时释放（无论本帧有无检测，统一在尾部处理）
    if (this.state === 'candidate' && now - this.lastT > CFG.lockCandidateTtl) {
      this.state = 'empty';
    }
    if (this.state === 'locked' && now - this.lastT > CFG.handLostTimeout) {
      this.state = 'empty';
      this.sx = this.sy = null;
    }

    return {
      present: this.state === 'locked',
      x: this.sx, y: this.sy,
      accepted,
      acquired,
      reset: reset && accepted,
      session: this.session,
      // 表现层三态反馈用（docs/04 §5.2 契约新增字段，不影响锁判定）
      phase: this.state === 'locked' ? 'locked' : (this.state === 'candidate' ? 'candidate' : 'idle'),
      cand: this.state === 'candidate'
        ? Math.max(0, Math.min(1, (now - this.candStart) / CFG.lockDwell))
        : (this.state === 'locked' ? 1 : 0),
    };
  }

  _acquire(x, y) {
    this.state = 'locked';
    this.session += 1;
    this.sx = x; this.sy = y;     // 锁定瞬间直接吸附，不从旧位置长滑
  }

  _smooth(x, y) {
    if (this.sx === null) { this.sx = x; this.sy = y; }
    else {
      this.sx += CFG.smoothAlpha * (x - this.sx);
      this.sy += CFG.smoothAlpha * (y - this.sy);
    }
  }
}
