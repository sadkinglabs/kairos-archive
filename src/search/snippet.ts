/** Rules-text snippets for result tiles: the sentence that matched the
 * query, with the matched phrases marked. Pure: takes text and phrases,
 * returns HTML that is safe to insert (every character of the rules
 * text is escaped before the <mark> tags are added around it). */

import type { Node } from "./query";
import { collapse, findRanges, fold } from "./text";
import { wholeWords } from "./evaluate";

/** A phrase to mark, and whether it was asked for as a complete word.
 * r:drag marks the "drag" inside Dragon; r=drag marks only the word. */
export interface Phrase { text: string; whole: boolean }

/** Longest snippet before it is cut to a window around the first match. */
export const MAX_LENGTH = 160;

/** The phrases a query asks of rules text: every non-negated r: term.
 * A negated term names what a result does *not* contain, so there is
 * nothing to mark. */
export function rulesPhrases(ast: Node | null): Phrase[] {
  const out: Phrase[] = [];
  const walk = (node: Node): void => {
    switch (node.kind) {
      case "and": case "or": node.items.forEach(walk); break;
      case "not": break;
      case "term": if (node.key.name === "rules" && node.op !== "!=" && node.value.trim()) out.push({ text: node.value, whole: wholeWords(node.op) }); break;
      default: break;
    }
  };
  if (ast) walk(ast);
  return dedupe(out);
}

function dedupe(phrases: Phrase[]): Phrase[] {
  const seen = new Set<string>();
  const out: Phrase[] = [];
  for (const p of phrases) {
    const k = `${p.whole ? "=" : ":"}${p.text.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Where every phrase matches, as offsets into the text, longest first
 * so an overlapping shorter phrase never splits a longer match, then
 * merged so no two marks overlap.
 *
 * The phrases are searched for literally by src/search/text.ts, never
 * compiled into a pattern, and the whole-word ones use the same
 * boundary rule the evaluator matched them with - so what is marked is
 * what made the card a result. Marking needs offsets into the text as
 * it is printed, so the text is only folded for comparison, never
 * collapsed: a run of spaces in the text stands for one space in a
 * quoted phrase, which is handled by matching each phrase against the
 * text with its whitespace runs mapped back to their real offsets. */
function ranges(text: string, phrases: Phrase[]): { start: number; end: number }[] {
  // Fold for comparison and remember where each folded character came
  // from, so a collapsed run of whitespace still marks its real span.
  let folded = "";
  const at: number[] = [];
  const lower = fold(text);
  for (let i = 0; i < lower.length; i += 1) {
    const isSpace = /\s/u.test(lower[i]!);
    if (isSpace && folded.endsWith(" ")) { at[folded.length - 1 + 1] = i; continue; }
    folded += isSpace ? " " : lower[i]!;
    at.push(i);
  }
  at.push(lower.length);
  const found: { start: number; end: number }[] = [];
  for (const phrase of [...phrases].sort((a, b) => b.text.length - a.text.length)) {
    const needle = collapse(fold(phrase.text)).trim();
    for (const r of findRanges(folded, needle, phrase.whole)) {
      found.push({ start: at[r.start] ?? 0, end: at[r.end] ?? text.length });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: { start: number; end: number }[] = [];
  for (const r of found) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) { last.end = Math.max(last.end, r.end); continue; }
    merged.push({ ...r });
  }
  return merged;
}

/** Sentences as a rules box reads them: split at line breaks and after
 * sentence punctuation followed by a space. */
function sentences(text: string): string[] {
  return text.split(/\n+|(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

/** Cut a long sentence to a window around the first match, on word
 * boundaries, with an ellipsis on each cut side. */
function window(sentence: string, matchStart: number, matchEnd: number): string {
  if (sentence.length <= MAX_LENGTH) return sentence;
  const room = MAX_LENGTH - (matchEnd - matchStart);
  let start = Math.max(0, matchStart - Math.floor(room / 2));
  let end = Math.min(sentence.length, start + MAX_LENGTH);
  if (end - start < MAX_LENGTH) start = Math.max(0, end - MAX_LENGTH);
  if (start > 0) { const sp = sentence.lastIndexOf(" ", start + 20); if (sp > 0 && sp <= matchStart) start = sp + 1; }
  if (end < sentence.length) { const sp = sentence.indexOf(" ", end - 20); if (sp >= matchEnd && sp !== -1) end = sp; }
  return `${start > 0 ? "…" : ""}${sentence.slice(start, end)}${end < sentence.length ? "…" : ""}`;
}

/** Escape the text and wrap every marked range in <mark>. */
function mark(text: string, found: { start: number; end: number }[]): string {
  let out = "";
  let last = 0;
  for (const r of found) {
    if (r.start < last) continue;
    out += escapeHtml(text.slice(last, r.start));
    out += `<mark>${escapeHtml(text.slice(r.start, r.end))}</mark>`;
    last = r.end;
  }
  return out + escapeHtml(text.slice(last));
}

/** The whole rules text, escaped, with every phrase match marked; the
 * text escaped and unmarked when there are no phrases. For the full view,
 * which shows the text entire rather than the sentence that matched. */
export function markText(rulesText: string | null | undefined, phrases: Phrase[]): string {
  const text = rulesText ?? "";
  if (phrases.length === 0) return escapeHtml(text);
  return mark(text, ranges(text, phrases));
}

/** The first sentence of the rules text containing any of the phrases,
 * as HTML with the phrases marked; null when nothing matches or there is
 * nothing to look for. */
export function snippet(rulesText: string | null | undefined, phrases: Phrase[]): string | null {
  const parts = snippetParts(rulesText, phrases);
  return parts && mark(parts.text, parts.ranges);
}

/** The same snippet before anything is done to it: the text to show and
 * where inside it the query matched. The site wraps those in <mark>; the
 * Discord bot wraps them in bold; the query API hands them to whoever
 * asked. One reading of "why this card", rendered three ways. */
export function snippetParts(rulesText: string | null | undefined, phrases: Phrase[]): { text: string; ranges: { start: number; end: number }[] } | null {
  if (phrases.length === 0 || !rulesText) return null;
  for (const sentence of sentences(rulesText)) {
    const found = ranges(sentence, phrases);
    if (found.length === 0) continue;
    const first = found[0]!;
    const cut = window(sentence, first.start, first.end);
    // The window may have trimmed and prefixed the sentence, so the
    // offsets are found again on the text actually shown.
    return { text: cut, ranges: ranges(cut, phrases) };
  }
  return null;
}
