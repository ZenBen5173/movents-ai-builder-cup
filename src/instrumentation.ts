/**
 * Server-side errors from pages, route handlers and server actions land
 * here (in addition to the platform logs). Swap the console call for an
 * error tracker (Sentry, Axiom…) by setting it up in this one place.
 */
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routerKind: string; routePath: string; routeType: string }) {
  const e = err as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      msg: e?.message,
      digest: e?.digest,
      name: e?.name,
      path: request.path,
      method: request.method,
      route: context.routePath,
      type: context.routeType,
      stack: e?.stack?.split("\n").slice(0, 6).join("\n"),
    }),
  );
}
