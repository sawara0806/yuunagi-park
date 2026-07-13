"use strict";
/* ============================================================
   assets3d.js — 手続き生成のドット絵素材
   写真の街区公園を再現する:
   レンガの円形広場 / コンクリート平板 / ベンチ列 / 大きな木と
   その根元の植え込み / 金網フェンス / 奥のアパート / 遠景のビル群
   ============================================================ */

/* ---------- 配置（唯一の真実は js/layout3d.js の LAYOUT。
   L は既存コードとの互換のためのエイリアス。新規参照は LAYOUT を直接使うこと） ---------- */
const L = {
  get TREES() { return LAYOUT.trees; },
  get STREET_TREES() { return LAYOUT.streetTrees; },
  get BENCH_Z() { return LAYOUT.benchZ; },
  get BENCHES_X() { return LAYOUT.benches.map(b => b.x); },
  get BED() { return LAYOUT.ground.beds.treeBed; },
  get WBED() { return LAYOUT.ground.beds.westBed; },
  get FENCE() { return LAYOUT.ground.fence; },
  get MANHOLE() { return LAYOUT.ground.manhole; },
  get PLAZA_R() { return LAYOUT.ground.plaza.r; },
};

/* ---------- 季節と時間帯と天気 ---------- */
const ENV = { season: "summer", mode: "day", weather: "clear" };
const MODE_GRADE = {
  morning: { mul: [1.03, 0.98, 0.93], tint: [255, 224, 178], amt: 0.10 },
  day:     { mul: [1, 1, 1], tint: [255, 255, 255], amt: 0 },
  dusk:    { mul: [1.10, 0.87, 0.74], tint: [250, 148, 92], amt: 0.18 },
  night:   { mul: [0.40, 0.46, 0.62], tint: [52, 72, 118], amt: 0.28 },
};
/* ============================================================
   天気レジストリ — 天気で分岐する値はすべてここに集約する。
   新しい天気（雪・霧など）はエントリを1つ足すだけで、
   グレーディング／空／雲／霞み／地面の濡れ／粒子／音が一括で切り替わる。
   読む側は curWeather() 経由で参照し、ENV.weather を直接分岐しない。
   ============================================================ */
const WEATHER = {
  clear: {
    grade: null,          // モードグレーディングに重ねる追加グレーディング（なし）
    haze: { morning: [228, 216, 198], day: [214, 222, 228],
            dusk: [210, 158, 126], night: [34, 44, 64] },
    farHaze: 62,          // 完全に霞む距離(m)
    skyTopFill: { morning: "rgb(140,172,210)", day: "rgb(150,196,232)",
                  dusk: "rgb(88,76,122)", night: "rgb(10,16,38)" },
    /* 空ストリップのパレット（buildSkyTex）。sun/moonはあるモードだけ描く */
    sky: {
      morning: { top: [140, 172, 210], bot: [246, 220, 186],
                 ridge1: [206, 198, 204], ridge2: [192, 184, 194],
                 towerA: [190, 192, 202], towerB: [178, 180, 194],
                 haze: [236, 222, 202], winLit: 0.10,
                 sun: { x: 0.70, y: 26, r: 9, col: [255, 240, 200], glow: [255, 216, 150] } },
      day:     { top: [150, 196, 232], bot: [208, 223, 233],
                 ridge1: [193, 207, 220], ridge2: [180, 196, 211],
                 towerA: [176, 190, 204], towerB: [164, 178, 194],
                 haze: [218, 226, 228], winLit: 0 },
      dusk:    { top: [88, 76, 122], bot: [250, 166, 104],
                 ridge1: [148, 116, 138], ridge2: [126, 100, 126],
                 towerA: [128, 104, 128], towerB: [110, 92, 118],
                 haze: [244, 176, 122], winLit: 0.5,
                 sun: { x: 0.30, y: 16, r: 12, col: [255, 176, 100], glow: [252, 140, 84] } },
      night:   { top: [10, 16, 38], bot: [40, 54, 84],
                 ridge1: [34, 46, 70], ridge2: [28, 40, 62],
                 towerA: [36, 48, 72], towerB: [30, 42, 64],
                 haze: [46, 58, 86], winLit: 0.55,
                 moon: { x: 0.62, y: 34, r: 8 } },
    },
    clouds: { n: 13, hi: [246, 250, 252], lo: [225, 233, 240] },
    showStars: true,      // 夜に星を描くか
    wetGround: false,     // 地面を濡らす（暗め＋照り返し＋水たまり）か
    particle: null,       // updateAnimが維持する粒子（"rain" など）
    audio: { windMul: 1, rainGain: 0, chirpMul: 1, quietBirds: false },
  },
  rain: {
    /* MODE_GRADEの後にさらに重ねる曇天寄りのグレーディング */
    grade: { mul: [0.84, 0.86, 0.90], tint: [182, 196, 212], amt: 0.10 },
    haze: { morning: [190, 194, 200], day: [198, 202, 208],
            dusk: [162, 148, 146], night: [50, 58, 78] },
    farHaze: 40,
    skyTopFill: { morning: "rgb(150,156,168)", day: "rgb(158,166,178)",
                  dusk: "rgb(110,100,118)", night: "rgb(16,20,36)" },
    /* フラットな灰の階調。太陽・月・星は描かず、山なみ/ビル群もhaze寄りに霞ませる */
    sky: {
      morning: { top: [150, 156, 168], bot: [196, 200, 208],
                 ridge1: [176, 178, 186], ridge2: [166, 170, 180],
                 towerA: [172, 176, 184], towerB: [162, 168, 178],
                 haze: [190, 194, 200], winLit: 0.10 },
      day:     { top: [158, 166, 178], bot: [204, 210, 216],
                 ridge1: [182, 188, 194], ridge2: [172, 180, 188],
                 towerA: [178, 184, 192], towerB: [168, 176, 186],
                 haze: [196, 200, 206], winLit: 0 },
      dusk:    { top: [110, 100, 118], bot: [168, 144, 138],
                 ridge1: [142, 132, 138], ridge2: [130, 122, 130],
                 towerA: [136, 126, 134], towerB: [124, 116, 128],
                 haze: [158, 144, 142], winLit: 0.35 },
      night:   { top: [16, 20, 36], bot: [44, 52, 72],
                 ridge1: [40, 46, 64], ridge2: [34, 40, 58],
                 towerA: [42, 48, 68], towerB: [36, 44, 62],
                 haze: [50, 58, 78], winLit: 0.45 },
    },
    clouds: { n: 18, hi: [188, 192, 200], lo: [158, 163, 175] },  // 数割増し・灰色
    showStars: false,
    wetGround: true,
    particle: "rain",
    /* windMul=風量倍率, rainGain=雨音ゲイン, chirpMul=雀の発火確率倍率,
       quietBirds=true でハト・ヒヨドリ・セミが鳴かない */
    audio: { windMul: 1.2, rainGain: 0.055, chirpMul: 0.3, quietBirds: true },
  },
};
const curWeather = () => WEATHER[ENV.weather];
const isDark = () => ENV.mode === "dusk" || ENV.mode === "night";
let GRADE_BYPASS = false;   // 空など「モード専用の色」を作るとき true
function applyGrade(c, g) {
  if (g.amt === 0) return c;
  return [
    Math.min(255, (c[0] * g.mul[0]) * (1 - g.amt) + g.tint[0] * g.amt),
    Math.min(255, (c[1] * g.mul[1]) * (1 - g.amt) + g.tint[1] * g.amt),
    Math.min(255, (c[2] * g.mul[2]) * (1 - g.amt) + g.tint[2] * g.amt),
  ];
}
function gradeColor(c) {
  if (GRADE_BYPASS) return c;
  let out = applyGrade(c, MODE_GRADE[ENV.mode]);
  const wg = curWeather().grade;
  if (wg) out = applyGrade(out, wg);
  return out;
}

/* ---------- 基本ヘルパ ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const pack = (r, g, b) =>
  (0xff000000 | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;

function mkCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
/* 透明ありのドット絵キャンバス。
   px/rect は時間帯グレーディングを通る。灯りなど発光はRaw版で */
function sheetA(w, h) {
  const c = mkCanvas(w, h), g = c.getContext("2d");
  return {
    c, g, w, h,
    px(x, y, col, a) {
      const k = gradeColor(col);
      g.fillStyle = a === undefined
        ? `rgb(${k[0] | 0},${k[1] | 0},${k[2] | 0})`
        : `rgba(${k[0] | 0},${k[1] | 0},${k[2] | 0},${a})`;
      g.fillRect(x | 0, y | 0, 1, 1);
    },
    rect(x, y, w2, h2, col) {
      const k = gradeColor(col);
      g.fillStyle = `rgb(${k[0] | 0},${k[1] | 0},${k[2] | 0})`;
      g.fillRect(x | 0, y | 0, w2, h2);
    },
    pxRaw(x, y, col, a) {
      g.fillStyle = a === undefined
        ? `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`
        : `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${a})`;
      g.fillRect(x | 0, y | 0, 1, 1);
    },
    rectRaw(x, y, w2, h2, col) {
      g.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
      g.fillRect(x | 0, y | 0, w2, h2);
    },
  };
}
const vary = (c, rng, amt) => {
  const d = (rng() - 0.5) * 2 * amt;
  return [clamp255(c[0] + d), clamp255(c[1] + d), clamp255(c[2] + d)];
};

/* ============================================================
   地面テクスチャ（40m×40m / 24px/m = 960×960）
   ============================================================ */
