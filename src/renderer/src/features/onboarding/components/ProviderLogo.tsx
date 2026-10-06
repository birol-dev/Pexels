import {
  GeminiIcon,
  OpenAIIcon,
  OpenRouterIcon
} from '@renderer/components/icons/onboarding-provider-icons'
import type { LlmProvider } from '../types'

export function ProviderLogo({ provider }: { provider: LlmProvider }): React.JSX.Element {
  if (provider === 'openai') return <OpenAIIcon />
  if (provider === 'gemini') return <GeminiIcon />
  return <OpenRouterIcon />
}
