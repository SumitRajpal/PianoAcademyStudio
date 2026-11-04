"""Reevo 2 re-audit v1.0 (based on master v1.5): re-derivation of every numeric claim.
Run: python3 audit_calcs.py  -> prints all results and writes audit_results.txt
"""
import numpy as np, math, itertools, random
from math import log, log2, log10, exp, sqrt, pi, comb, floor, ceil, erf

out = []
def p(*a):
    s = " ".join(str(x) for x in a)
    print(s); out.append(s)

fs = 48000; H = 256
hop_ms = H / fs * 1e3

def hann(N):
    n = np.arange(N); return 0.5 - 0.5 * np.cos(2 * np.pi * n / N)

def lowdelay(N, R=256):
    L = N - R
    a = 0.5 - 0.5 * np.cos(np.pi * np.arange(L) / L)
    b = 0.5 + 0.5 * np.cos(np.pi * np.arange(R) / R)
    return np.concatenate([a, b])

Phi = lambda x: 0.5 * (1 + erf(x / sqrt(2)))
phi = lambda x: exp(-x * x / 2) / sqrt(2 * pi)
logit = lambda x: log(x / (1 - x))
names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
def midi_f(m): return 440 * 2 ** ((m - 69) / 12)
def name(m): return f"{names[m % 12]}{m // 12 - 1}"
def nearest(f):
    m = 69 + 12 * log2(f / 440); mi = round(m); return mi, (m - mi) * 100

# ---------------------------------------------------------------- 1
p("== 1. Timebase ==")
for f in (48000, 44100):
    p(f"fs={f}: hop {256 / f * 1e3:.3f} ms, hops/h {f * 3600 / 256:,.2f}, ring 2^16 = {65536 / f:.3f} s")
p(f"threshold shift at 44.1 kHz: ln(675000/620156.25) = {log(675000 / 620156.25):.4f} nats")
p(f"stretch 2.1: 865.6*B*h^2 at B=4e-4,h=10 = {865.6 * 4e-4 * 100:.1f} c; exact {600 * log2(1 + 4e-4 * 100):.1f} c")

# ---------------------------------------------------------------- 2
p("== 2. Window normalisation ==")
for N in (1024, 2048, 4096):
    for nm, w in (("Hann", hann(N)), ("LowDelay", lowdelay(N))):
        cg = w.sum() / N; s2 = (w * w).sum()
        p(f"N={N} {nm}: CG={cg:.4f}; tone norm = {((N * cg) ** 2 / 2) / (N * N / 8):.4f} x N^2/8; "
          f"sum w^2 = {s2 / (3 * N / 8):.4f} x 3N/8; ENBW={N * s2 / w.sum() ** 2:.3f} bins")
for N in (1024, 2048, 4096, 8192):
    p(f"per-bin SNR gain 10log10(N/3) N={N}: {10 * log10(N / 3):.2f} dB")

# ---------------------------------------------------------------- 3
p("== 3. -6 dB fill time for a new note ==")
for N in (1024, 2048, 4096):
    res = {}
    for nm, w in (("Hann", hann(N)), ("LowDelay", lowdelay(N))):
        cum = np.cumsum(w[::-1]) / w.sum()
        d = int(np.searchsorted(cum, 0.5)) + 1
        res[nm] = d / fs * 1e3
        p(f"N={N} {nm}: -6 dB after {d} samples = {d / fs * 1e3:.2f} ms")
    p(f"N={N}: low-delay saves {res['Hann'] - res['LowDelay']:.2f} ms")

