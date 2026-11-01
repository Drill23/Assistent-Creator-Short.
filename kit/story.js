// ===== STORY TEMPLATE / EXAMPLE: "A Serpente de Magma" (ep. 1 of "O Último Construtor") =====
// Copy this file and rewrite: world options, characters, explosions, shots, captions. Keep the export contract.
'use strict';
const E = require('./lib/engine');
const Wd = require('./lib/world');
const S = require('./lib/studio');
const { K, clamp, lerp, smooth, eOutC, eInC, eIO, hash, add3, sub3, mul3, norm3, lerp3 } = E;
const { ENV, orbit, crPath, addExplosions, COL } = S;

// ---------------- timing (must match music spec) ----------------
const BPM = 138, NBARS = 19;
const { B, BAR, T } = S.timing(BPM);

// ---------------- world ----------------
const world = Wd.buildWorld({ seed: 1, hill: [14, 46, 18], tower: { x0: 18, z0: 41, top: 27 }, riverBase: 34, clearBanks: 11, avoid: [[18, 43, 4]] });
const hAt = world.heightAt, mkCam = S.camFactory(world);
const HERO = { visor: [110, 245, 255], jacket: [214, 112, 38], scarf: [205, 38, 52] }; // hero palette (pass as pal)
const BOSS = { body: [48, 38, 40], glow: [255, 120, 30], eye: [255, 230, 60] };

// ---------------- key places ----------------
const H0 = [14.5, hAt(14.5, 44.5), 44.5];
const FZ = 31.5;
let fx = Math.floor(world.riverX(FZ)); while (world.isWater(fx, Math.floor(FZ))) fx--;
const FISH = [fx + 0.8, world.HM[fx][Math.floor(FZ)], FZ];
const BOBBER = [fx + 4.2, world.WATER_Y + 0.08, FZ + 0.6];
const RCX = world.riverX(36);
const PLAT = world.platforms.map(([x, y, z]) => [x + 0.5, y + 1, z + 0.5]);
const hero = P => { if (!P.pal) P.pal = HERO; return Wd.pushHero(P.dyn, P); };
const bit = (F, p, yaw, t) => Wd.pushCompanion(F.dyn, p, yaw, t);

// ---------------- drop 2 choreography ----------------
function runPos(t) {
  const u = clamp((t - T(12)) / BAR), z = lerp(FZ, 19, u), x = world.riverX(z) - 4.6;
  return [x, (hAt(x, z - 0.6) + hAt(x, z) + hAt(x, z + 0.6)) / 3, z];
}
const PEXP = runPos(T(13));
const PLAND = [PEXP[0] - 3.2, hAt(PEXP[0] - 3.2, PEXP[2] - 2.4), PEXP[2] - 2.4];
const HEAD12 = [RCX + 2, 22, 33];
const HEAD13 = add3(HEAD12, mul3(norm3(sub3(PLAND, HEAD12)), 1.6));
const SP = crPath([
  [T(11) - 4, [RCX, -12, 37]], [T(11) - 1.5, [RCX, -8, 36]], [T(11), [RCX, -2, 35.5]],
  [T(11, 0.6), [RCX + 0.4, 13, 36]], [T(11, 1.4), [RCX + 1, 21, 37]], [T(11, 3), [RCX - 1, 19.5, 35]],
  [T(12), [RCX - 4, 17, 32]], [T(12, 1), [RCX - 13, 14, 27]], [T(12, 2), [RCX - 9, 10, 15]], [T(12, 3), [RCX + 4, 12, 16]],
  [T(13), add3(PEXP, [0.5, 1.6, 2.5])], [T(13, 1.2), [PEXP[0] + 5, 12, PEXP[2] + 6]], [T(13, 2.6), [RCX + 3, 20, 30]],
  [T(14), HEAD12], [T(15), HEAD13], [T(16), HEAD13],
]);
const PSTRIKE = add3(add3(HEAD13, mul3(norm3(sub3(PLAND, HEAD13)), 3.4)), [0, 0.2, 0]);
const PFIN = [world.riverX(25) - 4.6, hAt(world.riverX(25) - 4.6, 25), 25];
const TSTRIKE = T(15), TC = T(14, 2.6);
const SEG_LAG = 0.075, DEATH_STEP = 0.05;

