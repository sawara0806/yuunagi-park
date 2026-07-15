"use strict";
/* ============================================================
   park3d.js — シーン構成・移動・入力・メインループ（環境音はaudio3d.js）
   移動 = キー/ボタン、見回し = ドラッグ（またはQ・E）で完全に分離
   ============================================================ */

/* ---------- シーンの組み立て ---------- */
let WALLS = [], BOXES = [], SPRITES3 = [], COLLIDERS = [];
let PIGEONS = [], LEAVES = [], CATS = [], SAKURA_POS = [];
let RAIN = [], SPLASHES = [], CAT_ANIMS = [];
let INSIDE = false;   // 入園中か（タイトル表示中はfalse）
let simT = 0;         // アニメーション用の経過秒

/* 季節・時間帯・天気を切り替えて全素材とシーンを作り直す
   （天気で変わる値はassets3d.jsのWEATHERレジストリが単一の真実） */
function rebuildWorld() {
  buildAssets();
  R3.floor = ASSETS.floor;
  R3.sky = ASSETS.sky;
  R3.clouds = ASSETS.clouds;
  const W = curWeather();
  R3.hazeCol = W.haze[ENV.mode];
  R3.FAR_HAZE = W.farHaze;
  R3.skyTopFill = W.skyTopFill[ENV.mode];
  LEAVES = [];
  buildScene();
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

/* 建物・コンビニ共通: 正面(x1,z1)-(x2,z2) + sideDepth（正面の進行方向を-90°回転した
   法線方向への符号つき奥行き）から側面壁を自動生成する。sides で片側だけにも絞れる
   （南の家並み2棟は道側が開いているため）。LAYOUT.buildings / structures.konbini が使う */
function addBuildingWalls(b, T) {
  pushWall({ x1: b.x1, z1: b.z1, x2: b.x2, z2: b.z2, h: b.h, tex: T[b.tex], texLen: b.texLen });
  if (b.sideDepth === undefined) return;
  const dx = b.x2 - b.x1, dz = b.z2 - b.z1, len = Math.hypot(dx, dz);
  const nx = dz / len, nz = -dx / len;
  const ox = nx * b.sideDepth, oz = nz * b.sideDepth;
  const sideTex = T[b.sideTex];
  const mkSide = (x, z) => pushWall({ x1: x, z1: z, x2: x + ox, z2: z + oz, h: b.h, tex: sideTex });
  if (!b.sides || b.sides === "x1") mkSide(b.x1, b.z1);
  if (!b.sides || b.sides === "x2") mkSide(b.x2, b.z2);
}

function buildScene() {
  const T = ASSETS.tex, S = ASSETS.spr;
  WALLS = []; BOXES = []; SPRITES3 = []; COLLIDERS = [];

  /* --- 奥の建物（正面と、奥へ戻る側面。角がペラペラに見えない）
         東側は建物を置かず、遠くの山なみとビル群へ視界が抜ける --- */
  for (const b of LAYOUT.buildings) addBuildingWalls(b, T);
  /* 南の通り沿いの電柱と電線 */
  for (const p of LAYOUT.wires.poles)
    SPRITES3.push({ x: p.x, z: p.z, img: S.pole.img, w: S.pole.w, h: S.pole.h });
  { const w = LAYOUT.wires.wire;
    pushWall({ x1: w.x1, z1: w.z1, x2: w.x2, z2: w.z2, h: w.h, y0: w.y0, tex: T[w.tex], texLen: w.texLen }); }

  /* --- 生け垣（北側・ベンチの後ろ / 東側） --- */
  for (const hd of LAYOUT.hedges)
    pushWall({ x1: hd.x1, z1: hd.z1, x2: hd.x2, z2: hd.z2, h: hd.h, tex: T[hd.tex], texLen: hd.texLen });

  /* --- 金網フェンス（南に入口の切れ目） --- */
  for (const fc of LAYOUT.fences)
    pushWall({ x1: fc.x1, z1: fc.z1, x2: fc.x2, z2: fc.z2, h: fc.h, tex: T[fc.tex], texLen: fc.texLen });
  for (const mp of LAYOUT.meshPanels)
    pushWall({ x1: mp.x1, z1: mp.z1, x2: mp.x2, z2: mp.z2, h: mp.h, tex: T[mp.tex], texLen: mp.texLen });

  /* --- ベンチ列（箱の組み合わせ。裏から見ても正しい） --- */
  const woodTop = { colS: "rgb(172,138,98)", colGap: "rgb(104,80,60)", gapAxis: "z", boards: 3 };
  const thinTop = { colS: "rgb(150,116,82)" };
  for (const bench of LAYOUT.benches) {
    const bx = bench.x, zb = LAYOUT.benchZ;
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
  { const sn = LAYOUT.structures.sign;
    BOXES.push({ x1: sn.x1, x2: sn.x2, z1: sn.z1, z2: sn.z2,
                 y0: sn.y0, y1: sn.y1, side: T[sn.texFront], sideN: T[sn.texFront],
                 sideS: T[sn.texBack], sideEnd: T[sn.texEnd] });
    COLLIDERS.push({ x: sn.collider.x, z: sn.collider.z, r: sn.collider.r }); }

  /* --- 公衆トイレ（北西の角） --- */
  { const tl = LAYOUT.structures.toilet;
    BOXES.push({ x1: tl.x1, x2: tl.x2, z1: tl.z1, z2: tl.z2, y0: tl.y0, y1: tl.y1,
                 sideS: T[tl.texS], sideN: T[tl.texN], sideE: T[tl.texE],
                 sideW: T[tl.texW], side: T[tl.texS], top: { colS: "rgb(96,92,88)" } });
    for (const c of tl.colliders) COLLIDERS.push({ x: c.x, z: c.z, r: c.r }); }

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
  LAYOUT.trees.forEach((tr, i) => pushTree(tr, i, true));
  /* --- 街路樹と南の緑地帯（園外の自然） --- */
  LAYOUT.streetTrees.forEach((tr, i) => pushTree(tr, i + 5, false));

  /* --- 大木の根元の植え込み（ヤブラン環。生成パラメータは treeBed 側に持たせてある） --- */
  const treeBed = LAYOUT.ground.beds.treeBed;
  { const ring = treeBed.liriopeRing;
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * 6.283 + ring.phase;
      const rr = ring.rBase + (i % 3) * ring.rStep;
      const sp = S.liriope[i % 3];
      SPRITES3.push({
        x: treeBed.x + Math.cos(a) * rr,
        z: treeBed.z + Math.sin(a) * rr * ring.zSquash,
        img: sp.img, w: sp.w, h: sp.h,
      });
    } }
  COLLIDERS.push({ x: treeBed.x, z: treeBed.z, r: treeBed.r - 0.1 });

  /* --- 西側の花壇（低木/サツキは LAYOUT.props 側、縁のヤブラン列は生成パラメータ） --- */
  const westBed = LAYOUT.ground.beds.westBed;
  { const row = westBed.liriopeRow;
    for (let i = 0; i < row.n; i++) {
      const sp = S.liriope[(i + row.palOffset) % 3];
      SPRITES3.push({ x: row.x, z: row.z0 + i * row.dz, img: sp.img, w: sp.w, h: sp.h });
    } }
  for (const c of westBed.colliders) COLLIDERS.push({ x: c.x, z: c.z, r: c.r });

  /* --- 単体スプライトの小物（隅の低木・入口まわり・雑草など）を type レジストリで展開 --- */
  const PROP_SPRITE = {
    lamp: () => S.lamp,
    fountain: () => S.fountain,
    bollard: () => S.bollard,
    planter: e => S.planter[e.variant || 0],
    shrub: e => S.shrub[e.variant || 0],
    azalea: e => S.azalea[e.variant || 0],
    weed: e => S.weed[e.variant || 0],
  };
  for (const p of LAYOUT.props) {
    const sp = PROP_SPRITE[p.type](p);
    SPRITES3.push({ x: p.x, z: p.z, img: sp.img, w: sp.w, h: sp.h });
    if (p.r) COLLIDERS.push({ x: p.x, z: p.z, r: p.r });
  }

  /* 鳩（ついばみアニメ用にリストを持つ） */
  PIGEONS = [];
  LAYOUT.critters.filter(cr => cr.type === "pigeon").forEach((pg, i) => {
    const sp = S.pigeon[i];
    const ent = { x: pg.x, z: pg.z, img: sp.frames[0], frames: sp.frames,
                  w: sp.w, h: sp.h, state: 0, t: 1 + i * 1.3 };
    SPRITES3.push(ent);
    PIGEONS.push(ent);
  });

  /* ネコ（ベンチの上で丸くなる茶トラ / 木陰に座るハチワレ）
     2フレームの小さなアニメ: 寝ネコ=呼吸、座りネコ=瞬き＋しっぽ。
     寝ネコは cat:"sleep" タグのついたベンチから位置を導出する */
  CAT_ANIMS = [];
  const sleepBench = LAYOUT.benches.find(b => b.cat === "sleep");
  const sitPos = LAYOUT.critters.find(cr => cr.type === "catSit");
  const sleepEnt = { x: sleepBench.x, z: LAYOUT.benchZ - 0.02, y0: 0.44,
                     img: S.catSleep.frames[0], frames: S.catSleep.frames,
                     w: S.catSleep.w, h: S.catSleep.h, kind: "sleep", fi: 0, animT: 0.8 };
  const sitEnt = { x: sitPos.x, z: sitPos.z,
                   img: S.catSit.frames[0], frames: S.catSit.frames,
                   w: S.catSit.w, h: S.catSit.h, kind: "sit", fi: 0, animT: 2.5 };
  SPRITES3.push(sleepEnt, sitEnt);
  CAT_ANIMS.push(sleepEnt, sitEnt);
  COLLIDERS.push({ x: sitPos.x, z: sitPos.z, r: sitPos.r });
  CATS = [{ x: sitPos.x, z: sitPos.z, awake: true }, { x: sleepBench.x, z: LAYOUT.benchZ, awake: false }];

  /* --- コンビニ（東の開けた側・園外） --- */
  addBuildingWalls(LAYOUT.structures.konbini, T);

  /* --- 喫煙所（コンビニの南隣・園外） --- */
  { const sm = LAYOUT.structures.smokingArea;
    pushWall({ x1: sm.panel.x1, z1: sm.panel.z1, x2: sm.panel.x2, z2: sm.panel.z2,
               h: sm.panel.h, tex: T[sm.panel.tex] });
    SPRITES3.push({ x: sm.ashtray.x, z: sm.ashtray.z, img: S.ashtray.img, w: S.ashtray.w, h: S.ashtray.h }); }
}

/* ---------- カメラ・移動（移動と見回しは独立） ---------- */
const CAM = { x: 0, z: 5.8, yaw: 0, eye: 1.55, hor: R3.HOR_BASE };
const INPUT = { fwd: false, back: false, sLeft: false, sRight: false, tLeft: false, tRight: false };
let bobT = 0, bobAmp = 0, stepT = 0;
let SEATED = false;
let eyeBase = 1.55;
let lastInputT = 0;   // 着席UIの自動フェード用（何か操作があるたび更新）

/* 着席中は正面180°(南=π ±90°)だけ見回せる。yawとπの差を[-π,π]に正規化し、
   [-π/2, +π/2]にクランプして返す純関数 */
function clampSeatedYaw(yaw) {
  let diff = yaw - Math.PI;
  diff = ((diff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  diff = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, diff));
  return Math.PI + diff;
}

/* 座席アンカー（P5）: ベンチの座面中心。cat:"sleep" タグのベンチは寝ネコが中央に
   乗っているため、その左隣（0.55m猫よけ）に座る。ベンチの座標を動かしても
   このオフセットだけで自動的についてくる */
const CAT_AVOID_DX = 0.55;
const BENCH_SEATS = LAYOUT.benches.map(bench => ({
  x: bench.cat === "sleep" ? bench.x - CAT_AVOID_DX : bench.x,
  z: LAYOUT.benchZ + 0.09,
}));
const SEAT_RANGE = 2.0;   // この距離(m)以内で着席可・着席UI表示

function nearestSeat() {
  let seat = null, dist = Infinity;
  for (const s of BENCH_SEATS) {
    const d = Math.hypot(CAM.x - s.x, CAM.z - s.z);
    if (d < dist) { dist = d; seat = s; }
  }
  return { seat, dist };
}

function sitDown(seat) {
  SEATED = true;
  CAM.x = seat.x; CAM.z = seat.z;
  CAM.yaw = Math.PI;
  CAM.hor = R3.HOR_BASE;
  eyeBase = CAM.eye = 1.05;
  AUDIO3.seated = true;
  lastInputT = simT;
}
function standUp() {
  SEATED = false;
  eyeBase = CAM.eye = 1.55;
  AUDIO3.seated = false;
}
function toggleSit() {
  if (SEATED) { standUp(); return; }
  const { seat, dist } = nearestSeat();
  if (seat && dist <= SEAT_RANGE) sitDown(seat);
}

function movePlayer(dt) {
  if (SEATED) {
    /* Q/Eでも旋回できる（見回し手段）。前方180°(南±90°)にクランプする */
    if (INPUT.tLeft) { CAM.yaw -= 1.8 * dt; CAM.yaw = clampSeatedYaw(CAM.yaw); }
    if (INPUT.tRight) { CAM.yaw += 1.8 * dt; CAM.yaw = clampSeatedYaw(CAM.yaw); }
    CAM.eye = eyeBase;
    if (INPUT.fwd || INPUT.back || INPUT.sLeft || INPUT.sRight) standUp();
    return;
  }
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
  CAM.eye = eyeBase + Math.sin(bobT) * 0.035 * bobAmp;
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
  /* 次の入園に備えて入口へ戻しておく */
  CAM.x = 0; CAM.z = 5.8; CAM.yaw = 0; CAM.hor = R3.HOR_BASE;
  INPUT.fwd = INPUT.back = INPUT.sLeft = INPUT.sRight = false;
  standUp();
  eyeBase = CAM.eye = 1.55;
  hideSeatUI();
}

/* ---------- 着席UI（P5）: 未使用だった #hint を流用 + モバイル用 #sit-btn ---------- */
const hintEl = document.getElementById("hint");
const sitBtn = document.getElementById("sit-btn");
let hintShown = false, hintTextNow = "", sitBtnShown = false;

function hideSeatUI() {
  if (hintShown) { hintEl.classList.remove("show"); hintShown = false; }
  if (sitBtnShown) { sitBtn.classList.remove("visible"); sitBtnShown = false; }
}

function updateSeatUI() {
  const { dist } = nearestSeat();
  const active = SEATED || dist <= SEAT_RANGE;
  if (!active) { hideSeatUI(); return; }
  /* 着席中は4秒操作がなければ案内を隠す（立位中はフェードしない） */
  if (SEATED && simT - lastInputT > 4) { hideSeatUI(); return; }
  const label = SEATED ? "たつ" : "すわる";
  const text = SEATED ? "スペース ─ たちあがる" : "スペース ─ ベンチに こしかける";
  if (!hintShown) { hintEl.classList.add("show"); hintShown = true; }
  if (hintTextNow !== text) { hintEl.textContent = text; hintTextNow = text; }
  if (!sitBtnShown) { sitBtn.classList.add("visible"); sitBtnShown = true; }
  if (sitBtn.textContent !== label) sitBtn.textContent = label;
}

/* ---------- 入力 ---------- */
const KEYMAP = {
  ArrowUp: "fwd", w: "fwd", W: "fwd",
  ArrowDown: "back", s: "back", S: "back",
  ArrowLeft: "sLeft", a: "sLeft", A: "sLeft",
  ArrowRight: "sRight", d: "sRight", D: "sRight",
  q: "tLeft", Q: "tLeft", e: "tRight", E: "tRight",
};
window.addEventListener("keydown", ev => {
  lastInputT = simT;
  const k = KEYMAP[ev.key];
  if (k) { INPUT[k] = true; ev.preventDefault(); }
  if (ev.key === " " && INSIDE) { ev.preventDefault(); toggleSit(); }
  if ((ev.key === "m" || ev.key === "M") && INSIDE) {
    if (!AUDIO3.ctx) { try { AUDIO3.init(); } catch (err) { return; } }
    AUDIO3.setOn(!AUDIO3.on);
  }
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
  lastInputT = simT;
  CAM.yaw += ev.movementX * 0.0032;
  if (SEATED) CAM.yaw = clampSeatedYaw(CAM.yaw);
  CAM.hor = clampHor(CAM.hor - ev.movementY * 0.4);
});

let lookPt = null;
screenCvs.addEventListener("pointerdown", ev => {
  lastInputT = simT;
  if (locked()) return;
  lookPt = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
  screenCvs.setPointerCapture(ev.pointerId);
});
screenCvs.addEventListener("pointermove", ev => {
  if (locked() || !lookPt || ev.pointerId !== lookPt.id) return;
  lastInputT = simT;
  const dx = ev.clientX - lookPt.x, dy = ev.clientY - lookPt.y;
  lookPt.x = ev.clientX; lookPt.y = ev.clientY;
  /* 掴んだ景色が指についてくる向き（従来と逆） */
  CAM.yaw -= dx * 0.0042;
  if (SEATED) CAM.yaw = clampSeatedYaw(CAM.yaw);
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
/* 着席ボタン（タッチ端末用。ベンチ圏内か座り中のみ表示） */
sitBtn.addEventListener("pointerdown", ev => { ev.preventDefault(); toggleSit(); });

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
  /* ネコ: 寝ネコは呼吸、座りネコはたまに瞬き＋しっぽ */
  for (const c of CAT_ANIMS) {
    c.animT -= dt;
    if (c.animT <= 0) {
      if (c.kind === "sleep") {
        c.fi ^= 1; c.animT = 0.8;                     // 1.6秒周期の呼吸
      } else if (c.fi === 0) {
        c.fi = 1; c.animT = 0.22;                     // 瞬き＋しっぽの一振り
      } else {
        c.fi = 0; c.animT = 2.2 + Math.random() * 2.6;
      }
      c.img = c.frames[c.fi];
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
  /* 雨: 雨すじ70粒を維持し、着地したら波紋を残して上へリスポーン */
  if (curWeather().particle === "rain") {
    const rd = ASSETS.spr.rainDrop, sp2 = ASSETS.spr.splash;
    while (RAIN.length < 70) {
      RAIN.push({
        x: CAM.x + (Math.random() - 0.5) * 18,
        z: CAM.z + (Math.random() - 0.5) * 18,
        y0: 3 + Math.random() * 3,
        img: rd.img, w: rd.w, h: rd.h,
      });
    }
    for (const r of RAIN) {
      r.y0 -= 7.5 * dt;
      r.x += wind * 0.3 * dt;
      if (r.y0 < 0.05) {
        if (SPLASHES.length < 12) {
          SPLASHES.push({ x: r.x, z: r.z, ttl: 0.13, img: sp2.img, w: sp2.w, h: sp2.h });
        }
        r.x = CAM.x + (Math.random() - 0.5) * 18;
        r.z = CAM.z + (Math.random() - 0.5) * 18;
        r.y0 = 3 + Math.random() * 3;
      }
    }
    for (let i = SPLASHES.length - 1; i >= 0; i--) {
      SPLASHES[i].ttl -= dt;
      if (SPLASHES[i].ttl <= 0) SPLASHES.splice(i, 1);
    }
  } else if (RAIN.length || SPLASHES.length) {
    RAIN = []; SPLASHES = [];
  }
  return wind;
}

/* ---------- メインループ ---------- */
let last = 0;
function tick(dt) {
  if (INSIDE) { movePlayer(dt); updateSeatUI(); }
  const wind = updateAnim(dt);
  AUDIO3.update(dt, wind);
  const extra = LEAVES.length || RAIN.length || SPLASHES.length;
  R3.render(CAM, WALLS, BOXES,
    extra ? SPRITES3.concat(LEAVES, RAIN, SPLASHES) : SPRITES3, simT);
}
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  tick(dt);
  requestAnimationFrame(frame);
}

/* ---------- 起動（季節は今の月・時間帯は今の時刻から） ---------- */
/* Dateから{season, mode}を決める。入園時にも同じ判定で再取得する */
function envFromDate(d) {
  const mo = d.getMonth() + 1, h = d.getHours();
  return {
    season: mo >= 3 && mo <= 5 ? "spring" : mo >= 6 && mo <= 8 ? "summer"
          : mo >= 9 && mo <= 11 ? "autumn" : "winter",
    mode: h >= 5 && h < 10 ? "morning" : h >= 10 && h < 16 ? "day"
        : h >= 16 && h < 19 ? "dusk" : "night",
  };
}
(function initialEnv() {
  const env = envFromDate(new Date());
  ENV.season = env.season;
  ENV.mode = env.mode;
})();
R3.init(screenCvs);
rebuildWorld();
fitScreen();
last = performance.now();
requestAnimationFrame(frame);

document.getElementById("enter-btn").addEventListener("click", () => {
  const env = envFromDate(new Date());
  /* URLに ?weather=rain / ?weather=clear があれば抽選を上書きして必ずその天気で
     入園する（雨の挙動を確認するための開発・検証用。園内UIは増やさない） */
  const forced = new URLSearchParams(location.search).get("weather");
  const wetRoll = (forced === "rain" || forced === "clear")
    ? forced
    : (Math.random() < 0.05 ? "rain" : "clear");
  if (env.season !== ENV.season || env.mode !== ENV.mode || wetRoll !== ENV.weather) {
    ENV.season = env.season;
    ENV.mode = env.mode;
    ENV.weather = wetRoll;
    rebuildWorld();
  }
  document.getElementById("entrance").classList.add("closed");
  INSIDE = true;
  /* タッチ端末では入園タップ（ユーザー操作）を機に全画面化して没入させる。
     iOS等の未対応・拒否は握りつぶす（園内にボタンは足さない） */
  if (window.matchMedia("(pointer: coarse)").matches) {
    const el = document.documentElement;
    const rfs = el.requestFullscreen || el.webkitRequestFullscreen;
    if (rfs) { const p = rfs.call(el); if (p && p.catch) p.catch(() => {}); }
  }
  if (document.getElementById("sound-check").checked) {
    try {
      AUDIO3.init();
      AUDIO3.setOn(true);
    } catch (err) { /* 音が使えなくても入園できる */ }
  }
});

/* 検証・デバッグ用フック */
window.PARK = {
  cam: CAM, input: INPUT, audio: AUDIO3, env: ENV, envFromDate,
  setEnv(season, mode) {
    if (season) ENV.season = season;
    if (mode) ENV.mode = mode;
    rebuildWorld();
  },
  setWeather(w) {
    ENV.weather = w;
    rebuildWorld();
  },
  step(n, dt) {
    dt = dt || 1 / 60;
    for (let i = 0; i < (n || 1); i++) tick(dt);
  },
  isSeated: () => SEATED,
};
PARK.clampSeatedYaw = clampSeatedYaw;   // 検証用に外から呼べるようにする
