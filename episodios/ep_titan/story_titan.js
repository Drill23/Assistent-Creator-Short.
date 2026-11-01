// ===== EP "O Titã de Gelo" — série "Crônicas do Brasa" =====
// Herói Brasa (capacete grafite, olhos dourados, jaqueta azul, capa vermelha) arranca o cristal proibido do pico
// nevado, desce a montanha e acorda o Titã de Gelo que dormia sob o rio. 150 BPM, 16 compassos (25,6 s).
'use strict';
const fs = require('fs');
const E = require('./lib/engine');
const Wd = require('./lib/world');
const S = require('./lib/studio');
const { K, clamp, lerp, smooth, eOutC, eInC, eIO, hash, add3, sub3, mul3, norm3, lerp3, mv, mm, Rx, Ry, Rz } = E;
const { ENV, orbit, addExplosions, COL } = S;

// ---------------- timing (igual à trilha) ----------------
const BPM = 150, NBARS = 16;
const { B, BAR, T } = S.timing(BPM);

// ---------------- mundo nevado ----------------
const world = Wd.buildWorld({
  seed: 7, hill: [46, 20, 22], riverBase: 28, riverAmp: 4, trees: 'pine', treeDensity: 0.05, snowLine: 8, platforms: false, flowers: 0,
  clearBanks: 9, clouds: 18, avoid: [[30, 22, 4], [33, 12, 4], [31, 20, 4]],
  palette: { grass: [226, 234, 242], dirt: [120, 112, 124], water: [110, 170, 214], leaf: [40, 84, 66], wood: [80, 60, 44], snow: [244, 248, 252], sand: [196, 210, 226] },
});
const hAt = world.heightAt, mkCam = S.camFactory(world), RX = world.riverX;
const ICE = { skyTop: [8, 14, 34], skyMid: [32, 62, 108], skyHor: [96, 146, 196], fog: [52, 84, 126], fogStart: 22, fogEnd: 125, tint: [0.72, 0.86, 1.12], light: norm3([0.3, 0.85, 0.4]), amb: 0.4, sunDir: norm3([0, -1, 0]), sunCol: [180, 230, 255], sunSize: 0, sunSpec: 0 };

const HERO = { helm: [40, 44, 62], visor: [255, 196, 60], visorStyle: 'eyes', jacket: [38, 110, 196], dark: [24, 30, 46], boot: [22, 22, 28], crest: [255, 206, 80], blade: [150, 240, 255], hilt: [60, 44, 36], cape: [226, 58, 52] };
const TITAN = { body: [168, 206, 232], dark: [96, 136, 176], eye: [215, 252, 255], core: [120, 235, 255], spike: [226, 246, 255] };
const CRY = [120, 235, 255], CRY2 = [210, 252, 255];
const hero = (F, P) => { P.dyn = F.dyn; if (!P.pal) P.pal = HERO; return Wd.pushHero(F.dyn, P); };
const bit = (F, p, yaw, t) => Wd.pushCompanion(F.dyn, p, yaw, t, 1, [255, 170, 70]);

// ---------------- lugares-chave ----------------
const H0 = [44.6, hAt(44.6, 20.5), 20.5];          // pico
const CRYP = [47.4, hAt(47.4, 20.5), 20.5];        // cristal cravado no pico
const BANK = [RX(22) + 4.6, hAt(RX(22) + 4.6, 22), 22];
const ys = (x, z) => (hAt(x - 0.7, z) + hAt(x, z) + hAt(x + 0.7, z) + hAt(x, z - 0.7) + hAt(x, z + 0.7)) / 5;

