import type {ClientConfig} from '@sanity/client'

let sharedClientConfig: ClientConfig | undefined

export function setSharedSanityClientConfig(config: ClientConfig | undefined): void {
  sharedClientConfig = config
}

export function getSharedSanityClientConfig(): ClientConfig | undefined {
  return sharedClientConfig
}
