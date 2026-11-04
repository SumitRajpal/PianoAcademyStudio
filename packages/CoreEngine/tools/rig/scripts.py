"""
The rig's take scripts: master 5.2's takes as the PSR-E343 plays them, each
one timed note by note and framed by sync notes.

A script is built from segments, each a short stretch of playing with its own
silence after it. assemble() lays them end to end and adds the sync notes: a
loud C7 at the start and the end, and a check sync note in a pause about once
a minute (at least one, near the middle), each with 2 s of silence around it.
Times are in seconds from the moment playback starts.
"""

from dataclasses import dataclass, field

LOWEST, HIGHEST = 36, 96  # the PSR-E343's 61 keys, C2 to C7
SYNC_KEY = 96  # C7: the loudest, highest key
SYNC_VELOCITY = 127
SYNC_LENGTH = 0.5  # seconds held
SYNC_SILENCE = 2.0  # seconds of silence on each side of a sync note
LEAD_IN = 0.5  # before the opening sync note
CHECK_EVERY = 60.0  # seconds between check sync notes, at most about this plus one segment

# Master 5.2's five levels, ppp to ff, as MIDI velocities.
LEVELS = {'ppp': 16, 'pp': 40, 'mf': 72, 'f': 96, 'ff': 120}
MF = LEVELS['mf']

SCRIPT_VERSION = 1


@dataclass(frozen=True)
class Note:
    midi: int
    on: float
    off: float
    velocity: int
    sync: bool = False


@dataclass(frozen=True)
class Pedal:
    t: float
    down: bool


@dataclass(frozen=True)
class Cue:
    t: float
    text: str


@dataclass
class Segment:
    """A stretch of playing. Times are from its start; `length` includes the silence after it."""

    notes: list
    length: float
    pedals: list = field(default_factory=list)
    cue: str = ''


@dataclass
class Script:
    take: str
    description: str
    mode: str  # 'play': the Mac plays every note; 'record': you play, the Mac records and plays the sync notes
    notes: list  # every note the Mac plays, sync notes included, by onset
    pedals: list
    cues: list
    duration: float

    @property
    def syncs(self):
        return [n.on for n in self.notes if n.sync]


def _sync(t):
    return Note(SYNC_KEY, t, t + SYNC_LENGTH, SYNC_VELOCITY, sync=True)


def assemble(take, description, segments, mode='play'):
    """Lays segments end to end with sync notes: at the start, about once a minute and near the middle, and at the end."""
    # Each sync note gets a cue at the start of its silence, so whoever is making sound pauses for it.
    notes, pedals, cues = [_sync(LEAD_IN)], [], [Cue(0.0, 'quiet: the opening sync note')]
    t = LEAD_IN + SYNC_LENGTH + SYNC_SILENCE
    last_sync = LEAD_IN
    content = sum(s.length for s in segments)
    middle_done = False
    for i, seg in enumerate(segments):
        due = t - last_sync >= CHECK_EVERY
        at_middle = not middle_done and i > 0 and (t - (LEAD_IN + SYNC_LENGTH + SYNC_SILENCE)) >= content / 2
        if due or at_middle:
            cues.append(Cue(t, 'quiet: a check sync note'))
            t += SYNC_SILENCE
            notes.append(_sync(t))
            last_sync = t
            t += SYNC_LENGTH + SYNC_SILENCE
            middle_done = middle_done or at_middle
        if seg.cue:
            cues.append(Cue(t, seg.cue))
        notes += [Note(n.midi, t + n.on, t + n.off, n.velocity) for n in seg.notes]
        pedals += [Pedal(t + p.t, p.down) for p in seg.pedals]
        t += seg.length
    cues.append(Cue(t, 'quiet: the closing sync note'))
    t += SYNC_SILENCE
    notes.append(_sync(t))
    t += SYNC_LENGTH + 1.0
    notes.sort(key=lambda n: (n.on, n.midi))
    pedals.sort(key=lambda p: p.t)
    cues.sort(key=lambda c: c.t)
    return Script(take, description, mode, notes, pedals, cues, t)


# ---- the takes ------------------------------------------------------------------

def _ladder():
    """C2, G3, C4, A5, E6 and C7 at 5 levels, ppp to ff, 3 strikes each, 2 s apart."""
    segments = []
    for key in (36, 55, 60, 81, 88, 96):
        notes, t = [], 0.0
        for velocity in LEVELS.values():
            for _ in range(3):
                notes.append(Note(key, t, t + 1.0, velocity))
                t += 2.0
        segments.append(Segment(notes, t + 1.0, cue=f'ladder on key {key}'))
    return segments


