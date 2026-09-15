/** The /random route. Every file under functions/ becomes a Pages Function
 * route, so the handler itself lives in src/, where the linter, tsc, astro
 * check and vitest already look - and where a test file next to it is a
 * test file rather than a route called /random.test. */
export { onRequest } from "../src/functions/random";
