#!/usr/bin/env python3
"""
The PSR-E343 self-play rig (Phase 0 slice 3; docs/harness.md).

  rig.py takes                            the takes the rig can play
  rig.py ports                            the MIDI ports this computer sees
  rig.py check [--port P]                 plays a short scale, to hear the keyboard answer
  rig.py play <take> [--port P]           plays a take while the phone records; logs what was sent
  rig.py record <take> [--port P]         for takes you play: logs what the keyboard sends, plays the sync notes
  rig.py label <take folder> <log>        writes the take's labels.json (and, for a delay take, the delays)

Logs go to $PIANO_CORPUS/rig-logs and the keyboard's delays to
$PIANO_CORPUS/instruments/psr-e343/delays.json (or --logs and --delays).
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import align  # noqa: E402
import delays as delays_mod  # noqa: E402
import label  # noqa: E402
import play  # noqa: E402
import scripts  # noqa: E402


def corpus():
    return os.environ.get('PIANO_CORPUS', '')


def default_logs():
    return os.path.join(corpus(), 'rig-logs') if corpus() else 'rig-logs'


def default_delays():
    return os.path.join(corpus(), 'instruments', 'psr-e343', 'delays.json') if corpus() else ''


def cmd_takes(_args):
    for name, (description, _, mode) in scripts.TAKES.items():
        s = scripts.build(name)
        print(f'{name:20s} {s.duration / 60:5.1f} min  {mode:6s}  {description}')
    return 0


def cmd_ports(_args):
    outputs, inputs = play.list_ports()
    print('Out (the rig plays here):', ', '.join(outputs) or 'none')
    print('In (your playing comes from here):', ', '.join(inputs) or 'none')
    return 0


def cmd_check(args):
    outputs, _ = play.list_ports()
    port = play.MidoPort(play.find_port(outputs, args.port))
    try:
        for i, key in enumerate((60, 62, 64, 65, 67, 69, 71, 72)):
            port.send(('note_on', key, scripts.MF))
            time.sleep(0.25)
            port.send(('note_off', key, 0))
            time.sleep(0.05 if i < 7 else 0)
    finally:
        port.close()
    print('Did the keyboard play a C major scale? If not: Grand Piano voice, volume up, the USB cable.')
    return 0


def _run(args, record):
    script = scripts.build(args.take)
    if record and script.mode != 'record':
        raise SystemExit(f'{args.take} is played by the Mac: use rig.py play {args.take}')
    if not record and script.mode == 'record':
        raise SystemExit(f'{args.take} is yours to play: use rig.py record {args.take}')
    outputs, inputs = play.list_ports()
    out_name = play.find_port(outputs, args.port)
    os.makedirs(args.logs, exist_ok=True)
    log_path = os.path.join(args.logs, f'{datetime.now():%Y-%m-%d_%H%M%S}_{args.take}.midi.jsonl')
    print(f'{script.description}: {script.duration / 60:.1f} minutes, {len(script.syncs)} sync notes.')
    print('On the phone: set the conditions, then tap Record.')
    port = play.MidoPort(out_name)
    recorder, in_port = (None, None)
    if record:
        recorder, in_port = play.open_recorder(play.find_port(inputs, args.port))
    try:
        sent = play.play(script, port, log_path, ready=lambda: input('Press Enter here to start. '),
                         recorder=recorder, port_name=out_name)
    finally:
        port.close()
        if in_port is not None:
            in_port.close()
    print(f'Done: {sent} messages sent. On the phone: tap Stop.')
    print(f'Log: {log_path}')
    print(f'Then copy the take into $PIANO_CORPUS and run: rig.py label <take folder> "{log_path}"')
    return 0


def _check_meta(folder, take):
    """Says when the phone's meta.json disagrees with what the rig played; the rig's log wins in labels.json."""
    try:
        with open(os.path.join(folder, 'meta.json'), encoding='utf-8') as f:
            meta = json.load(f)
    except (OSError, ValueError):
        return
    if meta.get('take') and meta['take'] != take:
        print(f'Note: the phone recorded this take as "{meta["take"]}"; the rig played "{take}", which labels.json follows.')
    if meta.get('instrument') and meta['instrument'] != 'PSR-E343':
        print(f'Note: the phone says the instrument was "{meta["instrument"]}", but the rig plays the PSR-E343.')


def cmd_label(args):
    header, messages = play.read_log(args.log)
    _check_meta(args.take_folder, header.get('take', ''))
    audio = align.read_audio(os.path.join(args.take_folder, 'audio.wav'))
    try:
        fit = align.align(audio, messages)
    except align.SyncError as e:
        print(f'✗ {e}')
        return 1
    take = header.get('take', '')
    print(f'{take}: drift {fit["driftPpm"]:+.1f} ppm, {fit["syncs"]} sync notes, '
          f'residuals {", ".join(f"{r:.3f}" for r in fit["residualsMs"])} ms')
    if not fit['ok']:
        print(f'✗ a sync note is {fit["maxResidualMs"]:.2f} ms off the line (over {align.MAX_RESIDUAL_MS:g} ms), '
              'so nothing was written. Was something loud near a sync note? Record the take again.')
        return 1

    delays_path = args.delays or default_delays()
    folder = os.path.basename(os.path.normpath(args.take_folder))
    if take in ('delays', 'delays-played') and not delays_path:
        raise SystemExit('Set PIANO_CORPUS or pass --delays: the delays are saved there')
    have_delays = bool(delays_path) and os.path.exists(delays_path)
    table, played = delays_mod.load(delays_path) if have_delays else ({}, None)

    if take == 'delays':
        table, missing = delays_mod.measure(audio, messages, fit)
        if missing:
            print(f'✗ no onset for {len(missing)} notes, such as {missing[:3]}: record the delay take again, quietly')
            return 1
        delays_mod.save(delays_path, table, take=folder)
        spread = [ms for vs in table.values() for ms in vs.values()]
        print(f'Delays saved: {delays_path} ({len(spread)} notes, '
              f'{min(spread):+.2f} to {max(spread):+.2f} ms from the sync note)')
    elif take == 'delays-played':
        if not have_delays:
            raise SystemExit("Label the delay take first: your playing's delay is saved beside its table")
        played, count = delays_mod.measure_played(audio, messages, fit)
        if played is None:
            print('✗ none of your strikes was found in the audio')
            return 1
        delays_mod.save_played(delays_path, played, take=folder)
        print(f'Your playing: {played:+.2f} ms from MIDI to sound ({count} strikes). Saved: {delays_path}')
    elif not have_delays and not args.no_delays:
        raise SystemExit('No delays yet: record and label the delay take first (or pass --no-delays)')

    labels = label.build(messages, fit, table, played_ms=played, take=take)
    out = os.path.join(args.take_folder, 'labels.json')
    label.save(out, labels)
    notes = [n for n in labels['notes'] if not n.get('sync')]
    print(f'labels.json: {len(notes)} notes and {fit["syncs"]} sync notes')
    print(f'✓ every sync note within {align.MAX_RESIDUAL_MS:g} ms of the clock fit')
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='command', required=True)
    sub.add_parser('takes')
    sub.add_parser('ports')
    c = sub.add_parser('check')
    c.add_argument('--port', default='', help='part of the keyboard port name (default: the only port)')
    for name in ('play', 'record'):
        r = sub.add_parser(name)
        r.add_argument('take', choices=list(scripts.TAKES))
        r.add_argument('--port', default='')
        r.add_argument('--logs', default=default_logs())
    lb = sub.add_parser('label')
    lb.add_argument('take_folder')
    lb.add_argument('log')
    lb.add_argument('--delays', default='')
    lb.add_argument('--no-delays', action='store_true', help='label without the keyboard delays (less exact)')
    args = p.parse_args(argv)
    if args.command == 'play':
        return _run(args, record=False)
    if args.command == 'record':
        return _run(args, record=True)
    return {'takes': cmd_takes, 'ports': cmd_ports, 'check': cmd_check, 'label': cmd_label}[args.command](args)


if __name__ == '__main__':
    sys.exit(main())
