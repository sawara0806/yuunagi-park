"use strict";
/* ============================================================
   sprites.js — 手続き的に生成するドット絵スプライト
   すべて起動時にオフスクリーンcanvasへ描き、時間帯(mode)ごとに
   gradeを掛けた4バリエーションを持つ。
   ============================================================ */

function mkCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- 文字列マップからスプライトを作る ---- */
function fromStrings(rows, map) {
  const h = rows.length, w = rows[0].length;
  const c = mkCanvas(w, h), g = c.getContext("2d");
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === "." || !map[ch]) continue;
      g.fillStyle = rgbs(map[ch]);
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

/* ---- ImageDataベースのピクセル描画ヘルパ ---- */
function pixelSheet(w, h) {
  const c = mkCanvas(w, h), g = c.getContext("2d");
  const img = g.createImageData(w, h);
  const d = img.data;
  return {
    canvas: c, w, h,
    set(x, y, col) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      d[i] = col[0]; d[i+1] = col[1]; d[i+2] = col[2]; d[i+3] = 255;
    },
    commit() { g.putImageData(img, 0, 0); return c; },
  };
}

/* ============================================================
   人物（12×18・右向き。左向きは描画時に反転）
   ============================================================ */
const BODY_ROWS = [
  "....hhhh....",
  "...hhhhhh...",
  "..hhhhhhh...",
  "..hhhssse...",
  "..hhhsssss..",
  "..hhssss....",
  ".....ss.....",
  "....cccc....",
  "...cccccc...",
  "...ccccccm..",
  "..s.cccccm..",
  "..s.ccccc...",
];
const LEGS = {
  stand: [
    "....pppp....",
    "....pppp....",
    "....pp.pp...",
    "....pp.pp...",
    "....pp.pp...",
    "...bb..bb...",
  ],
  spread: [
    "....pppp....",
    "...pppppp...",
    "...pp..pp...",
    "..pp....pp..",
    "..p......p..",
    ".bb......bb.",
  ],
  mid: [
    "....pppp....",
    "....ppppp...",
    "....pp.pp...",
    "...pp...pp..",
    "...p.....p..",
    "..bb.....bb.",
  ],
  together: [
    "....pppp....",
    "....pppp....",
    "....p.pp....",
    "....p.pp....",
    "....p..p....",
    "...bb..bb...",
  ],
};
const SIT_ROWS = [
  "....hhhh....",
  "...hhhhhh...",
  "..hhhhhhh...",
  "..hhhssse...",
  "..hhhsssss..",
  "..hhssss....",
  ".....ss.....",
  "....cccc....",
  "...cccccc...",
  "...cccccm...",
  "..s.ppppp...",
  "....pppppp..",
  "......p.pp..",
  "......p.pp..",
  ".....bb.bb..",
];
const PLAYER_EYE = { x: 8, y: 3 };

function buildPlayer(ink) {
  const map = { h: ink.hair, s: ink.skin, e: ink.eye, c: ink.shirt, m: ink.shirtSh, p: ink.pants, b: ink.shoes };
  const frame = legs => fromStrings(BODY_ROWS.concat(LEGS[legs]), map);
  return {
    idle: frame("stand"),
    walk: [frame("spread"), frame("mid"), frame("together"), frame("mid")],
    sit: fromStrings(SIT_ROWS, map),
    w: 12, h: 18, sitH: 15,
  };
}

/* ============================================================
   樹木（幹＋こんもりした葉。3フレームの揺れ）
   ============================================================ */
