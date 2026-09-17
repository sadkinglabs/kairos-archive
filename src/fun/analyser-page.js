/** The form on /fun/set-analyser. Implementation detail, not part of
 * the tutorial: it reads the chosen set (and a second one to compare),
 * calls analyseSet and draws the report with bars and percentages. */
import { QUERY, analyseSet } from "./set-analyser.js";
import { rememberQueryAnswers } from "./remember.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Rows of label, bar and number, the bars scaled to the largest value. */
function bars(rows, suffix = "") {
  let max = 1;
  for (const row of rows) if (row.value > max) max = row.value;
  let html = "";
  for (const row of rows) {
    const width = Math.round((row.value / max) * 100);
    html += `<div class="bar-row"><span class="bar-label">${esc(row.label)}</span><span class="bar"><span class="fill" style="width:${width}%"></span></span><span class="bar-value">${row.value}${suffix}</span></div>`;
  }
  return html;
}

function sortedRows(shares, order) {
  const keys = order || Object.keys(shares).sort((a, b) => shares[b] - shares[a]);
  return keys.filter((k) => shares[k] !== undefined).map((k) => ({ label: k === "None" ? "Elementless" : k, value: shares[k] }));
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
  const curveRows = Object.keys(report.curve).map((k) => ({ label: k, value: report.curve[k] }));
  return `
    <header class="report-head"><h2>${esc(name)}</h2><p class="muted">${report.cards.length} cards · average mana cost ${report.numbers.averageCost}</p></header>
    <div class="panels">
      <section class="panel"><h3>Mana curve</h3>${bars(curveRows)}</section>
      <section class="panel"><h3>Elements</h3>${bars(sortedRows(report.elements), "%")}</section>
      <section class="panel"><h3>Card types</h3>${bars(sortedRows(report.types), "%")}</section>
      <section class="panel"><h3>Notable cards</h3><ul class="notable">${notableList(report.notable)}</ul></section>
      <section class="panel"><h3>Facts</h3><ul class="facts">${report.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></section>
    </div>`;
}

export function renderComparison(a, aName, b, bName) {
  const rows = [
    ["Cards", a.cards.length, b.cards.length],
    ["Average mana cost", a.numbers.averageCost, b.numbers.averageCost],
    ["Minions", (a.types.Minion || 0) + "%", (b.types.Minion || 0) + "%"],
    ["Multi-element cards", a.numbers.multiElement, b.numbers.multiElement],
    ["Cards costing 5+", a.numbers.fivePlusShare + "%", b.numbers.fivePlusShare + "%"],
    ["Cards with no element", a.numbers.elementlessShare + "%", b.numbers.elementlessShare + "%"],
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
