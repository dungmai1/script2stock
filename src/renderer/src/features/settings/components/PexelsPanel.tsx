import { CheckCircleIcon, CircleNotchIcon, ImagesIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { api } from '@renderer/lib/api-client'
import {
  STOCK_SOURCE_LABELS,
  STOCK_SOURCE_OPTIONS,
  getStockSource,
  stockKeyField,
  type StockSource
} from '@renderer/lib/stock-source'
import type { PublicSettings } from '@renderer/lib/store'
import { useConnectionTest } from '../hooks/useConnectionTest'
import type { SettingsForm } from '../hooks/useSettingsForm'
import type { TestResultState } from '../utils'
import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import { TestResult } from './TestResult'

interface PexelsPanelProps {
  settings: PublicSettings
  form: SettingsForm
  className?: string
}

/** Stock media source (Pexels or Pixabay) and its API key. */
export function PexelsPanel({ settings, form, className }: PexelsPanelProps): React.JSX.Element {
  const { keys, setKey, updateNow } = form
  const source = getStockSource(settings)
  const sourceLabel = STOCK_SOURCE_LABELS[source]
  const keyField = stockKeyField(source)

  const { testing, result, run, reset } = useConnectionTest(async () => {
    const key = keys[keyField] || 'CURRENT_KEY_ON_DISK'
    const response =
      source === 'pixabay'
        ? await api.settings.testPixabayKey(key)
        : await api.settings.testPexelsKey(key)
    return response as unknown as TestResultState
  }, `${sourceLabel} verification failed.`)

  const handleSourceChange = (next: StockSource): void => {
    updateNow({ stockProvider: next })
    reset()
  }

  return (
    <SettingsSection
      title="Stock Media Source"
      icon={ImagesIcon}
      iconClassName="text-primary"
      className={className}
    >
      <p className="font-body-md text-sm text-muted-foreground">
        Required for pulling high-res stock footage. New packs use the selected source.
      </p>
      <SettingsField label="Source" htmlFor="stock-source">
        <Select value={source} onValueChange={handleSourceChange}>
          <SelectTrigger id="stock-source" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STOCK_SOURCE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsField>
      <SettingsField label={`${sourceLabel} API Key`} htmlFor="stock-key" className="mt-auto">
        <Input
          id="stock-key"
          type="password"
          placeholder={settings[keyField] ? '••••••••••••••••' : `Enter ${sourceLabel} key...`}
          value={keys[keyField]}
          onChange={(e) => setKey(keyField, e.target.value)}
          className="font-mono"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={testing}
          onClick={run}
          className="mt-2 w-full"
        >
          {testing ? (
            <CircleNotchIcon size={18} className="animate-spin" aria-hidden />
          ) : (
            <CheckCircleIcon size={18} aria-hidden />
          )}
          <span className="font-label-sm text-label-sm uppercase">Verify Connection</span>
        </Button>
      </SettingsField>
      <TestResult title={`${sourceLabel} Connection Test`} result={result} />
    </SettingsSection>
  )
}
