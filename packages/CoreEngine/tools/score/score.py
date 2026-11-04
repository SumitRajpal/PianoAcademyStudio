#!/usr/bin/env python3
"""
The harness scorer: master section 5.1's metrics for engine runs against
labelled takes, per cell, with bootstrap 95% intervals over takes, and the
comparison with a baseline that 5.6 asks for.

  score.py report <takes> <runs> [--out report.json] [--boot 1000] [--seed 1]
  score.py compare <baseline.json> <report.json> [--per-take]
  score.py inspect <take> [<take> ...]

inspect checks a take copied from the phone (the take recorder, slice 2)
against its meta.json: 48 kHz mono 32-bit float, and the length, peak and
clipped count the phone saw.

compare fails when a gate metric is worse than the baseline's 95% interval
(5.6), the rule for a recorded corpus. With --per-take it fails when any take
is worse at all, the rule for the deterministic golden takes, whose few takes
give intervals too wide to catch a regression.

A take is a folder holding labels.json and meta.json (and audio.wav, for the
runner). A run is a folder with the same name holding events.jsonl,
rejections.jsonl and run.json, as the runner writes them; the runner arrives
with Reevo 2's first stage.
Times are in seconds; keys are MIDI numbers.
"""

import argparse
import json
import math
import os
import sys

import mir_eval
import numpy as np

TOLERANCES_MS = (10, 20, 30, 50)
# A note detected up to this late was heard, but too late to count (it is "late").
HEARD_S = 0.25
# Rejections that explain a missed note: from just before its onset to this long after.
MISS_WINDOW_S = (-0.02, 0.35)
# A strike near-miss ("onset") explains a note only at the note's own strike.
ONSET_WINDOW_S = (-0.02, 0.03)
# Gate metrics compared against a baseline (5.6), and which way is better.
GATES = {
    'f1@50': 'higher',
    'detectionRate': 'higher',
    'falseNotesPerHour': 'lower',
    'releaseAccuracy': 'higher',
    'timestampP95Ms': 'lower',
}


def hz(midi):
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


def register(midi):
    """The engine's three registers: bass below C3, treble from C5."""
    return 'bass' if midi < 48 else ('middle' if midi < 72 else 'treble')


def loudness(velocity):
    """A labelled MIDI velocity as a dynamic level; None without one."""
    if velocity is None:
        return None
    for top, name in ((39, 'pp'), (59, 'p'), (79, 'mf'), (99, 'f')):
        if velocity <= top:
            return name
    return 'ff'


def notes_from_events(run):
    """Pairs each key's NoteOn and NoteOff into (midi, onset, offset, velocity) notes."""
    duration = run.get('durationSec')
    sounding = {}
    notes = []
    for e in sorted(run['events'], key=lambda e: e['t']):
        midi, t = e['midi'], e['t']
        if e['type'] == 'on':
            if midi in sounding:  # struck again while sounding
                on, vel = sounding.pop(midi)
                notes.append((midi, on, t, vel))
            sounding[midi] = (t, e.get('velocity'))
        elif midi in sounding:
            on, vel = sounding.pop(midi)
            notes.append((midi, on, t, vel))
    for midi, (on, vel) in sounding.items():
        notes.append((midi, on, duration if duration is not None and duration > on else on, vel))
    return sorted(notes, key=lambda n: (n[1], n[0]))


def _intervals(notes):
    """mir_eval wants strictly positive durations; a zero-length note gets a microsecond."""
    return np.array([[on, max(off, on + 1e-6)] for _, on, off in notes]).reshape(-1, 2)


def _match(ref, est, tolerance):
    """mir_eval's onset matching (same key, onset within the tolerance): (ref index, est index) pairs."""
    if not ref or not est:
        return []
    return mir_eval.transcription.match_notes(
        _intervals(ref),
        np.array([hz(m) for m, _, _ in ref]),
        _intervals(est),
        np.array([hz(m) for m, _, _ in est]),
        onset_tolerance=tolerance,
        pitch_tolerance=50.0,
        offset_ratio=None,
    )


