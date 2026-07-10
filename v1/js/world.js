"use strict";
/* ============================================================
   world.js — 公園ワールド（レイヤー生成・配置・風・パーティクル）
   ============================================================ */

const VW = 480, VH = 270;
const WORLD_W = 3200;
const GROUND_TOP = 158;      // 地面ストリップの上端
const PATH_TOP = 238;        // 小径の上端
const PROP_BASE = 240;       // 樹木・小物の接地y
const FEET_Y = 260;          // 主人公の足元y

/* ---- 配置 ---- */
const TREES = [
  { x: 300,  kind: "cherry" },
  { x: 470,  kind: 0 }, { x: 640, kind: 1 }, { x: 820, kind: 2 }, { x: 980, kind: 3 },
  { x: 1440, kind: 1 }, { x: 1960, kind: 2 },
  { x: 2460, kind: 3 }, { x: 2600, kind: 0 },
  { x: 2930, kind: "big" },
];
const LAMPS = [380, 900, 1350, 2060, 2560];
const POND = { x1: 1520, x2: 1880, top: 206, bottom: 238 };
const SWING_X = 2200;
const SANDBOX = { x1: 2280, x2: 2346 };
const BENCHES = [700, 1760];
const CAT_X = 707;
const BALL_X = 588;
const VEND_X = 1080;
const FOUNTAIN_X = 1160;
const POLES = [60, 430];
const MEADOW_X = 2680;

/* ---- 風：左から右へ伝わるゆらぎ 0..1 ---- */
function windAt(x, t) {
  const ph = t * 1.3 - x * 0.011;
  let w = 0.38 + 0.30 * Math.sin(ph) + 0.20 * Math.sin(ph * 0.37 + 1.7) + 0.12 * Math.sin(t * 0.13);
  return Math.max(0, Math.min(1, w));
}

const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f];

/* ============================================================
   プリレンダ層（mode別）
   ============================================================ */
function buildSky(mode) {
  const pal = PAL[mode];
  const sh = pixelSheet(VW, 166);
  const bandH = 33;
  for (let y = 0; y < 166; y++) {
    const bi = Math.min(4, (y / bandH) | 0);
    for (let x = 0; x < VW; x++) {
      let c = pal.sky[bi];
      const edge = y - bi * bandH;
      if (edge < 2 && bi > 0 && ((x + y) & 1)) c = pal.sky[bi - 1];
      sh.set(x, y, c);
    }
  }
  return sh.commit();
}

function buildCity(mode) {
  const pal = PAL[mode];
  const w = 820, h = 46;
  const sh = pixelSheet(w, h);
  const rng = mulberry32(404);
  let x = 0;
  const lit = pal.light < 0.6;
  while (x < w) {
    const bw = 14 + ((rng() * 26) | 0);
    const bh = 8 + ((rng() * 26) | 0);
    for (let bx = 0; bx < bw && x + bx < w; bx++)
      for (let y = h - bh; y < h; y++)
        sh.set(x + bx, y, pal.city);
    if (lit) {
      for (let i = 0; i < bw * 0.2; i++) {
        if (rng() < 0.6) sh.set(x + 2 + ((rng() * (bw - 4)) | 0), h - 3 - ((rng() * (bh - 5)) | 0), [222, 200, 140]);
      }
    } else { for (let i = 0; i < bw * 0.2; i++) rng(), rng(); }
    x += bw + 2 + ((rng() * 10) | 0);
  }
  // 給水塔（丘より上に頭が出るよう高めに）
  const tx = 520;
  for (let y = 0; y < 11; y++) for (let bx = -7; bx <= 7; bx++) {
    if (Math.hypot(bx, (y - 5.5) * 1.25) < 7.2) sh.set(tx + bx, y, pal.city);
  }
  for (const lx of [-5, 0, 5]) for (let y = 10; y < h; y++) sh.set(tx + lx, y, pal.city);
  for (let bx = -6; bx <= 6; bx++) sh.set(tx + bx, 13, pal.city);
  return sh.commit();
}

