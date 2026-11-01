// ===== World toolkit: parametric terrain + original characters + particles =====
'use strict';
const E = require('./engine');
const { K, clamp, lerp, hash, h2, h3, mm, mv, Rx, Ry, Rz, add3, sub3, mul3, norm3, FaceBuf, pushVoxel, pushBox, I3 } = E;

const keyOf = (x, y, z) => (x + 200) * 1000000 + (y + 200) * 1000 + (z + 200);
const jit = (c, s, a = 0.08) => { const m = 1 + (hash(s) - 0.5) * a * 2; return [c[0] * m, c[1] * m, c[2] * m]; };

const BASE_PAL = {
  grass: [96, 168, 52], dirt: [134, 96, 67], stone: [122, 122, 128], sand: [222, 208, 160],
  water: [36, 96, 178], wood: [104, 78, 46], leaf: [52, 118, 38], cloud: [252, 250, 255],
  brick: [150, 146, 140], snow: [240, 245, 250], cactus: [70, 140, 60],
  flowers: [[230, 50, 50], [250, 220, 60], [245, 245, 245], [180, 90, 230]],
};

/*
 buildWorld(opts) -> world object. Options (all optional):
  seed: int            different seed = different landscape
  size: 64             world is size x size columns
  palette: {...}       override BASE_PAL colours (e.g. desert: grass->sand tones; nether: grass->[120,40,40], water->lava-ish)
  waterKind: 'water'|'lava'   lava = emissive orange liquid
  river: true, riverBase: 34, riverAmp: 5   river meanders along z near x=riverBase
  hill: [x, z, height] | null   a tall plateau hill (hero vantage point)
  trees: 'oak'|'pine'|'cactus'|'none', treeDensity: 0.045
  snowLine: null | y   tops at/above y become snow
  clouds: 26, cloudY: 38, flowers: 140
  platforms: true      5 floating parkour blocks over the river
  tower: {x0, z0, top} | null   speed-build tower footprint (4x4)
  avoid: [[x,z,r],...] keep trees out of these circles (camera paths, hero spots)
  clearBanks: 7        no trees closer than this to the river (raise to ~11 when cameras fly low along the banks)
  relief: 8            terrain roughness
*/
function buildWorld(o = {}) {
  const seed = o.seed || 1;
  const WS = o.size || 64;
  const P = Object.assign({}, BASE_PAL, o.palette || {});
  E.setGrassSide(P.grass.map(v => v * 0.99));
  const so = seed * 1013, sz = seed * 7919;
  const vn = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = h2(xi + so, zi + sz), b = h2(xi + 1 + so, zi + sz), c = h2(xi + so, zi + 1 + sz), d = h2(xi + 1 + so, zi + 1 + sz);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
  const fbm = (x, z) => 0.55 * vn(x, z) + 0.3 * vn(x * 2.1 + 5, z * 2.1 + 3) + 0.15 * vn(x * 4.3 + 9, z * 4.3 + 1);
  const useRiver = o.river !== false;
  const rb = o.riverBase != null ? o.riverBase : WS * 0.53, ra = o.riverAmp != null ? o.riverAmp : 5;
  const ph = seed * 0.37;
  const riverX = z => rb + ra * Math.sin(z * 0.11 + ph) + 2 * Math.sin(z * 0.27 + 1 + ph * 2);
  const HILL = o.hill === null ? null : (o.hill || [Math.round(WS * 0.22), Math.round(WS * 0.72), 18]);
  const WATER_Y = 4.6;
  const relief = o.relief != null ? o.relief : 8;

  const HM = [];
  for (let x = 0; x < WS; x++) {
    HM[x] = [];
    for (let z = 0; z < WS; z++) {
      let h = 5 + fbm(x * 0.07, z * 0.07) * relief;
      if (HILL) {
        const dx = x + 0.5 - HILL[0], dz = z + 0.5 - HILL[1];
        const dh = Math.hypot(dx, dz);
        const steep = dx > 0 ? 1.6 : 1.05;
        h = Math.max(h, HILL[2] - Math.max(0, dh - 3.2) * steep);
      }
      if (useRiver) {
        const dr = Math.abs(x + 0.5 - riverX(z + 0.5));
        if (dr < 2.6) h = 2;
        else if (dr < 5.8) h = Math.min(h, 5 + (dr - 2.6) * 0.8);
      }
      HM[x][z] = Math.floor(h);
    }
  }
  const isWater = (x, z) => x >= 0 && z >= 0 && x < WS && z < WS && HM[x][z] <= 2;
  const heightAt = (x, z) => { const xi = clamp(Math.floor(x), 0, WS - 1), zi = clamp(Math.floor(z), 0, WS - 1); return isWater(xi, zi) ? WATER_Y : HM[xi][zi]; };
  const solidTerrain = (x, y, z) => x >= 0 && z >= 0 && x < WS && z < WS && y >= 0 && y < HM[x][z];

  const statics = new FaceBuf(32000);
  // ---- trees ----
  const treeSet = new Map(); const trees = [];
  const avoid = (o.avoid || []).slice();
  if (HILL) avoid.push([HILL[0], HILL[1], 6]);
  const tKind = o.trees || 'oak', dens = o.treeDensity != null ? o.treeDensity : 0.045;
  if (tKind !== 'none') for (let x = 2; x < WS - 2; x++) for (let z = 2; z < WS - 2; z++) {
    const h = HM[x][z];
    if (h < 6 || h > 13) continue;
    if (useRiver && Math.abs(x + 0.5 - riverX(z + 0.5)) < (o.clearBanks || 7)) continue;
    if (avoid.some(a => Math.hypot(x - a[0], z - a[1]) < a[2])) continue;
    if (h2(x * 3 + 1 + so, z * 7 + 2 + sz) > dens) continue;
    if (trees.some(t => Math.abs(t[0] - x) < 4 && Math.abs(t[1] - z) < 4)) continue;
    trees.push([x, z, h]);
  }
  for (const [x, z, h] of trees) {
    const put = (xx, y, zz, t) => { const k = keyOf(xx, y, zz); if (!treeSet.has(k)) treeSet.set(k, { t, x: xx, y, z: zz, tree: [x, z] }); };
    if (tKind === 'cactus') { const th = 2 + Math.floor(h2(x, z) * 3); for (let y = h; y < h + th; y++) put(x, y, z, 'c'); continue; }
    const th = (tKind === 'pine' ? 5 : 4) + Math.floor(h2(x, z) * 2);
    for (let y = h; y < h + th; y++) put(x, y, z, 'w');
    if (tKind === 'pine') {
      for (let ly = h + 2; ly < h + th + 2; ly++) {
        const r = Math.max(0, Math.floor((h + th + 1 - ly) / 2));
        for (let lx = -r; lx <= r; lx++) for (let lz = -r; lz <= r; lz++) {
          if (Math.abs(lx) + Math.abs(lz) > r + (r > 1 ? 1 : 0)) continue;
          if (lx === 0 && lz === 0 && ly < h + th) continue;
          put(x + lx, ly, z + lz, 'l');
        }
      }
    } else {
      for (let ly = h + th - 2; ly < h + th + 2; ly++) {
        const r = ly >= h + th ? 1 : 2;
        for (let lx = -r; lx <= r; lx++) for (let lz = -r; lz <= r; lz++) {
          if (r === 2 && Math.abs(lx) === 2 && Math.abs(lz) === 2 && h3(x + lx, ly, z + lz) > 0.4) continue;
          if (lx === 0 && lz === 0 && ly < h + th) continue;
          put(x + lx, ly, z + lz, 'l');
        }
      }
    }
  }
  const solidTree = (x, y, z) => treeSet.has(keyOf(x, y, z)) || solidTerrain(x, y, z);
  const waterCol = P.water, lava = o.waterKind === 'lava';

  // ---- terrain faces ----
  for (let x = 0; x < WS; x++) for (let z = 0; z < WS; z++) {
    const h = HM[x][z];
    const g = [x + 0.5, z + 0.5, 0, h];
    const dr = useRiver ? Math.abs(x + 0.5 - riverX(z + 0.5)) : 99;
    const sandy = dr < 3.9 && h <= 5;
    const snowy = o.snowLine != null && h >= o.snowLine;
    const rocky = !snowy && HILL && h >= HILL[2] - 2 && h2(x + so, z) > 0.75;
    const s = x * 64 + z + seed * 4096;
    const topCol = snowy ? jit(P.snow, s, 0.03) : sandy ? jit(P.sand, s) : rocky ? jit(P.stone, s) : jit(P.grass, s, 0.06);
    const topK = snowy ? K.PLAIN : sandy ? K.SAND : rocky ? K.STONE : K.GRASS_TOP;
    if (h > 2) statics.push([x, h, z, x + 1, h, z, x + 1, h, z + 1, x, h, z + 1], [0, 1, 0], topCol, topK, s * 11, g);
    else statics.push([x, 2, z, x + 1, 2, z, x + 1, 2, z + 1, x, 2, z + 1], [0, 1, 0], jit(P.sand, s), K.SAND, s * 11, g);
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let f = 0; f < 4; f++) {
      const nx = x + nb[f][0], nz = z + nb[f][1];
      const out = nx < 0 || nz < 0 || nx >= WS || nz >= WS;
      let nh = out ? -3 : HM[nx][nz];
      if (!out && isWater(nx, nz)) nh = Math.max(nh, 4);
      if (nh >= h) continue;
      for (let y = nh; y < h; y++) {
        let p, n;
        if (f === 0) { p = [x + 1, y + 1, z + 1, x + 1, y + 1, z, x + 1, y, z, x + 1, y, z + 1]; n = [1, 0, 0]; }
        else if (f === 1) { p = [x, y + 1, z, x, y + 1, z + 1, x, y, z + 1, x, y, z]; n = [-1, 0, 0]; }
        else if (f === 2) { p = [x, y + 1, z + 1, x + 1, y + 1, z + 1, x + 1, y, z + 1, x, y, z + 1]; n = [0, 0, 1]; }
        else { p = [x + 1, y + 1, z, x, y + 1, z, x, y, z, x + 1, y, z]; n = [0, 0, -1]; }
        const ss = s * 31 + y * 7 + f;
        let col, kd;
        if (y === h - 1 && topK === K.GRASS_TOP) { col = jit(P.dirt, ss, 0.05); kd = K.GRASS_SIDE; }
        else if (y === h - 1 && (sandy || snowy)) { col = jit(snowy ? P.snow : P.sand, ss); kd = K.PLAIN; }
        else if (y >= h - 4 && !rocky) { col = jit(P.dirt, ss); kd = K.PLAIN; }
        else { col = jit(P.stone, ss); kd = K.STONE; }
        statics.push(p, n, col, kd, ss, g);
      }
    }
    if (isWater(x, z)) statics.push([x, WATER_Y, z, x + 1, WATER_Y, z, x + 1, WATER_Y, z + 1, x, WATER_Y, z + 1], [0, 1, 0], waterCol, lava ? K.EMIS : K.WATER, s, [x + 0.5, z + 0.5, 2, 0]);
  }
  // ---- tree faces ----
  for (const v of treeSet.values()) {
    const s = keyOf(v.x, v.y, v.z) % 100000;
    const g = [v.tree[0] + 0.5, v.tree[1] + 0.5, 1, v.y];
    if (v.t === 'w') pushVoxel(statics, v.x, v.y, v.z, [jit(P.wood, s), jit(P.wood, s + 1), P.wood], [K.WOOD, K.WOOD, K.WOOD], s, solidTree, g);
    else if (v.t === 'c') { const c = jit(P.cactus, s, 0.05); pushVoxel(statics, v.x, v.y, v.z, [c, c, c], [K.LEAF, K.LEAF, K.LEAF], s, solidTree, g, 0.8); }
    else { const c = jit(P.leaf, s, 0.12); pushVoxel(statics, v.x, v.y, v.z, [c, c, c], [K.LEAF, K.LEAF, K.LEAF], s, solidTree, g); }
  }
  // ---- clouds ----
  const cloudSet = new Set(); const cy = o.cloudY || 38;
  const nCl = o.clouds != null ? o.clouds : 26;
  for (let i = 0; i < nCl; i++) {
    const cx = Math.floor(-40 + hash(i * 5 + 1 + so) * (WS + 86)), cz = Math.floor(-40 + hash(i * 5 + 2 + so) * (WS + 86));
    const w = 4 + Math.floor(hash(i * 5 + 3) * 7), d = 3 + Math.floor(hash(i * 5 + 4) * 5);
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
      if ((x === 0 || x === w - 1) && (z === 0 || z === d - 1) && hash(i + x * 9 + z) > 0.3) continue;
      cloudSet.add(keyOf(cx + x, cy, cz + z));
    }
  }
  for (const k of cloudSet) {
    const x = Math.floor(k / 1000000) - 200, z = (k % 1000) - 200;
    pushVoxel(statics, x, cy, z, [P.cloud, mul3(P.cloud, 0.94), mul3(P.cloud, 0.86)], [K.CLOUD, K.CLOUD, K.CLOUD], 1, (a, b, c) => b === cy && cloudSet.has(keyOf(a, b, c)), [x, z, 3, 0]);
  }
  // ---- floating parkour blocks ----
  const platforms = [];
  if (o.platforms !== false && useRiver) {
    for (let k = 0; k < 5; k++) {
      const z = 8 + k * 3.2;
      platforms.push([Math.floor(riverX(z) + (k % 2 ? 1.5 : -1.5)), 9 + (k % 2) + Math.floor(k / 2), Math.floor(z)]);
    }
    for (const [x, y, z] of platforms) {
      const s = x * 13 + z;
      pushVoxel(statics, x, y, z, [jit(P.grass, s), jit(P.dirt, s + 1), P.dirt], [K.GRASS_TOP, K.GRASS_SIDE, K.PLAIN], s, null, [x + 0.5, z + 0.5, 4, y]);
    }
  }
  // ---- flowers ----
  const nFl = o.flowers != null ? o.flowers : 140;
  for (let i = 0; i < nFl; i++) {
    const x = 1 + hash(i * 3 + 11 + so) * (WS - 2), z = 1 + hash(i * 3 + 12 + so) * (WS - 2);
    const xi = Math.floor(x), zi = Math.floor(z);
    if (isWater(xi, zi) || (useRiver && Math.abs(x - riverX(z)) < 4.5)) continue;
    if (treeSet.has(keyOf(xi, HM[xi][zi], zi))) continue;
    const h = HM[xi][zi];
    const B = new FaceBuf(8);
    pushBox(B, [x, h + 0.12, z], [0.11, 0.12, 0.11], I3, P.flowers[i % P.flowers.length], K.PLAIN, i);
    for (let f = 0; f < B.n; f++) statics.push(Array.from(B.P.slice(f * 12, f * 12 + 12)), Array.from(B.N.slice(f * 3, f * 3 + 3)), Array.from(B.C.slice(f * 3, f * 3 + 3)), K.PLAIN, i, [xi + 0.5, zi + 0.5, 5, h]);
  }
  // ---- speed-build tower ----
  const tower = [];
  if (o.tower) {
    const { x0, z0, top } = o.tower;
    for (let y = 0; y <= top; y++) for (let x = x0; x < x0 + 4; x++) for (let z = z0; z < z0 + 4; z++) {
      if (x < 0 || z < 0 || x >= WS || z >= WS) continue;
      const ring = x === x0 || x === x0 + 3 || z === z0 || z === z0 + 3;
      if (y < HM[x][z]) continue;
      if (y < top - 1 && !ring) continue;
      if (y === top && (((x + z) % 2) === 1 || !ring)) continue;
      if (y > 10 && ring && ((y % 4 === 1 && (x === x0 + 1 || z === z0 + 1)) && !(x === x0 + 1 && z === z0 + 1))) continue;
      tower.push([x, y, z]);
    }
    tower.sort((a, b) => a[1] - b[1] || (Math.atan2(a[2] - z0 - 1.5, a[0] - x0 - 1.5) - Math.atan2(b[2] - z0 - 1.5, b[0] - x0 - 1.5)));
  }
  // pushTower(buf, t, tStart, dur): blocks pop in over [tStart, tStart+dur]; returns count shown
  function pushTower(buf, t, tStart, dur, col = P.brick) {
    const n = tower.length; const built = new Set(); const vis = [];
    for (let i = 0; i < n; i++) {
      const ti = tStart + (i / n) * dur;
      if (t < ti) break;
      const [x, y, z] = tower[i]; built.add(keyOf(x, y, z));
      vis.push([x, y, z, clamp((t - ti) / 0.12)]);
    }
    for (const [x, y, z, p] of vis) {
      const s = x * 1000 + y * 31 + z;
      const c = jit(col, s, 0.06);
      const done = p >= 1;
      pushVoxel(buf, x, y, z, [c, c, mul3(col, 0.7)], [K.BRICK, K.BRICK, K.BRICK], s,
        done ? (a, b, cc) => built.has(keyOf(a, b, cc)) || solidTerrain(a, b, cc) : null, null, done ? 1 : 0.6 + 0.4 * p, (1 - E.eOutC(p)) * 2.5);
    }
    return vis.length;
  }
  return { WS, HM, P, riverX, HILL, WATER_Y, heightAt, isWater, solidTerrain, statics, platforms, tower, pushTower, trees };
}