def _miss_cause(note, rejections):
    """Why a played note was never heard: the last rejection of its key around its onset."""
    lo, hi = note['onset'] + MISS_WINDOW_S[0], note['onset'] + MISS_WINDOW_S[1]
    near = [r for r in rejections if lo <= r['t'] <= hi]
    keyed = [r for r in near if r['midi'] == note['midi']]
    unkeyed = [
        r
        for r in near
        if r['midi'] < 0
        and (r['gate'] != 'onset' or ONSET_WINDOW_S[0] <= r['t'] - note['onset'] <= ONSET_WINDOW_S[1])
    ]
    if keyed:
        return keyed[-1]['gate']
    if unkeyed:
        return unkeyed[-1]['gate']
    return 'no candidate'


def take_counts(take, run):
    """Everything one take contributes to the pooled metrics."""
    ref_notes = take['notes']
    ref = [(n['midi'], n['onset'], n.get('offset', n['onset'] + 1e-3)) for n in ref_notes]
    est_full = notes_from_events(run)
    est = [(m, on, off) for m, on, off, _ in est_full]
    duration = run.get('durationSec') or take['meta'].get('durationSec') or 0.0

    matched = {}
    pairs50 = []
    for tol in TOLERANCES_MS:
        pairs = _match(ref, est, tol / 1000.0)
        matched[str(tol)] = len(pairs)
        if tol == 50:
            pairs50 = pairs
    heard_pairs = _match(ref, est, HEARD_S)
    heard_refs = {i for i, _ in heard_pairs}
    on_time_refs = {i for i, _ in pairs50}
    on_time_ests = {j for _, j in pairs50}

    errors = [est[j][1] - ref[i][1] for i, j in pairs50]
    latencies = [est[j][1] - ref[i][1] for i, j in heard_pairs]
    releases = []
    velocities = []
    for i, j in pairs50:
        n = ref_notes[i]
        if 'offset' in n and n.get('releaseObservable', True):
            length = n['offset'] - n['onset']
            releases.append(abs(est[j][2] - n['offset']) <= max(0.05, 0.2 * length))
        if n.get('velocity') is not None and est_full[j][3] is not None:
            velocities.append((n['velocity'], est_full[j][3]))

    causes = {}
    for i, n in enumerate(ref_notes):
        if i in on_time_refs:
            continue
        cause = 'late' if i in heard_refs else _miss_cause(n, run.get('rejections', []))
        causes[cause] = causes.get(cause, 0) + 1

    return {
        'id': take['id'],
        'meta': take['meta'],
        'hours': duration / 3600.0,
        'nRef': len(ref),
        'nEst': len(est),
        'matched': matched,
        'heard': len(heard_pairs),
        'errors': errors,
        'latencies': latencies,
        'releases': releases,
        'velocities': velocities,
        'missCauses': causes,
        # Per note, for the register and loudness cells.
        'refNotes': [
            {'register': register(n['midi']), 'loudness': loudness(n.get('velocity')), 'hit': i in on_time_refs}
            for i, n in enumerate(ref_notes)
        ],
        'estNotes': [{'register': register(m), 'hit': j in on_time_ests} for j, (m, _, _) in enumerate(est)],
    }


def _ratio(a, b):
    return a / b if b else None


def _f1(p, r):
    if p is None or r is None:
        return None
    return 2 * p * r / (p + r) if p + r > 0 else 0.0


def _spearman(pairs):
    if len(pairs) < 3:
        return None
    a = np.array([p[0] for p in pairs], dtype=float)
    b = np.array([p[1] for p in pairs], dtype=float)
    ra = np.argsort(np.argsort(a)).astype(float)
    rb = np.argsort(np.argsort(b)).astype(float)
    if ra.std() == 0 or rb.std() == 0:
        return None
    return float(np.corrcoef(ra, rb)[0, 1])


