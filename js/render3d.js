"use strict";
/* ============================================================
   render3d.js — ドット絵ソフトウェアレンダラ
   ・地面: mode7式フロアキャスティング（Uint32テクスチャ直読み）
   ・建物/フェンス/生け垣: 透視補正つきテクスチャ壁（世界に固定）
   ・ベンチ/掲示板: 箱（見える側面＋天面を描く。裏から見ても正しい）
   ・木や茂み: ビルボードスプライト（回転対称な物のみ）
   ・cam.hor で地平線を上下（見上げ/見下ろし = y-shear方式）
   ============================================================ */

const R3 = {
  W: 480, H: 270,
  HOR_BASE: 112,       // 地平線の基準y
  PD: 370,             // 投影距離(px) ≒ FOV66°
  EYE: 1.55,           // 目の高さ(m)
  NEAR: 0.12,
  FAR_HAZE: 62,        // 遠景の霞み距離
  hazeCol: [214, 222, 228],

  cvs: null, g: null, img: null, buf: null,
  floor: null,         // {data:Uint32Array,w,h,ppm,ox,oz,outside:Uint32}
  sky: null,           // canvas（幅 = 2π*PD 相当・yawで横スクロール）

  init(canvas) {
    this.cvs = canvas;
    this.g = canvas.getContext("2d");
    this.g.imageSmoothingEnabled = false;
    this.img = this.g.createImageData(this.W, this.H);
    this.buf = new Uint32Array(this.img.data.buffer);
  },

  /* ---------- 空・雲（yawで横スクロール・地平線に底辺を合わせる） ---------- */
  drawStrip(tex, cam, extraOff, yBottom) {
    const sw = tex.width, sh = tex.height;
    let off = Math.round((cam.yaw / (Math.PI * 2)) * sw + (extraOff || 0)) % sw;
    if (off < 0) off += sw;
    const y = yBottom - sh;
    const w1 = Math.min(this.W, sw - off);
    this.g.drawImage(tex, off, 0, w1, sh, 0, y, w1, sh);
    if (w1 < this.W) this.g.drawImage(tex, 0, 0, this.W - w1, sh, w1, y, this.W - w1, sh);
  },
  drawSky(cam, t) {
    this.drawStrip(this.sky, cam, 0, cam.hor);
    if (cam.hor - this.sky.height > 0) { // 大きく見下ろしたときの上端
      this.g.fillStyle = this.skyTopFill || "rgb(150,196,232)";
      this.g.fillRect(0, 0, this.W, cam.hor - this.sky.height);
    }
    /* 雲はゆっくり流れる（別ストリップ・少し高い位置に） */
    if (this.clouds) this.drawStrip(this.clouds, cam, t * 2.2, cam.hor - 28);
  },

  /* ---------- 地面 ---------- */
  renderFloor(cam) {
    const { W, H, PD, buf } = this;
    const hor = cam.hor;
    const F = this.floor;
    const sn = Math.sin(cam.yaw), cs = Math.cos(cam.yaw);
    const fx = sn, fz = -cs, rxv = cs, rzv = sn;   // 前方/右
    const eye = cam.eye;
    const cx = W / 2;
    const hz = this.hazeCol;
    /* 地平線の行そのもの（最遠）は霞色で埋める。
       ここを描き忘れると前フレームの残骸が1px線になって残る */
    const hzPack = 0xff000000 | (hz[2] << 16) | (hz[1] << 8) | hz[0];
    for (let x = 0, o0 = hor * W; x < W; x++) buf[o0 + x] = hzPack;
    for (let y = hor + 1; y < H; y++) {
      const row = y - hor;
      const dist = (eye * PD) / row;
      let f = dist / this.FAR_HAZE;
      if (f > 0.8) f = 0.8;
      const fi = (f * 256) | 0, fo = 256 - fi;
      const hzr = hz[0] * fi, hzg = hz[1] * fi, hzb = hz[2] * fi;
      let wx = cam.x + fx * dist + rxv * ((0 - cx) / PD) * dist;
      let wz = cam.z + fz * dist + rzv * ((0 - cx) / PD) * dist;
      const dwx = rxv * dist / PD, dwz = rzv * dist / PD;
      let o = y * W;
      for (let x = 0; x < W; x++, o++) {
        const tx = ((wx - F.ox) * F.ppm) | 0;
        const tz = ((wz - F.oz) * F.ppm) | 0;
        let c;
        if (tx < 0 || tz < 0 || tx >= F.w || tz >= F.h) c = F.outside;
        else c = F.data[tz * F.w + tx];
        const r = ((c & 255) * fo + hzr) >> 8;
        const g2 = (((c >> 8) & 255) * fo + hzg) >> 8;
        const b = (((c >> 16) & 255) * fo + hzb) >> 8;
        buf[o] = 0xff000000 | (b << 16) | (g2 << 8) | r;
        wx += dwx; wz += dwz;
      }
    }
    if (hor < H) this.g.putImageData(this.img, 0, 0, 0, hor, W, H - hor);
  },

  /* ---------- カメラ空間変換 ---------- */
  toCam(cam, x, z) {
    const dx = x - cam.x, dz = z - cam.z;
    const sn = Math.sin(cam.yaw), cs = Math.cos(cam.yaw);
    return [dx * cs + dz * sn, dx * sn - dz * cs]; // [rx, rz] rz>0が前方
  },

  /* ---------- 壁（透視補正・列ごとにテクスチャを縦引き） ---------- */
  drawWall(cam, wall) {
    const { W, PD, g } = this;
    const hor = cam.hor;
    const eye = cam.eye;
    let [rx1, rz1] = this.toCam(cam, wall.x1, wall.z1);
    let [rx2, rz2] = this.toCam(cam, wall.x2, wall.z2);
    const len = Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
    /* u0: 分割された壁がテクスチャの続きから貼れるようにするオフセット(m) */
    const u0 = wall.u0 || 0;
    let u1 = u0, u2 = u0 + len;
    if (rz1 <= this.NEAR && rz2 <= this.NEAR) return;
    if (rz1 <= this.NEAR) {
      const t = (this.NEAR - rz1) / (rz2 - rz1);
      rx1 += (rx2 - rx1) * t; u1 += (u2 - u1) * t; rz1 = this.NEAR;
    } else if (rz2 <= this.NEAR) {
      const t = (this.NEAR - rz2) / (rz1 - rz2);
      rx2 += (rx1 - rx2) * t; u2 += (u1 - u2) * t; rz2 = this.NEAR;
    }
    let sx1 = W / 2 + (rx1 / rz1) * PD;
    let sx2 = W / 2 + (rx2 / rz2) * PD;
    if (sx1 > sx2) {
      [sx1, sx2] = [sx2, sx1];
      [rz1, rz2] = [rz2, rz1];
      [u1, u2] = [u2, u1];
    }
    const ix1 = Math.max(0, Math.ceil(sx1));
    const ix2 = Math.min(W - 1, Math.floor(sx2));
    if (ix2 < ix1) return;
    const iz1 = 1 / rz1, iz2 = 1 / rz2;
    const uz1 = u1 * iz1, uz2 = u2 * iz2;
    const span = sx2 - sx1;
    const tex = wall.tex, tw = tex.width, th = tex.height;
    const ppmU = tw / (wall.texLen || len);
    const hTop = wall.h - eye, hBot = eye - (wall.y0 || 0);
    for (let x = ix1; x <= ix2; x++) {
      const f = span === 0 ? 0 : (x - sx1) / span;
      const iz = iz1 + (iz2 - iz1) * f;
      const u = (uz1 + (uz2 - uz1) * f) / iz;
      let tu = ((u * ppmU) | 0) % tw;
      if (tu < 0) tu += tw;
      const yTop = hor - hTop * PD * iz;
      const yBot = hor + hBot * PD * iz;
      if (yBot < 0 || yTop > this.H) continue;
      g.drawImage(tex, tu, 0, 1, th, x, yTop, 1, yBot - yTop);
    }
  },

  /* ---------- 箱（見える側面＋天面） ---------- */
  drawBox(cam, b) {
    const eye = cam.eye;
    const sNS = b.side, sEW = b.sideEnd || b.side;
    /* 外向きの面だけを描く（裏表の矛盾が出ない） */
    if (cam.z < b.z1) this.drawWall(cam, { x1: b.x1, z1: b.z1, x2: b.x2, z2: b.z1, h: b.y1, y0: b.y0, tex: b.sideN || sNS });
    if (cam.z > b.z2) this.drawWall(cam, { x1: b.x1, z1: b.z2, x2: b.x2, z2: b.z2, h: b.y1, y0: b.y0, tex: b.sideS || sNS });
    if (cam.x < b.x1) this.drawWall(cam, { x1: b.x1, z1: b.z1, x2: b.x1, z2: b.z2, h: b.y1, y0: b.y0, tex: b.sideW || sEW });
    if (cam.x > b.x2) this.drawWall(cam, { x1: b.x2, z1: b.z1, x2: b.x2, z2: b.z2, h: b.y1, y0: b.y0, tex: b.sideE || sEW });
    if (b.top && eye > b.y1) this.drawBoxTop(cam, b);
  },

  drawBoxTop(cam, b) {
    const { W, H, PD, g } = this;
    const hor = cam.hor;
    const eye = cam.eye;
    const hgt = eye - b.y1;
    const corners = [[b.x1, b.z1], [b.x2, b.z1], [b.x2, b.z2], [b.x1, b.z2]];
    const pts = [];
    for (const [x, z] of corners) {
      const [rx, rz] = this.toCam(cam, x, z);
      if (rz <= this.NEAR) return;                 // 近すぎる時は天面を省略
      pts.push([W / 2 + (rx / rz) * PD, hor + (hgt * PD) / rz]);
    }
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    minY = Math.max(0, Math.ceil(minY));
    maxY = Math.min(H - 1, Math.floor(maxY));
    /* 走査線で凸四角形を塗る */
    const sn = Math.sin(cam.yaw), cs = Math.cos(cam.yaw);
    const fx = sn, fz = -cs, rxv = cs, rzv = sn;
    const top = b.top;
    for (let y = minY; y <= maxY; y++) {
      let xa = Infinity, xb = -Infinity;
      for (let i = 0; i < 4; i++) {
        const p = pts[i], q = pts[(i + 1) & 3];
        if ((p[1] <= y && q[1] >= y) || (q[1] <= y && p[1] >= y)) {
          const dy = q[1] - p[1];
          const x = Math.abs(dy) < 0.0001 ? p[0] : p[0] + (q[0] - p[0]) * (y - p[1]) / dy;
          xa = Math.min(xa, x); xb = Math.max(xb, x);
        }
      }
      if (xb < xa) continue;
      const x0 = Math.max(0, Math.ceil(xa)), x1 = Math.min(W - 1, Math.floor(xb));
      if (x1 < x0) continue;
      if (!top.boards) {
        g.fillStyle = top.colS;
        g.fillRect(x0, y, x1 - x0 + 1, 1);
        continue;
      }
      /* 板のすき間（gapAxis方向の座標で色分け） */
      const dist = (hgt * PD) / (y - hor);
      const wx0 = cam.x + fx * dist + rxv * ((x0 - W / 2) / PD) * dist;
      const wz0 = cam.z + fz * dist + rzv * ((x0 - W / 2) / PD) * dist;
      const dwx = rxv * dist / PD, dwz = rzv * dist / PD;
      let wc = top.gapAxis === "z" ? wz0 : wx0;
      const dwc = top.gapAxis === "z" ? dwz : dwx;
      const c0 = top.gapAxis === "z" ? b.z1 : b.x1;
      const c1 = top.gapAxis === "z" ? b.z2 : b.x2;
      const bw = (c1 - c0) / top.boards;
      for (let x = x0; x <= x1; x++, wc += dwc) {
        const fb = (wc - c0) / bw;
        const frac = fb - Math.floor(fb);
        g.fillStyle = (frac < 0.12 && fb > 0.2 && fb < top.boards - 0.2) ? top.colGap : top.colS;
        g.fillRect(x, y, 1, 1);
      }
    }
  },

  /* ---------- ビルボード ---------- */
  drawBillboard(cam, sp) {
    const { W, PD, g } = this;
    const hor = cam.hor;
    const eye = cam.eye;
    const [rx, rz] = this.toCam(cam, sp.x, sp.z);
    if (rz <= this.NEAR) return;
    const scale = PD / rz;
    const wpx = sp.w * scale, hpx = sp.h * scale;
    const cxs = W / 2 + (rx / rz) * PD;
    const yBot = hor + (eye - (sp.y0 || 0)) * scale;
    if (cxs + wpx / 2 < 0 || cxs - wpx / 2 > W) return;
    g.drawImage(sp.img, cxs - wpx / 2, yBot - hpx, wpx, hpx);
  },

  /* ---------- シーン一括描画 ---------- */
  render(camIn, walls, boxes, sprites, t) {
    /* horが小数のままだとフロアの書き込み行がずれるので必ず整数化 */
    const cam = {
      x: camIn.x, z: camIn.z, yaw: camIn.yaw,
      eye: camIn.eye, hor: Math.round(camIn.hor),
    };
    this.g.imageSmoothingEnabled = false;
    this.drawSky(cam, t || 0);
    this.renderFloor(cam);
    const items = [];
    for (const w of walls) {
      const [, rz] = this.toCam(cam, (w.x1 + w.x2) / 2, (w.z1 + w.z2) / 2);
      items.push({ d: rz, wall: w });
    }
    for (const b of boxes) {
      const [, rz] = this.toCam(cam, (b.x1 + b.x2) / 2, (b.z1 + b.z2) / 2);
      items.push({ d: rz, box: b });
    }
    for (const s of sprites) {
      const [, rz] = this.toCam(cam, s.x, s.z);
      if (rz > this.NEAR) items.push({ d: rz, sp: s });
    }
    items.sort((a, b) => b.d - a.d);
    for (const it of items) {
      if (it.wall) this.drawWall(cam, it.wall);
      else if (it.box) this.drawBox(cam, it.box);
      else this.drawBillboard(cam, it.sp);
    }
  },
};
