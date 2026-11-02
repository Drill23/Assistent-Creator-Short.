# ===== Trilha original: "O Titã de Gelo" =====
# Ré lídio, 150 BPM. Lead = sinos FM; baixo = sub pulsante (drop 1) e baixo FM rosnado (drop 2);
# groove half-time no drop 1, quebrado com tambores graves (passos do titã) no drop 2;
# pad cristalino com shimmer; assinaturas: estalo de gelo e "braam" grave do titã.
# usage: python3 music_titan.py music_titan.json saida.wav   (também grava kicks_titan.json para o vídeo)
import json, sys
import numpy as np
from scipy import signal
from scipy.io import wavfile

spec = json.load(open(sys.argv[1]))
out_path = sys.argv[2] if len(sys.argv) > 2 else 'music.wav'
SR = 44100
BPM = spec['bpm']; BEAT = 60 / BPM; BAR = BEAT * 4
NBARS = spec['nbars']; DUR = NBARS * BAR; N = int(DUR * SR)
rng = np.random.default_rng(spec.get('seed', 11))
TON = spec['tonic']; CH = spec['chords']

def t_of(bar, beat=0.0): return bar * BAR + beat * BEAT
def idx(t): return int(round(t * SR))
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
L = np.zeros(N); R = np.zeros(N); KB = np.zeros(N); FX = np.zeros(N); SEND = np.zeros(N)
def add(buf, t0, x, g=1.0):
    s = idx(t0)
    if s >= N or s < 0: return
    e = min(N, s + len(x)); buf[s:e] += x[:e - s] * g
def addst(t0, x, g, pan=0.5, send=0.3):
    add(L, t0, x, g * (1 - pan) * 2); add(R, t0, x, g * pan * 2); add(SEND, t0, x, g * send)
def env(n, a=0.005, d=0.1, s=0.6, r=0.05):
    an, dn, rn = max(1, int(a * SR)), max(1, int(d * SR)), max(1, int(r * SR)); sn = max(0, n - an - dn - rn)
    e = np.concatenate([np.linspace(0, 1, an), np.linspace(1, s, dn), np.full(sn, s), np.linspace(s, 0, rn)])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))
def lp(x, fc, o=2): return signal.sosfilt(signal.butter(o, min(fc, SR * 0.45), 'low', fs=SR, output='sos'), x)
def hp(x, fc, o=2): return signal.sosfilt(signal.butter(o, fc, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, o=2): return signal.sosfilt(signal.butter(o, [lo, min(hi, SR * 0.45)], 'band', fs=SR, output='sos'), x)
def tt(dur): return np.arange(int(dur * SR)) / SR

# ---------- instrumentos novos ----------
def fm_bell(f, dur, ratio=3.5, idx0=6.0, decay=3.2):
    t = tt(dur); I = idx0 * np.exp(-t * 4.5)
    x = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * ratio * t)) * np.exp(-t * decay)
    x += 0.35 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t * decay * 1.8)
    a = min(len(x), int(0.002 * SR)); x[:a] *= np.linspace(0, 1, a)
    return x
def crystal_pluck(f, dur=0.35):
    t = tt(dur); x = np.sin(2 * np.pi * f * t + 1.6 * np.exp(-t * 18) * np.sin(2 * np.pi * f * 5.01 * t)) * np.exp(-t * 11)
    a = min(len(x), int(0.001 * SR)); x[:a] *= np.linspace(0, 1, a); return x
def glass_pad(notes, dur):
    t = tt(dur); x = np.zeros(len(t))
    for m in notes:
        f = mtof(m)
        for d in (-0.07, 0.0, 0.08):
            ff = f * 2 ** (d / 12)
            x += signal.sawtooth(2 * np.pi * ff * t, 0.5) * 0.5 + np.sin(2 * np.pi * ff * 2 * t) * 0.25
    shimmer = 1 + 0.25 * np.sin(2 * np.pi * 5.5 * t)
    x = lp(x * shimmer, 3200) * env(len(t), 0.35, 0.3, 0.85, 0.5)
    return x / (len(notes) * 3)
def sub_pulse(f, dur):
    t = tt(dur); x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 2 * t)
    return np.tanh(x * 1.6) * env(len(t), 0.004, 0.12, 0.7, 0.06)