function buildTree(ink, seed, scale, kind) {
  const w = Math.round(68 * scale), h = Math.round(80 * scale);
  const L = kind === "cherry"
    ? [ink.cherry1, ink.cherry2, ink.cherry3]
    : [ink.leaf1, ink.leaf2, ink.leaf3];
  // 同じ乱数列でフレーム間の形を一致させるため、先に構造を決める
  const rng = mulberry32(seed);
  const cx = w / 2;
  const lean = (rng() - 0.5) * 6 * scale;
  const trunkTop = h - Math.round(38 * scale);
  const nBlob = 9 + ((rng() * 4) | 0);
  const blobs = [];
  for (let i = 0; i < nBlob; i++) {
    blobs.push({
      x: cx + (rng() - 0.5) * 40 * scale,
      y: h * 0.30 + (rng() - 0.5) * 30 * scale,
      r: (11 + rng() * 8) * scale,
      ph: rng() * 6.28,
    });
  }
  // 頂点付近にもう1つ
  blobs.push({ x: cx + lean, y: h * 0.14, r: 10 * scale, ph: rng() * 6.28 });
  const noiseSeed = (rng() * 1e9) | 0;

  const frames = [0, 1, 2].map(f => {
    const sh = pixelSheet(w, h);
    // 幹
    for (let y = h - 1; y >= trunkTop; y--) {
      const t = (h - y) / (h - trunkTop);
      const width = Math.max(2, Math.round((5 - t * 2.4) * scale));
      const off = Math.round(lean * t * 0.6);
      for (let x = 0; x < width; x++) {
        const gx = Math.round(cx - width / 2 + x + off);
        sh.set(gx, y, x === width - 1 ? ink.trunk2 : ink.trunk1);
      }
    }
    // 枝
    const brng = mulberry32(seed + 7);
    for (let b = 0; b < 3; b++) {
      let bx = cx + lean * 0.6, by = trunkTop + 2;
      const dx = (brng() - 0.5) * 2.4, dy = -1;
      for (let s2 = 0; s2 < 10 * scale; s2++) {
        bx += dx; by += dy;
        sh.set(Math.round(bx), Math.round(by), ink.trunk2);
      }
    }
    // 葉群
    const nrng = mulberry32(noiseSeed);
    const noise = [];
    for (let i = 0; i < 512; i++) noise.push(nrng());
    for (const bl of blobs) {
      const sway = Math.round(Math.sin(bl.ph + f * 2.1) * 1.6);
      const bx = bl.x + sway, by = bl.y;
      const r = bl.r;
      for (let y = Math.floor(by - r); y <= by + r; y++) {
        for (let x = Math.floor(bx - r * 1.15); x <= bx + r * 1.15; x++) {
          const dx2 = (x - bx) / 1.15, dy2 = (y - by) * 1.12;
          const d = Math.sqrt(dx2 * dx2 + dy2 * dy2);
          const nz = noise[((x * 31 + y * 57) & 511)];
          if (d > r * (0.74 + nz * 0.30)) continue;
          // 上側ほど明るく。境界はディザ
          const rel = (y - (by - r)) / (2 * r);
          let ci;
          if (rel < 0.34) ci = 0;
          else if (rel < 0.42) ci = ((x + y) & 1) ? 0 : 1;
          else if (rel < 0.72) ci = 1;
          else if (rel < 0.80) ci = ((x + y) & 1) ? 1 : 2;
          else ci = 2;
          // 左上ハイライトを散らす
          if (ci === 1 && nz > 0.92 && y < by) ci = 0;
          sh.set(x, y, L[ci]);
        }
      }
    }
    return sh.commit();
  });
  return { frames, w, h };
}

/* ============================================================
   小物スプライト
   ============================================================ */
function buildBench(ink) {
  const rows = [
    "ww......ww......ww",
    "wwwwwwwwwwwwwwwwww",
    "vvvvvvvvvvvvvvvvvv",
    "..................",
    "wwwwwwwwwwwwwwwwww",
    "wwwwwwwwwwwwwwwwww",
    "vvvvvvvvvvvvvvvvvv",
    ".mm............mm.",
    ".mm............mm.",
    ".mm............mm.",
    ".mm............mm.",
  ];
  return fromStrings(rows, { w: ink.wood1, v: ink.wood2, m: ink.metal2 });
}

