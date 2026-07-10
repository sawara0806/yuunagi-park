"use strict";
/* ============================================================
   main.js — ループ・カメラ・入力・時間帯・UI
   ============================================================ */

let SPRITES = null, LAYERS = null, GRADED = {};
const MIX = { from: "day", to: "day", t: 1 };

/* ---- モード間の数値/色lerpヘルパ ---- */
function sceneN(key) {
  return PAL[MIX.from][key] + (PAL[MIX.to][key] - PAL[MIX.from][key]) * MIX.t;
}
function sceneN2(key, sub) {
  return PAL[MIX.from][key][sub] + (PAL[MIX.to][key][sub] - PAL[MIX.from][key][sub]) * MIX.t;
}
function sceneV2(key) {
  const a = PAL[MIX.from][key], b = PAL[MIX.to][key];
  return [a[0] + (b[0] - a[0]) * MIX.t, a[1] + (b[1] - a[1]) * MIX.t];
}
function sceneC3(key, idx) {
  let a = PAL[MIX.from][key], b = PAL[MIX.to][key];
  if (idx !== undefined) { a = a[idx]; b = b[idx]; }
  return MIX.t >= 1 ? b : lerpC(a, b, MIX.t);
}
const sceneC = sceneC3;
function gradedInkNow(name) {
  const a = GRADED[MIX.from][name], b = GRADED[MIX.to][name];
  return MIX.t >= 1 ? b : lerpC(a, b, MIX.t);
}
function currentModeIs(m) { return MIX.to === m; }

/* ---- クロスフェード描画 ---- */
function blitLayer(g, name, x, y) {
  g.drawImage(LAYERS[MIX.from][name], x, y);
  if (MIX.t < 1) {
    g.globalAlpha = MIX.t;
    g.drawImage(LAYERS[MIX.to][name], x, y);
    g.globalAlpha = 1;
  }
}
function drawMixPick(g, pick, x, y) {
  g.drawImage(pick(SPRITES[MIX.from]), x | 0, y | 0);
  if (MIX.t < 1) {
    g.globalAlpha = MIX.t;
    g.drawImage(pick(SPRITES[MIX.to]), x | 0, y | 0);
    g.globalAlpha = 1;
  }
}
function mixPlayer(pick) {
  return g => {
    g.drawImage(pick(SPRITES[MIX.from].player), 0, 0);
    if (MIX.t < 1) {
      g.globalAlpha = MIX.t;
      g.drawImage(pick(SPRITES[MIX.to].player), 0, 0);
      g.globalAlpha = 1;
    }
  };
}
function pickPlayerSet() { return SPRITES[MIX.from].player; }

/* ---- 時間帯 ---- */
function setMode(m, opts) {
  if (m === MIX.to) return;
  MIX.from = MIX.t >= 1 ? MIX.to : MIX.from;
  MIX.to = m;
  MIX.t = 0;
  document.querySelectorAll("#ui [data-mode]").forEach(b =>
    b.classList.toggle("active", b.dataset.mode === m));
  if (m === "dusk" && !(opts && opts.silent)) AUDIO.chime();
}
function initialMode() {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return "morning";
  if (h >= 10 && h < 16) return "day";
  if (h >= 16 && h < 19) return "dusk";
  return "night";
}

/* ---- キャンバス ---- */
const screenCvs = document.getElementById("screen");
const G = screenCvs.getContext("2d");
G.imageSmoothingEnabled = false;

function fitScreen() {
  const vw = window.innerWidth, vh = window.innerHeight;
  // 2倍以上とれるときは整数スケールでドットを揃え、
  // 小さい画面では画面いっぱいを優先する
  let scale = Math.min(vw / VW, vh / VH);
  if (scale >= 2) scale = Math.floor(scale);
  screenCvs.style.width = VW * scale + "px";
  screenCvs.style.height = VH * scale + "px";
}
window.addEventListener("resize", fitScreen);