function heroD2(t) {
  if (t < T(12)) { const l = sub3(SP(t), FISH); return { pos: [FISH[0] - 0.4, FISH[1], FISH[2]], yaw: Math.atan2(l[0], l[2]), armL: -0.3, armR: -0.3, scarf: t }; }
  if (t < T(13)) return { pos: runPos(t), yaw: Math.PI + 0.1, run: (t - T(12)) * 16, scarf: t, lean: 0.25 };
  if (t < T(13, 2)) { const s = (t - T(13)) / (2 * B); const p = lerp3(PEXP, PLAND, s); p[1] += 5.5 * Math.sin(Math.PI * s); return { pos: p, yaw: Math.PI + 0.1 + s * 5, jump: 1, armL: -2.5, armR: -2.2, scarf: t, lean: -0.6 + s * 0.6 }; }
  if (t < T(14)) { const s = clamp((t - T(13, 2)) / (0.6 * B)); const l = sub3(SP(t), PLAND); return { pos: PLAND, yaw: Math.atan2(l[0], l[2]), sword: eOutC(s), armR: lerp(0, -1.2, eOutC(s)), armL: -0.2, scarf: t }; }
  if (t < TSTRIKE) { // bullet-time leap: slow in the middle
    const u = (t - T(14)) / BAR, s = 0.45 * u + 0.55 * (0.5 + 4 * Math.pow(u - 0.5, 3));
    const p = lerp3(PLAND, PSTRIKE, s); p[1] += 7 * Math.sin(Math.PI * s); const d = sub3(PSTRIKE, PLAND);
    return { pos: p, yaw: Math.atan2(d[0], d[2]), jump: 1, sword: 1, armR: -2.7, armL: -1.6, scarf: t * 0.5, lean: 0.2, windDown: -0.02 };
  }
  const u = clamp((t - TSTRIKE) / (BAR + B));
  const p = lerp3(PSTRIKE, PFIN, eOutC(u)); p[1] = lerp(PSTRIKE[1], PFIN[1], eInC(u)) + 3 * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u);
  const d = sub3(PFIN, PSTRIKE), sw = clamp((t - TSTRIKE) / 0.15), land = u >= 1;
  return { pos: p, yaw: Math.atan2(d[0], d[2]), jump: land ? 0 : 1, sword: 1, armR: lerp(-2.7, 0.9, eOutC(sw)), armL: land ? 0.6 : -1.2, scarf: t, lean: land ? 0.5 : 0 };
}

// ---------------- explosions ----------------
const EXP = [
  { t0: T(11), pos: [RCX, world.WATER_Y, 35.5], n: 170, speed: 20, life: 2.4, size: 0.26, seed: 11, palette: 'water', up: 0.7, glow: 0.6, ring: 14, col: [190, 230, 255] },
  { t0: T(11), pos: [RCX - 2, world.WATER_Y, 35], n: 90, speed: 16, life: 2.4, size: 0.4, seed: 12, palette: 'dirt', up: 0.7 },
  { t0: T(13), pos: PEXP, n: 200, speed: 18, life: 3.5, size: 0.42, seed: 31, palette: 'mix', glow: 1.6, ring: 16, col: [255, 160, 60], warp: S.slowWarp(T(13), 2 * B, 0.22) },
  { t0: TSTRIKE, pos: HEAD13, n: 260, speed: 24, life: 3.0, size: 0.6, seed: 41, palette: 'mix', mixPal: 'magma', glow: 2.2, ring: 26, col: [255, 200, 120] },
  { t0: T(16, 1), pos: PFIN, n: 60, speed: 9, life: 1.4, size: 0.3, seed: 77, palette: 'dirt', up: 0.2, glow: 0.4, ring: 22, col: [255, 255, 255] },
];
for (let k = 0; k < 4; k++) { const te = T(12, 0.5 + k), hp = runPos(te); EXP.push({ t0: te, pos: [hp[0] + (k % 2 ? 2 : -2), hp[1], hp[2] + 3.2], n: 90, speed: 13, life: 1.6, size: 0.34, seed: 20 + k, palette: 'mix', glow: 1, ring: 9, col: [255, 150, 50] }); }
for (let i = 1; i <= 34; i += 2) { const td = TSTRIKE + i * DEATH_STEP; EXP.push({ t0: td, pos: SP(td - i * SEG_LAG), n: 26, speed: 9, life: 1.8, size: 0.4, seed: 100 + i, palette: 'mix', mixPal: 'magma', glow: 0.7, ring: 0, col: [255, 140, 50] }); }
const FW = [];
for (let k = 0; k < 8; k++) { const c = [[120, 240, 255], [255, 220, 90], [255, 255, 255], [255, 160, 60]][k % 4]; FW.push({ t0: T(7, k * 0.5), pos: [20 + (hash(k * 3) - 0.5) * 16, 33 + hash(k * 3 + 1) * 8, 43 + (hash(k * 3 + 2) - 0.5) * 16], n: 60, speed: 10, life: 1.6, size: 0.14, seed: 500 + k, palette: 'spark', up: 0, grav: 4, glow: 0.45, color: c, col: c, shakeMul: 0.25 }); }

