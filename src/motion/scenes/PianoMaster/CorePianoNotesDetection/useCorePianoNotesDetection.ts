import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { noteName, parseNote, type NoteInput } from '../../../../shared/piano';
import { pressKey, releaseKey, type PianoState } from '../shared/pianoState';
import { useLiveKeys } from './liveKeys';
import { noteEventBus } from './noteEventBus';
import {
  clearPianoCalibration,
  getAudioStats,
  getPianoCalibrationProfile,
  savePianoCalibration,
  setAudioExpectedNotes,
  setAudioPolyphony,
  startAudioDetector,
  startPianoCalibration,
  stopAudioDetector,
  stopPianoCalibration,
} from './pianoEngine';
import {
  CALIBRATION_STATE,
  type CalibrationOptions,
  type CalibrationProgressEvent,
  type DetectedNoteEvent,
  type DetectionStats,
  type EngineStatus,
  type PianoProfile,
} from './types';

export type UseCorePianoNotesDetectionOptions = {
  pianoState?: PianoState;
  expected?: readonly NoteInput[];
  polyphony?: boolean;
  autoStart?: boolean;
  /** Poll the engine's timing stats this often (ms); 0 or unset: never. */
  statsIntervalMs?: number;
  onNoteDetected?: (event: DetectedNoteEvent) => void;
  onCalibrationComplete?: (profile: PianoProfile) => void;
};

function readProfile(): PianoProfile | null {
  try {
    return getPianoCalibrationProfile();
  } catch {
    return null;
  }
}

