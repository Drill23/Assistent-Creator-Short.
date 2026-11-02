// ===== Voxel engine: projection, faces, painter's renderer =====
'use strict';
const W = 1080, H = 1920;
const FOV = 72 * Math.PI / 180;
const FOC = (H / 2) / Math.tan(FOV / 2);

const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const eOutC = t => { t = clamp(t); return 1 - Math.pow(1 - t, 3); };
const eInC = t => { t = clamp(t); return t * t * t; };
const eIO = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const eBack = t => { t = clamp(t); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function hash(n) { n = (n | 0) * 0x27d4eb2d; n ^= n >>> 15; n = Math.imul(n, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
const h2 = (a, b) => hash(a * 73856093 ^ b * 19349663);
const h3 = (a, b, c) => hash(a * 73856093 ^ b * 19349663 ^ c * 83492791);
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// matrices 3x3 row-major [a b c; d e f; g h i]; columns = local axes in world
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function mm(A, B) { const r = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return r; }
function mv(A, v) { return [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]]; }
const Rx = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const Ry = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const Rz = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len3 = a => Math.hypot(a[0], a[1], a[2]);
const norm3 = a => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// kinds
const K = { PLAIN: 0, GRASS_TOP: 1, GRASS_SIDE: 2, WATER: 3, LEAF: 4, EMIS: 5, MAGMA: 6, STONE: 7, CLOUD: 8, SAND: 9, WOOD: 10, BRICK: 11 };

// ---------- Face buffer ----------
class FaceBuf {
  constructor(cap = 4096) { this.n = 0; this.alloc(cap); }
  alloc(cap) {
    const o = this; const old = o.P ? { P: o.P, N: o.N, C: o.C, Kd: o.Kd, S: o.S, G: o.G } : null;
    o.cap = cap; o.P = new Float32Array(cap * 12); o.N = new Float32Array(cap * 3); o.C = new Float32Array(cap * 3);
    o.Kd = new Uint8Array(cap); o.S = new Uint32Array(cap); o.G = new Float32Array(cap * 4);
    if (old) { o.P.set(old.P); o.N.set(old.N); o.C.set(old.C); o.Kd.set(old.Kd); o.S.set(old.S); o.G.set(old.G); }
  }
  push(p, n, c, kind, seed, g) {
    if (this.n >= this.cap) this.alloc(this.cap * 2);
    const i = this.n++;
    for (let k = 0; k < 12; k++) this.P[i * 12 + k] = p[k];
    this.N[i * 3] = n[0]; this.N[i * 3 + 1] = n[1]; this.N[i * 3 + 2] = n[2];
    this.C[i * 3] = c[0]; this.C[i * 3 + 1] = c[1]; this.C[i * 3 + 2] = c[2];
    this.Kd[i] = kind; this.S[i] = seed >>> 0;
    if (g) { this.G[i * 4] = g[0]; this.G[i * 4 + 1] = g[1]; this.G[i * 4 + 2] = g[2]; this.G[i * 4 + 3] = g[3]; }
    return i;
  }
  clear() { this.n = 0; }
}

// unit-cube face corners; order: p0 top-left, p1 top-right, p2 bottom-right, p3 bottom-left (for sides, "top" = +y)
const CUBE_FACES = [
  { n: [0, 1, 0], c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]] },
  { n: [1, 0, 0], c: [[1, 1, 1], [1, 1, 0], [1, 0, 0], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 1, 0], [0, 1, 1], [0, 0, 1], [0, 0, 0]] },
  { n: [0, 0, 1], c: [[0, 1, 1], [1, 1, 1], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, -1], c: [[1, 1, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0]] },
];
const DIRS = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

// push an axis-aligned unit voxel at integer x,y,z; solid(x,y,z)->bool for culling; colors: top, side, bottom
function pushVoxel(buf, x, y, z, cols, kinds, seed, solid, g, scale = 1, yoff = 0) {
  for (let f = 0; f < 6; f++) {
    const d = DIRS[f];
    if (solid && solid(x + d[0], y + d[1], z + d[2])) continue;
    const F = CUBE_FACES[f]; const p = new Array(12);
    for (let k = 0; k < 4; k++) {
      p[k * 3] = x + 0.5 + (F.c[k][0] - 0.5) * scale;
      p[k * 3 + 1] = y + 0.5 + (F.c[k][1] - 0.5) * scale + yoff;
      p[k * 3 + 2] = z + 0.5 + (F.c[k][2] - 0.5) * scale;
    }
    const ci = f === 0 ? 0 : f === 1 ? 2 : 1;
    buf.push(p, F.n, cols[ci], kinds[ci], seed * 7 + f, g);
  }
}