def pooled_metrics(counts):
    """The 5.1 metrics, pooled over takes (each note counts once)."""
    n_ref = sum(c['nRef'] for c in counts)
    n_est = sum(c['nEst'] for c in counts)
    hours = sum(c['hours'] for c in counts)
    precision, recall, f1 = {}, {}, {}
    for tol in TOLERANCES_MS:
        k = str(tol)
        m = sum(c['matched'][k] for c in counts)
        precision[k] = _ratio(m, n_est)
        recall[k] = _ratio(m, n_ref)
        f1[k] = _f1(precision[k], recall[k])
    # A false note matches no played note even up to HEARD_S late: a ghost, not a late note.
    false_notes = n_est - sum(c['heard'] for c in counts)
    errors = np.array([e for c in counts for e in c['errors']])
    latencies = np.array([e for c in counts for e in c['latencies']])
    releases = [r for c in counts for r in c['releases']]
    causes = {}
    for c in counts:
        for k, v in c['missCauses'].items():
            causes[k] = causes.get(k, 0) + v
    return {
        'nRef': n_ref,
        'nEst': n_est,
        'hours': hours,
        'precision': precision,
        'recall': recall,
        'f1': f1,
        'detectionRate': recall['50'],
        'heardRate': _ratio(sum(c['heard'] for c in counts), n_ref),
        'falseNotesPerHour': _ratio(false_notes, hours),
        'timestampError': None
        if errors.size == 0
        else {
            'biasMs': float(errors.mean() * 1000),
            'spreadMs': float(errors.std() * 1000),
            'p95Ms': float(np.percentile(np.abs(errors), 95) * 1000),
        },
        'decisionLatencyMs': None
        if latencies.size == 0
        else {p: float(np.percentile(latencies, q) * 1000) for p, q in (('p50', 50), ('p95', 95), ('p99', 99))},
        'releaseAccuracy': _ratio(sum(releases), len(releases)),
        'velocityRankCorrelation': _spearman([v for c in counts for v in c['velocities']]),
        'missCauses': dict(sorted(causes.items(), key=lambda kv: (-kv[1], kv[0]))),
    }


def _gate_values(counts):
    m = pooled_metrics(counts)
    return {
        'f1@50': m['f1']['50'],
        'detectionRate': m['detectionRate'],
        'falseNotesPerHour': m['falseNotesPerHour'],
        'releaseAccuracy': m['releaseAccuracy'],
        'timestampP95Ms': m['timestampError']['p95Ms'] if m['timestampError'] else None,
    }


def with_intervals(counts, boot=1000, seed=1):
    """Each gate metric with a bootstrap 95% interval over takes (takes resampled with replacement)."""
    point = _gate_values(counts)
    rng = np.random.default_rng(seed)
    samples = {k: [] for k in point}
    for _ in range(boot):
        pick = rng.integers(0, len(counts), len(counts))
        for k, v in _gate_values([counts[i] for i in pick]).items():
            if v is not None:
                samples[k].append(v)
    out = {}
    for k, v in point.items():
        s = samples[k]
        out[k] = {
            'value': v,
            'ci': [float(np.percentile(s, 2.5)), float(np.percentile(s, 97.5))] if v is not None and s else None,
        }
    return out


def _note_cell(ref, est):
    hits = sum(n['hit'] for n in ref)
    est_hits = sum(n['hit'] for n in est)
    recall = _ratio(hits, len(ref))
    precision = _ratio(est_hits, len(est))
    return {'notes': len(ref), 'detectionRate': recall, 'precision': precision, 'f1': _f1(precision, recall)}


def cell_metrics(counts):
    """Per register and loudness (note by note), and per recording condition (take by take)."""
    cells = {'register': {}, 'loudness': {}}
    for name in ('bass', 'middle', 'treble'):
        ref = [n for c in counts for n in c['refNotes'] if n['register'] == name]
        est = [n for c in counts for n in c['estNotes'] if n['register'] == name]
        if ref or est:
            cells['register'][name] = _note_cell(ref, est)
    for name in ('pp', 'p', 'mf', 'f', 'ff'):
        ref = [n for c in counts for n in c['refNotes'] if n['loudness'] == name]
        if ref:
            hits = sum(n['hit'] for n in ref)
            cells['loudness'][name] = {'notes': len(ref), 'detectionRate': hits / len(ref)}
    for key in ('instrument', 'distance_m', 'placement', 'room', 'background', 'phone', 'take'):
        groups = {}
        for c in counts:
            if key in c['meta']:
                groups.setdefault(str(c['meta'][key]), []).append(c)
        if groups:
            name = 'distance' if key == 'distance_m' else key
            cells[name] = {}
            for value, group in sorted(groups.items()):
                m = pooled_metrics(group)
                cells[name][value] = {
                    'takes': len(group),
                    'notes': m['nRef'],
                    'detectionRate': m['detectionRate'],
                    'f1': m['f1']['50'],
                    'falseNotesPerHour': m['falseNotesPerHour'],
                }
    return cells


