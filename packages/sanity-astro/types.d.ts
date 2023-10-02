import type { ClientConfig } from "@sanity/client";

export type IntegrationOptions = ClientConfig & {
  studioBasePath?: string;
};