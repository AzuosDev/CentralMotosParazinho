import { AlertTriangle, Loader2 } from "lucide-react";
import { ModalShell } from "./ModalShell";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  walletName: string;
  isLoading?: boolean;
};

export function DeleteWalletModal({ isOpen, onClose, onConfirm, walletName, isLoading }: Props) {
  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      title="Excluir carteira"
      icon={<AlertTriangle className="h-6 w-6 text-accent-red" />}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-xl border border-bg-muted bg-transparent px-5 py-3 text-sm font-bold text-text-primary transition hover:bg-bg-overlay disabled:cursor-not-allowed disabled:opacity-70"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-red px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-red-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            Excluir Carteira
          </button>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">
        Tem certeza que deseja excluir a carteira{" "}
        <span className="font-semibold text-text-primary">"{walletName}"</span>? Esta ação não poderá ser desfeita.
        Carteiras com histórico de transações não podem ser apagadas.
      </p>
    </ModalShell>
  );
}