def _read_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def _read_jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding='utf-8') as f:
        return [json.loads(line) for line in f if line.strip()]


def load_take(folder):
    labels = _read_json(os.path.join(folder, 'labels.json'))
    meta_path = os.path.join(folder, 'meta.json')
    meta = _read_json(meta_path) if os.path.exists(meta_path) else {}
    return {'id': os.path.basename(os.path.normpath(folder)), 'notes': labels['notes'], 'meta': meta}


def load_run(folder):
    info_path = os.path.join(folder, 'run.json')
    info = _read_json(info_path) if os.path.exists(info_path) else {}
    return {
        'events': _read_jsonl(os.path.join(folder, 'events.jsonl')),
        'rejections': _read_jsonl(os.path.join(folder, 'rejections.jsonl')),
        'durationSec': info.get('durationSec'),
        'engine': info.get('engine'),
    }


def _rounded(x):
    if isinstance(x, float):
        return None if math.isnan(x) else round(x, 6)
    if isinstance(x, dict):
        return {k: _rounded(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_rounded(v) for v in x]
    return x


def report(takes_dir, runs_dir, boot=1000, seed=1):
    """Scores every take in takes_dir against its run in runs_dir."""
    names = sorted(d for d in os.listdir(takes_dir) if os.path.exists(os.path.join(takes_dir, d, 'labels.json')))
    missing = [n for n in names if not os.path.isdir(os.path.join(runs_dir, n))]
    if missing:
        raise SystemExit(f'No run for: {", ".join(missing)}')
    counts = []
    engines = set()
    for name in names:
        run = load_run(os.path.join(runs_dir, name))
        engines.add(run['engine'])
        counts.append(take_counts(load_take(os.path.join(takes_dir, name)), run))
    metrics = pooled_metrics(counts)
    return _rounded({
        'version': 1,
        'engine': sorted(e for e in engines if e) or None,
        'takes': len(counts),
        'boot': boot,
        'seed': seed,
        'overall': with_intervals(counts, boot=boot, seed=seed),
        'metrics': metrics,
        'cells': cell_metrics(counts),
        'perTake': [
            {
                'id': c['id'],
                'notes': c['nRef'],
                'detected': c['nEst'],
                'onTime': c['matched']['50'],
                'heard': c['heard'],
                'missCauses': c['missCauses'],
            }
            for c in counts
        ],
    })


def compare(baseline, current):
    """Gate metrics that got worse than the baseline's 95% interval allows (5.6)."""
    problems = []
    for metric, better in GATES.items():
        base = baseline.get('overall', {}).get(metric)
        now = current.get('overall', {}).get(metric)
        if not base or not now or base.get('ci') is None or now.get('value') is None:
            continue
        lo, hi = base['ci']
        value = now['value']
        if (better == 'higher' and value < lo) or (better == 'lower' and value > hi):
            problems.append({'metric': metric, 'baseline': base['value'], 'now': value, 'bound': lo if better == 'higher' else hi})
    return problems


def compare_takes(baseline, current):
    """Per take: fewer notes on time or heard, or more ghost notes, is a regression.
    Returns (problems, improvements)."""
    now = {t['id']: t for t in current.get('perTake', [])}
    problems, better = [], []
    for base in baseline.get('perTake', []):
        take = now.get(base['id'])
        if take is None:
            problems.append({'take': base['id'], 'metric': 'missing', 'baseline': None, 'now': None})
            continue
        base_ghosts, ghosts = base['detected'] - base['heard'], take['detected'] - take['heard']
        worse = [
            (metric, b, n)
            for metric, b, n in (
                ('onTime', base['onTime'], take['onTime']),
                ('heard', base['heard'], take['heard']),
            )
            if n < b
        ]
        if ghosts > base_ghosts:
            worse.append(('ghosts', base_ghosts, ghosts))
        problems += [{'take': base['id'], 'metric': m, 'baseline': b, 'now': n} for m, b, n in worse]
        if not worse and (take['onTime'] > base['onTime'] or take['heard'] > base['heard'] or ghosts < base_ghosts):
            better.append({'take': base['id']})
    return problems, better


def _fmt(v, pct=False, unit=''):
    if v is None:
        return '–'
    return f'{100 * v:.1f}%' if pct else f'{v:.1f}{unit}'


def summary(rep):
    """A short Markdown summary of a report."""
    m, o = rep['metrics'], rep['overall']
    lines = [
        f"{rep['takes']} takes, {m['nRef']} played notes, {m['nEst']} detected, {m['hours'] * 60:.1f} min of audio",
        '',
        '| Metric | Value | 95% interval |',
        '| --- | --- | --- |',
    ]
    for tol in TOLERANCES_MS:
        lines.append(f"| F1 at {tol} ms | {_fmt(m['f1'][str(tol)], pct=True)} | |")

    def ci(key, pct=False, unit=''):
        c = o[key]['ci']
        return f'{_fmt(c[0], pct, unit)} – {_fmt(c[1], pct, unit)}' if c else ''

    lines += [
        f"| Detection rate (50 ms) | {_fmt(o['detectionRate']['value'], pct=True)} | {ci('detectionRate', pct=True)} |",
        f"| Heard at all (up to {int(HEARD_S * 1000)} ms late) | {_fmt(m['heardRate'], pct=True)} | |",
        f"| False notes per hour | {_fmt(o['falseNotesPerHour']['value'])} | {ci('falseNotesPerHour')} |",
    ]
    if m['timestampError']:
        t = m['timestampError']
        lines.append(f"| Timestamp error: bias, spread, 95th pct | {t['biasMs']:.1f}, {t['spreadMs']:.1f}, {t['p95Ms']:.1f} ms | {ci('timestampP95Ms', unit=' ms')} |")
    if m['decisionLatencyMs']:
        d = m['decisionLatencyMs']
        lines.append(f"| Decision latency on the computer: 50th, 95th, 99th pct | {d['p50']:.1f}, {d['p95']:.1f}, {d['p99']:.1f} ms | |")
    lines.append(f"| Release accuracy | {_fmt(m['releaseAccuracy'], pct=True)} | {ci('releaseAccuracy', pct=True)} |")
    if m['missCauses']:
        lines += ['', 'Why notes were missed: ' + ', '.join(f'{k} {v}' for k, v in m['missCauses'].items())]
    reg = rep['cells'].get('register', {})
    if reg:
        lines += ['', '| Register | Notes | Detection rate | F1 |', '| --- | --- | --- | --- |']
        for name, c in reg.items():
            lines.append(f"| {name} | {c['notes']} | {_fmt(c['detectionRate'], pct=True)} | {_fmt(c['f1'], pct=True)} |")
    return '\n'.join(lines)


CLIP_LEVEL = np.float32(0.985)  # master 6.5's clip flag, as the take recorder counts it


def inspect_take(folder):
    """Checks a take recorded on the phone against its meta.json. Returns (ok, lines)."""
    from scipy.io import wavfile

    name = os.path.basename(os.path.normpath(folder))
    path = os.path.join(folder, 'audio.wav')
    if not os.path.exists(path):
        return False, [f'✗ {name}: no audio.wav']
    try:
        rate, x = wavfile.read(path)
    except Exception as e:  # noqa: BLE001 - any unreadable file is reported, not raised
        return False, [f'✗ {name}: audio.wav cannot be read ({e})']
    ok = True
    problems = []
    if x.ndim != 1:
        ok = False
        problems.append(f'✗ {x.shape[1]} channels, not mono')
        x = x[:, 0]
    if rate != 48000:
        ok = False
        problems.append(f'✗ {rate} Hz, not 48000')
    if x.dtype != np.float32:
        ok = False
        problems.append(f'✗ {x.dtype} samples, not 32-bit float')
    a = np.abs(x.astype(np.float32))
    samples = int(len(x))
    peak = float(a.max()) if samples else 0.0
    peak_db = 20 * math.log10(peak) if peak > 0 else -200.0
    clipped = int(np.count_nonzero(a >= CLIP_LEVEL))
    lines = [f'{name}: {samples / 48000:.2f} s, peak {peak_db:.1f} dBFS, {clipped} clipped']

    meta_path = os.path.join(folder, 'meta.json')
    if not os.path.exists(meta_path):
        return ok, lines + problems + ['  no meta.json to check against']
    meta = _read_json(meta_path)
    cap = meta.get('capture')
    if not cap:
        return False, lines + problems + ['✗ meta.json has no capture counts: the take never finished']
    for key, said, found in (('samples', cap.get('samples'), samples), ('clippedSamples', cap.get('clippedSamples'), clipped)):
        if said != found:
            ok = False
            problems.append(f'✗ {key}: meta.json says {said}, the file has {found}')
    said_peak = cap.get('peakDbfs')
    if said_peak is None or (abs(said_peak - peak_db) > 0.01 and not (said_peak <= -150 and peak_db <= -150)):
        ok = False
        problems.append(f'✗ peak: meta.json says {said_peak} dBFS, the file has {peak_db:.2f}')
    duration = meta.get('durationSec')
    if duration is None or abs(duration - samples / 48000) > 1 / 48000:
        ok = False
        problems.append(f'✗ durationSec: meta.json says {duration}, the file lasts {samples / 48000:.6f} s')
    dropped = cap.get('droppedSamples', 0) or 0
    if dropped:
        gaps = cap.get('gaps') or []
        where = ', '.join(f"{g['position'] / 48000:.2f} s" for g in gaps[:5])
        problems.append(f'  ! {dropped} samples were dropped, at {len(gaps)} place(s): {where}')
    if cap.get('stopReason'):
        problems.append(f"  ! stopped early: {cap['stopReason']}")
    return ok, lines + problems


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='command', required=True)
    r = sub.add_parser('report', help='score runs against their takes')
    r.add_argument('takes')
    r.add_argument('runs')
    r.add_argument('--out')
    r.add_argument('--boot', type=int, default=1000)
    r.add_argument('--seed', type=int, default=1)
    c = sub.add_parser('compare', help='fail when a gate metric is worse than the baseline allows')
    c.add_argument('baseline')
    c.add_argument('report')
    c.add_argument('--per-take', action='store_true', help='fail when any take is worse (golden takes)')
    i = sub.add_parser('inspect', help="check takes from the phone against their meta.json")
    i.add_argument('takes', nargs='+')
    args = p.parse_args(argv)

    if args.command == 'inspect':
        all_ok = True
        for folder in args.takes:
            ok, lines = inspect_take(folder)
            all_ok = all_ok and ok
            print('\n'.join(lines))
        return 0 if all_ok else 1

    if args.command == 'report':
        rep = report(args.takes, args.runs, boot=args.boot, seed=args.seed)
        if args.out:
            with open(args.out, 'w', encoding='utf-8') as f:
                json.dump(rep, f, indent=2, sort_keys=True)
                f.write('\n')
        print(summary(rep))
        return 0
    baseline, current = _read_json(args.baseline), _read_json(args.report)
    if args.per_take:
        problems, better = compare_takes(baseline, current)
        for pr in problems:
            print(f"✗ {pr['take']}: {pr['metric']} {pr['baseline']} → {pr['now']}")
        if better:
            print('Better than the baseline: ' + ', '.join(b['take'] for b in better) + ' (record a new baseline report)')
        if problems:
            return 1
        print('✓ no golden take got worse')
        return 0
    problems = compare(baseline, current)
    if not problems:
        print('✓ every gate metric is within the baseline\'s 95% interval')
        return 0
    for pr in problems:
        print(f"✗ {pr['metric']}: {pr['now']} against the baseline's {pr['baseline']} (allowed: {pr['bound']})")
    return 1


if __name__ == '__main__':
    sys.exit(main())
