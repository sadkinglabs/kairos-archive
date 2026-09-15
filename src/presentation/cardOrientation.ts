export type CardRotation = 0 | 90;
const portraitRatio = 88 / 63;

/** Shrink during the turn so the rotating corners stay inside the changing frame. */
export function rotationFrame(from: CardRotation, to: CardRotation, progress: number) {
  const angle = from + (to - from) * progress;
  const height = (from === 90 ? 1 / portraitRatio : portraitRatio) * (1 - progress)
    + (to === 90 ? 1 / portraitRatio : portraitRatio) * progress;
  const radians = angle * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = Math.min(1 / (cos + portraitRatio * sin), height / (sin + portraitRatio * cos));
  return { angle, width, height };
}

export function rotationKeyframes(from: CardRotation, to: CardRotation) {
  return Array.from({ length: 25 }, (_, index) => {
    const { angle, width } = rotationFrame(from, to, index / 24);
    return { width: `${width * 100}%`, transform: `translate(-50%, -50%) rotate(${angle}deg)` };
  });
}
