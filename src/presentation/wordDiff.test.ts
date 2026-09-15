import { describe, expect, it } from 'vitest';
import { wordDiff } from './wordDiff';

describe('source-preserving display differences', () => {
  const pairs = [
    ['Airborne\nIf Askelon Phoenix would take damage from a fire spell or ability, it gains +1 power this turn, instead.', 'Airborne\nIf Askelon Phoenix would take fire damage, it gains +1 power this turn instead.'],
    ['', 'New face'], ['Removed face', ''], ['5', '4'],
    ['First ability\n\nSecond ability', 'First ability\nSecond ability'],
    ['<script> & “name”', '<script> & “new name”'],
    ['a a a b a', 'a b a a b'], ['same\ntext', 'same\ntext'],
    ['a '.repeat(600), 'b '.repeat(600)],
  ];
  it.each(pairs)('preserves both exact inputs %#', (before, after) => {
    const result = wordDiff(before, after);
    expect(result.before.map(s => s.text).join('')).toBe(before);
    expect(result.after.map(s => s.text).join('')).toBe(after);
  });
  it('does not mark an unchanged ability as removed', () => {
    const result = wordDiff(pairs[0][0], pairs[0][1]);
    expect(result.before[0]).toEqual({ text: 'Airborne\nIf Askelon Phoenix would take ', changed: false });
  });
  it('marks unchanged text as unchanged', () => {
    const result = wordDiff('same\ntext', 'same\ntext');
    expect(result.before.every(s => !s.changed)).toBe(true);
    expect(result.after.every(s => !s.changed)).toBe(true);
  });
});
