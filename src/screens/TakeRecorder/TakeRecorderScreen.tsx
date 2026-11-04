/**
 * The take recorder screen: the conditions of master 5.2, Record and Stop,
 * the live counts, and the takes on the phone. A developer screen, reached
 * from calibration and from the lesson's engine overlay.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  noteEventBus,
  startAudioDetector,
  stopAudioDetector,
  takeRecorder,
  type EngineStatus,
  type StoredTake,
  type TakeStatus,
} from '@pianoacademy/core-engine';
import {
  buildTakeMeta,
  completeTakeMeta,
  CONDITION_OPTIONS,
  conditionsFromMeta,
  DEFAULT_CONDITIONS,
  formatBytes,
  formatDuration,
  formatPeak,
  STOP_REASONS,
  takeFolderId,
  takeName,
  TAKES,
  type TakeConditions,
} from './takeConditions';
import { TAKE_RECORDER_LOOK as look } from './takeRecorderLook';

/** How often the screen reads the take's counts. */
export const TAKE_STATUS_POLL_MS = 200;
const MIN_FREE_BYTES = 500 * 1024 ** 2;

const MIC_TEXT: Record<EngineStatus['state'], string> = {
  running: 'Microphone on',
  stopped: 'Microphone off',
  permissionPending: 'Waiting for microphone permission…',
  permissionDenied: 'Microphone access is off. Turn it on in Settings › Privacy & Security › Microphone.',
  interrupted: 'Paused by a call or another app.',
  error: 'The microphone could not start.',
};

type Message = { text: string; tone: 'info' | 'warning' | 'problem' };

export type TakeRecorderScreenProps = {
  /** Back to the screen that opened the recorder. */
  onBack: () => void;
};