// ---------------- adereços ----------------
function pushCrystal(F, p, sc, t, glow = 1) {
  const R = Ry(t * 0.8);
  E.pushBox(F.dyn, add3(p, [0, 0.55 * sc, 0]), [0.16 * sc, 0.55 * sc, 0.16 * sc], mm(R, Rz(0.08)), CRY, K.EMIS, 701);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + 0.4, Rk = mm(R, mm(Ry(a), Rz(0.55)));
    E.pushBox(F.dyn, add3(p, mv(R, [Math.cos(a) * 0.16 * sc, 0.28 * sc, Math.sin(a) * 0.16 * sc])), [0.09 * sc, 0.3 * sc, 0.09 * sc], Rk, k % 2 ? CRY2 : CRY, K.EMIS, 702 + k);
  }
  F.post.push((ctx, cam) => {
    const sp = E.project(cam, add3(p, [0, 0.5 * sc, 0])); if (!sp) return;
    const r = cam.foc / sp[2] * 0.9 * sc * glow * (1 + 0.12 * Math.sin(t * 9));
    if (r < 2) return;
    const g = ctx.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], r);
    g.addColorStop(0, 'rgba(220,252,255,0.75)'); g.addColorStop(0.35, 'rgba(110,225,255,0.35)'); g.addColorStop(1, 'rgba(110,225,255,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(sp[0] - r, sp[1] - r, 2 * r, 2 * r); ctx.globalCompositeOperation = 'source-over';
  });
}
function snowfall(F, c, t, n = 70, r = 12, spd = 2.2) {
  for (let k = 0; k < n; k++) {
    const s = 3000 + k;
    const y = c[1] + 9 - ((t * spd * (0.7 + hash(s + 2) * 0.6) + hash(s + 3) * 14) % 14);
    E.pushBox(F.dyn, [c[0] + (hash(s) - 0.5) * 2 * r + Math.sin(t * 1.3 + k) * 0.4, y, c[2] + (hash(s + 1) - 0.5) * 2 * r], [0.05, 0.05, 0.05], E.I3, [250, 252, 255], K.EMIS, s);
  }
}
// Titã de Gelo: golem de blocos com núcleo brilhante e espinhos de gelo
const TSC = 7;
function pushTitan(F, P) {
  const R0 = Ry(P.yaw), W2 = l => add3(P.pos, mul3(mv(R0, l), TSC));
  const body = P.white ? lerp3(TITAN.body, [255, 255, 255], P.white) : TITAN.body;
  Wd.pushGolem(F.dyn, { pos: P.pos, yaw: P.yaw, scale: TSC, walk: P.walk, armL: P.armL, armR: P.armR, body, eye: TITAN.eye, crack: false });
  E.pushBox(F.dyn, W2([0, 1.55, 0.36]), mul3([0.13, 0.13, 0.02], TSC), R0, TITAN.core, K.EMIS, 1301);
  E.pushBox(F.dyn, W2([0, 1.15, 0.36]), mul3([0.5, 0.04, 0.02], TSC), R0, TITAN.dark, K.PLAIN, 1302);
  for (const sx of [-1, 1]) {
    E.pushBox(F.dyn, W2([sx * 0.5, 2.2, -0.05]), mul3([0.07, 0.32, 0.07], TSC), mm(R0, Rz(-sx * 0.55)), TITAN.spike, K.PLAIN, 1310);
    E.pushBox(F.dyn, W2([sx * 0.32, 2.15, -0.15]), mul3([0.05, 0.22, 0.05], TSC), mm(R0, mm(Rz(-sx * 0.3), Rx(-0.4))), TITAN.spike, K.PLAIN, 1311);
    E.pushBox(F.dyn, W2([sx * 0.16, 2.68, 0]), mul3([0.04, 0.12, 0.04], TSC), mm(R0, Rz(-sx * 0.25)), TITAN.spike, K.PLAIN, 1312);
  }
  F.post.push((ctx, cam) => { // brilho do núcleo e dos olhos
    for (const [l, k] of [[[0, 1.55, 0.4], 1.0], [[0, 2.4, 0.36], 0.6]]) {
      const sp = E.project(cam, W2(l)); if (!sp) continue;
      const r = cam.foc / sp[2] * TSC * 0.5 * k * (P.glow || 1);
      const g = ctx.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], r);
      g.addColorStop(0, 'rgba(210,250,255,0.6)'); g.addColorStop(1, 'rgba(110,220,255,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(sp[0] - r, sp[1] - r, 2 * r, 2 * r); ctx.globalCompositeOperation = 'source-over';
    }
  });
}

// ---------------- coreografia do drop 2 ----------------
const TZ = t => t < T(9) ? 32 : t < T(10) ? lerp(32, 26, (t - T(9)) / BAR) : 26;
const titanPos = t => { const z = TZ(t); let y = 2; if (t < T(8, 2.5)) y = lerp(-24, 2, eOutC(clamp((t - T(8)) / (2.5 * B)))); return [RX(z), y, z]; };
const titanW = (t, l) => add3(titanPos(t), mul3(mv(Ry(Math.PI), l), TSC));
const CORE = titanW(T(11, 3), [0, 1.55, 0.4]);
function titanArms(t) {
  if (t < T(8, 2.5)) return { armL: -0.3, armR: -0.3 };
  if (t < T(9)) { const s = smooth((t - T(8, 2.5)) / (0.6 * B)); return { armL: -2.6 * s, armR: -2.6 * s }; }
  if (t < T(9, 2.5)) return {};
  if (t < T(10)) return { armL: lerp(0, -2.9, eOutC((t - T(9, 2.5)) / (1.5 * B))), armR: 0.2 };
  if (t < T(10, 2)) return { armL: lerp(-2.9, -0.4, eOutC(clamp((t - T(10)) / 0.12))), armR: 0.2 };
  if (t < T(11)) return { armL: lerp(-0.4, -0.9, smooth((t - T(10, 2)) / (2 * B))), armR: lerp(0.2, -0.9, smooth((t - T(10, 2)) / (2 * B))) };
  return { armL: -1.25, armR: -1.25 };
}
const FIST = titanW(T(10, 0.1), [-0.72, 2.0 - 1.25 * Math.cos(0.4), 1.25 * Math.sin(0.4)]);
function runPos(t) {
  const u = clamp((t - T(9)) / (BAR + B)), z = lerp(22, 12, u), x = RX(z) + 4.6;
  return [x, ys(x, z), z];
}
const PLAUNCH = runPos(T(10, 1));
const PLAND = [RX(8) + 5.5, ys(RX(8) + 5.5, 8), 8];
const PSTRIKE = add3(CORE, mul3(norm3(sub3(PLAND, CORE)), 1.6));
const PFIN = [RX(19) + 4.6, ys(RX(19) + 4.6, 19), 19];
const TSTRIKE = T(12), TC = T(11, 2);
const yawTo = (a, b) => { const d = sub3(b, a); return Math.atan2(d[0], d[2]); };

