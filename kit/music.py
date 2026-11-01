# ===== Procedural techno/trance soundtrack driven by a JSON spec =====
# usage: python3 music.py spec.json out.wav
# spec keys (all optional except bpm/nbars/sections):
#  bpm, nbars, seed, tonic (midi of minor-key tonic, e.g. 57 = A3), chords: [[semitones_from_tonic, "m"|"M"], ...] one per bar (cycled)
#  sections: [{"from":0,"to":1,"type":"hook"}, ...]  types: hook | build | drop | breakdown | drop2 | outro | silence
#  impacts: [[bar, beat, gain], ...]   risers: [[bar, beat, length_beats, gain], ...]
#  gap_beats: [[bar, beat], ...]   beats where the kick is removed (pre-drop silence)
#  lead: optional explicit motif: list (one per chord) of 16 midi-or-null
#  detune (0.1-0.3), bright (0.5-1.5), swing (0-0.3)
import json, sys
import numpy as np
from scipy import signal
from scipy.io import wavfile

spec = json.load(open(sys.argv[1]))
out_path = sys.argv[2] if len(sys.argv) > 2 else 'music.wav'
SR = 44100
BPM = spec['bpm']; BEAT = 60 / BPM; BAR = BEAT * 4
NBARS = spec['nbars']; DUR = NBARS * BAR; N = int(DUR * SR)
rng = np.random.default_rng(spec.get('seed', 7))
TON = spec.get('tonic', 57)
CH = spec.get('chords', [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']])
DET = spec.get('detune', 0.2); BRIGHT = spec.get('bright', 1.0); SWING = spec.get('swing', 0.0)

def t_of(bar, beat=0.0): return bar * BAR + beat * BEAT
def idx(t): return int(round(t * SR))
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
L = np.zeros(N); R = np.zeros(N); KB = np.zeros(N); FX = np.zeros(N); SEND = np.zeros(N)
def add(buf, t0, x, g=1.0):
    s = idx(t0)
    if s >= N or s < 0: return
    e = min(N, s + len(x)); buf[s:e] += x[:e - s] * g
def env(n, a=0.005, d=0.1, s=0.6, r=0.05):
    an, dn, rn = max(1, int(a * SR)), max(1, int(d * SR)), max(1, int(r * SR)); sn = max(0, n - an - dn - rn)
    e = np.concatenate([np.linspace(0, 1, an), np.linspace(1, s, dn), np.full(sn, s), np.linspace(s, 0, rn)])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))
def lp(x, fc, o=2): return signal.sosfilt(signal.butter(o, min(fc * BRIGHT, SR * 0.45), 'low', fs=SR, output='sos'), x)
def hp(x, fc, o=2): return signal.sosfilt(signal.butter(o, fc, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, o=2): return signal.sosfilt(signal.butter(o, [lo, min(hi, SR * 0.45)], 'band', fs=SR, output='sos'), x)
def saws(f, dur, v=7, det=None):
    det = DET if det is None else det
    n = int(dur * SR); t = np.arange(n) / SR; o = np.zeros(n)
    for k in range(v):
        d = (k - (v - 1) / 2) / max(1, (v - 1) / 2) * det
        o += signal.sawtooth(2 * np.pi * (f * 2 ** (d / 12) * t + rng.random()))
    return o / v

def kick(h=1.0):
    n = int(0.45 * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * np.cumsum(45 + 130 * np.exp(-t * 30)) / SR) * np.exp(-t * 7.5)
    return np.tanh((body + rng.standard_normal(n) * np.exp(-t * 400) * 0.35) * 2.2 * h) * 0.95
def hat(o=False):
    n = int((0.18 if o else 0.05) * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 8000, 4) * np.exp(-t * (18 if o else 90)) * 0.35
def clap():
    n = int(0.25 * SR); t = np.arange(n) / SR; e = np.exp(-t * 22)
    for off in (0, 0.011, 0.022): e += np.where(t > off, np.exp(-(t - off) * 160), 0) * 0.6
    return bp(rng.standard_normal(n), 900, 3500) * e * 0.55
def snare():
    n = int(0.2 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * 0.5 + bp(rng.standard_normal(n), 1500, 7000) * np.exp(-t * 18)) * 0.4
def impact(ln=2.5):
    n = int(ln * SR); t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(30 + 90 * np.exp(-t * 6)) / SR) * np.exp(-t * 2.2)
    return np.tanh((boom + lp(rng.standard_normal(n), 3000) * np.exp(-t * 5) * 0.6) * 2.5) * 0.9
def riser(ln):
    n = int(ln * SR); t = np.arange(n) / SR; x = rng.standard_normal(n); o = np.zeros(n)
    for i in range(0, n, 1024):
        fc = 400 + 9000 * (i / n) ** 2; seg = x[i:i + 1024]
        o[i:i + 1024] = bp(seg, fc * 0.6, fc * 1.6) if len(seg) > 20 else seg
    return (o * 0.5 + np.sin(2 * np.pi * np.cumsum(200 + 1400 * (t / ln) ** 2) / SR) * 0.25) * (t / ln) ** 2