// push an oriented box: center c, half extents h, rotation R; cols: single [r,g,b] or array of 6; kind
function pushBox(buf, c, h, R, col, kind, seed = 1, kinds) {
  const multi = Array.isArray(col[0]);
  for (let f = 0; f < 6; f++) {
    const F = CUBE_FACES[f]; const p = new Array(12);
    for (let k = 0; k < 4; k++) {
      const l = [(F.c[k][0] * 2 - 1) * h[0], (F.c[k][1] * 2 - 1) * h[1], (F.c[k][2] * 2 - 1) * h[2]];
      const w = mv(R, l);
      p[k * 3] = c[0] + w[0]; p[k * 3 + 1] = c[1] + w[1]; p[k * 3 + 2] = c[2] + w[2];
    }
    buf.push(p, mv(R, F.n), multi ? col[f] : col, kinds ? kinds[f] : kind, seed * 7 + f, null);
  }
}

// ---------- Camera ----------
function makeCam(pos, target, fovScale = 1) {
  const d = sub3(target, pos);
  const yaw = Math.atan2(d[0], d[2]);
  const pitch = Math.atan2(d[1], Math.hypot(d[0], d[2]));
  return camYP(pos, yaw, pitch, fovScale);
}
function camYP(pos, yaw, pitch, fovScale = 1) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const f = [sy * cp, sp, cy * cp];
  const r = [cy, 0, -sy];
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  return { pos, f, r, u, yaw, pitch, foc: FOC * fovScale };
}

// ---------- Environment ----------
function envLerp(a, b, t) {
  const o = {};
  for (const k in a) {
    if (Array.isArray(a[k])) o[k] = a[k].map((v, i) => lerp(v, b[k][i], t));
    else if (typeof a[k] === 'number') o[k] = lerp(a[k], b[k], t);
    else o[k] = t < .5 ? a[k] : b[k];
  }
  return o;
}