function heroD2(t) {
  if (t < T(9)) { const yw = yawTo(BANK, titanPos(t)); const s = smooth((t - T(8)) / (0.5 * B)); return { pos: BANK, yaw: lerp(-Math.PI / 2, yw, s), armL: -0.4, armR: -0.7, scarf: t, crystal: true }; }
  if (t < T(10, 1)) return { pos: runPos(t), yaw: Math.PI, run: (t - T(9)) * 16, scarf: t, lean: 0.25, crystal: true };
  if (t < T(10, 2.2)) {
    const s = (t - T(10, 1)) / (1.2 * B), p = lerp3(PLAUNCH, PLAND, s); p[1] += 6 * Math.sin(Math.PI * s);
    return { pos: p, yaw: Math.PI + s * 6.2, jump: 1, armL: -2.4, armR: -2.0, scarf: t, lean: -0.5 + s * 0.5 };
  }
  if (t < T(11)) { const s = clamp((t - T(10, 2.2)) / (0.5 * B)); return { pos: PLAND, yaw: yawTo(PLAND, CORE), sword: eOutC(s), armR: lerp(0, -1.2, eOutC(s)), armL: -0.2, scarf: t }; }
  if (t < TSTRIKE) {
    const u = (t - T(11)) / BAR, s = 0.45 * u + 0.55 * (0.5 + 4 * Math.pow(u - 0.5, 3));
    const p = lerp3(PLAND, PSTRIKE, s); p[1] += 5 * Math.sin(Math.PI * s);
    return { pos: p, yaw: yawTo(PLAND, PSTRIKE), jump: 1, sword: 1, armR: -2.7, armL: -1.6, scarf: t * 0.5, lean: 0.2 };
  }
  const u = clamp((t - TSTRIKE) / (BAR + B));
  const p = lerp3(PSTRIKE, PFIN, eOutC(u)); p[1] = lerp(PSTRIKE[1], PFIN[1], eInC(u)) + 3 * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u);
  const sw = clamp((t - TSTRIKE) / 0.15), land = u >= 1;
  return { pos: p, yaw: yawTo(PSTRIKE, PFIN) + (land ? 0 : u * 6.28), jump: land ? 0 : 1, sword: 1, armR: lerp(-2.7, 0.9, eOutC(sw)), armL: land ? 0.6 : -1.2, scarf: t, lean: land ? 0.5 : 0 };
}

// ---------------- explosões ----------------
const ICEFIRE = [130, 225, 255];
const EXP = [
  { t0: T(8), pos: [RX(32), world.WATER_Y, 32], n: 220, speed: 22, life: 2.6, size: 0.45, seed: 11, palette: 'snow', up: 0.8, glow: 0.9, ring: 18, col: [190, 235, 255] },
  { t0: T(8), pos: [RX(32), world.WATER_Y, 32], n: 110, speed: 18, life: 2.2, size: 0.3, seed: 12, palette: 'water', up: 0.8 },
  { t0: T(10), pos: FIST, n: 200, speed: 18, life: 2.4, size: 0.45, seed: 31, palette: 'mix', mixPal: 'snow', fireCol: ICEFIRE, glow: 1.4, ring: 20, col: [160, 230, 255] },
  { t0: T(10, 1), pos: PLAUNCH, n: 170, speed: 16, life: 3.2, size: 0.4, seed: 41, palette: 'mix', mixPal: 'snow', fireCol: ICEFIRE, glow: 1.5, ring: 14, col: [170, 235, 255], warp: S.slowWarp(T(10, 1), 1.2 * B, 0.25) },
  { t0: TSTRIKE, pos: CORE, n: 280, speed: 24, life: 3.0, size: 0.6, seed: 51, palette: 'mix', mixPal: 'snow', fireCol: ICEFIRE, glow: 2.2, ring: 28, col: [200, 245, 255] },
  { t0: T(13, 1), pos: PFIN, n: 60, speed: 9, life: 1.4, size: 0.3, seed: 77, palette: 'snow', up: 0.2, glow: 0.4, ring: 20, col: [255, 255, 255] },
];
for (let k = 1; k <= 4; k++) { // onda de espinhos de gelo do soco até o herói
  const te = T(10, k * 0.25), p = lerp3(FIST, PLAUNCH, k / 4); p[1] = ys(p[0], p[2]);
  EXP.push({ t0: te, pos: p, n: 70, speed: 12, life: 1.4, size: 0.35, seed: 60 + k, palette: 'mix', mixPal: 'snow', fireCol: ICEFIRE, up: 0.9, glow: 0.8, ring: 7, col: [170, 235, 255] });
}
const SHATTER = [[0, 2.35, 0], [-0.72, 1.6, 0.4], [0.72, 1.6, 0.4], [0, 1.0, 0], [-0.25, 0.5, 0], [0.25, 0.5, 0], [-0.4, 2.0, 0], [0.4, 2.0, 0], [0, 1.8, 0.2], [-0.6, 1.1, 0.5], [0.6, 1.1, 0.5], [0, 0.2, 0]];
SHATTER.forEach((l, i) => EXP.push({ t0: TSTRIKE + 0.06 + i * 0.05, pos: titanW(TSTRIKE, l), n: 34, speed: 11, life: 2.0, size: 0.55, seed: 100 + i, palette: 'mix', mixPal: 'snow', fireCol: ICEFIRE, glow: 0.6, ring: 0, col: [190, 240, 255] }));