def _repetitions():
    """A bass, a middle and a treble key at 2, 4, 6 and 8 notes a second, 8 strikes each, mf."""
    segments = []
    for key in (43, 60, 84):
        notes, t = [], 0.0
        for rate in (2, 4, 6, 8):
            step = 1.0 / rate
            for _ in range(8):
                notes.append(Note(key, t, t + 0.8 * step, MF))
                t += step
            t += 1.5
        segments.append(Segment(notes, t + 1.0, cue=f'repetitions on key {key}'))
    return segments


def _soft_under_loud():
    """A loud C3 held; soft notes 1, 2, 4, 7, 12 and 19 semitones above; without, then with, the pedal."""
    segments = []
    for pedal in (False, True):
        notes = [Note(48, 0.0, 6.0, 110)]
        t = 1.0
        for up in (1, 2, 4, 7, 12, 19):
            notes.append(Note(48 + up, t, t + 0.5, 30))
            t += 0.8
        pedals = [Pedal(0.0, True), Pedal(6.0, False)] if pedal else []
        segments.append(Segment(notes, 8.0, pedals, cue='soft under loud' + (', pedal down' if pedal else '')))
    return segments


def _scale_keys():
    up = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84]
    return up + up[-2::-1]


def _scales():
    """Two octaves, C4 to C6 and back, in eighth notes at 60, 90 and 120 BPM: legato, staccato, pedalled."""
    segments = []
    keys = _scale_keys()
    for bpm in (60, 90, 120):
        step = 60.0 / bpm / 2
        for style in ('legato', 'staccato', 'pedalled'):
            notes, pedals = [], []
            for i, key in enumerate(keys):
                t = i * step
                length = {'legato': step + 0.02, 'staccato': 0.4 * step, 'pedalled': 0.9 * step}[style]
                notes.append(Note(key, t, t + length, MF))
                if style == 'pedalled' and i % 4 == 0:
                    # Syncopated pedalling: up as each group of four starts, down just after.
                    if i:
                        pedals.append(Pedal(t, False))
                    pedals.append(Pedal(t + 0.06, True))
            end = len(keys) * step
            if style == 'pedalled':
                pedals.append(Pedal(end + 0.2, False))
            segments.append(Segment(notes, end + 1.5, pedals, cue=f'scale, {style}, {bpm} BPM'))
    return segments


def _chords():
    """Triads in three registers, octaves, the E4+F4 cluster and 6-note two-hand chords: 3 times at mf, once at ff."""
    chords = [
        ('C3 triad', (48, 52, 55)),
        ('C4 triad', (60, 64, 67)),
        ('C5 triad', (72, 76, 79)),
        ('C2+C3 octave', (36, 48)),
        ('C3+C4 octave', (48, 60)),
        ('E4+F4 cluster', (64, 65)),
        ('two-hand chord', (48, 55, 60, 64, 67, 72)),
    ]
    segments = []
    for name, keys in chords:
        notes, t = [], 0.0
        for velocity in (MF, MF, MF, LEVELS['ff']):
            notes += [Note(k, t, t + 1.5, velocity) for k in keys]
            t += 2.5
        segments.append(Segment(notes, t + 0.5, cue=name))
    return segments


def _trills():
    """C4–D4 and C4–C♯4 at 8 and 12 notes a second, 3 s each."""
    segments = []
    for upper in (62, 61):
        notes, t = [], 0.0
        for rate in (8, 12):
            step = 1.0 / rate
            for i in range(round(3.0 * rate)):
                notes.append(Note(60 if i % 2 == 0 else upper, t, t + 0.9 * step, MF))
                t += step
            t += 1.5
        segments.append(Segment(notes, t + 1.0, cue=f'trill C4 and {upper}'))
    return segments


def _glissando():
    """White keys from C2 to C7 and back, 20 a second."""
    whites = [k for k in range(LOWEST, HIGHEST + 1) if k % 12 in (0, 2, 4, 5, 7, 9, 11)]
    segments = []
    for keys, name in ((whites, 'up'), (whites[::-1], 'down')):
        step = 1.0 / 20
        notes = [Note(k, i * step, i * step + 0.12, MF) for i, k in enumerate(keys)]
        segments.append(Segment(notes, len(keys) * step + 2.0, cue=f'glissando {name}'))
    return segments


# The chorus of Jingle Bells (J. Pierpont, 1857), in C: (key, beats).
_JINGLE = [
    (64, 1), (64, 1), (64, 2), (64, 1), (64, 1), (64, 2), (64, 1), (67, 1), (60, 1.5), (62, 0.5), (64, 4),
    (65, 1), (65, 1), (65, 1.5), (65, 0.5), (65, 1), (64, 1), (64, 1), (64, 0.5), (64, 0.5),
    (64, 1), (62, 1), (62, 1), (64, 1), (62, 2), (67, 2),
    (64, 1), (64, 1), (64, 2), (64, 1), (64, 1), (64, 2), (64, 1), (67, 1), (60, 1.5), (62, 0.5), (64, 4),
    (65, 1), (65, 1), (65, 1.5), (65, 0.5), (65, 1), (64, 1), (64, 1), (64, 0.5), (64, 0.5),
    (67, 1), (67, 1), (65, 1), (62, 1), (60, 4),
]


