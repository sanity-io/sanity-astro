import {sanityClient} from 'sanity:client'

/** The `projectId` and `dataset` of the integration's default client. */
export function defaultProject(): {projectId?: string | undefined; dataset?: string | undefined} {
  const {projectId, dataset} = sanityClient.config()
  return {projectId, dataset}
}