function buildLamp(ink) {
  const w = 10, h = 38;
  const sh = pixelSheet(w, h);
  for (let y = 6; y < h; y++) { sh.set(4, y, ink.metal1); sh.set(5, y, ink.metal2); }
  for (let x = 2; x <= 7; x++) sh.set(x, h - 1, ink.metal2);
  // 頭部
  for (let y = 1; y <= 5; y++)
    for (let x = 2; x <= 7; x++) {
      const edge = y === 1 || y === 5 || x === 2 || x === 7;
      sh.set(x, y, edge ? ink.metal2 : ink.lampHead);
    }
  sh.set(4, 0, ink.metal2); sh.set(5, 0, ink.metal2);
  return sh.commit();
}

function buildGatePillar(ink) {
  const w = 12, h = 30;
  const sh = pixelSheet(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 1; x < w - 1; x++) {
      let c = ink.stone2;
      if (x <= 2) c = ink.stone1;
      if (x >= w - 3 || y > h - 3) c = ink.stone3;
      if (((x * 13 + y * 7) & 15) === 0) c = ink.stone3;
      sh.set(x, y, c);
    }
  for (let x = 0; x < w; x++) { sh.set(x, 0, ink.stone1); sh.set(x, 1, ink.stone2); }
  // 銘板
  for (let y = 8; y <= 16; y++) for (let x = 4; x <= 7; x++) sh.set(x, y, ink.stone1);
  for (let y = 10; y <= 15; y += 2) sh.set(5, y, ink.stone3), sh.set(6, y, ink.stone3);
  return sh.commit();
}

function buildBoard(ink) {
  const rows = [
    "..wwwwwwwwwwwwww..",
    ".wwwwwwwwwwwwwwww.",
    ".wappppppppppppwv.",
    ".wappppppppppppwv.",
    ".wapp.pp.pp.ppawv.",
    ".wappppppppppppwv.",
    ".wappppppppppppwv.",
    ".wwwwwwwwwwwwwwvv.",
    "..vv..........vv..",
    "..vv..........vv..",
    "..vv..........vv..",
    "..vv..........vv..",
  ];
  return fromStrings(rows, { w: ink.wood1, v: ink.wood2, p: ink.paper, a: ink.stone2 });
}

