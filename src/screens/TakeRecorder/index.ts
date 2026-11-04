/**
 * @purpose The take recorder screen (Phase 0 slice 2): records master 5.2's takes from the microphone, exactly as the capture hands them to the engine, with each take's conditions in meta.json, as harness take folders the owner copies to the Mac. A developer screen, reached from calibration and the lesson's engine overlay.
 */

export {
  TAKE_STATUS_POLL_MS,
  TakeRecorderScreen,
  type TakeRecorderScreenProps,
} from './TakeRecorderScreen';
export {
  buildTakeMeta,
  captureOf,
  completeTakeMeta,
  CONDITION_OPTIONS,
  conditionsFromMeta,
  DEFAULT_CONDITIONS,
  formatBytes,
  formatDuration,
  formatPeak,
  instrumentLabel,
  STOP_REASONS,
  takeFolderId,
  takeName,
  TAKES,
  type TakeConditions,
  type TakeId,
  type TakeMeta,
} from './takeConditions';
export {
  TAKE_RECORDER_LOOK,
  type TakeRecorderLook,
} from './takeRecorderLook';
