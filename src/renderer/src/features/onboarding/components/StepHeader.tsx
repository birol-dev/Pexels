interface StepHeaderProps {
  title: React.ReactNode
  description: string
}

export function StepHeader({ title, description }: StepHeaderProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-headline-lg text-[40px] leading-[1.05] font-light tracking-[-0.025em] text-on-surface [&_em]:italic">
        {title}
      </h1>
      <p className="text-body-md text-outline">{description}</p>
    </div>
  )
}
