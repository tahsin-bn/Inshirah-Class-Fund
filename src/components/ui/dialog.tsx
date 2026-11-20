import { useState, type ReactNode } from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Field, Textarea } from './form';
import { useI18n } from '@/i18n/I18nProvider';

/**
 * Centered dialog on desktop, bottom sheet on phones.
 */
export function Dialog({
  open, onOpenChange, title, description, children, footer, size = 'md',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const { t } = useI18n();
  const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <D.Content
          className={cn(
            'fixed z-50 flex max-h-[92dvh] w-full flex-col bg-surface shadow-[var(--shadow-pop)] focus:outline-none',
            'inset-x-0 bottom-0 rounded-t-[18px] pb-[env(safe-area-inset-bottom)]',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:pb-0',
            'data-[state=open]:animate-[sheet-in_220ms_cubic-bezier(.2,.8,.2,1)] sm:data-[state=open]:animate-[pop-in_160ms_ease-out]',
            width,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-2 sm:px-6 sm:pt-5">
            <div>
              <D.Title className="text-[17px] font-semibold text-ink">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-[14px] text-ink-3">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === 'string' ? title : ''}</D.Description>
              )}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('close')}>
                <X />
              </Button>
            </D.Close>
          </div>
          <div className="overflow-y-auto px-5 py-3 sm:px-6">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3 sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/**
 * Confirmation for consequential actions. With `reasonLabel`, a reason is required and passed to onConfirm.
 */
export function ConfirmDialog({
  open, onOpenChange, title, body, confirmLabel, danger, reasonLabel, minReason = 5, onConfirm, loading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  reasonLabel?: string;
  minReason?: number;
  onConfirm: (reason: string) => void | Promise<void>;
  loading?: boolean;
}) {
  const { t, pick } = useI18n();
  const [reason, setReason] = useState('');
  const needReason = !!reasonLabel;
  const short = needReason && reason.trim().length < minReason;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason('');
        onOpenChange(o);
      }}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={loading}
            disabled={short}
            onClick={async () => {
              await onConfirm(reason.trim());
              setReason('');
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body && <div className="text-[14px] text-ink-2">{body}</div>}
      {needReason && (
        <Field
          label={reasonLabel}
          className="mt-4"
          hint={pick(`At least ${minReason} characters. Saved in the audit log.`, `কমপক্ষে ${minReason} অক্ষর। অডিট লগে সংরক্ষিত হবে।`)}
        >
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={300} />
        </Field>
      )}
    </Dialog>
  );
}