def downlifter(ln=1.5):
    n = int(ln * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * np.cumsum(1500 * np.exp(-t * 3) + 60) / SR) * 0.4 + hp(rng.standard_normal(n), 2000) * 0.3) * np.exp(-t * 2.5)

def chord(bar):
    off, q = CH[bar % len(CH)]; r = TON + off
    return [r, r + (3 if q == 'm' else 4), r + 7]
S16 = BEAT / 4
def swing_t(bar, s): return t_of(bar, s / 4) + (SWING * S16 if s % 2 == 1 else 0)

# procedural lead motif (unique per seed) unless given
RHY = [rng.random() < p for p in [0.95, 0.2, 0.7, 0.75, 0.2, 0.85, 0.25, 0.8, 0.9, 0.2, 0.7, 0.3, 0.75, 0.25, 0.7, 0.3]]
def lead_line(bar):
    if 'lead' in spec: return spec['lead'][bar % len(spec['lead'])]
    c = chord(bar); tones = [c[0] + 24, c[1] + 24, c[2] + 24, c[0] + 36, c[2] + 12]
    lr = np.random.default_rng(spec.get('seed', 7) * 31 + (bar % len(CH)))
    line = []; prev = tones[0]
    for s in range(16):
        if not RHY[s]: line.append(None); continue
        cand = sorted(tones, key=lambda m: abs(m - prev) + lr.random() * 6)
        prev = cand[0] if s % 4 else tones[lr.integers(0, 4)]
        line.append(int(prev))
    return line

def arp(bar, g, co, octv=12):
    ch = chord(bar); pat = [0, 1, 2, 1, 2, 0, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1]
    for s, p in enumerate(pat):
        n = lp(saws(mtof(ch[p] + octv + (12 if s % 8 == 7 else 0)), S16 * 0.95, 3, 0.08) * env(int(S16 * 0.95 * SR), 0.002, 0.06, 0.25, 0.02), co)
        t0 = swing_t(bar, s); pan = 0.5 + 0.35 * np.sin(s * 0.9)
        add(L, t0, n, g * (1 - pan) * 2); add(R, t0, n, g * pan * 2); add(SEND, t0, n, g * 0.5)
def lead(bar, g, co=6000):
    for s, m in enumerate(lead_line(bar)):
        if m is None: continue
        ln = S16 * 1.8
        n = (saws(mtof(m), ln, 7, DET + 0.02) + saws(mtof(m - 12), ln, 3, 0.1) * 0.5) * env(int(ln * SR), 0.004, 0.12, 0.55, 0.05)
        n = lp(n, co); t0 = swing_t(bar, s)
        add(L, t0, n, g); add(R, t0, n, g * 0.92); add(SEND, t0, n, g * 0.8)
def bass(bar, g, co=900):
    root = chord(bar)[0] - 24
    while root > 40: root -= 12
    for b in range(4):
        for s in (1, 2, 3):
            m = int(S16 * SR); tt = np.arange(m) / SR
            n = (signal.sawtooth(2 * np.pi * mtof(root) * tt) + np.sin(2 * np.pi * mtof(root) * tt) * 0.8) * env(m, 0.002, 0.05, 0.5, 0.015)
            n = lp(n, co); add(L, t_of(bar, b + s / 4), n, g); add(R, t_of(bar, b + s / 4), n, g)
def pad(bar, g, bars=1, co=2500):
    ch = chord(bar); ln = BAR * bars + 0.4; n = np.zeros(int(ln * SR))
    for m in ch + [ch[0] + 12]: n += saws(mtof(m), ln, 5, 0.15)
    n = lp(n * env(len(n), 0.25, 0.3, 0.8, 0.4), co)
    add(L, t_of(bar), n, g); add(R, t_of(bar), n, g); add(SEND, t_of(bar), n, g * 0.6)
def pluck(bar, g):
    ch = chord(bar); seq = [ch[0] + 24, ch[2] + 12, ch[1] + 12, ch[2] + 12]
    for i in range(8):
        m = seq[i % 4] + (12 if i == 6 else 0); tt = np.arange(int(0.5 * SR)) / SR
        n = (np.sin(2 * np.pi * mtof(m) * tt) + np.sin(4 * np.pi * mtof(m) * tt) * 0.3) * np.exp(-tt * 6)
        t0 = t_of(bar, i * 0.5)
        add(L, t0, n, g * (0.7 if i % 2 else 1)); add(R, t0, n, g * (1 if i % 2 else 0.7)); add(SEND, t0, n, g * 0.9)

kicks = []
gaps = set((int(a), float(b)) for a, b in spec.get('gap_beats', []))
def K_(t, h=1.0, bar=None, beat=None):
    if bar is not None and (bar, float(beat)) in gaps: return
    add(KB, t, kick(h)); kicks.append(t)
