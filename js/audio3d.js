"use strict";
/* ============================================================
   audio3d.js — 環境音（Web Audio合成・すべて位置とパンつき）
   合成音の定義とスケジューラだけを持つ。呼び出しはpark3d.jsの
   メインループ（AUDIO3.update）と入園処理（init/setOn）から。
   天気で変わる音量・確率は assets3d.js の WEATHER レジストリ参照。
   CAM / PIGEONS / CATS / L / ENV は実行時にグローバル解決される
   （scriptの読み込み順: layout3d → assets3d → render3d → audio3d → park3d）。
   ============================================================ */

/* ネコ「ニャー」のノードグラフ本体（thisに依存しない純関数・Offline検証用に外出し）
   c: AudioContext, dst: 接続先, t0: 開始時刻, v: { f0, len } のバリエーション */
function meowInto(c, dst, t0, v) {
  /* Offline実測: 0.5だとピーク0.267で鳥(0.03-0.055)の5倍になる。0.17でピーク約0.09 */
  const PEAK = 0.17;
  const len = 0.7 * v.len;
  const stopAt = t0 + len + 0.1;

  /* 声帯（のこぎり波・ピッチ変化＋ビブラート） */
  const o = c.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(470 * v.f0, t0);
  o.frequency.exponentialRampToValueAtTime(720 * v.f0, t0 + len * 0.3);
  o.frequency.exponentialRampToValueAtTime(620 * v.f0, t0 + len * 0.6);
  o.frequency.exponentialRampToValueAtTime(340 * v.f0, t0 + len);
  const vib = c.createOscillator(); vib.frequency.value = 5.2;
  const vibG = c.createGain(); vibG.gain.value = 10;
  vib.connect(vibG).connect(o.frequency);

  /* フォルマント2本（並列バンドパス＝口の開閉で母音が変わる） */
  const f1 = c.createBiquadFilter(); f1.type = "bandpass"; f1.Q.value = 9;
  f1.frequency.setValueAtTime(380, t0);
  f1.frequency.exponentialRampToValueAtTime(950, t0 + len * 0.3);
  f1.frequency.exponentialRampToValueAtTime(800, t0 + len * 0.65);
  f1.frequency.exponentialRampToValueAtTime(420, t0 + len);
  const f1g = c.createGain(); f1g.gain.value = 1.0;

  const f2 = c.createBiquadFilter(); f2.type = "bandpass"; f2.Q.value = 11;
  f2.frequency.setValueAtTime(1150, t0);
  f2.frequency.exponentialRampToValueAtTime(2300, t0 + len * 0.3);
  f2.frequency.exponentialRampToValueAtTime(1900, t0 + len * 0.65);
  f2.frequency.exponentialRampToValueAtTime(950, t0 + len);
  const f2g = c.createGain(); f2g.gain.value = 0.5;

  o.connect(f1).connect(f1g);
  o.connect(f2).connect(f2g);

  /* 息のノイズ（専用の短いバッファをその場で作る） */
  const noiseBuf = c.createBuffer(1, c.sampleRate * 1, c.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const ns = c.createBufferSource(); ns.buffer = noiseBuf;
  const nbp = c.createBiquadFilter(); nbp.type = "bandpass"; nbp.frequency.value = 2400; nbp.Q.value = 2;
  const ng = c.createGain(); ng.gain.value = 0.05;
  ns.connect(nbp).connect(ng);

  /* F1+F2+ノイズの合流後に1つの出力エンベロープ */
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(PEAK, t0 + 0.06);
  env.gain.exponentialRampToValueAtTime(PEAK * 0.6, t0 + len * 0.55);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  f1g.connect(env); f2g.connect(env); ng.connect(env);
  env.connect(dst);

  o.start(t0); vib.start(t0); ns.start(t0);
  o.stop(stopAt); vib.stop(stopAt); ns.stop(stopAt);
}

/* ---------- 環境音（Web Audio合成・すべて位置とパンつき） ---------- */
const AUDIO3 = {
  ctx: null, master: null, on: false, seated: false,
  birdT: 2, cooT: 5, bulbulT: 9, semiT: 14, crowT: 20, carT: 16,
  higuT: 7, cricketT: 4, catT: 22, meowCool: 0,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(c.destination);
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const w = c.createBufferSource(); w.buffer = this.noiseBuf; w.loop = true;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
    this.windG = c.createGain(); this.windG.gain.value = 0.035;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.08;
    const lfoG = c.createGain(); lfoG.gain.value = 0.02;
    lfo.connect(lfoG).connect(this.windG.gain);
    w.connect(lp).connect(this.windG).connect(this.master);
    w.start(); lfo.start();
    const l = c.createBufferSource(); l.buffer = this.noiseBuf; l.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2300; bp.Q.value = 0.7;
    this.leafG = c.createGain(); this.leafG.gain.value = 0.012;
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.13;
    const lfo2G = c.createGain(); lfo2G.gain.value = 0.006;
    lfo2.connect(lfo2G).connect(this.leafG.gain);
    l.connect(bp).connect(this.leafG).connect(this.master);
    l.start(); lfo2.start();
    const r = c.createBufferSource(); r.buffer = this.noiseBuf; r.loop = true;
    const rlp = c.createBiquadFilter(); rlp.type = "lowpass"; rlp.frequency.value = 130;
    const rg = c.createGain(); rg.gain.value = 0.016;
    r.connect(rlp).connect(rg).connect(this.master);
    r.start();
    /* 雨音（常設。ゲインは季節・時間帯と独立にupdateで開閉する） */
    const rn = c.createBufferSource(); rn.buffer = this.noiseBuf; rn.loop = true;
    const rbp = c.createBiquadFilter(); rbp.type = "bandpass"; rbp.frequency.value = 1900; rbp.Q.value = 0.5;
    this.rainG = c.createGain(); this.rainG.gain.value = 0;
    rn.connect(rbp).connect(this.rainG).connect(this.master);
    rn.start();
  },
  setOn(on) {
    this.on = on;
    if (!this.ctx) return;
    this.ctx.resume();
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(on ? 1 : 0, this.ctx.currentTime + 1.0);
  },
  update(dt, wind) {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime;
    const w = wind === undefined ? 0.4 : wind;
    /* 風と葉ずれを見た目の風（windNow）と連動させる。
       近くに木があるほど葉ずれが近くで鳴る */
    let treeNear = 0;
    const all = L.TREES.concat(L.STREET_TREES);
    for (const tr of all) {
      const d = Math.hypot(tr.x - CAM.x, tr.z - CAM.z);
      treeNear = Math.max(treeNear, 1 - Math.min(1, d / 16));
    }
    /* 着席中は環境音をわずかに濃くする（風・葉ずれ約1.25倍、鳥系の間隔を短く） */
    const boost = this.seated ? 1.25 : 1;
    const birdBoost = this.seated ? 0.75 : 1;
    const WA = curWeather().audio;   // 天気ごとの音パラメータ（WEATHERレジストリ）
    this.windG.gain.setTargetAtTime((0.02 + w * 0.045) * boost * WA.windMul, now, 0.35);
    this.leafG.gain.setTargetAtTime(w * w * (0.02 + treeNear * 0.055) * boost, now, 0.25);
    this.rainG.gain.setTargetAtTime(WA.rainGain, now, 0.8);

    /* ---- 出来事のスケジューラ（時間帯と季節でゲート） ---- */
    const M = ENV.mode, S = ENV.season;
    const daytime = M === "day" || M === "morning";
    const pickTree = () => all[(Math.random() * all.length) | 0];
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = (2.2 + Math.random() * 4) * birdBoost;
      const chirpP = (daytime ? 0.7 : 0.4) * WA.chirpMul;   // 雨は発火確率を下げる
      if (M !== "night" && Math.random() < chirpP) {
        const tr = pickTree(); this.chirp(tr.x, tr.z);
      }
    }
    this.cooT -= dt;
    if (this.cooT <= 0) {
      this.cooT = (6 + Math.random() * 9) * birdBoost;
      const p = PIGEONS[(Math.random() * PIGEONS.length) | 0];
      if (p && daytime && !WA.quietBirds) this.coo(p.x, p.z);
    }
    this.bulbulT -= dt;
    if (this.bulbulT <= 0) {
      this.bulbulT = (12 + Math.random() * 16) * birdBoost;
      if (M !== "night" && !WA.quietBirds) { const tr = pickTree(); this.hiyo(tr.x, tr.z); }
    }
    this.semiT -= dt;
    if (this.semiT <= 0) {
      this.semiT = 18 + Math.random() * 24;
      if (S === "summer" && daytime && !WA.quietBirds) { const tr = pickTree(); this.semi(tr.x, tr.z); }
    }
    this.higuT -= dt;
    if (this.higuT <= 0) {
      this.higuT = 6 + Math.random() * 8;
      if (S === "summer" && M === "dusk") { const tr = pickTree(); this.higurashi(tr.x, tr.z); }
    }
    this.cricketT -= dt;
    if (this.cricketT <= 0) {
      this.cricketT = 2.6 + Math.random() * 3;
      if (M === "night" && S !== "winter")
        this.cricket(CAM.x + (Math.random() - 0.5) * 20, CAM.z + (Math.random() - 0.5) * 20);
    }
    this.crowT -= dt;
    if (this.crowT <= 0) {
      this.crowT = (M === "dusk" ? 14 : 25) + Math.random() * 30;
      if (M !== "night")
        this.caw(CAM.x + (Math.random() - 0.5) * 70, CAM.z - 25 - Math.random() * 25);
    }
    this.carT -= dt;
    if (this.carT <= 0) {
      this.carT = 25 + Math.random() * 28;
      this.carPass();
    }
    /* ネコ: たまに鳴く + 起きている子に近づくと挨拶 */
    this.meowCool -= dt;
    this.catT -= dt;
    if (this.catT <= 0) {
      this.catT = 28 + Math.random() * 32;
      const cat = CATS[(Math.random() * CATS.length) | 0];
      if (cat && cat.awake && M !== "night" && this.meowCool <= 0) {
        this.meow(cat.x, cat.z); this.meowCool = 10;
      }
    }
    for (const cat of CATS) {
      if (!cat.awake || this.meowCool > 0) continue;
      if (Math.hypot(cat.x - CAM.x, cat.z - CAM.z) < 1.7) {
        this.meow(cat.x, cat.z);
        this.meowCool = 18;
      }
    }
  },
  out(x, z, baseGain) {
    const dx = x - CAM.x, dz = z - CAM.z;
    const dist = Math.hypot(dx, dz);
    const g = Math.pow(Math.max(0.08, 1 - dist / 42), 1.4) * baseGain;
    const rel = Math.atan2(dx, -dz) - CAM.yaw;
    const pan = Math.max(-0.8, Math.min(0.8, Math.sin(rel)));
    const c = this.ctx;
    const gain = c.createGain(); gain.gain.value = g;
    const p = c.createStereoPanner(); p.pan.value = pan;
    gain.connect(p).connect(this.master);
    return gain;
  },
  chirp(x, z) {
    const dst = this.out(x, z, 1);
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine";
    const base = 2900 + Math.random() * 900;
    const n = 2 + ((Math.random() * 3) | 0);
    g.gain.value = 0.0001;
    for (let i = 0; i < n; i++) {
      const s = t0 + i * 0.11;
      o.frequency.setValueAtTime(base + Math.random() * 400, s);
      o.frequency.exponentialRampToValueAtTime(base - 600, s + 0.07);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.045, s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
    }
    o.connect(g).connect(dst);
    o.start(t0); o.stop(t0 + n * 0.11 + 0.15);
  },
  footstep() {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t0 = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.85 + Math.random() * 0.3;
    const onBrick = Math.hypot(CAM.x, CAM.z) < L.PLAZA_R;
    const bp = c.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.value = (onBrick ? 850 : 1150) + Math.random() * 250;
    bp.Q.value = 1.0;
    const g = c.createGain();
    g.gain.setValueAtTime(0.03, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    s.connect(bp).connect(g).connect(this.master);
    s.start(t0); s.stop(t0 + 0.1);
  },

  /* 鳩「クルッ クー」 */
  coo(x, z) {
    const dst = this.out(x, z, 1);
    const c = this.ctx, t0 = c.currentTime;
    [[0, 0.16, 415], [0.3, 0.42, 340]].forEach(([off, len, f0]) => {
      const s = t0 + off;
      const o = c.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(f0, s);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.82, s + len);
      const trem = c.createOscillator(); trem.frequency.value = 26;
      const tremG = c.createGain(); tremG.gain.value = 0.45;
      const car = c.createGain(); car.gain.value = 0.55;
      trem.connect(tremG).connect(car.gain);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.055, s + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, s + len);
      o.connect(car).connect(g).connect(dst);
      o.start(s); trem.start(s);
      o.stop(s + len + 0.05); trem.stop(s + len + 0.05);
    });
  },

  /* ヒヨドリ「ヒーヨ ヒーヨ」（鋭い下降笛） */
  hiyo(x, z) {
    const dst = this.out(x, z, 1);
    const c = this.ctx, t0 = c.currentTime;
    for (let i = 0; i < 2; i++) {
      const s = t0 + i * 0.55;
      const o = c.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(3050 + Math.random() * 200, s);
      o.frequency.exponentialRampToValueAtTime(2050, s + 0.22);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.03, s + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.27);
      o.connect(g).connect(dst);
      o.start(s); o.stop(s + 0.32);
    }
  },

  /* ミンミンゼミ（夏の昼。遠くの木から一節だけ） */
  semi(x, z) {
    const dst = this.out(x, z, 1);
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(3950, t0);
    o.frequency.linearRampToValueAtTime(3650, t0 + 3.4);
    const am = c.createOscillator(); am.frequency.value = 7.3;
    const amG = c.createGain(); amG.gain.value = 0.48;
    const car = c.createGain(); car.gain.value = 0.52;
    am.connect(amG).connect(car.gain);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.013, t0 + 0.9);   // ミーン
    g.gain.setValueAtTime(0.013, t0 + 2.4);                 // ミンミンミン
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.6);  // ミー…
    o.connect(car).connect(g).connect(dst);
    o.start(t0); am.start(t0);
    o.stop(t0 + 3.7); am.stop(t0 + 3.7);
  },

  /* カラス（遠く） */
  caw(x, z) {
    const dst = this.out(x, z, 1);
    const c = this.ctx, t0 = c.currentTime;
    const n = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const s = t0 + i * 0.34;
      const o = c.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(255, s);
      o.frequency.exponentialRampToValueAtTime(210, s + 0.2);
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 2.6;
      bp.frequency.setValueAtTime(1250, s);
      bp.frequency.exponentialRampToValueAtTime(900, s + 0.2);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.05, s + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.24);
      o.connect(bp).connect(g).connect(dst);
      o.start(s); o.stop(s + 0.3);
    }
  },

  /* ネコ「ニャー」（フォルマント合成本体は meowInto に分離） */
  meow(x, z) {
    const dst = this.out(x, z, 1);
    const v = { f0: 0.9 + Math.random() * 0.25, len: 0.85 + Math.random() * 0.35 };
    meowInto(this.ctx, dst, this.ctx.currentTime, v);
  },

  /* ヒグラシ（夏の夕）「カナカナカナ…」 */
  higurashi(x, z) {
    const dst = this.out(x, z, 1);
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(3350, t0);
    o.frequency.linearRampToValueAtTime(3080, t0 + 2.6);
    const trem = c.createOscillator(); trem.frequency.value = 10.5;
    const tremG = c.createGain(); tremG.gain.value = 0.5;
    const car = c.createGain(); car.gain.value = 0.5;
    trem.connect(tremG).connect(car.gain);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.020, t0 + 0.7);
    g.gain.setValueAtTime(0.020, t0 + 1.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.8);
    o.connect(car).connect(g).connect(dst);
    o.start(t0); trem.start(t0);
    o.stop(t0 + 3); trem.stop(t0 + 3);
  },

  /* コオロギ（夜） */
  cricket(x, z) {
    const dst = this.out(x, z, 1);
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.type = "sine"; o.frequency.value = 4300;
    const g = c.createGain(); g.gain.value = 0.0001;
    for (let i = 0; i < 7; i++) {
      const s = t0 + i * 0.075;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.013, s + 0.012);
      g.gain.linearRampToValueAtTime(0.0001, s + 0.05);
    }
    o.connect(g).connect(dst);
    o.start(t0); o.stop(t0 + 0.6);
  },

  /* 夕方のチャイム（鐘の音で数音だけ） */
  chime() {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t0 = c.currentTime;
    const notes = [392, 440, 392, 329.6, 392, 293.7];
    notes.forEach((f, i) => {
      const s = t0 + i * 0.85;
      for (const [mult, amp] of [[1, 0.04], [2.76, 0.011]]) {
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

  /* 南の道を車が通る（左右どちらかへパンが流れる） */
  carPass() {
    const c = this.ctx, t0 = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 240;
    const g = c.createGain();
    /* 南の道路に近いほど大きい */
    const near = 0.4 + 0.6 * Math.max(0, Math.min(1, (CAM.z + 9) / 19));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.022 * near, t0 + 1.3);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 2.9);
    const p = c.createStereoPanner();
    const dir = Math.random() < 0.5 ? 1 : -1;
    p.pan.setValueAtTime(-0.75 * dir, t0);
    p.pan.linearRampToValueAtTime(0.75 * dir, t0 + 2.9);
    s.connect(lp).connect(g).connect(p).connect(this.master);
    s.start(t0); s.stop(t0 + 3.0);
  },
};
AUDIO3.meowInto = meowInto;   // Offline検証用に外から呼べるようにする
