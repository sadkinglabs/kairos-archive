import { describe, expect, it } from 'vitest';
import { rotationFrame, rotationKeyframes } from './cardOrientation';

describe('Site card orientation', () => {
  it('starts clockwise in landscape and ends at natural portrait size', () => {
    expect(rotationFrame(90, 0, 0).angle).toBe(90);
    expect(rotationFrame(90, 0, 0).width).toBeCloseTo(63 / 88);
    expect(rotationFrame(90, 0, 1)).toEqual({ angle: 0, width: 1, height: 88 / 63 });
  });
  it('keeps every animation sample within the frame in both directions', () => {
    for (const [from, to] of [[90, 0], [0, 90]] as const) {
      for (let index = 0; index <= 100; index++) {
        const { angle, width, height } = rotationFrame(from, to, index / 100);
        const radians = angle * Math.PI / 180;
        const boundsWidth = width * (Math.cos(radians) + 88 / 63 * Math.sin(radians));
        const boundsHeight = width * (Math.sin(radians) + 88 / 63 * Math.cos(radians));
        expect(boundsWidth).toBeLessThanOrEqual(1 + 1e-12);
        expect(boundsHeight).toBeLessThanOrEqual(height + 1e-12);
      }
    }
  });
  it('returns to the same landscape endpoint after toggling', () => {
    expect(rotationKeyframes(0, 90).at(-1)).toEqual(rotationKeyframes(90, 0)[0]);
    expect(rotationKeyframes(90, 0).at(-1)).toEqual(rotationKeyframes(0, 90)[0]);
  });
});
