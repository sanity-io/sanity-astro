import serialize from 'serialize-javascript'
import type {PartialDeep} from 'type-fest'
import type {PluginOption} from 'vite'

import {DEFAULT_CLIENT_NAME, type ResolvedClients} from './resolve-clients'

const virtualModuleId = 'sanity:client'
const resolvedVirtualModuleId = '\0' + virtualModuleId

type PluginOptions = {
  logClientRequests?: 'dev' | 'build' | 'always'
}

export function vitePluginSanityClient(
  {clients, presentationClientName}: ResolvedClients,
  options: PluginOptions = {},
) {
  const logClientRequests = options.logClientRequests

  function serializeClients(isServerBuild: boolean): string {
    return Object.entries(clients)
      .map(([name, config]) => {
        // Named clients are where privileged credentials end up. Keep those out of browser
        // bundles; the `default` client keeps shipping as-is so existing islands that import
        // it still work. `headers` counts too: an Authorization header is a credential even
        // when `token` is unset. Any header is treated as one, since narrowing this later
        // would put a secret in a bundle that already shipped without it.
        const headers = config.headers
        const hasCredentials =
          typeof config.token === 'string' ||
          (typeof headers === 'object' && headers !== null && Object.keys(headers).length > 0)
        const isServerOnly = !isServerBuild && name !== DEFAULT_CLIENT_NAME && hasCredentials
        const client = isServerOnly
          ? `serverOnlyClient(${serialize(name)})`
          : `createNamedClient(${serialize(name)}, ${serialize(config)})`
        return `[${serialize(name)}, ${client}],`
      })
      .join('\n')
  }

  return {
    name: 'sanity:client',
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
    },
    load(id: string, loadOptions?: {ssr?: boolean}) {
      if (id === resolvedVirtualModuleId) {
        const serializedClients = serializeClients(loadOptions?.ssr === true)
        return `
          import { createClient } from "@sanity/client";

          const logClientRequests = ${serialize(logClientRequests)};
          const shouldLogInCurrentMode =
            logClientRequests === "always" ||
            (logClientRequests === "dev" && import.meta.env.DEV) ||
            (logClientRequests === "build" && import.meta.env.PROD);
          const shouldLogClientRequests =
            shouldLogInCurrentMode &&
            typeof window === "undefined";

          const instrumentClient = (sanityClient, clientName) => {
            if (!shouldLogClientRequests) {
              return sanityClient;
            }

            const dimOpen = "\\u001B[2m";
            const dimClose = "\\u001B[22m";
            const viteLikeCyanOpen = "\\u001B[36m";
            const greenOpen = "\\u001B[32m";
            const yellowOpen = "\\u001B[33m";
            const magentaOpen = "\\u001B[35m";
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
              const clientLabel =
                viteLikeCyanOpen +
                (clientName === ${serialize(DEFAULT_CLIENT_NAME)}
                  ? "[sanity:client]"
                  : "[sanity:client:" + clientName + "]") +
                colorClose;
              const message = clientLabel + " " + kind + " " + label + " (" + durationMs + "ms)";

              if (error) {
                console.error(timestamp, message, error);
                return;
              }

              console.info(timestamp, message);
            };
            const parseSourceFromStackLine = (line) => {
              const locationMatch = line.match(/(?:file:\\/\\/)?\\/[^\\s)]+:\\d+:\\d+/);
              if (!locationMatch) {
                return undefined;
              }

              const withLineAndColumn = locationMatch[0].replace(/^file:\\/\\//, "");
              const absolutePath = withLineAndColumn.replace(/:\\d+:\\d+$/, "");
              const normalizedPath = absolutePath.replace(/\\\\/g, "/");
              const appPathIndex = normalizedPath.lastIndexOf("/apps/");
              if (appPathIndex >= 0) {
                return normalizedPath.slice(appPathIndex + 1);
              }

              const packagePathIndex = normalizedPath.lastIndexOf("/packages/");
              if (packagePathIndex >= 0) {
                return normalizedPath.slice(packagePathIndex + 1);
              }

              const srcPathIndex = normalizedPath.lastIndexOf("/src/");
              if (srcPathIndex >= 0) {
                return normalizedPath.slice(srcPathIndex + 1);
              }

              return normalizedPath;
            };
            const getSourceFromStack = () => {
              try {
                const stack = new Error().stack;
                if (typeof stack !== "string") {
                  return undefined;
                }

                const stackLines = stack.split("\\n").slice(1);
                const candidates = [];
                for (const line of stackLines) {
                  const lowerLine = line.toLowerCase();
                  if (
                    lowerLine.includes("sanityclient.fetch") ||
                    lowerLine.includes("instrumentclient") ||
                    lowerLine.includes("logrequestresult") ||
                    lowerLine.includes("getfetchsourceandargs") ||
                    lowerLine.includes("getsourcefromstack") ||
                    lowerLine.includes("vite-plugin-sanity-client")
                  ) {
                    continue;
                  }

                  const source = parseSourceFromStackLine(line);
                  if (source) {
                    const normalizedSource = source.toLowerCase();
                    if (normalizedSource.endsWith(".astro")) {
                      return source;
                    }

                    if (
                      normalizedSource.includes("node_modules/") ||
                      normalizedSource.includes("/load-query.") ||
                      normalizedSource.includes("vite-plugin-sanity-client")
                    ) {
                      continue;
                    }

                    candidates.push(source);
                  }
                }

                return candidates[0];
              } catch {
                // noop
              }

              return undefined;
            };
            const getFetchSourceAndArgs = (args) => {
              const options = args[2];
              const hasLoggerSource =
                options &&
                typeof options === "object" &&
                !Array.isArray(options) &&
                Object.prototype.hasOwnProperty.call(options, "loggerSource");
              if (!hasLoggerSource) {
                return {source: undefined, forwardArgs: args};
              }

              const {loggerSource, ...sanityFetchOptions} = options;
              const source =
                typeof loggerSource === "string" && loggerSource.trim().length > 0
                  ? loggerSource.trim()
                  : undefined;
              const forwardArgs = [...args];
              forwardArgs[2] = sanityFetchOptions;
              return {source: source || getSourceFromStack(), forwardArgs};
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
                const {source: explicitSource, forwardArgs} = getFetchSourceAndArgs(args);
                const source = explicitSource || getSourceFromStack();
                const sourceLabel = source
                  ? "  " + magentaOpen + "source:" + colorClose + " " + source
                  : "";
                const label = queryLabel + params + sourceLabel;
                const startedAt = performance.now();

                try {
                  const result = await fetchImpl(...forwardArgs);
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

            return sanityClient;
          };

          const createNamedClient = (name, config) => {
            let client;
            try {
              client = createClient(config);
            } catch (error) {
              throw new Error(
                "[@sanity/astro]: Invalid config for Sanity client " +
                  JSON.stringify(name) +
                  ": " +
                  (error instanceof Error ? error.message : String(error)),
                {cause: error}
              );
            }
            return instrumentClient(client, name);
          };

          const serverOnlyClient = (name) =>
            new Proxy(Object.create(null), {
              get(_target, property) {
                if (property === "then" || typeof property === "symbol") {
                  return undefined;
                }
                throw new Error(
                  "[@sanity/astro]: The Sanity client " +
                    JSON.stringify(name) +
                    " is configured with a token or headers and is only available in server code, not in the browser"
                );
              },
            });

          const clients = new Map([
            ${serializedClients}
          ]);
          const sanityClient = clients.get(${serialize(DEFAULT_CLIENT_NAME)});
          const presentationClient = clients.get(${serialize(presentationClientName)});

          function getClient(name) {
            const client = clients.get(name);
            if (client) {
              return client;
            }

            throw new Error(
              "[@sanity/astro]: Unknown Sanity client " +
                JSON.stringify(name) +
                ". Configured clients: " +
                Array.from(clients.keys(), (clientName) => JSON.stringify(clientName)).join(", ")
            );
          }

          export { getClient, presentationClient, sanityClient };
        `
      }
    },
  } satisfies PartialDeep<PluginOption>
}
