import { Archive, Loader2 } from "lucide-react";
import { ModalShell } from "./ModalShell";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  cartaoNome: string;
  isLoading?: boolean;
};

export function ArchiveCartaoModal({ isOpen, onClose, onConfirm, cartaoNome, isLoading }: Props) {
  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      title="Arquivar cartão"
      icon={<Archive className="h-6 w-6 text-accent-yellow" />}
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
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-yellow px-5 py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            Arquivar Cartão
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-text-secondary">
        <p>
          Arquivar <span className="font-semibold text-text-primary">"{cartaoNome}"</span> tira o cartão da lista e dos
          seletores de forma de pagamento — mas, diferente de excluir, <span className="font-semibold text-text-primary">nenhum
          dado é apagado</span>: faturas e compras já feitas continuam aparecendo normalmente nos relatórios de meses
          passados.
        </p>
        <p>
          Só é possível arquivar um cartão sem fatura em aberto/não paga e sem parcelas futuras pendentes.
        </p>
      </div>
    </ModalShell>
  );
}
