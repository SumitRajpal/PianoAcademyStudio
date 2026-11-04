"""
How long each key takes to sound after the clock fit says it was sent
(master 5.3: "The keyboard's MIDI-in-to-sound delay is measured once the
same way and subtracted"). The delay take plays every key alone at three
velocities; each note's onset is measured the same way as everywhere else.
Delays are relative to the sync notes, whose own delay the clock fit
already holds, in ms.

For takes you play, `played` is the same for your strikes of one key: from
when the Mac received the key's MIDI to when it sounded.
"""

import json
import os
import statistics
from datetime import datetime, timezone

from align import onset_near

DELAYS_VERSION = 1


def _notes(messages, source):
    """(time, key, velocity) of every non-sync note_on from one source."""
    return [(m['t'], m['midi'], m['velocity']) for m in messages
            if m['type'] == 'note_on' and m.get('source') == source and not m.get('sync')]


def measure(audio, messages, fit):
    """
    Each key's delay at each velocity the delay take played, in ms:
    {key: {velocity: ms}}, with the notes whose onset couldn't be found listed.
    """
    table, missing = {}, []
    for t, key, velocity in _notes(messages, 'mac'):
        expected = fit['a'] * t + fit['b']
        onset = onset_near(audio, expected, before=0.02, after=0.08)
        if onset is None:
            missing.append({'midi': key, 'velocity': velocity, 't': round(t, 4)})
            continue
        table.setdefault(key, {})[velocity] = round((onset - expected) * 1000, 4)
    return table, missing


def measure_played(audio, messages, fit):
    """The median delay of your own strikes, in ms, and how many were measured."""
    found = []
    for t, key, _ in _notes(messages, 'keyboard'):
        expected = fit['a'] * t + fit['b']
        onset = onset_near(audio, expected, before=0.06, after=0.08)
        if onset is not None:
            found.append((onset - expected) * 1000)
    if not found:
        return None, 0
    return round(statistics.median(found), 4), len(found)


def _read(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def _write(path, data):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
        f.write('\n')


def _now():
    return datetime.now(timezone.utc).isoformat()


def save(path, table, *, take=''):
    """Writes the delay take's table, keeping your playing's delay if one is saved there."""
    data = _read(path)
    data.update({
        'version': DELAYS_VERSION,
        'instrument': 'psr-e343',
        'take': take,
        'measuredAt': _now(),
        'keys': {str(k): {str(v): ms for v, ms in sorted(vs.items())} for k, vs in sorted(table.items())},
    })
    _write(path, data)


def save_played(path, played, *, take=''):
    """Adds your playing's delay beside the table, keeping the table."""
    data = _read(path)
    data.update({'played': played, 'playedTake': take, 'playedMeasuredAt': _now()})
    _write(path, data)


def load(path):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    table = {int(k): {int(v): ms for v, ms in vs.items()} for k, vs in data.get('keys', {}).items()}
    return table, data.get('played')


def delay_ms(table, key, velocity):
    """A key's delay at a velocity: interpolated between the velocities measured, held beyond them; 0 if unmeasured."""
    by_velocity = table.get(key)
    if not by_velocity:
        return 0.0
    points = sorted(by_velocity.items())
    if velocity <= points[0][0]:
        return points[0][1]
    if velocity >= points[-1][0]:
        return points[-1][1]
    for (v0, d0), (v1, d1) in zip(points, points[1:]):
        if v0 <= velocity <= v1:
            return d0 + (d1 - d0) * (velocity - v0) / (v1 - v0)
    return points[-1][1]
