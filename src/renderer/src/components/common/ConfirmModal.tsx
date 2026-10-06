import React from 'react'
import { InfoIcon, QuestionIcon } from '@phosphor-icons/react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useAppStore } from '@renderer/lib/store'

/** Renders the store-driven `alert()` / `confirm()` promises as a shadcn AlertDialog. */
export function ConfirmModal(): React.JSX.Element {
  const modal = useAppStore((s) => s.modal)
  const closeModal = useAppStore((s) => s.closeModal)
  const Icon = modal.isConfirm ? QuestionIcon : InfoIcon

  return (
    <AlertDialog open={modal.isOpen} onOpenChange={(open) => !open && closeModal(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex size-8 items-center justify-center rounded-lg border',
                modal.isConfirm
                  ? 'border-primary/20 bg-primary/10 text-primary'
                  : 'border-tertiary/20 bg-tertiary/10 text-tertiary'
              )}
            >
              <Icon size={20} weight="bold" />
            </div>
            <AlertDialogTitle>{modal.title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-xs font-semibold leading-relaxed">
            {modal.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {modal.isConfirm && (
            <Button variant="secondary" size="sm" onClick={() => closeModal(false)}>
              {modal.cancelText}
            </Button>
          )}
          <Button size="sm" onClick={() => closeModal(true)}>
            {modal.confirmText}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
