import { act, create } from 'react-test-renderer';

import { EggHatch, GHOST_LETTERS, planHits } from '..';

describe('EggHatch', () => {
  it('renders the scene', async () => {
    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(<EggHatch />);
    });
    expect(renderer!.toJSON()).toBeTruthy();
    await act(() => renderer!.unmount());
  });

  it('fires onNoteHit for each ghost in order, then onHatchComplete', async () => {
    // Fake only the JS timers; the animation's frame clock stays real.
    jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const onNoteHit = jest.fn();
    const onHatchComplete = jest.fn();
    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(<EggHatch onNoteHit={onNoteHit} onHatchComplete={onHatchComplete} />);
    });
    expect(onNoteHit).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(60000));
    expect(onNoteHit.mock.calls.map(c => c[0])).toEqual([...GHOST_LETTERS]);
    expect(onHatchComplete).toHaveBeenCalledTimes(1);
    await act(() => renderer!.unmount());
    jest.useRealTimers();
  });

  it('plans every hit on the shell, in order, with the hit-stop on the real clock', () => {
    const plan = planHits();
    plan.hits.forEach((hit, i) => {
      expect(hit.impactReal).toBeCloseTo(hit.impactAt + i * 0.07);
      if (i > 0) expect(hit.impactAt).toBeGreaterThan(plan.hits[i - 1].impactAt);
      // The contact point lies on the shell: the normal points away from the egg.
      expect(Math.hypot(hit.outX, hit.outY)).toBeCloseTo(1);
    });
    expect(plan.burstAt).toBeGreaterThan(plan.hatchAt);
  });
});