// ---------- Hero (original blocky humanoid; palette makes each video's hero unique) ----------
const HERO_DEFAULT = {
  helm: [72, 80, 98], visor: [110, 245, 255], jacket: [214, 112, 38], dark: [44, 48, 60], scarf: [205, 38, 52], boot: [28, 28, 32], crest: [255, 160, 40],
  blade: [255, 225, 140], hilt: [60, 40, 30], cape: null, // cape: [r,g,b] adds a cape instead of scarf
  visorStyle: 'strip', // 'strip' | 'eyes' | 'cross'
};
/* pose P: {pos:[x,y,z] feet, yaw, run:phase|null, jump:0..1, sit:bool, armR, armL (radians, negative = forward/up),
   sword:0..1 (blade length), rod:bool (fishing rod; sets P.rodTip), lean, headYaw, scarf:time, windDown, scale, pal:{...} } */
function pushHero(buf, P) {
  const HC = Object.assign({}, HERO_DEFAULT, P.pal || {});
  const R0 = Ry(P.yaw || 0);
  const sc = P.scale || 1;
  const base = P.pos;
  const W2 = (l) => add3(base, mul3(mv(R0, l), sc));
  const lean = Rx(P.lean || 0);
  const ph = P.run != null ? P.run : null;
  const sw = ph != null ? Math.sin(ph) * 0.9 : 0;
  let legL = sw, legR = -sw, armL = P.armL != null ? P.armL : -sw * 0.9, armR = P.armR != null ? P.armR : sw * 0.9;
  let hipY = 0.75; const bodyLift = ph != null ? Math.abs(Math.cos(ph)) * 0.08 : 0;
  if (P.sit) { legL = legR = -Math.PI / 2 + 0.25; hipY = 0.0; }
  if (P.jump) { legL = -0.6 * P.jump; legR = 0.3 * P.jump; }
  const Rb = mm(R0, lean);
  for (const [sx, a] of [[-0.13, legL], [0.13, legR]]) {
    const hip = [sx, hipY + bodyLift + (P.sit ? 0.3 : 0), 0];
    const Rl = mm(Rb, Rx(a));
    pushBox(buf, add3(W2(hip), mul3(mv(Rl, [0, -0.36, 0]), sc)), [0.12 * sc, 0.36 * sc, 0.13 * sc], Rl, HC.dark, K.PLAIN, 11);
    pushBox(buf, add3(W2(hip), mul3(mv(Rl, [0, -0.68, 0.01]), sc)), [0.13 * sc, 0.07 * sc, 0.15 * sc], Rl, HC.boot, K.PLAIN, 12);
  }
  const hy = (P.sit ? 0.3 : hipY) + bodyLift;
  pushBox(buf, add3(W2([0, hy, 0]), mul3(mv(Rb, [0, 0.38, 0]), sc)), [0.26 * sc, 0.38 * sc, 0.15 * sc], Rb, HC.jacket, K.PLAIN, 13);
  pushBox(buf, add3(W2([0, hy, 0]), mul3(mv(Rb, [0, 0.08, 0]), sc)), [0.27 * sc, 0.05 * sc, 0.16 * sc], Rb, HC.dark, K.PLAIN, 14);
  const neck = add3(W2([0, hy, 0]), mul3(mv(Rb, [0, 0.76, 0]), sc));
  const Rh = mm(Rb, Ry(P.headYaw || 0));
  const headC = add3(neck, mul3(mv(Rh, [0, 0.26, 0]), sc));
  pushBox(buf, headC, [0.26 * sc, 0.26 * sc, 0.26 * sc], Rh, HC.helm, K.PLAIN, 15);
  if (HC.visorStyle === 'eyes') {
    for (const ex of [-0.1, 0.1]) pushBox(buf, add3(headC, mul3(mv(Rh, [ex, 0.03, 0.262]), sc)), [0.05 * sc, 0.05 * sc, 0.012 * sc], Rh, HC.visor, K.EMIS, 16);
  } else if (HC.visorStyle === 'cross') {
    pushBox(buf, add3(headC, mul3(mv(Rh, [0, 0.03, 0.262]), sc)), [0.2 * sc, 0.04 * sc, 0.012 * sc], Rh, HC.visor, K.EMIS, 16);
    pushBox(buf, add3(headC, mul3(mv(Rh, [0, -0.05, 0.262]), sc)), [0.04 * sc, 0.12 * sc, 0.012 * sc], Rh, HC.visor, K.EMIS, 16);
  } else pushBox(buf, add3(headC, mul3(mv(Rh, [0, 0.02, 0.262]), sc)), [0.2 * sc, 0.055 * sc, 0.012 * sc], Rh, HC.visor, K.EMIS, 16);
  if (HC.crest) pushBox(buf, add3(headC, mul3(mv(Rh, [0, 0.3, -0.02]), sc)), [0.045 * sc, 0.06 * sc, 0.22 * sc], Rh, HC.crest, K.PLAIN, 17);
  let hand = null, Rarm = null;
  [[-0.38, armL], [0.38, armR]].forEach(([sx, a], i) => {
    const pv = add3(W2([0, hy, 0]), mul3(mv(Rb, [sx, 0.68, 0]), sc));
    const Ra = mm(Rb, mm(Rx(a), Rz(i === 0 ? -0.08 : 0.08)));
    pushBox(buf, add3(pv, mul3(mv(Ra, [0, -0.3, 0]), sc)), [0.11 * sc, 0.34 * sc, 0.12 * sc], Ra, HC.jacket, K.PLAIN, 18 + i);
    pushBox(buf, add3(pv, mul3(mv(Ra, [0, -0.62, 0]), sc)), [0.115 * sc, 0.08 * sc, 0.125 * sc], Ra, HC.dark, K.PLAIN, 20 + i);
    if (i === 1) { hand = add3(pv, mul3(mv(Ra, [0, -0.66, 0]), sc)); Rarm = Ra; }
  });
  if (P.sword > 0) {
    const Rs = mm(Rarm, Rx(Math.PI / 2));
    pushBox(buf, add3(hand, mul3(mv(Rs, [0, 0.12, 0]), sc)), [0.05 * sc, 0.14 * sc, 0.05 * sc], Rs, HC.hilt, K.PLAIN, 30);
    pushBox(buf, add3(hand, mul3(mv(Rs, [0, 0.27, 0]), sc)), [0.2 * sc, 0.04 * sc, 0.06 * sc], Rs, HC.crest || HC.hilt, K.PLAIN, 31);
    const L = 1.25 * P.sword;
    pushBox(buf, add3(hand, mul3(mv(Rs, [0, 0.3 + L / 2, 0]), sc)), [0.07 * sc, L / 2 * sc, 0.025 * sc], Rs, HC.blade, K.EMIS, 32);
  }
  if (P.rod) {
    const Rr = mm(Rarm, Rx(Math.PI / 2 + 0.5));
    P.rodTip = add3(hand, mul3(mv(Rr, [0, 2.2, 0]), sc));
    pushBox(buf, add3(hand, mul3(mv(Rr, [0, 1.1, 0]), sc)), [0.03 * sc, 1.1 * sc, 0.03 * sc], Rr, [92, 62, 36], K.PLAIN, 40);
  }
  const st = P.scarf || 0;
  if (HC.cape) {
    const Rc = mm(Rb, Rx(0.15 + 0.12 * Math.sin(st * 6) + (P.run != null ? 0.5 : 0) + (P.jump ? 0.6 : 0)));
    const top = add3(neck, mul3(mv(Rb, [0, -0.05, -0.17]), sc));
    pushBox(buf, add3(top, mul3(mv(Rc, [0, -0.5, -0.03]), sc)), [0.27 * sc, 0.5 * sc, 0.025 * sc], Rc, HC.cape, K.PLAIN, 49);
  } else if (HC.scarf) {
    let prev = add3(neck, mul3(mv(Rb, [0, -0.02, -0.17]), sc));
    for (let i = 0; i < 6; i++) {
      const wave = Math.sin(st * 9 - i * 0.9) * 0.12 * i / 3;
      prev = add3(prev, mul3(mv(R0, [wave, 0.05 - i * (P.windDown || 0.06) + Math.cos(st * 7 - i) * 0.05, -0.22]), sc));
      pushBox(buf, prev, [0.11 * sc * (1 - i * 0.06), 0.05 * sc, 0.12 * sc], mm(R0, Rx(0.3 + wave)), HC.scarf, K.PLAIN, 50 + i);
    }
  }
  return { headC, hand };
}

