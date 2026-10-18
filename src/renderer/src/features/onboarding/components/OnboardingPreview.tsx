import { CheckIcon, FolderIcon, ImagesIcon } from '@phosphor-icons/react'
import { BrandLogo } from '@renderer/components/common/BrandLogo'
import { cn } from '@renderer/lib/utils'
import type { OnboardingController } from '../hooks/useOnboarding'
import { PROVIDER_OPTIONS } from '../utils'
import { ProviderLogo } from './ProviderLogo'

type OnboardingPreviewProps = Pick<
  OnboardingController,
  'step' | 'llmProvider' | 'modelId' | 'hasLlmKey' | 'hasPexelsKey' | 'downloadFolder'
>

const pexels = (id: number): string =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=480`

/** A sample pack: bright, candid frames, one per beat. */
const BEATS: [number, string][] = [
  [17371465, 'It starts before the alarm.'],
  [35835482, 'Coffee for two. No phones.'],
  [12031035, 'The dog decides the route.'],
  [7618446, 'The market is barely awake.'],
  [8841463, 'Lunch turns into three hours.'],
  [8696275, 'And then the light goes gold.']
]

/** The app as a finished pack will look, with the part the current step sets up called out. */
export function OnboardingPreview({
  step,
  llmProvider,
  modelId,
  hasLlmKey,
  hasPexelsKey,
  downloadFolder
}: OnboardingPreviewProps): React.JSX.Element {
  const providerLabel =
    PROVIDER_OPTIONS.find((option) => option.id === llmProvider)?.label ?? llmProvider
  const folder = `${(downloadFolder || 'Videos/StockFinder').replace(/[\\/]+$/, '')}/a-saturday-slowly`

  const chips = [
    {
      step: 2,
      label: providerLabel,
      done: hasLlmKey,
      icon: <ProviderLogo provider={llmProvider} />
    },
    { step: 3, label: 'Pexels', done: hasPexelsKey, icon: <ImagesIcon /> },
    { step: 4, label: 'Folder', done: Boolean(downloadFolder), icon: <FolderIcon /> }
  ]

  return (
    <div className="flex h-full overflow-hidden rounded-tl-[28px] bg-frame shadow-lg" aria-hidden>
      <div className="flex w-44 shrink-0 flex-col gap-4 px-4 py-5">
        <BrandLogo variant="lockup" size="sm" className="[&_span]:text-[13px]" />
        <span className="mt-2 h-8 rounded-xl bg-primary-container" />
        <span className="flex flex-col gap-2.5 pt-1">
          {[70, 55, 62, 48].map((w, i) => (
            <span
              key={w}
              className={cn('h-2 rounded-full', i === 0 ? 'bg-on-surface/70' : 'bg-on-surface/15')}
              style={{ width: `${w}%` }}
            />
          ))}
        </span>
      </div>

      <div className="relative my-2 flex-1 overflow-hidden rounded-l-[20px] bg-background px-9 py-8">
        <p className="font-headline-lg text-[34px] leading-none font-light tracking-[-0.02em] text-on-surface">
          A Saturday, <em className="italic">slowly</em>{' '}
          <span className="text-fade">· 8 beats</span>
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className={cn(
                'flex h-8 items-center gap-2 rounded-full pr-3.5 pl-1 text-[13px] font-medium transition-all duration-500',
                chip.step === step
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-container text-on-surface-variant'
              )}
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-background text-on-surface [&_svg]:size-3.5">
                {chip.icon}
              </span>
              {chip.label}
              {chip.done && <CheckIcon weight="bold" className="size-3.5" />}
            </span>
          ))}
        </div>

        <div className="mt-7 grid w-[640px] grid-cols-3 gap-x-3 gap-y-5">
          {BEATS.map(([id, text], i) => (
            <figure key={id}>
              <div className="aspect-[4/3] overflow-hidden rounded-xl bg-surface-container">
                <img src={pexels(id)} alt="" className="size-full object-cover" loading="lazy" />
              </div>
              <figcaption className="mt-2 flex gap-2 text-[12px] leading-snug text-on-surface">
                <span className="text-outline tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                {text}
              </figcaption>
            </figure>
          ))}
        </div>

        <StepCallout
          step={step}
          providerLabel={providerLabel}
          llmProvider={llmProvider}
          modelId={modelId}
          folder={folder}
        />
      </div>
    </div>
  )
}

/** The floating card: what the current step contributes to a run. */
function StepCallout({
  step,
  providerLabel,
  llmProvider,
  modelId,
  folder
}: {
  step: number
  providerLabel: string
  llmProvider: OnboardingPreviewProps['llmProvider']
  modelId: string
  folder: string
}): React.JSX.Element {
  const content: Record<number, { icon: React.ReactNode; title: string; body: string }> = {
    1: {
      icon: <ImagesIcon />,
      title: '24 shots for 8 beats',
      body: 'Found and saved in about a minute.'
    },
    2: {
      icon: <ProviderLogo provider={llmProvider} />,
      title: `${providerLabel} · ${modelId}`,
      body: 'Splits the script into beats and writes a search for each one.'
    },
    3: {
      icon: <ImagesIcon />,
      title: 'Pexels',
      body: '15 photos and 11 clips for “The dog decides the route”.'
    },
    4: { icon: <FolderIcon />, title: 'Saved to', body: folder },
    5: {
      icon: <CheckIcon weight="bold" />,
      title: 'Ready for your first pack',
      body: 'Paste a script and press Find footage.'
    }
  }
  const { icon, title, body } = content[step] ?? content[1]

  return (
    <div
      key={step}
      className="animate-fade-in-up absolute bottom-[30%] left-56 w-72 rounded-2xl border border-edge bg-popover p-4 shadow-lg"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-container text-on-surface [&_svg]:size-5">
          {icon}
        </span>
        <span className="min-w-0 truncate text-sm font-semibold text-on-surface">{title}</span>
      </div>
      <p
        className={cn(
          'mt-2.5 text-[13px] leading-snug text-outline',
          step === 4 && 'truncate font-mono'
        )}
      >
        {body}
      </p>
    </div>
  )
}
