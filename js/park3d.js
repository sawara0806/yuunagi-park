"use strict";
/* ============================================================
   park3d.js — シーン構成・移動・入力・環境音・メインループ
   移動 = キー/ボタン、見回し = ドラッグ（またはQ・E）で完全に分離
   ============================================================ */

/* ---------- シーンの組み立て ---------- */
let WALLS = [], BOXES = [], SPRITES3 = [], COLLIDERS = [];
let PIGEONS = [], LEAVES = [], CATS = [], SAKURA_POS = [];
let INSIDE = false;   // 入園中か（タイトル表示中はfalse）
let simT = 0;         // アニメーション用の経過秒

/* 季節・時間帯を切り替えて全素材とシーンを作り直す */
const SKY_TOP_FILL = {
  morning: "rgb(140,172,210)", day: "rgb(150,196,232)",
  dusk: "rgb(88,76,122)", night: "rgb(10,16,38)",
};
function rebuildWorld() {
  buildAssets();
  R3.floor = ASSETS.floor;
  R3.sky = ASSETS.sky;
  R3.clouds = ASSETS.clouds;
  R3.hazeCol = HAZE_MODE[ENV.mode];
  R3.skyTopFill = SKY_TOP_FILL[ENV.mode];
  LEAVES = [];
  buildScene();
  document.querySelectorAll("#ui [data-season]").forEach(b =>
    b.classList.toggle("active", b.dataset.season === ENV.season));
  document.querySelectorAll("#ui [data-mode]").forEach(b =>
    b.classList.toggle("active", b.dataset.mode === ENV.mode));
}

/* 長い壁は短冊に分割して登録する。
   奥行きソートは壁の中点1点で行うため、長い壁のままだと近くの木や
   ベンチと前後関係が逆転して「レイヤーがおかしく」なる。 */
function pushWall(w, maxSeg) {
  const seg = maxSeg || 2.5;
  const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
  const n = Math.ceil(len / seg);
  if (n <= 1) { WALLS.push(w); return; }
  const texLen = w.texLen || len;   // 分割してもテクスチャは元の貼り方を保つ
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    WALLS.push(Object.assign({}, w, {
      x1: w.x1 + (w.x2 - w.x1) * t0, z1: w.z1 + (w.z2 - w.z1) * t0,
      x2: w.x1 + (w.x2 - w.x1) * t1, z2: w.z1 + (w.z2 - w.z1) * t1,
      texLen, u0: (w.u0 || 0) + len * t0,
    }));
  }
}

