/** Choosing one of something, kept out of the page so it can be tested.
 * The only interesting part is the arithmetic: Math.random() returns
 * [0, 1), so flooring times the length lands on a real index - but a
 * stubbed or unusual source could hand back 1, and that would index one
 * past the end, so the result is clamped. */

export function pickRandom<T>(items: readonly T[], random: () => number = Math.random): T | null {
  if (items.length === 0) return null;
  const index = Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)));
  return items[index];
}
