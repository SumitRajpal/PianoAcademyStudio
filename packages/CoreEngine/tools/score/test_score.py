"""Tests for the harness scorer. Run: python3 -m unittest discover -s packages/CoreEngine/tools/score"""

import json
import os
import tempfile
import unittest

import score


def take(notes, duration=10.0, **meta):
    """A take in memory: labelled notes as (midi, onset, offset[, velocity])."""
    return {
        'id': meta.pop('id', 't'),
        'notes': [
            {'midi': n[0], 'onset': n[1], 'offset': n[2], **({'velocity': n[3]} if len(n) > 3 else {})}
            for n in notes
        ],
        'meta': {'durationSec': duration, **meta},
    }


def run(events, rejections=(), duration=10.0):
    """A run in memory: events as (type, midi, t[, velocity])."""
    return {
        'events': [
            {'type': e[0], 'midi': e[1], 't': e[2], **({'velocity': e[3]} if len(e) > 3 else {})} for e in events
        ],
        'rejections': [{'t': r[0], 'midi': r[1], 'gate': r[2], 'measured': r[3], 'threshold': r[4]} for r in rejections],
        'durationSec': duration,
    }


class NotesFromEvents(unittest.TestCase):
    def test_pairs_note_on_and_off_per_key(self):
        notes = score.notes_from_events(run([('on', 60, 1.0), ('on', 64, 1.1), ('off', 60, 1.5), ('off', 64, 2.0)]))
        self.assertEqual(notes, [(60, 1.0, 1.5, None), (64, 1.1, 2.0, None)])

    def test_a_restrike_ends_the_previous_note(self):
        notes = score.notes_from_events(run([('on', 60, 1.0), ('on', 60, 1.4), ('off', 60, 1.9)]))
        self.assertEqual(notes, [(60, 1.0, 1.4, None), (60, 1.4, 1.9, None)])

    def test_a_note_still_sounding_ends_with_the_take(self):
        notes = score.notes_from_events(run([('on', 72, 9.0, 0.5)], duration=10.0))
        self.assertEqual(notes, [(72, 9.0, 10.0, 0.5)])


class Matching(unittest.TestCase):
    def test_onset_tolerance_decides_a_match(self):
        t = take([(60, 1.0, 1.5)])
        r = run([('on', 60, 1.030), ('off', 60, 1.5)])
        counts = score.take_counts(t, r)
        self.assertEqual(counts['matched']['50'], 1)
        self.assertEqual(counts['matched']['20'], 0)
        self.assertEqual(counts['matched']['30'], 1)

    def test_the_key_must_be_the_same(self):
        counts = score.take_counts(take([(60, 1.0, 1.5)]), run([('on', 62, 1.0), ('off', 62, 1.5)]))
        self.assertEqual(counts['matched']['50'], 0)
        self.assertEqual(counts['nEst'], 1)

    def test_pooled_f1_detection_rate_and_false_notes(self):
        # 4 played notes; 3 detected on time, 1 extra note; half an hour of audio.
        t = take([(60, 1, 1.4), (62, 2, 2.4), (64, 3, 3.4), (65, 4, 4.4)], duration=1800.0)
        r = run(
            [('on', 60, 1.01), ('off', 60, 1.4), ('on', 62, 2.01), ('off', 62, 2.4), ('on', 64, 3.02),
             ('off', 64, 3.4), ('on', 71, 5.0), ('off', 71, 5.5)],
            duration=1800.0,
        )
        m = score.pooled_metrics([score.take_counts(t, r)])
        self.assertAlmostEqual(m['recall']['50'], 0.75)
        self.assertAlmostEqual(m['precision']['50'], 0.75)
        self.assertAlmostEqual(m['f1']['50'], 0.75)
        self.assertAlmostEqual(m['detectionRate'], 0.75)
        self.assertAlmostEqual(m['falseNotesPerHour'], 2.0)

    def test_timestamp_error_and_decision_latency(self):
        t = take([(60, 1.0, 1.4), (62, 2.0, 2.4)])
        r = run([('on', 60, 1.010), ('off', 60, 1.4), ('on', 62, 2.030), ('off', 62, 2.4)])
        m = score.pooled_metrics([score.take_counts(t, r)])
        self.assertAlmostEqual(m['timestampError']['biasMs'], 20.0, places=6)
        self.assertAlmostEqual(m['decisionLatencyMs']['p50'], 20.0, places=6)

    def test_late_notes_are_heard_but_not_on_time(self):
        counts = score.take_counts(take([(40, 1.0, 2.0)]), run([('on', 40, 1.120), ('off', 40, 2.0)]))
        self.assertEqual(counts['matched']['50'], 0)
        self.assertEqual(counts['heard'], 1)

    def test_a_late_note_is_not_a_false_note(self):
        # Section 1's false-note gate counts ghosts; lateness shows in the detection rate.
        m = score.pooled_metrics([score.take_counts(take([(40, 1.0, 2.0)]), run([('on', 40, 1.120), ('off', 40, 2.0)]))])
        self.assertEqual(m['falseNotesPerHour'], 0.0)
        self.assertEqual(m['detectionRate'], 0.0)