function buildScene() {
  const T = ASSETS.tex, S = ASSETS.spr;
  WALLS = []; BOXES = []; SPRITES3 = []; COLLIDERS = [];

  /* --- 奥の建物（正面と、奥へ戻る側面。角がペラペラに見えない）
         東側は建物を置かず、遠くの山なみとビル群へ視界が抜ける --- */
  pushWall({ x1: -13.5, z1: -14.5, x2: 1.5, z2: -14.5, h: 6.8, tex: T.aptCream });
  pushWall({ x1: -13.5, z1: -14.5, x2: -13.5, z2: -21, h: 6.8, tex: T.sideCream });
  pushWall({ x1: 1.5, z1: -14.5, x2: 1.5, z2: -21, h: 6.8, tex: T.sideCream });
  pushWall({ x1: 3.5, z1: -18, x2: 15.5, z2: -18, h: 7.4, tex: T.aptWhite });
  pushWall({ x1: 3.5, z1: -18, x2: 3.5, z2: -24.5, h: 7.4, tex: T.sideWhite });
  pushWall({ x1: 15.5, z1: -18, x2: 15.5, z2: -24.5, h: 7.4, tex: T.sideWhite });
  pushWall({ x1: -14.8, z1: 4.5, x2: -14.8, z2: -5.5, h: 5.4, tex: T.house });
  pushWall({ x1: -14.8, z1: 4.5, x2: -20, z2: 4.5, h: 5.4, tex: T.sideGray });
  pushWall({ x1: -14.8, z1: -5.5, x2: -20, z2: -5.5, h: 5.4, tex: T.sideGray });
  pushWall({ x1: -18, z1: 24, x2: 0, z2: 24, h: 5.6, tex: T.housesFar });
  pushWall({ x1: -18, z1: 24, x2: -18, z2: 30, h: 5.6, tex: T.sideGray });
  pushWall({ x1: 1, z1: 24.5, x2: 19, z2: 24.5, h: 5.6, tex: T.housesFar });
  pushWall({ x1: 19, z1: 24.5, x2: 19, z2: 30, h: 5.6, tex: T.sideGray });
  /* 東の遠くに低い家並み（霞んで見える） */
  pushWall({ x1: 25, z1: -10, x2: 25, z2: 10, h: 4.8, tex: T.housesFar, texLen: 18 });
  /* 南の通り沿いの電柱と電線 */
  SPRITES3.push({ x: -8, z: 14.1, img: ASSETS.spr.pole.img, w: ASSETS.spr.pole.w, h: ASSETS.spr.pole.h });
  SPRITES3.push({ x: 8, z: 14.1, img: ASSETS.spr.pole.img, w: ASSETS.spr.pole.w, h: ASSETS.spr.pole.h });
  pushWall({ x1: -8, z1: 14.1, x2: 8, z2: 14.1, h: 6.55, y0: 5.25, tex: T.wires, texLen: 16 });

  /* --- 生け垣（北側・ベンチの後ろ / 東側） --- */
  pushWall({ x1: -9.4, z1: -9.35, x2: 9.4, z2: -9.35, h: 1.25, tex: T.hedge, texLen: 2 });
  pushWall({ x1: 9.35, z1: -8.5, x2: 9.35, z2: -1.5, h: 1.25, tex: T.hedge, texLen: 2 });

  /* --- 金網フェンス（南に入口の切れ目） --- */
  const F = L.FENCE;
  pushWall({ x1: -F, z1: -F, x2: F, z2: -F, h: 1.5, tex: T.fence, texLen: 2 });
  pushWall({ x1: F, z1: -F, x2: F, z2: F, h: 1.5, tex: T.fence, texLen: 2 });
  pushWall({ x1: -F, z1: F, x2: -F, z2: -F, h: 1.5, tex: T.fence, texLen: 2 });
  pushWall({ x1: -F, z1: F, x2: -1.5, z2: F, h: 1.5, tex: T.fence, texLen: 2 });
  pushWall({ x1: 1.5, z1: F, x2: F, z2: F, h: 1.5, tex: T.fence, texLen: 2 });
  pushWall({ x1: 0.5, z1: -9.7, x2: 6.5, z2: -9.7, h: 1.8, tex: T.mesh, texLen: 2 });

  /* --- ベンチ列（箱の組み合わせ。裏から見ても正しい） --- */
  const woodTop = { colS: "rgb(172,138,98)", colGap: "rgb(104,80,60)", gapAxis: "z", boards: 3 };
  const thinTop = { colS: "rgb(150,116,82)" };
  for (const bx of L.BENCHES_X) {
    const zb = L.BENCH_Z;
    /* 背もたれは生け垣側(北=-z)、座面は広場側(南=+z) */
    BOXES.push({ x1: bx - 0.9, x2: bx + 0.9, z1: zb - 0.20, z2: zb - 0.14,
                 y0: 0.44, y1: 0.83, side: T.benchBack, top: thinTop });
    BOXES.push({ x1: bx - 0.9, x2: bx + 0.9, z1: zb - 0.12, z2: zb + 0.30,
                 y0: 0.37, y1: 0.44, side: T.seatSide, top: woodTop });
    for (const lx of [bx - 0.72, bx + 0.72]) {
      BOXES.push({ x1: lx - 0.045, x2: lx + 0.045, z1: zb - 0.10, z2: zb + 0.16,
                   y0: 0, y1: 0.37, side: T.leg, top: { colS: "rgb(82,84,90)" } });
    }
    COLLIDERS.push({ x: bx, z: zb, r: 0.85 });
  }
  /* 公園の掲示板（表と裏がある薄い箱） */
  BOXES.push({ x1: 6.6, x2: 7.55, z1: 8.38, z2: 8.46,
               y0: 0, y1: 1.65, side: T.sign, sideN: T.sign, sideS: T.signBack,
               sideEnd: T.leg });
  COLLIDERS.push({ x: 7.1, z: 8.42, r: 0.5 });

  /* --- 園内の木（クスノキ=大 / ケヤキ=小。3フレームの揺れ付き） --- */
  const smalls = [S.treeSm1, S.treeSm2, S.treeSm3];
  SAKURA_POS = [];
  const pushTree = (tr, i, collide) => {
    const sp = tr.big ? (i % 2 ? S.treeBig1 : S.treeBig2) : smalls[i % 3];
    if (ENV.season === "spring" && sp === S.treeSm3) SAKURA_POS.push(tr);
    SPRITES3.push({ x: tr.x, z: tr.z, img: sp.frames[0], frames: sp.frames,
                    ph: (i * 2.7) % 4, w: sp.w, h: sp.h });
    if (collide) COLLIDERS.push({ x: tr.x, z: tr.z, r: tr.big ? 0.6 : 0.45 });
  };
  L.TREES.forEach((tr, i) => pushTree(tr, i, true));
  /* --- 街路樹と南の緑地帯（園外の自然） --- */
  L.STREET_TREES.forEach((tr, i) => pushTree(tr, i + 5, false));

  /* --- 大木の根元の植え込み --- */
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * 6.283 + 0.3;
    const rr = 1.15 + (i % 3) * 0.42;
    const sp = S.liriope[i % 3];
    SPRITES3.push({
      x: L.BED.x + Math.cos(a) * rr,
      z: L.BED.z + Math.sin(a) * rr * 0.9,
      img: sp.img, w: sp.w, h: sp.h,
    });
  }
  COLLIDERS.push({ x: L.BED.x, z: L.BED.z, r: L.BED.r - 0.1 });

  /* --- 西側の花壇（サツキの花入り） --- */
  for (let i = 0; i < 5; i++) {
    const sp = i % 2 ? S.azalea[i % 2 ? (i >> 1) % 2 : 0] : S.shrub[i % 2];
    SPRITES3.push({ x: -8.55, z: -3.4 + i * 1.9, img: sp.img, w: sp.w, h: sp.h });
  }
  for (let i = 0; i < 4; i++) {
    const sp = S.liriope[(i + 1) % 3];
    SPRITES3.push({ x: -8.0, z: -2.4 + i * 2.0, img: sp.img, w: sp.w, h: sp.h });
  }
  COLLIDERS.push({ x: -8.5, z: -3, r: 1.1 });
  COLLIDERS.push({ x: -8.5, z: 0.5, r: 1.1 });
  COLLIDERS.push({ x: -8.5, z: 4, r: 1.1 });

  /* --- 園内の隅の低木・入口まわり --- */
  for (const [sx, sz, i] of [[8.6, -8.6, 0], [-8.8, -8.7, 1], [2.4, 9.15, 0], [-8.9, 8.8, 1]]) {
    const sp = S.shrub[i];
    SPRITES3.push({ x: sx, z: sz, img: sp.img, w: sp.w, h: sp.h });
    COLLIDERS.push({ x: sx, z: sz, r: 0.5 });
  }
  SPRITES3.push({ x: -1.25, z: 9.55, img: S.bollard.img, w: S.bollard.w, h: S.bollard.h });
  SPRITES3.push({ x: 1.25, z: 9.55, img: S.bollard.img, w: S.bollard.w, h: S.bollard.h });
  COLLIDERS.push({ x: -1.25, z: 9.55, r: 0.28 });
  COLLIDERS.push({ x: 1.25, z: 9.55, r: 0.28 });
  SPRITES3.push({ x: -7.0, z: 7.0, img: S.fountain.img, w: S.fountain.w, h: S.fountain.h });
  COLLIDERS.push({ x: -7.0, z: 7.0, r: 0.45 });
  /* 公園灯 */
  SPRITES3.push({ x: 4.6, z: 3.6, img: S.lamp.img, w: S.lamp.w, h: S.lamp.h });
  COLLIDERS.push({ x: 4.6, z: 3.6, r: 0.25 });
  /* 入口わきの花壇プランター */
  SPRITES3.push({ x: -2.7, z: 8.95, img: S.planter[0].img, w: S.planter[0].w, h: S.planter[0].h });
  SPRITES3.push({ x: 3.6, z: 9.0, img: S.planter[1].img, w: S.planter[1].w, h: S.planter[1].h });
  COLLIDERS.push({ x: -2.7, z: 8.95, r: 0.5 });
  COLLIDERS.push({ x: 3.6, z: 9.0, r: 0.5 });

  /* --- 道ばたの雑草（園内の隅とフェンス沿い・園外） --- */
  const weeds = [
    [9.55, 8.2], [9.5, 3.1], [9.55, -3.4], [-9.5, 7.4], [-9.55, -1.2], [-9.5, -6.8],
    [3.2, 9.5], [-4.8, 9.55], [6.9, 9.5], [-6.6, 9.5],
    [-3.9, 4.65], [5.05, 1.2], [8.9, -9.1],
    [10.15, 5.5], [10.2, -2.0], [-10.15, 1.0], [-10.2, -7.5], [2.2, 10.2], [-2.6, 10.15],
  ];
  weeds.forEach(([wx, wz], i) => {
    const sp = S.weed[i % 3];
    SPRITES3.push({ x: wx, z: wz, img: sp.img, w: sp.w, h: sp.h });
  });

  /* 鳩（ついばみアニメ用にリストを持つ） */
  PIGEONS = [];
  [[0.6, 1.4, 0], [-1.9, -0.9, 1], [1.3, -2.4, 2]].forEach(([px, pz, i]) => {
    const sp = S.pigeon[i];
    const ent = { x: px, z: pz, img: sp.frames[0], frames: sp.frames,
                  w: sp.w, h: sp.h, state: 0, t: 1 + i * 1.3 };
    SPRITES3.push(ent);
    PIGEONS.push(ent);
  });

  /* ネコ（ベンチの上で丸くなる茶トラ / 木陰に座るハチワレ） */
  SPRITES3.push({ x: 4.8, z: L.BENCH_Z - 0.02, y0: 0.44,
                  img: S.catSleep.img, w: S.catSleep.w, h: S.catSleep.h });
  SPRITES3.push({ x: 4.2, z: 1.1, img: S.catSit.img, w: S.catSit.w, h: S.catSit.h });
  COLLIDERS.push({ x: 4.2, z: 1.1, r: 0.3 });
  CATS = [{ x: 4.2, z: 1.1, awake: true }, { x: 4.8, z: L.BENCH_Z, awake: false }];
}