export function useCorePianoNotesDetection(
  options: UseCorePianoNotesDetectionOptions = {},
) {
  const {
    pianoState,
    expected,
    polyphony = false,
    autoStart = true,
    statsIntervalMs = 0,
    onNoteDetected,
    onCalibrationComplete,
  } = options;

  const [running, setRunning] = useState(autoStart);
  const [calibrating, setCalibrating] = useState(false);
  const [activeNotes, setActiveNotes] = useState<
    Map<number, DetectedNoteEvent>
  >(new Map());
  const [latestNote, setLatestNote] = useState<{
    midi: number;
    name: string;
    cents: number;
  } | null>(null);
  const [stats, setStats] = useState<DetectionStats>(() =>
    noteEventBus.getLatestStats(),
  );
  const [status, setStatus] = useState<EngineStatus>(() =>
    noteEventBus.getLatestStatus(),
  );
  const [calibrationEvent, setCalibrationEvent] =
    useState<CalibrationProgressEvent | null>(null);
  const [profile, setProfile] = useState<PianoProfile | null>(readProfile);

  const onNoteDetectedRef = useRef(onNoteDetected);
  onNoteDetectedRef.current = onNoteDetected;

  const onCalibrationCompleteRef = useRef(onCalibrationComplete);
  onCalibrationCompleteRef.current = onCalibrationComplete;

  const pianoStateRef = useRef(pianoState);
  pianoStateRef.current = pianoState;

  // With the native engine the UI thread lights the keys itself, straight
  // from the key table; only the mock (Jest) presses them from here.
  const liveKeys = useLiveKeys(pianoState);
  const liveKeysRef = useRef(liveKeys);
  liveKeysRef.current = liveKeys;

  // Resolve expected note names to MIDI numbers
  const expectedMidi = useMemo(() => {
    if (!expected || expected.length === 0) return [];
    return expected.map(n => parseNote(n));
  }, [expected]);

  // Sync expected notes to engine
  useEffect(() => {
    setAudioExpectedNotes(expectedMidi);
  }, [expectedMidi]);

  // Sync polyphony mode to engine
  useEffect(() => {
    setAudioPolyphony(polyphony);
  }, [polyphony]);

  // Subscribe to pitch events from the event bus
  useEffect(() => {
    const unsubscribeNote = noteEventBus.subscribeNote(event => {
      const state = pianoStateRef.current;

      if (state && !liveKeysRef.current) {
        if (event.type === 'noteOn') {
          pressKey(state, event.midi, event.velocity);
        } else {
          releaseKey(state, event.midi);
        }
      }

      // Update local state map
      setActiveNotes(prev => {
        const next = new Map(prev);
        if (event.type === 'noteOn') {
          next.set(event.midi, event);
        } else {
          next.delete(event.midi);
        }
        return next;
      });

      if (event.type === 'noteOn') {
        setLatestNote({
          midi: event.midi,
          name: noteName(event.midi),
          cents: event.cents,
        });
      }

      if (onNoteDetectedRef.current) {
        onNoteDetectedRef.current(event);
      }
    });

    const unsubscribeStats = noteEventBus.subscribeStats(newStats => {
      setStats(newStats);
    });

    const unsubscribeStatus = noteEventBus.subscribeStatus(newStatus => {
      setStatus(newStatus);
    });

    const unsubscribeCal = noteEventBus.subscribeCalibration(calEvent => {
      setCalibrationEvent(calEvent);
      if (calEvent.state === CALIBRATION_STATE.allDone) {
        setCalibrating(false);
        // The engine publishes the new profile before it reports "all done".
        const updatedProfile = getPianoCalibrationProfile();
        setProfile(updatedProfile);
        if (onCalibrationCompleteRef.current) {
          onCalibrationCompleteRef.current(updatedProfile);
        }
      }
    });

    return () => {
      unsubscribeNote();
      unsubscribeStats();
      unsubscribeStatus();
      unsubscribeCal();
    };
  }, []);

  // Timing stats for diagnostics (lets the CPU budget be checked on the phone).
  useEffect(() => {
    if (statsIntervalMs <= 0) return;
    const timer = setInterval(() => {
      getAudioStats();
    }, statsIntervalMs);
    return () => clearInterval(timer);
  }, [statsIntervalMs]);

  const start = useCallback(() => {
    startAudioDetector();
    setRunning(true);
  }, []);

  const stop = useCallback(() => {
    stopAudioDetector();
    setRunning(false);
    setActiveNotes(new Map());
  }, []);

  /**
   * Calibrates the user's keyboard. Defaults: the quick anchor set, on the
   * range calibrated last time (or a full 88-key piano).
   */
  const startCalibration = useCallback(
    (calibration: Partial<CalibrationOptions> = {}) => {
      const previous = readProfile();
      const resolved: CalibrationOptions = {
        fullMode: calibration.fullMode ?? false,
        lowestMidi:
          calibration.lowestMidi ??
          (previous?.isCalibrated ? previous.lowestMidi : 21),
        highestMidi:
          calibration.highestMidi ??
          (previous?.isCalibrated ? previous.highestMidi : 108),
      };
      setCalibrationEvent(null);
      setCalibrating(true);
      startPianoCalibration(resolved);
      setRunning(true);
    },
    [],
  );

  const stopCalibration = useCallback(() => {
    stopPianoCalibration();
    setCalibrating(false);
  }, []);

  /** Saves the calibration that just finished. False if there is none or it could not be written. */
  const saveCalibration = useCallback((): boolean => {
    const saved = savePianoCalibration();
    if (saved) {
      setProfile(readProfile());
    }
    return saved;
  }, []);

  const clearCalibration = useCallback(() => {
    clearPianoCalibration();
    setProfile(readProfile());
  }, []);

  useEffect(() => {
    if (autoStart) {
      start();
    } else {
      stop();
    }
  }, [autoStart, start, stop]);

  return {
    running,
    calibrating,
    activeNotes,
    latestNote,
    stats,
    status,
    calibrationEvent,
    profile,
    expectedMidi,
    polyphony,
    start,
    stop,
    startCalibration,
    stopCalibration,
    saveCalibration,
    clearCalibration,
    /** The engine's key table for O(1) reads (null with the mock engine). */
    liveKeys,
    getStats: getAudioStats,
    getProfile: getPianoCalibrationProfile,
  };
}