def drums(bar, hard=1.0):
    for b in range(4):
        K_(t_of(bar, b), hard, bar, b)
        for s in (1, 3): add(L, t_of(bar, b + s / 4), hat(), 0.6); add(R, t_of(bar, b + s / 4), hat(), 0.8)
        add(L, t_of(bar, b + 0.5), hat(True), 0.7); add(R, t_of(bar, b + 0.5), hat(True), 0.6)
        if b in (1, 3): c = clap(); add(L, t_of(bar, b), c); add(R, t_of(bar, b), c); add(SEND, t_of(bar, b), c, 0.5)

for sec in spec['sections']:
    a, b, ty = sec['from'], sec['to'], sec['type']
    for bar in range(a, b):
        u = (bar - a) / max(1, b - a)
        last = bar == b - 1
        if ty == 'hook':
            arp(bar, 0.18, 1200)
            for bt in [2, 2.5, 3, 3.25, 3.5, 3.75]: K_(t_of(bar, bt), 0.8)
            add(FX, t_of(bar, 2), riser(BEAT * 2), 0.5)
        elif ty == 'build':
            arp(bar, 0.22, 900 + u * 2800); pad(bar, 0.05, 1, 1200 + u * 1500)
            for bt in range(4): K_(t_of(bar, bt), 0.8, bar, bt)
            if bar == a: add(FX, t_of(bar), riser((b - a) * BAR - BEAT * 0.25), 0.7)
            if last:
                for i in range(16):
                    add(FX, t_of(bar, i / 4), snare(), 0.15 + 0.02 * i)
                    if i >= 8: add(FX, t_of(bar, 2 + (i - 8) / 8), snare(), 0.2 + 0.05 * (i - 8))
        elif ty in ('drop', 'drop2'):
            hard = ty == 'drop2'
            if bar == a: add(FX, t_of(bar), impact(2.2), 0.8 + 0.2 * hard); add(FX, t_of(bar), downlifter(1.4), 0.4)
            drums(bar, 1.15 if hard else 1.0); bass(bar, 0.36 if hard else 0.32, 1200 if hard else 900)
            lead(bar, 0.19 if hard else 0.16, 8000 if hard else 6000); arp(bar, 0.09 if hard else 0.08, 6000 if hard else 4000, 24)
            if hard: pad(bar, 0.035, 1, 3000)
            if last: add(FX, t_of(bar, 2), riser(BEAT * 2), 0.55)
        elif ty == 'breakdown':
            if bar == a: add(FX, t_of(bar), impact(2.5), 0.5)
            pad(bar, 0.09, 1, 2200); pluck(bar, 0.12)
            if last:
                add(FX, t_of(bar), riser(BAR - BEAT * 0.25), 0.8)
                for i in range(16): add(FX, t_of(bar, 2 + i / 8), snare(), 0.1 + 0.03 * i)
        elif ty == 'outro':
            if bar == a: add(FX, t_of(bar), impact(3.0), 0.6); add(SEND, t_of(bar), impact(3.0), 0.3)
            pad(bar, 0.1 * (1 - u * 0.5), 1, 2000); pluck(bar, 0.1)
            if u < 0.5: lead(bar, 0.07, 2500)
            if last:
                add(FX, t_of(bar, 0.4), riser(BAR * 0.9), 0.6)
                for bt in range(3): K_(t_of(bar, bt), 0.6)
for im in spec.get('impacts', []):
    add(FX, t_of(im[0], im[1]), impact(1.8), im[2] if len(im) > 2 else 0.6)
for rs in spec.get('risers', []):
    add(FX, t_of(rs[0], rs[1]), riser(BEAT * rs[2]), rs[3] if len(rs) > 3 else 0.5)

duck = np.ones(N)
for t in kicks:
    s = idx(t); n = int(0.28 * SR); e = min(N, s + n); x = np.arange(e - s) / n
    duck[s:e] = np.minimum(duck[s:e], 0.25 + 0.75 * x ** 0.6)
irn = int(2.2 * SR); irt = np.arange(irn) / SR
revL = signal.fftconvolve(SEND, lp(rng.standard_normal(irn) * np.exp(-irt * 2.8), 6000))[:N] * 0.025
revR = signal.fftconvolve(SEND, lp(rng.standard_normal(irn) * np.exp(-irt * 2.8), 6000))[:N] * 0.025
dl = int(BEAT * 0.75 * SR); L2 = L.copy(); R2 = R.copy(); L2[dl:] += R[:-dl] * 0.25; R2[dl:] += L[:-dl] * 0.25
mix = np.stack([(L2 + revL) * duck + KB + FX, (R2 + revR) * duck + KB + FX], 1)
mix = hp(mix.T, 25).T; mix = np.tanh(mix * 1.3); mix /= np.max(np.abs(mix)) + 1e-9; mix *= 0.95
f = int(0.05 * SR); mix[-f:] *= np.linspace(1, 0, f)[:, None]
wavfile.write(out_path, SR, (mix * 32767).astype(np.int16))
B = BAR
print('duration %.3f s, bars %d, rms per bar:' % (DUR, NBARS), [round(float(np.sqrt((mix[int(b * B * SR):int((b + 1) * B * SR)] ** 2).mean())), 2) for b in range(NBARS)])