/* ---------- カメラ・移動（移動と見回しは独立） ---------- */
const CAM = { x: 0, z: 5.8, yaw: 0, eye: 1.55, hor: R3.HOR_BASE };
const INPUT = { fwd: false, back: false, sLeft: false, sRight: false, tLeft: false, tRight: false };
let bobT = 0, bobAmp = 0, stepT = 0;

function movePlayer(dt) {
  if (INPUT.tLeft) CAM.yaw -= 1.8 * dt;
  if (INPUT.tRight) CAM.yaw += 1.8 * dt;
  const mvF = (INPUT.fwd ? 1 : 0) - (INPUT.back ? 1 : 0);
  const mvS = (INPUT.sRight ? 1 : 0) - (INPUT.sLeft ? 1 : 0);
  if (mvF !== 0 || mvS !== 0) {
    const fx = Math.sin(CAM.yaw), fz = -Math.cos(CAM.yaw);
    const rx = Math.cos(CAM.yaw), rz = Math.sin(CAM.yaw);
    let dx = fx * mvF + rx * mvS, dz = fz * mvF + rz * mvS;
    const dl = Math.hypot(dx, dz);
    dx /= dl; dz /= dl;
    const speed = 1.7;
    CAM.x += dx * speed * dt;
    CAM.z += dz * speed * dt;
    bobT += dt * 7;
    bobAmp = Math.min(1, bobAmp + dt * 6);
    stepT -= dt;
    if (stepT <= 0) { stepT = 0.46; AUDIO3.footstep(); }
  } else {
    /* 立ち止まったら揺れの振幅だけをすっと減衰させる（揺れ残りなし） */
    bobAmp = Math.max(0, bobAmp - dt * 7);
  }
  CAM.eye = 1.55 + Math.sin(bobT) * 0.035 * bobAmp;
  for (const c of COLLIDERS) {
    const dx = CAM.x - c.x, dz = CAM.z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + 0.3;
    if (d < min && d > 0.001) {
      CAM.x = c.x + dx / d * min;
      CAM.z = c.z + dz / d * min;
    }
  }
  /* 園内のみ。門を抜けたら退園（タイトルへ戻る） */
  if (CAM.z > 9.3 && Math.abs(CAM.x) > 1.3) CAM.z = 9.3;
  if (CAM.z > 9.3) CAM.x = Math.max(-1.3, Math.min(1.3, CAM.x));
  if (CAM.z > 10.3) { leavePark(); return; }
  CAM.x = Math.max(-9.2, Math.min(9.2, CAM.x));
  CAM.z = Math.max(-8.75, CAM.z);
}

