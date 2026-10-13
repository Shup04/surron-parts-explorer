import type { Explosion, Vec3 } from './types';

export function easeProgress(value: number, easing: Explosion['easing'] = 'smooth'): number {
  const t = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  if (easing === 'linear') return t;
  if (easing === 'cubic') return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return t * t * (3 - 2 * t);
}

/** Direction is normalized; distance is metres in the object's parent coordinates. */
export function explosionOffset(explosion: Explosion | undefined, amount: number): Vec3 {
  if (!explosion) return [0, 0, 0];
  const length = Math.hypot(...explosion.direction);
  if (!length || !Number.isFinite(length) || !Number.isFinite(explosion.distance)) return [0, 0, 0];
  const factor =
    (Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0)) * explosion.distance) / length;
  return explosion.direction.map((value) => value * factor) as Vec3;
}

/** Always derive from the captured original, never from the previous animated position. */
export function explodedPosition(
  original: Vec3,
  explosion: Explosion | undefined,
  amount: number,
): Vec3 {
  if (amount === 0 || !explosion) return [...original];
  const offset = explosionOffset(explosion, amount);
  return original.map((value, axis) => value + offset[axis]) as Vec3;
}

/** Approximate visualization only: this does not imply a mechanical disassembly order. */
export function automaticExplosion(
  position: Vec3,
  center: Vec3,
  index = 0,
  distance = 0.25,
): Explosion {
  let direction = position.map((value, axis) => value - center[axis]) as Vec3;
  if (Math.hypot(...direction) < 1e-8) {
    const angle = index * 2.399963229728653;
    direction = [Math.cos(angle), 0.25, Math.sin(angle)];
  }
  return { direction, distance, duration: 0.7, easing: 'smooth', verification: 'demonstration' };
}
