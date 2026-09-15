/** Presentation only: align unchanged words without modifying either source. */
export interface Segment { text: string; changed: boolean }
export function wordDiff(before: string, after: string): { before: Segment[]; after: Segment[] } {
  const a = before.match(/\s+|\S+/g) ?? [];
  const b = after.match(/\s+|\S+/g) ?? [];
  // Bound work for unusually long future values; exact source text still survives.
  if (a.length * b.length > 250_000) return {
    before: [{ text: before, changed: before !== after }],
    after: [{ text: after, changed: before !== after }],
  };
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  }
  const left: Segment[] = [], right: Segment[] = [];
  const push = (out: Segment[], text: string, changed: boolean) => {
    if (out.at(-1)?.changed === changed) out[out.length - 1].text += text;
    else out.push({ text, changed });
  };
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push(left, a[i++], false); push(right, b[j++], false);
    } else if (i < a.length && (j === b.length || lengths[i + 1][j] >= lengths[i][j + 1])) push(left, a[i++], true);
    else push(right, b[j++], true);
  }
  return { before: left, after: right };
}
