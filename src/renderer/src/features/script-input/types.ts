import type { InputFormState } from '@renderer/lib/store'

export interface FormSectionProps {
  form: InputFormState
  update: (patch: Partial<InputFormState>) => void
}
