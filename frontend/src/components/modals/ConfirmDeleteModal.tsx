import { AlertTriangle } from 'lucide-react';
import { ModalShell } from './ModalShell';

interface ConfirmDeleteModalProps {
  open: boolean;
  onClose: () => void;
  onDeleteOne: () => void;
  onDeleteGroup?: () => void;
  onDeleteMonth?: () => void;
  onDeletePermanent?: () => void;
  accountName: string;
  isParcel?: boolean;
  parcelLabel?: string;
  isRecorrente?: boolean;
}

const btnCancel =
  'flex-1 rounded-xl border border-bg-muted bg-transparent px-5 py-3 text-sm font-bold text-text-primary transition hover:bg-bg-overlay disabled:cursor-not-allowed disabled:opacity-70';
const btnDestructiveFilled =
  'flex-1 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:brightness-110';
const btnDestructiveOutline =
  'flex-1 rounded-xl border border-red-600/40 px-5 py-3 text-sm font-bold text-accent-red transition hover:bg-accent-red/10';

export function ConfirmDeleteModal({
  open,
  onClose,
  onDeleteOne,
  onDeleteGroup,
  onDeleteMonth,
  onDeletePermanent,
  accountName,
  isParcel,
  parcelLabel,
  isRecorrente,
}: ConfirmDeleteModalProps) {
  const title = isRecorrente
    ? 'Excluir conta recorrente'
    : isParcel
      ? `Excluir ${parcelLabel ?? 'parcela'}`
      : 'Excluir conta';

  return (
    <ModalShell
      open={open}
      title={title}
      icon={<AlertTriangle className="h-6 w-6 text-accent-red" />}
      onClose={onClose}
      footer={
        isRecorrente ? (
          <div className="flex flex-col gap-3">
            <button type="button" onClick={onClose} className={btnCancel}>
              Cancelar
            </button>
            <button type="button" onClick={onDeleteMonth} className={btnDestructiveFilled}>
              Excluir apenas este mês
            </button>
            <button type="button" onClick={onDeletePermanent} className={btnDestructiveOutline}>
              Excluir permanentemente (todos os meses)
            </button>
          </div>
        ) : isParcel ? (
          <div className="flex flex-col gap-3">
            <button type="button" onClick={onClose} className={btnCancel}>
              Cancelar
            </button>
            <button type="button" onClick={onDeleteOne} className={btnDestructiveFilled}>
              Deletar apenas esta parcela
            </button>
            <button type="button" onClick={onDeleteGroup} className={btnDestructiveOutline}>
              Deletar conta inteira
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className={btnCancel}>
              Cancelar
            </button>
            <button type="button" onClick={onDeleteOne} className={btnDestructiveFilled}>
              Confirmar Exclusão
            </button>
          </div>
        )
      }
    >
      <p className="text-sm text-text-secondary">
        Deseja apagar a conta{' '}
        <span className="font-semibold text-text-primary">"{accountName}"</span>? Esta ação não pode ser desfeita.
      </p>
    </ModalShell>
  );
}
