/** Rules-text snippets for result tiles: the sentence that matched the
 * query, with the matched phrases marked. Pure: takes text and phrases,
 * returns HTML that is safe to insert (every character of the rules
 * text is escaped before the <mark> tags are added around it). */

import type { Node } from "./query";

/** Longest snippet before it is cut to a window around the first match. */
export const MAX_LENGTH = 160;

/** The phrases a query asks of rules text: every non-negated r: term.
 * A negated term names what a result does *not* contain, so there is
 * nothing to mark. */
export function rulesPhrases(ast: Node | null): string[] {
  const out: string[] = [];
  const walk = (node: Node): void => {
    switch (node.kind) {
      case "and": case "or": node.items.forEach(walk); break;
      case "not": break;
      case "term": if (node.key.name === "rules" && node.op !== "!=" && node.value.trim()) out.push(node.value); break;
      default: break;
    }
  };
  if (ast) walk(ast);
  return dedupe(out);
}

function dedupe(phrases: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of phrases) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One case-insensitive matcher for all phrases, longest first so an
 * overlapping shorter phrase never splits a longer match. */
function matcher(phrases: string[]): RegExp | null {
  const parts = [...phrases].filter((p) => p.length > 0).sort((a, b) => b.length - a.length).map(escapeRegex);
  return parts.length ? new RegExp(parts.join("|"), "gi") : null;
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

/** Escape the text and wrap every phrase match in <mark>. */
function mark(text: string, re: RegExp): string {
  let out = "";
  let last = 0;
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) {
    out += escapeHtml(text.slice(last, m.index));
    out += `<mark>${escapeHtml(m[0])}</mark>`;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

/** The first sentence of the rules text containing any of the phrases,
 * as HTML with the phrases marked; null when nothing matches or there is
 * nothing to look for. */
export function snippet(rulesText: string | null | undefined, phrases: string[]): string | null {
  const re = matcher(phrases);
  if (!re || !rulesText) return null;
  for (const sentence of sentences(rulesText)) {
    re.lastIndex = 0;
    const first = re.exec(sentence);
    if (!first) continue;
    const cut = window(sentence, first.index, first.index + first[0].length);
    return mark(cut, re);
  }
  return null;
}
