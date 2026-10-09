import { ArrowSquareOutIcon, ImagesIcon, InfoIcon, SealCheckIcon } from '@phosphor-icons/react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import {
  STOCK_SOURCE_API_KEY_URLS,
  STOCK_SOURCE_LABELS,
  STOCK_SOURCE_OPTIONS
} from '@renderer/lib/stock-source'
import type { OnboardingController } from '../hooks/useOnboarding'
import { ConnectionTestRow } from './ConnectionTestRow'
import { Field } from './Field'
import { FormPanel } from './FormPanel'
import { StepCard } from './StepCard'
import { StepHeader } from './StepHeader'
import { StepNav } from './StepNav'

type PexelsStepProps = Pick<
  OnboardingController,
  'stockProvider' | 'selectStockProvider' | 'stockKey' | 'setStockKey' | 'stockTest'
> & {
  onBack: () => void
  onNext: () => void
}

/** Stock media source step: pick Pexels or Pixabay and link its API key. */
export function PexelsStep({
  stockProvider,
  selectStockProvider,
  stockKey,
  setStockKey,
  stockTest,
  onBack,
  onNext
}: PexelsStepProps): React.JSX.Element {
  const sourceLabel = STOCK_SOURCE_LABELS[stockProvider]

  return (
    <StepCard>
      <StepHeader
        step={3}
        icon={ImagesIcon}
        iconClassName="text-[#05a081]"
        title="Connect a stock source"
        description="StockFinder AI searches and retrieves stock b-roll footage through the Pexels or Pixabay API. Pick a source and link your developer key."
      />

      <FormPanel className="gap-6">
        <Field label="Stock source" htmlFor="onboarding-stock-source">
          <Select value={stockProvider} onValueChange={selectStockProvider}>
            <SelectTrigger id="onboarding-stock-source" className="w-full">
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
        </Field>

        <Field
          label={`${sourceLabel} API Key`}
          htmlFor="onboarding-stock-key"
          action={
            <Button asChild variant="link" size="xs" className="h-auto p-0 font-mono text-xs">
              <a href={STOCK_SOURCE_API_KEY_URLS[stockProvider]} target="_blank" rel="noreferrer">
                {`Get ${sourceLabel} API Key`}
                <ArrowSquareOutIcon />
              </a>
            </Button>
          }
        >
          <Input
            id="onboarding-stock-key"
            type="password"
            value={stockKey}
            onChange={(e) => setStockKey(e.target.value)}
            className="font-mono text-xs"
            placeholder={`Enter your ${sourceLabel} API key`}
          />
        </Field>

        <ConnectionTestRow
          idleLabel="Test Key"
          idleIcon={SealCheckIcon}
          successText="Key Verified"
          failureText="Verification Failed"
          testing={stockTest.testing}
          result={stockTest.result}
          onTest={stockTest.run}
        />

        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-container-low/50 p-4">
          <InfoIcon size={20} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-on-surface-variant">
            Your API key is stored locally in your system&apos;s secure keychain. It is strictly
            used to fetch footage directly from {sourceLabel} and is never sent to external servers.
          </p>
        </div>
      </FormPanel>

      <StepNav onBack={onBack} onNext={onNext} />
    </StepCard>
  )
}
