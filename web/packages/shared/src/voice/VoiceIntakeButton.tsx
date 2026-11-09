import { useState } from 'react';
import { Mic } from 'lucide-react';
import { Button, type ButtonProps } from '../ui/Button';
import { Modal } from '../ui/overlay';
import { useVoiceText } from './i18n';
import { VoiceIntakeFlow, type VoiceIntakeFlowProps } from './VoiceIntakeFlow';
import type { ConfirmedIntake } from './types';

export interface VoiceIntakeButtonProps extends Omit<VoiceIntakeFlowProps, 'onCancel' | 'className'> {
  /** button label (default "Describe it by voice") */
  label?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}

/** "Describe it by voice" button that opens the VoiceIntakeFlow in a dialog and closes it after confirmation. */
export function VoiceIntakeButton({ label, variant = 'outline', size = 'md', className, onConfirmed, ...flowProps }: VoiceIntakeButtonProps) {
  const { t } = useVoiceText();
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        leftIcon={<Mic className="size-4" aria-hidden />}
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
      >
        {label ?? t('describeByVoice')}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('flowTitle')} size="lg" closeOnOverlayClick={false}>
        <VoiceIntakeFlow
          key={round}
          {...flowProps}
          onCancel={() => setOpen(false)}
          onConfirmed={(result: ConfirmedIntake) => {
            onConfirmed(result);
            setOpen(false);
          }}
        />
      </Modal>
    </>
  );
}
