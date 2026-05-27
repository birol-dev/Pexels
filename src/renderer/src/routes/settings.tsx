import React, { useEffect, useState } from 'react'
import { useAppStore } from '../lib/store'
import { api } from '../lib/api-client'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Switch } from '../components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/select'
import { Slider } from '../components/ui/slider'
import {
  KeyRound,
  Folder,
  Settings2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react'

export default function SettingsView(): React.JSX.Element {
  const { settings, loadSettings, updateSettings } = useAppStore()

  // Buffers settings in local state to prevent frequent disk writes on keystrokes/drags
  const [localSettings, setLocalSettings] = useState<any>(null)

  // API keys state (loaded as blank/obscured initially)
  const [openaiKey, setOpenaiKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [pexelsKey, setPexelsKey] = useState('')

  // Testing status
  const [testingLlm, setTestingLlm] = useState(false)
  const [llmTestResult, setLlmTestResult] = useState<{ success: boolean; message: string } | null>(
    null
  )

  const [testingPexels, setTestingPexels] = useState(false)
  const [pexelsTestResult, setPexelsTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    if (settings) {
      setLocalSettings({ ...settings })
    }
  }, [settings])

  if (!localSettings) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingSettings(true)
    setSaveResult(null)
    const updates: any = { ...localSettings }

    // Clear out masked values so we do not overwrite actual secrets with "••••••••••••••••"
    delete updates.openaiKey
    delete updates.geminiKey
    delete updates.openrouterKey
    delete updates.pexelsKey

    if (openaiKey) updates.openaiKey = openaiKey
    if (geminiKey) updates.geminiKey = geminiKey
    if (openrouterKey) updates.openrouterKey = openrouterKey
    if (pexelsKey) updates.pexelsKey = pexelsKey

    try {
      await updateSettings(updates)
      setSaveResult({ success: true, message: 'Settings saved successfully.' })
      // Clear password inputs
      setOpenaiKey('')
      setGeminiKey('')
      setOpenrouterKey('')
      setPexelsKey('')
    } catch (err: any) {
      setSaveResult({
        success: false,
        message: err?.message || 'Failed to save settings.'
      })
    } finally {
      setSavingSettings(false)
    }
  }

  const handleChooseFolder = async () => {
    const folder = await api.settings.chooseDownloadFolder()
    if (folder) {
      setLocalSettings((prev: any) => ({ ...prev, downloadFolder: folder }))
    }
  }

  const testLlmConnection = async () => {
    setTestingLlm(true)
    setLlmTestResult(null)
    try {
      const activeKey =
        localSettings.llmProvider === 'openai'
          ? openaiKey
          : localSettings.llmProvider === 'gemini'
            ? geminiKey
            : openrouterKey

      const result = await api.settings.testProvider({
        provider: localSettings.llmProvider,
        apiKey: activeKey || 'CURRENT_KEY_ON_DISK', // If blank, the backend secure secrets will load from disk
        modelId: localSettings.modelId
      })
      setLlmTestResult(result)
    } catch (err: any) {
      setLlmTestResult({ success: false, message: err.message })
    } finally {
      setTestingLlm(false)
    }
  }

  const testPexelsConnection = async () => {
    setTestingPexels(true)
    setPexelsTestResult(null)
    try {
      const result = await api.settings.testPexelsKey(pexelsKey || 'CURRENT_KEY_ON_DISK')
      setPexelsTestResult(result)
    } catch (err: any) {
      setPexelsTestResult({ success: false, message: err.message })
    } finally {
      setTestingPexels(false)
    }
  }

  return (
    <div className="w-full max-w-4xl space-y-6 pb-12">
      <div className="flex items-center space-x-3 border-b border-white/5 pb-4">
        <Settings2 className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configuration Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage API keys, output directories, and agent safety filters.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Left Side: Keys & Providers */}
        <div className="glass-panel rounded-xl p-6 space-y-5">
          <div className="flex items-center space-x-2 border-b border-white/5 pb-3">
            <KeyRound className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">API Credentials</h2>
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider">LLM Provider</Label>
            <Select
              value={localSettings.llmProvider}
              onValueChange={(val) =>
                setLocalSettings((prev: any) => ({ ...prev, llmProvider: val }))
              }
            >
              <SelectTrigger className="bg-black/20 border-white/10">
                <SelectValue placeholder="Select LLM provider" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-900 border-white/10 text-white">
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-id">Model ID</Label>
            <Input
              id="model-id"
              placeholder="e.g. gpt-4o, gemini-2.5-flash"
              value={localSettings.modelId}
              onChange={(e) =>
                setLocalSettings((prev: any) => ({ ...prev, modelId: e.target.value }))
              }
              className="bg-black/20 border-white/10"
            />
          </div>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="openai-key">OpenAI API Key</Label>
              <Input
                id="openai-key"
                type="password"
                placeholder={localSettings.openaiKey ? '••••••••••••••••' : 'Enter key...'}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="bg-black/20 border-white/10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gemini-key">Gemini API Key</Label>
              <Input
                id="gemini-key"
                type="password"
                placeholder={localSettings.geminiKey ? '••••••••••••••••' : 'Enter key...'}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="bg-black/20 border-white/10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="openrouter-key">OpenRouter API Key</Label>
              <Input
                id="openrouter-key"
                type="password"
                placeholder={localSettings.openrouterKey ? '••••••••••••••••' : 'Enter key...'}
                value={openrouterKey}
                onChange={(e) => setOpenrouterKey(e.target.value)}
                className="bg-black/20 border-white/10"
              />
            </div>

            <div className="space-y-1.5 border-t border-white/5 pt-4">
              <Label htmlFor="pexels-key">Pexels API Key</Label>
              <Input
                id="pexels-key"
                type="password"
                placeholder={localSettings.pexelsKey ? '••••••••••••••••' : 'Enter key...'}
                value={pexelsKey}
                onChange={(e) => setPexelsKey(e.target.value)}
                className="bg-black/20 border-white/10"
              />
            </div>
          </div>
        </div>

        {/* Right Side: Paths & Concurrency & Safety */}
        <div className="space-y-6">
          {/* Workspace Path */}
          <div className="glass-panel rounded-xl p-6 space-y-4">
            <div className="flex items-center space-x-2 border-b border-white/5 pb-3">
              <Folder className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Workspace Location</h2>
            </div>

            <div className="space-y-2">
              <Label>Default Download Directory</Label>
              <div className="flex space-x-2">
                <Input
                  readOnly
                  value={localSettings.downloadFolder}
                  className="bg-black/20 border-white/10 text-xs font-mono select-all flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleChooseFolder}
                  className="bg-white/10 hover:bg-white/20 border border-white/5"
                >
                  Browse
                </Button>
              </div>
            </div>
          </div>

          {/* Concurrency and Bounds */}
          <div className="glass-panel rounded-xl p-6 space-y-5">
            <div className="flex items-center space-x-2 border-b border-white/5 pb-3">
              <Settings2 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Loop Performance</h2>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Max Concurrent Downloads</Label>
                <span className="text-primary font-semibold">
                  {localSettings.maxConcurrentDownloads}
                </span>
              </div>
              <Slider
                value={[localSettings.maxConcurrentDownloads]}
                min={1}
                max={5}
                step={1}
                onValueChange={([val]) =>
                  setLocalSettings((prev: any) => ({ ...prev, maxConcurrentDownloads: val }))
                }
                className="py-2"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Max Agent Loop Turns</Label>
                <span className="text-primary font-semibold">
                  {localSettings.maxAgentIterations}
                </span>
              </div>
              <Slider
                value={[localSettings.maxAgentIterations]}
                min={5}
                max={50}
                step={5}
                onValueChange={([val]) =>
                  setLocalSettings((prev: any) => ({ ...prev, maxAgentIterations: val }))
                }
                className="py-2"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Request Timeout</Label>
                <span className="text-primary font-semibold">
                  {localSettings.requestTimeoutSeconds}s
                </span>
              </div>
              <Slider
                value={[localSettings.requestTimeoutSeconds]}
                min={10}
                max={180}
                step={5}
                onValueChange={([val]) =>
                  setLocalSettings((prev: any) => ({ ...prev, requestTimeoutSeconds: val }))
                }
                className="py-2"
              />
            </div>
          </div>

          {/* Safety parameters */}
          <div className="glass-panel rounded-xl p-6 space-y-4">
            <div className="flex items-center space-x-2 border-b border-white/5 pb-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Safety & Filtering</h2>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="skip-explicit" className="text-sm font-medium">
                  Skip Explicit Content
                </Label>
                <p className="text-xs text-muted-foreground">
                  Filters out explicit search results.
                </p>
              </div>
              <Switch
                id="skip-explicit"
                checked={localSettings.skipExplicitQueries}
                onCheckedChange={(checked) =>
                  setLocalSettings((prev: any) => ({ ...prev, skipExplicitQueries: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="avoid-people" className="text-sm font-medium">
                  Avoid Faces & People
                </Label>
                <p className="text-xs text-muted-foreground">
                  Tries to find b-roll without people.
                </p>
              </div>
              <Switch
                id="avoid-people"
                checked={localSettings.avoidPeopleAndFaces}
                onCheckedChange={(checked) =>
                  setLocalSettings((prev: any) => ({ ...prev, avoidPeopleAndFaces: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="require-approval" className="text-sm font-medium">
                  Require Approval Before Download
                </Label>
                <p className="text-xs text-muted-foreground">
                  Approve selected assets before downloading.
                </p>
              </div>
              <Switch
                id="require-approval"
                checked={localSettings.requireApprovalBeforeDownload}
                onCheckedChange={(checked) =>
                  setLocalSettings((prev: any) => ({
                    ...prev,
                    requireApprovalBeforeDownload: checked
                  }))
                }
              />
            </div>
          </div>
        </div>

        {/* Diagnostic Actions & Save Button */}
        <div className="md:col-span-2 flex flex-col sm:flex-row items-center justify-between gap-4 glass-panel rounded-xl p-6">
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              disabled={testingLlm}
              onClick={testLlmConnection}
              className="border-white/10 hover:bg-white/5"
            >
              {testingLlm && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test LLM Connection
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={testingPexels}
              onClick={testPexelsConnection}
              className="border-white/10 hover:bg-white/5"
            >
              {testingPexels && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Pexels Connection
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await api.settings.openAppDataFolder()
              }}
              className="border-white/10 hover:bg-white/5"
            >
              Show App Data Folder
            </Button>
          </div>

          <Button
            type="submit"
            disabled={savingSettings}
            className="w-full sm:w-auto px-8 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium shadow-lg shadow-violet-500/20"
          >
            {savingSettings && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save All Changes
          </Button>
        </div>
      </form>

      {/* Diagnostics Results Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {saveResult && (
          <div
            className={`p-4 rounded-xl flex items-start space-x-3 border ${saveResult.success ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300' : 'bg-destructive/10 border-destructive/20 text-destructive-foreground'}`}
          >
            {saveResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            )}
            <div>
              <div className="font-semibold text-sm">Settings</div>
              <div className="text-xs mt-1 leading-relaxed opacity-90">{saveResult.message}</div>
            </div>
          </div>
        )}

        {llmTestResult && (
          <div
            className={`p-4 rounded-xl flex items-start space-x-3 border ${llmTestResult.success ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300' : 'bg-destructive/10 border-destructive/20 text-destructive-foreground'}`}
          >
            {llmTestResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            )}
            <div>
              <div className="font-semibold text-sm">LLM Test Result</div>
              <div className="text-xs mt-1 leading-relaxed opacity-90">{llmTestResult.message}</div>
            </div>
          </div>
        )}

        {pexelsTestResult && (
          <div
            className={`p-4 rounded-xl flex items-start space-x-3 border ${pexelsTestResult.success ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300' : 'bg-destructive/10 border-destructive/20 text-destructive-foreground'}`}
          >
            {pexelsTestResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            )}
            <div>
              <div className="font-semibold text-sm">Pexels Test Result</div>
              <div className="text-xs mt-1 leading-relaxed opacity-90">
                {pexelsTestResult.message}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