// ---------- Renderer ----------
const NEAR = 0.15;
function renderScene(ctx, cam, env, statics, dyn, opt = {}) {
  const T = opt.time || 0;
  // ---- sky ----
  const horizonY = H / 2 + cam.foc * Math.tan(cam.pitch);
  const g = ctx.createLinearGradient(0, horizonY - H * 1.1, 0, horizonY + 40);
  g.addColorStop(0, rgb(env.skyTop)); g.addColorStop(0.62, rgb(env.skyMid)); g.addColorStop(1, rgb(env.skyHor));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (horizonY < H) { ctx.fillStyle = rgb(env.fog); ctx.fillRect(0, Math.max(0, horizonY + 39), W, H); }
  // sun
  if (env.sunSize > 0) {
    const sp = project(cam, add3(cam.pos, mul3(env.sunDir, 1000)));
    if (sp) {
      const s = env.sunSize * cam.foc / FOC;
      const hg = ctx.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], s * 7);
      hg.addColorStop(0, rgba(env.sunCol, 0.85)); hg.addColorStop(0.25, rgba(env.sunCol, 0.35)); hg.addColorStop(1, rgba(env.sunCol, 0));
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hg; ctx.fillRect(sp[0] - s * 7, sp[1] - s * 7, s * 14, s * 14);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgb(lerp3(env.sunCol, [255, 255, 240], 0.7)); ctx.fillRect(sp[0] - s, sp[1] - s, s * 2, s * 2);
    }
  }
  if (opt.skyExtra) opt.skyExtra(ctx, cam);

  // ---- collect faces ----
  const list = [];
  const L = env.light;
  const cx = cam.pos[0], cy = cam.pos[1], cz = cam.pos[2];
  const fogS = env.fogStart, fogE = env.fogEnd, fog = env.fog;
  const tint = env.tint;
  const bufs = statics ? [statics, dyn] : [dyn];
  for (let bi = 0; bi < bufs.length; bi++) {
    const B = bufs[bi]; if (!B) continue;
    const isStatic = B === statics;
    const off = isStatic ? opt.staticOffset : null;
    const hide = isStatic ? opt.staticHide : null;
    for (let i = 0; i < B.n; i++) {
      let dy = 0;
      if (hide && hide(B, i)) continue;
      if (off) { dy = off(B, i); if (dy === null) continue; }
      const P = B.P, o = i * 12;
      const nx = B.N[i * 3], ny = B.N[i * 3 + 1], nz = B.N[i * 3 + 2];
      const mx = (P[o] + P[o + 6]) * 0.5, my = (P[o + 1] + P[o + 7]) * 0.5 + dy, mz = (P[o + 2] + P[o + 8]) * 0.5;
      const vx = mx - cx, vy = my - cy, vz = mz - cz;
      if (nx * vx + ny * vy + nz * vz >= 0) continue;
      const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (dist > fogE + 2) continue;
      // forward cull
      const fz = vx * cam.f[0] + vy * cam.f[1] + vz * cam.f[2];
      if (fz < -2) continue;
      // project corners (camera space)
      const cs = new Array(12); let behind = 0;
      for (let k = 0; k < 4; k++) {
        const px = P[o + k * 3] - cx, py = P[o + k * 3 + 1] + dy - cy, pz = P[o + k * 3 + 2] - cz;
        const X = px * cam.r[0] + py * cam.r[1] + pz * cam.r[2];
        const Y = px * cam.u[0] + py * cam.u[1] + pz * cam.u[2];
        const Z = px * cam.f[0] + py * cam.f[1] + pz * cam.f[2];
        cs[k * 3] = X; cs[k * 3 + 1] = Y; cs[k * 3 + 2] = Z;
        if (Z < NEAR) behind++;
      }
      if (behind === 4) continue;
      let pts;
      if (behind === 0) {
        pts = new Array(8);
        for (let k = 0; k < 4; k++) { pts[k * 2] = W / 2 + cs[k * 3] * cam.foc / cs[k * 3 + 2]; pts[k * 2 + 1] = H / 2 - cs[k * 3 + 1] * cam.foc / cs[k * 3 + 2]; }
      } else {
        pts = [];
        for (let k = 0; k < 4; k++) {
          const a = k * 3, b = ((k + 1) % 4) * 3;
          const za = cs[a + 2], zb = cs[b + 2];
          if (za >= NEAR) pts.push(W / 2 + cs[a] * cam.foc / za, H / 2 - cs[a + 1] * cam.foc / za);
          if ((za >= NEAR) !== (zb >= NEAR)) {
            const t = (NEAR - za) / (zb - za);
            const X = cs[a] + (cs[b] - cs[a]) * t, Y = cs[a + 1] + (cs[b + 1] - cs[a + 1]) * t;
            pts.push(W / 2 + X * cam.foc / NEAR, H / 2 - Y * cam.foc / NEAR);
          }
        }
        if (pts.length < 6) continue;
      }
      // screen bbox cull
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (let k = 0; k < pts.length; k += 2) { const x = pts[k], y = pts[k + 1]; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
      if (maxx < -20 || minx > W + 20 || maxy < -20 || miny > H + 20) continue;
      // color
      const kind = B.Kd[i];
      let r = B.C[i * 3], gg = B.C[i * 3 + 1], b = B.C[i * 3 + 2];
      let emis = kind === K.EMIS;
      if (kind === K.WATER) {
        const wv = Math.sin(mx * 0.9 + T * 2.2) * Math.cos(mz * 0.7 - T * 1.7) + 0.5 * Math.sin((mx + mz) * 1.7 + T * 3.1);
        const br = 1 + 0.1 * wv;
        r *= br; gg *= br; b *= br;
        const inv = 1 / dist; const rx = vx * inv, ry = -vy * inv, rz = vz * inv;
        const fres = Math.pow(1 - Math.abs(vy * inv), 3) * 0.55;
        r = lerp(r, env.skyHor[0], fres); gg = lerp(gg, env.skyHor[1], fres); b = lerp(b, env.skyHor[2], fres);
        const sd = env.sunDir; let sp = rx * sd[0] + ry * sd[1] + rz * sd[2];
        sp = sp > 0 ? Math.pow(sp, 60) * env.sunSpec * (0.6 + 0.4 * Math.sin(mx * 3.1 + mz * 2.3 + T * 5)) : 0;
        r += env.sunCol[0] * sp; gg += env.sunCol[1] * sp; b += env.sunCol[2] * sp;
        r *= tint[0]; gg *= tint[1]; b *= tint[2];
      } else if (!emis) {
        let sh = env.amb + (1 - env.amb) * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        if (kind === K.MAGMA) sh *= 0.9;
        if (kind === K.CLOUD) sh = 0.88 + 0.12 * Math.max(0, ny);
        r *= sh * tint[0]; gg *= sh * tint[1]; b *= sh * tint[2];
      }
      let fogT = clamp((dist - fogS) / (fogE - fogS));
      if (emis) fogT *= 0.4;
      fogT = fogT * fogT * (3 - 2 * fogT);
      r = lerp(r, fog[0], fogT); gg = lerp(gg, fog[1], fogT); b = lerp(b, fog[2], fogT);
      const area = (maxx - minx) * (maxy - miny);
      list.push({ d: dist, pts, r, gg, b, kind, seed: B.S[i], area, fogT, sh: emis ? 1 : 0 });
    }
  }
  list.sort((a, b) => b.d - a.d);
  // ---- draw ----
  ctx.lineJoin = 'round';
  for (let q = 0; q < list.length; q++) {
    const F = list[q];
    const col = rgbS(F.r, F.gg, F.b);
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
    const p = F.pts;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    const tex = F.kind !== K.WATER && F.kind !== K.EMIS && F.kind !== K.CLOUD && p.length === 8;
    if (tex && F.area > 900 && F.fogT < 0.85) texFace(ctx, F, T);
    else if (F.kind === K.GRASS_SIDE && p.length === 8) {
      // green top strip
      const a = 0.28; const g2 = grassCol(F);
      ctx.fillStyle = g2; ctx.beginPath();
      ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]);
      ctx.lineTo(lerp(p[2], p[4], a), lerp(p[3], p[5], a)); ctx.lineTo(lerp(p[0], p[6], a), lerp(p[1], p[7], a));
      ctx.closePath(); ctx.fill();
    } else if (F.kind === K.MAGMA && p.length === 8) {
      ctx.fillStyle = `rgba(255,${(90 + 60 * Math.sin(T * 6 + F.seed)) | 0},20,${0.35 * (1 - F.fogT)})`;
      ctx.fill();
    }
  }
  return list.length;
}