/* ---- 入力 ---- */
const heldPointers = new Map(); // pointerId -> "L" | "R"
function refreshPointerMove() {
  let l = false, r = false;
  for (const v of heldPointers.values()) { if (v === "L") l = true; if (v === "R") r = true; }
  PLAYER.moveL = l || keys.has("left");
  PLAYER.moveR = r || keys.has("right");
}
const keys = new Set();
window.addEventListener("keydown", e => {
  if (e.repeat) return;
  const k = e.key;
  if (k === "ArrowLeft" || k === "a" || k === "A") { keys.add("left"); refreshPointerMove(); }
  if (k === "ArrowRight" || k === "d" || k === "D") { keys.add("right"); refreshPointerMove(); }
  if (k === "e" || k === "E" || k === "ArrowUp" || k === " " || k === "Enter") {
    if (document.getElementById("entrance").classList.contains("closed")) {
      e.preventDefault();
      PLAYER.interact();
    }
  }
});
window.addEventListener("keyup", e => {
  const k = e.key;
  if (k === "ArrowLeft" || k === "a" || k === "A") { keys.delete("left"); refreshPointerMove(); }
  if (k === "ArrowRight" || k === "d" || k === "D") { keys.delete("right"); refreshPointerMove(); }
});
screenCvs.addEventListener("pointerdown", e => {
  const rect = screenCvs.getBoundingClientRect();
  const fx = (e.clientX - rect.left) / rect.width;
  if (fx < 0.38) { heldPointers.set(e.pointerId, "L"); refreshPointerMove(); }
  else if (fx > 0.62) { heldPointers.set(e.pointerId, "R"); refreshPointerMove(); }
  else PLAYER.interact();
  screenCvs.setPointerCapture(e.pointerId);
});
const releasePointer = e => { heldPointers.delete(e.pointerId); refreshPointerMove(); };
screenCvs.addEventListener("pointerup", releasePointer);
screenCvs.addEventListener("pointercancel", releasePointer);

/* ---- ヒント表示 ---- */
const hintEl = document.getElementById("hint");
const IS_TOUCH = window.matchMedia("(pointer: coarse)").matches;
let lastHint = "";
function updateHint() {
  const act = World.actionAt(PLAYER.x, PLAYER.sitting);
  const key = IS_TOUCH ? "まんなかをタップ" : "E";
  const label = act ? `${key} ─ ${act.label}` : "";
  if (label !== lastHint) {
    lastHint = label;
    hintEl.textContent = label;
    hintEl.classList.toggle("show", !!label);
  }
}

/* ---- メインループ ---- */
let camX = 0, last = 0, started = false;
function tick(dt, now) {
  const t = now / 1000;
  if (MIX.t < 1) {
    MIX.t = Math.min(1, MIX.t + dt / 2.4);
    if (MIX.t >= 1) MIX.from = MIX.to;
  }
  PLAYER.update(dt, t);
  World.update(dt, t, PLAYER.x, MIX.to);
  AUDIO.update(dt, PLAYER.x, windAt(PLAYER.x, t), MIX.to, PLAYER.sitting);

  const target = Math.max(0, Math.min(WORLD_W - VW, PLAYER.x - VW / 2 + PLAYER.dir * 24));
  camX += (target - camX) * Math.min(1, dt * 2.0);

  G.clearRect(0, 0, VW, VH);
  World.drawBackdrop(G, camX, t);
  World.drawScene(G, camX, t);
  PLAYER.draw(G, camX, t);
  World.drawForeground(G, camX, t);
  updateHint();
}
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  tick(dt, now);
  requestAnimationFrame(frame);
}

/* ---- 起動 ---- */
function boot() {
  SPRITES = buildAllSprites();
  LAYERS = buildAllLayers();
  for (const m of MODES) GRADED[m] = gradedInk(m);
  World.init();
  const m = initialMode();
  MIX.from = m; MIX.to = m; MIX.t = 1;
  document.querySelectorAll("#ui [data-mode]").forEach(b =>
    b.classList.toggle("active", b.dataset.mode === m));
  fitScreen();
  last = performance.now();
  requestAnimationFrame(frame);
}

document.getElementById("enter-btn").addEventListener("click", () => {
  document.getElementById("entrance").classList.add("closed");
  try {
    AUDIO.init();
    AUDIO.setOn(true);
    document.getElementById("sound-btn").classList.add("active");
    document.getElementById("sound-btn").textContent = "音";
  } catch (err) { /* 音が使えなくても入園はできる */ }
  started = true;
});
document.getElementById("sound-btn").addEventListener("click", () => {
  try { AUDIO.init(); } catch (err) { return; }
  AUDIO.setOn(!AUDIO.on);
  document.getElementById("sound-btn").classList.toggle("active", AUDIO.on);
});
document.querySelectorAll("#ui [data-mode]").forEach(b =>
  b.addEventListener("click", () => setMode(b.dataset.mode)));

boot();

/* 検証・デバッグ用フック */
window.PARK = {
  player: PLAYER, world: World, mix: MIX,
  setMode: m => setMode(m, { silent: true }),
  step(n, dt) {
    dt = dt || 1 / 60;
    for (let i = 0; i < (n || 1); i++) {
      last += dt * 1000;
      tick(dt, last);
    }
  },
};
