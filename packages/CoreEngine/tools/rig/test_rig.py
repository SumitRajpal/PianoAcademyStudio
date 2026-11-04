"""The rig's tests: the scripts and the log, played into a synthetic keyboard heard by a synthetic phone."""

import io
import os
import tempfile
import unittest
from contextlib import redirect_stdout

import numpy as np

import play
import scripts

RATE = 48000


# ---- a synthetic keyboard and phone --------------------------------------------------

def tone(key, velocity, length, start, n_total):
    """One note: 8 slightly stretched partials, a 2 ms attack, decay, a 50 ms release; starts at `start` seconds."""
    f0 = 440.0 * 2 ** ((key - 69) / 12)
    i0 = max(0, int(np.floor(start * RATE)))
    i1 = min(n_total, int((start + length + 0.3) * RATE) + 1)
    t = np.arange(i0, i1) / RATE - start
    s = np.zeros_like(t)
    for h in range(1, 9):
        if f0 * h < 18000:
            s += np.sin(2 * np.pi * f0 * h * np.sqrt(1 + 1e-4 * h * h) * t) / h
    attack = np.clip(t / 0.002, 0.0, 1.0)
    decay = np.exp(-np.maximum(t, 0) / (0.4 + 60.0 / key))
    release = np.where(t < length, 1.0, np.exp(-(t - length) / 0.05))
    return i0, (velocity / 127) ** 1.5 * 0.25 * attack * decay * release * s


def render(notes, seconds, *, noise_db=-70.0, seed=1):
    """notes: (audio onset s, key, velocity, length s)."""
    n = int(seconds * RATE)
    rng = np.random.default_rng(seed)
    x = rng.normal(0, 10 ** (noise_db / 20), n)
    for onset, key, velocity, length in notes:
        i0, s = tone(key, velocity, length, onset, n)
        x[i0 : i0 + len(s)] += s
    return x


def true_delay_ms(key, velocity):
    """The synthetic keyboard: higher keys and softer strikes sound a little later."""
    return 3.0 + 0.03 * (key - 36) + (0.5 if velocity < 50 else 0.0)


A, B = 1 + 80e-6, 3.217  # the phone's clock against the Mac's: 80 ppm fast, recording started 3.217 s earlier


def perform(script, *, jitter_us=50, seed=2, shift_sync=None, a=A, extra=()):
    """
    Plays a script into a fake port with a fake clock; returns the log's messages and the audio the phone heard.
    `a` is the phone's clock rate against the Mac's; `extra` adds sounds the log doesn't know about.
    """
    rng = np.random.default_rng(seed)
    sent = []

    class Clock:
        now = 1_000_000_000

        def __call__(self):
            return self.now

        def wait_until(self, ns):
            self.now = max(self.now, ns) + int(rng.uniform(0, jitter_us) * 1000)

    clock = Clock()

    class Port:
        def send(self, msg):
            sent.append((clock(), msg))

    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, 'take.midi.jsonl')
        play.play(script, Port(), path, clock=clock, wait_until=clock.wait_until, say=lambda *_: None)
        _, messages = play.read_log(path)

    notes, ons = [], {}
    sync_index = 0
    for m in messages:
        if m['type'] == 'note_on':
            ons[m['midi']] = m
        elif m['type'] == 'note_off' and m['midi'] in ons:
            on = ons.pop(m['midi'])
            onset = a * on['t'] + B + true_delay_ms(on['midi'], on['velocity']) / 1000
            if on.get('sync'):
                if shift_sync is not None and sync_index == shift_sync:
                    onset += 0.005  # a sync note 5 ms late: about 3.3 ms off a three-point line
                sync_index += 1
            notes.append((onset, on['midi'], on['velocity'], m['t'] - on['t']))
    audio = render(notes + list(extra), a * script.duration + B + 1.0)
    return messages, audio, notes


# ---- the scripts ---------------------------------------------------------------------

def pedal_down_at(pedals, t):
    """Whether a script's pedal is down at time t."""
    down = False
    for p in sorted(pedals, key=lambda p: p.t):
        if p.t > t:
            break
        down = p.down
    return down