// ---------------- shots ----------------
function idleHero(F, t, yaw = 1.45) {
  hero({ dyn: F.dyn, pos: H0, yaw, armL: Math.sin(t * 2) * 0.05, armR: -Math.sin(t * 2) * 0.05, scarf: t });
  bit(F, add3(H0, [Math.cos(yaw) * 0.9, 2.1, -Math.sin(yaw) * 0.9]), yaw, t);
}
function shotBuild(t, F) { // bars 1-2: world assembles from the sky
  const lt = t - T(1), u = clamp(lt / (2 * BAR));
  F.cam = mkCam(orbit([32, 6, 32], lerp(64, 44, eOutC(u)), 0.5 + u * 1.5, lerp(46, 26, eIO(u))), [32, lerp(2, 8, u), 32]);
  F.env = E.envLerp(ENV.dawn, ENV.day, smooth(u * 1.3));
  F.opt.staticOffset = (Bf, i) => { // per-face y offset; null = hidden.  G = [cx, cz, type(0 terrain,1 tree,2 water,3 cloud,4 platform,5 flower), h]
    const gx = Bf.G[i * 4], gz = Bf.G[i * 4 + 1], ty = Bf.G[i * 4 + 2];
    if (ty === 3) return 0;
    if (ty === 2) { const p = clamp((lt - 2.2) / 0.5); return p <= 0 ? null : -(1 - eOutC(p)) * 3; }
    const delay = Math.hypot(gx - 32, gz - 32) / 46 * 2.0 + E.h2(gx | 0, gz | 0) * 0.18 + (ty === 1 ? 0.3 : 0) + (ty === 5 ? 0.45 : 0) + (ty === 4 ? 0.5 : 0);
    const p = clamp((lt - delay) / 0.42);
    return p <= 0 ? null : 34 * (1 - p * p);
  };
  F.bloom = 0.4;
}
function flyPath(u) { const z = lerp(0, 50, u), x = world.riverX(z) - 1.5 + Math.sin(u * 7) * 2.5; return [x, Math.max(hAt(x, z), world.WATER_Y) + lerp(5.5, 9, u) + Math.sin(u * 9) * 1.2, z]; }
function shotFly(t, F) { // bar 3: FPV flyover
  const u = clamp((t - T(3)) / BAR), uu = 0.05 + u * 0.9;
  const p = flyPath(uu); let tgt = add3(flyPath(uu + 0.06), [0, -2.2, 0]);
  if (u > 0.72) tgt = lerp3(tgt, add3(H0, [0, 2, 0]), smooth((u - 0.72) / 0.28));
  F.cam = mkCam(p, tgt, 0.85);
  F.roll = (flyPath(uu + 0.03)[0] + flyPath(uu - 0.03)[0] - 2 * p[0]) * -0.5;
  F.env = ENV.day; F.speed = 0.9; F.bloom = 0.4;
  idleHero(F, t);
}
function shotReveal(t, F) { // bar 4: rush-in + visor close-up
  const lt = (t - T(4)) / B, yaw = 1.45, fwd = [Math.sin(yaw), 0, Math.cos(yaw)];
  F.env = ENV.day; idleHero(F, t);
  if (lt < 2) {
    const s = eOutC(lt / 1.6);
    F.cam = mkCam(lerp3(add3(H0, [fwd[0] * 22 + 6, 7, fwd[2] * 22 + 4]), add3(H0, [fwd[0] * 3.2 + 1.2, 0.5, fwd[2] * 3.2 + 0.9]), s), add3(H0, [0, lerp(1, 1.3, s), 0]), lerp(0.8, 1.05, s));
    F.mb = 0.55 * (1 - s); F.speed = 0.7 * (1 - s);
  } else {
    const s = (lt - 2) / 2, head = add3(H0, [0, 1.85, 0]);
    F.cam = mkCam(orbit(head, 1.9 - s * 0.3, yaw - 0.9 + s, -0.25), head, 1.1); F.roll = -0.06;
  }
  F.bloom = 0.55;
}
function shotParkour(t, F) { // bar 5: jumps between floating blocks
  const lt = clamp((t - T(5)) / B, 0, 3.999), k = Math.floor(lt), s = lt - k;
  const p = lerp3(PLAT[k], PLAT[k + 1], s); p[1] += 2.4 * Math.sin(Math.PI * s);
  const d = sub3(PLAT[k + 1], PLAT[k]), yaw = Math.atan2(d[0], d[2]);
  hero({ dyn: F.dyn, pos: p, yaw, jump: Math.sin(Math.PI * s), armL: -2.3 * Math.sin(Math.PI * s), armR: 0.8 * Math.sin(Math.PI * s), scarf: t, lean: 0.25 });
  bit(F, add3(p, [-1.2, 2.4, -1.4]), yaw, t);
  for (let j = 1; j < 5; j++) Wd.pushExplosion(F.dyn, { t0: T(5, j), pos: PLAT[j], n: 16, speed: 4, life: 0.6, size: 0.12, seed: 300 + j, palette: 'dirt', up: 0.3 }, t);
  const c = add3(p, [0, 1, 0]);
  F.cam = lt < 2 ? mkCam(add3(c, [5.5, 2.5, -2.5 + lt]), c, 0.9) : mkCam(add3(c, [1.2, -1.6, 5.5]), add3(c, [0, 0.6, 0]), 0.85);
  F.env = ENV.day; F.speed = 0.5;
}
const BUILD_POS = [16.6, hAt(16.6, 43), 43];
function shotTower(t, F) { // bar 6: speed build
  const lt = clamp((t - T(6)) / BAR);
  const n = world.pushTower(F.dyn, t, T(6) + 0.05, 1.55);
  hero({ dyn: F.dyn, pos: BUILD_POS, yaw: Math.PI / 2 - 0.3, armR: -1.4 + Math.sin(t * 34) * 0.7, armL: -0.2, scarf: t });
  bit(F, add3(BUILD_POS, [-0.8, 2.2, 0.8]), 1.2, t);
  const top = world.tower[Math.max(0, n - 1)] || [20, 18, 43], c = [20, lerp(18, top[1], 0.7), 43];
  F.cam = mkCam(orbit(c, 15 - lt * 2, 2.4 + lt * 2.6, 5 + lt * 3), add3(c, [0, 1, 0]), 0.95);
  F.env = ENV.day;
}
const TOPPOS = [20, 27, 43];
function shotLegend(t, F) { // bar 7: fireworks on the tower
  const lt = (t - T(7)) / B;
  world.pushTower(F.dyn, t, T(6) + 0.05, 1.55);
  hero({ dyn: F.dyn, pos: TOPPOS, yaw: Math.PI / 2, armR: -2.9, armL: -0.3, sword: 1, scarf: t });
  bit(F, add3(TOPPOS, [-0.9, 2.2, 0.6]), 1.4, t);
  addExplosions(F, t, FW);
  F.cam = lt < 2 ? mkCam(orbit(add3(TOPPOS, [0, 1.2, 0]), 5 + lt / 2, 1.0 + lt * 0.6, lerp(1.2, 2.4, lt / 2)), add3(TOPPOS, [0, 2.2, 0]), 0.95)
    : mkCam(orbit([20, 24, 43], 26 + (lt - 2) * 5, 1.7 + (lt - 2) * 0.15, 2 + (lt - 2) * 2), [20, 27, 43], 1);
  F.env = E.envLerp(ENV.day, ENV.gold, 0.3); F.bloom = 0.5;
}
function shotTimelapse(t, F) { // bar 8: day -> sunset, whip at the end
  const u = clamp((t - T(8)) / BAR);
  world.pushTower(F.dyn, t, T(6) + 0.05, 1.55); idleHero(F, t);
  F.env = E.envLerp(ENV.day, ENV.sunset, smooth(u * 1.15));
  F.env.sunDir = norm3(lerp3([0.5, 0.55, -0.6], [0.3, 0.09, 1], smooth(u)));
  F.cam = mkCam(orbit([30, 6, 34], 58 - u * 8, -2.5 - u * 0.6, 34 - u * 8), [34, 6, 34], 0.95);
  if (u > 0.85) { const w = (u - 0.85) / 0.15; F.cam = E.camYP(F.cam.pos, F.cam.yaw + eInC(w) * 1.6, F.cam.pitch, 0.95); F.mb = 0.6 * w; }
  F.bloom = 0.5;
}
function shotFishing(t, F) { // bars 9-10: calm breakdown -> rumble
  const u = clamp((t - T(9)) / (2 * BAR));
  F.env = E.envLerp(ENV.sunset, ENV.storm, smooth((t - T(10, 1)) / (2.6 * B)) * 0.85);
  const P = { dyn: F.dyn, pos: FISH, yaw: Math.PI / 2, sit: true, rod: true, armR: -1.1, armL: -0.8, scarf: t * 0.4 };
  hero(P);
  bit(F, add3(FISH, [0.2, 1.9, 1.0]), Math.PI / 2, t);
  const dip = t > T(10, 1.5) ? Math.min(0.6, (t - T(10, 1.5)) * 2) : 0;
  const bob = [BOBBER[0], BOBBER[1] + Math.sin(t * 3) * 0.04 - dip, BOBBER[2]];
  E.pushBox(F.dyn, bob, [0.07, 0.07, 0.07], E.I3, [220, 40, 40], K.PLAIN, 77);
  S.line3D(F, P.rodTip, bob);
  if (t > T(10)) {
    for (let k = 0; k < 4; k++) Wd.pushExplosion(F.dyn, { t0: T(10, k), pos: [RCX + (k - 1.5), world.WATER_Y, 35.5], n: 22, speed: 3, life: 1.2, size: 0.12, seed: 600 + k, palette: 'water', up: 1, grav: -2 }, t);
    F.shake += 14 * smooth((t - T(10)) / BAR);
  }
  if (t > T(10, 3.2)) { const a = smooth((t - T(10, 3.2)) / (0.4 * B)); for (const sx of [-0.9, 0.9]) E.pushBox(F.dyn, [RCX + 0.5, world.WATER_Y + 0.02, 35.5 + sx], [0.3 * a, 0.02, 0.18 * a], E.I3, BOSS.eye, K.EMIS, 88); }
  F.cam = mkCam(lerp3(add3(FISH, [1.9, 1.7, -4.8]), add3(FISH, [1.5, 1.35, -3.4]), eIO(u)), add3(FISH, [1.2, 1.0, 6]), 0.95);
  F.bloom = 0.7;
}
function d2Common(t, F) {
  F.env = ENV.storm;
  let jaw = 0.35 + 0.25 * Math.sin(t * 5);
  if (t < T(12)) jaw = 0.8; else if (t > T(13) - 0.3 && t < T(13, 1)) jaw = 1; else if (t > T(14)) jaw = 1;
  if (t < TSTRIKE + 34 * DEATH_STEP + 0.05) Wd.pushSerpent(F.dyn, SP, t, Object.assign({ jaw, dead: i => t > TSTRIKE + i * DEATH_STEP, lag: SEG_LAG }, BOSS));
  const P = heroD2(t); P.dyn = F.dyn; hero(P);
  if (t < T(13)) bit(F, add3(P.pos, [-0.6, 2.2, 0.6]), P.yaw, t);
  addExplosions(F, t, EXP);
  F.bloom = 0.75;
  return P;
}
function shotEmerge(t, F) { const lt = (t - T(11)) / B; d2Common(t, F); const head = SP(t);
  F.cam = lt < 2 ? mkCam(add3(FISH, [-3.4, 1.2, -2.6]), lerp3([RCX, 6, 35], head, 0.8), 0.78) : mkCam([RCX - 16 + (lt - 2), 7 + (lt - 2) / 2, 47 - (lt - 2)], lerp3(FISH, head, 0.55), 0.85);
  F.shake += 10; }
