// ===== Studio: env presets, camera helpers, explosions overlay, captions, post FX, renderer/encoder =====
'use strict';
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { spawn } = require('child_process');
const fs = require('fs');
const E = require('./engine');
const Wd = require('./world');
const { W, H, clamp, lerp, smooth, eOutC, eInC, eIO, eBack, hash, add3, sub3, mul3, norm3, lerp3, project, rgba } = E;

const FONT_DIR = '/usr/share/fonts/truetype/google-fonts/';
try { GlobalFonts.registerFromPath(FONT_DIR + 'Poppins-Bold.ttf', 'PopB'); GlobalFonts.registerFromPath(FONT_DIR + 'Poppins-BoldItalic.ttf', 'PopBI'); } catch (e) { }

// ---------- timing ----------
function timing(BPM) { const B = 60 / BPM, BAR = 4 * B; return { B, BAR, T: (bar, beat = 0) => bar * BAR + beat * B }; }

// ---------- environment presets (lerp with E.envLerp) ----------
const L0 = norm3([0.35, 0.85, 0.4]);
const ENV = {
  dawn: { skyTop: [28, 26, 78], skyMid: [180, 92, 130], skyHor: [255, 170, 115], fog: [226, 150, 128], fogStart: 35, fogEnd: 150, tint: [1.02, 0.86, 0.82], light: L0, amb: 0.45, sunDir: norm3([0.6, 0.1, -0.8]), sunCol: [255, 190, 130], sunSize: 34, sunSpec: 3 },
  day: { skyTop: [36, 104, 214], skyMid: [104, 166, 238], skyHor: [190, 222, 250], fog: [178, 212, 246], fogStart: 40, fogEnd: 160, tint: [1, 1, 1], light: L0, amb: 0.46, sunDir: norm3([0.5, 0.55, -0.6]), sunCol: [255, 246, 210], sunSize: 36, sunSpec: 3 },
  sunset: { skyTop: [46, 36, 104], skyMid: [214, 96, 96], skyHor: [255, 178, 92], fog: [238, 148, 104], fogStart: 30, fogEnd: 140, tint: [1.1, 0.8, 0.62], light: norm3([0.35, 0.5, 0.8]), amb: 0.4, sunDir: norm3([0.3, 0.09, 1]), sunCol: [255, 196, 110], sunSize: 40, sunSpec: 4.5 },
  storm: { skyTop: [14, 4, 10], skyMid: [96, 22, 16], skyHor: [196, 64, 24], fog: [118, 34, 22], fogStart: 18, fogEnd: 120, tint: [0.98, 0.52, 0.44], light: norm3([0.2, 0.9, 0.3]), amb: 0.36, sunDir: norm3([0, -1, 0]), sunCol: [255, 100, 40], sunSize: 0, sunSpec: 0 },
  gold: { skyTop: [40, 110, 210], skyMid: [130, 180, 236], skyHor: [255, 226, 170], fog: [196, 216, 240], fogStart: 45, fogEnd: 170, tint: [1.06, 1.0, 0.92], light: L0, amb: 0.48, sunDir: norm3([1, 0.3, 0.35]), sunCol: [255, 236, 190], sunSize: 38, sunSpec: 3 },
  night: { skyTop: [4, 6, 20], skyMid: [14, 22, 60], skyHor: [40, 60, 110], fog: [24, 34, 70], fogStart: 20, fogEnd: 110, tint: [0.45, 0.55, 0.85], light: norm3([-0.3, 0.8, 0.4]), amb: 0.4, sunDir: norm3([-0.4, 0.45, 0.8]), sunCol: [200, 220, 255], sunSize: 22, sunSpec: 2.5 },
  frost: { skyTop: [60, 110, 180], skyMid: [150, 190, 230], skyHor: [220, 236, 250], fog: [215, 228, 245], fogStart: 25, fogEnd: 130, tint: [0.92, 0.98, 1.08], light: L0, amb: 0.5, sunDir: norm3([0.4, 0.35, 0.8]), sunCol: [240, 248, 255], sunSize: 30, sunSpec: 3 },
  toxic: { skyTop: [10, 30, 16], skyMid: [50, 110, 40], skyHor: [150, 210, 80], fog: [70, 120, 50], fogStart: 18, fogEnd: 115, tint: [0.7, 1.0, 0.6], light: L0, amb: 0.4, sunDir: norm3([0, -1, 0]), sunCol: [180, 255, 120], sunSize: 0, sunSpec: 0 },
  void: { skyTop: [10, 4, 24], skyMid: [50, 20, 90], skyHor: [120, 60, 180], fog: [40, 18, 70], fogStart: 20, fogEnd: 120, tint: [0.7, 0.6, 1.0], light: L0, amb: 0.4, sunDir: norm3([0, -1, 0]), sunCol: [200, 120, 255], sunSize: 0, sunSpec: 0 },
};
// stars for night skies: pass as opt.skyExtra
function stars(ctx, cam) {
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let k = 0; k < 160; k++) {
    const d = norm3([hash(k * 3) - 0.5, hash(k * 3 + 1) * 0.8 + 0.05, hash(k * 3 + 2) - 0.5]);
    const p = project(cam, add3(cam.pos, mul3(d, 900)));
    if (p) { const s = 1.5 + hash(k) * 2.5; ctx.fillRect(p[0], p[1], s, s); }
  }
}

