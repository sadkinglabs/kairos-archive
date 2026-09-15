/** The /random route. Every file under functions/ becomes a Pages Function
 * route, so the handler itself lives in src/, where eslint and tsc already
 * read it and where the file next to it is a test rather than a route
 * called /random.test with vitest bundled into it. */
export { onRequest } from "../src/functions/random";
