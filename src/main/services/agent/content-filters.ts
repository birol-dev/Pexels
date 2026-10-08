// The two safety settings, as code. Both are best effort: they read the words Pexels gives each
// result (a photo's alt text, the slug of a page), not the picture, so a result with no
// description passes.

// "Hands" and "silhouette" are not here on purpose: the beat split suggests them as people-free
// alternatives.
const PEOPLE_WORDS = [
  'person',
  'people',
  'man',
  'men',
  'woman',
  'women',
  'boy',
  'boys',
  'girl',
  'girls',
  'child',
  'children',
  'kid',
  'kids',
  'baby',
  'babies',
  'face',
  'faces',
  'portrait',
  'portraits',
  'crowd',
  'crowds',
  'couple',
  'couples',
  'family',
  'families',
  'friends',
  'businessman',
  'businessmen',
  'businesswoman',
  'businesswomen',
  'student',
  'students',
  'worker',
  'workers',
  'teenager',
  'teenagers',
  'selfie',
  'selfies'
]
const PEOPLE_PATTERN = new RegExp(`\\b(${PEOPLE_WORDS.join('|')})\\b`, 'i')

/** True when a result's description says people are in it. Silent descriptions pass. */
export function mentionsPeople(description: string): boolean {
  return PEOPLE_PATTERN.test(description)
}

const EXPLICIT_WORDS = [
  'nude',
  'nudes',
  'nudity',
  'naked',
  'nsfw',
  'porn',
  'pornography',
  'pornographic',
  'erotic',
  'erotica',
  'sexy',
  'lingerie',
  'topless'
]
const EXPLICIT_PATTERN = new RegExp(`\\b(${EXPLICIT_WORDS.join('|')})\\b`, 'i')

/** True when a search query or a result's description is about explicit content. */
export function isExplicitText(text: string): boolean {
  return EXPLICIT_PATTERN.test(text)
}

export type SafetySettings = { skipExplicit: boolean; avoidPeople: boolean }

export const EXPLICIT_QUERY_BLOCKED_MESSAGE = 'That query is blocked by the Skip explicit setting.'

export const ALL_RESULTS_HIDDEN_NOTE =
  'All results were hidden by the safety settings. Search for objects or places instead.'

/** True when a search query must not be sent to Pexels. */
export function isQueryBlocked(query: string, settings: SafetySettings): boolean {
  return settings.skipExplicit && isExplicitText(query)
}

/** True when the description of a result puts it out of reach under the active settings. */
export function isHiddenBySafety(description: string, settings: SafetySettings): boolean {
  return (
    (settings.skipExplicit && isExplicitText(description)) ||
    (settings.avoidPeople && mentionsPeople(description))
  )
}

/** Keeps the results the active settings allow, and counts the ones they hid. */
export function applySafetyFilters<T>(
  items: T[],
  descriptionOf: (item: T) => string,
  settings: SafetySettings
): { shown: T[]; filtered: number } {
  const shown = items.filter((item) => !isHiddenBySafety(descriptionOf(item), settings))
  return { shown, filtered: items.length - shown.length }
}

/** What a search result tells the model about the results that were hidden. Empty when none were. */
export function safetyFilterReport(
  filtered: number,
  shownCount: number
): { filtered?: number; note?: string } {
  if (filtered === 0) return {}
  return shownCount === 0 ? { filtered, note: ALL_RESULTS_HIDDEN_NOTE } : { filtered }
}
