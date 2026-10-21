import type {ClientPerspective, MutationEvent, SanityDocument, WelcomeEvent} from '@sanity/client'
import {createConnectionMachine, createController} from '@sanity/comlink'
import {
  createCompatibilityActors,
  type VisualEditingControllerMsg,
  type VisualEditingNodeMsg,
} from '@sanity/presentation-comlink'

export interface StandInLogEntry {
  t: number
  type: string
  data: unknown
}

export interface StandIn {
  readonly status: string
  log: StandInLogEntry[]
  refresh: () => void
  mutate: (documentId: string, field: string, value: string) => void
}

declare global {
  interface Window {
    standIn: StandIn
    // Installed by the test with `page.exposeFunction`: the Sanity API rejects browser requests
    // from origins outside a project's CORS list, so the snapshot fetch runs in the test process.
    fetchSnapshot: (documentId: string) => Promise<SanityDocument | undefined>
  }
}

const appUrl = new URLSearchParams(location.search).get('app')
if (!appUrl) {
  throw new Error('The stand-in needs ?app=<preview url>')
}

const log: StandInLogEntry[] = []
const record = (type: string, data: unknown) => {
  log.push({t: performance.now(), type, data})
}

const iframe = document.querySelector('iframe')
if (!iframe) {
  throw new Error('The stand-in page has no preview iframe')
}

const controller = createController({targetOrigin: new URL(appUrl).origin})
const channel = controller.createChannel<VisualEditingControllerMsg, VisualEditingNodeMsg>(
  {name: 'presentation', connectTo: 'visual-editing', heartbeat: true},
  createConnectionMachine<VisualEditingControllerMsg, VisualEditingNodeMsg>().provide({
    actors: createCompatibilityActors<VisualEditingControllerMsg>(),
  }),
)
iframe.addEventListener('load', () => controller.addTarget(iframe.contentWindow!), {once: true})
iframe.src = appUrl

const perspective: ClientPerspective = 'published'
const welcome: WelcomeEvent = {type: 'welcome', listenerName: 'stand-in'}

let status = 'idle'
channel.onStatus(({status: next}) => {
  status = next
  record('stand-in/status', {status: next})
  if (next === 'connected') {
    channel.post('presentation/perspective', {perspective})
  }
})
channel.onInternalEvent('message', ({message}) => record(message.type, message.data))

const snapshots = new Map<string, SanityDocument>()

channel.on('visual-editing/features', () => ({features: {optimistic: true}}))
channel.on('visual-editing/fetch-perspective', () => ({perspective}))
channel.on('visual-editing/schema', () => ({schema: []}))
channel.on('visual-editing/schema-union-types', () => ({types: new Map()}))
channel.on('visual-editing/shared-state', () => ({state: {}}))
channel.on('visual-editing/preview-snapshots', () => ({snapshots: []}))
channel.on('visual-editing/snapshot-welcome', () => ({event: welcome}))
channel.on('visual-editing/fetch-snapshot', async ({documentId}) => {
  if (documentId.startsWith('drafts.')) {
    return {snapshot: undefined}
  }
  const snapshot = await window.fetchSnapshot(documentId)
  if (snapshot) {
    snapshots.set(documentId, snapshot)
  }
  return {snapshot}
})
channel.on('visual-editing/mutate', () => [])

let transactions = 0

const mutate = (documentId: string, field: string, value: string) => {
  const previous = snapshots.get(documentId)
  if (!previous) {
    throw new Error(`No snapshot served for ${documentId} yet; the overlay has not fetched it`)
  }
  const resultRev = `stand-in-${++transactions}`
  const event: MutationEvent = {
    type: 'mutation',
    documentId,
    eventId: `${resultRev}#${documentId}`,
    transactionId: resultRev,
    previousRev: previous._rev,
    resultRev,
    transition: 'update',
    identity: 'stand-in',
    mutations: [],
    timestamp: new Date().toISOString(),
    visibility: 'transaction',
    transactionCurrentEvent: 1,
    transactionTotalEvents: 1,
    // mendoza opcode 17 is ObjectSetFieldValue: [17, value, key]
    effects: {apply: [17, value, field], revert: [17, previous[field], field]},
  }
  channel.post('presentation/snapshot-event', {event})
  record('stand-in/mutation-sent', event)
  snapshots.set(documentId, {...previous, _rev: resultRev, [field]: value})
}

window.standIn = {
  get status() {
    return status
  },
  log,
  refresh: () => {
    channel.post('presentation/refresh', {source: 'manual', livePreviewEnabled: false})
    record('stand-in/refresh-sent', undefined)
  },
  mutate,
}

channel.start()