function shotChase(t, F) { const lt = (t - T(12)) / B; const P = d2Common(t, F);
  if (lt < 2) { F.cam = mkCam(add3(P.pos, [0.8, 1.5, -5.2]), add3(P.pos, [0, 1.6, 3]), 0.85); F.roll = Math.sin(t * 9) * 0.03; }
  else { const s = (lt - 2) / 2; F.cam = mkCam([RCX + 14 - s * 4, 32 - s * 4, 4 + s * 3], lerp3(P.pos, SP(t), 0.5), 0.95); }
  F.speed = 0.4; }
function shotBlast(t, F) { const lt = (t - T(13)) / B; const P = d2Common(t, F);
  if (lt < 2) { const s = lt / 2; F.cam = mkCam(orbit(add3(P.pos, [0, 1, 0]), 7 - s, -2.2 + s * 1.3, 2.6 - s), add3(P.pos, [0, 1, 0]), 0.9); F.ca = 0.6; F.roll = 0.08 - s * 0.12; }
  else { const s = (lt - 2) / 2, fwd = [Math.sin(P.yaw), 0, Math.cos(P.yaw)], c = add3(P.pos, [0, 1.5, 0]); F.cam = mkCam(add3(c, [fwd[0] * 2.8 + 0.8, -0.9 + s * 0.3, fwd[2] * 2.8 - 0.6]), add3(c, [0, 0.3, 0]), 1.05); } }