class Scripts(unittest.TestCase):
    def test_every_take_fits_the_keyboard_and_frames_its_sync_notes(self):
        for name in scripts.TAKES:
            s = scripts.build(name)
            with self.subTest(take=name):
                self.assertTrue(all(scripts.LOWEST <= n.midi <= scripts.HIGHEST for n in s.notes))
                self.assertTrue(all(1 <= n.velocity <= 127 and n.on < n.off for n in s.notes))
                syncs = [n for n in s.notes if n.sync]
                self.assertGreaterEqual(len(syncs), 3)
                self.assertAlmostEqual(syncs[0].on, scripts.LEAD_IN)
                self.assertTrue(all(n.midi == 96 and n.velocity == 127 for n in syncs))
                others = [n for n in s.notes if not n.sync]
                for sync in syncs:
                    clear = all(n.off <= sync.on - 2.0 + 1e-9 or n.on >= sync.off + 2.0 - 1e-9 for n in others)
                    self.assertTrue(clear, f'a note sounds within 2 s of the sync note at {sync.on:.2f} s')
                    self.assertFalse(pedal_down_at(s.pedals, sync.on))
                self.assertLessEqual(max(n.off for n in s.notes), s.duration)

    def test_the_takes_play_what_master_5_2_asks(self):
        ladder = [n for n in scripts.build('ladder').notes if not n.sync]
        self.assertEqual(len(ladder), 6 * 5 * 3)
        self.assertEqual(sorted({n.velocity for n in ladder}), [16, 40, 72, 96, 120])
        self.assertEqual(sorted({n.midi for n in ladder}), [36, 55, 60, 81, 88, 96])

        sweep = [n.velocity for n in scripts.build('velocity-sweep').notes if not n.sync]
        self.assertEqual((len(sweep), sweep[0], sweep[-1]), (20, 1, 127))
        self.assertEqual(sweep, sorted(sweep))

        scales = scripts.build('scales')
        self.assertEqual(len([n for n in scales.notes if not n.sync]), 3 * 3 * 29)
        self.assertTrue(scales.pedals)

        dyads = [n for n in scripts.build('harmonic-intervals').notes if not n.sync]
        self.assertEqual(len(dyads), 2 * 3 * 2 * 3 * 2)

        every_key = scripts.build('delays').notes
        for velocity in (40, 72, 120):
            keys = sorted(n.midi for n in every_key if not n.sync and n.velocity == velocity)
            self.assertEqual(keys, list(range(36, 97)))

        self.assertEqual([n for n in scripts.build('noise').notes if not n.sync], [])
        self.assertEqual(scripts.build('free-playing').mode, 'record')

    def test_soft_under_loud_holds_the_pedal_in_its_second_half(self):
        s = scripts.build('soft-under-loud')
        loud = [n for n in s.notes if n.midi == 48 and not n.sync]
        self.assertEqual(len(loud), 2)
        self.assertFalse(pedal_down_at(s.pedals, loud[0].on))
        self.assertTrue(pedal_down_at(s.pedals, loud[1].on + 0.01))

    def test_scripts_are_the_same_every_time(self):
        self.assertEqual(scripts.build('scales'), scripts.build('scales'))


# ---- playing and the log -------------------------------------------------------------

class Playing(unittest.TestCase):
    def test_releases_go_before_strikes_at_the_same_instant(self):
        s = scripts.assemble('t', 't', [scripts.Segment([scripts.Note(60, 0, 1, 72), scripts.Note(60, 1, 2, 72)], 3)])
        kinds = [(round(t, 3), m[0]) for t, m, _ in play.messages(s) if m[1] == 60]
        self.assertLess(kinds.index((round(kinds[1][0], 3), 'note_off')), kinds.index((round(kinds[1][0], 3), 'note_on')))

    def test_every_message_is_sent_on_time_and_logged(self):
        s = scripts.build('trills')
        messages, _, _ = perform(s, jitter_us=0)
        planned = play.messages(s)
        self.assertEqual(len(messages), len(planned))
        for (t, msg, sync), m in zip(planned, messages):
            self.assertAlmostEqual(m['t'], t, places=6)
            self.assertEqual(m['type'], msg[0])
            self.assertEqual(bool(m.get('sync')), sync)

    def test_the_log_has_a_header_and_reads_back(self):
        s = scripts.build('glissando')
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'g.jsonl')
            out = io.StringIO()
            with redirect_stdout(out):
                n = play.play(s, type('P', (), {'send': lambda self, m: None})(), path,
                              clock=lambda: 0, wait_until=lambda ns: None, port_name='PSR')
            header, messages = play.read_log(path)
        self.assertEqual(header['take'], 'glissando')
        self.assertEqual(header['port'], 'PSR')
        self.assertEqual(n, len(messages))
        self.assertIn('glissando up', out.getvalue())

    def test_record_mode_logs_what_the_keyboard_sends(self):
        s = scripts.build('delays-played')
        recorder = play.Recorder(lambda: 2_000_000_000)
        recorder(('note_on', 60, 100))
        recorder(('note_off', 60, 0))
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'r.jsonl')
            play.play(s, type('P', (), {'send': lambda self, m: None})(), path, clock=lambda: 1_000_000_000,
                      wait_until=lambda ns: None, say=lambda *_: None, recorder=recorder)
            _, messages = play.read_log(path)
        played = [m for m in messages if m['source'] == 'keyboard']
        self.assertEqual([(m['type'], m['midi']) for m in played], [('note_on', 60), ('note_off', 60)])
        self.assertAlmostEqual(played[0]['t'], 1.0)


class RealPort(unittest.TestCase):
    """The tuples become the MIDI messages a keyboard expects (needs mido; no device)."""

    def test_messages_reach_the_keyboard_as_midi(self):
        try:
            import mido
        except ImportError:
            self.skipTest('mido is not installed')
        got = []

        class Fake:
            def send(self, m):
                got.append(m)

            def close(self):
                got.append('closed')

        original = mido.open_output
        mido.open_output = lambda name: Fake()
        try:
            port = play.MidoPort('PSR-E343')
            port.send(('note_on', 60, 72))
            port.send(('note_off', 60, 0))
            port.send(('pedal', 64, 127))
            port.close()
        finally:
            mido.open_output = original
        self.assertEqual(got[0], mido.Message('note_on', note=60, velocity=72, channel=0))
        self.assertEqual(got[1], mido.Message('note_off', note=60, velocity=0, channel=0))
        self.assertEqual(got[2], mido.Message('control_change', control=64, value=127))
        # Closing lifts the pedal and silences every key, so nothing hangs after a stop.
        self.assertEqual(got[3:5], [mido.Message('control_change', control=64, value=0),
                                    mido.Message('control_change', control=123, value=0)])
        self.assertEqual(got[-1], 'closed')

    def test_the_port_is_found_by_part_of_its_name(self):
        self.assertEqual(play.find_port(['IAC Bus 1', 'Digital Keyboard'], 'digital'), 'Digital Keyboard')
        self.assertEqual(play.find_port(['Digital Keyboard'], ''), 'Digital Keyboard')
        with self.assertRaises(SystemExit):
            play.find_port(['A', 'B'], '')


if __name__ == '__main__':
    unittest.main()