export function TakeRecorderScreen({ onBack }: TakeRecorderScreenProps) {
  const insets = useSafeAreaInsets();
  const [initial] = useState(() => {
    const list = takeRecorder.list();
    return {
      list,
      conditions: list[0]?.meta ? conditionsFromMeta(list[0].meta) : DEFAULT_CONDITIONS,
    };
  });
  const [takes, setTakes] = useState<ReadonlyArray<StoredTake>>(initial.list);
  const [conditions, setConditions] = useState<TakeConditions>(initial.conditions);
  const [status, setStatus] = useState<TakeStatus | null>(() => takeRecorder.status());
  const [mic, setMic] = useState<EngineStatus>(() => noteEventBus.getLatestStatus());
  const [freeBytes, setFreeBytes] = useState(() => takeRecorder.freeSpaceBytes());
  const [message, setMessage] = useState<Message | null>(null);

  // The microphone runs while the screen is open. The engine owns the capture
  // today, so its detector runs too; nothing it detects is used or saved.
  useEffect(() => {
    const unsubscribe = noteEventBus.subscribeStatus(setMic);
    startAudioDetector();
    return () => {
      unsubscribe();
      if (!takeRecorder.status()?.recording) stopAudioDetector();
    };
  }, []);

  const finish = useCallback(() => {
    const stats = takeRecorder.stop();
    if (!stats?.id) return;
    const provisional = takeRecorder.list().find(t => t.id === stats.id)?.meta ?? '';
    const meta =
      completeTakeMeta(provisional, stats) ??
      buildTakeMeta({ conditions, startedAt: new Date(), device: takeRecorder.device(), stats });
    takeRecorder.saveMeta(stats.id, meta);
    setTakes(takeRecorder.list());
    setStatus(takeRecorder.status());
    setFreeBytes(takeRecorder.freeSpaceBytes());
    const summary = `Saved ${stats.id}: ${formatDuration(stats.durationSec)}, peak ${formatPeak(stats.peakDbfs)}, ${stats.clippedSamples} clipped, ${stats.droppedSamples} dropped.`;
    const why = STOP_REASONS[stats.stopReason];
    setMessage(
      why
        ? { text: `${why} ${summary}`, tone: 'warning' }
        : { text: summary, tone: stats.droppedSamples > 0 ? 'warning' : 'info' },
    );
  }, [conditions]);

  // The counts, five times a second; a take interrupted by iOS is closed here.
  useEffect(() => {
    const timer = setInterval(() => {
      const next = takeRecorder.status();
      setStatus(next);
      if (next?.recording && !next.capturing && next.stopReason) finish();
    }, TAKE_STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [finish]);

  const record = () => {
    setMessage(null);
    if (takeRecorder.freeSpaceBytes() < MIN_FREE_BYTES) {
      setMessage({ text: 'Less than 500 MB free on the phone. Copy takes to the Mac and delete them here first.', tone: 'problem' });
      return;
    }
    const startedAt = new Date();
    const id = takeFolderId(startedAt, conditions.take);
    const device = takeRecorder.device();
    if (!takeRecorder.start(id)) {
      setMessage({ text: 'The take could not start. Wait a second and try again.', tone: 'problem' });
      return;
    }
    takeRecorder.saveMeta(id, buildTakeMeta({ conditions, startedAt, device, stats: null }));
    setStatus(takeRecorder.status());
    setTakes(takeRecorder.list());
  };

  const remove = (id: string) => {
    Alert.alert('Delete this take?', id, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          takeRecorder.remove(id);
          setTakes(takeRecorder.list());
          setFreeBytes(takeRecorder.freeSpaceBytes());
        },
      },
    ]);
  };

  const set = <K extends keyof TakeConditions>(key: K, value: TakeConditions[K]) =>
    setConditions(c => ({ ...c, [key]: value }));

  const recording = status?.recording ?? false;
  const available = takeRecorder.isAvailable();
  const canRecord = available && mic.state === 'running' && !recording;
  const take = TAKES.find(t => t.id === conditions.take);

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: Math.max(insets.top, look.screen.padding),
          paddingBottom: Math.max(insets.bottom, look.screen.padding),
          paddingLeft: Math.max(insets.left, look.screen.padding),
          paddingRight: Math.max(insets.right, look.screen.padding),
        },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: recording }}
          disabled={recording}
          onPress={onBack}
          style={[styles.chip, recording && styles.disabled]}
        >
          <Text style={styles.chipText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Record takes</Text>
        <Text style={mic.state === 'running' ? styles.detail : styles.warning}>
          {mic.message || MIC_TEXT[mic.state]}
        </Text>
      </View>

      {!available ? (
        <Text style={styles.problem}>The take recorder needs the iPhone app.</Text>
      ) : (
        <View style={styles.columns}>
          <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
            <Text style={styles.label}>Take</Text>
            <View style={styles.chips}>
              {TAKES.map(t => (
                <Chip
                  key={t.id}
                  text={t.name}
                  selected={t.id === conditions.take}
                  disabled={recording}
                  onPress={() => set('take', t.id)}
                />
              ))}
            </View>
            {take ? <Text style={styles.detail}>{take.detail}</Text> : null}

            <Choice
              label="Instrument"
              options={CONDITION_OPTIONS.instrument}
              value={conditions.instrument}
              disabled={recording}
              onChange={v => set('instrument', v)}
            />
            {conditions.instrument === 'acoustic' ? (
              <Field
                placeholder="Which piano (such as school upright)"
                value={conditions.instrumentName}
                disabled={recording}
                onChange={v => set('instrumentName', v)}
              />
            ) : null}
            <Choice
              label="Distance"
              options={CONDITION_OPTIONS.distanceM}
              value={conditions.distanceM}
              format={v => `${v} m`}
              disabled={recording}
              onChange={v => set('distanceM', v)}
            />
            <Choice
              label="Placement"
              options={CONDITION_OPTIONS.placement}
              value={conditions.placement}
              disabled={recording}
              onChange={v => set('placement', v)}
            />
            <Choice
              label="Room"
              options={CONDITION_OPTIONS.room}
              value={conditions.room}
              disabled={recording}
              onChange={v => set('room', v)}
            />
            <Field
              placeholder="Room name (optional)"
              value={conditions.roomName}
              disabled={recording}
              onChange={v => set('roomName', v)}
            />
            <Choice
              label="Background"
              options={CONDITION_OPTIONS.background}
              value={conditions.background}
              disabled={recording}
              onChange={v => set('background', v)}
            />
            <Choice
              label="Pedal"
              options={CONDITION_OPTIONS.pedal}
              value={conditions.pedal}
              disabled={recording}
              onChange={v => set('pedal', v)}
            />
            <Field
              placeholder="Note (optional)"
              value={conditions.note}
              disabled={recording}
              onChange={v => set('note', v)}
            />
          </ScrollView>

          <View style={[styles.panel, styles.panelContent, styles.side]}>
            <View style={styles.recordRow}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={recording ? 'Stop' : 'Record'}
                accessibilityState={{ disabled: !recording && !canRecord }}
                disabled={!recording && !canRecord}
                onPress={recording ? finish : record}
                style={[
                  styles.record,
                  recording && styles.stop,
                  !recording && !canRecord && styles.recordDisabled,
                ]}
              >
                <Text style={styles.recordText}>{recording ? 'Stop' : 'Record'}</Text>
              </TouchableOpacity>
              <View>
                <Text style={styles.count}>
                  {recording ? `${takeName(conditions.take)} · ${formatDuration((status?.samples ?? 0) / 48000)}` : 'Not recording'}
                </Text>
                <Text style={styles.count}>Peak {formatPeak(status?.peakDbfs ?? -200)}</Text>
                <Text style={styles.count}>
                  Clipped {status?.clippedSamples ?? 0} · Dropped {status?.droppedSamples ?? 0}
                </Text>
              </View>
            </View>
            {message ? (
              <Text style={message.tone === 'problem' ? styles.problem : message.tone === 'warning' ? styles.warning : styles.body}>
                {message.text}
              </Text>
            ) : null}

            <Text style={styles.label}>
              Takes on this phone · {formatBytes(freeBytes)} free
            </Text>
            <ScrollView style={styles.list}>
              {takes.map(t => (
                <View key={t.id} style={styles.takeRow}>
                  <Text style={styles.body} numberOfLines={1}>
                    {t.id} · {formatBytes(t.bytes)}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${t.id}`}
                    disabled={recording && t.id === status?.id}
                    onPress={() => remove(t.id)}
                    style={styles.chip}
                  >
                    <Text style={styles.chipText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <Text style={styles.detail}>
              Files › On My iPhone › Piano Academy Studio › Takes, or on the Mac: Finder › your iPhone › Files.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function Chip({ text, selected, disabled, onPress }: { text: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected, disabled && !selected && styles.disabled]}
    >
      <Text style={styles.chipText}>{text}</Text>
    </TouchableOpacity>
  );
}

function Choice<T extends string | number>({
  label,
  options,
  value,
  format,
  disabled,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  format?: (v: T) => string;
  disabled: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.choice}>
      <Text style={[styles.label, styles.choiceLabel]}>{label}</Text>
      <View style={styles.chips}>
        {options.map(o => (
          <Chip
            key={String(o)}
            text={format ? format(o) : String(o)}
            selected={o === value}
            disabled={disabled}
            onPress={() => onChange(o)}
          />
        ))}
      </View>
    </View>
  );
}

function Field({ placeholder, value, disabled, onChange }: { placeholder: string; value: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <TextInput
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor={look.input.placeholderColor}
      value={value}
      editable={!disabled}
      onChangeText={onChange}
      autoCorrect={false}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: look.screen.backgroundColor, gap: look.screen.gap },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { ...look.text.title, flexShrink: 0 },
  columns: { flex: 1, flexDirection: 'row', gap: look.screen.gap },
  panel: { flex: 1, backgroundColor: look.panel.backgroundColor, borderRadius: look.panel.borderRadius },
  panelContent: { padding: look.panel.padding, gap: 10 },
  side: { flex: 0.9 },
  label: look.text.label,
  body: look.text.body,
  detail: look.text.detail,
  count: look.text.count,
  warning: look.text.warning,
  problem: look.text.problem,
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  choiceLabel: { width: 80 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: look.chip.gap, flexShrink: 1 },
  chip: {
    backgroundColor: look.chip.backgroundColor,
    borderRadius: look.chip.radius,
    paddingHorizontal: look.chip.paddingHorizontal,
    paddingVertical: look.chip.paddingVertical,
  },
  chipSelected: { backgroundColor: look.chip.selectedColor },
  chipText: { color: look.chip.textColor, fontSize: 13 },
  disabled: { opacity: 0.4 },
  input: {
    backgroundColor: look.input.backgroundColor,
    color: look.input.color,
    borderRadius: look.input.radius,
    padding: look.input.padding,
    fontSize: 13,
  },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  record: {
    width: look.record.size,
    height: look.record.size,
    borderRadius: look.record.radius,
    backgroundColor: look.record.color,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stop: { backgroundColor: look.record.stopColor },
  recordDisabled: { backgroundColor: look.record.disabledColor },
  recordText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  list: { flex: 1 },
  takeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 4 },
});
