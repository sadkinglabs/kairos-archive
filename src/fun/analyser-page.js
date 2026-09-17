/** The form on /fun/set-analyser. Implementation detail, not part of
 * the tutorial: it reads the chosen set (and a second one to compare),
 * calls analyseSet and draws the report with bars and percentages. */
import { QUERY, analyseSet, facts } from "./set-analyser.js";
import { rememberQueryAnswers } from "./remember.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** A small table of label, count and share. */
function statTable(rows) {
  let html = '<table class="stat"><thead><tr><th></th><th>Cards</th><th>Share</th></tr></thead><tbody>';
  for (const row of rows) {
    html += `<tr><td>${esc(row.label)}</td><td>${row.count}</td><td>${row.share}%</td></tr>`;
  }
  return html + "</tbody></table>";
}

/** Count cards by a key, or by each of a card's keys when the key is a list. */
function countBy(cards, keyOf) {
  const counts = {};
  for (const card of cards) {
    const keys = [].concat(keyOf(card));
    for (const key of keys) counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function curveRows(report) {
  const costed = report.cards.filter((card) => typeof card.cost === "number").length;
  return Object.keys(report.curve).map((k) => ({ label: k, count: report.curve[k], share: Math.round((report.curve[k] / costed) * 100) || 0 }));
}

/** The share of costed cards at five or more, for the comparison. */
function fivePlusShare(cards) {
  let costed = 0;
  let fivePlus = 0;
  for (const card of cards) {
    if (typeof card.cost !== "number") continue;
    costed++;
    if (card.cost >= 5) fivePlus++;
  }
  return Math.round((fivePlus / costed) * 100) || 0;
}

function shareRows(report, counts, shares, order) {
  const keys = order || Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  return keys.map((k) => ({ label: k === "None" ? "Elementless" : k, count: counts[k], share: shares[k] }));
}

function notableList(notable) {
  let html = "";
  for (const label in notable) {
    const card = notable[label];
    if (!card) continue;
    const detail = label === "Highest-power Minion" ? `power ${card.power}` : `cost ${card.cost}`;
    html += `<li><span class="muted">${esc(label)}</span> <a href="${esc(card.kairos_url)}">${esc(card.name)}</a> <span class="muted">${esc(detail)}</span></li>`;
  }
  return html;
}

export function renderReport(report, name) {
  const elements = countBy(report.cards, (card) => card.elements);
  const types = countBy(report.cards, (card) => card.type);
  return `
    <header class="report-head"><h2>${esc(name)}</h2><p class="muted">${report.cards.length} cards · average mana cost ${facts(report.cards).averageCost}</p></header>
    <div class="panels">
      <section class="panel"><h3>Mana curve</h3>${statTable(curveRows(report))}</section>
      <section class="panel"><h3>Elements</h3>${statTable(shareRows(report, elements, report.elements))}</section>
      <section class="panel"><h3>Card types</h3>${statTable(shareRows(report, types, report.types))}</section>
      <section class="panel"><h3>Notable cards</h3><ul class="notable">${notableList(report.notable)}</ul></section>
      <section class="panel"><h3>Facts</h3><ul class="facts">${report.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></section>
    </div>`;
}

export function renderComparison(a, aName, b, bName) {
  const na = facts(a.cards);
  const nb = facts(b.cards);
  const rows = [
    ["Cards", a.cards.length, b.cards.length],
    ["Average mana cost", na.averageCost, nb.averageCost],
    ["Minions", (a.types.Minion || 0) + "%", (b.types.Minion || 0) + "%"],
    ["Multi-element cards", na.multiElement, nb.multiElement],
    ["Cards costing 5+", fivePlusShare(a.cards) + "%", fivePlusShare(b.cards) + "%"],
    ["Cards with no element", na.elementlessShare + "%", nb.elementlessShare + "%"],
  ];
  return `<section class="panel compare"><h3>Side by side</h3><table><thead><tr><th></th><th>${esc(aName)}</th><th>${esc(bName)}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join("")}</tbody></table></section>`;
}

if (typeof document !== "undefined" && document.getElementById("analyser-form")) {
  window.fetch = rememberQueryAnswers(window.fetch.bind(window), QUERY);
  const form = document.getElementById("analyser-form");
  const out = document.getElementById("report");
  const nameOf = (select) => select.options[select.selectedIndex].text;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const first = form.elements.set;
    const second = form.elements.compare;
    out.innerHTML = '<p class="muted">Asking the query API…</p>';
    try {
      const a = await analyseSet(first.value);
      let html = renderReport(a, nameOf(first));
      if (second.value) {
        const b = await analyseSet(second.value);
        html += renderComparison(a, nameOf(first), b, nameOf(second)) + renderReport(b, nameOf(second));
      }
      out.innerHTML = html;
    } catch (err) {
      out.innerHTML = `<p class="err">${esc(err.message)}</p>`;
    }
  });
}