function buildFloorTex() {
  const ppm = 24, size = 960, ox = -20, oz = -20;
  const data = new Uint32Array(size * size);
  const mask = new Uint8Array(size * size);   // 焼き込み影
  const rng = mulberry32(20260707);

  /* --- 影マスクを先に落とす（木漏れ日・ベンチ・幹) --- */
  const stampBlob = (wx, wz, r, holeP) => {
    const x0 = ((wx - r - ox) * ppm) | 0, x1 = ((wx + r - ox) * ppm) | 0;
    const z0 = ((wz - r - oz) * ppm) | 0, z1 = ((wz + r - oz) * ppm) | 0;
    for (let tz = z0; tz <= z1; tz++) {
      if (tz < 0 || tz >= size) continue;
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || tx >= size) continue;
        const dx = (tx / ppm + ox) - wx, dz = (tz / ppm + oz) - wz;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > r) continue;
        if (d > r * 0.6 && ((tx + tz) & 1)) continue;         // 縁のディザ
        if (holeP && hash2(tx, tz) < holeP) continue;          // 木漏れ日の抜け
        mask[tz * size + tx] = 1;
      }
    }
  };
  for (const tr of LAYOUT.trees.concat(LAYOUT.streetTrees)) {
    const R = tr.big ? 3.4 : 2.5;
    const n = tr.big ? 90 : 55;
    const cx2 = tr.x + 1.9, cz2 = tr.z + 1.4;                  // 影は南東へ
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.283, rr = (rng() + rng()) * 0.5 * R;
      if (rng() < 0.30) continue;                              // 抜けを作る
      stampBlob(cx2 + Math.cos(a) * rr, cz2 + Math.sin(a) * rr * 0.8,
                0.2 + rng() * 0.42, 0.26);
    }
    stampBlob(tr.x + 0.3, tr.z + 0.25, 0.55, 0);               // 幹の接地影
  }
  for (const bench of LAYOUT.benches) {                         // ベンチの影
    const bx = bench.x;
    const x0 = ((bx - 0.65 - ox) * ppm) | 0, x1 = ((bx + 1.15 - ox) * ppm) | 0;
    const z0 = ((LAYOUT.benchZ + 0.3 - oz) * ppm) | 0, z1 = ((LAYOUT.benchZ + 1.05 - oz) * ppm) | 0;
    for (let tz = z0; tz <= z1; tz++)
      for (let tx = x0; tx <= x1; tx++) {
        if ((tz === z0 || tz === z1 || tx === x0 || tx === x1) && ((tx + tz) & 1)) continue;
        mask[tz * size + tx] = 1;
      }
  }
  /* 生け垣・トイレの接地影（LAYOUTの shadow フィールドから導出。
     位置を動かせば影も一緒に動く — ただし shadow の矩形自体は
     移設元の実測値のまま、対象と同じエントリに置いてある） */
  const hedgeShadow = (wx0, wz0, wx1, wz1) => {
    const x0 = ((wx0 - ox) * ppm) | 0, x1 = ((wx1 - ox) * ppm) | 0;
    const z0 = ((wz0 - oz) * ppm) | 0, z1 = ((wz1 - oz) * ppm) | 0;
    for (let tz = z0; tz <= z1; tz++)
      for (let tx = x0; tx <= x1; tx++) {
        if ((tz === z1 || tx === x1) && ((tx + tz) & 1)) continue;
        mask[tz * size + tx] = 1;
      }
  };
  for (const hd of LAYOUT.hedges) {
    if (hd.shadow) hedgeShadow(hd.shadow.x1, hd.shadow.z1, hd.shadow.x2, hd.shadow.z2);
  }
  if (LAYOUT.structures.toilet.shadow) {
    const s = LAYOUT.structures.toilet.shadow;
    hedgeShadow(s.x1, s.z1, s.x2, s.z2);
  }

  /* --- 本体 --- */
  const brickPal = [[172, 116, 92], [158, 102, 82], [178, 128, 102], [148, 94, 76]];
  /* 季節ごとの草の色と落ち葉 */
  const SG = {
    spring: { verge: [102, 148, 82], belt: [96, 142, 78], joint: [96, 132, 66],
              leafTh: 0.998, leafCols: [[236, 186, 200], [244, 210, 220]] },
    summer: { verge: [100, 142, 78], belt: [94, 136, 74], joint: [92, 126, 64],
              leafTh: 0.9975, leafCols: [[150, 118, 58], [128, 96, 52]] },
    autumn: { verge: [138, 128, 68], belt: [130, 120, 64], joint: [124, 116, 58],
              leafTh: 0.988, leafCols: [[188, 122, 52], [170, 90, 44], [204, 160, 62]] },
    winter: { verge: [152, 142, 112], belt: [144, 134, 106], joint: [130, 122, 96],
              leafTh: 0.9995, leafCols: [[120, 96, 60]] },
  }[ENV.season];
  /* 雨: 水たまり5箇所（固定座標・広場と平板の上）と、反射に使う暗めの空グレー */
  const RAIN_PUDDLES = LAYOUT.ground.puddles;
  const PUDDLE_SKY = {
    morning: [141, 144, 150], day: [147, 151, 156],
    dusk: [121, 104, 99], night: [32, 37, 52],
  }[ENV.mode];
  /* 夜の光だまりの中心＝公園灯（LAYOUT.propsが単一の真実） */
  const LAMP = LAYOUT.props.find(p => p.type === "lamp");
  /* 木の近くほど落ち葉が濃い（秋） */
  const allTrees = LAYOUT.trees.concat(LAYOUT.streetTrees);
  const nearTree = (x, z) => {
    let m = 99;
    for (const tr of allTrees) m = Math.min(m, Math.hypot(x - tr.x, z - tr.z));
    return m;
  };
  const WBED = LAYOUT.ground.beds.westBed;
  const inWBED = (x, z) => x > WBED.x1 && x < WBED.x2 && z > WBED.z1 && z < WBED.z2;
  const nearWBED = (x, z, m) =>
    x > WBED.x1 - m && x < WBED.x2 + m && z > WBED.z1 - m && z < WBED.z2 + m;

  for (let tz = 0; tz < size; tz++) {
    const wz = (tz + 0.5) / ppm + oz;
    for (let tx = 0; tx < size; tx++) {
      const wx = (tx + 0.5) / ppm + ox;
      const n = hash2(tx, tz);
      const border = Math.max(Math.abs(wx), Math.abs(wz));
      let col;

      if (border > 10.0) {
        /* --- 園外: 縁石 → 植樹帯の芝生 → 車道 → 歩道 → 緑地帯 --- */
        const gatePath = wz > LAYOUT.ground.gatePath.z1 && Math.abs(wx) < LAYOUT.ground.gate.x2;   // 入口前の通路
        const PK = LAYOUT.ground.parking;
        if (wx > PK.x1 && wx < PK.x2 && wz > PK.z1 && wz < PK.z2) {
          /* コンビニ前の駐車場（白線つき） */
          const t = 150 + (n - 0.5) * 9;
          col = [t, t - 1, t - 2];
          if ((Math.abs(wz - PK.lineZ[0]) < 0.05 || Math.abs(wz - PK.lineZ[1]) < 0.05) && n > 0.3)
            col = [212, 214, 212];
        } else if (border < 10.42) {
          const t = 176 + (n - 0.5) * 10;
          col = [t + 2, t, t - 8];
          const alongJ = Math.abs(wx) > Math.abs(wz)
            ? Math.abs(wz * 24 % 48) < 2 : Math.abs(wx * 24 % 48) < 2;
          if (alongJ) col = [150, 146, 138];
        } else if (gatePath && wz < LAYOUT.ground.gatePath.z2) {
          const t = 186 + (n - 0.5) * 9;
          col = [t + 2, t - 2, t - 12];
          if ((wz * 24 % 24) < 1.2) col = [156, 152, 142];
        } else if (border < 11.35) {
          /* 植樹帯の芝生 */
          const patch = hash2((tx >> 3) + 7, (tz >> 3) + 7);
          if (patch < 0.10) {
            const t = 128 + (n - 0.5) * 18;
            col = [t + 8, t - 14, t - 44];                  // 土が覗く
          } else {
            const t = (n - 0.5) * 22;
            col = [SG.verge[0] + t, SG.verge[1] + t, SG.verge[2] + t * 0.7];
            if (n > 0.965) col = [SG.verge[0] * 0.7, SG.verge[1] * 0.76, SG.verge[2] * 0.78];
            if (n < 0.012 && ENV.season !== "winter") col = [238, 238, 228]; // 白詰草
          }
        } else if (border < 14.15) {
          /* 車道 */
          const t = 150 + (n - 0.5) * 9;
          col = [t, t - 1, t - 2];
          if (n > 0.995) col = [128, 126, 124];
        } else if (border < 15.1) {
          /* 歩道 */
          const t = 186 + (n - 0.5) * 9;
          col = [t + 2, t - 2, t - 12];
          const alongJ = Math.abs(wx) > Math.abs(wz)
            ? Math.abs(wz * 24 % 24) < 1.2 : Math.abs(wx * 24 % 24) < 1.2;
          if (alongJ) col = [156, 152, 142];
        } else if (border < 17.0) {
          /* 建物手前の緑地帯 */
          const patch = hash2((tx >> 3) + 3, (tz >> 3) + 3);
          if (patch < 0.13) {
            const t = 124 + (n - 0.5) * 18;
            col = [t + 8, t - 14, t - 44];
          } else {
            const t = (n - 0.5) * 22;
            col = [SG.belt[0] + t, SG.belt[1] + t, SG.belt[2] + t * 0.7];
            if (n > 0.96) col = [SG.belt[0] * 0.7, SG.belt[1] * 0.76, SG.belt[2] * 0.78];
          }
        } else {
          const t = 148 + (n - 0.5) * 9;
          col = [t, t - 1, t - 2];
        }
      } else {
        const r = Math.hypot(wx, wz);
        const BED = LAYOUT.ground.beds.treeBed;
        const dBed = Math.hypot(wx - BED.x, wz - BED.z);

        if (dBed < BED.r - 0.13) {
          /* 植え込みの土 */
          const t = 108 + (n - 0.5) * 22;
          col = [t + 6, t - 12, t - 36];
          if (n > 0.96) col = [86, 68, 50];
        } else if (dBed < BED.r + 0.12) {
          /* 縁石 */
          col = [176, 170, 158];
          if (Math.abs((Math.atan2(wz - BED.z, wx - BED.x) * BED.r * 24) % 12) < 1.4)
            col = [140, 134, 124];
        } else if (inWBED(wx, wz)) {
          const t = 106 + (n - 0.5) * 22;
          col = [t + 6, t - 12, t - 36];
        } else if (nearWBED(wx, wz, 0.13)) {
          col = [176, 170, 158];
        } else if (wz < LAYOUT.ground.northSoil.z1 && wz > -LAYOUT.ground.fence - 0.2) {
          /* 北側フェンス際の植栽帯の土 */
          const t = 98 + (n - 0.5) * 20;
          col = [t + 4, t - 12, t - 32];
        } else if (r < LAYOUT.ground.plaza.r) {
          /* --- レンガの円形広場 --- */
          const ring = r / 0.28;
          const ir = ring | 0;
          const th = Math.atan2(wz, wx) + Math.PI;
          const circ = Math.max(1, Math.round((6.283 * (ir + 0.5) * 0.28) / 0.55));
          const seg = th / 6.283 * circ;
          const is = seg | 0;
          if (ring - ir < 0.16 || (seg - is < 0.12 && r > 0.6)) {
            col = [122, 86, 70];                               // 目地
          } else {
            const b = brickPal[(hash2(ir * 7, is * 13) * 4) | 0];
            const d2 = (n - 0.5) * 14;
            /* 外周ほどわずかに色あせる */
            const age = 1 - (r / LAYOUT.ground.plaza.r) * 0.07;
            col = [(b[0] + d2) * age, (b[1] + d2) * age, (b[2] + d2) * age];
            if (n > 0.985) col = [b[0] - 26, b[1] - 24, b[2] - 20]; // 欠け
          }
          /* 縁石ぎわの苔 */
          if (r > 5.3 && hash2(tx + 5, tz + 5) < 0.05) col = [96, 116, 66];
          if (r < 0.45) col = [168, 162, 150];                 // 中心の石
        } else if (r < 6.02) {
          /* 縁石リング */
          col = [172, 168, 158];
          const arc = (Math.atan2(wz, wx) + Math.PI) * 5.85;
          if (arc % 1.2 < 0.07) col = [142, 138, 128];
        } else {
          /* --- コンクリート平板 (1m角) --- */
          const tileT = 182 + (hash2(Math.floor(wx) + 60, Math.floor(wz) + 60) - 0.5) * 17;
          const t = tileT + (n - 0.5) * 7;
          col = [t + 4, t, t - 9];
          const fx = wx - Math.floor(wx), fz = wz - Math.floor(wz);
          if (fx < 0.045 || fz < 0.045) {
            col = [151, 147, 137];
            /* 目地に生える草 */
            if (n < 0.07) col = SG.joint;
          }
          if (hash2(Math.floor(wx) + 9, Math.floor(wz) + 9) < 0.05) // 汚れたタイル
            col = [t - 13, t - 15, t - 20];
        }

        /* マンホール */
        const dm = Math.hypot(wx - LAYOUT.ground.manhole.x, wz - LAYOUT.ground.manhole.z);
        if (dm < 0.48) {
          if (dm > 0.42) col = [146, 142, 134];
          else if (dm > 0.36) col = [104, 102, 96];
          else {
            col = [122, 120, 112];
            if (((tx & 3) === 0 && (tz & 3) === 0)) col = [104, 102, 96];
          }
        }
        /* 落ち葉のかけら（季節で量と色が変わる。秋は木の下に積もる） */
        if (r > 0.6 && r < 9.8 && dBed > BED.r + 0.2) {
          let th = SG.leafTh;
          if (ENV.season === "autumn" && nearTree(wx, wz) < 4.5) th -= 0.03;
          if (n > th)
            col = SG.leafCols[(hash2(tx, tz + 1) * SG.leafCols.length) | 0];
        }
      }

      /* 影の適用（青みがかった影色。夜は影を弱く） */
      if (mask[tz * size + tx] && ENV.mode !== "night") {
        col = [col[0] * 0.62, col[1] * 0.66, col[2] * 0.78];
      }
      /* 時間帯グレーディング */
      col = gradeColor(col);
      /* 夜は公園灯の光だまり（位置はLAYOUT.propsの公園灯から取る） */
      if (ENV.mode === "night") {
        const dl = Math.hypot(wx - LAMP.x, wz - LAMP.z);
        if (dl < 2.8) {
          const f = (1 - dl / 2.8) * 0.55;
          col = [col[0] + (255 - col[0]) * f * 0.9,
                 col[1] + (216 - col[1]) * f * 0.9,
                 col[2] + (150 - col[2]) * f];
        }
      }
      /* 濡れた地面: 全体を暗くし、まれに照り返しの点＋固定5箇所の水たまり */
      if (curWeather().wetGround) {
        col = [col[0] * 0.90, col[1] * 0.90, col[2] * 0.90];
        if (hash2(tx + 41, tz + 41) < 0.004) col = [col[0] + 22, col[1] + 22, col[2] + 22];
        for (const p of RAIN_PUDDLES) {
          const pdx = (wx - p.x) / p.rx, pdz = (wz - p.z) / p.rz;
          const pd = Math.hypot(pdx, pdz);
          if (pd >= 1) continue;
          if (pd > 0.78 && ((tx + tz) & 1)) continue;      // 縁のディザ
          col = [col[0] * 0.5 + PUDDLE_SKY[0] * 0.5,
                 col[1] * 0.5 + PUDDLE_SKY[1] * 0.5,
                 col[2] * 0.5 + PUDDLE_SKY[2] * 0.5];
          break;
        }
      }
      data[tz * size + tx] = pack(clamp255(col[0]), clamp255(col[1]), clamp255(col[2]));
    }
  }
  const oc = gradeColor([150, 149, 147]);
  return { data, w: size, h: size, ppm, ox, oz,
           outside: pack(clamp255(oc[0]), clamp255(oc[1]), clamp255(oc[2])) };
}

