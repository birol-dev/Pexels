import type { Icon } from '@phosphor-icons/react'
import { FilmStripIcon, LightningIcon, TimerIcon } from '@phosphor-icons/react'
import type { InputFormState } from '@renderer/lib/store'

export type PlatformType = InputFormState['platform']
export type AssetMix = InputFormState['mix']
export type SearchMode = InputFormState['searchMode']
export type InputMode = InputFormState['inputMode']

export const QUICK_IDEA_STARTERS = [
  {
    label: '🔥 5 Mind-Blowing Facts',
    prompt:
      '5 mind-blowing psychological facts that explain why humans procrastinate and how our brain tricks us.'
  },
  {
    label: '⏳ How It Actually Works',
    prompt:
      'A step-by-step breakdown of how quantum computing works compared to regular computers, explained simply.'
  },
  {
    label: '❓ Myth vs Reality',
    prompt:
      'Top 3 biggest fitness and diet myths debunked with scientific facts and practical truths.'
  },
  {
    label: '🌊 Deep Ocean Wonders',
    prompt:
      'The bizarre, bioluminescent creatures living in the Mariana Trench and how they survive extreme darkness and pressure.'
  },
  {
    label: '🚀 Future Tech Revolution',
    prompt:
      'How humanoid AI robots are preparing to enter factories and homes over the next decade.'
  }
]

export const TONE_OPTIONS = [
  'Engaging & Hook-first',
  'Cinematic Storytelling',
  'Educational & Explainer',
  'Dramatic & Suspenseful',
  'Humorous & Casual',
  'Inspiring & Motivational'
]

export const DURATION_OPTIONS: { value: string; label: string; words: string; icon: Icon }[] = [
  { value: '30s', label: 'Short (~30s)', words: '60–85 words', icon: LightningIcon },
  { value: '60s', label: 'Standard (~60s)', words: '120–160 words', icon: TimerIcon },
  { value: '2-3min', label: 'Deep Dive (~2-3m)', words: '300–450 words', icon: FilmStripIcon }
]

export const PLATFORM_OPTIONS: { value: PlatformType; label: string }[] = [
  { value: 'YouTube', label: 'YouTube (16:9)' },
  { value: 'Shorts', label: 'YouTube Shorts (9:16)' },
  { value: 'TikTok', label: 'TikTok (9:16)' },
  { value: 'Instagram Reels', label: 'Instagram Reels (9:16)' }
]

export const PRESET_STYLES = [
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'documentary', label: 'Documentary' },
  { value: 'business', label: 'Business / Corporate' },
  { value: 'tech', label: 'Tech & Modern' },
  { value: 'nature', label: 'Nature & Organic' },
  { value: 'lifestyle', label: 'Lifestyle & Authentic' },
  { value: 'abstract', label: 'Abstract & Artistic' }
]

export const CUSTOM_STYLE_VALUE = 'custom'

export const MIX_OPTIONS: { value: AssetMix; label: string }[] = [
  { value: 'videos only', label: 'Videos' },
  { value: 'photos only', label: 'Photos' },
  { value: 'videos + photos', label: 'Both' }
]

export const SEARCH_MODE_OPTIONS: { value: SearchMode; label: string; hint: string }[] = [
  { value: 'focused', label: 'Focused search', hint: 'Focused search — tighter match to the beat' },
  {
    value: 'broad',
    label: 'Broad search',
    hint: 'Broad search — more angles, better chance of usable stock'
  }
]

export const DEFAULT_FORM_STATE: InputFormState = {
  title: '',
  script: '',
  inputMode: 'script',
  idea: '',
  targetDuration: '60s',
  tone: 'Engaging & Hook-first',
  visualConcept: '',
  isExpandingIdea: false,
  platform: 'YouTube',
  style: 'cinematic',
  customStyleText: '',
  mix: 'videos + photos',
  maxAssetsPerBeat: 3,
  maxTotalDownloads: 15,
  searchMode: 'focused'
}
