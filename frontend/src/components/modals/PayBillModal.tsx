import { useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { formatCurrency } from "../../lib/finance";
import { useWallets } from "./TransactionFormFields";
import { ModalShell } from "./ModalShell";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  value: number;
  defaultCarteiraId?: string;
  isPending: boolean;
  onConfirm: (carteiraId: string | undefined) => void;
  tipo?: "PAGAR" | "RECEBER";
};

export function PayBillModal({ open, onClose, title, value, defaultCarteiraId, isPending, onConfirm, tipo = "PAGAR" }: Props) {
  const walletsQuery = useWallets();
  const [selectedId, setSelectedId] = useState(defaultCarteiraId ?? "");
  const isReceber = tipo === "RECEBER";

  useEffect(() => {
    if (open) setSelectedId(defaultCarteiraId ?? "");
  }, [open, defaultCarteiraId]);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={isReceber ? "Confirmar Recebimento" : "Confirmar Pagamento"}
      icon={<Wallet className="h-6 w-6 text-accent-brand" />}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-xl border border-bg-muted bg-transparent px-5 py-3 text-sm font-bold text-text-primary transition hover:bg-bg-overlay disabled:cursor-not-allowed disabled:opacity-70"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedId || undefined)}
            disabled={isPending || !selectedId}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isReceber ? "Confirmar Recebimento" : "Confirmar Pagamento"}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="truncate text-sm text-text-secondary">{title}</p>
          <p className="mt-1 font-sans text-3xl font-extrabold text-accent-brand">{formatCurrency(value)}</p>
        </div>

        <div>
          <p className="mb-3 text-sm text-text-secondary">
            {isReceber ? "Creditar na carteira" : "Debitar da carteira"} <span className="text-accent-red">*</span>
          </p>
          {walletsQuery.isLoading ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-9 w-24 animate-pulse rounded-xl bg-bg-muted" />
              ))}
            </div>
          ) : walletsQuery.data?.length === 0 ? (
            <p className="text-sm text-text-muted">Nenhuma carteira cadastrada.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(walletsQuery.data ?? []).map((w) => (
                <button
                  key={w._id}
                  type="button"
                  onClick={() => setSelectedId(w._id)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    selectedId === w._id
                      ? "border-accent-brand bg-accent-brand/10 text-text-primary"
                      : "border-bg-muted text-text-secondary hover:border-bg-overlay hover:text-text-primary"
                  }`}
                >
                  {w.nome}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