// ---------- camera helpers ----------
// camFactory(world) -> mkCam(pos, target, fovScale) that never goes inside the ground
function camFactory(world) {
  return (pos, target, fs = 1) => {
    pos = pos.slice(); let g = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) g = Math.max(g, world.heightAt(pos[0] + dx * 0.7, pos[2] + dz * 0.7));
    g += 0.9; if (pos[1] < g) pos[1] = g;
    return E.makeCam(pos, target, fs);
  };
}
const orbit = (c, r, a, h) => [c[0] + Math.sin(a) * r, c[1] + h, c[2] + Math.cos(a) * r];
// Catmull-Rom path through [[time,[x,y,z]], ...]
function crPath(keys) {
  return t => {
    if (t <= keys[0][0]) return keys[0][1].slice();
    if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1][1].slice();
    let i = 0; while (keys[i + 1][0] < t) i++;
    const p0 = keys[Math.max(0, i - 1)][1], p1 = keys[i][1], p2 = keys[i + 1][1], p3 = keys[Math.min(keys.length - 1, i + 2)][1];
    const u = (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]), u2 = u * u, u3 = u2 * u;
    return [0, 1, 2].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3));
  };
}

// ---------- frame state ----------
const DYN = new E.FaceBuf(8192);
function newFrame() { DYN.clear(); return { cam: null, env: ENV.day, dyn: DYN, opt: {}, post: [], roll: 0, mb: 0, speed: 0, bloom: 0.45, shake: 0, ca: 0 }; }

// explosions: particles + glow + shockwave ring + camera shake. e.glow (0..2), e.ring (radius), e.col, e.slow (optional time-warp fn age->age)
function addExplosions(F, t, list) {
  for (const e of list) {
    const te = e.warp ? e.warp(t) : t;
    const age = te - e.t0;
    if (age < -0.01 || age > e.life) continue;
    Wd.pushExplosion(F.dyn, e, te);
    F.shake += (e.glow || 0.5) * 26 * Math.exp(-(t - e.t0) * 5) * (e.shakeMul != null ? e.shakeMul : 1);
    F.post.push((ctx, cam) => {
      const sp = project(cam, e.pos); if (!sp) return;
      const sc = cam.foc / sp[2];
      if (e.glow) {
        const r = sc * (2 + age * 6) * e.glow, a = clamp(1 - age / 0.9) * 0.9;
        if (a > 0 && r > 1) {
          const g = ctx.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], r);
          g.addColorStop(0, rgba([255, 250, 220], a)); g.addColorStop(0.3, rgba(e.col || [255, 160, 60], a * 0.7)); g.addColorStop(1, rgba(e.col || [255, 160, 60], 0));
          ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(sp[0] - r, sp[1] - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over';
        }
      }
      if (e.ring && age < 1.1) {
        const rr = e.ring * eOutC(age / 1.1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(e.col || [255, 220, 160], 0.85 * (1 - age / 1.1));
        ctx.lineWidth = 14 * (1 - age / 1.1) + 2;
        ctx.beginPath(); let pen = false;
        for (let k = 0; k <= 48; k++) {
          const a = k / 48 * Math.PI * 2;
          const p = project(cam, [e.pos[0] + Math.cos(a) * rr, e.pos[1] + 0.3, e.pos[2] + Math.sin(a) * rr]);
          if (!p) { pen = false; continue; } if (!pen) { ctx.moveTo(p[0], p[1]); pen = true; } else ctx.lineTo(p[0], p[1]);
        }
        ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
      }
    });
  }
}
// slow-motion warp for an explosion: first `dur` seconds play at `rate`
const slowWarp = (t0, dur, rate) => t => { const a = t - t0; if (a < 0) return t; return t0 + (a < dur ? a * rate : dur * rate + (a - dur)); };