function buildVending(ink) {
  const w = 14, h = 24;
  const sh = pixelSheet(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      sh.set(x, y, x >= w - 3 || y >= h - 2 ? ink.vend2 : ink.vend1);
  // 商品窓
  for (let y = 2; y <= 9; y++)
    for (let x = 2; x <= 9; x++)
      sh.set(x, y, ink.vendGlass);
  // 缶のシルエット
  for (const [cx, cy] of [[3,4],[6,4],[3,7],[6,7]]) {
    sh.set(cx, cy, ink.metal2); sh.set(cx+1, cy, ink.metal2);
    sh.set(cx, cy+1, ink.metal2); sh.set(cx+1, cy+1, ink.metal2);
  }
  // 取り出し口・ボタン
  for (let x = 2; x <= 9; x++) sh.set(x, 18, ink.vend2);
  for (let x = 2; x <= 9; x++) sh.set(x, 19, ink.metal2);
  sh.set(10, 3, ink.paper); sh.set(10, 5, ink.paper);
  return sh.commit();
}

function buildFountain(ink) {
  const rows = [
    "...mm...",
    "..ssss..",
    ".ssssss.",
    ".s2222s.",
    "..s22s..",
    "..s22s..",
    "..s22s..",
    ".s2222s.",
  ];
  return fromStrings(rows, { s: ink.stone1, "2": ink.stone2, m: ink.metal2 });
}

function buildSwingFrame(ink) {
  const w = 34, h = 30;
  const sh = pixelSheet(w, h);
  // 上バー
  for (let x = 2; x < w - 2; x++) { sh.set(x, 0, ink.metal1); sh.set(x, 1, ink.metal2); }
  // 脚（ハの字）
  for (let y = 0; y < h; y++) {
    const spread = y * 0.18;
    sh.set(Math.round(4 + spread), y, ink.metal1);
    sh.set(Math.round(5 + spread), y, ink.metal2);
    sh.set(Math.round(w - 5 - spread), y, ink.metal1);
    sh.set(Math.round(w - 6 - spread), y, ink.metal2);
  }
  return sh.commit();
}

function buildCat(ink) {
  const base = [
    "..........",
    "...cccc...",
    "..cccccc2.",
    ".2cccccc2e",
    ".2cccccc2.",
    "..2ccc2...",
  ];
  const twitch = [
    "....c.....",
    "...cccc...",
    "..cccccc2.",
    ".2cccccc2e",
    ".2cccccc2.",
    "..2ccc2...",
  ];
  const map = { c: ink.cat1, "2": ink.cat2, e: ink.cat3 };
  return { sleep: fromStrings(base, map), twitch: fromStrings(twitch, map) };
}

function buildBall(ink) {
  const rows = ["..rr..", ".rrrr.", "rrwwrr", "rwwwwr", ".rrrr.", "..rr.."];
  return fromStrings(rows, { r: ink.ball1, w: ink.ball2 });
}

function buildSparrow(ink) {
  const map = { b: ink.bird1, w: ink.bird2, k: ink.bird3 };
  const sit = ["..bb.", ".bbbk", "wbbb.", ".bb.."];
  const fly1 = ["b..b.", ".bbbk", "wbbb.", "....."];
  const fly2 = [".....", ".bbbk", "wbbbb", "b..b."];
  return {
    sit: fromStrings(sit, map),
    fly: [fromStrings(fly1, map), fromStrings(fly2, map)],
  };
}

function buildCloud(ink, seed) {
  const rng = mulberry32(seed);
  const w = 50 + ((rng() * 40) | 0), h = 16;
  const sh = pixelSheet(w, h);
  const n = 4 + ((rng() * 3) | 0);
  const blobs = [];
  for (let i = 0; i < n; i++)
    blobs.push({ x: 8 + rng() * (w - 16), y: 6 + rng() * 5, r: 4 + rng() * 6 });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let inside = false, bottom = false;
      for (const b of blobs) {
        const d = Math.hypot((x - b.x) * 0.7, (y - b.y) * 1.4);
        if (d < b.r) { inside = true; if (y > b.y + b.r * 0.35) bottom = true; }
      }
      if (!inside) continue;
      if (((x + y) & 1) === 0 && y < 4) continue; // 上端ディザ
      sh.set(x, y, bottom ? ink.cloudShade || ink.cat2 : ink.cloud || ink.cat1);
    }
  return sh.commit();
}

/* ============================================================
   全モードぶんを組み立てる
   ============================================================ */
function buildAllSprites() {
  const out = {};
  for (const mode of MODES) {
    const ink = gradedInk(mode);
    // 雲は空の色に合わせる（シーン色を直接使用）
    const cloudInk = Object.assign({}, ink, {
      cloud: PAL[mode].cloud, cloudShade: PAL[mode].cloudShade,
    });
    out[mode] = {
      ink,
      player: buildPlayer(ink),
      trees: [
        buildTree(ink, 11, 1.0, "keyaki"),
        buildTree(ink, 23, 0.85, "keyaki"),
        buildTree(ink, 37, 1.1, "keyaki"),
        buildTree(ink, 51, 0.9, "keyaki"),
      ],
      cherry: buildTree(ink, 71, 0.95, "cherry"),
      bigTree: buildTree(ink, 91, 1.5, "keyaki"),
      bench: buildBench(ink),
      lamp: buildLamp(ink),
      pillar: buildGatePillar(ink),
      board: buildBoard(ink),
      vending: buildVending(ink),
      fountain: buildFountain(ink),
      swing: buildSwingFrame(ink),
      cat: buildCat(ink),
      ball: buildBall(ink),
      sparrow: buildSparrow(ink),
      clouds: [buildCloud(cloudInk, 101), buildCloud(cloudInk, 202), buildCloud(cloudInk, 303)],
    };
  }
  return out;
}