def _jingle_bells():
    """The chorus at 120 BPM, as in learning mode: the melody alone, no backing."""
    beat = 0.5
    halves = (_JINGLE[:26], _JINGLE[26:])
    segments = []
    for i, half in enumerate(halves):
        notes, t = [], 0.0
        for key, beats in half:
            notes.append(Note(key, t, t + 0.9 * beats * beat, MF))
            t += beats * beat
        segments.append(Segment(notes, t + 1.5, cue=f'Jingle Bells, part {i + 1}'))
    return segments


def _velocity_sweep():
    """C4, 20 strikes from the softest to the loudest velocity, in two halves."""
    velocities = [round(1 + i * 126 / 19) for i in range(20)]
    segments = []
    for half in (velocities[:10], velocities[10:]):
        notes = [Note(60, i * 1.5, i * 1.5 + 0.8, v) for i, v in enumerate(half)]
        segments.append(Segment(notes, len(half) * 1.5 + 0.5, cue='velocity sweep'))
    return segments


def _harmonic_intervals():
    """
    Octave, twelfth and double octave above C2 and C3, struck together and 30 ms
    apart, the upper note as loud, softer and much softer.
    """
    segments = []
    for low in (36, 48):
        notes, t = [], 0.0
        for interval in (12, 19, 24):
            for apart in (0.0, 0.03):
                for upper_velocity in (MF, 48, 28):
                    notes.append(Note(low, t, t + 2.0, MF))
                    notes.append(Note(low + interval, t + apart, t + 2.0, upper_velocity))
                    t += 3.0
        segments.append(Segment(notes, t + 0.5, cue=f'harmonic intervals above key {low}'))
    return segments


def _delays():
    """The delay take: every key, C2 to C7, at pp, mf and ff, one at a time, 2 s apart so each starts in quiet."""
    segments = []
    for velocity in (LEVELS['pp'], MF, LEVELS['ff']):
        for start in (LOWEST, LOWEST + 31):
            keys = range(start, min(start + 31, HIGHEST + 1))
            notes = [Note(k, i * 2.0, i * 2.0 + 0.5, velocity) for i, k in enumerate(keys)]
            segments.append(Segment(notes, len(notes) * 2.0, cue=f'every key at velocity {velocity}'))
    return segments


def _noise():
    """Take 1: 60 s of silence, then 60 s each of speech, TV or music, claps, whistling, coughing and knocks."""
    kinds = ['silence', 'speech near the phone', 'TV or music', 'hand claps', 'whistling', 'coughing', 'door knocks']
    return [Segment([], 60.0, cue=f'now: {kind} for 60 s') for kind in kinds]


def _free_playing():
    """Take 11: two minutes of your own improvisation, in two halves."""
    return [Segment([], 60.0, cue='play freely'), Segment([], 60.0, cue='keep playing')]


def _delays_played():
    """For takes you play: strike C4 firmly about once a second, 20 times."""
    return [Segment([], 12.0, cue='strike C4 firmly, about once a second'), Segment([], 12.0, cue='keep going')]


TAKES = {
    'ladder': ('Loudness ladder (5.2 take 2)', _ladder, 'play'),
    'repetitions': ('Repetitions (take 3)', _repetitions, 'play'),
    'soft-under-loud': ('Soft under loud (take 4)', _soft_under_loud, 'play'),
    'scales': ('Scales (take 5)', _scales, 'play'),
    'chords': ('Chords (take 6)', _chords, 'play'),
    'trills': ('Trills (take 7)', _trills, 'play'),
    'glissando': ('Glissando (take 8)', _glissando, 'play'),
    'jingle-bells': ('Jingle Bells chorus, learning mode (take 9)', _jingle_bells, 'play'),
    'velocity-sweep': ('Velocity sweep (take 10)', _velocity_sweep, 'play'),
    'harmonic-intervals': ('Harmonic intervals (take 12)', _harmonic_intervals, 'play'),
    'noise': ('Noise (take 1): the Mac plays only the sync notes', _noise, 'play'),
    'free-playing': ('Free playing (take 11): you play, the Mac records', _free_playing, 'record'),
    'delays': ('The delay take: each key, to measure how long it takes to sound', _delays, 'play'),
    'delays-played': ('The delay take for your own playing', _delays_played, 'record'),
}


def build(take):
    description, make, mode = TAKES[take]
    return assemble(take, description, make(), mode)
