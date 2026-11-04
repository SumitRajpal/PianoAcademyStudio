/**
 * The take recorder (master 5.2 and 5.3; Phase 0 slice 2): records what the
 * microphone capture hands the engine as harness takes, in the app's Takes
 * folder. iOS only for now; elsewhere `isAvailable()` is false and every call
 * does nothing.
 */

import { TurboModuleRegistry } from 'react-native';
import type {
  Spec,
  StoredTake,
  TakeDevice,
  TakeStats,
  TakeStatus,
} from './specs/NativeTakeRecorder';

let cached: Spec | null | undefined;

function native(): Spec | null {
  if (cached === undefined) {
    try {
      cached = TurboModuleRegistry.get<Spec>('NativeTakeRecorder');
    } catch {
      cached = null; // Jest, or a platform without the module
    }
  }
  return cached ?? null;
}

export const takeRecorder = {
  isAvailable(): boolean {
    return native() != null;
  },
  /** Documents/Takes on the phone. */
  takesFolder(): string {
    return native()?.takesFolder() ?? '';
  },
  freeSpaceBytes(): number {
    return native()?.freeSpaceBytes() ?? 0;
  },
  device(): TakeDevice | null {
    return native()?.device() ?? null;
  },
  /** Opens Takes/<id>/audio.wav and starts recording. False if a take is open, the id is taken, or space is short. */
  start(id: string): boolean {
    return native()?.startTake(id) ?? false;
  },
  stop(): TakeStats | null {
    return native()?.stopTake() ?? null;
  },
  status(): TakeStatus | null {
    return native()?.getTakeStatus() ?? null;
  },
  /** Writes Takes/<id>/meta.json. */
  saveMeta(id: string, meta: object): boolean {
    return native()?.saveTakeMeta(id, `${JSON.stringify(meta, null, 2)}\n`) ?? false;
  },
  /** Newest first. */
  list(): ReadonlyArray<StoredTake> {
    return native()?.listTakes() ?? [];
  },
  remove(id: string): boolean {
    return native()?.deleteTake(id) ?? false;
  },
};

export type { StoredTake, TakeDevice, TakeStats, TakeStatus };
