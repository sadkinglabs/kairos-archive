/** The query API allows sixty requests a minute from one address, so a
 * page remembers every good answer it gets and hands it back for the
 * same address next time. The tutorial code asks with plain fetch and
 * never knows; only the page wraps it. Failures are never remembered. */
export function rememberQueryAnswers(realFetch, host) {
  const answers = new Map();
  return async function (url, options) {
    const address = String(url);
    if (!address.startsWith(host)) return realFetch(url, options);
    if (!answers.has(address)) {
      const response = await realFetch(url, options);
      if (!response.ok) return response;
      answers.set(address, { status: response.status, text: await response.text() });
    }
    const saved = answers.get(address);
    return new Response(saved.text, { status: saved.status, headers: { "content-type": "application/json" } });
  };
}
