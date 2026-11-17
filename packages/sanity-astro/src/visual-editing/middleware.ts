import type { ClientPerspective } from "@sanity/client";
import type { AsyncLocalStorage } from "node:async_hooks";

// Share a single AsyncLocalStorage instance across Vite's SSR module graph
const STORAGE_KEY = Symbol.for("@sanity/astro/perspectiveStorage");

function getPerspectiveStorage():
  | AsyncLocalStorage<ClientPerspective>
  | undefined {
  const globalObj = globalThis as Record<PropertyKey, any>;
  if (globalObj[STORAGE_KEY]) {
    return globalObj[STORAGE_KEY];
  }

  try {
    const AsyncLocalStorageCtor =
      globalObj.AsyncLocalStorage ??
      globalObj.process?.getBuiltinModule?.("node:async_hooks")
        ?.AsyncLocalStorage;
    if (typeof AsyncLocalStorageCtor !== "function") {
      return undefined;
    }

    const store = new AsyncLocalStorageCtor();
    globalObj[STORAGE_KEY] = store;
    return store;
  } catch {
    return undefined;
  }
}

export function getActivePerspective(): ClientPerspective {
  return getPerspectiveStorage()?.getStore() ?? "published";
}

export interface SanityMiddlewareContext {
  isPrerendered?: boolean;
  request: Request;
  url: URL;
  cookies: {
    get(name: string): { value: string } | undefined;
  };
}

export async function onRequest(
  context: SanityMiddlewareContext,
  next: () => Promise<Response>,
): Promise<Response> {
  const perspectiveStorage = getPerspectiveStorage();

  // 1. Hard-lock static/prerendered builds and non-editing servers to 'published'
  if (
    context.isPrerendered ||
    import.meta.env.PUBLIC_SANITY_VISUAL_EDITING_ENABLED !== "true"
  ) {
    return perspectiveStorage
      ? perspectiveStorage.run("published", () => next())
      : next();
  }

  if (!perspectiveStorage) {
    throw new Error(
      "[@sanity/astro]: Visual Editing middleware requires AsyncLocalStorage. Enable Node.js compatibility (such as `nodejs_compat`) on your Edge runtime.",
    );
  }

  // 2. Match the browser's exact window.location.host for the cookie name
  const rawHost =
    context.request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    context.request.headers.get("host") ||
    context.url.host;
  const cookieName = `sanity-perspective-${rawHost.replace(/[:.]/g, "-")}`;

  // 3. Read perspective from Studio iframe URL param or host-specific cookie
  const urlParam =
    context.url.searchParams.get("sanity-preview-perspective") ||
    context.url.searchParams.get("perspective");
  const cookieVal = context.cookies.get(cookieName)?.value;

  const raw = urlParam || cookieVal;

  let activePerspective: ClientPerspective = "published";
  if (raw === "published" || raw === "drafts" || raw === "previewDrafts") {
    activePerspective = raw;
  } else if (raw) {
    activePerspective = raw.split(",");
  }

  // 4. Execute request in isolated async context and prevent Edge caching of preview HTML
  const response = await perspectiveStorage.run(activePerspective, () =>
    next(),
  );
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate",
  );
  return response;
}