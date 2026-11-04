"""
Puts the Mac's log on the phone's clock. The sync notes are found in the
take's audio: first roughly, by the pattern of their times in the log
(the loud C7's rise in the high-passed audio, matched against the log's
spacing); then each one exactly, by its onset. A straight line
t_phone = a × t_mac + b through them takes out the offset and the two
clocks' drift; with three or more sync notes, each one's residual says how
well the line holds.

An onset, wherever it is measured, is the first sample where the sound
stands clear of the noise before it: six times the noise's spread, with the
sound still rising after it. That is a fraction of a millisecond after the
sound starts for a loud note, and up to about one for a soft bass note; the
delay take measures every key and velocity with the same rule, so labels
carry the same small lead-in. Times are in seconds.
"""

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfiltfilt

RATE = 48000
SYNC_HIGHPASS_HZ = 1000.0  # C7 is 2093 Hz: this keeps it and drops rumble and voices
NOISE_SPREADS = 6.0
MAX_RESIDUAL_MS = 2.0  # master 5.7
SYNC_TOLERANCE = 0.03  # seconds: how far a sync note's rise may sit from where the log puts it, before drift
MAX_DRIFT_PPM = 200.0  # phone and Mac clocks drift 20 to 100 ppm apart; this allows twice that


def read_audio(path):
    rate, x = wavfile.read(path)
    if rate != RATE:
        raise ValueError(f'{path}: {rate} Hz, not {RATE}')
    if x.ndim > 1:
        x = x.mean(axis=1)
    if x.dtype.kind in 'iu':
        x = x / float(np.iinfo(x.dtype).max)
    return x.astype(np.float64)


def highpass(x, hz=SYNC_HIGHPASS_HZ):
    return sosfiltfilt(butter(4, hz, btype='highpass', fs=RATE, output='sos'), x)


def onset_near(x, t, before=0.03, after=0.08):
    """
    The onset of the sound that starts within [t - before, t + after]: the
    first sample standing six noise spreads clear of the 90 ms before the
    search, with the sound reaching three times that within 5 ms. Seconds,
    interpolated between samples; None if nothing starts there.
    """
    n0 = int(round((t - before - 0.1) * RATE))
    a = int(round((t - before) * RATE))
    b = int(round((t + after) * RATE))
    if n0 < 0 or b + int(0.005 * RATE) > len(x):
        return None
    noise = x[n0 : a - int(0.01 * RATE)]
    centre = float(np.median(noise))
    spread = 1.4826 * float(np.median(np.abs(noise - centre))) + 1e-9
    level = NOISE_SPREADS * spread
    y = np.abs(x[a : b + int(0.005 * RATE)] - centre)
    above = np.nonzero(y[: b - a] > level)[0]
    span = int(0.005 * RATE)
    for i in above:
        if y[i : i + span].max() >= 3 * level:
            if i == 0:
                return a / RATE
            frac = (level - y[i - 1]) / (y[i] - y[i - 1]) if y[i] != y[i - 1] else 0.0
            return (a + i - 1 + min(max(frac, 0.0), 1.0)) / RATE
    return None


def _coarse_onsets(hp):
    """Every clear rise in the high-passed audio, 5 ms frames: (times, strengths in dB), in time order."""
    hop = 240
    frames = len(hp) // hop
    if frames < 3:
        return np.zeros(0), np.zeros(0)
    rms = np.sqrt(np.mean(hp[: frames * hop].reshape(frames, hop) ** 2, axis=1)) + 1e-9
    rise = np.maximum(np.diff(20 * np.log10(rms)), 0)
    i = np.arange(1, len(rise) - 1)
    peaks = i[(rise[i] >= rise[i - 1]) & (rise[i] > rise[i + 1]) & (rise[i] > 6)]
    return (peaks + 1) * hop / RATE, rise[peaks]


class SyncError(Exception):
    pass


def find_syncs(x, sync_times_mac):
    """
    The audio onsets of the sync notes whose Mac times are given, in the same
    order. Raises SyncError if they can't all be found.
    """
    if len(sync_times_mac) < 2:
        raise SyncError('a take needs at least two sync notes')
    times, strengths = _coarse_onsets(highpass(x))
    if len(times) < len(sync_times_mac):
        raise SyncError('too few notes in the audio for its sync notes: is it the right take?')
    rel = np.asarray(sync_times_mac, dtype=np.float64) - sync_times_mac[0]
    # The clocks drift apart as the take goes on, so later sync notes may sit further from where the log puts them.
    tolerance = SYNC_TOLERANCE + MAX_DRIFT_PPM * 1e-6 * rel[-1]
    # Try every rise as the opening sync note; the right one finds a rise at every sync note's time,
    # and the strongest set of them (sync notes are the loudest notes, after silence).
    best = None
    for c in times:
        expected = c + rel
        j = np.clip(np.searchsorted(times, expected), 1, len(times) - 1)
        nearest = np.where(np.abs(expected - times[j - 1]) <= np.abs(times[j] - expected), j - 1, j)
        found = np.abs(times[nearest] - expected) <= tolerance
        key = (int(found.sum()), float(strengths[nearest[found]].sum()))
        if best is None or key > best[0]:
            best = (key, np.where(found, times[nearest], np.nan))
    (score, _), coarse = best
    if score < len(rel):
        missing = [i for i in range(len(rel)) if np.isnan(coarse[i])]
        raise SyncError(f'found {score} of {len(rel)} sync notes; missing sync note(s) {missing}')

    # A rough line through the coarse times puts each sync note within a few ms; its onset is measured there.
    slope, icept = np.polyfit(sync_times_mac, coarse, 1)
    onsets = []
    for i, t_mac in enumerate(sync_times_mac):
        onset = onset_near(x, slope * t_mac + icept, before=0.02, after=0.02)
        if onset is None:
            raise SyncError(f'sync note {i} has no clear onset near {slope * t_mac + icept:.3f} s')
        onsets.append(onset)
    return onsets


def fit_clock(sync_times_mac, sync_onsets):
    """t_phone = a × t_mac + b by least squares, with each sync note's residual in ms."""
    t = np.asarray(sync_times_mac, dtype=np.float64)
    y = np.asarray(sync_onsets, dtype=np.float64)
    a, b = np.polyfit(t, y, 1)
    residuals = (y - (a * t + b)) * 1000
    return {
        'a': float(a),
        'b': float(b),
        'driftPpm': float((a - 1) * 1e6),
        'syncs': len(t),
        'residualsMs': [round(float(r), 4) for r in residuals],
        'maxResidualMs': round(float(np.max(np.abs(residuals))), 4),
        'ok': bool(np.max(np.abs(residuals)) <= MAX_RESIDUAL_MS),
    }


def align(audio, log_messages):
    """The clock fit for a take: its audio and the messages of its rig log."""
    syncs = [m['t'] for m in log_messages if m.get('sync') and m['type'] == 'note_on']
    return fit_clock(syncs, find_syncs(audio, syncs))