function buildHills(mode) {
  const pal = PAL[mode];
  const w = 1260, h = 40;
  const sh = pixelSheet(w, h);
  for (let x = 0; x < w; x++) {
    const y1 = 12 + Math.sin(x * 0.011) * 6 + Math.sin(x * 0.0031 + 2) * 7;
    const y2 = 24 + Math.sin(x * 0.014 + 5) * 5 + Math.sin(x * 0.0047) * 5;
    for (let y = Math.round(y1); y < h; y++) sh.set(x, y, pal.hillFar);
    for (let y = Math.round(y2); y < h; y++) sh.set(x, y, pal.hillNear);
  }
  return sh.commit();
}

function buildTreeline(mode) {
  const pal = PAL[mode];
  const w = 1860, h = 34;
  const sh = pixelSheet(w, h);
  const rng = mulberry32(777);
  const tops = [];
  for (let i = 0; i < w / 14; i++) tops.push(6 + rng() * 12);
  for (let x = 0; x < w; x++) {
    const i = (x / 14) | 0;
    const a = tops[i], b = tops[Math.min(i + 1, tops.length - 1)];
    const f = (x % 14) / 14;
    const y0 = a + (b - a) * f + Math.sin(x * 0.6) * 1.2;
    for (let y = Math.round(y0); y < h; y++) {
      if (y - y0 < 2 && ((x + y) & 1)) continue;
      sh.set(x, y, pal.treeline);
    }
  }
  return sh.commit();
}

function buildGroundStrip(mode) {
  const pal = PAL[mode];
  const h = VH - GROUND_TOP;              // 112
  const sh = pixelSheet(WORLD_W, h);
  const rng = mulberry32(909);
  const noise = [];
  for (let i = 0; i < 4096; i++) noise.push(rng());
  const nz = (x, y) => noise[(x * 53 + y * 97) & 4095];
  const pathRow = PATH_TOP - GROUND_TOP;  // 80
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      let c;
      if (y < pathRow) {
        let bi = y < 26 ? 0 : y < 54 ? 1 : 2;
        const edge = y - (bi === 1 ? 26 : bi === 2 ? 54 : 0);
        if (edge < 2 && bi > 0 && ((x + y) & 1)) bi--;
        c = pal.grass[bi];
        const n = nz(x, y);
        if (n > 0.955) c = shade(c, 0.86);
        else if (n < 0.03) c = shade(c, 1.10);
      } else if (y === pathRow) {
        c = pal.pathEdge;
      } else if (y < h - 4) {
        c = pal.path[0];
        const n = nz(x, y);
        if (n > 0.90) c = pal.path[1];
        if (n < 0.015) c = pal.pathEdge;
      } else {
        c = shade(pal.grass[2], 0.92);
      }
      sh.set(x, y, c);
    }
  }
  // 砂場（縁は木枠、砂は粒感を強めに）
  for (let x = SANDBOX.x1; x < SANDBOX.x2; x++)
    for (let y = 66; y < pathRow; y++) {
      const border = x < SANDBOX.x1 + 2 || x >= SANDBOX.x2 - 2 || y < 68 || y >= pathRow - 1;
      let c;
      if (border) c = gradeColor([122, 88, 66], pal.grade);
      else {
        const n = nz(x, y);
        c = n > 0.82 ? shade(pal.sand, 0.88) : n < 0.08 ? shade(pal.sand, 1.08) : pal.sand;
      }
      sh.set(x, y, c);
    }
  // ブランコ下の土
  for (let x = SWING_X - 16; x < SWING_X + 20; x++)
    for (let y = 72; y < pathRow; y++)
      if (nz(x, y) > 0.25) sh.set(x, y, pal.path[1]);
  // 白詰草
  const frng = mulberry32(1212);
  for (let i = 0; i < 140; i++) {
    const fx = (frng() * WORLD_W) | 0, fy = 22 + ((frng() * 54) | 0);
    const col = frng() < 0.7 ? [240, 240, 232] : [244, 224, 150];
    sh.set(fx, fy, gradeColor(col, pal.grade));
    sh.set(fx, fy + 1, shade(pal.grass[2], 0.9));
  }
  return sh.commit();
}

function buildForeground(mode) {
  const pal = PAL[mode];
  const w = 4040, h = 18;
  const sh = pixelSheet(w, h);
  const rng = mulberry32(555);
  const col = shade(pal.grass[2], 0.62);
  for (let i = 0; i < w / 5; i++) {
    const x = (rng() * w) | 0;
    const bh = 5 + ((rng() * 11) | 0);
    const leanDir = rng() - 0.5;
    for (let y = 0; y < bh; y++) {
      const lean = Math.round(leanDir * y * 0.5);
      sh.set(x + lean, h - 1 - y, col);
    }
  }
  return sh.commit();
}