// ---------- Companion spirit cube ----------
function pushCompanion(buf, pos, yaw, t, s = 1, col = [130, 235, 255]) {
  const c = [pos[0], pos[1] + Math.sin(t * 3.2) * 0.12, pos[2]];
  const R = mm(Ry(yaw + Math.sin(t * 1.3) * 0.3), Rx(Math.sin(t * 2.1) * 0.15));
  pushBox(buf, c, [0.2 * s, 0.2 * s, 0.2 * s], R, col, K.EMIS, 60);
  for (const ex of [-0.08, 0.08]) pushBox(buf, add3(c, mv(R, [ex * s, 0.03 * s, 0.205 * s])), [0.035 * s, 0.06 * s, 0.01 * s], R, [10, 30, 50], K.PLAIN, 61);
  for (let i = 0; i < 3; i++) {
    const a = t * 4 + i * 2.1;
    pushBox(buf, add3(c, [Math.cos(a) * 0.45 * s, Math.sin(a * 1.3) * 0.2 * s, Math.sin(a) * 0.45 * s]), [0.04 * s, 0.04 * s, 0.04 * s], R, E.lerp3(col, [255, 255, 255], 0.5), K.EMIS, 63 + i);
  }
  return c;
}

// ---------- Segmented boss (serpent/worm/dragon-snake). Colours make each boss unique ----------
/* headPath(t)->[x,y,z]; body segment i follows headPath(t - i*lag).
   opt: {jaw:0..1, dead:(i)=>bool, lag, segs, body:[r,g,b], glow:[r,g,b] (crack colour), eye:[r,g,b], horn:[r,g,b], scale, waterY, showUnder, spikes:true} */