// thin line between two 3D points (fishing line, laser, rope)
function line3D(F, a, b, col = 'rgba(30,20,20,0.8)', w = 2, sag = 30) {
  F.post.push((ctx, cam) => {
    const p = project(cam, a), q = project(cam, b); if (!p || !q) return;
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    ctx.quadraticCurveTo((p[0] + q[0]) / 2, Math.max(p[1], q[1]) + sag, q[0], q[1]); ctx.stroke();
  });
}

// ---------- captions ----------
const COL = { YEL: '#FFD21F', ORA: '#FF8A1F', RED: '#FF3B30', CYA: '#5CF2FF', WHT: '#FFFFFF', GRN: '#7CFF4F', PUR: '#C77DFF', PNK: '#FF5FA2' };
/* caption: {t0, t1, y (0..1 of height; keep 0.15-0.45 = safe zone), style:'hook'|'pop'|'glitch'|'count'|'still'|'soft'|'shake', lines:[[text, colour, size],...]} */
function drawLines(ctx, lines, cx, cy, scale, alpha, opt = {}) {
  const total = lines.reduce((s, l) => s + l[2] * 1.06, 0) * scale;
  let y = cy - total / 2;
  for (const [txt, col, size] of lines) {
    const fam = opt.italic ? 'PopBI' : 'PopB';
    let sz = size * scale;
    ctx.font = `${sz}px ${fam}`;
    const w = ctx.measureText(txt).width;
    if (w > 980) { sz *= 980 / w; ctx.font = `${sz}px ${fam}`; }
    const ly = y + sz * 0.53;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = alpha; ctx.lineJoin = 'round';
    if (!opt.soft) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(txt, cx + sz * 0.05, ly + sz * 0.07);
      ctx.lineWidth = Math.max(6, sz * 0.13); ctx.strokeStyle = '#000'; ctx.strokeText(txt, cx, ly);
    } else {
      ctx.lineWidth = Math.max(5, sz * 0.09); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(txt, cx, ly);
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 24;
    }
    if (opt.rgb) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,0,60,0.8)'; ctx.fillText(txt, cx - opt.rgb, ly);
      ctx.fillStyle = 'rgba(0,220,255,0.8)'; ctx.fillText(txt, cx + opt.rgb, ly);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = col; ctx.fillText(txt, cx, ly);
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    y += sz * 1.06;
  }
  ctx.globalAlpha = 1;
}
function drawCaptions(ctx, t, CAPS, B) {
  for (const c of CAPS) {
    if (t < c.t0 || t >= c.t1) continue;
    const a = t - c.t0, rem = c.t1 - t, cx = W / 2, cy = H * c.y;
    ctx.save();
    if (c.style === 'pop' || c.style === 'hook') {
      const hook = c.style === 'hook';
      const inT = hook ? 1 : clamp(a / 0.16);
      let sc = hook ? 1 + 0.04 * Math.exp(-((t % B) / B) * 4) : lerp(1.9, 1, eBack(inT));
      let al = hook ? 1 : clamp(a / 0.06);
      if (rem < 0.1) { sc *= 1 + (0.1 - rem) * 3; al *= rem / 0.1; }
      ctx.translate(cx, cy); ctx.rotate(-0.035 * (1 - inT) - 0.015); ctx.translate(-cx, -cy);
      drawLines(ctx, c.lines, cx, cy, sc, al, { italic: true, rgb: a < 0.12 ? 10 : 0 });
    } else if (c.style === 'glitch') {
      const fr = Math.floor(t * 30);
      drawLines(ctx, c.lines, cx + (hash(fr * 3) - 0.5) * 30 * clamp(1 - a * 2), cy, 1, (hash(fr * 7) > 0.15 ? 1 : 0.2) * clamp(rem / 0.15), { rgb: 6 + 10 * hash(fr) });
    } else if (c.style === 'count') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * clamp(1 - a / B)})`; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(cx, cy, 120 + a * 900, 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      drawLines(ctx, c.lines, cx, cy, lerp(2.4, 1, eOutC(a / 0.18)), clamp(rem / 0.12), { italic: true, rgb: a < 0.1 ? 14 : 0 });
    } else if (c.style === 'still') {
      drawLines(ctx, c.lines, cx, cy, 1 + a * 0.15, 1, {});
    } else if (c.style === 'soft') {
      drawLines(ctx, c.lines, cx, cy - a * 14, 1, clamp(a / 0.35) * clamp(rem / 0.3), { italic: true, soft: true });
    } else if (c.style === 'shake') {
      const fr = Math.floor(t * 60);
      drawLines(ctx, c.lines, cx + (hash(fr) - 0.5) * 22, cy + (hash(fr + 9) - 0.5) * 22, lerp(1.3, 1, eOutC(a / 0.2)), clamp(rem / 0.1), { italic: true, rgb: 8 });
    }
    ctx.restore();
  }
}

// ---------- post canvases ----------
const scene = createCanvas(W, H), sctx = scene.getContext('2d');
const out = createCanvas(W, H), octx = out.getContext('2d');
const prev = createCanvas(W, H), pctx = prev.getContext('2d');
const tmp = createCanvas(W, H), tctx = tmp.getContext('2d');
const small = createCanvas(W / 6, H / 6), smctx = small.getContext('2d');
const vign = createCanvas(W, H); {
  const v = vign.getContext('2d');
  const g = v.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.62)');
  v.fillStyle = g; v.fillRect(0, 0, W, H);
}
const grains = [];
for (let k = 0; k < 4; k++) {
  const gc = createCanvas(W / 2, H / 2), gx = gc.getContext('2d');
  const id = gx.createImageData(W / 2, H / 2);
  for (let i = 0; i < id.data.length; i += 4) { const v = hash(k * 9999991 + i) * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 22; }
  gx.putImageData(id, 0, 0); grains.push(gc);
}
let hasPrev = false;

function speedLines(ctx, amt, t) {
  if (amt <= 0) return;
  const fr = Math.floor(t * 30);
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 46; k++) {
    const s = fr * 131 + k * 17, a = hash(s) * Math.PI * 2;
    const r1 = 380 + hash(s + 1) * 500, r2 = r1 + 250 + hash(s + 2) * 700;
    ctx.strokeStyle = `rgba(255,255,255,${(0.12 + 0.3 * hash(s + 3)) * amt})`; ctx.lineWidth = 2 + hash(s + 4) * 6;
    ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1); ctx.lineTo(W / 2 + Math.cos(a) * r2, H / 2 + Math.sin(a) * r2); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}
function chromatic(amount) {
  if (amount < 0.5) return;
  tctx.globalCompositeOperation = 'copy'; tctx.drawImage(out, 0, 0);
  octx.globalCompositeOperation = 'multiply'; octx.fillStyle = 'rgb(0,255,255)'; octx.fillRect(0, 0, W, H);
  tctx.globalCompositeOperation = 'multiply'; tctx.fillStyle = 'rgb(255,0,0)'; tctx.fillRect(0, 0, W, H); tctx.globalCompositeOperation = 'source-over';
  octx.globalCompositeOperation = 'lighter'; octx.drawImage(tmp, amount, 0); octx.globalCompositeOperation = 'source-over';
}
function slices(t, amount) {
  if (amount <= 0.02) return;
  tctx.globalCompositeOperation = 'copy'; tctx.drawImage(out, 0, 0); tctx.globalCompositeOperation = 'source-over';
  const fr = Math.floor(t * 30), n = 3 + Math.floor(amount * 9);
  for (let k = 0; k < n; k++) {
    const s = fr * 31 + k * 7, y = hash(s) * H, h = 20 + hash(s + 1) * 160 * amount, dx = (hash(s + 2) - 0.5) * 160 * amount;
    octx.drawImage(tmp, 0, y, W, h, dx, y, W, h);
  }
}
function rewindFX(t, amt) {
  if (amt <= 0) return;
  const fr = Math.floor(t * 30);
  octx.fillStyle = `rgba(0,0,0,${0.18 * amt})`;
  for (let y = 0; y < H; y += 6) octx.fillRect(0, y, W, 2);
  for (let k = 0; k < 3; k++) { const y = ((fr * 37 + k * 600) % (H + 200)) - 100; octx.fillStyle = `rgba(255,255,255,${0.12 * amt})`; octx.fillRect(0, y, W, 18 + k * 10); }
  octx.globalAlpha = amt; octx.fillStyle = '#fff';
  const x0 = 80, y0 = 150;
  for (let k = 0; k < 2; k++) { octx.beginPath(); octx.moveTo(x0 + k * 46 + 46, y0 - 28); octx.lineTo(x0 + k * 46, y0); octx.lineTo(x0 + k * 46 + 46, y0 + 28); octx.closePath(); octx.fill(); }
  octx.font = '54px PopB'; octx.textAlign = 'left'; octx.textBaseline = 'middle'; octx.fillText('REW', x0 + 120, y0 + 3);
  octx.globalAlpha = 1;
}
const envAt = (list, t, fn) => { let s = 0; for (const e of list || []) { const a = t - e[0]; if (a >= 0) s = Math.max(s, fn(e, a)); } return s; };
const inR = (list, t) => (list || []).find(r => t >= r[0] && t < r[1]);

/* story contract (module.exports of story.js):
   BPM, NBARS, FPS(30), world, shot(t,F),
   KICKS [[t,amp]], FLASH [[t,amp,decay]], GLITCH [[t,dur]], CAPS [...],
   BLACK [[t0,t1]], WHITE [[t0,t1]] (ramp to white), REWIND [[t0,t1]], LOOP_TAIL t (glitch-out into frame 0)
   shot(t,F) sets: F.cam (required), F.env, pushes into F.dyn, F.opt.staticOffset/skyExtra, F.post[], F.roll, F.mb (motion blur 0..0.7), F.speed (speed lines 0..1), F.bloom, F.shake, F.ca */
function renderFrame(S, t) {
  const { B } = timing(S.BPM);
  const DUR = S.NBARS * 4 * B;
  const F = newFrame();
  S.shot(t, F);
  const kick = envAt(S.KICKS, t, (e, a) => e[1] * Math.exp(-a * 9));
  const flash = envAt(S.FLASH, t, (e, a) => e[1] * Math.exp(-a * e[2]));
  const glitch = envAt(S.GLITCH, t, (e, a) => a < e[1] ? 1 - a / e[1] : 0);
  E.renderScene(sctx, F.cam, F.env, S.world.statics, F.dyn, Object.assign({ time: t }, F.opt));
  for (const p of F.post) p(sctx, F.cam);
  const shakeAmp = F.shake + kick * 6, fr = Math.floor(t * 30);
  const sx = (hash(fr * 3 + 1) - 0.5) * 2 * shakeAmp, sy = (hash(fr * 3 + 2) - 0.5) * 2 * shakeAmp;
  const zoom = (1 + kick * 0.045) * (1 + Math.abs(F.roll) * 0.7);
  octx.save(); octx.fillStyle = '#000'; octx.fillRect(0, 0, W, H);
  octx.translate(W / 2 + sx, H / 2 + sy); octx.rotate(F.roll + (hash(fr * 5) - 0.5) * shakeAmp * 0.0006); octx.scale(zoom, zoom);
  octx.drawImage(scene, -W / 2, -H / 2); octx.restore();
  if (F.mb > 0 && hasPrev) { octx.globalAlpha = F.mb; octx.drawImage(prev, 0, 0); octx.globalAlpha = 1; }
  pctx.globalCompositeOperation = 'copy'; pctx.drawImage(out, 0, 0); pctx.globalCompositeOperation = 'source-over'; hasPrev = true;
  smctx.globalCompositeOperation = 'copy'; smctx.filter = 'brightness(0.62) contrast(3.4) blur(5px)';
  smctx.drawImage(out, 0, 0, W / 6, H / 6); smctx.filter = 'none';
  octx.globalCompositeOperation = 'screen'; octx.globalAlpha = F.bloom; octx.drawImage(small, 0, 0, W, H); octx.globalAlpha = 1; octx.globalCompositeOperation = 'source-over';
  const ca = Math.max(F.ca * 10, glitch * 26, kick > 0.9 ? (kick - 0.9) * 40 : 0);
  if (ca > 0.5) chromatic(ca);
  if (glitch > 0) slices(t, glitch);
  speedLines(octx, F.speed, t);
  if (inR(S.REWIND, t)) rewindFX(t, 1);
  if (flash > 0.01) { octx.fillStyle = `rgba(255,250,240,${clamp(flash)})`; octx.fillRect(0, 0, W, H); }
  const wr = inR(S.WHITE, t);
  if (wr) { octx.fillStyle = `rgba(255,255,255,${eInC((t - wr[0]) / (wr[1] - wr[0]))})`; octx.fillRect(0, 0, W, H); }
  if (inR(S.BLACK, t)) { octx.fillStyle = '#000'; octx.fillRect(0, 0, W, H); }
  octx.drawImage(vign, 0, 0);
  octx.drawImage(grains[fr % 4], 0, 0, W, H);
  drawCaptions(octx, t, S.CAPS || [], B);
  if (S.LOOP_TAIL != null && t > S.LOOP_TAIL) {
    const w = clamp((t - S.LOOP_TAIL) / (DUR - S.LOOP_TAIL));
    slices(t, w * 0.9); if (w > 0.5) chromatic(30 * w); rewindFX(t, w * 0.8);
  }
  if (S.overlay) S.overlay(octx, t);
}

// CLI: node story.js still <t1> <t2> ...   (writes $SP/f_<t>.jpg)
//      node story.js <frameStart> <frameEnd> out.mp4
//      node story.js frames               (prints total frame count)
function run(S) {
  const FPS = S.FPS || 30;
  const { B } = timing(S.BPM);
  const NF = Math.round(S.NBARS * 4 * B * FPS);
  const args = process.argv.slice(2);
  if (args[0] === 'frames') { console.log(NF); return; }
  if (args[0] === 'still') {
    const dir = process.env.SP || '.';
    for (const s of args.slice(1)) { hasPrev = false; renderFrame(S, +s); fs.writeFileSync(`${dir}/f_${s}.jpg`, out.toBuffer('image/jpeg', 80)); }
    return;
  }
  const f0 = +args[0], f1 = Math.min(+args[1], NF), outFile = args[2];
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', `${FPS}`, '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
  if (f0 > 0) renderFrame(S, (f0 - 1) / FPS);
  let i = f0; const t0 = Date.now();
  (function next() {
    while (i < f1) {
      renderFrame(S, i / FPS);
      const img = octx.getImageData(0, 0, W, H); i++;
      if (i % 30 === 0) process.stderr.write(`[${f0}-${f1}] frame ${i} ${((Date.now() - t0) / (i - f0)).toFixed(0)}ms/f\n`);
      if (!ff.stdin.write(Buffer.from(img.data.buffer))) { ff.stdin.once('drain', next); return; }
    }
    ff.stdin.end();
  })();
  ff.on('close', c => process.stderr.write(`done ${outFile} code ${c}\n`));
}

module.exports = { timing, ENV, stars, camFactory, orbit, crPath, newFrame, addExplosions, slowWarp, line3D, COL, drawCaptions, renderFrame, run };