# ---------------------------------------------------------------- 4
p("== 4. Leakage beyond 8 bins ==")
for N in (1024, 2048, 4096):
    lv = {}
    for nm, w in (("Hann", hann(N)), ("LowDelay", lowdelay(N))):
        P = 32
        W = np.abs(np.fft.fft(w, N * P)); W /= W[0]
        offs = np.arange(N * P) / P
        offs = np.where(offs > N / 2, offs - N, offs)
        lv[nm] = 20 * np.log10(W[np.abs(offs) >= 8].max())
        p(f"N={N} {nm}: max leakage beyond 8 bins {lv[nm]:.1f} dB")
    p(f"N={N}: masking range lost {lv['LowDelay'] - lv['Hann']:.1f} dB")

# ---------------------------------------------------------------- 5
p("== 5. Integrated autocorrelation time tau (hop 256) ==")
def tau_int(w, hop):
    N = len(w); E = (w * w).sum(); tot = 1.0; r1 = None; m = 1
    while m * hop < N:
        c = (w[m * hop:] * w[:N - m * hop]).sum() / E
        if m == 1: r1 = c * c
        tot += 2 * c * c; m += 1
    return tot, r1
TAU = {}
for N in (1024, 2048, 4096):
    for nm, w in (("Hann", hann(N)), ("LowDelay", lowdelay(N))):
        t, r1 = tau_int(w, 256); TAU[(N, nm)] = t
        p(f"N={N} {nm}: rho(1)={r1:.3f} tau={t:.2f}; 16.1 nats uncorrected behaves like {16.1 / t:.1f}")
t, r1 = tau_int(hann(8192), 512); p(f"N=8192 hop 512 Hann: rho(1)={r1:.3f} tau={t:.2f}")
p("independent Hann looks per window length = (N/hop)/tau: " +
  ", ".join(f"N={N}: {(N / 256) / TAU[(N, 'Hann')]:.2f}" for N in (1024, 2048, 4096)))

# ---------------------------------------------------------------- 6
p("== 6. Noise spectrum accuracy from 3 s of silence ==")
for N in (1024, 4096):
    t = TAU[(N, 'Hann')]
    M_master = 3.0 / (N / fs); M_eff = (3.0 * fs / 256) / t
    need = (4.343 / 0.73) ** 2 * t * 256 / fs
    p(f"N={N}: master counts M={M_master:.1f} -> {4.343 / sqrt(M_master):.2f} dB; tau-correct M={M_eff:.1f} -> "
      f"{4.343 / sqrt(M_eff):.2f} dB; silence needed for 0.73 dB: {need:.2f} s")

# ---------------------------------------------------------------- 7
p("== 7. Cramer-Rao frequency precision at 20 dB SNR ==")
def crb(N, snr_db, f=fs):
    snr = 10 ** (snr_db / 10); return sqrt(12 * f ** 2 / ((2 * pi) ** 2 * snr * N * (N * N - 1)))
for N, key, gap in ((1024, 'G4', midi_f(68) - midi_f(67)), (2048, 'F#2', midi_f(43) - midi_f(42)),
                    (4096, 'A0', midi_f(22) - midi_f(21)), (8192, 'A0', midi_f(22) - midi_f(21))):
    s = crb(N, 20); p(f"N={N}: sigma_f={s:.4f} Hz; {key} gap {gap:.3f} Hz = {gap / s:.0f} sigma")
p(f"1 s calibration window: sigma_f = {crb(48000, 20):.5f} Hz")

# ---------------------------------------------------------------- 8
p("== 8. A0/A#0: energy rule vs known-frequency complex fit ==")
df = midi_f(22) - midi_f(21)
for f_s in (48000, 44100):
    for N in (4096, 8192):
        binw = f_s / N
        p(f"fs={f_s} N={N}: bin {binw:.2f} Hz; energy (2-bin) separation from partial {ceil(2 * binw / df)}")
def atom_corr(w, delta_bins):
    N = len(w); n = np.arange(N)
    return abs((w * np.exp(2j * np.pi * delta_bins * n / N)).sum()) / w.sum()