function pushSerpent(buf, headPath, t, opt = {}) {
  const lag = opt.lag || 0.075, SEG = opt.segs || 34, sc = opt.scale || 1;
  const body = opt.body || [48, 38, 40], eye = opt.eye || [255, 230, 60], horn = opt.horn || [30, 24, 26], glow = opt.glow || [255, 120, 30];
  const wy = opt.waterY != null ? opt.waterY : 4.6;
  const kind = opt.glow === null ? K.PLAIN : K.MAGMA;
  const out = { head: null, segs: [] };
  for (let i = SEG; i >= 0; i--) {
    if (opt.dead && opt.dead(i)) continue;
    const ti = t - i * lag;
    const p = headPath(ti), q = headPath(ti - 0.02);
    let d = sub3(p, q); if (E.len3(d) < 1e-5) d = [0, 0, 1]; d = norm3(d);
    out.segs[i] = p;
    if (p[1] < wy - 1.2 && !opt.showUnder) continue;
    const R = mm(Ry(Math.atan2(d[0], d[2])), Rx(-Math.asin(clamp(d[1], -1, 1))));
    const S = v => mul3(v, sc);
    if (i === 0) {
      out.head = p; out.R = R;
      const jaw = opt.jaw || 0;
      pushBox(buf, p, S([1.25, 0.95, 1.5]), R, E.mul3(body, 1.08), kind, 900);
      pushBox(buf, add3(p, mv(R, S([0, 0.25, 1.9]))), S([0.95, 0.5, 0.6]), R, E.mul3(body, 1.2), kind, 901);
      const Rj = mm(R, Rx(jaw * 0.7));
      const jp = add3(p, mv(R, S([0, -0.7, 0.4])));
      pushBox(buf, add3(jp, mv(Rj, S([0, 0, 1.4]))), S([0.9, 0.3, 1.25]), Rj, E.mul3(body, 0.94), kind, 902);
      if (jaw > 0.1) pushBox(buf, add3(p, mv(R, S([0, -0.35, 1.6]))), S([0.75, 0.25 * jaw, 0.9]), R, glow, K.EMIS, 903);
      for (let k = 0; k < 5; k++) {
        const x = -0.7 + k * 0.35;
        pushBox(buf, add3(p, mv(R, S([x, -0.32, 2.3]))), S([0.07, 0.17, 0.07]), R, [240, 232, 210], K.PLAIN, 910 + k);
        pushBox(buf, add3(jp, mv(Rj, S([x, 0.38, 2.3]))), S([0.07, 0.15, 0.07]), Rj, [240, 232, 210], K.PLAIN, 920 + k);
      }
      for (const sx of [-0.75, 0.75]) pushBox(buf, add3(p, mv(R, S([sx, 0.5, 1.2]))), S([0.22, 0.14, 0.12]), R, eye, K.EMIS, 930);
      for (const sx of [-0.8, 0.8]) pushBox(buf, add3(p, mv(R, S([sx, 1.3, -0.6]))), S([0.16, 0.9, 0.16]), mm(R, mm(Rx(-0.9), Rz(sx > 0 ? -0.35 : 0.35))), horn, K.PLAIN, 940);
    } else {
      const s = lerp(1.25, 0.45, i / SEG) * sc;
      pushBox(buf, p, [s, s * 0.95, s * 0.9], mm(R, Rz(Math.sin(i * 0.7) * 0.15)), body, kind, 1000 + i);
      if (opt.spikes !== false && i % 2 === 0) pushBox(buf, add3(p, mv(R, [0, s * 1.15, 0])), [0.1 * sc, s * 0.4, s * 0.3], R, horn, K.PLAIN, 1100 + i);
    }
  }
  return out;
}