function buildAllLayers() {
  const out = {};
  for (const mode of MODES) {
    out[mode] = {
      sky: buildSky(mode),
      city: buildCity(mode),
      hills: buildHills(mode),
      treeline: buildTreeline(mode),
      ground: buildGroundStrip(mode),
      fg: buildForeground(mode),
    };
  }
  return out;
}

/* ============================================================
   ワールド状態と描画
   ============================================================ */
const World = {
  t: 0,
  leaves: [], petals: [], fireflies: [], ripples: [], pebbles: [], stream: 0,
  clouds: [], stars: [], koi: [{ p: 0.3 }, { p: 3.5 }],
  wireBirds: [], birdRespawn: 0,
  catTwitch: 0, dragonfly: { x: 1700, y: 190, p: 0 },
  swingAngle: 0, swingVel: 0,

  init() {
    const rng = mulberry32(2024);
    this.clouds = [
      { x: 60, y: 22, i: 0, v: 1.6 }, { x: 210, y: 46, i: 1, v: 1.1 },
      { x: 340, y: 12, i: 2, v: 2.0 }, { x: 460, y: 58, i: 0, v: 0.8 },
    ];
    for (let i = 0; i < 130; i++)
      this.stars.push({ x: rng() * VW, y: rng() * 118, p: rng() * 6.28, big: rng() < 0.12 });
    for (let i = 0; i < 26; i++)
      this.fireflies.push({
        x: 1540 + rng() * 320 * (rng() < 0.5 ? 1 : 0) + (rng() < 0.5 ? 0 : (MEADOW_X - 1540) + rng() * 460),
        y: 200 + rng() * 40, p: rng() * 6.28, q: rng() * 6.28,
      });
    this.spawnWireBirds();
  },
  spawnWireBirds() {
    this.wireBirds = [
      { x: 200, y: 0, state: "sit", f: 0 }, { x: 226, y: 0, state: "sit", f: 0 },
      { x: 262, y: 0, state: "sit", f: 0 },
    ];
  },

  update(dt, t, playerX, mode) {
    this.t = t;
    // 雲
    for (const c of this.clouds) { c.x += c.v * dt; if (c.x > 560) c.x = -110; }
    // 落ち葉・花びら
    if (Math.random() < 0.03 && this.leaves.length < 30) {
      const tr = TREES[(Math.random() * TREES.length) | 0];
      if (tr.kind !== "cherry")
        this.leaves.push({ x: tr.x + (Math.random() - 0.5) * 44, y: 175 + Math.random() * 30, p: Math.random() * 6.28, vy: 9 + Math.random() * 5, life: 1 });
    }
    if (Math.random() < 0.05 && this.petals.length < 24) {
      this.petals.push({ x: 300 + (Math.random() - 0.5) * 48, y: 172 + Math.random() * 26, p: Math.random() * 6.28, vy: 7 + Math.random() * 4, life: 1 });
    }
    const flutter = (arr, spd) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        const l = arr[i];
        const w = windAt(l.x, t);
        l.y += l.vy * dt; l.x += (Math.sin(t * 2 + l.p) * 6 + w * spd) * dt; l.p += dt;
        if (l.y > PROP_BASE - 2) { l.life -= dt * 1.2; l.y = PROP_BASE - 2; }
        if (l.life <= 0) arr.splice(i, 1);
      }
    };
    flutter(this.leaves, 14); flutter(this.petals, 20);
    // 蛍
    for (const f of this.fireflies) {
      f.x += Math.sin(t * 0.4 + f.p) * 3 * dt; f.y += Math.cos(t * 0.33 + f.q) * 2.4 * dt;
      f.y = Math.max(178, Math.min(246, f.y));
    }
    // 波紋
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.r += 14 * dt; r.a -= 0.55 * dt;
      if (r.a <= 0) this.ripples.splice(i, 1);
    }
    if (Math.random() < 0.008)
      this.ripples.push({ x: POND.x1 + 40 + Math.random() * (POND.x2 - POND.x1 - 80), y: POND.top + 8 + Math.random() * 22, r: 1, a: 0.5 });
    // 小石
    for (let i = this.pebbles.length - 1; i >= 0; i--) {
      const p = this.pebbles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 130 * dt;
      if (p.y >= p.ty) {
        this.pebbles.splice(i, 1);
        this.ripples.push({ x: p.x, y: p.ty, r: 1, a: 0.8 });
        this.ripples.push({ x: p.x, y: p.ty, r: 4, a: 0.5 });
        if (typeof AUDIO !== "undefined") AUDIO.plop(p.x);
      }
    }
    // 鯉
    for (const k of this.koi) k.p += dt * 0.22;
    // 電線の雀
    for (let i = this.wireBirds.length - 1; i >= 0; i--) {
      const b = this.wireBirds[i];
      if (b.state === "sit" && Math.abs(playerX - b.x) < 46) { b.state = "fly"; b.vx = 34 + Math.random() * 16; b.vy = -20 - Math.random() * 10; }
      if (b.state === "fly") {
        b.x += b.vx * dt; b.y += b.vy * dt; b.f += dt * 14;
        if (b.y < -80 || b.x > WORLD_W) this.wireBirds.splice(i, 1);
      }
    }
    if (this.wireBirds.length === 0) {
      this.birdRespawn += dt;
      if (this.birdRespawn > 24 && Math.abs(playerX - 230) > 260) { this.spawnWireBirds(); this.birdRespawn = 0; }
    }
    // ブランコ（座っていれば大きく、風で小さく）
    const target = 0;
    const wind = windAt(SWING_X, t);
    const drive = PLAYER.sitting && PLAYER.sitting.type === "swing"
      ? Math.sin(t * 1.35) * 0.30
      : Math.sin(t * 0.9) * 0.10 * (0.25 + wind);
    this.swingAngle += (drive + target - this.swingAngle) * Math.min(1, dt * 3);
    // 猫
    if (this.catTwitch > 0) this.catTwitch -= dt;
    // とんぼ
    const d = this.dragonfly;
    d.p += dt;
    d.x = 1700 + Math.sin(d.p * 0.5) * 120;
    d.y = 190 + Math.sin(d.p * 1.1) * 14;
    // 水飲み
    if (this.stream > 0) this.stream -= dt;
  },

  throwPebble(px, dir) {
    const tx = Math.max(POND.x1 + 30, Math.min(POND.x2 - 30, px + dir * (40 + Math.random() * 50)));
    this.pebbles.push({ x: px + dir * 6, y: FEET_Y - 12, vx: (tx - px) * 1.1, vy: -46, ty: POND.top + 10 + Math.random() * 20 });
  },

  /* ---------- 描画 ---------- */
  drawBackdrop(g, camX, t) {
    blitLayer(g, "sky", 0, 0);
    const starA = sceneN("star");
    if (starA > 0.02) {
      for (const s of this.stars) {
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.1 + s.p));
        g.fillStyle = `rgba(235,238,248,${(starA * tw).toFixed(3)})`;
        g.fillRect(s.x | 0, s.y | 0, 1, 1);
        if (s.big && tw > 0.7) { g.fillRect((s.x | 0) - 1, s.y | 0, 3, 1); g.fillRect(s.x | 0, (s.y | 0) - 1, 1, 3); }
      }
    }
    // 太陽 / 月
    const pos = sceneV2("sunPos");
    const sx = (pos[0] * VW) | 0, sy = (pos[1] * VH) | 0;
    const sun = sceneC3("sun"), glow = sceneC3("glow");
    const isNight = starA > 0.6;
    const R = isNight ? 7 : 10;
    for (const [rr, aa] of [[R * 2.6, 0.10], [R * 1.8, 0.16], [R * 1.25, 0.28]]) {
      g.fillStyle = rgba(glow, aa);
      fillPixelCircle(g, sx, sy, rr);
    }
    g.fillStyle = rgbs(sun);
    fillPixelCircle(g, sx, sy, R);
    if (isNight) { // 三日月
      g.fillStyle = rgbs(sceneC("sky", 1));
      fillPixelCircle(g, sx - 3, sy - 2, R - 1);
    }
    // 雲
    for (const c of this.clouds) {
      drawMixPick(g, s => s.clouds[c.i], ((c.x - camX * 0.06 + 560) % 560) - 110 | 0, c.y | 0);
    }
    blitLayer(g, "city", -(camX * 0.12) | 0, 116);
    blitLayer(g, "hills", -(camX * 0.28) | 0, 122);
    blitLayer(g, "treeline", -(camX * 0.5) | 0, 128);
  },

  drawScene(g, camX, t) {
    blitLayer(g, "ground", -camX | 0, GROUND_TOP);
    this.drawPond(g, camX, t);
    const inView = (x, m) => x > camX - m && x < camX + VW + m;
    // 影
    const shDx = sceneN2("shadow", "dx"), shA = sceneN2("shadow", "a");
    if (shA > 0.01) {
      g.fillStyle = `rgba(30,36,64,${shA.toFixed(3)})`;
      for (const tr of TREES) if (inView(tr.x, 90)) {
        const spr = treeSprite(tr);
        const w = spr.w;
        fillPixelEllipse(g, tr.x - camX + shDx * 0.9, PROP_BASE - 1, w * 0.42 + Math.abs(shDx) * 0.5, 3);
      }
      for (const bx of BENCHES) if (inView(bx, 40)) fillPixelEllipse(g, bx - camX + shDx * 0.3, PROP_BASE, 11, 2);
      if (inView(VEND_X, 40)) fillPixelEllipse(g, VEND_X - camX + shDx * 0.35, PROP_BASE, 8, 2);
    }
    // 電柱と電線
    this.drawWires(g, camX, t);
    // 遊具
    if (inView(SWING_X, 60)) this.drawSwing(g, camX, t);
    // 樹木
    for (const tr of TREES) {
      if (!inView(tr.x, 90)) continue;
      const spr = treeSprite(tr);
      const w = windAt(tr.x, t);
      const fi = [0, 1, 2, 1][((t * (0.9 + w * 2.4) + tr.x * 0.1) | 0) % 4];
      drawMixPick(g, s => treeSpriteOf(s, tr).frames[fi], tr.x - camX - spr.w / 2 | 0, PROP_BASE - spr.h);
    }
    // 小物
    if (inView(130, 30)) drawMixPick(g, s => s.pillar, 124 - camX, PROP_BASE - 30);
    if (inView(196, 30)) drawMixPick(g, s => s.pillar, 190 - camX, PROP_BASE - 30);
    if (inView(246, 30)) drawMixPick(g, s => s.board, 237 - camX, PROP_BASE - 12);
    for (const lx of LAMPS) if (inView(lx, 20)) drawMixPick(g, s => s.lamp, lx - camX - 5, PROP_BASE - 38);
    for (const bx of BENCHES) if (inView(bx, 30)) drawMixPick(g, s => s.bench, bx - camX - 9, PROP_BASE - 11);
    if (inView(VEND_X, 30)) drawMixPick(g, s => s.vending, VEND_X - camX - 7, PROP_BASE - 24);
    if (inView(FOUNTAIN_X, 20)) drawMixPick(g, s => s.fountain, FOUNTAIN_X - camX - 4, PROP_BASE - 8);
    if (inView(BALL_X, 10)) drawMixPick(g, s => s.ball, BALL_X - camX - 3, PROP_BASE - 6);
    // 猫（ベンチの右端の上）
    if (inView(CAT_X, 20)) {
      const catImg = this.catTwitch > 0 ? (s => s.cat.twitch) : (s => s.cat.sleep);
      drawMixPick(g, catImg, CAT_X - camX - 5, PROP_BASE - 11 - 4 + (Math.sin(t * 1.4) > 0.85 ? 0 : 0));
    }
    // 水飲み場の水
    if (this.stream > 0 && inView(FOUNTAIN_X, 20)) {
      g.fillStyle = "rgba(220,240,250,0.8)";
      const fx = FOUNTAIN_X - camX - 1;
      for (let i = 0; i < 4; i++) g.fillRect(fx + (i % 2), PROP_BASE - 8 + i, 1, 1);
    }
    // 小石（放物線）
    g.fillStyle = "rgba(120,116,110,1)";
    for (const p of this.pebbles) g.fillRect(p.x - camX | 0, p.y | 0, 1, 1);
    // 木漏れ日
    const light = sceneN("light");
    if (light > 0.55) {
      for (const tr of TREES) {
        if (!inView(tr.x, 60)) continue;
        for (let i = 0; i < 3; i++) {
          const a = 0.05 * light * (0.55 + 0.45 * Math.sin(t * 0.7 + i * 2.1 + tr.x));
          if (a <= 0.012) continue;
          g.fillStyle = `rgba(255,248,200,${a.toFixed(3)})`;
          fillPixelEllipse(g, tr.x - camX + (i - 1) * 15, PATH_TOP + 8 + i * 6, 12, 3);
        }
      }
    }
  },

  drawPond(g, camX, t) {
    if (POND.x2 < camX - 20 || POND.x1 > camX + VW + 20) return;
    const w1 = sceneC3("water", 0), w2 = sceneC3("water", 1), w3 = sceneC3("water", 2);
    const x1 = POND.x1 - camX, x2 = POND.x2 - camX;
    for (let y = POND.top; y < POND.bottom; y++) {
      const rel = (y - POND.top) / (POND.bottom - POND.top);
      // 岸の丸み
      const inset = Math.round(Math.pow(Math.abs(rel - 0.5) * 2, 2.2) * 26);
      const c = rel < 0.3 ? w1 : rel < 0.65 ? w2 : w3;
      g.fillStyle = rgbs(c);
      g.fillRect(x1 + inset, y, (x2 - x1) - inset * 2, 1);
    }
    // 岸の石
    g.fillStyle = rgbs(sceneC3("pathEdge"));
    for (let x = POND.x1 - 6; x < POND.x2 + 6; x += 5) {
      const rel = (x - POND.x1) / (POND.x2 - POND.x1);
      const bump = Math.sin(rel * 40 + 1) * 1.5;
      g.fillRect(x - camX, POND.bottom - 1 + (bump | 0) * 0, 3, 2);
    }
    // 対岸の木の映り込み
    g.fillStyle = rgba(shade(sceneC3("treeline"), 0.9), 0.35);
    for (const tx of [1440, 1700, 1960]) {
      for (let y = POND.top + 2; y < POND.top + 16; y++) {
        const wob = Math.round(Math.sin(t * 1.6 + y * 0.9) * 1.5);
        g.fillRect(tx - camX - 12 + wob, y, 24, 1);
      }
    }
    // 光の帯（太陽・月の反射）
    const glint = sceneC3("water", 0);
    for (let y = POND.top + 3; y < POND.bottom - 3; y += 2) {
      const gx = 1700 + Math.sin(t * 0.8 + y * 1.3) * 4 + (y - POND.top) * 1.2;
      const a = 0.25 + 0.2 * Math.sin(t * 2 + y);
      g.fillStyle = rgba(lerpC(glint, [255, 255, 240], 0.5), Math.max(0, a));
      g.fillRect(gx - camX | 0, y, 5 + ((y & 3)), 1);
    }
    // 鯉
    for (const k of this.koi) {
      const kx = 1700 + Math.cos(k.p) * 130, ky = POND.top + 14 + Math.sin(k.p * 1.7) * 9;
      const dir = -Math.sin(k.p) > 0 ? 1 : -1;
      g.fillStyle = "rgba(226,120,70,0.55)";
      g.fillRect(kx - camX - 2, ky | 0, 5, 2);
      g.fillRect(kx - camX - 2 - dir * 3, ky | 0, 2, 1);
    }
    // 波紋
    for (const r of this.ripples) {
      g.strokeStyle = `rgba(255,255,255,${Math.max(0, r.a).toFixed(3)})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(r.x - camX, r.y, r.r, Math.max(0.5, r.r * 0.3), 0, 0, 7);
      g.stroke();
    }
  },

  drawWires(g, camX, t) {
    if (POLES[1] < camX - 60 || POLES[0] > camX + VW + 60) return;
    const c = rgbs(shade(sceneC3("city"), 0.55));
    g.fillStyle = c;
    for (const px of POLES) {
      g.fillRect(px - camX, 150, 2, PROP_BASE - 150);
      g.fillRect(px - camX - 5, 154, 12, 2);
    }
    // 電線（たわみ）
    const x1 = POLES[0] - camX + 1, x2 = POLES[1] - camX + 1;
    for (const wy of [155, 160]) {
      for (let x = x1; x <= x2; x += 2) {
        const f = (x - x1) / (x2 - x1);
        const sag = Math.sin(f * Math.PI) * 9;
        g.fillRect(x, wy + sag | 0, 2, 1);
      }
    }
    // 雀
    for (const b of this.wireBirds) {
      const f = (b.x - (POLES[0] + 1)) / (POLES[1] - POLES[0]);
      const wy = b.state === "sit" ? 155 + Math.sin(f * Math.PI) * 9 - 4 + b.y : 151 + b.y;
      const img = b.state === "sit" ? (s => s.sparrow.sit) : (s => s.sparrow.fly[(b.f | 0) % 2]);
      drawMixPick(g, img, b.x - camX - 2, wy | 0);
    }
  },

  drawSwing(g, camX, t) {
    drawMixPick(g, s => s.swing, SWING_X - camX - 17, PROP_BASE - 30);
    const pivX = SWING_X - camX, pivY = PROP_BASE - 28;
    const ang = this.swingAngle;
    const len = 19;
    const sx = pivX + Math.sin(ang) * len, sy = pivY + Math.cos(ang) * len;
    const c = rgbs(gradedInkNow("metal2"));
    drawPixelLine(g, pivX - 3, pivY, sx - 3, sy, c);
    drawPixelLine(g, pivX + 4, pivY, sx + 4, sy, c);
    g.fillStyle = rgbs(gradedInkNow("wood2"));
    g.fillRect(sx - 5 | 0, sy | 0, 10, 2);
  },

  drawForeground(g, camX, t) {
    // 夜の灯り
    const light = sceneN("light");
    if (light < 0.55) {
      const lampA = (0.55 - light) * 1.6;
      for (const lx of LAMPS) {
        if (lx < camX - 60 || lx > camX + VW + 60) continue;
        const hx = lx - camX, hy = PROP_BASE - 35;
        const gl = g.createRadialGradient(hx, hy, 1, hx, hy, 30);
        gl.addColorStop(0, `rgba(255,224,150,${(0.30 * lampA).toFixed(3)})`);
        gl.addColorStop(1, "rgba(255,224,150,0)");
        g.fillStyle = gl;
        g.fillRect(hx - 30, hy - 30, 60, 68);
        g.fillStyle = `rgba(255,222,150,${(0.10 * lampA).toFixed(3)})`;
        fillPixelEllipse(g, hx, PATH_TOP + 12, 22, 6);
      }
      // 自販機の灯り
      if (VEND_X > camX - 60 && VEND_X < camX + VW + 60) {
        g.fillStyle = `rgba(210,240,250,${(0.16 * lampA).toFixed(3)})`;
        fillPixelEllipse(g, VEND_X - camX - 1, PROP_BASE - 14, 14, 10);
      }
    }
    // 蛍
    const starA = sceneN("star");
    if (starA > 0.45) {
      for (const f of this.fireflies) {
        if (f.x < camX - 20 || f.x > camX + VW + 20) continue;
        const a = starA * Math.max(0, Math.sin(t * 1.5 + f.p)) * 0.9;
        if (a < 0.05) continue;
        const x = f.x - camX, y = f.y;
        g.fillStyle = `rgba(214,255,150,${(a * 0.25).toFixed(3)})`;
        fillPixelCircle(g, x, y, 3);
        g.fillStyle = `rgba(230,255,170,${a.toFixed(3)})`;
        g.fillRect(x | 0, y | 0, 1, 1);
      }
    }
    // 花びら・落ち葉
    for (const p of this.petals) {
      if (p.x < camX - 10 || p.x > camX + VW + 10) continue;
      g.fillStyle = rgba(gradedInkNow("cherry2"), 0.9 * p.life);
      g.fillRect(p.x - camX | 0, p.y | 0, 2, 1);
    }
    for (const l of this.leaves) {
      if (l.x < camX - 10 || l.x > camX + VW + 10) continue;
      g.fillStyle = rgba(gradedInkNow("leaf3"), 0.9 * l.life);
      g.fillRect(l.x - camX | 0, l.y | 0, 2, Math.sin(l.p * 3) > 0 ? 1 : 2);
    }
    // 赤とんぼ（夕方のみ）
    if (currentModeIs("dusk")) {
      const d = this.dragonfly;
      if (d.x > camX - 10 && d.x < camX + VW + 10) {
        g.fillStyle = "rgb(200,70,50)";
        g.fillRect(d.x - camX | 0, d.y | 0, 3, 1);
        if (Math.sin(t * 30) > 0) { g.fillStyle = "rgba(240,240,240,0.7)"; g.fillRect((d.x - camX | 0), (d.y | 0) - 1, 1, 1); g.fillRect((d.x - camX | 0) + 2, (d.y | 0) - 1, 1, 1); }
      }
    }
    // すすき（動的・原っぱ）
    if (camX + VW > MEADOW_X - 40) {
      const c1 = rgbs(gradedInkNow("susuki")), c2 = rgbs(gradedInkNow("susuki2"));
      for (let i = 0; i < 60; i++) {
        const wx = MEADOW_X + ((i * 137) % (WORLD_W - MEADOW_X - 30));
        if (wx < camX - 10 || wx > camX + VW + 10) continue;
        const baseY = PATH_TOP - 2 - ((i * 53) % 46);
        const hgt = 12 + ((i * 29) % 8);
        const sway = windAt(wx, t) * 3 + Math.sin(t * 1.7 + i) * 1.2;
        const x = wx - camX;
        drawPixelLine(g, x, baseY, x + sway * 0.6, baseY - hgt * 0.6, c2);
        drawPixelLine(g, x + sway * 0.6, baseY - hgt * 0.6, x + sway, baseY - hgt, c2);
        g.fillStyle = c1;
        g.fillRect(x + sway | 0, baseY - hgt - 3, 2, 4);
      }
    }
    // 道ばたの草（動的）
    const gc = rgbs(shade(sceneC3("grass", 2), 0.8));
    for (let i = 0; i < 200; i++) {
      const wx = (i * 16.3 + ((i * 73) % 9)) % WORLD_W;
      if (wx < camX - 6 || wx > camX + VW + 6) continue;
      const baseY = PATH_TOP - 1 - ((i * 31) % 5);
      const hgt = 4 + ((i * 17) % 5);
      const sway = windAt(wx, t) * 2.6 + Math.sin(t * 2.1 + i * 1.7) * 0.9;
      drawPixelLine(g, wx - camX, baseY, wx - camX + sway, baseY - hgt, gc);
    }
    // 前景
    blitLayer(g, "fg", -(camX * 1.3) | 0, VH - 18);
  },

  /* ---------- インタラクション ---------- */
  actionAt(px, sitting) {
    if (sitting) {
      return { type: "stand", label: sitting.type === "swing" ? "ブランコからおりる" : "たちあがる" };
    }
    const near = (x, r) => Math.abs(px - x) <= r;
    if (near(CAT_X + 6, 8)) return { type: "cat", label: "ねこをなでる" };
    for (const bx of BENCHES) if (near(bx, 16)) return { type: "bench", x: bx - 5, label: "ベンチにこしかける" };
    if (near(VEND_X, 14)) return { type: "vending", label: "ジュースをかう" };
    if (near(FOUNTAIN_X, 12)) return { type: "fountain", label: "みずをのむ" };
    if (near(SWING_X, 16)) return { type: "swing", label: "ブランコにのる" };
    if (px > POND.x1 - 20 && px < POND.x2 + 20) return { type: "pond", label: "こいしをなげる" };
    if (px > MEADOW_X) return { type: "grass", label: "くさはらにすわる" };
    return null;
  },
};

/* ---- ピクセル描画ユーティリティ ---- */
function fillPixelCircle(g, cx, cy, r) {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
    g.fillRect((cx - half) | 0, (cy + y) | 0, half * 2 + 1, 1);
  }
}
function fillPixelEllipse(g, cx, cy, rx, ry) {
  for (let y = -ry; y <= ry; y++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y / ry) * (y / ry))));
    g.fillRect((cx - half) | 0, (cy + y) | 0, half * 2 + 1, 1);
  }
}
function drawPixelLine(g, x0, y0, x1, y1, color) {
  g.fillStyle = color;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
  for (let i = 0; i <= steps; i++) {
    const f = steps === 0 ? 0 : i / steps;
    g.fillRect((x0 + (x1 - x0) * f) | 0, (y0 + (y1 - y0) * f) | 0, 1, 1);
  }
}
function treeSpriteOf(set, tr) {
  if (tr.kind === "cherry") return set.cherry;
  if (tr.kind === "big") return set.bigTree;
  return set.trees[tr.kind];
}
function treeSprite(tr) { return treeSpriteOf(SPRITES[MIX.from], tr); }