function shotLeap(t, F) { const u = (t - T(14)) / BAR; const P = d2Common(t, F); const c = add3(P.pos, [0, 1.1, 0]);
  F.cam = mkCam(orbit(c, 4.6, -1.2 + Math.PI * 2 * eIO(u) * 0.9, 0.4 + Math.sin(u * Math.PI) * 1.4), c, 0.92);
  for (let k = 0; k < 30; k++) { const s = 700 + k; E.pushBox(F.dyn, add3(c, [(hash(s) - 0.5) * 8, (hash(s + 1) - 0.5) * 6 + Math.sin(t + k) * 0.3, (hash(s + 2) - 0.5) * 8]), [0.06, 0.06, 0.06], E.Ry(t * 2 + k), [255, 170, 60], K.EMIS, s); }
  F.speed = 0.25 + 0.4 * (1 - Math.sin(u * Math.PI)); }
function shotStrike(t, F) { const lt = (t - T(15)) / B; d2Common(t, F);
  if (lt < 0.9) { const c = lerp3(PSTRIKE, HEAD13, 0.5); F.cam = mkCam(add3(c, [-7, 1.5, 6]), c, 0.95); }
  else { const s = eOutC((lt - 0.9) / 3.1); F.cam = mkCam(lerp3([RCX - 12, 16, 47], [RCX - 26, 24, 58], s), [RCX - 2, 10, 26], 0.9); } }