def fm_growl(f, dur, bright=1.0):
    t = tt(dur); I = (2.5 + 2.0 * np.sin(2 * np.pi * 3 * t)) * bright
    x = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * t))
    x = lp(np.tanh(x * 2.2), 700 + 900 * bright) + np.sin(2 * np.pi * f / 2 * t) * 0.6
    return x * env(len(t), 0.003, 0.08, 0.75, 0.04)
def braam(f, dur=1.6):  # tema do titã: metal grave abrindo o filtro
    t = tt(dur); x = np.zeros(len(t))
    for k, d in enumerate((-0.12, 0, 0.11)):
        x += signal.sawtooth(2 * np.pi * f * 2 ** (d / 12) * t) + 0.6 * signal.sawtooth(2 * np.pi * f * 1.5 * 2 ** (d / 12) * t)
    out = np.zeros(len(t)); blk = 512
    for i in range(0, len(t), blk):
        fc = 180 + 2200 * np.exp(-((i / SR) - 0.25) ** 2 / 0.08)
        out[i:i + blk] = lp(x[i:i + blk], fc, 1)
    return np.tanh(out * 0.9) * env(len(t), 0.05, 0.3, 0.7, 0.6) * 0.5
def ice_crack():
    t = tt(0.9); n = rng.standard_normal(len(t))
    x = hp(n, 3000, 4) * np.exp(-t * 30) * 0.8
    for k in range(6):
        t0 = 0.01 + k * 0.035 + rng.random() * 0.02; f = 4200 - k * 450
        s = np.where(t > t0, np.sin(2 * np.pi * f * (t - t0)) * np.exp(-(t - t0) * 40), 0); x += s * 0.35
    x += np.sin(2 * np.pi * np.cumsum(900 * np.exp(-t * 7) + 120) / SR) * np.exp(-t * 6) * 0.3
    return x
def kick(h=1.0):
    t = tt(0.42)
    body = np.sin(2 * np.pi * np.cumsum(42 + 110 * np.exp(-t * 28)) / SR) * np.exp(-t * 8)
    return np.tanh((body + rng.standard_normal(len(t)) * np.exp(-t * 500) * 0.25) * 2.0 * h) * 0.95
def snare_big():
    t = tt(0.32)
    return (np.sin(2 * np.pi * 180 * t) * np.exp(-t * 20) * 0.5 + bp(rng.standard_normal(len(t)), 1200, 9000) * np.exp(-t * 11)) * 0.5
def taiko(f=70):
    t = tt(0.7); x = np.sin(2 * np.pi * np.cumsum(f + 60 * np.exp(-t * 20)) / SR) * np.exp(-t * 5)
    return np.tanh((x + lp(rng.standard_normal(len(t)), 600) * np.exp(-t * 30) * 0.5) * 1.8) * 0.8
def hat(o=False):
    t = tt(0.16 if o else 0.04)
    return hp(rng.standard_normal(len(t)), 9000, 4) * np.exp(-t * (20 if o else 110)) * 0.3
def impact(ln=2.4):
    t = tt(ln)
    boom = np.sin(2 * np.pi * np.cumsum(28 + 80 * np.exp(-t * 5)) / SR) * np.exp(-t * 2)
    return np.tanh((boom + lp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 4) * 0.5) * 2.4) * 0.9
def whoosh(ln):
    t = tt(ln); x = rng.standard_normal(len(t)); o = np.zeros(len(t))
    for i in range(0, len(t), 1024):
        fc = 300 + 7000 * (i / len(t)) ** 2; seg = x[i:i + 1024]
        o[i:i + 1024] = bp(seg, fc * 0.6, fc * 1.5) if len(seg) > 20 else seg
    return o * (t / ln) ** 2 * 0.6
def wind(ln):
    t = tt(ln); x = bp(rng.standard_normal(len(t)), 300, 1400) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.7 * t))
    return x * env(len(t), ln * 0.3, 0.1, 0.8, ln * 0.3) * 0.25

def chord(bar):
    off, q = CH[bar % len(CH)]; r = TON + off
    return [r, r + (3 if q == 'm' else 4), r + 7]

HERO = spec['hero_theme']   # [[beat, semis_from_tonic, len_beats], ...] (1 compasso; tônica +24)
kicks = []
gaps = set((int(a), float(b)) for a, b in spec.get('gap_beats', []))
def K_(bar, beat, h=1.0):
    if (bar, float(beat)) in gaps: return
    add(KB, t_of(bar, beat), kick(h)); kicks.append([round(t_of(bar, beat), 4), round(min(1.3, h), 2)])