/* ============================================================
   空（360° = 2π×投影距離 px。遠景のビル群を焼き込み）
   ============================================================ */
function buildSkyTex() {
  /* 高さは「見上げ」た時に地平線より上を覆えるだけ必要 */
  const w = 2325, h = 176;
  const sh = sheetA(w, h);
  const rng = mulberry32(777001);
  GRADE_BYPASS = true;   // 空の色はモード×天気ごとに手で決める（パレットはWEATHERレジストリ）
  const P = curWeather().sky[ENV.mode];

  for (let y = 0; y < h; y++) {
    const t = Math.pow(y / (h - 1), 0.85);
    const c = [P.top[0] + (P.bot[0] - P.top[0]) * t,
               P.top[1] + (P.bot[1] - P.top[1]) * t,
               P.top[2] + (P.bot[2] - P.top[2]) * t];
    for (let x = 0; x < w; x++) {
      const d = (hash2(x, y) - 0.5) * 3;
      sh.px(x, y, [c[0] + d, c[1] + d, c[2] + d]);
    }
  }
  /* 星（夜。曇天の夜は見えない） */
  if (ENV.mode === "night" && curWeather().showStars) {
    for (let i = 0; i < 320; i++) {
      const x = (rng() * w) | 0, y = (rng() * (h - 60)) | 0;
      const b = 0.35 + rng() * 0.65;
      sh.px(x, y, [225 * b + 30, 228 * b + 27, 240 * b + 15]);
      if (rng() < 0.06) { sh.px(x + 1, y, [180, 186, 205]); sh.px(x, y + 1, [180, 186, 205]); }
    }
  }
  /* 太陽（朝・夕） / 月（夜） */
  const disc = (cx, cy, r, col, glow) => {
    if (glow) for (let i = 3; i >= 1; i--) {
      const rr = r * (1 + i * 0.9);
      for (let y = cy - rr; y <= cy + rr; y++)
        for (let x = cx - rr; x <= cx + rr; x++)
          if (Math.hypot(x - cx, y - cy) <= rr && y >= 0 && y < h)
            sh.px(((x | 0) % w + w) % w, y | 0, glow, 0.10);
    }
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++)
        if (Math.hypot(x - cx, y - cy) <= r && y >= 0 && y < h)
          sh.px(((x | 0) % w + w) % w, y | 0, col);
  };
  if (P.sun) disc(P.sun.x * w, h - P.sun.y - 20, P.sun.r, P.sun.col, P.sun.glow);
  if (P.moon) {
    const mx = P.moon.x * w, my = h - P.moon.y - 60, r = P.moon.r;
    disc(mx, my, r, [226, 230, 238], [140, 156, 190]);
    for (let y = my - r; y <= my + r; y++)                      // 三日月に欠く
      for (let x = mx - r; x <= mx + r; x++)
        if (Math.hypot(x - (mx - 3), y - (my - 2)) <= r - 1 && Math.hypot(x - mx, y - my) <= r)
          sh.px(x | 0, y | 0, [20, 28, 52]);
  }
  /* 遠い山なみ（周期関数なので左右がつながる） */
  const ridge = (base, amp, col, k1, k2) => {
    for (let x = 0; x < w; x++) {
      const ph = (x / w) * Math.PI * 2;
      const y0 = h - base - amp * (0.6 * Math.sin(ph * k1 + 1.3) + 0.4 * Math.sin(ph * k2 + 4.1));
      for (let y = Math.max(0, y0 | 0); y < h; y++) sh.px(x, y, col);
    }
  };
  ridge(30, 17, P.ridge1, 2, 5);
  ridge(18, 12, P.ridge2, 3, 7);
  /* 遠景のビル群（2層 + 高層）。暗い時間帯は窓に灯り */
  const lit = [250, 216, 132];
  const layer = (n, hMin, hMax, base, hazeMix) => {
    for (let i = 0; i < n; i++) {
      const bx = (rng() * w) | 0, bw = (34 + rng() * 66) | 0, bh = (hMin + rng() * (hMax - hMin)) | 0;
      const tone = (rng() - 0.5) * 14;
      const col = [
        base[0] + tone + (P.haze[0] - base[0]) * hazeMix * 0.5,
        base[1] + tone + (P.haze[1] - base[1]) * hazeMix * 0.5,
        base[2] + tone + (P.haze[2] - base[2]) * hazeMix * 0.5,
      ];
      const winCol = [col[0] - 13, col[1] - 13, col[2] - 10];
      for (let y = h - bh; y < h; y++)
        for (let x = bx; x < bx + bw; x++) {
          const xx = ((x % w) + w) % w;
          let c = col;
          if (y === h - bh) c = [col[0] - 18, col[1] - 17, col[2] - 14];
          else if (y > h - bh + 2 && ((y - h + bh) % 4 < 2) && ((x - bx) % 5 < 2)
                   && hash2(x, y) > 0.25)
            c = (P.winLit && hash2(x * 3, y * 5) < P.winLit) ? lit : winCol;
          sh.px(xx, y, c);
        }
      if (rng() < 0.3) {
        const ax = ((bx + 4 + rng() * (bw - 8)) | 0 % w + w) % w;
        for (let y = h - bh - 4 - (rng() * 5 | 0); y < h - bh; y++) sh.px(ax, y, P.ridge1);
      }
    }
  };
  layer(16, 16, 34, P.towerA, 1.1);
  layer(12, 24, 52, P.towerB, 0.6);
  const talls = [
    [180, 26, 92], [520, 30, 76], [860, 22, 100], [1240, 34, 84],
    [1650, 26, 70], [1980, 30, 96],
  ];
  for (const [bx, bw, bh] of talls) {
    const col = P.towerA, winCol = [col[0] - 12, col[1] - 12, col[2] - 10];
    for (let y = h - bh; y < h; y++)
      for (let x = bx; x < bx + bw; x++) {
        const xx = ((x % w) + w) % w;
        let c = col;
        if (y === h - bh || x === bx || x === bx + bw - 1)
          c = [col[0] - 14, col[1] - 14, col[2] - 12];
        else if (((y - h + bh) % 5 < 2) && ((x - bx) % 4 < 2) && hash2(x, y) > 0.2)
          c = (P.winLit && hash2(x * 7, y * 3) < P.winLit) ? lit : winCol;
        sh.px(xx, y, c);
      }
    for (let x = bx + 4; x < bx + bw - 4; x += 9)
      sh.px(((x % w) + w) % w, h - bh - 1, P.ridge1);
    const ax = ((bx + (bw >> 1)) % w + w) % w;
    for (let y = h - bh - 7; y < h - bh; y++) sh.px(ax, y, P.ridge2);
    sh.px(ax, h - bh - 8, [220, 90, 90]);   // 航空障害灯
  }
  /* 地平の霞み */
  for (let y = h - 14; y < h; y++) {
    const a = (y - (h - 14)) / 14 * 0.5;
    for (let x = 0; x < w; x++) sh.px(x, y, P.haze, a * 0.7);
  }
  GRADE_BYPASS = false;
  return sh.c;
}

function buildCloudsTex() {
  /* 空とは別の透過ストリップ。描画時にゆっくり横へ流す */
  const w = 2325, h = 130;
  const sh = sheetA(w, h);
  const rng = mulberry32(424242);
  const CW = curWeather().clouds;
  const n = CW.n, colHi = CW.hi, colLo = CW.lo;
  for (let i = 0; i < n; i++) {
    const cx = rng() * w, cy = 8 + rng() * 100, s = 14 + rng() * 22;
    const nb = 7 + (rng() * 4 | 0);
    for (let b = 0; b < nb; b++) {
      const bx = cx + (rng() - 0.5) * s * 3.0, by = cy + (rng() - 0.5) * s * 0.7;
      const br = s * (0.28 + rng() * 0.34);
      for (let y = Math.max(0, by - br * 0.6) | 0; y < Math.min(h, by + br * 0.6); y++)
        for (let x = (bx - br) | 0; x <= bx + br; x++) {
          const d = Math.hypot((x - bx) / 1.4, (y - by) * 1.6) / br;
          if (d > 1) continue;
          if (d > 0.5 && ((x + y) & 1)) continue;
          if (d > 0.8 && ((x * 3 + y) & 3)) continue;
          const xx = ((x % w) + w) % w;
          sh.px(xx, y, y > by + br * 0.15 ? colLo : colHi);
        }
    }
  }
  return sh.c;
}

/* ============================================================
   建物の壁テクスチャ
   ============================================================ */
