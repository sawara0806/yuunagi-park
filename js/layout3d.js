"use strict";
/* ============================================================
   layout3d.js — 公園と周辺の「配置」を集約した唯一の設計図
   全ての座標はここが単一の真実（Single Source of Truth）。
   assets3d.js（地面の焼き込み影・コライダ半径含む）と
   park3d.js（シーン組立・コライダ・座席アンカー）の両方がここを参照する。
   値は旧 assets3d.js の定数 L・buildFloorTex・buildScene のハードコードから
   **一切変更せず**移設したもの（node上のbuildAssets実行検証で確認済み）。

   物の座標を動かすときは、このファイルの該当エントリだけを直せばよい。
   影・コライダ・シーン・座席アンカーはここから自動導出される
   （旧CLAUDE.md §3-4「Lと影とコライダの3箇所を揃える」ルールは廃止）。
   ============================================================ */

const FENCE_R = 9.8;          // 外周フェンスの半幅（原点からの距離）
const GATE_X1 = -1.5, GATE_X2 = 1.5;   // 南のフェンスの切れ目（入口）

const LAYOUT = {
  /* ---------- 地面テクスチャが参照する領域・点 ---------- */
  ground: {
    plaza: { x: 0, z: 0, r: 5.68 },   // 砂地の円形広場
    beds: {
      /* 大木の根元の植え込み（円形）。ヤブラン環はここに紐づける */
      treeBed: {
        type: "circle", x: 2.6, z: -0.4, r: 2.35,
        liriopeRing: { n: 11, phase: 0.3, rBase: 1.15, rStep: 0.42, zSquash: 0.9 },
      },
      /* 西側の花壇（矩形）。低木/サツキの列と縁のヤブラン列を含む */
      westBed: {
        type: "rect", x1: -9.4, z1: -4.2, x2: -7.7, z2: 5.2,
        /* 花壇まわりの当たり判定（花壇全体を3つの円で近似） */
        colliders: [
          { x: -8.5, z: -3, r: 1.1 },
          { x: -8.5, z: 0.5, r: 1.1 },
          { x: -8.5, z: 4, r: 1.1 },
        ],
        /* 縁のヤブラン列（生成的な群れ） */
        liriopeRow: { x: -8.0, z0: -2.4, dz: 2.0, n: 4, palOffset: 1 },
      },
    },
    northSoil: { z1: -9.15 },     // 北側フェンス際の植栽帯の土（z2 は fence から導出）
    fence: FENCE_R,                // 外周値（柵の壁もこれを参照）
    gate: { x1: GATE_X1, x2: GATE_X2 },      // 南の切れ目のx範囲
    gatePath: { z1: 10.0, z2: 14.2 },        // 入口前の通路
    parking: {                     // コンビニ前の駐車場
      x1: 15.2, x2: 17.2, z1: -0.5, z2: 8.5,
      lineZ: [2.3, 5.3],           // 白線のz位置
    },
    puddles: [                     // 雨の水たまり5箇所（固定座標）
      { x: 1.2, z: 2.0, rx: 1.1, rz: 0.6 },
      { x: -4.5, z: 4.4, rx: 0.8, rz: 0.5 },
      { x: 5.8, z: -3.2, rx: 0.9, rz: 0.5 },
      { x: -2.2, z: -5.6, rx: 0.7, rz: 0.4 },
      { x: 7.4, z: 5.9, rx: 0.6, rz: 0.4 },
    ],
  },

  /* ---------- 木 ---------- */
  trees: [
    { x: 2.6,  z: -0.6, big: 1 },   // 写真右の大木（植え込みの中）
    { x: -6.6, z: -3.4, big: 1 },
    { x: 7.4,  z: -6.2, big: 0 },
    { x: -5.8, z: -8.6, big: 0 },
    { x: 7.0,  z: 4.2,  big: 0 },
  ],
  /* 園外の街路樹（植樹帯 border≈10.9 と 南の遠い緑地帯 z≈16） */
  streetTrees: [
    { x: -8.0, z: -10.9, big: 0 }, { x: -2.0, z: -10.9, big: 1 }, { x: 4.5, z: -10.9, big: 0 },
    { x: 10.9, z: -6.5, big: 0 }, { x: 10.9, z: 0.5, big: 1 }, { x: 10.9, z: 6.5, big: 0 },
    { x: -10.9, z: -4.0, big: 0 }, { x: -10.9, z: 3.0, big: 0 },
    { x: -6.0, z: 16.2, big: 1 }, { x: 5.0, z: 16.0, big: 0 },
    { x: 12.0, z: 16.4, big: 1 }, { x: -13.0, z: 15.8, big: 0 },
    { x: 16.5, z: -2.5, big: 1 }, { x: 17.5, z: 4.5, big: 0 },  // 開けた東側の奥
  ],

  /* ---------- ベンチ（cat:"sleep" のベンチには寝ネコが乗る） ---------- */
  benchZ: -7.35,
  benches: [{ x: -3.2 }, { x: 1.6, cat: "sleep" }],

  /* ---------- 生け垣（北側・東側）。shadow は地面焼き込み用の接地影の矩形 ---------- */
  hedges: [
    { x1: -9.4, z1: -9.35, x2: 9.4, z2: -9.35, h: 1.25, tex: "hedge", texLen: 2,
      shadow: { x1: -9.4, z1: -9.34, x2: 9.4, z2: -8.98 } },
    { x1: 9.35, z1: -8.5, x2: 9.35, z2: -1.5, h: 1.25, tex: "hedge", texLen: 2,
      shadow: { x1: 9.0, z1: -8.5, x2: 9.34, z2: -1.5 } },
  ],
  /* 外周フェンス4辺（南は門の切れ目で2本に分かれる） */
  fences: [
    { x1: -FENCE_R, z1: -FENCE_R, x2: FENCE_R, z2: -FENCE_R, h: 1.5, tex: "fence", texLen: 2 },
    { x1: FENCE_R, z1: -FENCE_R, x2: FENCE_R, z2: FENCE_R, h: 1.5, tex: "fence", texLen: 2 },
    { x1: -FENCE_R, z1: FENCE_R, x2: -FENCE_R, z2: -FENCE_R, h: 1.5, tex: "fence", texLen: 2 },
    { x1: -FENCE_R, z1: FENCE_R, x2: GATE_X1, z2: FENCE_R, h: 1.5, tex: "fence", texLen: 2 },
    { x1: GATE_X2, z1: FENCE_R, x2: FENCE_R, z2: FENCE_R, h: 1.5, tex: "fence", texLen: 2 },
  ],
  /* 緑のネットフェンス */
  meshPanels: [
    { x1: 0.5, z1: -9.7, x2: 6.5, z2: -9.7, h: 1.8, tex: "mesh", texLen: 2 },
  ],
  /* 電柱2本と電線の張り渡し */
  wires: {
    poles: [{ x: -8, z: 14.1 }, { x: 8, z: 14.1 }],
    wire: { x1: -8, z1: 14.1, x2: 8, z2: 14.1, h: 6.55, y0: 5.25, tex: "wires", texLen: 16 },
  },

  /* ---------- 建物（正面 + sideDepth から側面壁を自動生成）
       sideDepth: 正面の進行方向を-90°回転した法線方向への奥行き（符号つき）。
       sides: "x1"|"x2" を指定すると片側だけ生成（南の家並み2棟は道側が開いている）。
       側面が無いもの（東の遠い家並み）は sideDepth を省略 ---------- */
  buildings: [
    { tex: "aptCream", sideTex: "sideCream", x1: -13.5, z1: -14.5, x2: 1.5, z2: -14.5, h: 6.8, sideDepth: 6.5 },
    { tex: "aptWhite", sideTex: "sideWhite", x1: 3.5, z1: -18, x2: 15.5, z2: -18, h: 7.4, sideDepth: 6.5 },
    { tex: "house", sideTex: "sideGray", x1: -14.8, z1: 4.5, x2: -14.8, z2: -5.5, h: 5.4, sideDepth: 5.2 },
    { tex: "housesFar", sideTex: "sideGray", x1: -18, z1: 24, x2: 0, z2: 24, h: 5.6, sideDepth: -6, sides: "x1" },
    { tex: "housesFar", sideTex: "sideGray", x1: 1, z1: 24.5, x2: 19, z2: 24.5, h: 5.6, sideDepth: -5.5, sides: "x2" },
    /* 東の遠くに低い家並み（霞んで見える・側面なし） */
    { tex: "housesFar", x1: 25, z1: -10, x2: 25, z2: 10, h: 4.8, texLen: 18 },
  ],

  /* ---------- 型付き構造物 ---------- */
  structures: {
    toilet: {                       // 公衆トイレ（北西の角）
      x1: -9.0, x2: -6.2, z1: -9.2, z2: -7.0, y0: 0, y1: 2.6,
      texS: "toiletFront", texN: "toiletBack", texE: "toiletSide", texW: "toiletSide",
      colliders: [{ x: -8.3, z: -8.1, r: 1.05 }, { x: -6.9, z: -8.1, r: 1.05 }],
      shadow: { x1: -8.8, z1: -6.95, x2: -5.7, z2: -6.3 },
    },
    sign: {                         // 公園の掲示板
      x1: 6.6, x2: 7.55, z1: 8.38, z2: 8.46, y0: 0, y1: 1.65,
      texFront: "sign", texBack: "signBack", texEnd: "leg",
      collider: { x: 7.1, z: 8.42, r: 0.5 },
    },
    /* コンビニ（東の開けた側・園外）。建物と同じ正面+sideDepthの形 */
    konbini: {
      tex: "konbini", sideTex: "konbiniSide",
      x1: 17.2, z1: -0.5, x2: 17.2, z2: 8.5, h: 3.4, sideDepth: 5.8,
    },
    smokingArea: {                  // 喫煙所（コンビニの南隣・園外）
      panel: { x1: 15.9, z1: 9.8, x2: 18.3, z2: 9.8, h: 1.7, tex: "smokePanel" },
      ashtray: { x: 17.1, z: 9.3 },
    },
  },

  /* ---------- 単体スプライトの小物（type→レジストリで展開。rはコライダ半径） ---------- */
  props: [
    { type: "lamp", x: 4.6, z: 3.6, r: 0.25 },
    { type: "fountain", x: -7.0, z: 7.0, r: 0.45 },
    { type: "planter", variant: 0, x: -2.7, z: 8.95, r: 0.5 },
    { type: "planter", variant: 1, x: 3.6, z: 9.0, r: 0.5 },
    { type: "bollard", x: -1.25, z: 9.55, r: 0.28 },
    { type: "bollard", x: 1.25, z: 9.55, r: 0.28 },
    /* 園内の隅の低木 */
    { type: "shrub", variant: 0, x: 8.6, z: -8.6, r: 0.5 },
    { type: "shrub", variant: 0, x: 2.4, z: 9.15, r: 0.5 },
    { type: "shrub", variant: 1, x: -8.9, z: 8.8, r: 0.5 },
    /* 西花壇の低木/サツキ列（コライダは westBed.colliders 側にまとめてあるためここでは無し） */
    { type: "shrub", variant: 0, x: -8.55, z: -3.4 },
    { type: "azalea", variant: 0, x: -8.55, z: -1.5 },
    { type: "shrub", variant: 0, x: -8.55, z: 0.4 },
    { type: "azalea", variant: 1, x: -8.55, z: 2.3 },
    { type: "shrub", variant: 0, x: -8.55, z: 4.2 },
    /* 道ばたの雑草（園内の隅とフェンス沿い・園外） */
    { type: "weed", variant: 0, x: 9.55, z: 8.2 },
    { type: "weed", variant: 1, x: 9.5, z: 3.1 },
    { type: "weed", variant: 2, x: 9.55, z: -3.4 },
    { type: "weed", variant: 0, x: -9.5, z: 7.4 },
    { type: "weed", variant: 1, x: -9.55, z: -1.2 },
    { type: "weed", variant: 2, x: -9.5, z: -6.8 },
    { type: "weed", variant: 0, x: 3.2, z: 9.5 },
    { type: "weed", variant: 1, x: -4.8, z: 9.55 },
    { type: "weed", variant: 2, x: 6.9, z: 9.5 },
    { type: "weed", variant: 0, x: -6.6, z: 9.5 },
    { type: "weed", variant: 1, x: -3.9, z: 4.65 },
    { type: "weed", variant: 2, x: 5.05, z: 1.2 },
    { type: "weed", variant: 0, x: 8.9, z: -9.1 },
    { type: "weed", variant: 1, x: 10.15, z: 5.5 },
    { type: "weed", variant: 2, x: 10.2, z: -2.0 },
    { type: "weed", variant: 0, x: -10.15, z: 1.0 },
    { type: "weed", variant: 1, x: -10.2, z: -7.5 },
    { type: "weed", variant: 2, x: 2.2, z: 10.2 },
    { type: "weed", variant: 0, x: -2.6, z: 10.15 },
  ],

  /* ---------- 生き物（propsと同じ型つきリスト。rはコライダ半径） ---------- */
  critters: [
    { type: "pigeon", x: 0.6, z: 1.4 },
    { type: "pigeon", x: -1.9, z: -0.9 },
    { type: "pigeon", x: 1.3, z: -2.4 },
    { type: "catSit", x: 4.2, z: 1.1, r: 0.3 },   // 木陰に座るハチワレ（寝ネコは cat:"sleep" のベンチから導出）
  ],
};
