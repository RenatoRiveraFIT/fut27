export interface Env {
  DB: D1Database;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  PAGES_PER_RUN: string;
}