// ---------------- cenas ----------------
function idleHero(F, t, yaw = -Math.PI / 2, crystal = false) {
  const r = hero(F, { pos: H0, yaw, armL: Math.sin(t * 2) * 0.05, armR: -Math.sin(t * 2) * 0.05 - (crystal ? 0.6 : 0), scarf: t });
  if (crystal) pushCrystal(F, add3(r.hand, [0, -0.05, 0]), 0.35, t, 0.7);
  bit(F, add3(H0, [Math.cos(yaw) * 0.9, 2.1, -Math.sin(yaw) * 0.9]), yaw, t);
}
function crystalInPeak(F, t) { if (t < T(4, 2)) pushCrystal(F, CRYP, 1.5, t, 0.6); }
function shotBuild(t, F) { // c1: o mundo nevado cai do céu
  const lt = t - T(1), u = clamp(lt / BAR);
  F.cam = mkCam(orbit([34, 8, 26], lerp(60, 44, eOutC(u)), 0.9 + u * 1.2, lerp(42, 26, eIO(u))), [36, lerp(4, 10, u), 24]);
  F.env = E.envLerp(ENV.dawn, ENV.frost, smooth(u * 1.4));
  F.opt.staticOffset = (Bf, i) => {
    const gx = Bf.G[i * 4], gz = Bf.G[i * 4 + 1], ty = Bf.G[i * 4 + 2];
    if (ty === 3) return 0;
    if (ty === 2) { const p = clamp((lt - 1.15) / 0.3); return p <= 0 ? null : -(1 - eOutC(p)) * 3; }
    const delay = Math.hypot(gx - 36, gz - 24) / 46 * 1.0 + E.h2(gx | 0, gz | 0) * 0.12 + (ty === 1 ? 0.18 : 0);
    const p = clamp((lt - delay) / 0.3);
    return p <= 0 ? null : 30 * (1 - p * p);
  };
  crystalInPeak(F, t); F.bloom = 0.35;
}
function flyPath(u) { const z = lerp(62, 30, u), x = RX(z) + Math.sin(u * 7) * 2; return [x, Math.max(hAt(x, z), world.WATER_Y) + lerp(5.5, 11, u) + Math.sin(u * 9) * 1.0, z]; }
function shotFly(t, F) { // c2: voo FPV pelo vale até o pico
  const u = clamp((t - T(2)) / BAR), uu = 0.04 + u * 0.92;
  const p = flyPath(uu); let tgt = add3(flyPath(uu + 0.06), [0, -2, 0]);
  if (u > 0.6) tgt = lerp3(tgt, add3(H0, [0, 1.5, 0]), smooth((u - 0.6) / 0.4));
  F.cam = mkCam(p, tgt, 0.85);
  F.roll = (flyPath(uu + 0.03)[0] + flyPath(uu - 0.03)[0] - 2 * p[0]) * -0.45;
  F.env = ENV.frost; F.speed = 0.9; F.bloom = 0.2;
  idleHero(F, t); crystalInPeak(F, t); snowfall(F, p, t, 50, 10, 4);
}
function shotReveal(t, F) { // c3: corrida de câmera + close no visor
  const lt = (t - T(3)) / B, yaw = -Math.PI / 2, fwd = [Math.sin(yaw), 0, Math.cos(yaw)];
  F.env = ENV.frost; idleHero(F, t); crystalInPeak(F, t);
  if (lt < 2) {
    const s = eOutC(lt / 1.6);
    F.cam = mkCam(lerp3(add3(H0, [fwd[0] * 20, 6, 5]), add3(H0, [fwd[0] * 3.2, 0.6, 1.0]), s), add3(H0, [0, lerp(1, 1.4, s), 0]), lerp(0.8, 1.05, s));
    F.mb = 0.5 * (1 - s); F.speed = 0.7 * (1 - s);
  } else {
    const s = (lt - 2) / 2, head = add3(H0, [0, 1.85, 0]);
    F.cam = mkCam(orbit(head, 1.9 - s * 0.3, yaw - 0.8 + s * 0.9, -0.2), head, 1.1); F.roll = -0.06;
  }
  snowfall(F, H0, t, 60, 8); F.bloom = 0.22;
}
function shotCrystal(t, F) { // c4: arranca o cristal proibido
  const lt = (t - T(4)) / B, yaw = Math.PI / 2;
  let armR, sword;
  if (lt < 2) { armR = lerp(-0.2, -2.9, eOutC(lt / 1.4)); sword = clamp(lt / 0.4); }
  else { const s = clamp((lt - 2) / 0.12); armR = lerp(-2.9, 0.5, eOutC(s)); sword = 1 - clamp((lt - 2.4) / 0.3); }
  if (lt > 2.8) armR = lerp(0.5, -2.9, eOutC((lt - 2.8) / 0.5));
  const r = hero(F, { pos: H0, yaw, armR, armL: -0.3, sword, scarf: t });
  if (lt < 2) pushCrystal(F, CRYP, 1.5, t, 1 + lt * 0.3);
  else { const s = clamp((lt - 2.5) / 0.4); pushCrystal(F, lerp3(add3(CRYP, [0, 0.6, 0]), add3(r.hand, [0, 0, 0]), eIO(s)), lerp(1.2, 0.4, s), t, 1.4); }
  addExplosions(F, t, [{ t0: T(4, 2), pos: add3(CRYP, [0, 0.8, 0]), n: 120, speed: 12, life: 1.6, size: 0.18, seed: 401, palette: 'spark', color: CRY2, up: 0.4, grav: 3, glow: 1.2, ring: 9, col: [150, 235, 255] },
    { t0: T(4, 2), pos: CRYP, n: 60, speed: 8, life: 1.4, size: 0.3, seed: 402, palette: 'snow', up: 0.7 }]);
  const c = add3(lerp3(H0, CRYP, 0.5), [0, 1.3, 0]);
  F.cam = lt < 2 ? mkCam(add3(c, [-0.6 - lt * 0.3, -0.6, 5.2 - lt * 0.4]), add3(c, [0, 0.8, 0]), 0.9)
    : mkCam(orbit(c, 4.6 - (lt - 2) * 0.4, -0.2 - (lt - 2) * 0.5, 0.4 + (lt - 2) * 0.3), add3(c, [0, 0.4, 0]), 0.95);
  F.env = ENV.frost; snowfall(F, H0, t, 50, 8); F.bloom = 0.25;
}
const SL0 = [44.0, H0[1], 20.6];
function slidePos(u) {
  const x = lerp(SL0[0], BANK[0], u), z = lerp(SL0[2], BANK[2], u);
  return [x, Math.max(ys(x, z), hAt(x, z) - 0.2) + 0.15 + 0.6 * Math.sin(Math.PI * clamp((u - 0.45) / 0.25)) * (u > 0.45 && u < 0.7 ? 1 : 0), z];
}
function shotSlide(t, F) { // c5: descida sem freio
  const u = clamp((t - T(5)) / BAR), p = slidePos(eIO(u) * 0.85 + u * 0.15);
  const r = hero(F, { pos: p, yaw: -Math.PI / 2 + Math.sin(t * 5) * 0.15, jump: 0.35, lean: 0.35, armL: -1.5, armR: -0.9, scarf: t });
  pushCrystal(F, r.hand, 0.35, t, 0.8);
  for (let k = 0; k < 8; k++) Wd.pushExplosion(F.dyn, { t0: T(5, k * 0.5), pos: add3(slidePos(clamp((T(5, k * 0.5) - T(5)) / BAR)), [0.4, 0, 0]), n: 26, speed: 5, life: 0.7, size: 0.16, seed: 450 + k, palette: 'snow', up: 0.8, grav: 6 }, t);
  const c = add3(p, [0, 1, 0]);
  F.cam = mkCam(add3(c, [3.6 - u * 1.0, 2.2 + u * 1.8, -3.6 + u * 1.5]), add3(c, [-2.5, -0.4, 0]), 0.9);
  F.env = E.envLerp(ENV.frost, ENV.gold, u * 0.5); F.speed = 0.7; F.mb = 0.2; F.bloom = 0.25; snowfall(F, p, t, 40, 9, 6);
}
const EYE_Z = 30;
function shotPause(t, F) { // c6-7: calmaria e o rio que respira
  const u = clamp((t - T(6)) / (2 * BAR));
  F.env = E.envLerp(ENV.sunset, ICE, smooth((t - T(7, 0.5)) / (2.5 * B)) * 0.9);
  const r = hero(F, { pos: BANK, yaw: -Math.PI / 2, sit: true, armR: -0.9, armL: -0.7, scarf: t * 0.4 });
  pushCrystal(F, r.hand, 0.35, t, t > T(7) ? 1.2 + 0.5 * Math.sin(t * 20) : 0.6);
  bit(F, add3(BANK, [0.3, 1.9, -1.0]), -Math.PI / 2, t);
  if (t > T(7)) {
    F.shake += 12 * smooth((t - T(7)) / BAR);
    const g = smooth((t - T(7)) / (3 * B)); // rachaduras brilhantes no rio
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9 + 0.3, len = g * (1.5 + hash(k) * 3);
      const c = [RX(EYE_Z) + Math.cos(a) * len / 2, world.WATER_Y + 0.03, EYE_Z + Math.sin(a) * len / 2];
      E.pushBox(F.dyn, c, [len / 2, 0.015, 0.05], Ry(-a), TITAN.core, K.EMIS, 820 + k);
    }
    for (let k = 0; k < 4; k++) Wd.pushExplosion(F.dyn, { t0: T(7, k), pos: [RX(EYE_Z) + (k - 1.5), world.WATER_Y, EYE_Z], n: 22, speed: 3, life: 1.2, size: 0.12, seed: 600 + k, palette: 'snow', up: 1, grav: -1 }, t);
  }
  if (t > T(7, 3.0)) { const a = smooth((t - T(7, 3.0)) / (0.4 * B)); for (const sx of [-1.1, 1.1]) E.pushBox(F.dyn, [RX(EYE_Z) + sx, world.WATER_Y + 0.04, EYE_Z], [0.4 * a, 0.02, 0.16 * a], E.I3, TITAN.eye, K.EMIS, 88); }
  F.cam = mkCam(lerp3([RX(17) + 0.5, 7.6, 15.5], [RX(18) + 1.2, 7.0, 17.2], eIO(u)), lerp3(add3(BANK, [0, 1.0, 0]), [RX(EYE_Z), world.WATER_Y, EYE_Z], 0.42), 0.9);
  snowfall(F, BANK, t, 50, 9, 1.5); F.bloom = 0.55;
}
function d2Common(t, F) {
  F.env = ICE;
  if (t < TSTRIKE + 0.2) {
    const P = Object.assign({ pos: titanPos(t), yaw: Math.PI, walk: t > T(9) && t < T(10) ? (t - T(9)) * 7 : null, white: t > TSTRIKE ? clamp((t - TSTRIKE) / 0.2) : 0 }, titanArms(t));
    pushTitan(F, P);
  }
  const P = heroD2(t); const r = hero(F, P);
  if (P.crystal) pushCrystal(F, r.hand, 0.35, t, 1.0);
  if (t < T(10, 1)) bit(F, add3(P.pos, [-0.6, 2.2, 0.6]), P.yaw, t);
  addExplosions(F, t, EXP);
  snowfall(F, P.pos, t, 50, 10, 3);
  F.bloom = 0.6;
  return P;
}
const titanHead = t => titanW(t, [0, 2.4, 0]);
function shotRise(t, F) { // c8: o titã sai do rio
  const lt = (t - T(8)) / B; d2Common(t, F);
  if (lt < 2.2) F.cam = mkCam(add3(BANK, [2.6, 1.0, -4.2]), lerp3(add3(BANK, [0, 1.6, 0]), titanHead(t), 0.75), 0.78);
  else { const s = (lt - 2.2) / 1.8; F.cam = mkCam([RX(26) - 14 - s * 2, 9 + s * 2, 18 - s * 2], lerp3(BANK, titanHead(t), 0.55), 0.9); }
  F.shake += 8;
}
function shotChase(t, F) { // c9: corre!
  const lt = (t - T(9)) / B; const P = d2Common(t, F);
  if (lt < 2) { F.cam = mkCam(add3(P.pos, [0.9, 1.5, -5.4]), add3(P.pos, [0, 2.2, 3]), 0.85); F.roll = Math.sin(t * 9) * 0.03; }
  else { const s = (lt - 2) / 2; F.cam = mkCam([RX(16) + 16 - s * 3, 20 - s * 3, 6 + s * 2], lerp3(P.pos, titanPos(t), 0.45), 0.95); }
  F.speed = 0.4;
}
function shotSlam(t, F) { // c10: soco no chão, onda de gelo, "NÃO HOJE."
  const lt = (t - T(10)) / B; const P = d2Common(t, F);
  if (lt < 1) F.cam = mkCam([RX(13) - 9, 13, 7], lerp3(FIST, PLAUNCH, 0.45), 0.95);
  else if (lt < 2.2) { const s = (lt - 1) / 1.2; F.cam = mkCam(orbit(add3(P.pos, [0, 1, 0]), 6.5 - s, 2.4 + s * 1.2, 2.2 - s), add3(P.pos, [0, 1, 0]), 0.9); F.ca = 0.6; F.roll = 0.08 - s * 0.12; }
  else { const s = (lt - 2.2) / 1.8, fwd = [Math.sin(P.yaw), 0, Math.cos(P.yaw)], c = add3(PLAND, [0, 1.5, 0]); F.cam = mkCam(add3(c, [fwd[0] * 2.8 + 0.7, -0.8 + s * 0.3, fwd[2] * 2.8 - 0.5]), add3(c, [0, 0.3, 0]), 1.05); }
}
function shotLeap(t, F) { // c11: salto em câmera lenta
  const u = (t - T(11)) / BAR; const P = d2Common(t, F); const c = add3(P.pos, [0, 1.1, 0]);
  F.cam = mkCam(orbit(c, 4.6, 0.6 + Math.PI * 2 * eIO(u) * 0.9, 0.4 + Math.sin(u * Math.PI) * 1.4), c, 0.92);
  for (let k = 0; k < 30; k++) { const s = 700 + k; E.pushBox(F.dyn, add3(c, [(hash(s) - 0.5) * 8, (hash(s + 1) - 0.5) * 6 + Math.sin(t + k) * 0.3, (hash(s + 2) - 0.5) * 8]), [0.07, 0.07, 0.07], Ry(t * 2 + k), CRY2, K.EMIS, s); }
  F.speed = 0.25 + 0.4 * (1 - Math.sin(u * Math.PI));
}
function shotStrike(t, F) { // c12: golpe no núcleo, o titã se estilhaça
  const lt = (t - T(12)) / B; d2Common(t, F);
  if (lt < 0.9) { const c = lerp3(PSTRIKE, CORE, 0.5); F.cam = mkCam(add3(c, [8, 1.5, -4]), c, 0.95); }
  else { const s = eOutC((lt - 0.9) / 3.1); F.cam = mkCam(lerp3([RX(26) + 14, 14, 10], [RX(26) + 26, 22, 0], s), [RX(26), 9, 25], 0.9); }
}
function shotAfter(t, F) { // c13: chuva de gelo, o céu abre
  const lt = (t - T(13)) / B; const P = d2Common(t, F); const u = clamp(lt / 4);
  F.env = E.envLerp(ICE, ENV.gold, smooth(u * 1.2));
  for (let k = 0; k < 70; k++) { const s = 900 + k, shine = hash(s + 3) < 0.35; E.pushBox(F.dyn, [PFIN[0] + (hash(s) - 0.5) * 30, 30 - ((t - T(12) + hash(s + 2) * 3) * 14) % 32, PFIN[2] + (hash(s + 1) - 0.5) * 30], [0.18, 0.18, 0.18], mm(Ry(t * 3 + k), Rx(t * 2)), shine ? CRY2 : TITAN.body, shine ? K.EMIS : K.PLAIN, s); }
  const fwd = [Math.sin(P.yaw), 0, Math.cos(P.yaw)], c = add3(PFIN, [0, 1, 0]);
  F.cam = mkCam(add3(c, [fwd[0] * 4.5 + 1.5, -0.4 + u * 1.5, fwd[2] * 4.5 - 1]), add3(c, [0, 0.4, 0]), 0.9);
}
function shotOutro(t, F) { // c14-15: vitória ao amanhecer
  const u = clamp((t - T(14)) / (2 * BAR)), yaw = -Math.PI / 2 + 0.5;
  F.env = ENV.gold;
  hero(F, { pos: PFIN, yaw, armR: -2.9, armL: -0.2, sword: 1, scarf: t });
  pushCrystal(F, add3(PFIN, [Math.cos(yaw) * 0.9 - 0.3, 2.3 + Math.sin(t * 2) * 0.1, -Math.sin(yaw) * 0.9]), 0.45, t, 1.0);
  bit(F, add3(PFIN, [-Math.cos(yaw) * 0.9, 2.0, Math.sin(yaw) * 0.9]), yaw, t);
  const fwd = [Math.sin(yaw), 0, Math.cos(yaw)], back = lerp(5, 13, eOutC(u)), c = add3(PFIN, [0, 1.6, 0]);
  F.cam = mkCam(add3(c, [fwd[0] * back + 1.5, lerp(0.2, 4.5, eOutC(u)), fwd[2] * back - 1.2]), add3(c, [0, lerp(0.6, 2.5, u), 0]), 0.95);
  snowfall(F, PFIN, t, 40, 9, 1.2); F.bloom = 0.25;
}
function shotAtD2(t, F) {
  if (t < T(9)) return shotRise(t, F); if (t < T(10)) return shotChase(t, F); if (t < T(11)) return shotSlam(t, F);
  if (t < T(12)) return shotLeap(t, F); if (t < T(13)) return shotStrike(t, F); return shotAfter(t, F);
}
function shotHook(t, F) { // c0: flash-forward do clímax e rewind
  const lt = (t - T(0)) / B;
  const tc = lt >= 2 ? TC - Math.pow(lt - 2, 1.5) * 2.4 : TC;
  shotAtD2(tc, F);
  const P = heroD2(tc), toC = norm3(sub3(CORE, P.pos)), side = norm3([toC[2], 0, -toC[0]]);
  F.cam = mkCam(add3(add3(P.pos, mul3(side, 4.5 + (lt < 2 ? lt * 0.3 : 0.6))), add3(mul3(toC, -6.5), [0, -1.5, 0])), lerp3(add3(P.pos, [0, 0.9, 0]), titanHead(tc), 0.45), 0.85);
  F.speed = 0.3; F.roll = -0.05; F.shake = lt < 2 ? 2 : 8;
}
function shot(t, F) {
  const bar = Math.floor(t / BAR);
  if (bar < 1) return shotHook(t, F); if (bar < 2) return shotBuild(t, F); if (bar < 3) return shotFly(t, F);
  if (bar < 4) return shotReveal(t, F); if (bar < 5) return shotCrystal(t, F); if (bar < 6) return shotSlide(t, F);
  if (bar < 8) return shotPause(t, F); if (bar < 14) return shotAtD2(t, F); return shotOutro(t, F);
}