def hero_line(bar, g, octv=24, bright=1.0, decay=3.2):
    for b, s, ln in HERO:
        m = TON + s + octv
        n = fm_bell(mtof(m), BEAT * ln + 0.5, 3.5, 6 * bright, decay)
        addst(t_of(bar, b), n, g, 0.42, 0.7)
        if bright > 1.1: addst(t_of(bar, b), fm_bell(mtof(m + 12), BEAT * ln + 0.4, 2.0, 3, decay * 1.3), g * 0.45, 0.6, 0.6)
def crystal_arp(bar, g, step=0.5, octv=24):
    ch = chord(bar); seq = [ch[0], ch[2], ch[1] + 12, ch[2], ch[0] + 12, ch[2], ch[1] + 12, ch[2] + 12]
    for i in range(int(4 / step)):
        addst(t_of(bar, i * step), crystal_pluck(mtof(seq[i % 8] + octv)), g, 0.5 + 0.35 * np.sin(i * 1.3), 0.9)
def pad(bar, g, bars=1, octv=12):
    ch = chord(bar); x = glass_pad([m + octv for m in ch] + [ch[0] + octv + 12], BAR * bars + 0.5)
    addst(t_of(bar), x, g, 0.5, 0.8)
def sub_bass(bar, g):
    r = chord(bar)[0] - 12
    while r > 45: r -= 12
    for b in (0, 1.5, 2, 3, 3.5):
        add(L, t_of(bar, b), sub_pulse(mtof(r), BEAT * 0.45), g); add(R, t_of(bar, b), sub_pulse(mtof(r), BEAT * 0.45), g)
def growl_bass(bar, g, bright):
    r = chord(bar)[0] - 12
    while r > 45: r -= 12
    pat = [(0, 0), (0.5, 0), (1, 12), (1.5, 0), (2, 0), (2.5, 6), (3, 0), (3.5, 1)]  # trítono e semitom = ameaça
    for b, s in pat:
        x = fm_growl(mtof(r + s), BEAT * 0.48, bright); add(L, t_of(bar, b), x, g); add(R, t_of(bar, b), x, g)

for sec in spec['sections']:
    a, b, ty = sec['from'], sec['to'], sec['type']
    for bar in range(a, b):
        last = bar == b - 1; u = (bar - a) / max(1, b - a)
        if ty == 'hook':
            add(FX, t_of(bar), braam(mtof(TON - 24), 1.4), 0.55)
            add(FX, t_of(bar, 2), whoosh(BEAT * 1.4), 0.5)
            pad(bar, 0.05)
        elif ty == 'build':
            crystal_arp(bar, 0.12, 0.25); pad(bar, 0.06)
            for bt in (0, 1, 2): K_(bar, bt, 0.55)
            add(FX, t_of(bar), whoosh(BAR - BEAT), 0.7); add(FX, t_of(bar), wind(BAR), 0.6)
        elif ty == 'drop':
            if bar == a: add(FX, t_of(bar), impact(2.0), 0.7); add(FX, t_of(bar), ice_crack(), 0.35)
            K_(bar, 0, 1.0); K_(bar, 2.5, 0.85)                       # half-time
            add(L, t_of(bar, 2), snare_big(), 0.85); add(R, t_of(bar, 2), snare_big(), 0.85); add(SEND, t_of(bar, 2), snare_big(), 0.4)
            for i in range(8): add(L if i % 2 else R, t_of(bar, i * 0.5 + 0.25), hat(), 0.55)
            if bar % 2 == 1:
                for i in range(3): add(R, t_of(bar, 3 + i / 3), hat(), 0.45)   # tercinas
            sub_bass(bar, 0.34); hero_line(bar, 0.2); crystal_arp(bar, 0.05, 0.5, 36); pad(bar, 0.035)
        elif ty == 'pause':
            if bar == a: add(FX, t_of(bar), impact(2.6), 0.35)
            pad(bar, 0.08, 1, 12); crystal_arp(bar, 0.07, 1.0)
            if u == 0: hero_line(bar, 0.08, 24, 0.6, 2.2)
            add(FX, t_of(bar), wind(BAR), 0.5)
            if last:
                add(FX, t_of(bar, 1), ice_crack(), 0.6); add(FX, t_of(bar, 2.2), ice_crack(), 0.7)
                add(FX, t_of(bar, 0.5), whoosh(BEAT * 3.2), 0.8)
                for i in range(3): add(KB, t_of(bar, 1 + i * 0.66), taiko(55), 0.5 + i * 0.15)
        elif ty == 'drop2':
            if bar == a:
                add(FX, t_of(bar), impact(2.4), 0.9); add(FX, t_of(bar), braam(mtof(TON - 24), 1.8), 0.8)
            for bt in (0, 1.5, 2, 3): K_(bar, bt, 1.15)
            for bt in (1, 3): add(L, t_of(bar, bt), snare_big(), 0.8); add(R, t_of(bar, bt), snare_big(), 0.8)
            for i in range(16): add(L if i % 2 else R, t_of(bar, i * 0.25), hat(i % 4 == 2), 0.4)
            add(KB, t_of(bar, 0), taiko(62), 0.55); add(KB, t_of(bar, 2), taiko(58), 0.5)   # passos do titã
            growl_bass(bar, 0.26, 0.8 + 0.6 * u)
            if bar - a >= 3: hero_line(bar, 0.2, 36, 1.3)               # tema do herói volta mais forte
            else: crystal_arp(bar, 0.06, 0.5, 24)
            pad(bar, 0.04)
            if last:
                for i in range(8): add(FX, t_of(bar, 2 + i / 4), snare_big(), 0.15 + 0.06 * i)
        elif ty == 'outro':
            if bar == a: add(FX, t_of(bar), impact(3.0), 0.55)
            pad(bar, 0.1 * (1 - u * 0.4), 1, 12); hero_line(bar, 0.13 * (1 - u * 0.5), 24, 0.7, 1.8)
            if last:
                add(FX, t_of(bar, 1.5), whoosh(BEAT * 2.5), 0.6)
                for bt in (2, 2.5, 3, 3.5): K_(bar, bt, 0.5)