function texApartmentCream() {
  /* 木造モルタル2階建て・外階段つき（写真の奥の建物） */
  const ppm = 24, W = 15 * ppm, H = Math.round(6.8 * ppm); // 360×163
  const sh = sheetA(W, H);
  const rng = mulberry32(31);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      sh.px(x, y, vary([212, 200, 178], rng, 7));
  /* 屋根の笠木と軒 */
  sh.rect(0, 0, W, 7, [104, 96, 88]);
  sh.rect(0, 7, W, 2, [86, 78, 72]);
  sh.rect(0, 9, W, 3, [170, 158, 140]);
  /* 2階と1階の境（スラブ+廊下の影） */
  const mid = Math.round(H * 0.52);
  sh.rect(0, mid, W, 4, [168, 156, 138]);
  sh.rect(0, mid + 4, W, 3, [140, 128, 114]);
  /* 窓ヘルパ（暗い時間帯は一部の窓に灯り） */
  const win = (x, y, w2, h2) => {
    sh.rect(x - 2, y - 2, w2 + 4, h2 + 4, [128, 132, 138]);      // サッシ
    if (isDark() && hash2(x, y) < 0.45) {
      sh.rectRaw(x, y, w2, h2, ENV.mode === "night" ? [250, 212, 126] : [255, 226, 158]);
    } else {
      sh.rect(x, y, w2, h2, [128, 150, 172]);                     // ガラス
      for (let i = 0; i < h2; i++)                                // 斜めの映り込み
        for (let j = 0; j < w2; j++)
          if ((j + i) % 11 < 3 && j > i * 0.4) sh.px(x + j, y + i, [162, 184, 202]);
    }
    sh.rect(x + (w2 >> 1), y, 1, h2, [128, 132, 138]);            // 中桟
    sh.rect(x - 2, y + h2 + 2, w2 + 4, 2, [188, 178, 160]);       // 窓台
    for (let j = 0; j < w2 + 4; j++)                              // 窓下の雨だれ
      if (hash2(x + j, y) < 0.3)
        for (let i = 0; i < 6; i++) sh.px(x - 2 + j, y + h2 + 4 + i, [196, 184, 162], 0.35);
  };
  /* 2階: 窓と手すり */
  for (const wx of [26, 96, 166, 236]) win(wx, 26, 34, 26);
  for (let x = 4; x < W - 62; x += 4) sh.rect(x, mid - 22, 1, 22, [96, 102, 110]); // 手すり縦桟
  sh.rect(0, mid - 24, W - 58, 2, [120, 126, 134]);
  /* 1階: ドアと窓 */
  for (const dx of [40, 180]) {
    sh.rect(dx, H - 46, 24, 46, [110, 88, 64]);
    sh.rect(dx + 2, H - 42, 20, 18, [126, 102, 74]);
    sh.rect(dx + 2, H - 20, 20, 16, [126, 102, 74]);
    sh.px(dx + 20, H - 26, [188, 180, 160]);
  }
  for (const wx of [96, 240]) win(wx, mid + 22, 34, 26);
  /* 右端の外階段（鉄骨） */
  const sx = W - 56;
  sh.rect(sx, 12, 54, H - 12, [206, 196, 176]);
  for (let i = 0; i < 12; i++) {                                  // 段
    const yy = H - 10 - i * (H - 34) / 12;
    const xx = sx + 44 - i * 3.4;
    sh.rect(xx, yy, 12, 3, [112, 118, 126]);
    sh.rect(xx, yy + 3, 12, 2, [80, 86, 94]);
  }
  for (let i = 0; i <= 12; i += 3) {                              // 手すり支柱
    const yy = H - 10 - i * (H - 34) / 12;
    const xx = sx + 49 - i * 3.4;
    sh.rect(xx, yy - 16, 2, 16, [98, 104, 112]);
  }
  sh.rect(sx + 6, 24, 46, 2, [98, 104, 112]);                     // 上部手すり
  sh.rect(sx + 4, 26, 2, 14, [98, 104, 112]);
  /* 縦樋・エアコン室外機 */
  sh.rect(12, 12, 3, H - 12, [168, 158, 140]);
  for (const [ax, ay] of [[130, H - 15], [268, H - 15]]) {
    sh.rect(ax, ay, 18, 14, [196, 198, 198]);
    sh.rect(ax + 2, ay + 2, 10, 9, [170, 172, 174]);
    for (let i = 0; i < 5; i++) sh.rect(ax + 3, ay + 3 + i * 2, 8, 1, [150, 152, 154]);
  }
  /* 接地の影 */
  for (let y = H - 5; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, [90, 82, 72], (y - H + 5) / 5 * 0.5);
  return sh.c;
}

function texApartmentWhite() {
  const ppm = 24, W = 12 * ppm, H = Math.round(7.4 * ppm); // 288×178
  const sh = sheetA(W, H);
  const rng = mulberry32(47);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      sh.px(x, y, vary([226, 226, 220], rng, 6));
  sh.rect(0, 0, W, 6, [140, 138, 134]);
  sh.rect(0, 6, W, 2, [180, 178, 172]);
  const mid = Math.round(H * 0.5);
  sh.rect(0, mid, W, 4, [190, 188, 182]);
  sh.rect(0, mid + 4, W, 2, [160, 158, 152]);
  const win = (x, y, w2, h2) => {
    sh.rect(x - 2, y - 2, w2 + 4, h2 + 4, [136, 140, 146]);
    if (isDark() && hash2(x, y) < 0.4) {
      sh.rectRaw(x, y, w2, h2, ENV.mode === "night" ? [250, 212, 126] : [255, 226, 158]);
    } else {
      sh.rect(x, y, w2, h2, [120, 140, 160]);
      for (let i = 0; i < h2; i++)
        for (let j = 0; j < w2; j++)
          if ((j + i) % 9 < 2) sh.px(x + j, y + i, [152, 172, 190]);
    }
    sh.rect(x + (w2 >> 1), y, 1, h2, [136, 140, 146]);
  };
  for (const wx of [22, 86, 150, 214]) { win(wx, 24, 30, 24); win(wx, mid + 20, 30, 24); }
  sh.rect(W - 14, 8, 3, H - 8, [186, 184, 178]);
  for (let y = H - 5; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, [110, 108, 102], (y - H + 5) / 5 * 0.5);
  /* うっすら霞ませて距離感を出す */
  sh.g.fillStyle = "rgba(212,222,230,0.10)";
  sh.g.fillRect(0, 0, W, H);
  return sh.c;
}

function texHouseSiding() {
  const ppm = 24, W = 10 * ppm, H = Math.round(5.4 * ppm); // 240×130
  const sh = sheetA(W, H);
  const rng = mulberry32(59);
  for (let y = 0; y < H; y++) {
    const band = (y >> 2) & 1;
    for (let x = 0; x < W; x++)
      sh.px(x, y, vary(band ? [178, 180, 184] : [190, 192, 196], rng, 5));
  }
  sh.rect(0, 0, W, 8, [96, 90, 86]);
  sh.rect(0, 8, W, 2, [70, 66, 62]);
  const win = (x, y) => {
    sh.rect(x - 2, y - 2, 32, 26, [130, 134, 140]);
    sh.rect(x, y, 28, 22, [124, 144, 164]);
    sh.rect(x + 13, y, 1, 22, [130, 134, 140]);
  };
  win(40, 40); win(150, 40);
  sh.rect(96, H - 44, 26, 44, [120, 100, 78]);
  for (let y = H - 5; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, [90, 88, 84], (y - H + 5) / 5 * 0.5);
  sh.g.fillStyle = "rgba(212,222,230,0.08)";
  sh.g.fillRect(0, 0, W, H);
  return sh.c;
}

function texHousesFar() {
  /* 南側・道路の向かいの家並み（1枚に3軒ぶん） */
  const ppm = 20, W = 18 * ppm, H = Math.round(5.6 * ppm); // 360×112
  const sh = sheetA(W, H);
  const rng = mulberry32(73);
  const cols = [[206, 198, 184], [186, 188, 192], [214, 208, 196]];
  for (let i = 0; i < 3; i++) {
    const x0 = i * 120, col = cols[i];
    for (let y = 14; y < H; y++)
      for (let x = x0; x < x0 + 120; x++) sh.px(x, y, vary(col, rng, 6));
    sh.rect(x0, 8 + (i % 2) * 4, 120, 8, [128, 118, 112]);        // 屋根（遠景なので薄めに）
    sh.rect(x0, 16 + (i % 2) * 4, 120, 2, [108, 100, 96]);
    for (const wx of [x0 + 18, x0 + 70]) {
      if (isDark() && hash2(wx, 44) < 0.4)
        sh.rectRaw(wx, 44, 26, 20, ENV.mode === "night" ? [246, 208, 122] : [252, 222, 152]);
      else sh.rect(wx, 44, 26, 20, [128, 144, 160]);
      sh.rect(wx - 1, 43, 28, 1, [120, 122, 126]);
    }
    sh.rect(x0 + 46, H - 36, 20, 36, [116, 96, 76]);
  }
  for (let y = H - 4; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, [100, 96, 90], 0.4);
  sh.g.fillStyle = "rgba(212,222,230,0.30)";
  sh.g.fillRect(0, 0, W, H);
  return sh.c;
}

function texHedge() {
  const W = 96, H = 30; // 2m × 1.25m
  const sh = sheetA(W, H);
  for (let y = 4; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = hash2(x * 3, y * 3);
      let c = [62, 98, 52];
      if (n > 0.72) c = [82, 122, 58];
      if (n > 0.9) c = [104, 144, 66];
      if (y > H - 7) c = [46, 74, 42];
      if (y < 8 && hash2(x, y) < (8 - y) / 9) continue;          // 上端を不揃いに
      sh.px(x, y, c);
    }
  return sh.c;
}

function texFence() {
  /* 金網フェンス 2m × 1.5m（透過） */
  const W = 48, H = 36;
  const sh = sheetA(W, H);
  for (let x = 0; x < W; x++)                                     // 上枠パイプ
    for (let y = 1; y < 4; y++)
      sh.px(x, y, y === 1 ? [172, 176, 180] : [140, 144, 150]);
  sh.rect(0, 1, 2, H - 1, [148, 152, 156]);                       // 支柱
  sh.px(1, 1, [178, 182, 186]);
  for (let y = 4; y < H; y++)                                     // 金網（菱形）
    for (let x = 0; x < W; x++) {
      if ((x + y) % 4 === 0 || (x - y % 4 + 8) % 4 === 0)
        if ((x + y * 2) % 3) sh.px(x, y, [158, 162, 166], 0.55);
    }
  return sh.c;
}

function texGreenMesh() {
  /* 緑のネットフェンス 2m × 1.8m */
  const W = 48, H = 43;
  const sh = sheetA(W, H);
  sh.rect(0, 0, W, 2, [88, 128, 84]);
  sh.rect(0, H - 2, W, 2, [78, 114, 76]);
  sh.rect(0, 0, 2, H, [96, 134, 90]);
  for (let y = 2; y < H - 2; y++)
    for (let x = 0; x < W; x++)
      if (x % 3 === 0 || y % 3 === 0) sh.px(x, y, [98, 146, 92], 0.7);
  return sh.c;
}

function texBench() {
  /* 木ベンチ 1.8m × 0.8m（透過・向き固定の薄い壁として描く） */
  const W = 58, H = 26;
  const sh = sheetA(W, H);
  const wood = [150, 116, 82], woodD = [126, 94, 66], woodL = [170, 138, 100];
  /* 背もたれ（2枚板） */
  sh.rect(2, 0, 54, 4, wood); sh.rect(2, 0, 54, 1, woodL); sh.rect(2, 4, 54, 1, woodD);
  sh.rect(2, 7, 54, 4, wood); sh.rect(2, 7, 54, 1, woodL); sh.rect(2, 11, 54, 1, woodD);
  /* 座面 */
  sh.rect(0, 13, 58, 3, woodL); sh.rect(0, 16, 58, 2, wood); sh.rect(0, 18, 58, 1, woodD);
  /* 脚（鋳物） */
  for (const lx of [7, 48]) {
    sh.rect(lx, 4, 3, 10, [88, 90, 96]);
    sh.rect(lx, 18, 3, 8, [78, 80, 86]);
    sh.rect(lx - 2, 24, 7, 2, [68, 70, 76]);
  }
  /* 木目 */
  for (let x = 3; x < 55; x += 7 + (x % 3))
    for (const yy of [2, 9, 15]) sh.px(x, yy, woodD, 0.6);
  return sh.c;
}