// ---------------- FX globais na batida (bumbos reais da trilha) ----------------
let KICKS = [];
try { KICKS = JSON.parse(fs.readFileSync(__dirname + '/kicks_titan.json', 'utf8')); } catch (e) { }
const FLASH = [[T(2), 1, 6], [T(3), 0.5, 10], [T(4, 2), 1, 5], [T(5), 0.4, 10], [T(6), 0.4, 4], [T(8), 1, 4], [T(9), 0.4, 10], [T(10), 1, 4], [T(11), 0.4, 8], [T(12), 1, 2.5], [T(14), 0.8, 7]];
const GLITCH = [[T(1), 0.3], [T(2), 0.25], [T(3), 0.15], [T(5), 0.12], [T(6), 0.3], [T(8), 0.4], [T(10), 0.3], [T(12), 0.35]];
const BLACK = [[T(1, 3), T(2)], [T(7, 3.75), T(8)]];
const WHITE = [[T(13, 2.5), T(14)]];
const REWIND = [[T(0, 2), T(0, 3.4)]];
const LOOP_TAIL = T(15, 2.6);

// ---------------- legendas ----------------
const { YEL, ORA, RED, CYA, WHT } = COL;
const CAPS = [
  { t0: 0, t1: T(0, 2), y: 0.17, style: 'hook', lines: [['ELE ACORDOU', WHT, 120], ['O GIGANTE ERRADO', CYA, 120]] },
  { t0: T(0, 3.4), t1: T(1, 2.9), y: 0.2, style: 'glitch', lines: [['5 MINUTOS ANTES', WHT, 96]] },
  { t0: T(2, 0.15), t1: T(2, 3.6), y: 0.24, style: 'pop', lines: [['A MONTANHA', WHT, 104], ['PROIBIDA', CYA, 140]] },
  { t0: T(3, 2), t1: T(3, 3.9), y: 0.22, style: 'pop', lines: [['ELE SUBIU', WHT, 104], ['MESMO ASSIM', YEL, 124]] },
  { t0: T(4, 2.1), t1: T(4, 3.9), y: 0.2, style: 'pop', lines: [['PEGOU O', WHT, 100], ['CRISTAL', CYA, 150]] },
  { t0: T(5, 0.2), t1: T(5, 3.6), y: 0.22, style: 'pop', lines: [['DESCIDA', WHT, 104], ['SEM FREIO', ORA, 136]] },
  { t0: T(6, 0.4), t1: T(6, 3.8), y: 0.26, style: 'soft', lines: [['fácil', WHT, 96], ['demais...', WHT, 96]] },
  { t0: T(7, 1.6), t1: T(7, 3.7), y: 0.27, style: 'shake', lines: [['ATÉ QUE...', RED, 140]] },
  { t0: T(8, 0.6), t1: T(8, 3.8), y: 0.2, style: 'pop', lines: [['O TITÃ', WHT, 124], ['DE GELO', CYA, 156]] },
  { t0: T(9, 0.2), t1: T(9, 1.9), y: 0.2, style: 'pop', lines: [['CORRE!!!', YEL, 150]] },
  { t0: T(10, 2.4), t1: T(10, 3.95), y: 0.22, style: 'pop', lines: [['NÃO HOJE.', CYA, 160]] },
  { t0: T(12, 0.05), t1: T(12, 1.3), y: 0.22, style: 'pop', lines: [['ACABOU.', WHT, 170]] },
  { t0: T(14, 0.2), t1: T(14, 3.4), y: 0.2, style: 'pop', lines: [['ELE VENCEU', WHT, 104], ['O TITÃ', CYA, 150]] },
  { t0: T(14, 3.5), t1: T(15, 2.6), y: 0.22, style: 'pop', lines: [['PARTE 2?', YEL, 170], ['comenta aqui embaixo', WHT, 62]] },
];

module.exports = { BPM, NBARS, FPS: 30, world, shot, KICKS, FLASH, GLITCH, CAPS, BLACK, WHITE, REWIND, LOOP_TAIL };
if (require.main === module) S.run(module.exports);
