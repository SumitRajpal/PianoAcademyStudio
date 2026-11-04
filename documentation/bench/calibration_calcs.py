"""
Reevo 2 Calibration Engine v1.0 (based on master v1.5) -- calibration_calcs.py

Re-derives every number in the calibration design document.
Run:  python3 calibration_calcs.py        (numpy, scipy; about a minute)

Conventions follow master v1.5: 48 kHz, 256-sample hop (675,000 hops per hour),
tiers 1024 / 2048 / 4096 (+8192), tau = 1.92 / 3.85 / 7.70, h = ln(K x 675,000 / R_FA),
Cramer-Rao bound with per-sample SNR as in master 2.2, Hann frames, power in tone units.
Every simulation uses a fixed seed, so the printout is reproducible.

Bench -> section of the calibration design document
  1  mains-hum harmonics on piano keys ............................ 4.3
  2  dispersion index and how well silence measures it ............ 4.1
  3  common band gain against key evidence; the profiled fix ...... 4.2
  4  recognising a stored noise state in one hop .................. 4.4
  5  removing a steady tonal line; freeze extrapolation ........... 4.3
  6  room ripple, anchor interpolation, template weights .......... 7.1, 7.2
  7  per-key tuning scatter, windows, correlated frequency evidence 6.1, 6.2
  8  chromatic scan precision ..................................... 9.3
  9  matrix pencil on a unison doublet ............................ 6.3
  10 detectability map ............................................ 9.6
  11 measuring theta* from silence ................................ 5.1, 5.2
  12 automatic gain and noise suppression detectors ............... 8
  13 anchor placement under a Gaussian-process model .............. 9.2
  14 protocol times ............................................... 9.1
  15 profile v3 size .............................................. 11
"""
import numpy as np
from math import log, log2, log10, sqrt, pi, exp
from scipy import stats

FS = 48000
HOP = 256
HOPS_PER_HOUR = 3600 * FS / HOP            # 675,000
TAU = {1024: 1.92, 2048: 3.85, 4096: 7.70, 8192: 7.70}
H88 = log(88 * HOPS_PER_HOUR / 6)          # 16.11 nats: 88 keys, 6 false notes per hour
H_EXPECTED = H88 - (log(0.9 / 0.1) - log(0.01 / 0.99))   # 9.32 nats (master 2.5)
H_WAIT = 13.42                              # waiting floor from the two-octave audit

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def kname(m):
    return f"{NAMES[m % 12]}{m // 12 - 1}"


