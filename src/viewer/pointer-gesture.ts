type PointerSample = Pick<
  PointerEvent,
  'pointerId' | 'pointerType' | 'clientX' | 'clientY' | 'button' | 'timeStamp'
>;
type ClickSample = Pick<MouseEvent, 'clientX' | 'clientY' | 'button' | 'timeStamp'>;

/** Distinguish a complete tap from camera gestures, even when a drag ends where it began. */
export class PointerGesture {
  private pointers = new Map<number, { x: number; y: number; slop: number }>();
  private blocked = false;
  private tap: { x: number; y: number; time: number } | null = null;

  get active() {
    return this.pointers.size > 0;
  }

  get dragging() {
    return this.active && this.blocked;
  }

  hasPointer(id: number) {
    return this.pointers.has(id);
  }

  start(event: PointerSample) {
    if (!this.active) this.blocked = false;
    this.tap = null;
    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      slop: event.pointerType === 'touch' ? 8 : 6,
    });
    if (this.pointers.size > 1 || event.button !== 0) this.blocked = true;
  }

  move(event: PointerSample) {
    const pointer = this.pointers.get(event.pointerId);
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > pointer.slop)
      this.blocked = true;
  }

  end(event: PointerSample) {
    if (!this.hasPointer(event.pointerId)) return;
    this.move(event);
    this.pointers.delete(event.pointerId);
    this.tap =
      !this.active && !this.blocked
        ? { x: event.clientX, y: event.clientY, time: event.timeStamp }
        : null;
  }

  cancel() {
    this.pointers.clear();
    this.tap = null;
    this.blocked = true;
  }

  consumeClick(event: ClickSample) {
    const tap = this.tap;
    this.tap = null;
    return !!(
      tap &&
      !this.active &&
      !this.blocked &&
      event.button === 0 &&
      event.timeStamp >= tap.time &&
      event.timeStamp - tap.time < 700 &&
      Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 4
    );
  }
}