function shotAfter(t, F) { const lt = (t - T(16)) / B; const P = d2Common(t, F); const u = clamp(lt / 4);
  F.env = E.envLerp(ENV.storm, ENV.gold, smooth(u * 1.2));
  for (let k = 0; k < 70; k++) { const s = 900 + k, ember = hash(s + 3) < 0.4; E.pushBox(F.dyn, [PFIN[0] + (hash(s) - 0.5) * 30, 30 - ((t - T(15) + hash(s + 2) * 3) * 14) % 32, PFIN[2] + (hash(s + 1) - 0.5) * 30], [0.18, 0.18, 0.18], E.mm(E.Ry(t * 3 + k), E.Rx(t * 2)), ember ? [255, 140, 50] : BOSS.body, ember ? K.EMIS : K.PLAIN, s); }
  const fwd = [Math.sin(P.yaw), 0, Math.cos(P.yaw)], c = add3(PFIN, [0, 1, 0]);
  F.cam = mkCam(add3(c, [fwd[0] * 4.5 + 1.5, -0.4 + u * 1.5, fwd[2] * 4.5 - 1]), add3(c, [0, 0.4, 0]), 0.9); }
function shotOutro(t, F) { // bars 17-18
  const u = clamp((t - T(17)) / (2 * BAR)), dir = norm3([0.3, 0, -1]);
  world.pushTower(F.dyn, t, T(6) + 0.05, 1.55); idleHero(F, t, Math.atan2(dir[0], dir[2]));
  F.env = ENV.gold;
  const back = lerp(5, 8.5, eOutC(u));
  F.cam = mkCam(add3(H0, [-dir[0] * back - 1.6, lerp(3, 6, eOutC(u)), -dir[2] * back]), add3(H0, [dir[0] * 20, -7, dir[2] * 20]), 0.95);
  F.bloom = 0.4;
}
function shotAtD2(t, F) {
  if (t < T(12)) return shotEmerge(t, F); if (t < T(13)) return shotChase(t, F); if (t < T(14)) return shotBlast(t, F);
  if (t < T(15)) return shotLeap(t, F); if (t < T(16)) return shotStrike(t, F); return shotAfter(t, F);
}
function shotHook(t, F) { // bar 0: flash-forward to the climax, then rewind
  const lt = (t - T(0)) / B;
  const tc = lt >= 2 ? TC - Math.pow(lt - 2, 1.5) * 2.6 : TC;
  shotAtD2(tc, F);
  const P = heroD2(tc), hd = SP(tc), toH = norm3(sub3(hd, P.pos)), side = norm3([toH[2], 0, -toH[0]]);
  F.cam = mkCam(add3(add3(P.pos, mul3(side, 2.2 + (lt < 2 ? lt * 0.25 : 0.5))), add3(mul3(toH, -3.6), [0, 0.2, 0])), lerp3(add3(P.pos, [0, 0.6, 0]), hd, 0.22), 0.9);
  F.speed = 0.3; F.roll = -0.05; F.shake = lt < 2 ? 3 : 8;
}
function shot(t, F) {
  const bar = Math.floor(t / BAR);
  if (bar < 1) return shotHook(t, F); if (bar < 3) return shotBuild(t, F); if (bar < 4) return shotFly(t, F);
  if (bar < 5) return shotReveal(t, F); if (bar < 6) return shotParkour(t, F); if (bar < 7) return shotTower(t, F);
  if (bar < 8) return shotLegend(t, F); if (bar < 9) return shotTimelapse(t, F); if (bar < 11) return shotFishing(t, F);
  if (bar < 17) return shotAtD2(t, F); return shotOutro(t, F);
}