for N in (2048, 4096, 8192):
    w = hann(N); rows = []
    for h in range(1, 31):
        d = h * df * N / fs
        rows.append((h, d, atom_corr(w, d), atom_corr(w * w, d)))
    h85 = next(h for h, d, a, b in rows if a <= 0.85); h90 = next(h for h, d, a, b in rows if a <= 0.90)
    h85b = next(h for h, d, a, b in rows if b <= 0.85)
    p(f"N={N}: {df * N / fs:.4f} bins per partial; Hann-weighted LS: rho<=0.90 from h={h90}, rho<=0.85 from h={h85}; "
      f"windowed LS (Hann^2 kernel) rho<=0.85 from h={h85b}")
    for h, d, a, b in rows[:6]:
        p(f"   h={h}: delta={d:.3f} bins rho={a:.3f} VIF={1 / (1 - a * a):.2f} ({10 * log10(1 / (1 - a * a)):.1f} dB)")
for dd in (0.25, 0.5, 0.75, 1.0):
    a = atom_corr(hann(4096), dd); p(f"Hann-weighted atom correlation at {dd} bin: {a:.3f}")
p(f"two visible Hann peaks need about 2 bins: N=8192 -> {2 * fs / 8192:.1f} Hz (9.5 says about 6 Hz)")

# ---------------------------------------------------------------- 9
p("== 9. CUSUM thresholds and delays ==")
for K, R in ((88, 1), (88, 6), (88, 30), (61, 6)):
    hh = log(K * 675000 / R)
    p(f"K={K} R={R}/h: h={hh:.2f} nats; strong (D=5) {hh / 5 * hop_ms:.1f} ms; faint (D=1) {hh * hop_ms:.1f} ms")
h = log(88 * 675000 / 6)
D = 2 / 7.70
shift = logit(0.9) - logit(0.01)
p(f"faint clickless bass: D={D:.4f}/hop -> {h / D:.1f} hops = {h / D * hop_ms:.0f} ms; lesson threshold {h - shift:.2f} -> "
  f"{(h - shift) / D * hop_ms:.0f} ms; uncorrected {h / 2:.1f} hops")
p(f"Lorden check: 88 keys x 675000 hops/h x e^-h = {88 * 675000 * exp(-h):.2f} false notes/h")

# ---------------------------------------------------------------- 10
p("== 10. Priors ==")
for nm, pi_ in (("expected", 0.9), ("typical mistake", 0.03), ("other", 0.002)):
    p(f"{nm}: threshold shift {-(logit(pi_) - logit(0.01)):+.3f} nats")
p(f"sooner: strong {shift / 5 * hop_ms:.1f} ms, faint {shift * hop_ms:.1f} ms")
h_exp = h - shift
per_key = 6 / 88
rate_exp = per_key * exp(shift)
p(f"expected-key threshold {h_exp:.2f} nats; Lorden ARL >= e^h hops = {exp(h_exp) * hop_ms / 1000:.1f} s")
p(f"false-trigger rate: free-play key {per_key:.4f}/h; expected key with prior {rate_exp:.1f}/h (one per {3600 / rate_exp:.0f} s)")
p(f"practice prior window 300 ms: phantom chance per expected note {rate_exp / 3600 * 0.3 * 100:.2f} %")
for wait in (10, 30, 60):
    p(f"wait-for-correct, {wait} s of waiting: P(>=1 phantom) = {(1 - exp(-rate_exp / 3600 * wait)) * 100:.0f} %")
cap = log(2.0 / per_key)
p(f"cap for <= 1 phantom per 30 min of waiting per key: shift <= {cap:.2f} nats (threshold >= {h - cap:.2f})")
p(f"which-key margin: categorical ln(0.9/0.03) = {log(0.9 / 0.03):.2f}; per-key logit thresholds imply {logit(0.9) - logit(0.03):.2f}")
tot = 675000 * (exp(-(h - shift)) + 6 * exp(-(h - (logit(0.03) - logit(0.01)))) + 81 * exp(-(h + (logit(0.01) - logit(0.002)))))
p(f"lesson step (1 expected, 6 typical, 81 other): {tot:.1f} false triggers/h while the prior is active")