for im in spec.get('impacts', []): add(FX, t_of(im[0], im[1]), impact(1.8), im[2])
for c in spec.get('cracks', []): add(FX, t_of(c[0], c[1]), ice_crack(), c[2])
for c in spec.get('braams', []): add(FX, t_of(c[0], c[1]), braam(mtof(TON - 24 + c[3] if len(c) > 3 else TON - 24), 1.5), c[2])
for c in spec.get('whooshes', []): add(FX, t_of(c[0], c[1]), whoosh(BEAT * c[2]), c[3])

# filtro abafado durante a câmera lenta (bullet-time)
for a0, a1 in spec.get('muffle', []):
    s, e = idx(t_of(*a0)), idx(t_of(*a1))
    for buf in (L, R):
        seg = buf[s:e].copy(); buf[s:e] = lp(seg, 650, 2) * 1.3

duck = np.ones(N)
for t, h in kicks:
    s = idx(t); n = int(0.24 * SR); e = min(N, s + n); x = np.arange(e - s) / n
    duck[s:e] = np.minimum(duck[s:e], 0.3 + 0.7 * x ** 0.6)
irn = int(2.8 * SR); irt = np.arange(irn) / SR
revL = signal.fftconvolve(SEND, hp(rng.standard_normal(irn) * np.exp(-irt * 2.2), 300))[:N] * 0.022
revR = signal.fftconvolve(SEND, hp(rng.standard_normal(irn) * np.exp(-irt * 2.2), 300))[:N] * 0.022
dl = int(BEAT * 0.75 * SR); L2 = L.copy(); R2 = R.copy(); L2[dl:] += R[:-dl] * 0.28; R2[dl:] += L[:-dl] * 0.28
mix = np.stack([(L2 + revL) * duck + KB + FX, (R2 + revR) * duck + KB + FX], 1)
mix = hp(mix.T, 28).T; mix = np.tanh(mix * 1.25); mix /= np.max(np.abs(mix)) + 1e-9; mix *= 0.95
f = int(0.04 * SR); mix[-f:] *= np.linspace(1, 0, f)[:, None]
wavfile.write(out_path, SR, (mix * 32767).astype(np.int16))
json.dump(kicks, open(spec.get('kicks_out', 'kicks_titan.json'), 'w'))
print('duration %.3f s, bars %d, peak %.3f, rms per bar:' % (DUR, NBARS, float(np.max(np.abs(mix)))),
      [round(float(np.sqrt((mix[int(b * BAR * SR):int((b + 1) * BAR * SR)] ** 2).mean())), 2) for b in range(NBARS)])