class Release(unittest.TestCase):
    def test_release_within_50_ms_or_a_fifth_of_the_note(self):
        t = take([(60, 1.0, 1.2), (62, 2.0, 4.0)])
        # Short note: 50 ms tolerance. Long note: 20% of 2 s = 400 ms tolerance.
        r = run([('on', 60, 1.0), ('off', 60, 1.26), ('on', 62, 2.0), ('off', 62, 4.35)])
        m = score.pooled_metrics([score.take_counts(t, r)])
        self.assertAlmostEqual(m['releaseAccuracy'], 0.5)

    def test_unobservable_releases_are_not_graded(self):
        t = take([(60, 1.0, 1.2)])
        t['notes'][0]['releaseObservable'] = False
        m = score.pooled_metrics([score.take_counts(t, run([('on', 60, 1.0), ('off', 60, 3.0)]))])
        self.assertIsNone(m['releaseAccuracy'])


class MissCauses(unittest.TestCase):
    def test_each_missed_note_gets_its_last_rejection_or_a_reason(self):
        t = take([(60, 1.0, 1.5), (64, 2.0, 2.5), (67, 3.0, 3.5)])
        r = run(
            [('on', 64, 2.12), ('off', 64, 2.5)],
            rejections=[(1.01, 60, 'threshold', 9.0, 16.1), (1.02, 60, 'pure-tone', 3.0, 6.0), (2.5, 67, 'pure-tone', 1, 6)],
        )
        causes = score.take_counts(t, r)['missCauses']
        self.assertEqual(causes, {'pure-tone': 1, 'late': 1, 'no candidate': 1})

    def test_a_strike_near_miss_explains_only_its_own_onset(self):
        t = take([(60, 1.0, 1.5), (62, 2.0, 2.5)])
        # A near-miss strike at C4's onset; one 200 ms after D4's onset is a later sound's.
        r = run([], rejections=[(1.005, -1, 'onset', 0.8, 1.0), (2.2, -1, 'onset', 0.8, 1.0)])
        self.assertEqual(score.take_counts(t, r)['missCauses'], {'onset': 1, 'no candidate': 1})


class Report(unittest.TestCase):
    def test_bootstrap_is_reproducible_and_brackets_the_value(self):
        counts = []
        for i in range(6):
            t = take([(60, 1, 1.5), (62, 2, 2.5)], id=f't{i}')
            events = [('on', 60, 1.01), ('off', 60, 1.5)] + ([('on', 62, 2.01), ('off', 62, 2.5)] if i % 2 else [])
            counts.append(score.take_counts(t, run(events)))
        a = score.with_intervals(counts, boot=500, seed=7)
        b = score.with_intervals(counts, boot=500, seed=7)
        self.assertEqual(a, b)
        lo, hi = a['detectionRate']['ci']
        self.assertLessEqual(lo, a['detectionRate']['value'])
        self.assertGreaterEqual(hi, a['detectionRate']['value'])
        self.assertAlmostEqual(a['detectionRate']['value'], 0.75)

    def test_cells_split_by_register_and_take_conditions(self):
        t1 = take([(36, 1, 1.5), (60, 2, 2.5), (84, 3, 3.5)], id='a', background='quiet')
        r1 = run([('on', 60, 2.01), ('off', 60, 2.5), ('on', 84, 3.01), ('off', 84, 3.5)])
        t2 = take([(60, 1, 1.5)], id='b', background='tv')
        r2 = run([('on', 60, 1.01), ('off', 60, 1.5)])
        cells = score.cell_metrics([score.take_counts(t1, r1), score.take_counts(t2, r2)])
        self.assertAlmostEqual(cells['register']['bass']['detectionRate'], 0.0)
        self.assertAlmostEqual(cells['register']['middle']['detectionRate'], 1.0)
        self.assertAlmostEqual(cells['background']['quiet']['detectionRate'], 2 / 3)
        self.assertAlmostEqual(cells['background']['tv']['detectionRate'], 1.0)

    def test_compare_fails_only_beyond_the_baselines_interval(self):
        base = {'overall': {
            'f1@50': {'value': 0.9, 'ci': [0.85, 0.95]},
            'detectionRate': {'value': 0.9, 'ci': [0.85, 0.95]},
            'falseNotesPerHour': {'value': 4.0, 'ci': [2.0, 6.0]},
            'releaseAccuracy': {'value': None, 'ci': None},
        }}
        same = json.loads(json.dumps(base))
        same['overall']['detectionRate']['value'] = 0.86
        self.assertEqual(score.compare(base, same), [])
        worse = json.loads(json.dumps(base))
        worse['overall']['falseNotesPerHour']['value'] = 7.0
        self.assertEqual([p['metric'] for p in score.compare(base, worse)], ['falseNotesPerHour'])


