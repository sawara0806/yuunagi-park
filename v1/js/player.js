"use strict";
/* ============================================================
   player.js — 主人公：ゆっくり歩く・こしかける・ふれる
   ============================================================ */

const PLAYER = {
  x: 90, dir: 1,
  moveL: false, moveR: false,
  walking: false, walkT: 0,
  sitting: null,           // {type, x, y}
  holdCan: false, drinkT: 0,
  blinkT: 3, blinking: 0,
  stepT: 0,
  speed: 34,

  update(dt, t) {
    if (this.sitting) {
      this.walking = false;
      if (this.holdCan) {
        this.drinkT -= dt;
        if (this.drinkT < -3) this.drinkT = 2.2; // ときどき一口
      }
    } else {
      const mv = (this.moveR ? 1 : 0) - (this.moveL ? 1 : 0);
      this.walking = mv !== 0;
      if (this.walking) {
        this.dir = mv;
        this.x = Math.max(24, Math.min(WORLD_W - 24, this.x + mv * this.speed * dt));
        this.walkT += dt;
        this.stepT -= dt;
        if (this.stepT <= 0) {
          this.stepT = 0.36;
          if (typeof AUDIO !== "undefined") AUDIO.footstep();
        }
      } else {
        this.walkT = 0; this.stepT = 0.1;
      }
    }
    // まばたき
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinking = 0.14; this.blinkT = 2.5 + Math.random() * 3.5; }
    if (this.blinking > 0) this.blinking -= dt;
  },

  /* 現在地でできることを実行 */
  interact() {
    const act = World.actionAt(this.x, this.sitting);
    if (!act) return;
    switch (act.type) {
      case "stand":
        this.sitting = null;
        break;
      case "bench":
        this.sitting = { type: "bench", x: act.x, y: PROP_BASE - 2 };
        this.x = act.x;
        break;
      case "grass":
        this.sitting = { type: "grass", x: this.x, y: PATH_TOP + 4 };
        break;
      case "swing":
        this.sitting = { type: "swing", x: SWING_X, y: 0 };
        this.x = SWING_X;
        break;
      case "cat":
        World.catTwitch = 0.9;
        if (typeof AUDIO !== "undefined") AUDIO.purr();
        break;
      case "vending":
        this.holdCan = true; this.drinkT = 4;
        if (typeof AUDIO !== "undefined") AUDIO.vendThunk();
        break;
      case "fountain":
        World.stream = 1.4;
        if (typeof AUDIO !== "undefined") AUDIO.waterSip();
        break;
      case "pond":
        World.throwPebble(this.x, this.dir);
        break;
    }
    return act.type;
  },

  draw(g, camX, t) {
    const spr = pickPlayerSet();
    const wind = windAt(this.x, t);
    g.save();
    if (this.sitting && this.sitting.type === "swing") {
      // ブランコに座る（揺れに追従）
      const ang = World.swingAngle;
      const pivX = SWING_X - camX, pivY = PROP_BASE - 28;
      const sx = pivX + Math.sin(ang) * 19, sy = pivY + Math.cos(ang) * 19;
      this.blitBody(g, spr, "sit", sx | 0, (sy - 13) | 0, t, wind);
    } else if (this.sitting) {
      const sx = this.sitting.x - camX;
      const bottom = this.sitting.type === "bench" ? PROP_BASE - 2 : PATH_TOP + 6;
      this.blitBody(g, spr, "sit", sx | 0, bottom - 15, t, wind);
    } else {
      const bob = this.walking && (((this.walkT * 6) | 0) % 4 === 2) ? -1 : 0;
      const frame = this.walking ? "walk" + (((this.walkT * 6) | 0) % 4) : "idle";
      this.blitBody(g, spr, frame, (this.x - camX) | 0, FEET_Y - 18 + bob, t, wind);
    }
    g.restore();
  },

  /* 中心x基準で反転を処理して描く */
  blitBody(g, spr, frame, cx, top, t, wind) {
    const img =
      frame === "sit" ? mixPlayer(p => p.sit) :
      frame === "idle" ? mixPlayer(p => p.idle) :
      mixPlayer(p => p.walk[+frame.slice(4)]);
    const w = 12;
    g.save();
    g.translate(cx, top);
    if (this.dir < 0) g.scale(-1, 1);
    g.translate(-w / 2, 0);
    img(g);
    // まばたき（目を肌色で上書き）
    if (this.blinking > 0) {
      g.fillStyle = rgbs(gradedInkNow("skin"));
      g.fillRect(PLAYER_EYE.x, PLAYER_EYE.y, 1, 1);
    }
    // 髪のなびき
    if (wind > 0.5) {
      g.fillStyle = rgba(gradedInkNow("hair"), Math.min(1, (wind - 0.5) * 2));
      g.fillRect(2, 1, 1, 1);
      if (wind > 0.75) g.fillRect(1, 2, 1, 1);
    }
    // 缶
    if (this.holdCan) {
      g.fillStyle = rgbs(gradedInkNow("can"));
      const drinking = this.sitting && this.drinkT > 0 && this.drinkT < 1.2;
      if (drinking) g.fillRect(8, 4, 2, 3);
      else g.fillRect(10, 10, 2, 3);
    }
    g.restore();
  },
};