# ---------------------------------------------------------------- 11
p("== 11. Answer-space size ==")
for K in (88, 76, 73, 66, 61, 54, 49, 44, 37, 32, 25):
    s4 = sum(comb(K, k) for k in range(5))
    p(f"K={K}: up to 4 notes {s4:,} = {log2(s4):.2f} bits")
s6 = sum(comb(88, k) for k in range(7)); s10 = sum(comb(88, k) for k in range(11))
p(f"88 keys: up to 6 notes {s6:,} = {log2(s6):.1f} bits; up to 10 notes {s10:,} = {log2(s10):.1f} bits; 30 outcomes = {log2(30):.2f} bits")
p(f"case pairs C(26,2)={comb(26, 2)}, triples C(26,3)={comb(26, 3)}, subsets 2^26={2 ** 26:,}")

# ---------------------------------------------------------------- 12
p("== 12. Velocity levels ==")
def miss_inner(W): return 2 * (1 - Phi(W)) + (2 / W) * (phi(0) - phi(W))
def miss_edge(W): return (1 - Phi(W)) + (1 / W) * (phi(0) - phi(W))
W = 3.29
p(f"width 3.29 sigma: note at level centre {2 * (1 - Phi(W / 2)) * 100:.1f} %; inner level averaged {miss_inner(W) * 100:.1f} %; "
  f"end level averaged {miss_edge(W) * 100:.1f} %")
for n in (3, 4, 5):
    p(f"n={n} levels: average misgrade {((n - 2) * miss_inner(W) + 2 * miss_edge(W)) / n * 100:.1f} %")
lo, hi = 3.29, 30.0
for _ in range(80):
    mid = (lo + hi) / 2
    lo, hi = (mid, hi) if miss_inner(mid) > 0.10 else (lo, mid)
p(f"width for 10% inner average: {hi:.2f} sigma")
R = 35
for s in (2.5, 3, 4):
    I = 0.5 * log2(1 + R * R / (12 * s * s))
    p(f"R=35 sigma={s}: master levels {floor(R / (3.29 * s)) + 1}; at 8 sigma {floor(R / (8 * s)) + 1}; "
      f"capacity bound {I:.2f} bits = {2 ** I:.1f} levels")
p(f"dead-band rule: accuse only beyond boundary + 1.645 sigma -> false 'wrong dynamic' <= {(1 - Phi(1.645)) * 100:.1f} % for any true value inside")

# ---------------------------------------------------------------- 13
p("== 13. Harmonic-interval power excess over 8 shared partials ==")
for soft in (0, 3, 6, 12, 20):
    r2 = 10 ** (-soft / 10); r = sqrt(r2)
    zm = []; zc = []
    for sT in (1.0, 1.5):
        sl = sT * log(10) / 10
        zm.append(sqrt(8) * r2 / sqrt(r2 + sl * sl))
        zc.append(sqrt(8) * r2 / sqrt(2 * r2 + sl * sl))
    beat = 20 * log10((1 + r) / (1 - r)) if r < 1 else float('inf')
    p(f"upper {soft} dB softer: excess {10 * log10(1 + r2):.2f} dB; z with var r^2 (master) {min(zm):.2f}-{max(zm):.2f}; "
      f"z with var 2r^2 (corrected) {min(zc):.2f}-{max(zc):.2f}; beat p-p {beat:.1f} dB")
for z in (1.94, 1.97, 2.6):
    p(f"one test at z={z}: detect {Phi(z - 2.326) * 100:.0f} % at 1 % false upper; {Phi(z - 1.2816) * 100:.0f} % at 10 %")
p(f"E[(2r cos th)^2] numeric (r=1): {np.mean((2 * np.cos(np.linspace(0, 2 * pi, 100001)[:-1])) ** 2):.4f}")

