"use strict";
/* ============================================================
   audio.js — Web Audioで合成する音風景（録音素材なし）
   すべての環境音は音源のワールドx座標を持ち、
   主人公との距離でゲインとパンが変わる。
   ============================================================ */

const AUDIO = {
  ctx: null, master: null, on: false,
  playerX: 90, wind: 0.4, mode: "day",
  birdTimer: 2, cricketTimer: 1.5, frogTimer: 3, higuTimer: 1, creakCool: 0,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(c.destination);

    // 共有ノイズバッファ
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const noiseSrc = () => {
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf; s.loop = true;
      return s;
    };

    // ---- 風（全域） ----
    const wSrc = noiseSrc();
    const wLp = c.createBiquadFilter(); wLp.type = "lowpass"; wLp.frequency.value = 320; wLp.Q.value = 0.3;
    this.windG = c.createGain(); this.windG.gain.value = 0.04;
    wSrc.connect(wLp).connect(this.windG).connect(this.master);
    wSrc.start();

    // ---- 葉ずれ（木の近くで、風が強いとき） ----
    const lSrc = noiseSrc();
    const lBp = c.createBiquadFilter(); lBp.type = "bandpass"; lBp.frequency.value = 2400; lBp.Q.value = 0.8;
    this.leafG = c.createGain(); this.leafG.gain.value = 0;
    lSrc.connect(lBp).connect(this.leafG).connect(this.master);
    lSrc.start();

    // ---- 池のさざなみ ----
    const pSrc = noiseSrc();
    const pBp = c.createBiquadFilter(); pBp.type = "bandpass"; pBp.frequency.value = 640; pBp.Q.value = 1.2;
    this.pondG = c.createGain(); this.pondG.gain.value = 0;
    this.pondPan = c.createStereoPanner();
    const pLfo = c.createOscillator(); pLfo.frequency.value = 0.23;
    const pLfoG = c.createGain(); pLfoG.gain.value = 0.35;
    this.pondDepth = c.createGain(); this.pondDepth.gain.value = 1;
    pLfo.connect(pLfoG).connect(this.pondDepth.gain);
    pSrc.connect(pBp).connect(this.pondDepth).connect(this.pondG).connect(this.pondPan).connect(this.master);
    pSrc.start(); pLfo.start();

    // ---- 自販機のハム音 ----
    const h1 = c.createOscillator(); h1.type = "sine"; h1.frequency.value = 98;
    const h2 = c.createOscillator(); h2.type = "sine"; h2.frequency.value = 196;
    const h2g = c.createGain(); h2g.gain.value = 0.3;
    this.humG = c.createGain(); this.humG.gain.value = 0;
    this.humPan = c.createStereoPanner();
    h1.connect(this.humG); h2.connect(h2g).connect(this.humG);
    this.humG.connect(this.humPan).connect(this.master);
    h1.start(); h2.start();
  },

  setOn(on) {
    this.on = on;
    if (!this.ctx) return;
    this.ctx.resume();
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(on ? 1 : 0, this.ctx.currentTime + 1.2);
  },

  /* 距離→ゲイン係数とパン */
  spatial(x, radius) {
    const dx = x - this.playerX;
    const g = Math.pow(Math.max(0, 1 - Math.abs(dx) / radius), 1.6);
    const pan = Math.max(-0.8, Math.min(0.8, dx / 260));
    return [g, pan];
  },

  update(dt, playerX, wind, mode, sitting) {
    if (!this.ctx || !this.on) return;
    this.playerX = playerX; this.wind = wind; this.mode = mode;
    const c = this.ctx, now = c.currentTime;
    const sitBonus = sitting ? 1.18 : 1;
    const ramp = (param, v) => param.setTargetAtTime(v, now, 0.25);

    // 風・葉ずれ
    ramp(this.windG.gain, (0.028 + wind * 0.055) * sitBonus);
    let treeNear = 0;
    for (const tr of TREES) treeNear = Math.max(treeNear, 1 - Math.min(1, Math.abs(playerX - tr.x) / 220));
    ramp(this.leafG.gain, wind * wind * 0.05 * (0.25 + treeNear) * sitBonus);

    // 池
    const [pg, ppan] = this.spatial((POND.x1 + POND.x2) / 2, 480);
    ramp(this.pondG.gain, pg * 0.045 * sitBonus);
    this.pondPan.pan.setTargetAtTime(ppan, now, 0.3);

    // 自販機
    const [hg, hpan] = this.spatial(VEND_X, 130);
    ramp(this.humG.gain, hg * 0.02);
    this.humPan.pan.setTargetAtTime(hpan, now, 0.3);

    // ---- スケジューラ ----
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 1.8 + Math.random() * 3.4;
      if ((mode === "day" || mode === "morning") && Math.random() < 0.75) {
        const tr = TREES[(Math.random() * TREES.length) | 0];
        this.sparrowChirp(tr.x);
      }
    }
    this.higuTimer -= dt;
    if (this.higuTimer <= 0) {
      this.higuTimer = 4 + Math.random() * 6;
      if (mode === "dusk" && Math.random() < 0.8) {
        const tr = TREES[(Math.random() * TREES.length) | 0];
        this.higurashi(tr.x);
      }
    }
    this.cricketTimer -= dt;
    if (this.cricketTimer <= 0) {
      this.cricketTimer = 2.4 + Math.random() * 2.8;
      if (mode === "night") this.cricket(playerX + (Math.random() - 0.5) * 300);
    }
    this.frogTimer -= dt;
    if (this.frogTimer <= 0) {
      this.frogTimer = 3 + Math.random() * 5;
      if (mode === "night") this.frog((POND.x1 + POND.x2) / 2 + (Math.random() - 0.5) * 200);
    }
    // ブランコのきしみ
    this.creakCool -= dt;
    const swingActive = (sitting && sitting.type === "swing") || wind > 0.72;
    if (swingActive && this.creakCool <= 0 && Math.abs(playerX - SWING_X) < 260) {
      this.creakCool = 1.6 + Math.random();
      this.creak();
    }
  },

  /* ---- ワンショット共通：位置付きで鳴らす ---- */
  out(x, radius, baseGain) {
    const [g, pan] = this.spatial(x, radius);
    if (g <= 0.01) return null;
    const c = this.ctx;
    const gain = c.createGain(); gain.gain.value = g * baseGain;
    const p = c.createStereoPanner(); p.pan.value = pan;
    gain.connect(p).connect(this.master);
    return gain;
  },

  sparrowChirp(x) {
    const dst = this.out(x, 560, 1); if (!dst) return;
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine";
    const base = 2900 + Math.random() * 800;
    const n = 2 + ((Math.random() * 3) | 0);
    g.gain.value = 0.0001;
    for (let i = 0; i < n; i++) {
      const s = t0 + i * 0.11;
      o.frequency.setValueAtTime(base + Math.random() * 400, s);
      o.frequency.exponentialRampToValueAtTime(base - 600, s + 0.07);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.05, s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
    }
    o.connect(g).connect(dst);
    o.start(t0); o.stop(t0 + n * 0.11 + 0.15);
  },

  higurashi(x) {
    const dst = this.out(x, 700, 1); if (!dst) return;
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(3350, t0);
    o.frequency.linearRampToValueAtTime(3100, t0 + 2.6);
    const trem = c.createOscillator(); trem.frequency.value = 10.5;
    const tremG = c.createGain(); tremG.gain.value = 0.5;
    const env = c.createGain(); env.gain.value = 0;
    trem.connect(tremG);
    const carrier = c.createGain(); carrier.gain.value = 0.5;
    tremG.connect(carrier.gain);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.022, t0 + 0.7);
    env.gain.setValueAtTime(0.022, t0 + 1.8);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.8);
    o.connect(carrier).connect(env).connect(dst);
    o.start(t0); trem.start(t0);
    o.stop(t0 + 3); trem.stop(t0 + 3);
  },

  cricket(x) {
    const dst = this.out(x, 420, 1); if (!dst) return;
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.type = "sine"; o.frequency.value = 4300;
    const g = c.createGain(); g.gain.value = 0.0001;
    for (let i = 0; i < 7; i++) {
      const s = t0 + i * 0.075;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.014, s + 0.012);
      g.gain.linearRampToValueAtTime(0.0001, s + 0.05);
    }
    o.connect(g).connect(dst);
    o.start(t0); o.stop(t0 + 0.6);
  },

  frog(x) {
    const dst = this.out(x, 420, 1); if (!dst) return;
    const c = this.ctx, t0 = c.currentTime;
    for (let i = 0; i < 2; i++) {
      const s = t0 + i * 0.17;
      const o = c.createOscillator(); o.type = "triangle";
      o.frequency.setValueAtTime(250, s);
      o.frequency.exponentialRampToValueAtTime(150, s + 0.07);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.035, s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.1);
      o.connect(g).connect(dst);
      o.start(s); o.stop(s + 0.15);
    }
  },

  creak() {
    const dst = this.out(SWING_X, 300, 1); if (!dst) return;
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(760, t0);
    o.frequency.linearRampToValueAtTime(880, t0 + 0.28);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.012, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    o.connect(g).connect(dst);
    o.start(t0); o.stop(t0 + 0.5);
  },

  footstep() {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t0 = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.9 + Math.random() * 0.25;
    const bp = c.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.value = 1000 + Math.random() * 400; bp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0.035, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    s.connect(bp).connect(g).connect(this.master);
    s.start(t0); s.stop(t0 + 0.09);
  },

  plop(x) {
    if (!this.ctx || !this.on) return;
    const dst = this.out(x !== undefined ? x : this.playerX, 400, 1); if (!dst) return;
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(430, t0);
    o.frequency.exponentialRampToValueAtTime(130, t0 + 0.15);
    const g = c.createGain();
    g.gain.setValueAtTime(0.07, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o.connect(g).connect(dst);
    o.start(t0); o.stop(t0 + 0.25);
  },

  vendThunk() {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(120, t0);
    o.frequency.exponentialRampToValueAtTime(60, t0 + 0.1);
    const g = c.createGain();
    g.gain.setValueAtTime(0.09, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + 0.2);
    // 取り出し口に落ちる音
    for (const dly of [0.28, 0.4]) {
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 2;
      const gg = c.createGain();
      gg.gain.setValueAtTime(0.05, t0 + dly);
      gg.gain.exponentialRampToValueAtTime(0.0001, t0 + dly + 0.06);
      s.connect(bp).connect(gg).connect(this.master);
      s.start(t0 + dly); s.stop(t0 + dly + 0.08);
    }
  },

  waterSip() {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t0 = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2900; bp.Q.value = 1.4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.03, t0 + 0.15);
    g.gain.setValueAtTime(0.03, t0 + 1.0);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 1.3);
    s.connect(bp).connect(g).connect(this.master);
    s.start(t0); s.stop(t0 + 1.4);
  },

  purr() {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t0 = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
    const trem = c.createOscillator(); trem.frequency.value = 23;
    const tremG = c.createGain(); tremG.gain.value = 0.5;
    const carrier = c.createGain(); carrier.gain.value = 0.5;
    trem.connect(tremG).connect(carrier.gain);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.3);
    g.gain.setValueAtTime(0.05, t0 + 1.2);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 1.7);
    s.connect(lp).connect(carrier).connect(g).connect(this.master);
    s.start(t0); trem.start(t0);
    s.stop(t0 + 1.8); trem.stop(t0 + 1.8);
  },

  /* 夕方のチャイム（鐘の音で数音だけ） */
  chime() {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t0 = c.currentTime;
    const notes = [392, 440, 392, 329.6, 392, 293.7];
    notes.forEach((f, i) => {
      const s = t0 + i * 0.85;
      for (const [mult, amp] of [[1, 0.045], [2.76, 0.012]]) {
        const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f * mult;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(amp, s + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 2.2);
        o.connect(g).connect(this.master);
        o.start(s); o.stop(s + 2.3);
      }
    });
  },
};
