// @ts-ignore idiomorph ships no type declarations; the shape below is typed by hand.
import {Idiomorph as untypedIdiomorph} from 'idiomorph'

export interface IdiomorphHeadConfig {
  style?: 'merge' | 'append' | 'morph' | 'none'
  block?: boolean
  ignore?: boolean
  shouldPreserve?: (element: Element) => boolean
  shouldReAppend?: (element: Element) => boolean
  shouldRemove?: (element: Element) => boolean
}

export interface IdiomorphCallbacks {
  beforeNodeAdded?: (node: Node) => boolean | void
  afterNodeAdded?: (node: Node) => void
  beforeNodeMorphed?: (oldNode: Element, newNode: Node) => boolean | void
  afterNodeMorphed?: (oldNode: Element, newNode: Node) => void
  beforeNodeRemoved?: (node: Element) => boolean | void
  afterNodeRemoved?: (node: Element) => void
  beforeAttributeUpdated?: (
    name: string,
    node: Element,
    mutationType: 'update' | 'remove',
  ) => boolean | void
}

export interface IdiomorphConfig {
  morphStyle?: 'outerHTML' | 'innerHTML'
  ignoreActive?: boolean
  ignoreActiveValue?: boolean
  restoreFocus?: boolean
  callbacks?: IdiomorphCallbacks
  head?: IdiomorphHeadConfig
}

export interface IdiomorphApi {
  morph(
    oldNode: Element | Document,
    newContent: Element | Node | string | null,
    config?: IdiomorphConfig,
  ): Node[] | Promise<Node[]>
}

export const Idiomorph: IdiomorphApi = untypedIdiomorph