# ---------------------------------------------------------------- 14
p("== 14. Octave beat rates ==")
def beat_tuned(fL0, B, h):
    fU0 = 2 * fL0 * sqrt((1 + 16 * B) / (1 + 4 * B))
    return h * fU0 * sqrt(1 + B * h * h) - 2 * h * fL0 * sqrt(1 + 4 * B * h * h)
def beat_samezone(fL0, B, h):
    return 2 * h * fL0 * (sqrt(1 + 4 * B * h * h) - sqrt(1 + B * h * h))
for lab, fL, B in (("C2+C3", midi_f(36), 2e-4), ("C3+C4", midi_f(48), 3e-4)):
    for hh in (4, 6, 8):
        b = abs(beat_tuned(fL, B, hh)); p(f"{lab} B={B}: upper partial {hh} beats at {b:.1f} Hz ({1000 / b:.0f} ms)")
for hh in (1, 4, 8):
    b = beat_samezone(midi_f(48), 3e-4, hh)
    p(f"digital same-zone C3+C4, B=3e-4: upper partial {hh} beats at {b:.2f} Hz")

# ---------------------------------------------------------------- 15
p("== 15. Release timestamp lag from window taper ==")
for N in (1024, 2048, 4096):
    for nm, w in (("Hann", hann(N)), ("LowDelay", lowdelay(N))):
        cum = np.cumsum(w[::-1]) / w.sum()
        for drr in (0, 10):
            Dl = 10 ** (drr / 10)
            step = 10 * log10(1 + Dl)
            lv = 10 * np.log10((1 + Dl * (1 - cum) ** 2) / (1 + Dl))
            d50 = int(np.argmax(lv <= -step / 2)) + 1
            d90 = int(np.argmax(lv <= -0.9 * step)) + 1
            p(f"N={N} {nm} DRR {drr:+d} dB (step {step:.1f} dB): half-step {d50 / fs * 1e3:.1f} ms, 90% {d90 / fs * 1e3:.1f} ms")
lv1 = None
w = hann(4096); cum = np.cumsum(w[::-1]) / w.sum()
p(f"Hann 4096, one hop after a full stop: level change {20 * log10(1 - cum[255]):.3f} dB")

# ---------------------------------------------------------------- 16
p("== 16. Release-gate statistics ==")
try:
    from scipy.stats import beta, binom
    def cp_lower(x, n):
        return 0.0 if x == 0 else beta.ppf(0.025, x, n - x + 1)
    def kmax(n, gate=0.97):
        lo_, hi_ = -1, n
        while hi_ - lo_ > 1:
            mid = (lo_ + hi_) // 2
            if cp_lower(n - mid, n) >= gate: lo_ = mid
            else: hi_ = mid
        return lo_
    for n in (300, 600, 1000, 1500, 2000):
        km = kmax(n); parts = []
        for pt in (0.98, 0.985, 0.99, 0.995):
            pw = binom.cdf(km, n, 1 - pt)
            parts.append(f"p={pt}: cell {pw * 100:.0f}%, all 12 {pw ** 12 * 100:.1f}%")
        p(f"n={n}: pass needs <= {km} misses; " + "; ".join(parts))
    for pt in (0.985, 0.99):
        for n in range(300, 8001, 50):
            km = kmax(n); pw = binom.cdf(km, n, 1 - pt)
            if pw ** 12 >= 0.9:
                p(f"true {pt}: {n} notes per cell give a 90% chance that all 12 cells pass (cell power {pw * 100:.1f}%)")
                break
    n = 3600; km = kmax(n)
    p(f"pooled 3600 notes: pass needs <= {km} misses; power at 0.98 {binom.cdf(km, n, 0.02) * 100:.0f}%, "
      f"0.985 {binom.cdf(km, n, 0.015) * 100:.0f}%")