function texWires() {
  /* 電線（透過壁に描く。2本がたわむ） */
  const W = 320, H = 28;
  const sh = sheetA(W, H);
  for (const [off, sag] of [[3, 11], [8, 12]]) {
    for (let x = 0; x < W; x++) {
      const t = x / (W - 1);
      const y = off + sag * 4 * t * (1 - t);
      sh.px(x, y, [66, 62, 60], 0.9);
      if (x % 2) sh.px(x, y + 1, [66, 62, 60], 0.35);
    }
  }
  return sh.c;
}

function texSeatSide() {
  /* ベンチ座面の木口（箱の側面用） */
  const W = 58, H = 5;
  const sh = sheetA(W, H);
  sh.rect(0, 0, W, 1, [176, 142, 102]);
  sh.rect(0, 1, W, 3, [150, 116, 82]);
  sh.rect(0, 4, W, 1, [118, 90, 64]);
  for (let x = 5; x < W; x += 9) sh.px(x, 2, [126, 96, 68]);
  return sh.c;
}
function texBenchBack() {
  /* 背もたれ（2枚板・すき間は透過） */
  const W = 58, H = 13;
  const sh = sheetA(W, H);
  const board = (y) => {
    sh.rect(0, y, W, 1, [172, 138, 98]);
    sh.rect(0, y + 1, W, 3, [150, 116, 82]);
    sh.rect(0, y + 4, W, 1, [120, 92, 66]);
    for (let x = 4; x < W; x += 8) sh.px(x, y + 2, [128, 98, 70]);
  };
  board(0); board(8);
  /* 板を支える金具 */
  for (const lx of [7, 48]) sh.rect(lx, 5, 3, 3, [84, 86, 92]);
  return sh.c;
}
function texLeg() {
  const sh = sheetA(4, 6);
  sh.rect(0, 0, 4, 6, [82, 84, 90]);
  sh.rect(0, 0, 1, 6, [98, 100, 106]);
  return sh.c;
}
function texSignBack() {
  /* 掲示板の裏面 */
  const W = 30, H = 52;
  const sh = sheetA(W, H);
  for (const px of [4, 24]) sh.rect(px, 6, 3, H - 6, [124, 120, 112]);
  sh.rect(1, 4, 28, 26, [148, 140, 126]);
  sh.rect(2, 5, 26, 24, [168, 158, 142]);
  sh.rect(1, 16, 28, 2, [148, 140, 126]);
  return sh.c;
}
function texSideWall(base, wM, hM, seed) {
  /* 建物の側面（正面より暗い・窓少なめ） */
  const ppm = 20, W = Math.round(wM * ppm), H = Math.round(hM * ppm);
  const sh = sheetA(W, H);
  const rng = mulberry32(seed);
  const dark = [base[0] * 0.84, base[1] * 0.85, base[2] * 0.88];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      sh.px(x, y, vary(dark, rng, 6));
  sh.rect(0, 0, W, 5, [96, 90, 86]);
  sh.rect(0, 5, W, 2, [140, 132, 124]);
  if (W > 60) {
    sh.rect(20, H * 0.3, 20, 16, [116, 130, 146]);
    sh.rect(19, H * 0.3 - 1, 22, 1, [110, 112, 116]);
  }
  for (let y = H - 4; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, [90, 86, 80], 0.4);
  sh.g.fillStyle = "rgba(212,222,230,0.10)";
  sh.g.fillRect(0, 0, W, H);
  return sh.c;
}

function texSign() {
  const W = 30, H = 52; // 0.95m × 1.65m
  const sh = sheetA(W, H);
  for (const px of [4, 24]) sh.rect(px, 6, 3, H - 6, [124, 120, 112]);
  sh.rect(1, 4, 28, 26, [70, 116, 80]);
  sh.rect(3, 6, 24, 22, [232, 230, 220]);
  sh.rect(3, 6, 24, 6, [96, 148, 104]);
  for (let i = 0; i < 4; i++) sh.rect(5, 15 + i * 3, 18 - (i === 3 ? 8 : 0), 1, [120, 118, 112]);
  return sh.c;
}

/* ---------- 公衆トイレ（北西の角の小さなタイル張り建物） ---------- */
function texToiletFront() {
  /* 正面 2.8m × 2.6m。出入口2つ＋男女ピクトグラム */
  const ppm = 24, W = Math.round(2.8 * ppm), H = Math.round(2.6 * ppm); // 67×62
  const sh = sheetA(W, H);
  const rng = mulberry32(881);
  const tile = [196, 192, 184];
  sh.rect(0, 0, W, 6, [110, 104, 96]);        // 屋根帯
  sh.rect(0, 6, W, 1, [150, 144, 136]);       // 軒の影
  for (let y = 7; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, vary(tile, rng, 5));
  for (let y = 7; y < H; y++)                 // 横タイル目地（8px間隔）
    if ((y - 7) % 8 === 0) sh.rect(0, y, W, 1, [172, 168, 158]);

  const doorW = 11, doorH = 42, doorTop = H - 5 - doorH;
  const doors = [
    { x: 15, col: [86, 120, 196], skirt: false },              // 男性（青）
    { x: W - 15 - doorW, col: [204, 92, 110], skirt: true },   // 女性（赤・スカート）
  ];
  for (const d of doors) {
    sh.rect(d.x, doorTop, doorW, doorH, [66, 68, 74]);          // 暗い開口
    if (isDark()) {
      sh.rectRaw(d.x + 1, doorTop + 1, doorW - 2, doorH - 2, [92, 86, 78]); // 開口内をわずかに明るく
      for (const ox of [d.x + 1, d.x + doorW - 2])
        for (const [oy, a] of [[doorTop - 1, 0.85], [doorTop - 2, 0.45]])
          sh.pxRaw(ox, oy, [255, 224, 150], a);                 // 灯り
    }
    /* 人型ピクトグラム（頭+胴体。女性はスカートで裾広がり） */
    const px0 = d.x + Math.floor((doorW - 7) / 2), py0 = doorTop - 8;
    sh.rect(px0 + 2, py0, 3, 2, d.col);
    sh.rect(px0 + 2, py0 + 2, 3, 3, d.col);
    if (d.skirt) sh.rect(px0, py0 + 5, 7, 3, d.col);
    else { sh.rect(px0 + 1, py0 + 5, 2, 3, d.col); sh.rect(px0 + 4, py0 + 5, 2, 3, d.col); }
  }
  /* 接地影 */
  for (let y = H - 5; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, [86, 82, 76], (y - H + 5) / 5 * 0.5);
  return sh.c;
}
function texToiletSide() {
  /* 側面 2.2m × 2.6m。高窓スリットのみ */
  const ppm = 24, W = Math.round(2.2 * ppm), H = Math.round(2.6 * ppm); // 53×62
  const sh = sheetA(W, H);
  const rng = mulberry32(883);
  const tile = [196, 192, 184];
  sh.rect(0, 0, W, 6, [110, 104, 96]);
  sh.rect(0, 6, W, 1, [150, 144, 136]);
  for (let y = 7; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, vary(tile, rng, 5));
  for (let y = 7; y < H; y++)
    if ((y - 7) % 8 === 0) sh.rect(0, y, W, 1, [172, 168, 158]);
  const sw = 12, sx = Math.round((W - sw) / 2);
  sh.rect(sx, 14, sw, 4, [70, 72, 80]);       // 高窓スリット
  for (let y = H - 5; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, [86, 82, 76], (y - H + 5) / 5 * 0.5);
  return sh.c;
}
function texToiletBack() {
  /* 背面 2.8m × 2.6m。ドアなしの無地タイル壁 */
  const ppm = 24, W = Math.round(2.8 * ppm), H = Math.round(2.6 * ppm); // 67×62
  const sh = sheetA(W, H);
  const rng = mulberry32(887);
  const tile = [196, 192, 184];
  sh.rect(0, 0, W, 6, [110, 104, 96]);
  sh.rect(0, 6, W, 1, [150, 144, 136]);
  for (let y = 7; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, vary(tile, rng, 5));
  for (let y = 7; y < H; y++)
    if ((y - 7) % 8 === 0) sh.rect(0, y, W, 1, [172, 168, 158]);
  for (let y = H - 5; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, [86, 82, 76], (y - H + 5) / 5 * 0.5);
  return sh.c;
}

/* ============================================================
   ビルボードスプライト
   ============================================================ */
/* ============================================================
   樹木 — 実在種を3フレーム（風の揺れ）で生成
   密な樹冠: 塊の和集合 → 穴埋め → 塊ごとの陰影。スカスカにしない
   ============================================================ */
const LEAF_PAL = {
  kusu: {   /* クスノキ=常緑。季節でトーンだけ変わる */
    spring: { hi: [136, 180, 84], light: [106, 154, 70], mid: [80, 126, 60], dark: [54, 92, 48] },
    summer: { hi: [124, 166, 74], light: [96, 142, 64], mid: [72, 116, 56], dark: [50, 86, 46] },
    autumn: { hi: [116, 150, 70], light: [90, 128, 60], mid: [68, 106, 52], dark: [48, 80, 44] },
    winter: { hi: [102, 134, 66], light: [80, 114, 56], mid: [60, 94, 50], dark: [44, 72, 42] },
  },
  keyaki: { /* ケヤキ=落葉。秋は紅葉、冬は裸 */
    spring: { hi: [152, 188, 86], light: [124, 164, 72], mid: [98, 140, 58], dark: [68, 106, 48] },
    summer: { hi: [132, 172, 72], light: [106, 148, 62], mid: [82, 124, 52], dark: [56, 94, 46] },
    autumn: { hi: [240, 192, 84], light: [218, 148, 62], mid: [188, 106, 50], dark: [148, 74, 42] },
    winter: null,
  },
  sakura: { hi: [252, 226, 234], light: [244, 198, 212], mid: [230, 168, 190], dark: [206, 134, 162] },
};
function buildCrownFrame(sh, blobs, frame, pal, seedN) {
  const W = sh.w, H = sh.h;
  const mask = new Uint8Array(W * H);
  const put = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 1; };
  for (const b of blobs) {
    const dx = Math.round(Math.sin(b.ph + frame * 2.1) * b.sway);
    const bx = b.x + dx, by = b.y, r = b.r;
    for (let y = (by - r) | 0; y <= by + r; y++)
      for (let x = (bx - r * 1.08) | 0; x <= bx + r * 1.08; x++) {
        const d = Math.hypot((x - bx) / 1.08, y - by);
        const nz = hash2(x * 3 + seedN, y * 3);
        if (d <= r * (0.86 + nz * 0.18)) put(x, y);
      }
  }
  /* 穴埋め（2パス）: 塊のすき間を閉じる */
  for (let pass = 0; pass < 2; pass++) {
    const add = [];
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        if (mask[y * W + x]) continue;
        const nb = mask[y * W + x - 1] + mask[y * W + x + 1] +
                   mask[(y - 1) * W + x] + mask[(y + 1) * W + x];
        if (nb >= 3) add.push(y * W + x);
      }
    for (const i of add) mask[i] = 1;
  }
  /* 縁のほつれ */
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (!mask[y * W + x]) continue;
      const edge = !mask[y * W + x - 1] || !mask[y * W + x + 1] ||
                   !mask[(y - 1) * W + x] || !mask[(y + 1) * W + x];
      if (edge && hash2(x * 7 + frame, y * 7 + seedN) < 0.30) mask[y * W + x] = 2; // 後で消す
    }
  /* 基本色で塗る */
  let top = H, bot = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (mask[y * W + x] !== 1) continue;
      if (y < top) top = y;
      if (y > bot) bot = y;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (mask[y * W + x] !== 1) continue;
      const rel = (y - top) / Math.max(1, bot - top);
      let c = pal.mid;
      if (rel > 0.82) c = pal.dark;
      else if (rel > 0.74 && ((x + y) & 1)) c = pal.dark;
      sh.px(x, y, c);
    }
  /* 塊ごとの帽子（明）と под（暗）で、もこもこした立体感 */
  const dab = (bx, by, r, col, chance) => {
    for (let y = (by - r) | 0; y <= by + r; y++)
      for (let x = (bx - r) | 0; x <= bx + r; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H || mask[y * W + x] !== 1) continue;
        if (Math.hypot(x - bx, (y - by) * 1.2) > r) continue;
        if (hash2(x * 5 + seedN, y * 5) > chance) continue;
        sh.px(x, y, col);
      }
  };
  for (const b of blobs) {
    const dx = Math.round(Math.sin(b.ph + frame * 2.1) * b.sway);
    dab(b.x + dx - b.r * 0.22, b.y - b.r * 0.38, b.r * 0.62, pal.light, 0.75);
    dab(b.x + dx - b.r * 0.34, b.y - b.r * 0.5, b.r * 0.36, pal.hi, 0.55);
    dab(b.x + dx + b.r * 0.2, b.y + b.r * 0.48, b.r * 0.55, pal.dark, 0.6);
  }
  return mask;
}

