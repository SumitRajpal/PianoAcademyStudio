"""
Plays a take's script to the keyboard and logs every MIDI message as it
leaves, with the Mac's monotonic clock. In record mode it also logs what your
playing sends back. The log is JSON lines: a header, then one line per message.

The clock and the wait are passed in, so tests run without a keyboard or real
time. A message is a tuple: ('note_on' | 'note_off', key, velocity) or
('pedal', 64, value).
"""

import json
import time
from datetime import datetime, timezone

from scripts import SCRIPT_VERSION

LOG_VERSION = 1


def messages(script):
    """(seconds, message, is_sync) for every note and pedal change, in sending order."""
    out = []
    for n in script.notes:
        out.append((n.on, 2, ('note_on', n.midi, n.velocity), n.sync))
        out.append((n.off, 0, ('note_off', n.midi, 0), n.sync))
    for p in script.pedals:
        out.append((p.t, 1, ('pedal', 64, 127 if p.down else 0), False))
    # At the same instant: key releases first, then the pedal, then new keys.
    out.sort(key=lambda m: (m[0], m[1]))
    return [(t, msg, sync) for t, _, msg, sync in out]


def real_clock():
    return time.perf_counter_ns()


def real_wait_until(ns):
    """Sleeps until 2 ms before, then spins, so a message leaves within a few microseconds of its time."""
    while True:
        left = ns - time.perf_counter_ns()
        if left <= 0:
            return
        if left > 2_000_000:
            time.sleep((left - 2_000_000) / 1e9)


def _line(t0, ns, msg, source, sync=False):
    kind, key, value = msg
    entry = {'t': (ns - t0) / 1e9, 'ns': ns, 'type': kind, 'source': source}
    if kind == 'pedal':
        entry['value'] = value
    else:
        entry['midi'] = key
        entry['velocity'] = value
    if sync:
        entry['sync'] = True
    return entry


class Recorder:
    """Collects what the keyboard sends while a take plays (record mode). Called from MIDI's own thread."""

    def __init__(self, clock):
        self.clock = clock
        self.received = []

    def __call__(self, msg):
        self.received.append((self.clock(), msg))


def play(script, port, log_path, *, clock=real_clock, wait_until=real_wait_until, say=print,
         ready=None, recorder=None, port_name=''):
    """
    Sends the script's messages on `port` (anything with send(message)) at
    their times, writing the log to `log_path`. `ready` blocks until you're
    set (Enter); `recorder` collects what the keyboard sends, in record mode.
    Returns the number of messages sent.
    """
    plan = messages(script)
    cues = list(script.cues)
    if ready:
        ready()
    t0 = clock()
    started = datetime.now(timezone.utc).isoformat()
    sent = []
    for t, msg, sync in plan:
        while cues and cues[0].t <= t:
            cue = cues.pop(0)
            wait_until(t0 + round(cue.t * 1e9))
            say(f'{cue.t:7.1f} s  {cue.text}')
        wait_until(t0 + round(t * 1e9))
        ns = clock()
        port.send(msg)
        sent.append(_line(t0, ns, msg, 'mac', sync))
    for cue in cues:
        wait_until(t0 + round(cue.t * 1e9))
        say(f'{cue.t:7.1f} s  {cue.text}')
    wait_until(t0 + round(script.duration * 1e9))
    # What the keyboard sent during the take; anything later is after the closing sync note.
    received = [_line(t0, ns, msg, 'keyboard') for ns, msg in list(recorder.received if recorder else [])]
    header = {
        'type': 'header',
        'version': LOG_VERSION,
        'take': script.take,
        'mode': script.mode,
        'scriptVersion': SCRIPT_VERSION,
        'startedAt': started,
        'clock': 'perf_counter_ns',
        'port': port_name,
        'durationSec': script.duration,
    }
    with open(log_path, 'w', encoding='utf-8') as f:
        f.write(json.dumps(header) + '\n')
        for entry in sorted(sent + received, key=lambda e: e['ns']):
            f.write(json.dumps(entry) + '\n')
    return len(sent)


def read_log(path):
    """The header and the messages, in time order."""
    with open(path, encoding='utf-8') as f:
        lines = [json.loads(line) for line in f if line.strip()]
    if not lines or lines[0].get('type') != 'header':
        raise ValueError(f'{path} is not a rig log')
    return lines[0], lines[1:]


# ---- the real keyboard (mido and python-rtmidi; only here, so tests need neither) ----

MISSING = ('The rig talks to the keyboard through mido and python-rtmidi: '
           'pip install -r packages/CoreEngine/tools/rig/requirements.txt')


def _mido():
    try:
        import mido
    except ImportError:
        raise SystemExit(MISSING) from None
    return mido


def list_ports():
    mido = _mido()
    try:
        return mido.get_output_names(), mido.get_input_names()
    except ImportError:  # mido is there but its rtmidi backend isn't
        raise SystemExit(MISSING) from None


def find_port(names, wanted):
    """The first port whose name contains `wanted` (case-insensitive); with one port, that one."""
    if wanted:
        for name in names:
            if wanted.lower() in name.lower():
                return name
        raise SystemExit(f'No MIDI port matching "{wanted}". Ports: {", ".join(names) or "none"}')
    if len(names) == 1:
        return names[0]
    raise SystemExit(f'Say which port with --port. Ports: {", ".join(names) or "none"}')


class MidoPort:
    """Sends the rig's message tuples to a real MIDI port, on channel 1."""

    def __init__(self, name):
        mido = _mido()
        self._mido = mido
        self.port = mido.open_output(name)

    def send(self, msg):
        kind, key, value = msg
        if kind == 'pedal':
            self.port.send(self._mido.Message('control_change', control=64, value=value))
        else:
            self.port.send(self._mido.Message(kind, note=key, velocity=value))

    def close(self):
        # Let go of every key and the pedal, so nothing hangs after a stop.
        self.port.send(self._mido.Message('control_change', control=64, value=0))
        self.port.send(self._mido.Message('control_change', control=123, value=0))
        self.port.close()


def open_recorder(name, clock=real_clock):
    """Listens to the keyboard's MIDI output; returns (recorder, port)."""
    mido = _mido()
    recorder = Recorder(clock)

    def on_message(m):
        if m.type in ('note_on', 'note_off'):
            # A note_on at velocity 0 is a key release.
            kind = 'note_off' if m.type == 'note_off' or m.velocity == 0 else 'note_on'
            recorder((kind, m.note, m.velocity if kind == 'note_on' else 0))
        elif m.type == 'control_change' and m.control == 64:
            recorder(('pedal', 64, m.value))

    port = mido.open_input(name, callback=on_message)
    return recorder, port
