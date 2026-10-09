import { useCallback, useState } from 'react'
import { useAppStore } from '@renderer/lib/store'
import { api } from '@renderer/lib/api-client'
import { STOCK_SOURCE_LABELS, type StockSource } from '@renderer/lib/stock-source'
import type { LlmProvider, ProviderKeys, TestResult } from '../types'
import { buildSettingsUpdates, CURRENT_KEY_ON_DISK, DEFAULT_MODEL_IDS } from '../utils'
import { useConnectionTest, type ConnectionTest } from './useConnectionTest'

export interface OnboardingController {
  step: number
  goTo: (step: number) => void
  llmProvider: LlmProvider
  selectProvider: (provider: LlmProvider) => void
  activeKey: string
  setActiveKey: (value: string) => void
  modelId: string
  setModelId: (value: string) => void
  customBaseUrl: string
  setCustomBaseUrl: (value: string) => void
  llmTest: ConnectionTest
  stockProvider: StockSource
  selectStockProvider: (source: StockSource) => void
  stockKey: string
  setStockKey: (value: string) => void
  stockTest: ConnectionTest
  downloadFolder: string
  chooseFolder: () => Promise<void>
  finish: () => Promise<void>
}

export function useOnboarding(): OnboardingController {
  const updateSettings = useAppStore((s) => s.updateSettings)
  const settings = useAppStore((s) => s.settings)

  const [step, setStep] = useState(1)
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('openai')
  const [keys, setKeys] = useState<ProviderKeys>({
    openai: '',
    gemini: '',
    openrouter: '',
    custom: ''
  })
  const [modelId, setModelId] = useState(DEFAULT_MODEL_IDS.openai)
  const [customBaseUrl, setCustomBaseUrl] = useState(settings?.customBaseUrl || '')
  const [stockProvider, setStockProvider] = useState<StockSource>('pexels')
  const [stockKeys, setStockKeys] = useState<Record<StockSource, string>>({
    pexels: '',
    pixabay: ''
  })
  const [downloadFolder, setDownloadFolder] = useState(settings?.downloadFolder || '')

  const activeKey = keys[llmProvider]
  const stockKey = stockKeys[stockProvider]

  const checkLlm = useCallback(async (): Promise<TestResult> => {
    const result = await api.settings.testProvider({
      provider: llmProvider,
      apiKey: activeKey || CURRENT_KEY_ON_DISK,
      modelId,
      baseUrl: llmProvider === 'custom' ? customBaseUrl : undefined
    })
    return result as unknown as TestResult
  }, [llmProvider, activeKey, modelId, customBaseUrl])

  const checkStock = useCallback(async (): Promise<TestResult> => {
    const key = stockKey || CURRENT_KEY_ON_DISK
    const result =
      stockProvider === 'pixabay'
        ? await api.settings.testPixabayKey(key)
        : await api.settings.testPexelsKey(key)
    return result as unknown as TestResult
  }, [stockProvider, stockKey])

  const llmTest = useConnectionTest(checkLlm, 'Connection test failed.')
  const stockTest = useConnectionTest(
    checkStock,
    `${STOCK_SOURCE_LABELS[stockProvider]} test failed.`
  )
  const resetLlmTest = llmTest.reset
  const resetStockTest = stockTest.reset

  const selectProvider = useCallback(
    (provider: LlmProvider): void => {
      setLlmProvider(provider)
      setModelId(DEFAULT_MODEL_IDS[provider])
      resetLlmTest()
    },
    [resetLlmTest]
  )

  const setActiveKey = useCallback(
    (value: string): void => setKeys((prev) => ({ ...prev, [llmProvider]: value })),
    [llmProvider]
  )

  const selectStockProvider = useCallback(
    (source: StockSource): void => {
      setStockProvider(source)
      resetStockTest()
    },
    [resetStockTest]
  )

  const setStockKey = useCallback(
    (value: string): void => setStockKeys((prev) => ({ ...prev, [stockProvider]: value })),
    [stockProvider]
  )

  const chooseFolder = useCallback(async (): Promise<void> => {
    const folder = await api.settings.chooseDownloadFolder()
    if (folder) setDownloadFolder(folder)
  }, [])

  const finish = useCallback(async (): Promise<void> => {
    await updateSettings(
      buildSettingsUpdates({
        llmProvider,
        modelId,
        customBaseUrl,
        downloadFolder,
        keys,
        stockProvider,
        stockKeys
      })
    )
  }, [
    updateSettings,
    llmProvider,
    modelId,
    customBaseUrl,
    downloadFolder,
    keys,
    stockProvider,
    stockKeys
  ])

  return {
    step,
    goTo: setStep,
    llmProvider,
    selectProvider,
    activeKey,
    setActiveKey,
    modelId,
    setModelId,
    customBaseUrl,
    setCustomBaseUrl,
    llmTest,
    stockProvider,
    selectStockProvider,
    stockKey,
    setStockKey,
    stockTest,
    downloadFolder,
    chooseFolder,
    finish
  }
}
