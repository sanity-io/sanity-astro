import { enableVisualEditing } from "@sanity/visual-editing/enable-visual-editing";

import {
  applyPresentationHistoryUpdate,
  getPresentationUrl,
  shouldPublishUrl,
} from "./history.js";

type EnableVisualEditingOptions = NonNullable<
  Parameters<typeof enableVisualEditing>[0]
>;

export interface VisualEditingClientConfig {
  enabled?: boolean;
  zIndex?: EnableVisualEditingOptions["zIndex"];
  keepStegaOnCopy?: EnableVisualEditingOptions["keepStegaOnCopy"];
  syncPerspective?: (perspective: unknown) => void;
  triggerImmediateReload?: () => void;
  onMutationRefresh?: () => void;
}

export function mountVisualEditing(config: VisualEditingClientConfig): void {
  const cleanup = enableVisualEditing({
    ...(config.zIndex !== undefined ? { zIndex: config.zIndex } : {}),
    ...(config.keepStegaOnCopy !== undefined
      ? { keepStegaOnCopy: config.keepStegaOnCopy }
      : {}),
    history: {
      subscribe: (navigate) => {
        let lastUrl = "";

        const publishUrl = (nextUrl: string) => {
          if (!shouldPublishUrl(nextUrl, lastUrl)) {
            return;
          }
          lastUrl = nextUrl;
          navigate({
            type: "push",
            title: document.title,
            url: nextUrl,
          });
        };

        const publishCurrentUrl = () => {
          publishUrl(getPresentationUrl(window.location));
        };

        // Observe programmatic History API navigation from client routers or islands
        const originalPushState = window.history.pushState;
        const originalReplaceState = window.history.replaceState;

        window.history.pushState = function (
          this: History,
          ...args: Parameters<History["pushState"]>
        ) {
          originalPushState.apply(this, args);
          publishCurrentUrl();
        };

        window.history.replaceState = function (
          this: History,
          ...args: Parameters<History["replaceState"]>
        ) {
          originalReplaceState.apply(this, args);
          publishCurrentUrl();
        };

        const onClick = (event: MouseEvent) => {
          if (event.defaultPrevented || event.button !== 0) return;
          if (
            event.metaKey ||
            event.ctrlKey ||
            event.altKey ||
            event.shiftKey
          ) {
            return;
          }
          const target = event.target;
          if (!(target instanceof Element)) return;
          const anchor = target.closest("a[href]");
          if (!(anchor instanceof HTMLAnchorElement)) return;
          if (anchor.target && anchor.target !== "_self") return;
          if (anchor.hasAttribute("download")) return;

          let targetUrl: URL;
          try {
            targetUrl = new URL(anchor.href, window.location.href);
          } catch {
            return;
          }
          if (targetUrl.origin !== window.location.origin) return;

          publishUrl(getPresentationUrl(targetUrl));
        };

        publishCurrentUrl();

        window.addEventListener("popstate", publishCurrentUrl);
        window.addEventListener("hashchange", publishCurrentUrl);
        document.addEventListener("click", onClick, true);
        document.addEventListener("astro:page-load", publishCurrentUrl);

        return () => {
          window.history.pushState = originalPushState;
          window.history.replaceState = originalReplaceState;
          window.removeEventListener("popstate", publishCurrentUrl);
          window.removeEventListener("hashchange", publishCurrentUrl);
          document.removeEventListener("click", onClick, true);
          document.removeEventListener("astro:page-load", publishCurrentUrl);
        };
      },
      update: (update) => {
        applyPresentationHistoryUpdate(update, window.location.href, {
          assign: (url) => window.location.assign(url),
          replace: (url) => window.location.replace(url),
          back: () => window.history.back(),
        });
      },
    },
    onPerspectiveChange: (perspective) => {
      config.syncPerspective?.(perspective);
    },
    refresh: (payload) => {
      if (payload.source === "manual") {
        config.triggerImmediateReload?.();
        return Promise.resolve();
      }
      if (payload.source === "mutation") {
        config.onMutationRefresh?.();
        return Promise.resolve();
      }
      return false;
    },
  });

  // Tear down Comlink only when the document actually unloads, keeping the channel open
  // for snapshot-event messages while Astro SSR is fetching the next page over the network.
  window.addEventListener("pagehide", () => cleanup(), { once: true });
}