// ---------- Big blocky golem / titan boss (alternative to serpent) ----------
/* P: {pos feet, yaw, scale (5-10 typical), walk:phase|null, armL, armR, body, glow, eye, crack:true} */
function pushGolem(buf, P) {
  const sc = P.scale || 6, R0 = Ry(P.yaw || 0);
  const body = P.body || [70, 60, 66], eye = P.eye || [255, 60, 40], kind = P.crack === false ? K.PLAIN : K.MAGMA;
  const W2 = l => add3(P.pos, mul3(mv(R0, l), sc));
  const sw = P.walk != null ? Math.sin(P.walk) * 0.5 : 0;
  for (const [sx, a] of [[-0.25, sw], [0.25, -sw]]) {
    const Rl = mm(R0, Rx(a));
    pushBox(buf, add3(W2([sx, 0.9, 0]), mul3(mv(Rl, [0, -0.45, 0]), sc)), mul3([0.2, 0.45, 0.22], sc), Rl, E.mul3(body, 0.85), kind, 1201);
  }
  pushBox(buf, W2([0, 1.5, 0]), mul3([0.55, 0.6, 0.35], sc), R0, body, kind, 1202);
  pushBox(buf, W2([0, 2.35, 0.05]), mul3([0.3, 0.27, 0.28], sc), R0, E.mul3(body, 1.1), kind, 1203);
  for (const ex of [-0.12, 0.12]) pushBox(buf, W2([ex, 2.4, 0.335]), mul3([0.07, 0.04, 0.01], sc), R0, eye, K.EMIS, 1204);
  [[-0.72, P.armL != null ? P.armL : -sw], [0.72, P.armR != null ? P.armR : sw]].forEach(([sx, a], i) => {
    const Ra = mm(R0, Rx(a));
    pushBox(buf, add3(W2([sx, 2.0, 0]), mul3(mv(Ra, [0, -0.6, 0]), sc)), mul3([0.18, 0.65, 0.2], sc), Ra, E.mul3(body, 0.95), kind, 1205 + i);
  });
}