class PerTakeCompare(unittest.TestCase):
    BASE = {'perTake': [
        {'id': 'a', 'notes': 6, 'detected': 6, 'onTime': 5, 'heard': 6},
        {'id': 'b', 'notes': 4, 'detected': 4, 'onTime': 4, 'heard': 4},
    ]}

    def with_take(self, **changes):
        rep = json.loads(json.dumps(self.BASE))
        rep['perTake'][0].update(changes)
        return rep

    def test_the_same_or_better_passes(self):
        self.assertEqual(score.compare_takes(self.BASE, self.BASE), ([], []))
        problems, better = score.compare_takes(self.BASE, self.with_take(onTime=6))
        self.assertEqual(problems, [])
        self.assertEqual([b['take'] for b in better], ['a'])

    def test_fewer_on_time_or_heard_notes_fail(self):
        problems, _ = score.compare_takes(self.BASE, self.with_take(onTime=4))
        self.assertEqual([(p['take'], p['metric']) for p in problems], [('a', 'onTime')])
        problems, _ = score.compare_takes(self.BASE, self.with_take(heard=5, onTime=5, detected=5))
        self.assertEqual([(p['take'], p['metric']) for p in problems], [('a', 'heard')])

    def test_more_ghost_notes_fail(self):
        problems, _ = score.compare_takes(self.BASE, self.with_take(detected=8))
        self.assertEqual([(p['take'], p['metric']) for p in problems], [('a', 'ghosts')])

    def test_a_missing_take_fails(self):
        rep = json.loads(json.dumps(self.BASE))
        rep['perTake'] = rep['perTake'][:1]
        problems, _ = score.compare_takes(self.BASE, rep)
        self.assertEqual([(p['take'], p['metric']) for p in problems], [('b', 'missing')])


class Files(unittest.TestCase):
    def test_reads_takes_and_runs_from_folders(self):
        with tempfile.TemporaryDirectory() as d:
            tdir = os.path.join(d, 'takes', 'scale')
            rdir = os.path.join(d, 'runs', 'scale')
            os.makedirs(tdir)
            os.makedirs(rdir)
            with open(os.path.join(tdir, 'labels.json'), 'w') as f:
                json.dump({'version': 1, 'notes': [{'midi': 60, 'onset': 1.0, 'offset': 1.5}]}, f)
            with open(os.path.join(tdir, 'meta.json'), 'w') as f:
                json.dump({'durationSec': 3.0, 'instrument': 'synth'}, f)
            with open(os.path.join(rdir, 'events.jsonl'), 'w') as f:
                f.write(json.dumps({'type': 'on', 'midi': 60, 't': 1.01}) + '\n')
                f.write(json.dumps({'type': 'off', 'midi': 60, 't': 1.5}) + '\n')
            with open(os.path.join(rdir, 'run.json'), 'w') as f:
                json.dump({'durationSec': 3.0, 'engine': 'test'}, f)
            report = score.report(os.path.join(d, 'takes'), os.path.join(d, 'runs'), boot=100, seed=1)
            self.assertEqual(report['takes'], 1)
            self.assertAlmostEqual(report['overall']['detectionRate']['value'], 1.0)


if __name__ == '__main__':
    unittest.main()