except Exception as e:
    p("scipy unavailable:", e)
p(f"5.4: n = {1.96 ** 2 * 0.97 * 0.03 / 0.02 ** 2:.1f}; +-1%: {1.96 ** 2 * 0.97 * 0.03 / 0.01 ** 2:.0f}")
p(f"2.10: Q(1.6) = {(1 - Phi(1.6)) * 100:.1f} %, Q(2.6) = {(1 - Phi(2.6)) * 100:.2f} %")
p(f"10.4: median of 20 at 4 dB = {1.2533 * 4 / sqrt(20):.2f} dB")

# ---------------------------------------------------------------- 17
p("== 17. Covering arrays ==")
def greedy_ca(levels, t, seed=1, cands=40):
    rng = random.Random(seed); k = len(levels)
    combos = list(itertools.combinations(range(k), t))
    unc = {c: set(itertools.product(*[range(levels[i]) for i in c])) for c in combos}
    remaining = sum(len(s) for s in unc.values())
    with_col = {i: [c for c in combos if i in c] for i in range(k)}
    rows = []
    while remaining:
        best, bestg = None, -1
        nonempty = [c for c in combos if unc[c]]
        for _ in range(cands):
            c0 = rng.choice(nonempty); v0 = rng.choice(sorted(unc[c0]))
            row = [None] * k
            for i, v in zip(c0, v0): row[i] = v
            order = [i for i in range(k) if row[i] is None]; rng.shuffle(order)
            for i in order:
                bv, bg = 0, -1
                for v in range(levels[i]):
                    row[i] = v; g = 0
                    for c in with_col[i]:
                        if all(row[j] is not None for j in c) and tuple(row[j] for j in c) in unc[c]:
                            g += 1
                    if g > bg or (g == bg and rng.random() < 0.5): bg, bv = g, v
                row[i] = bv
            g = sum(1 for c in combos if tuple(row[j] for j in c) in unc[c])
            if g > bestg: bestg, best = g, row[:]
        rows.append(best)
        for c in combos:
            tpl = tuple(best[j] for j in c)
            if tpl in unc[c]: unc[c].discard(tpl); remaining -= 1
    return rows
def lbound(levels, t): return math.prod(sorted(levels, reverse=True)[:t])
def ntuples(levels, t): return sum(math.prod(levels[i] for i in c) for c in itertools.combinations(range(len(levels)), t))
master7 = [3, 3, 3, 2, 3, 2, 2]
for t in (2, 3):
    best = min(len(greedy_ca(master7, t, seed=s)) for s in range(6))
    p(f"master 7 factors {master7}: t={t}: {ntuples(master7, t)} combinations to cover; lower bound {lbound(master7, t)}; "
      f"greedy {best} rows; full factorial {math.prod(master7)}")
ext = [2, 3, 3, 3, 2, 3, 2, 3, 3, 3, 4, 3]
for t in (2, 3):
    best = min(len(greedy_ca(ext, t, seed=s, cands=25)) for s in range(3))
    p(f"extended 12 factors {ext}: t={t}: {ntuples(ext, t)} combinations; lower bound {lbound(ext, t)}; greedy {best} rows; "
      f"full factorial {math.prod(ext):,}")

# ---------------------------------------------------------------- 18
p("== 18. Echo canceller length and DRR ==")
for rt in (0.5, 1.0, 2.0):
    p(f"RT60 {rt} s: tail must fall 7-11 dB -> {7 * rt / 60 * 1000:.0f}-{11 * rt / 60 * 1000:.0f} ms")
for rc in (0.3, 1.3):
    p(f"critical distance {rc} m at 5 cm: room echo {20 * log10(rc / 0.05):.1f} dB below direct")
for drr in (10, 0, -10):
    p(f"release step at DRR {drr:+d} dB: {10 * log10(1 + 10 ** (drr / 10)):.2f} dB")
