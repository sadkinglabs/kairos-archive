/** The entry module: only the default export, as the runtime requires. */
import { handle, type Env } from "./worker";

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handle(request, env),
} satisfies ExportedHandler<Env>;
