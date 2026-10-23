import { describe, expect, it } from 'vitest';
import { PointerGesture } from '../src/viewer/pointer-gesture';

const sample = (patch: Partial<PointerEvent> = {}) => ({
  pointerId: 1,
  pointerType: 'touch',
  clientX: 100,
  clientY: 100,
  button: 0,
  timeStamp: 10,
  ...patch,
});

describe('model selection after camera gestures', () => {
  it('accepts one completed tap with normal finger jitter, only once', () => {
    const gesture = new PointerGesture();
    gesture.start(sample());
    gesture.move(sample({ clientX: 105, timeStamp: 40 }));
    expect(gesture.consumeClick(sample({ timeStamp: 50 }))).toBe(false);
    gesture.end(sample({ clientX: 104, timeStamp: 90 }));
    expect(gesture.consumeClick(sample({ clientX: 104, timeStamp: 100 }))).toBe(true);
    expect(gesture.consumeClick(sample({ clientX: 104, timeStamp: 101 }))).toBe(false);
  });

  it('rejects a rotation that returns to its starting point', () => {
    const gesture = new PointerGesture();
    gesture.start(sample());
    gesture.move(sample({ clientX: 170 }));
    gesture.move(sample());
    gesture.end(sample({ timeStamp: 100 }));
    expect(gesture.consumeClick(sample({ timeStamp: 101 }))).toBe(false);
  });

  it('rejects a pinch even when the remaining finger stops moving before release', () => {
    const gesture = new PointerGesture();
    gesture.start(sample());
    gesture.start(sample({ pointerId: 2, clientX: 160 }));
    gesture.end(sample({ pointerId: 2, clientX: 160, timeStamp: 100 }));
    gesture.end(sample({ timeStamp: 110 }));
    expect(gesture.consumeClick(sample({ timeStamp: 120 }))).toBe(false);
    gesture.start(sample({ timeStamp: 200 }));
    gesture.end(sample({ timeStamp: 220 }));
    expect(gesture.consumeClick(sample({ timeStamp: 221 }))).toBe(true);
  });

  it('recovers from cancellation without selecting on a stale pointer-up or click', () => {
    const gesture = new PointerGesture();
    gesture.start(sample());
    gesture.cancel();
    gesture.end(sample({ timeStamp: 100 }));
    expect(gesture.active).toBe(false);
    expect(gesture.consumeClick(sample({ timeStamp: 110 }))).toBe(false);
    gesture.start(sample({ pointerId: 3, timeStamp: 200 }));
    gesture.end(sample({ pointerId: 3, timeStamp: 250 }));
    expect(gesture.consumeClick(sample({ timeStamp: 251 }))).toBe(true);
  });

  it('does not turn mouse panning into selection, while retaining ordinary mouse clicks', () => {
    const gesture = new PointerGesture();
    gesture.start(sample({ pointerType: 'mouse', button: 2 }));
    gesture.end(sample({ pointerType: 'mouse', button: 2, timeStamp: 100 }));
    expect(gesture.consumeClick(sample({ timeStamp: 101 }))).toBe(false);
    gesture.start(sample({ pointerType: 'mouse', timeStamp: 200 }));
    gesture.end(sample({ pointerType: 'mouse', timeStamp: 210 }));
    expect(gesture.consumeClick(sample({ timeStamp: 211 }))).toBe(true);
  });

  it('checks release distance even if the browser coalesces away movement events', () => {
    const gesture = new PointerGesture();
    gesture.start(sample());
    gesture.end(sample({ clientY: 150, timeStamp: 100 }));
    expect(gesture.consumeClick(sample({ clientY: 150, timeStamp: 101 }))).toBe(false);
  });

  it('rejects stale or unrelated clicks after a valid tap', () => {
    const gesture = new PointerGesture();
    gesture.start(sample());
    gesture.end(sample({ timeStamp: 100 }));
    expect(gesture.consumeClick(sample({ timeStamp: 900 }))).toBe(false);
    gesture.start(sample({ timeStamp: 1000 }));
    gesture.end(sample({ timeStamp: 1100 }));
    expect(gesture.consumeClick(sample({ clientX: 140, timeStamp: 1101 }))).toBe(false);
  });
});
