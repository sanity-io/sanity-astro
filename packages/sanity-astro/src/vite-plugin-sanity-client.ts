import type {ClientConfig} from '@sanity/client'
import type {PartialDeep} from 'type-fest'
import serialize from 'serialize-javascript'
import type {PluginOption} from 'vite'

const virtualModuleId = 'sanity:client'
const resolvedVirtualModuleId = '\0' + virtualModuleId

type PluginOptions = {
  logClientRequests?: 'dev' | 'build' | 'always'
}

export function vitePluginSanityClient(config: ClientConfig, options: PluginOptions = {}) {
  const logClientRequests = options.logClientRequests

  return {
    name: 'sanity:client',
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
    },
    load(id: string) {
      if (id === resolvedVirtualModuleId) {
        return `
          import { createClient } from "@sanity/client";
          const sanityClient = createClient(
            ${serialize(config)}
          );

          const logClientRequests = ${serialize(logClientRequests)};
          const shouldLogInCurrentMode =
            logClientRequests === "always" ||
            (logClientRequests === "dev" && import.meta.env.DEV) ||
            (logClientRequests === "build" && import.meta.env.PROD);
          const shouldLogClientRequests =
            shouldLogInCurrentMode &&
            typeof window === "undefined";

          if (shouldLogClientRequests) {
            const dimOpen = "\\u001B[2m";
            const dimClose = "\\u001B[22m";
            const viteLikeCyanOpen = "\\u001B[36m";
            const greenOpen = "\\u001B[32m";
            const yellowOpen = "\\u001B[33m";
            const colorClose = "\\u001B[0m";
            const pad2 = (value) => String(value).padStart(2, "0");
            const getTimestamp24h = () => {
              const now = new Date();
              return (
                pad2(now.getHours()) +
                ":" +
                pad2(now.getMinutes()) +
                ":" +
                pad2(now.getSeconds())
              );
            };
            const stringifyForLog = (value, maxLength = 300) => {
              try {
                const serialized = JSON.stringify(value);
                if (typeof serialized !== "string") {
                  return "[unserializable]";
                }
                return serialized.length > maxLength
                  ? serialized.slice(0, maxLength) + "..."
                  : serialized;
              } catch {
                return "[unserializable]";
              }
            };
            const logRequestResult = (kind, label, startedAt, error) => {
              const durationMs = Math.round(performance.now() - startedAt);
              const timestamp = dimOpen + getTimestamp24h() + dimClose;
              const clientLabel = viteLikeCyanOpen + "[sanity:client]" + colorClose;
              const message = clientLabel + " " + kind + " " + label + " (" + durationMs + "ms)";

              if (error) {
                console.error(timestamp, message, error);
                return;
              }

              console.info(timestamp, message);
            };

            const fetchImpl = sanityClient.fetch?.bind(sanityClient);
            if (fetchImpl) {
              sanityClient.fetch = async (...args) => {
                const query = typeof args[0] === "string" ? args[0] : "[query]";
                const queryValue = query.slice(0, 120).replace(/\\s+/g, " ");
                const queryLabel = greenOpen + "query:" + colorClose + " " + queryValue;
                const params =
                  args.length > 1 && typeof args[1] !== "undefined"
                    ? "  " + yellowOpen + "params:" + colorClose + " " + stringifyForLog(args[1])
                    : "";
                const label = queryLabel + params;
                const startedAt = performance.now();

                try {
                  const result = await fetchImpl(...args);
                  logRequestResult("fetch", label, startedAt);
                  return result;
                } catch (error) {
                  logRequestResult("fetch", label, startedAt, error);
                  throw error;
                }
              };
            }

            const requestImpl = sanityClient.request?.bind(sanityClient);
            if (requestImpl) {
              sanityClient.request = async (...args) => {
                const request = args[0] ?? {};
                const method = request.method || "GET";
                const uri = request.uri || request.url || "[request]";
                const label = method + " " + uri;
                const startedAt = performance.now();

                try {
                  const result = await requestImpl(...args);
                  logRequestResult("request", label, startedAt);
                  return result;
                } catch (error) {
                  logRequestResult("request", label, startedAt, error);
                  throw error;
                }
              };
            }
          }

          export { sanityClient };
        `
      }
    },
  } satisfies PartialDeep<PluginOption>
}