// ---------------- global FX (beat-synced) ----------------
const KICKS = [];
for (const b of [2, 2.5, 3, 3.25, 3.5, 3.75]) KICKS.push([T(0, b), 0.5]);
for (let bar = 1; bar < 3; bar++) for (let b = 0; b < 4; b++) if (!(bar === 2 && b === 3)) KICKS.push([T(bar, b), 0.45]);
for (let bar = 3; bar < 9; bar++) for (let b = 0; b < 4; b++) KICKS.push([T(bar, b), 1]);
for (let bar = 11; bar < 17; bar++) for (let b = 0; b < 4; b++) KICKS.push([T(bar, b), 1.2]);
for (let b = 0; b < 3; b++) KICKS.push([T(18, b), 0.4]);
const FLASH = [[T(3), 1, 6], [T(4), 0.5, 10], [T(4, 2), 0.35, 12], [T(5), 0.4, 10], [T(5, 2), 0.3, 12], [T(6), 0.4, 10], [T(7), 0.5, 8], [T(7, 2), 0.3, 10], [T(8), 0.3, 10], [T(9), 0.5, 4],
  [T(11), 1, 5], [T(11, 2), 0.4, 10], [T(11, 2.5), 0.25, 14], [T(12, 2), 0.35, 10], [T(13), 1, 4], [T(13, 2), 0.4, 8], [T(14), 0.5, 8], [T(15), 1, 2.5], [T(17), 1, 2]];