function sprKusunoki(seed) {
  /* クスノキ: 低く太い幹・こんもり巨大な常緑の樹冠 */
  const ppm = 24, Wm = 8.6, Hm = 9.4;
  const W = Math.round(Wm * ppm), H = Math.round(Hm * ppm);
  const rng = mulberry32(seed);
  const cx = W / 2;
  const pal = LEAF_PAL.kusu[ENV.season];
  /* 樹冠の塊（多数・強く重ねる） */
  const cyC = H * 0.33, rxC = W * 0.44, ryC = H * 0.28;
  const blobs = [];
  for (let i = 0; i < 26; i++) {
    const a = rng() * 6.283, rr = Math.sqrt(rng());
    const bx = cx + Math.cos(a) * rxC * rr * 0.82;
    const by = cyC + Math.sin(a) * ryC * rr * 0.82;
    const edge = rr;                                   // 外側ほど揺れる
    blobs.push({ x: bx, y: Math.max(18, by), r: 17 + rng() * 13, ph: rng() * 6.283, sway: 0.6 + edge * 1.6 });
  }
  const frames = [0, 1, 2].map(f => {
    const sh = sheetA(W, H);
    /* 幹（クスノキ: 太く、樹皮は縦に深い割れ目） */
    const trunkTop = (cyC + ryC * 0.55) | 0;
    const baseW = Math.round(0.74 * ppm);
    for (let y = H - 1; y >= trunkTop; y--) {
      const t = (H - y) / (H - trunkTop);
      let w2 = baseW * (1 - t * 0.3);
      if (y > H - 9) w2 += (H - y - 4) * 1.1;          // 根張り
      const lean = Math.sin(t * 1.7) * 2;
      for (let x = 0; x < w2; x++) {
        const gx = Math.round(cx - w2 / 2 + x + lean);
        const n = hash2(gx * 7, (y >> 2) * 5);         // 縦筋
        let c = [92, 78, 66];
        if (n > 0.66) c = [72, 60, 52];
        if (n < 0.14) c = [110, 94, 78];
        if (x < w2 * 0.2) c = [c[0] + 16, c[1] + 14, c[2] + 10];
        if (x > w2 * 0.82) c = [c[0] - 14, c[1] - 12, c[2] - 8];
        sh.px(gx, y, c);
      }
    }
    /* 大枝（幹から樹冠へ二股三股） */
    for (let b = 0; b < 3; b++) {
      let bx = cx + (b - 1) * 4, by = trunkTop + 6;
      const ddx = (b - 1) * 2.2 + (rng() - 0.5), ddy = -2.0;
      let w2 = 5;
      for (let s = 0; s < 14; s++) {
        bx += ddx; by += ddy;
        for (let k = 0; k < w2; k++) sh.px(bx + k, by, [78, 66, 56]);
        if (s % 5 === 4 && w2 > 2) w2--;
      }
    }
    buildCrownFrame(sh, blobs, f, pal, seed);
    return sh.c;
  });
  return { frames, img: frames[0], w: Wm, h: Hm };
}

function sprKeyaki(seed, palOverride) {
  /* ケヤキ: 株元から扇状に開く箒形。樹皮はなめらかな灰色に斑 */
  const ppm = 24, Wm = 6.6, Hm = 8.2;
  const W = Math.round(Wm * ppm), H = Math.round(Hm * ppm);
  const rng = mulberry32(seed);
  const cx = W / 2;
  const pal = palOverride !== undefined ? palOverride : LEAF_PAL.keyaki[ENV.season];
  /* 扇状の大枝に沿って塊を置く → 箒形の樹冠 */
  const splitY = H * 0.62;
  const limbs = [];
  const nL = 5;
  for (let i = 0; i < nL; i++) {
    const a = -1.5708 + ((i / (nL - 1)) - 0.5) * 1.9;  // -55°..+55°
    limbs.push({ a: a + (rng() - 0.5) * 0.12, len: H * (0.34 + rng() * 0.12) });
  }
  const blobs = [];
  for (const l of limbs) {
    for (const t of [0.4, 0.62, 0.82, 1.0]) {
      const bx = cx + Math.cos(l.a) * l.len * t;
      const by = splitY + Math.sin(l.a) * l.len * t;
      blobs.push({ x: bx, y: Math.max(14, by), r: (12 + t * 9) * (0.85 + rng() * 0.3),
                   ph: rng() * 6.283, sway: 0.5 + t * 1.7 });
    }
  }
  blobs.push({ x: cx, y: splitY - H * 0.26, r: 16, ph: rng() * 6.283, sway: 1 });
  blobs.push({ x: cx, y: splitY - H * 0.12, r: 14, ph: rng() * 6.283, sway: 0.8 });
  const frames = [0, 1, 2].map(f => {
    const sh = sheetA(W, H);
    /* 幹と株立ちの大枝（先に描いて樹冠を上に被せる） */
    const baseW = Math.round(0.4 * ppm);
    for (let y = H - 1; y >= splitY; y--) {
      const t = (H - y) / (H - splitY);
      let w2 = baseW * (1 - t * 0.2);
      if (y > H - 7) w2 += (H - y - 3) * 0.8;
      for (let x = 0; x < w2; x++) {
        const gx = Math.round(cx - w2 / 2 + x);
        const n = hash2(gx * 3, y * 3);
        let c = [128, 118, 106];                        // なめらかな灰
        if (n > 0.86) c = [148, 122, 92];               // 剥がれた斑
        if (n < 0.1) c = [108, 100, 92];
        if (x < w2 * 0.25) c = [c[0] + 12, c[1] + 12, c[2] + 10];
        if (x > w2 * 0.8) c = [c[0] - 12, c[1] - 12, c[2] - 10];
        sh.px(gx, y, c);
      }
    }
    const limbEnd = pal ? 0.7 : 1.0;   // 冬は枝先まで見せる
    for (const l of limbs) {
      /* 実線で描く（点線だと近距離で骨だけの扇に見える） */
      let w2 = 4;
      for (let s = 0; s < l.len * limbEnd; s += 0.7) {
        const bx = cx + Math.cos(l.a) * s, by = splitY + Math.sin(l.a) * s;
        for (let k = 0; k < w2; k++) {
          const gx = Math.round(bx + k - w2 / 2);
          sh.px(gx, Math.round(by), k === w2 - 1 ? [104, 96, 88] : [122, 112, 102]);
          sh.px(gx, Math.round(by) + 1, [112, 104, 96]);
        }
        if (s > l.len * 0.4) w2 = 3;
        if (!pal && s > l.len * 0.7) w2 = 2;
      }
      /* 冬: 小枝を張る */
      if (!pal) {
        for (const [t0, da] of [[0.5, 0.4], [0.68, -0.35], [0.84, 0.3]]) {
          let bx = cx + Math.cos(l.a) * l.len * t0;
          let by = splitY + Math.sin(l.a) * l.len * t0;
          const a2 = l.a + da;
          for (let s = 0; s < l.len * 0.28; s += 0.8) {
            sh.px(Math.round(bx + Math.cos(a2) * s), Math.round(by + Math.sin(a2) * s),
                  [116, 106, 98]);
          }
        }
      }
    }
    if (pal) buildCrownFrame(sh, blobs, f, pal, seed + 7);
    return sh.c;
  });
  return { frames, img: frames[0], w: Wm, h: Hm };
}

function sprLiriope(seed) {
  /* ヤブランの株（写真手前の茂み） */
  const W = 42, H = 26; // 1.3m × 0.8m
  const sh = sheetA(W, H);
  const rng = mulberry32(seed);
  const cx = W / 2, by = H - 1;
  for (let i = 0; i < 30; i++) {
    const a = -1.5708 + (rng() - 0.5) * 2.4;
    const len = 12 + rng() * 12;
    const bend = (rng() - 0.5) * 0.9;
    const g = rng();
    const col = g < 0.45 ? [44, 74, 40] : g < 0.8 ? [60, 96, 48] : [86, 124, 56];
    let x = cx + (rng() - 0.5) * 10, y = by;
    let dir = a;
    for (let s = 0; s < len; s++) {
      sh.px(x, y, col);
      if (s > len * 0.6) sh.px(x, y - 1, col, 0.5);
      dir += bend * 0.06;
      x += Math.cos(dir); y += Math.sin(dir) * 0.8;
      if (y < 0) break;
    }
  }
  /* 根元を締める */
  for (let x = cx - 9; x < cx + 9; x++)
    for (let y = H - 5; y < H; y++)
      if (hash2(x, y) > 0.25) sh.px(x, y, [36, 60, 36]);
  return { img: sh.c, w: 1.3, h: 0.8 };
}

function sprShrub(seed, flower) {
  const W = 38, H = 30; // 1.2m × 0.95m
  const sh = sheetA(W, H);
  const rng = mulberry32(seed);
  for (let i = 0; i < 6; i++) {
    const bx = 6 + rng() * (W - 12), by = H - 8 - rng() * 10, br = 7 + rng() * 6;
    for (let y = (by - br) | 0; y <= Math.min(H - 1, by + br); y++)
      for (let x = (bx - br) | 0; x <= bx + br; x++) {
        if (x < 0 || x >= W || y < 0) continue;
        const d = Math.hypot(x - bx, (y - by) * 1.15);
        const nz = hash2(x * 7, y * 7 + i);
        if (d > br * (0.75 + nz * 0.3)) continue;
        let c = [58, 96, 50];
        if (y < by - br * 0.3 && x < bx) c = [80, 120, 56];
        if (y > by + br * 0.4) c = [44, 72, 42];
        if (nz > 0.93 && y < by) c = [102, 142, 62];
        sh.px(x, y, c);
      }
  }
  if (flower) { /* サツキの花 */
    for (let i = 0; i < 26; i++) {
      const x = 4 + rng() * (W - 8), y = 3 + rng() * (H * 0.55);
      if (hash2(x | 0, (y | 0) + seed) < 0.5) continue;
      sh.px(x, y, flower);
      if (rng() < 0.4) sh.px(x + 1, y, [flower[0] - 24, flower[1] - 22, flower[2] - 18]);
    }
  }
  return { img: sh.c, w: 1.2, h: 0.95 };
}

function sprBollard() {
  const W = 12, H = 22; // 0.36m × 0.66m
  const sh = sheetA(W, H);
  for (let y = 2; y < H; y++)
    for (let x = 2; x < W - 2; x++) {
      let c = [176, 172, 162];
      if (x < 4) c = [192, 188, 178];
      if (x > W - 5) c = [150, 146, 138];
      sh.px(x, y, c);
    }
  sh.rect(1, 0, W - 2, 3, [150, 146, 138]);
  sh.rect(1, 0, W - 2, 1, [196, 192, 182]);
  return { img: sh.c, w: 0.36, h: 0.66 };
}