function leavePark() {
  INSIDE = false;
  document.getElementById("entrance").classList.remove("closed");
  if (document.exitPointerLock) document.exitPointerLock();
  AUDIO3.setOn(false);
  document.getElementById("sound-btn").classList.remove("active");
  /* 次の入園に備えて入口へ戻しておく */
  CAM.x = 0; CAM.z = 5.8; CAM.yaw = 0; CAM.hor = R3.HOR_BASE;
  INPUT.fwd = INPUT.back = INPUT.sLeft = INPUT.sRight = false;
}

/* ---------- 環境音（Web Audio合成・すべて位置とパンつき） ---------- */
const AUDIO3 = {
  ctx: null, master: null, on: false,
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
    this.windG.gain.setTargetAtTime(0.02 + w * 0.045, now, 0.35);
    this.leafG.gain.setTargetAtTime(w * w * (0.02 + treeNear * 0.055), now, 0.25);

    /* ---- 出来事のスケジューラ（時間帯と季節でゲート） ---- */
    const M = ENV.mode, S = ENV.season;
    const daytime = M === "day" || M === "morning";
    const pickTree = () => all[(Math.random() * all.length) | 0];
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 2.2 + Math.random() * 4;
      if (M !== "night" && Math.random() < (daytime ? 0.7 : 0.4)) {
        const tr = pickTree(); this.chirp(tr.x, tr.z);
      }
    }
    this.cooT -= dt;
    if (this.cooT <= 0) {
      this.cooT = 6 + Math.random() * 9;
      const p = PIGEONS[(Math.random() * PIGEONS.length) | 0];
      if (p && daytime) this.coo(p.x, p.z);
    }
    this.bulbulT -= dt;
    if (this.bulbulT <= 0) {
      this.bulbulT = 12 + Math.random() * 16;
      if (M !== "night") { const tr = pickTree(); this.hiyo(tr.x, tr.z); }
    }
    this.semiT -= dt;
    if (this.semiT <= 0) {
      this.semiT = 18 + Math.random() * 24;
      if (S === "summer" && daytime) { const tr = pickTree(); this.semi(tr.x, tr.z); }
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

  /* ネコ「ニャー」 */
  meow(x, z) {
    const dst = this.out(x, z, 1);
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(470, t0);
    o.frequency.exponentialRampToValueAtTime(790, t0 + 0.16);
    o.frequency.exponentialRampToValueAtTime(410, t0 + 0.55);
    const vib = c.createOscillator(); vib.frequency.value = 5.6;
    const vibG = c.createGain(); vibG.gain.value = 14;
    vib.connect(vibG).connect(o.frequency);
    const o2 = c.createOscillator(); o2.type = "sine";   // 2倍音で猫らしい鼻声に
    o2.frequency.setValueAtTime(940, t0);
    o2.frequency.exponentialRampToValueAtTime(1580, t0 + 0.16);
    o2.frequency.exponentialRampToValueAtTime(820, t0 + 0.55);
    const env = (node, peak) => {
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.07);
      g.gain.setValueAtTime(peak, t0 + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      node.connect(g).connect(dst);
    };
    env(o, 0.055); env(o2, 0.017);
    o.start(t0); o2.start(t0); vib.start(t0);
    o.stop(t0 + 0.65); o2.stop(t0 + 0.65); vib.stop(t0 + 0.65);
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

/* ---------- 入力 ---------- */
const KEYMAP = {
  ArrowUp: "fwd", w: "fwd", W: "fwd",
  ArrowDown: "back", s: "back", S: "back",
  ArrowLeft: "sLeft", a: "sLeft", A: "sLeft",
  ArrowRight: "sRight", d: "sRight", D: "sRight",
  q: "tLeft", Q: "tLeft", e: "tRight", E: "tRight",
};
window.addEventListener("keydown", ev => {
  const k = KEYMAP[ev.key];
  if (k) { INPUT[k] = true; ev.preventDefault(); }
});
window.addEventListener("keyup", ev => {
  const k = KEYMAP[ev.key];
  if (k) INPUT[k] = false;
});

/* 見回し:
   - マウス: 一度クリックするとポインターロックし、動かすだけで見回せる（Escで解除）
   - タッチ/ロック未対応: ドラッグ（画面を掴んで動かす向き） */
const screenCvs = document.getElementById("screen");
const clampHor = v => Math.max(26, Math.min(234, v));
const locked = () => document.pointerLockElement === screenCvs;

screenCvs.addEventListener("click", () => {
  if (!window.matchMedia("(pointer: fine)").matches) return;
  if (locked()) {
    document.exitPointerLock();               // もう一度クリックでカーソルを返す
  } else if (screenCvs.requestPointerLock) {
    try { screenCvs.requestPointerLock(); } catch (err) { /* 非対応でもドラッグで見回せる */ }
  }
});
document.addEventListener("mousemove", ev => {
  if (!locked()) return;
  CAM.yaw += ev.movementX * 0.0032;
  CAM.hor = clampHor(CAM.hor - ev.movementY * 0.4);
});

let lookPt = null;
screenCvs.addEventListener("pointerdown", ev => {
  if (locked()) return;
  lookPt = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
  screenCvs.setPointerCapture(ev.pointerId);
});
screenCvs.addEventListener("pointermove", ev => {
  if (locked() || !lookPt || ev.pointerId !== lookPt.id) return;
  const dx = ev.clientX - lookPt.x, dy = ev.clientY - lookPt.y;
  lookPt.x = ev.clientX; lookPt.y = ev.clientY;
  /* 掴んだ景色が指についてくる向き（従来と逆） */
  CAM.yaw -= dx * 0.0042;
  CAM.hor = clampHor(CAM.hor + dy * 0.5);
});
const endLook = ev => { if (lookPt && ev.pointerId === lookPt.id) lookPt = null; };
screenCvs.addEventListener("pointerup", endLook);
screenCvs.addEventListener("pointercancel", endLook);

/* 歩行ボタン（タッチ端末用） */
for (const [id, key] of [["walk-fwd", "fwd"], ["walk-back", "back"]]) {
  const el = document.getElementById(id);
  if (!el) continue;
  const on = ev => { INPUT[key] = true; ev.preventDefault(); };
  const off = () => { INPUT[key] = false; };
  el.addEventListener("pointerdown", on);
  el.addEventListener("pointerup", off);
  el.addEventListener("pointercancel", off);
  el.addEventListener("pointerleave", off);
}

/* ---------- 画面フィット ---------- */
function fitScreen() {
  const vw = window.innerWidth, vh = window.innerHeight;
  let scale = Math.min(vw / R3.W, vh / R3.H);
  if (scale >= 2) scale = Math.floor(scale);
  screenCvs.style.width = R3.W * scale + "px";
  screenCvs.style.height = R3.H * scale + "px";
}
window.addEventListener("resize", fitScreen);

/* ---------- 風と小さな動き（P2） ---------- */
const FRAME_SEQ = [0, 1, 2, 1];
function windNow(t) {
  return Math.max(0, Math.min(1,
    0.45 + 0.30 * Math.sin(t * 0.45) + 0.25 * Math.sin(t * 0.19 + 2)));
}
function updateAnim(dt) {
  simT += dt;
  const wind = windNow(simT);
  /* 木々: 風が強いほど葉群が速くそよぐ */
  for (const s of SPRITES3) {
    if (s.frames && s.ph !== undefined)
      s.img = s.frames[FRAME_SEQ[((simT * (0.7 + wind * 1.8) + s.ph) | 0) % 4]];
  }
  /* 鳩: ときどき地面をついばむ */
  for (const p of PIGEONS) {
    p.t -= dt;
    if (p.t <= 0) {
      p.state ^= 1;
      p.t = p.state ? 0.35 + Math.random() * 0.5 : 0.8 + Math.random() * 3.2;
      p.img = p.frames[p.state];
    }
  }
  /* 舞うもの: 春=サクラの花びら / 夏=葉 / 秋=紅葉たくさん / 冬=雪 */
  const snow = ENV.season === "winter";
  const maxN = { spring: 9, summer: 7, autumn: 16, winter: 15 }[ENV.season];
  const rate = { spring: 0.8, summer: 0.55, autumn: 2.2, winter: 1.8 }[ENV.season];
  if (LEAVES.length < maxN && Math.random() < dt * rate) {
    const sp = ASSETS.spr.leaf[(Math.random() * 2) | 0];
    let x, z, y0;
    if (snow) {
      x = CAM.x + (Math.random() - 0.5) * 22;
      z = CAM.z + (Math.random() - 0.5) * 22;
      y0 = 4 + Math.random() * 3;
    } else {
      let src = L.TREES.concat(L.STREET_TREES);
      if (ENV.season === "spring" && SAKURA_POS.length) src = SAKURA_POS;
      const tr = src[(Math.random() * src.length) | 0];
      x = tr.x + (Math.random() - 0.5) * 3;
      z = tr.z + (Math.random() - 0.5) * 3;
      y0 = 2.4 + Math.random() * 2.6;
    }
    LEAVES.push({
      x, z, y0,
      vx: (Math.random() - 0.5) * 0.25, vz: (Math.random() - 0.5) * 0.25,
      ph: Math.random() * 6.28, img: sp.img, w: sp.w, h: sp.h,
    });
  }
  const fall = snow ? 0.22 : 0.42;
  const swayAmp = snow ? 0.12 : 0.3;
  for (let i = LEAVES.length - 1; i >= 0; i--) {
    const l = LEAVES[i];
    l.y0 -= dt * fall;
    l.x += (l.vx + Math.sin(simT * 2.2 + l.ph) * swayAmp * (0.4 + wind)) * dt;
    l.z += l.vz * dt;
    if (l.y0 <= 0.03) LEAVES.splice(i, 1);
  }
  return wind;
}

/* ---------- メインループ ---------- */
let last = 0;
function tick(dt) {
  if (INSIDE) movePlayer(dt);
  const wind = updateAnim(dt);
  AUDIO3.update(dt, wind);
  R3.render(CAM, WALLS, BOXES,
    LEAVES.length ? SPRITES3.concat(LEAVES) : SPRITES3, simT);
}
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  tick(dt);
  requestAnimationFrame(frame);
}

/* ---------- 起動（季節は今の月・時間帯は今の時刻から） ---------- */
(function initialEnv() {
  const d = new Date(), mo = d.getMonth() + 1, h = d.getHours();
  ENV.season = mo >= 3 && mo <= 5 ? "spring" : mo >= 6 && mo <= 8 ? "summer"
             : mo >= 9 && mo <= 11 ? "autumn" : "winter";
  ENV.mode = h >= 5 && h < 10 ? "morning" : h >= 10 && h < 16 ? "day"
           : h >= 16 && h < 19 ? "dusk" : "night";
})();
R3.init(screenCvs);
rebuildWorld();
fitScreen();
last = performance.now();
requestAnimationFrame(frame);

/* 季節・時間帯の切り替えUI */
document.querySelectorAll("#ui [data-season]").forEach(b =>
  b.addEventListener("click", () => {
    if (ENV.season === b.dataset.season) return;
    ENV.season = b.dataset.season;
    rebuildWorld();
  }));
document.querySelectorAll("#ui [data-mode]").forEach(b =>
  b.addEventListener("click", () => {
    if (ENV.mode === b.dataset.mode) return;
    const toDusk = b.dataset.mode === "dusk";
    ENV.mode = b.dataset.mode;
    rebuildWorld();
    if (toDusk) AUDIO3.chime();   // 17時のチャイム
  }));

document.getElementById("enter-btn").addEventListener("click", () => {
  document.getElementById("entrance").classList.add("closed");
  INSIDE = true;
  try {
    AUDIO3.init();
    AUDIO3.setOn(true);
    document.getElementById("sound-btn").classList.add("active");
  } catch (err) { /* 音が使えなくても入園できる */ }
});
document.getElementById("sound-btn").addEventListener("click", () => {
  try { AUDIO3.init(); } catch (err) { return; }
  AUDIO3.setOn(!AUDIO3.on);
  document.getElementById("sound-btn").classList.toggle("active", AUDIO3.on);
});

/* 検証・デバッグ用フック */
window.PARK = {
  cam: CAM, input: INPUT, audio: AUDIO3, env: ENV,
  setEnv(season, mode) {
    if (season) ENV.season = season;
    if (mode) ENV.mode = mode;
    rebuildWorld();
  },
  step(n, dt) {
    dt = dt || 1 / 60;
    for (let i = 0; i < (n || 1); i++) tick(dt);
  },
};