const GLITCH = [[T(1), 0.3], [T(3), 0.25], [T(4), 0.15], [T(4, 2), 0.15], [T(5, 2), 0.12], [T(9), 0.3], [T(11), 0.4], [T(13), 0.3], [T(15), 0.35]];
const BLACK = [[T(2, 3), T(3)], [T(10, 3.75), T(11)]];
const WHITE = [[T(16, 2.5), T(17)]];
const REWIND = [[T(0, 2), T(0, 3.4)]];
const LOOP_TAIL = T(18, 2.6);

// ---------------- captions (PT-BR) ----------------
const { YEL, ORA, RED, CYA, WHT } = COL;
const CAPS = [
  { t0: 0, t1: T(0, 2), y: 0.17, style: 'hook', lines: [['COMO ELE', WHT, 132], ['CHEGOU AQUI?', YEL, 132]] },
  { t0: T(0, 3.4), t1: T(1, 3.5), y: 0.2, style: 'glitch', lines: [['12 HORAS ANTES', WHT, 96]] },
  { t0: T(2, 0), t1: T(2, 1), y: 0.42, style: 'count', lines: [['3', WHT, 380]] },
  { t0: T(2, 1), t1: T(2, 2), y: 0.42, style: 'count', lines: [['2', YEL, 380]] },
  { t0: T(2, 2), t1: T(2, 3), y: 0.42, style: 'count', lines: [['1', RED, 380]] },
  { t0: T(2, 3), t1: T(3), y: 0.46, style: 'still', lines: [['AGORA.', WHT, 120]] },
  { t0: T(3, 0.15), t1: T(3, 3.6), y: 0.25, style: 'pop', lines: [['BEM-VINDO AO', WHT, 78], ['MUNDO CÚBICO', YEL, 128]] },
  { t0: T(4, 2), t1: T(4, 3.9), y: 0.24, style: 'pop', lines: [['O ÚLTIMO', WHT, 110], ['CONSTRUTOR', ORA, 136]] },
  { t0: T(5, 0.3), t1: T(5, 1.9), y: 0.22, style: 'pop', lines: [['NÍVEL:', WHT, 90], ['IMPOSSÍVEL', CYA, 130]] },
  { t0: T(6, 0.25), t1: T(6, 3.8), y: 0.2, style: 'pop', lines: [['CONSTRUIU ISSO', WHT, 96], ['EM 2 SEGUNDOS', YEL, 112]] },
  { t0: T(7, 0.1), t1: T(7, 1.9), y: 0.24, style: 'pop', lines: [['LENDÁRIO', YEL, 150]] },
  { t0: T(8, 1.8), t1: T(8, 3.6), y: 0.3, style: 'soft', lines: [['mas nada', WHT, 96], ['dura pra sempre...', WHT, 96]] },
  { t0: T(9, 0.4), t1: T(9, 3.9), y: 0.25, style: 'soft', lines: [['tudo estava', WHT, 92], ['em paz...', WHT, 92]] },
  { t0: T(10, 1.6), t1: T(10, 3.7), y: 0.28, style: 'shake', lines: [['ATÉ QUE...', RED, 140]] },
  { t0: T(11, 0.25), t1: T(11, 3.8), y: 0.2, style: 'pop', lines: [['A SERPENTE', WHT, 112], ['DE MAGMA', RED, 150]] },
  { t0: T(12, 0.2), t1: T(12, 1.9), y: 0.2, style: 'pop', lines: [['CORRE!!!', YEL, 150]] },
  { t0: T(13, 2.4), t1: T(13, 3.95), y: 0.22, style: 'pop', lines: [['NÃO HOJE.', CYA, 160]] },
  { t0: T(15, 0.05), t1: T(15, 1.3), y: 0.22, style: 'pop', lines: [['ACABOU.', WHT, 170]] },
  { t0: T(17, 0.2), t1: T(17, 2.4), y: 0.2, style: 'pop', lines: [['ELE SALVOU O', WHT, 96], ['MUNDO CÚBICO', YEL, 120]] },
  { t0: T(17, 2.5), t1: T(18, 2.6), y: 0.22, style: 'pop', lines: [['PARTE 2?', YEL, 170], ['comenta aqui embaixo', WHT, 62]] },
];

module.exports = { BPM, NBARS, FPS: 30, world, shot, KICKS, FLASH, GLITCH, CAPS, BLACK, WHITE, REWIND, LOOP_TAIL };
if (require.main === module) S.run(module.exports);