// ---------- Particles ----------
const PAL = {
  dirt: [[134, 96, 67], [96, 168, 52], [122, 122, 128], [110, 80, 55]],
  stone: [[122, 122, 128], [90, 90, 95], [150, 146, 140]],
  water: [[60, 130, 210], [120, 180, 240], [200, 230, 255]],
  magma: [[48, 38, 40], [70, 50, 50], [30, 24, 26]],
  snow: [[240, 245, 250], [210, 225, 240], [180, 200, 230]],
  sand: [[222, 208, 160], [200, 180, 130], [240, 225, 180]],
};
/* explosion e: {t0, pos, n, speed, life, size, seed, palette:'fire'|'spark'|'mix'|'dirt'|'stone'|'water'|'magma'|'snow'|'sand',
   mixPal (debris palette for 'mix'), up (0..1 upward bias), grav, color (for spark)} — deterministic in t */
function pushExplosion(buf, e, t) {
  const age = t - e.t0; if (age < 0 || age > e.life) return 0;
  let cnt = 0;
  for (let k = 0; k < e.n; k++) {
    const s = e.seed * 977 + k * 13;
    const th = hash(s) * Math.PI * 2, u = hash(s + 1) * 2 - 1;
    const up = e.up != null ? e.up : 0.5;
    const dir = norm3([Math.sqrt(1 - u * u) * Math.cos(th), Math.abs(u) * (1 - up) + up * (0.4 + 0.6 * hash(s + 7)), Math.sqrt(1 - u * u) * Math.sin(th)]);
    const v = e.speed * (0.25 + 0.75 * hash(s + 2)), kd = 1.8;
    const dist = v * (1 - Math.exp(-kd * age)) / kd;
    const p = [e.pos[0] + dir[0] * dist, e.pos[1] + dir[1] * dist - 0.5 * (e.grav != null ? e.grav : 9) * age * age * 0.6, e.pos[2] + dir[2] * dist];
    const lifeK = clamp(age / (e.life * (0.6 + 0.4 * hash(s + 3))));
    if (lifeK >= 1) continue;
    const sz = e.size * (0.4 + 0.8 * hash(s + 4)) * (1 - lifeK * 0.7);
    const R = mm(Ry(age * (3 + hash(s + 5) * 6)), Rx(age * (2 + hash(s + 6) * 5)));
    let col, kind = K.PLAIN;
    const fire = e.palette === 'fire' || e.palette === 'spark' || (e.palette === 'mix' && hash(s + 8) < 0.55);
    if (fire) {
      if (e.palette === 'spark') { col = e.color || [255, 220, 120]; kind = K.EMIS; }
      else if (lifeK < 0.55) { col = E.lerp3([255, 245, 190], e.fireCol || [255, 110, 25], lifeK / 0.55); kind = K.EMIS; }
      else col = E.lerp3([90, 60, 50], [40, 36, 38], (lifeK - 0.55) / 0.45);
    } else {
      const pal = PAL[e.palette === 'mix' ? (e.mixPal || 'dirt') : e.palette] || PAL.dirt;
      col = pal[Math.floor(hash(s + 9) * pal.length)];
      if (e.palette === 'water') kind = K.EMIS;
    }
    pushBox(buf, p, [sz, sz, sz], R, col, kind, s);
    cnt++;
  }
  return cnt;
}

module.exports = { buildWorld, BASE_PAL, HERO_DEFAULT, pushHero, pushCompanion, pushSerpent, pushGolem, pushExplosion, PAL, keyOf };