def kf(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def header(t):
    print("\n" + "=" * 86 + "\n" + t + "\n" + "=" * 86)


def b_model(m):
    """Inharmonicity per key, as in the two-octave bench: minimum 6.3e-5 at the break
    (G2/G#2), rising log-linearly to 7.8e-3 at C8 and to 3e-4 at A0."""
    if m <= 43:
        return 10 ** (log10(3e-4) + (log10(6.3e-5) - log10(3e-4)) * (m - 21) / (43 - 21))
    return 10 ** (log10(6.3e-5) + (log10(7.8e-3) - log10(6.3e-5)) * (m - 44) / (108 - 44))


def partials(m, fmax=7500.0):
    B = b_model(m)
    hmax = 30 if m <= 41 else (16 if m <= 66 else 8)
    out = []
    for h in range(1, hmax + 1):
        f = h * kf(m) * sqrt(1 + B * h * h)
        if f < fmax:
            out.append((h, f))
    return out


def hann_bin_corr():
    """Correlation of white-noise power between DFT bins 1 and 2 apart, periodic Hann."""
    N = 4096
    w = 0.5 - 0.5 * np.cos(2 * pi * np.arange(N) / N)
    w2 = w * w
    n = np.arange(N)
    r = [abs(np.sum(w2 * np.exp(-2j * pi * d * n / N))) / np.sum(w2) for d in (1, 2, 3)]
    return [x * x for x in r]               # power correlation = |complex correlation|^2


# ----------------------------------------------------------------------------------------
def s01_mains():
    header("1. Mains-hum harmonics that sit on piano fundamentals (within 10 cents)")
    for fm in (50, 60):
        print(f"\nMains {fm} Hz, harmonics up to 2.2 kHz:")
        for n in range(1, int(2200 // fm) + 1):
            f = n * fm
            m = 69 + 12 * log2(f / 440)
            mk = round(m)
            c = 100 * (m - mk)
            if abs(c) <= 10:
                print(f"  {n:2d} x {fm} = {f:6.0f} Hz -> {kname(mk):4s} (MIDI {mk:3d}) {c:+5.1f} cents")
    # the same line also lands on lower partials of other keys
    f = 350.0
    hits = []
    for m in range(21, 109):
        for h, fp in partials(m):
            if abs(1200 * log2(fp / f)) < 15:
                hits.append(f"{kname(m)} partial {h} ({1200 * log2(fp / f):+.0f} c)")
    print("\n  A 350 Hz line also lands within 15 cents of: " + ", ".join(hits))


# ----------------------------------------------------------------------------------------
def s02_dispersion():
    header("2. Dispersion index D = var(P) / E[P]^2 of one bin's power, and how well silence measures it")
    print("  Stationary diffuse noise (exponential power): D = 1")
    for m in (0.2, 0.4, 0.6):
        print(f"  Sinusoidal power modulation, depth {m}: D = 1 + m^2 = {1 + m * m:.3f}"
              f"  (peak to trough {10 * log10((1 + m) / (1 - m)):.1f} dB)")
    for sdb in (0.5, 1, 2, 3):
        s = sdb * log(10) / 10
        v = exp(s * s) - 1
        print(f"  Log-normal common band gain, sigma {sdb} dB: var(g) = {v:.4f}, D = 1 + 2 var(g) = {1 + 2 * v:.3f}")
    for KdB in (0, 10, 20):
        K = 10 ** (KdB / 10)
        print(f"  Steady tone {KdB:2d} dB over the diffuse floor in its bin (Rician K = {K:g}): "
              f"D = (1 + 2K)/(1 + K)^2 = {(1 + 2 * K) / (1 + K) ** 2:.3f}")
    rng = np.random.default_rng(2)
    n = 400000
    s = 1 * log(10) / 10
    P = np.exp(rng.normal(-s * s / 2, s, n)) * rng.exponential(1, n)
    print(f"  check, simulated 1 dB log-normal: D = {P.var() / P.mean() ** 2:.3f}")
    z = sqrt(10) + (rng.normal(0, 1, n) + 1j * rng.normal(0, 1, n)) / sqrt(2)
    P = np.abs(z) ** 2
    print(f"  check, simulated tone at K = 10: D = {P.var() / P.mean() ** 2:.3f}")
    X = rng.exponential(1, (4000, 500))
    Dh = X.var(axis=1, ddof=1) / X.mean(axis=1) ** 2
    print(f"  SE of the estimate from n = 500 exponential samples: simulated {Dh.std():.4f}, delta method 2/sqrt(n) = {2 / sqrt(500):.4f}")
    rho = hann_bin_corr()
    print(f"  Hann power correlation between bins 1, 2, 3 apart: {rho[0]:.3f}, {rho[1]:.4f}, {rho[2]:.1e}")
    R = np.array([[rho[abs(i - j) - 1] if i != j and abs(i - j) <= 3 else (1.0 if i == j else 0.0)
                   for j in range(9)] for i in range(9)])
    nb_eff = 81 / R.sum()
    print(f"  Pooling 9 neighbouring bins gives {nb_eff:.2f} independent bins")
    for T in (1.5, 3.0):
        for N in (1024, 2048, 4096):
            frames = T * FS / HOP / TAU[N]
            se_lvl = 10 / log(10) / sqrt(frames)
            se_D = 2 / sqrt(frames * nb_eff)
            print(f"  {T:.1f} s silence, N = {N}: {frames:5.0f} independent frames per bin, level to "
                  f"{se_lvl:.2f} dB per bin; D to +/-{se_D:.3f} per 9-bin band")


# ----------------------------------------------------------------------------------------
def template(P, B, spacing=16):
    t = np.zeros(B)
    for h in range(1, P + 1):
        c = 8 + (h - 1) * spacing
        if c + 1 >= B:
            break
        t[c - 1:c + 2] += np.array([0.25, 1.0, 0.25]) / h     # SNR profile ~ 1/h under pink noise
    return t


def s03_common_mode():
    header("3. A common band gain (fan modulation, drifting noise) against key evidence, and the profiled fix")
    rng = np.random.default_rng(3)
    B = 512
    F = 20000
    for P in (8, 16, 30):
        t = template(P, B)
        neff = t.sum() ** 2 / (t ** 2).sum()
        for sdb in (0.5, 1.0, 2.0):
            s = sdb * log(10) / 10
            v = exp(s * s) - 1
            g = np.exp(rng.normal(-s * s / 2, s, (F, 1)))
            Y = g * rng.exponential(1, (F, B))
            z = (Y - 1) @ t / sqrt((t ** 2).sum())
            gh = Y.mean(axis=1, keepdims=True)
            zp = (Y / gh - 1) @ t / sqrt((t ** 2).sum() - t.sum() ** 2 / B)
            cth = 1 + v + v * neff
            th = 1 / z.var()
            thp = 1 / zp.var()
            print(f"  {P:2d} partials (n_eff {neff:4.1f}), band wobble {sdb} dB: null variance {z.var():.3f} "
                  f"(theory {cth:.3f}) -> theta* {th:.2f}, 16.1 nats acts as {th * H88:4.1f}, "
                  f"false notes x{exp((1 - th) * H88):,.0f} | profiled: variance {zp.var():.3f}, theta* {thp:.2f}")
        print(f"     price of profiling the gain: n_eff / B = {neff / B:.3f} of the key's evidence")


# ----------------------------------------------------------------------------------------
def s04_states():
    header("4. Recognising a stored noise state: evidence per hop for a band change over 300-3000 Hz")
    rho = hann_bin_corr()
    infl = 1 + 2 * (rho[0] + rho[1])
    for N in (1024, 2048, 4096):
        binw = FS / N
        nb = int(3000 / binw) - int(300 / binw)
        for ddb in (1, 3, 6):
            r = 10 ** (ddb / 10)
            kl = r - 1 - log(r)
            per_hop = kl * nb / infl / TAU[N]
            print(f"  N = {N}: {nb:3d} bins, change {ddb} dB: {kl:.3f} nats per bin, {per_hop:6.1f} nats per hop "
                  f"-> 10 nats in {10 / per_hop:.2f} hops ({10 / per_hop * HOP / FS * 1000:.1f} ms)")


# ----------------------------------------------------------------------------------------
def s05_tones():
    header("5. Removing a steady tonal line (mains hum, motor whine) before the FFT tiers")
    for N in (1024, 2048, 4096, 8192):
        row = []
        for T in (0.5, 1.0, 2.0):
            r = N / (1.5 * FS * T)
            row.append(f"T = {T:.1f} s: {10 * log10(r):6.1f} dB")
        print(f"  N = {N}: residual line power under the bin's diffuse noise, " + "; ".join(row))
    for PS in (100.0, 1000.0):
        snr = PS / (FS / 2)
        T = 1.0
        Nn = T * FS
        sf = sqrt(12 * FS ** 2 / ((2 * pi) ** 2 * snr * Nn * (Nn ** 2 - 1)))
        parts = []
        for Tf in (0.25, 0.5, 1.0):
            ph = 2 * pi * sf * Tf
            parts.append(f"frozen {Tf} s: {ph:.3f} rad, {10 * log10(ph ** 2):5.1f} dB")
        print(f"  Line {10 * log10(PS):.0f} dB over the noise in 1 Hz, tracked 1 s: sigma_f = {sf:.4f} Hz; " + "; ".join(parts))
    # simulation: least-squares line estimate over 1 s, subtracted, residual in a 2048 Hann bin
    rng = np.random.default_rng(5)
    N = 2048
    w = np.hanning(N + 1)[:-1]
    f0 = 350.0
    A = 0.05
    sigma = 0.01
    res, noi = [], []
    for _ in range(300):
        n = np.arange(FS + N)
        ph = rng.uniform(0, 2 * pi)
        x = A * np.cos(2 * pi * f0 * n / FS + ph) + sigma * rng.normal(size=n.size)
        est = x[:FS]
        C = np.vstack([np.cos(2 * pi * f0 * n[:FS] / FS), np.sin(2 * pi * f0 * n[:FS] / FS)]).T
        coef = np.linalg.lstsq(C, est, rcond=None)[0]
        nn = n[FS:]
        recon = coef[0] * np.cos(2 * pi * f0 * nn / FS) + coef[1] * np.sin(2 * pi * f0 * nn / FS)
        tone_only = A * np.cos(2 * pi * f0 * nn / FS + ph)
        k = int(round(f0 * N / FS))
        res.append(abs(np.fft.rfft(w * (tone_only - recon))[k]) ** 2)
        noi.append(abs(np.fft.rfft(w * sigma * rng.normal(size=N))[k]) ** 2)
    print(f"  Simulated, N = 2048, 1 s fit: residual line / diffuse noise in the bin = "
          f"{10 * log10(np.mean(res) / np.mean(noi)):.1f} dB (formula {10 * log10(N / (1.5 * FS)):.1f} dB)")


# ----------------------------------------------------------------------------------------
def room_level(rng, K, T60=0.5, fs2=16000, dur=2.0):
    n = int(fs2 * dur)
    t = np.arange(n) / fs2
    h = rng.normal(size=n) * np.exp(-6.91 * t / T60)
    Z = np.fft.rfft(h)
    Z = Z / sqrt(np.mean(np.abs(Z) ** 2))
    f = np.fft.rfftfreq(n, 1 / fs2)
    H = sqrt(K) * np.exp(-2j * pi * f * 0.002) + Z
    L = 10 * np.log10(np.abs(H) ** 2 / (1 + K))
    return f, L


def interp_error(rng, keys, anchors, K, reps=20, room=True):
    errs = []
    for _ in range(reps):
        if room:
            f, L = room_level(rng, K)
        logt = {}
        for m in keys:
            a = 0.7 + 0.6 * (m - keys[0]) / (keys[-1] - keys[0])
            for h, fp in partials(m):
                v = -a * 20 * log10(h) + 1.5 * np.sin(2 * pi * (m - 21) / 70) * log10(h)
                if room:
                    v += np.interp(fp, f, L)
                logt[(m, h)] = v
        for m in keys:
            if m in anchors:
                continue
            hs = [h for h, _ in partials(m)]
            est, tru = [], []
            for h in hs:
                ax = [a for a in anchors if (a, h) in logt]
                if len(ax) < 2:
                    continue
                est.append(np.interp(m, ax, [logt[(a, h)] for a in ax]))
                tru.append(logt[(m, h)])
            if len(est) < 2:
                continue
            est = np.array(est) - np.mean(est)
            tru = np.array(tru) - np.mean(tru)
            errs.extend(list(est - tru))
    return sqrt(np.mean(np.square(errs)))


def s06_room():
    header("6. Room ripple per partial, and what interpolating templates between anchors does with it")
    rng = np.random.default_rng(6)
    for KdB in (-5, 0, 5, 10):
        K = 10 ** (KdB / 10)
        z = sqrt(K) + (rng.normal(0, 1, 200000) + 1j * rng.normal(0, 1, 200000)) / sqrt(2)
        L = 10 * np.log10(np.abs(z) ** 2)
        print(f"  Direct-to-reverberant ratio {KdB:+3d} dB: level spread from partial to partial {L.std():.2f} dB")
    T60 = 0.5
    print(f"  Room correlation bandwidth 2.2 / RT60 = {2.2 / T60:.1f} Hz at RT60 = {T60} s")
    for m, h in ((21, 1), (36, 8), (60, 4), (72, 2)):
        print(f"    {kname(m)} partial {h}: next key's partial {h} is {h * kf(m) * (2 ** (1 / 12) - 1):6.1f} Hz away")
    acoustic = list(range(21, 109))
    a_quick = [21, 23, 31, 45, 64, 83, 98, 107, 108]
    a_full = [21, 23, 26, 31, 36, 43, 52, 60, 69, 77, 86, 93, 98, 103, 107, 108]
    psr = list(range(36, 97))
    p_quick = [36, 43, 53, 65, 79, 89, 95, 96]
    print("  rms template error at non-anchor keys (dB per partial, templates normalised per key):")
    print(f"    no room, acoustic quick anchors: {interp_error(rng, acoustic, a_quick, 1, reps=1, room=False):.2f} dB")
    for KdB in (-5, 0, 5, 10):
        K = 10 ** (KdB / 10)
        e1 = interp_error(rng, acoustic, a_quick, K)
        e2 = interp_error(rng, acoustic, a_full, K)
        e3 = interp_error(rng, psr, p_quick, K)
        print(f"    DRR {KdB:+3d} dB: acoustic 7 anchors {e1:.2f} dB, 16 anchors {e2:.2f} dB, PSR-E343 7 anchors {e3:.2f} dB")
    print("  quasi-likelihood weight of a partial-dominated bin, 1 / D_s with D_s = 1 + 2(exp(sigma^2) - 1):")
    for sT in (1.5, 3.0, 6.0):
        s = sT * log(10) / 10
        Ds = 1 + 2 * (exp(s * s) - 1)
        print(f"    template error {sT} dB: D_s = {Ds:.2f}, weight {1 / Ds:.2f}")


# ----------------------------------------------------------------------------------------
def s07_tuning():
    header("7. Per-key tuning scatter: confidence band against prediction interval")
    rng = np.random.default_rng(7)
    anchors = [21, 23, 31, 45, 64, 83, 98, 107, 108]
    keys = np.arange(21, 109)
    x = (keys - 64.5) / 43.5
    X = np.vander(x, 4, increasing=True)
    ia = np.array([k - 21 for k in anchors])
    non = np.array([k not in anchors for k in keys])
    Xa = X[ia]
    XtXi = np.linalg.inv(Xa.T @ Xa)
    lev = np.einsum('ij,jk,ik->i', X, XtXi, X)
    print(f"  leverage of non-anchor keys under a cubic on 9 points: mean {lev[non].mean():.2f}, "
          f"range {lev[non].min():.2f}-{lev[non].max():.2f}")
    q = stats.norm.ppf(1 - 0.00135)                     # two-sided 99.73 %, the "3 sigma" coverage
    t5 = stats.t.ppf(1 - 0.00135, 5)                     # 9 points, 4 parameters
    t15 = stats.t.ppf(1 - 0.00135, 15)                   # plus 10 pseudo-points from a population prior
    print(f"  window multipliers for 99.73% coverage: Gaussian {q:.2f}, Student t with 5 dof {t5:.2f}, 15 dof {t15:.2f}")
    for se in (1.0, 3.0, 8.0):
        outA, outB, outC, outD = [], [], [], []
        for _ in range(4000):
            smooth = 3 * x + 4 * x ** 3
            true = smooth + rng.normal(0, se, keys.size)
            meas = true[ia] + rng.normal(0, 0.1, ia.size)
            beta = XtXi @ Xa.T @ meas
            resid = meas - Xa @ beta
            s_hat = sqrt(resid @ resid / (len(ia) - 4))
            # population prior: 10 pseudo-observations at the true scatter (shrinks s_hat towards it)
            s_pool = sqrt((resid @ resid + 10 * se ** 2) / (len(ia) - 4 + 10))
            pred = X @ beta
            err = np.abs(true - pred)[non]
            outA.append(np.mean(err > 3 * s_hat * np.sqrt(lev[non]) + 0.3))
            outB.append(np.mean(err > 3 * s_hat * np.sqrt(1 + lev[non]) + 0.3))
            outC.append(np.mean(err > t5 * s_hat * np.sqrt(1 + lev[non]) + 0.3))
            outD.append(np.mean(err > t15 * s_pool * np.sqrt(1 + lev[non]) + 0.3))
        print(f"  scatter {se:.0f} cents: non-anchor keys outside their window: confidence band x3 "
              f"{100 * np.mean(outA):.1f}%, prediction interval x3 {100 * np.mean(outB):.2f}%, "
              f"x t5 {100 * np.mean(outC):.2f}%, pooled x t15 {100 * np.mean(outD):.2f}%")
    # correlated-residual frequency evidence
    se, delta, n, sm = 5.0, 8.0, 8, 0.3
    lev_m = float(lev[non].mean())
    sig_conf = 0.67 * se
    ind = n * delta ** 2 / (2 * (sm ** 2 + sig_conf ** 2))
    sc2 = se ** 2 * (1 + lev_m)
    cor = 0.5 * n * delta ** 2 / (sm ** 2 + n * sc2)
    neigh = 0.5 * n * (100 - delta) ** 2 / (sm ** 2 + n * sc2)
    print(f"  A key {delta:.0f} cents sharp on a piano with {se:.0f}-cent scatter, 8 partials:")
    print(f"    independent partials, sigma_model = confidence band: penalty {ind:.1f} nats")
    print(f"    common offset marginalised (prediction variance {sqrt(sc2):.1f} cents): penalty {cor:.2f} nats; "
          f"the neighbour 92 cents away still pays {neigh:.0f} nats")


# ----------------------------------------------------------------------------------------
def crb(N, snr):
    return sqrt(12 * FS ** 2 / ((2 * pi) ** 2 * snr * N * (N * N - 1)))


def s08_scan():
    header("8. Chromatic scan: frequency precision of one 0.4 s note against the 1 s anchor window")
    for T in (0.4, 1.0):
        N = int(T * FS)
        row = []
        for snr_db in (0, 10, 20):
            sf = crb(N, 10 ** (snr_db / 10))
            row.append(f"{snr_db:2d} dB: {sf:.5f} Hz = {1200 * log2(1 + sf / 440):.4f} cents at A4")
        print(f"  {T:.1f} s window: " + "; ".join(row))
    # f0 and B precision from a scan note, partials 1..H at falling SNR
    for m in (33, 60, 84):
        ps = partials(m)
        N = int(0.4 * FS)
        hs = np.array([h for h, _ in ps], float)
        fp = np.array([f for _, f in ps])
        snr_db = 20 - 1.5 * (hs - 1)
        sf = np.array([crb(N, 10 ** (s / 10)) for s in snr_db])
        y = (fp / hs) ** 2
        var_y = (2 * fp / hs ** 2) ** 2 * sf ** 2
        Xd = np.vstack([np.ones_like(hs), hs ** 2]).T
        W = np.diag(1 / var_y)
        cov = np.linalg.inv(Xd.T @ W @ Xd)
        alpha = kf(m) ** 2
        beta_ = alpha * b_model(m)
        sd_f0 = sqrt(cov[0, 0]) / (2 * sqrt(alpha))
        sd_B = sqrt(cov[1, 1] / alpha ** 2 + beta_ ** 2 * cov[0, 0] / alpha ** 4)
        print(f"  {kname(m)}: {len(hs)} partials, f0 to {1200 * log2(1 + sd_f0 / kf(m)):.4f} cents, "
              f"B = {b_model(m):.2e} to {100 * sd_B / b_model(m):.2f}%")


# ----------------------------------------------------------------------------------------
def mpencil(y, M):
    N = len(y)
    L = N // 3
    Y = np.array([y[i:i + L + 1] for i in range(N - L)])
    _, _, Vh = np.linalg.svd(Y, full_matrices=False)
    V = Vh.conj().T[:, :M]
    return np.linalg.eigvals(np.linalg.pinv(V[:-1]) @ V[1:])


def s09_pencil():
    header("9. Resolving a unison doublet that one FFT peak hides (matrix pencil on the calibration hold)")
    rng = np.random.default_rng(9)
    fsb, T = 200.0, 1.5
    n = np.arange(int(fsb * T))
    df, a2 = 0.6, 0.8
    al1, al2 = 2 * log(10) / 20, 6 * log(10) / 20         # 2 and 6 dB/s, in nepers per second
    print(f"  Two strings {df} Hz apart ({1200 * log2(1 + df / 523.25):.1f} cents at C5), decaying 2 and 6 dB/s, "
          f"1.5 s; Hann resolution 2/T = {2 / T:.2f} Hz")
    for snr_db in (25, 15):
        sig = 10 ** (-snr_db / 20)
        est, dec = [], []
        for _ in range(400):
            p1, p2 = rng.uniform(0, 2 * pi, 2)
            y = (np.exp((-al1 + 2j * pi * (-df / 2)) * n / fsb + 1j * p1)
                 + a2 * np.exp((-al2 + 2j * pi * (df / 2)) * n / fsb + 1j * p2))
            y = y + sig * (rng.normal(size=n.size) + 1j * rng.normal(size=n.size)) / sqrt(2)
            z = mpencil(y, 2)
            fr = np.sort(np.angle(z) * fsb / (2 * pi))
            est.append(fr[1] - fr[0])
            dec.append(np.sort(-np.log(np.abs(z)) * fsb * 20 / log(10)))
        est = np.array(est)
        dec = np.array(dec)
        print(f"  baseband SNR {snr_db} dB: spacing {est.mean():.3f} +/- {est.std():.3f} Hz; "
              f"decays {dec[:, 0].mean():.1f} +/- {dec[:, 0].std():.1f} and {dec[:, 1].mean():.1f} +/- {dec[:, 1].std():.1f} dB/s")


# ----------------------------------------------------------------------------------------
def s10_detect():
    header("10. Detectability map: expected evidence per hop and predicted delay, C4-like key, middle tier")
    tau = TAU[2048]
    mf = np.array([28, 24, 20, 17, 14, 11, 8, 5, 2, -1], float)
    lam1 = 8.0                                   # dB per second, early decay
    hop_s = HOP / FS

    def raw_hop(snr_db):
        tot = 0.0
        for si in 10 ** (snr_db / 10):
            for w in (1.0, 0.25, 0.25):
                x = si * w
                tot += x - log(1 + x)
        return tot

    for room, off in (("quiet room", 0), ("fan, +15 dB in band", 15)):
        for dyn, d in (("mf", 0), ("p ", 10), ("pp", 18)):
            out = []
            for h in (H88, H_EXPECTED, H_WAIT):
                S, k = 0.0, 0
                while S < h and k < 375:
                    S += raw_hop(mf - off - d - lam1 * k * hop_s) / tau
                    k += 1
                out.append(f"{k * hop_s * 1000:6.0f} ms" if S >= h else "  missed")
            D0 = raw_hop(mf - off - d) / tau
            print(f"  {room:20s} {dyn}: first hop {D0:8.2f} nats; free play {out[0]}, expected {out[1]}, waiting {out[2]}")
    print(f"  thresholds: free play {H88:.2f}, expected with attack cue {H_EXPECTED:.2f}, waiting without cue {H_WAIT:.2f} nats;"
          f" 'missed' = not reached within 2 s")


# ----------------------------------------------------------------------------------------
def null_increments(rng, keys, hops, mu, th_gauss, phi, burst_p=0.0, burst_a=0.0, burst_len=5):
    """tau-divided null evidence increments of one tier: AR(1) Gaussian part with long-run variance
    2|mu|/th_gauss, plus optional positive bursts (a rattle, a door, a fan hitting a resonance)."""
    from scipy.signal import lfilter
    s2_lr = 2 * abs(mu) / th_gauss
    s2 = s2_lr * (1 - phi) / (1 + phi)
    burn = 60
    e = rng.normal(0, sqrt(s2 * (1 - phi ** 2)), (keys, hops + burn))
    x = lfilter([1.0], [1.0, -phi], e, axis=1)[:, burn:] + mu
    if burst_p > 0:
        spikes = (rng.random((keys, hops)) < burst_p).astype(float)
        x += burst_a * lfilter(np.ones(burst_len), [1.0], spikes, axis=1)
    return x


def theta_moments(x, bl=50):
    keys, hops = x.shape
    nb = hops // bl
    bm = x[:, :nb * bl].reshape(keys, nb, bl).mean(axis=2)
    lrv = bm.var(ddof=1) * bl
    return 2 * abs(x.mean()) / lrv


def theta_cgf(x, bl=50):
    """Root of the empirical cumulant generating function of block sums: mean(exp(theta S)) = 1."""
    from scipy.optimize import brentq
    keys, hops = x.shape
    nb = hops // bl
    S = x[:, :nb * bl].reshape(keys, nb, bl).sum(axis=2).ravel()

    def f(t):
        m = (t * S).max()
        return m + log(np.mean(np.exp(t * S - m)))
    hi = 0.05
    while f(hi) < 0 and hi < 50:
        hi *= 1.5
    return brentq(f, 1e-4, hi) if f(hi) > 0 else float('nan')


def s11_theta():
    header("11. Measuring the room's false-alarm exponent theta* from silence (one tier, 40 keys)")
    rng = np.random.default_rng(11)
    phi = (TAU[2048] - 1) / (TAU[2048] + 1)
    keys, mu = 40, -0.1
    from scipy.optimize import brentq
    cases = [("Gaussian, calibrated", 1.0, 0.0, 0.0), ("Gaussian, fan-like", 0.5, 0.0, 0.0),
             ("bursts on a calibrated base", 1.0, 0.003, 1.2)]
    for name, thg, bp, ba in cases:
        s2_lr = 2 * abs(mu) / thg
        # exact long-run cumulant generating function per hop: Gaussian part + compound Poisson bursts
        kappa = lambda t: t * mu + t * t * s2_lr / 2 + bp * (np.exp(t * ba * 5) - 1)
        truth = brentq(kappa, 1e-3, 10.0)
        for T in (3.0, 1.5):
            hops = int(T * FS / HOP)
            em, ec = [], []
            for _ in range(300):
                x = null_increments(rng, keys, hops, mu, thg, phi, bp, ba)
                em.append(theta_moments(x))
                ec.append(theta_cgf(x))
            em, ec = np.array(em), np.array(ec)
            ec = ec[np.isfinite(ec)]
            print(f"  {name:28s} true {truth:.2f} | {T:.1f} s: moments {em.mean():.2f} +/- {em.std():.2f}; "
                  f"CGF root {ec.mean():.2f} +/- {ec.std():.2f}")
    # the threshold that restores the budget: h' = h / theta*
    for th in (0.9, 0.7, 0.5):
        print(f"  theta* {th}: threshold {H88:.1f} -> {H88 / th:.1f} nats, or evidence scaled by {th}; "
              f"a cap of +1 nat leaves the false-note rate x{exp((1 - th) * H88 - th * 1.0):,.0f}")


# ----------------------------------------------------------------------------------------
def s12_processing():
    header("12. Detecting automatic gain or noise suppression from the calibration silence")
    p_lo, p_hi = 1 - exp(-0.1), exp(-3)
    rho = hann_bin_corr()
    infl = 1 + 2 * (rho[0] + rho[1])
    N = 2048
    nb = int(4000 / (FS / N)) - int(200 / (FS / N))
    for T in (1.5, 3.0):
        n_eff = T * FS / HOP / TAU[N] * nb / infl
        print(f"  {T} s, N = {N}, 200-4000 Hz: {n_eff:,.0f} independent bin-frames; share below 0.1 x mean "
              f"{100 * p_lo:.1f}% +/- {100 * sqrt(p_lo * (1 - p_lo) / n_eff):.2f}%, above 3 x mean {100 * p_hi:.1f}% +/- "
              f"{100 * sqrt(p_hi * (1 - p_hi) / n_eff):.2f}%")
    frames = 0.3 * FS / HOP / TAU[N]
    lvl = 10 / log(10) / sqrt(frames * nb / infl)
    print(f"  noise level of a 0.3 s window over the same band: +/-{lvl:.2f} dB, so a 1 dB pump after a loud strike is {1 / lvl:.0f} sigma")


# ----------------------------------------------------------------------------------------
def s13_design():
    header("13. Where anchors go: Chebyshev against a greedy Gaussian-process design (smooth part only)")
    keys = np.arange(21, 109, dtype=float)
    ends = [21.0, 108.0]
    cheb = [23, 31, 45, 64, 83, 98, 107]
    for ell in (12.0, 20.0, 30.0):
        def kern(a, b):
            return 9.0 * np.exp(-0.5 * (a[:, None] - b[None, :]) ** 2 / ell ** 2)

        def mean_sd(pts, noise=1.0):
            P = np.array(pts, float)
            Kpp = kern(P, P) + noise * np.eye(len(P))
            Kxp = kern(keys, P)
            var = 9.0 - np.einsum('ij,jk,ik->i', Kxp, np.linalg.inv(Kpp), Kxp)
            return np.sqrt(np.maximum(var, 0)).mean()

        g = list(ends)
        for _ in range(7):
            best = min((k for k in keys if k not in g), key=lambda k: mean_sd(g + [k]))
            g.append(best)
        uni = list(np.round(np.linspace(21, 108, 9))[1:-1])
        print(f"  length scale {ell:.0f} keys: mean predictive SD of the smooth curve (prior 3 cents, scatter 1 cent): "
              f"Chebyshev {mean_sd(ends + cheb):.2f}, greedy {mean_sd(g):.2f}, uniform {mean_sd(ends + uni):.2f} cents")


# ----------------------------------------------------------------------------------------
def s14_protocol():
    header("14. Protocol times (2.5 s per strike as in master 8.1; scans at 2 notes per second)")
    strike, chirp = 2.5, 5.0
    master = {
        "quick, acoustic": (21, 3.0), "quick, digital": (28, 3.0),
        "full, acoustic": (39, 3.0), "full, digital": (55, 3.0)}
    for k, (s, sil) in master.items():
        print(f"  master v1.5 {k:16s}: {s} strikes, {s * strike + sil + chirp:6.1f} s")
    # start from the totals master 8.1 states (62, 79, 106, 146 s), so the comparison is like for like
    saved = 3.0 - 1.5                                  # silence cut from 3 s to 1.5 s (re-audit O2)
    q_ac = 62 - saved
    q_dg = 79 - saved
    scan_ac, scan_dg, scan_win = 88 / 2, 61 / 2, 24 / 2
    st_ac = q_ac + scan_ac
    st_dg = q_dg - 7 * strike + scan_dg                # the scan replaces the 7 medium anchor strikes
    fu_ac = 106 - saved + 2 * scan_ac + 17 * strike     # mf and p scans, 17 octave and twelfth pairs
    fu_dg = 146 - saved - 16 * strike + 2 * scan_dg + 17 * strike
    print(f"  new quick, acoustic : {q_ac:6.1f} s   (silence 1.5 s; new checks run on the same audio)")
    print(f"  new quick, digital  : {q_dg:6.1f} s")
    print(f"  standard, acoustic  : {st_ac:6.1f} s   (quick + 88-key scan at mf)")
    print(f"  standard, digital   : {st_dg:6.1f} s   (quick, medium anchor strikes dropped, + 61-key scan)")
    print(f"  focus-window scan   : {scan_win:6.1f} s per dynamic (24 keys)")
    print(f"  full, acoustic      : {fu_ac:6.1f} s   (16 anchors, mf and p scans, 17 pair strikes)")
    print(f"  full, digital       : {fu_dg:6.1f} s")


# ----------------------------------------------------------------------------------------
def s15_profile():
    header("15. Profile v3 size")
    bins = 513 + 1025 + 2049 + 4097
    inst = 88 * (5 + 3 + 2 + 3 + 2 + 60) * 4
    place = 88 * (60 + 30 + 8 + 6) * 4
    noise_state = bins * 4 + 4 * 30 * 2 * 4 + 32 * 6 * 4 + 4 * 64 * 4 * 4
    route = 10 * 1024 + 512 * 4
    tot = inst + place + 4 * noise_state + route
    print(f"  instrument layer {inst / 1024:.1f} KB; placement layer {place / 1024:.1f} KB; one noise state "
          f"{noise_state / 1024:.1f} KB (up to 4 per room); route {route / 1024:.1f} KB; total {tot / 1024:.0f} KB")
    print(f"  master profile v2: about 100 KB")


if __name__ == "__main__":
    print(f"h for 88 keys at 6 false notes per hour = {H88:.2f} nats; expected-note threshold {H_EXPECTED:.2f} nats")
    s01_mains()
    s02_dispersion()
    s03_common_mode()
    s04_states()
    s05_tones()
    s06_room()
    s07_tuning()
    s08_scan()
    s09_pencil()
    s10_detect()
    s11_theta()
    s12_processing()
    s13_design()
    s14_protocol()
    s15_profile()