function sprFountain() {
  /* 水飲み場 */
  const W = 20, H = 30; // 0.62m × 0.95m
  const sh = sheetA(W, H);
  for (let y = 6; y < H; y++)
    for (let x = 5; x < 15; x++) {
      let c = [188, 184, 174];
      if (x > 11) c = [162, 158, 150];
      if (hash2(x, y) > 0.93) c = [170, 166, 156];
      sh.px(x, y, c);
    }
  sh.rect(2, 2, 16, 5, [174, 170, 160]);
  sh.rect(2, 2, 16, 1, [200, 196, 186]);
  sh.rect(4, 3, 12, 3, [142, 148, 152]);
  sh.px(9, 1, [110, 114, 120]); sh.px(10, 1, [110, 114, 120]);
  return { img: sh.c, w: 0.62, h: 0.95 };
}

function sprPole() {
  /* 電柱（コン柱＋腕金＋変圧器） */
  const W = 26, H = 224; // 0.8m × 7m
  const sh = sheetA(W, H);
  for (let y = 4; y < H; y++) {
    sh.px(11, y, [140, 134, 126]);
    sh.px(12, y, [126, 120, 112]);
    sh.px(13, y, [108, 102, 96]);
    if (hash2(3, y) > 0.9) sh.px(12, y, [116, 110, 104]);
  }
  sh.rect(0, 10, W, 2, [96, 92, 88]);                 // 腕金
  sh.rect(0, 12, W, 1, [76, 72, 70]);
  for (const ix of [2, 12, 22]) { sh.px(ix, 8, [214, 216, 214]); sh.px(ix, 9, [190, 192, 190]); }
  sh.rect(15, 26, 8, 22, [104, 100, 94]);             // 変圧器
  sh.rect(15, 26, 8, 2, [84, 80, 76]);
  sh.rect(16, 48, 6, 2, [84, 80, 76]);
  sh.rect(10, H - 6, 5, 6, [150, 146, 138]);          // 根巻き
  return { img: sh.c, w: 0.8, h: 7 };
}

function sprParkLamp() {
  /* 公園灯 */
  const W = 20, H = 110; // 0.62m × 3.4m
  const sh = sheetA(W, H);
  for (let y = 14; y < H; y++) {
    sh.px(9, y, [78, 88, 82]);
    sh.px(10, y, [62, 72, 66]);
  }
  sh.rect(6, H - 4, 8, 4, [140, 138, 130]);           // 基礎
  if (isDark()) {
    /* 点灯（グレーディングを通さない発光色 + 光のにじみ） */
    for (let r = 8; r >= 4; r -= 2)
      for (let y = 8 - r; y <= 8 + r; y++)
        for (let x = 10 - r; x <= 10 + r; x++)
          if (Math.hypot(x - 10, y - 8) <= r && y >= 0)
            sh.pxRaw(x, y, [255, 224, 150], 0.10);
    sh.rectRaw(5, 2, 10, 12, [255, 236, 178]);
    sh.rect(5, 2, 10, 2, [88, 96, 90]);
    sh.pxRaw(7, 5, [255, 250, 220]); sh.pxRaw(8, 6, [255, 250, 220]);
  } else {
    sh.rect(5, 2, 10, 12, [230, 232, 228]);           // 灯具
    sh.rect(5, 2, 10, 2, [88, 96, 90]);
    sh.px(5, 3, [244, 246, 240]); sh.px(6, 4, [244, 246, 240]);
  }
  sh.rect(4, 14, 12, 2, [62, 72, 66]);
  return { img: sh.c, w: 0.62, h: 3.4 };
}

function sprPlanter(seed) {
  /* 入口わきの花壇プランター */
  const W = 34, H = 20; // 1.05m × 0.62m
  const sh = sheetA(W, H);
  const rng = mulberry32(seed);
  sh.rect(0, 10, W, 9, [182, 178, 168]);
  sh.rect(0, 10, W, 2, [200, 196, 186]);
  sh.rect(0, 17, W, 2, [152, 148, 140]);
  sh.rect(0, 10, 2, 9, [162, 158, 148]);
  sh.rect(W - 2, 10, 2, 9, [152, 148, 140]);
  for (let i = 0; i < 40; i++) {                       // 葉
    const x = 2 + rng() * (W - 4), y = 4 + rng() * 7;
    sh.px(x, y, rng() < 0.5 ? [70, 112, 56] : [92, 134, 62]);
  }
  const cols = [[224, 96, 96], [244, 200, 90], [240, 240, 232], [232, 140, 170]];
  for (let i = 0; i < 14; i++) {                       // 花
    const x = 3 + rng() * (W - 6), y = 2 + rng() * 7;
    const c = cols[(rng() * 4) | 0];
    sh.px(x, y, c); sh.px(x + 1, y, c);
  }
  return { img: sh.c, w: 1.05, h: 0.62 };
}

function sprWeed(seed) {
  /* 道ばたの雑草 */
  const W = 20, H = 13; // 0.6m × 0.4m
  const sh = sheetA(W, H);
  const rng = mulberry32(seed);
  const cx = W / 2;
  const WCOLS = {
    spring: [[78, 118, 56], [100, 140, 62], [132, 158, 72]],
    summer: [[74, 112, 54], [96, 134, 60], [128, 152, 70]],
    autumn: [[142, 126, 62], [166, 148, 74], [188, 170, 88]],
    winter: [[148, 136, 104], [166, 154, 120], [128, 118, 92]],
  }[ENV.season];
  for (let i = 0; i < 14; i++) {
    const a = -1.5708 + (rng() - 0.5) * 2.6;
    const len = 6 + rng() * 6;
    const g = rng();
    const col = WCOLS[g < 0.4 ? 0 : g < 0.75 ? 1 : 2];
    let x = cx + (rng() - 0.5) * 6, y = H - 1;
    let dir = a;
    const bend = (rng() - 0.5) * 0.12;
    for (let s = 0; s < len; s++) {
      sh.px(x, y, col);
      dir += bend;
      x += Math.cos(dir); y += Math.sin(dir) * 0.9;
      if (y < 0) break;
    }
  }
  return { img: sh.c, w: 0.6, h: 0.4 };
}

function sprPigeon(seed) {
  /* 2フレーム: 顔を上げる / 地面をついばむ */
  const W = 14, H = 12; // 0.42m × 0.36m
  const rng0 = mulberry32(seed);
  const flip = rng0() < 0.5;
  const build = peck => {
    const sh = sheetA(W, H);
    const px = (x, y, c) => sh.px(flip ? W - 1 - x : x, y, c);
    for (let x = 3; x < 11; x++)
      for (let y = 4; y < 9; y++)
        if (Math.hypot(x - 7, (y - 6) * 1.4) < 3.6) px(x, y, [138, 140, 150]);
    for (let x = 4; x < 9; x++) px(x, 5, [120, 122, 134]);        // 翼
    if (peck) {
      px(10, 5, [112, 116, 128]); px(11, 5, [112, 116, 128]);     // 頭を下げる
      px(10, 6, [112, 116, 128]); px(11, 6, [112, 116, 128]);
      px(12, 7, [210, 160, 60]);                                  // くちばし
    } else {
      px(10, 3, [112, 116, 128]); px(11, 3, [112, 116, 128]);
      px(10, 2, [112, 116, 128]); px(11, 2, [112, 116, 128]);
      px(12, 3, [210, 160, 60]);
    }
    px(2, 4, [90, 92, 102]); px(1, 3, [90, 92, 102]);             // 尾
    px(9, 9, [180, 90, 70]); px(9, 10, [180, 90, 70]);            // 脚
    px(7, 9, [180, 90, 70]); px(7, 10, [180, 90, 70]);
    return sh.c;
  };
  const frames = [build(false), build(true)];
  return { frames, img: frames[0], w: 0.42, h: 0.36 };
}

function sprCatSleep() {
  /* ベンチで丸くなる茶トラ（64px/m・呼吸2フレーム） */
  const W = 29, H = 15; // 0.46m × 0.23m
  const O = [224, 152, 86], D = [188, 116, 58], C = [244, 196, 138];
  const P = [244, 172, 170], LN = [124, 80, 46], Wt = [250, 244, 234];
  const build = f => {
    const sh = sheetA(W, H);
    const cy = 8.2 - (f ? 0.45 : 0);                 // 呼吸で背中が上下
    /* 体（アンモニャイト） */
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = Math.hypot((x - 13) / 1.95, (y - cy) / 1.06);
        if (d > 5.6) continue;
        let c = O;
        if (y > 10 && x < 16) c = C;                              // おなか側
        if (y < 8 && x > 2 && x < 17 && ((x + (y >> 1)) % 5) < 2) c = D; // 背中の縞
        sh.px(x, y, c);
      }
    /* 頭（右・体にあずける） */
    for (let y = 1; y < 12; y++)
      for (let x = 16; x < 27; x++)
        if (Math.hypot((x - 21.5) / 1.15, y - 6.2) < 4.6) {
          let c = O;
          if (y < 4 && ((x + 1) % 4) < 2) c = D;                  // 頭の縞
          sh.px(x, y, c);
        }
    /* 耳＋ピンクの内耳 */
    sh.px(18, 1, D); sh.px(19, 0, D); sh.px(19, 1, P);
    sh.px(24, 0, D); sh.px(25, 1, D); sh.px(24, 1, P);
    /* 閉じた目「⌒」・マズル・鼻 */
    sh.px(20, 6, LN); sh.px(21, 5, LN); sh.px(22, 5, LN); sh.px(23, 6, LN);
    sh.px(24, 8, Wt); sh.px(25, 8, Wt); sh.px(26, 8, Wt); sh.px(25, 9, Wt);
    sh.px(25, 7, P);
    /* 前足を顔の下にたたむ・胸元 */
    sh.px(20, 10, Wt); sh.px(21, 10, Wt);
    sh.px(17, 9, C); sh.px(18, 10, C);
    /* しっぽを前にくるり（先だけ濃く） */
    for (let x = 4; x < 22; x++) { sh.px(x, 12, D); sh.px(x, 13, D); }
    sh.px(3, 11, D); sh.px(3, 12, D);
    sh.px(22, 11, [168, 96, 48]); sh.px(23, 11, [168, 96, 48]); sh.px(23, 12, [168, 96, 48]);
    return sh.c;
  };
  const frames = [build(0), build(1)];
  return { frames, img: frames[0], w: 0.46, h: 0.23 };
}

