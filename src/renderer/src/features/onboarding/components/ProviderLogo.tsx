import { PlugsIcon } from '@phosphor-icons/react'
import {
  GeminiIcon,
  OpenAIIcon,
  OpenRouterIcon
} from '@renderer/components/icons/onboarding-provider-icons'
import type { LlmProvider } from '../types'

export function ProviderLogo({ provider }: { provider: LlmProvider }): React.JSX.Element {
  if (provider === 'openai') return <OpenAIIcon />
  if (provider === 'gemini') return <GeminiIcon />
  if (provider === 'custom') {
    return <PlugsIcon className="h-9 w-9 shrink-0 text-on-surface-variant" aria-hidden />
  }
  return <OpenRouterIcon />
}