let GRASS = [95, 159, 53];
function setGrassSide(c) { GRASS = c.slice(); }
function grassCol(F) {
  // approximate grass tint from the face's dirt colour & fog
  const k = F.r / 134;
  return rgbS(GRASS[0] * k * 0.95, GRASS[1] * k * 0.95, GRASS[2] * k * 0.95);
}

function texFace(ctx, F, T) {
  const p = F.pts; const n = F.area > 30000 ? 8 : 4;
  const gp = [];
  for (let j = 0; j <= n; j++) {
    const v = j / n;
    const lx = lerp(p[0], p[6], v), ly = lerp(p[1], p[7], v), rx = lerp(p[2], p[4], v), ry = lerp(p[3], p[5], v);
    for (let i = 0; i <= n; i++) { const u = i / n; gp.push(lerp(lx, rx, u), lerp(ly, ry, u)); }
  }
  const s = F.seed; const fog = F.fogT;
  const g2 = F.kind === K.GRASS_SIDE ? [F.r / 134 * GRASS[0], F.r / 134 * GRASS[1], F.r / 134 * GRASS[2]] : null;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const hh = h3(s, i, j);
    let r = F.r, g = F.gg, b = F.b, m = 1 + (hh - 0.5) * (F.kind === K.LEAF ? 0.45 : 0.22);
    let alpha = 1;
    if (F.kind === K.GRASS_SIDE) {
      const lim = n === 8 ? 2 : 1;
      if (j < lim || (j === lim && hh > 0.45)) { r = g2[0]; g = g2[1]; b = g2[2]; }
    } else if (F.kind === K.MAGMA) {
      if (hh < 0.3) { const pu = 0.75 + 0.25 * Math.sin(T * 7 + hh * 40); r = 255 * pu; g = (110 + 80 * hh) * pu; b = 25; m = 1; r = lerp(r, F.r, fog * 0.5); }
    } else if (F.kind === K.BRICK) {
      if ((j % 2 === 0 && i === 0) || (j % 2 === 1 && i === n / 2) || false) m *= 0.75;
    } else if (F.kind === K.WOOD) {
      m = 1 + ((i % 2) - 0.5) * 0.12 + (hh - 0.5) * 0.08;
    }
    const o = (j * (n + 1) + i) * 2, o2 = ((j + 1) * (n + 1) + i) * 2;
    ctx.fillStyle = rgbS(r * m, g * m, b * m);
    ctx.beginPath(); ctx.moveTo(gp[o], gp[o + 1]); ctx.lineTo(gp[o + 2], gp[o + 3]); ctx.lineTo(gp[o2 + 2], gp[o2 + 3]); ctx.lineTo(gp[o2], gp[o2 + 1]); ctx.closePath(); ctx.fill();
  }
}

function project(cam, p) {
  const px = p[0] - cam.pos[0], py = p[1] - cam.pos[1], pz = p[2] - cam.pos[2];
  const Z = px * cam.f[0] + py * cam.f[1] + pz * cam.f[2];
  if (Z < NEAR) return null;
  const X = px * cam.r[0] + py * cam.r[1] + pz * cam.r[2];
  const Y = px * cam.u[0] + py * cam.u[1] + pz * cam.u[2];
  return [W / 2 + X * cam.foc / Z, H / 2 - Y * cam.foc / Z, Z];
}

const c255 = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
const rgbS = (r, g, b) => `rgb(${c255(r)},${c255(g)},${c255(b)})`;
const rgb = c => rgbS(c[0], c[1], c[2]);
const rgba = (c, a) => `rgba(${c255(c[0])},${c255(c[1])},${c255(c[2])},${a})`;

module.exports = { setGrassSide, W, H, FOC, K, clamp, lerp, smooth, eOutC, eInC, eIO, eBack, hash, h2, h3, lerp3, I3, mm, mv, Rx, Ry, Rz, add3, sub3, mul3, len3, norm3, FaceBuf, pushVoxel, pushBox, makeCam, camYP, envLerp, renderScene, project, rgb, rgba, rgbS };