function sprCatSit() {
  /* 木陰に座るハチワレ（64px/m・しっぽ振り＋瞬き2フレーム） */
  const W = 19, H = 28; // 0.30m × 0.44m
  const K = [50, 50, 58], Wt = [244, 242, 236], P = [242, 168, 172];
  const G = [244, 208, 88], PU = [60, 50, 42];
  const build = f => {
    const sh = sheetA(W, H);
    /* 体（下ぶくれの洋なし形・胸は白） */
    for (let y = 12; y < 28; y++)
      for (let x = 0; x < W; x++) {
        const t = (y - 12) / 15;
        const cx2 = 9.5 - t * 0.5, r = 3.2 + t * 3.0;
        if (Math.abs(x - cx2) > r) continue;
        sh.px(x, y, Math.abs(x - cx2) < 1.8 + t * 0.7 ? Wt : K);
      }
    /* 大きな丸い頭（全高の4割。ハチワレの八の字） */
    for (let y = 0; y < 13; y++)
      for (let x = 3; x < 17; x++)
        if (Math.hypot((x - 9.5) / 1.08, y - 6.5) < 5.9) {
          const wedge = Math.abs(x - 9.5) < 0.2 + y * 0.34;      // 額の白い八の字
          sh.px(x, y, (y >= 8 || wedge) ? Wt : K);
        }
    /* 耳＋ピンクの内耳 */
    sh.px(4, 1, K); sh.px(5, 0, K); sh.px(5, 1, P); sh.px(6, 1, K);
    sh.px(14, 1, K); sh.px(13, 0, K); sh.px(13, 1, P); sh.px(12, 1, K);
    /* 目（金色＋瞳）または瞬き */
    if (f === 0) {
      sh.px(7, 6, G); sh.px(7, 7, PU);
      sh.px(12, 6, G); sh.px(12, 7, PU);
    } else {
      sh.px(6, 7, PU); sh.px(7, 7, PU);
      sh.px(12, 7, PU); sh.px(13, 7, PU);
    }
    /* 鼻とマズル */
    sh.px(9, 8, P); sh.px(10, 8, P);
    /* 白い前脚（そろえて座る） */
    sh.rect(7, 22, 2, 6, Wt);
    sh.rect(11, 22, 2, 6, Wt);
    /* しっぽを前にまわす（f1で先が振れる・先だけ白） */
    for (let x = 4; x < 13; x++) sh.px(x, 27, K);
    if (f === 0) { sh.px(3, 26, K); sh.px(3, 25, Wt); }
    else { sh.px(4, 26, K); sh.px(4, 25, Wt); }
    return sh.c;
  };
  const frames = [build(0), build(1)];
  return { frames, img: frames[0], w: 0.3, h: 0.44 };
}

function texKonbini() {
  /* コンビニ正面 9m×3.4m。夜はガラスとサインが発光（架空の3色帯・文字なし） */
  const W = 216, H = 82;
  const sh = sheetA(W, H);
  const rng = mulberry32(9137);
  /* 躯体ベース */
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, vary([206, 208, 206], rng, 5));
  sh.rect(0, 0, W, 4, [122, 120, 116]);                 // 屋根の笠木
  /* サインバンド（青・白・緑） */
  const sign = (x, y, w2, h2, col, lit) => {
    if (lit) sh.rectRaw(x, y, w2, h2, col); else sh.rect(x, y, w2, h2, col);
  };
  const lit = isDark();
  sign(0, 4, W, 3, lit ? [250, 252, 250] : [238, 240, 240], lit);
  sign(0, 7, W, 4, lit ? [96, 140, 224] : [70, 110, 190], lit);
  sign(0, 11, W, 4, lit ? [252, 252, 252] : [242, 244, 246], lit);
  sign(0, 15, W, 4, lit ? [96, 200, 136] : [70, 170, 110], lit);
  sh.rect(0, 19, W, 1, [140, 140, 138]);
  /* ガラス面（夜は白緑に発光・棚の縦線） */
  for (let y = 20; y < 70; y++)
    for (let x = 4; x < W - 4; x++) {
      if (lit) sh.pxRaw(x, y, [235, 248, 238]);
      else sh.px(x, y, [198, 216, 210]);
    }
  for (let sx = 22; sx < W - 20; sx += 24)              // 店内の棚の示唆
    for (let y = 30; y < 64; y++)
      lit ? sh.pxRaw(sx, y, [206, 224, 210]) : sh.px(sx, y, [172, 190, 184]);
  for (let x = 4; x < W - 4; x += 36) sh.rect(x, 20, 2, 50, [150, 154, 152]); // サッシ
  /* 自動ドア（中央） */
  sh.rect(96, 22, 3, 48, [130, 134, 132]);
  sh.rect(120, 22, 3, 48, [130, 134, 132]);
  sh.rect(108, 22, 2, 48, [130, 134, 132]);
  /* 腰壁と接地影 */
  sh.rect(0, 70, W, 7, [168, 170, 168]);
  for (let y = H - 5; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, [96, 96, 94], (y - H + 5) / 5 * 0.5);
  return sh.c;
}

function texKonbiniSide() {
  /* コンビニ側面 6m×3.4m（無地＋ダクト） */
  const W = 144, H = 82;
  const sh = sheetA(W, H);
  const rng = mulberry32(9139);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, vary([188, 190, 188], rng, 5));
  sh.rect(0, 0, W, 4, [122, 120, 116]);
  sh.rect(108, 12, 10, 58, [150, 152, 150]);            // ダクト
  sh.rect(108, 12, 2, 58, [168, 170, 168]);
  for (let y = H - 5; y < H; y++)
    for (let x = 0; x < W; x++) sh.px(x, y, [96, 96, 94], 0.4);
  sh.g.fillStyle = "rgba(212,222,230,0.10)";
  sh.g.fillRect(0, 0, W, H);
  return sh.c;
}

function texSmokePanel() {
  /* 喫煙所のすりガラスパーティション 2.4m×1.7m（半透明） */
  const W = 58, H = 41;
  const sh = sheetA(W, H);
  /* すりガラス（半透明のスモークグレー） */
  for (let y = 2; y < H - 4; y++)
    for (let x = 1; x < W - 1; x++)
      sh.px(x, y, [96, 106, 118], 0.45);
  /* フレームと脚 */
  sh.rect(0, 0, W, 2, [150, 155, 160]);
  sh.rect(0, H - 5, W, 2, [150, 155, 160]);
  sh.rect(0, 0, 2, H - 3, [150, 155, 160]);
  sh.rect(W - 2, 0, 2, H - 3, [150, 155, 160]);
  sh.rect(28, 0, 2, H - 3, [150, 155, 160]);
  sh.rect(4, H - 3, 3, 3, [120, 124, 130]);
  sh.rect(W - 7, H - 3, 3, 3, [120, 124, 130]);
  /* タバコのピクトグラム（白票にグレーの棒＋赤い火先） */
  sh.rect(25, 5, 9, 8, [238, 240, 242]);
  sh.rect(27, 8, 5, 2, [90, 94, 100]);
  sh.px(26, 8, [214, 90, 70]); sh.px(26, 9, [214, 90, 70]);
  sh.px(28, 6, [170, 176, 182]); sh.px(30, 6, [170, 176, 182]);
  return sh.c;
}

function sprAshtray() {
  /* 灰皿スタンド 0.3m×0.85m（ステンレスの円筒） */
  const W = 19, H = 54;
  const sh = sheetA(W, H);
  for (let y = 4; y < H; y++)
    for (let x = 3; x < 16; x++) {
      let c = [176, 180, 184];
      if (x < 6) c = [210, 214, 218];                   // ハイライト
      if (x > 12) c = [140, 144, 148];
      sh.px(x, y, c);
    }
  /* 上面のリムと黒い開口 */
  sh.rect(2, 0, 15, 3, [196, 200, 204]);
  sh.rect(5, 1, 9, 2, [42, 44, 46]);
  sh.rect(2, 3, 15, 1, [120, 124, 128]);
  /* 火消し穴 */
  sh.px(7, 20, [110, 114, 118]); sh.px(12, 27, [110, 114, 118]);
  return { img: sh.c, w: 0.3, h: 0.85 };
}

function sprLeaf(seed) {
  /* 舞う粒子: 春=花びら / 夏=葉 / 秋=紅葉 / 冬=雪 */
  const sh = sheetA(3, 3);
  const cols = {
    spring: [[246, 208, 220], [238, 186, 202]],
    summer: [[140, 128, 58], [110, 126, 54]],
    autumn: [[210, 140, 56], [188, 96, 46]],
    winter: [[242, 246, 250], [228, 234, 242]],
  }[ENV.season];
  const c = cols[seed % 2];
  if (ENV.season === "winter") {
    sh.pxRaw(1, 1, c); sh.pxRaw(1, 0, c, 0.7); sh.pxRaw(0, 1, c, 0.7);
    sh.pxRaw(2, 1, c, 0.7); sh.pxRaw(1, 2, c, 0.7);
  } else {
    sh.px(0, 1, c); sh.px(1, 1, c); sh.px(2, 1, c); sh.px(1, 0, c);
  }
  return { img: sh.c, w: 0.09, h: 0.09 };
}

function sprRainDrop() {
  /* 雨すじ: 縦2×8px。上端ほど透明な青白（発光扱いなのでpxRaw） */
  const W = 2, H = 8;
  const sh = sheetA(W, H);
  const col = [214, 224, 238];
  for (let y = 0; y < H; y++) {
    const a = 0.15 + (y / (H - 1)) * 0.55;   // 上端ほど透明
    sh.pxRaw(0, y, col, a);
    sh.pxRaw(1, y, col, a * 0.6);
  }
  return { img: sh.c, w: 0.02, h: 0.28 };
}
function sprSplash() {
  /* 雨粒が着地した波紋: 6×3pxの薄い白い輪（pxRaw） */
  const W = 6, H = 3;
  const sh = sheetA(W, H);
  const col = [232, 238, 244];
  sh.pxRaw(1, 0, col, 0.35); sh.pxRaw(2, 0, col, 0.45);
  sh.pxRaw(3, 0, col, 0.45); sh.pxRaw(4, 0, col, 0.35);
  sh.pxRaw(0, 1, col, 0.5); sh.pxRaw(5, 1, col, 0.5);
  sh.pxRaw(1, 2, col, 0.3); sh.pxRaw(4, 2, col, 0.3);
  return { img: sh.c, w: 0.18, h: 0.09 };
}

/* ============================================================ */
const ASSETS = {};
function buildAssets() {
  ASSETS.floor = buildFloorTex();
  ASSETS.sky = buildSkyTex();
  ASSETS.clouds = buildCloudsTex();
  ASSETS.tex = {
    aptCream: texApartmentCream(),
    aptWhite: texApartmentWhite(),
    house: texHouseSiding(),
    housesFar: texHousesFar(),
    hedge: texHedge(),
    fence: texFence(),
    mesh: texGreenMesh(),
    bench: texBench(),
    sign: texSign(),
    signBack: texSignBack(),
    seatSide: texSeatSide(),
    benchBack: texBenchBack(),
    leg: texLeg(),
    sideCream: texSideWall([212, 200, 178], 6.5, 6.8, 311),
    sideWhite: texSideWall([226, 226, 220], 6.5, 7.4, 313),
    sideGray: texSideWall([184, 186, 190], 5.8, 5.4, 317),
    wires: texWires(),
    konbini: texKonbini(),
    konbiniSide: texKonbiniSide(),
    smokePanel: texSmokePanel(),
    toiletFront: texToiletFront(),
    toiletBack: texToiletBack(),
    toiletSide: texToiletSide(),
  };
  const flowering = ENV.season === "spring" || ENV.season === "summer";
  ASSETS.spr = {
    treeBig1: sprKusunoki(101), treeBig2: sprKusunoki(202),
    treeSm1: sprKeyaki(303), treeSm2: sprKeyaki(404),
    /* 春はケヤキの1種をサクラに差し替える */
    treeSm3: ENV.season === "spring" ? sprKeyaki(505, LEAF_PAL.sakura) : sprKeyaki(505),
    catSleep: sprCatSleep(), catSit: sprCatSit(),
    ashtray: sprAshtray(),
    leaf: [sprLeaf(1), sprLeaf(2)],
    rainDrop: sprRainDrop(), splash: sprSplash(),
    liriope: [sprLiriope(11), sprLiriope(22), sprLiriope(33)],
    shrub: [sprShrub(44), sprShrub(55)],
    /* サツキの花は春〜夏だけ */
    azalea: [sprShrub(64, flowering ? [230, 120, 150] : null),
             sprShrub(75, flowering ? [236, 150, 170] : null)],
    pole: sprPole(),
    lamp: sprParkLamp(),
    planter: [sprPlanter(81), sprPlanter(82)],
    bollard: sprBollard(),
    fountain: sprFountain(),
    pigeon: [sprPigeon(66), sprPigeon(77), sprPigeon(88)],
    weed: [sprWeed(91), sprWeed(92), sprWeed(93)],
  };
}
