export type { SanityClient } from "@sanity/client";
import type { ClientConfig } from "@sanity/client";
export type { Config } from "sanity";

export type IntegrationOptions = ClientConfig & {
  studioBasePath?: string;
};