for n_ in (3, 14):
    tt = np.arange(n_) * hop_ms / 1000
    p(f"slope noise over {n_} hops at 0.5 dB: {0.5 / sqrt(((tt - tt.mean()) ** 2).sum()):.1f} dB/s")

# ---------------------------------------------------------------- 19
p("== 19. Speaker intermodulation: sum tones of practice-pad dyads ==")
pads = {'C': [48, 52, 55], 'F': [48, 53, 57], 'G': [50, 55, 59]}
for ch, notes in pads.items():
    for a, b in itertools.combinations(notes, 2):
        fsum = midi_f(a) + midi_f(b); mi, c = nearest(fsum)
        p(f"{ch} pad {name(a)}+{name(b)}: {fsum:.1f} Hz -> {name(mi)} {c:+.1f} c")

# ---------------------------------------------------------------- 20
p("== 20. Cross-key gather reach ==")
for n_ in range(2, 17):
    base = 12 * log2(n_)
    st = [6 * log2(1 + B * n_ * n_) for B in (1e-4, 4e-4, 6e-3)]
    p(f"n={n_}: {base:.2f} st ({base - round(base):+.2f} from key {round(base)}); stretch +{st[0]:.2f}/+{st[1]:.2f}/+{st[2]:.2f} st "
      f"at B=1e-4/4e-4/6e-3; {'gathered' if n_ <= 6 else 'not gathered'}")

# ---------------------------------------------------------------- 21
p("== 21. Evidence per bin-frame vs SNR (KL of exponential bins) ==")
for sdb in (-6, -3, 0, 3, 6, 10):
    s = 10 ** (sdb / 10); p(f"SNR {sdb:+d} dB: KL = {s - log(1 + s):.3f} nats")

# ---------------------------------------------------------------- 22
p("== 22. Neighbour gap in bins by tier ==")
for lo_, hi_, N in ((21, 41, 4096), (42, 66, 2048), (67, 108, 1024)):
    gaps = [(midi_f(m + 1) - midi_f(m)) / (fs / N) for m in range(lo_, hi_ + 1)]
    p(f"tier MIDI {lo_}-{hi_} N={N}: gap to upper neighbour {min(gaps):.2f}-{max(gaps):.2f} bins")
p(f"F#6->G6 at N=1024: {(midi_f(91) - midi_f(90)) / (fs / 1024):.2f} bins")

# ---------------------------------------------------------------- 23
p("== 23. Misc ==")
bf = 512 * 10 + 2 * 1024 * 11 + 2 * 2048 * 12 + 0.5 * 4096 * 13 + 128 * 8
p(f"complex radix-2 butterflies per hop ~ {bf:,.0f} ({bf * 187.5 / 1e6:.1f} M/s)")
p(f"self-play: 2.5 h x 3 rooms x 3 phones = {2.5 * 9:.1f} h audio from {2.5 * 3:.1f} h of distinct playback")
def cheb(klo, khi, n):
    return [(klo + khi) / 2 + (khi - klo) / 2 * math.cos((2 * i - 1) * pi / (2 * n)) for i in range(1, n + 1)]
white = {0, 2, 4, 5, 7, 9, 11}
def nw(m):
    c = [x for x in range(int(m) - 2, int(m) + 3) if x % 12 in white]; return min(c, key=lambda x: abs(x - m))
for klo, khi, lab in ((0, 87, '88-key quick'), (15, 75, 'PSR-E343 quick')):
    p(lab + ": " + ", ".join(name(nw(k + 21)) for k in cheb(klo, khi, 7)))
p(f"chirp: TB=700 -> {10 * log10(700):.2f} dB gain, {1 / 7000 * 1e3:.3f} ms resolution")
p(f"10 Hz high-pass at 27.5 Hz: {20 * log10(27.5 / sqrt(27.5 ** 2 + 100)):.2f} dB")

open("audit_results.txt", "w").write("\n".join(out) + "\n")
