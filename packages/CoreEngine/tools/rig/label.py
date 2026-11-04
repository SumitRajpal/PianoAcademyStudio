"""
A take's labels.json from its rig log: every note's key, onset, offset,
velocity, pedal state and whether its release can be heard, on the phone's
clock (the fit) with each key's measured delay added. Sync notes are labelled
too (they're real notes the engine hears), marked "sync".
"""

import json

from delays import delay_ms

LABELS_VERSION = 1

# A pedal lifted this soon after a key is let go still lets the key's release be
# heard, at about the key's time: the rig sends a release before a pedal change
# at the same instant, so the two arrive microseconds apart.
RELEASE_GRACE = 0.02


def _pedal_at(changes, t):
    down = False
    for when, value in changes:
        if when > t:
            break
        down = value >= 64
    return down


def _release_heard(changes, t):
    if not _pedal_at(changes, t):
        return True
    return any(t < when <= t + RELEASE_GRACE and value < 64 for when, value in changes)


def build(messages, fit, table, *, played_ms=None, take=''):
    """
    The labels for a take. Notes the Mac played use the delay table; notes you
    played (record mode) use your measured `played_ms` plus each key's
    difference from C4 in the table.
    """
    notes = []
    for source in ('mac', 'keyboard'):
        events = [m for m in messages if m.get('source') == source]
        pedal = [(m['t'], m['value']) for m in events if m['type'] == 'pedal']
        sounding = {}
        for m in events:
            if m['type'] == 'note_on':
                if m['midi'] in sounding:  # struck again while held
                    notes.append(_close(sounding.pop(m['midi']), m['t'], pedal))
                sounding[m['midi']] = (m, source)
            elif m['type'] == 'note_off' and m['midi'] in sounding:
                notes.append(_close(sounding.pop(m['midi']), m['t'], pedal))
        for start in sounding.values():
            notes.append(_close(start, start[0]['t'], pedal))

    out = []
    for on, off, key, velocity, source, sync, pedal_down, release_heard in notes:
        delay = delay_ms(table, key, velocity)
        if source == 'keyboard':
            delay = (played_ms or 0.0) + delay - delay_ms(table, 60, velocity)
        shift = delay / 1000
        note = {
            'midi': key,
            'onset': round(fit['a'] * on + fit['b'] + shift, 6),
            'offset': round(fit['a'] * off + fit['b'] + shift, 6),
            'velocity': velocity,
            'pedal': pedal_down,
            'releaseObservable': release_heard,
        }
        if sync:
            note['sync'] = True
        if source == 'keyboard':
            note['played'] = True
        out.append(note)
    out.sort(key=lambda n: (n['onset'], n['midi']))
    return {
        'version': LABELS_VERSION,
        'source': 'psr-rig',
        'take': take,
        'notes': out,
        'sync': {k: fit[k] for k in ('driftPpm', 'syncs', 'residualsMs', 'maxResidualMs', 'ok')} | {'offsetSec': fit['b']},
    }


def _close(start, off_t, pedal):
    m, source = start
    pedal_down = _pedal_at(pedal, m['t'])
    # With the pedal down at the key's release, its damper doesn't stop the sound.
    release_heard = _release_heard(pedal, off_t)
    return (m['t'], off_t, m['midi'], m['velocity'], source, bool(m.get('sync')), pedal_down, release_heard)


def save(path, labels):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(labels, f, indent=2)
        f.write('\n')
