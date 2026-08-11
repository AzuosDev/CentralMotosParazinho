import { ArrowLeftRight, Calendar, Edit2, Trash2 } from "lucide-react";

import { cn } from "../lib/utils";
import { formatDisplayDate } from "../lib/finance";
import type { Transaction } from "../types/finance";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function fmtDate(iso: string) {
  return !iso ? "--/--/--" : formatDisplayDate(iso);
}

export function TxRow({
  tx,
  onEdit,
  onDelete,
  selected,
  onToggleSelect,
  walletId,
}: {
  tx: Transaction;
  onEdit?: (tx: Transaction) => void;
  onDelete?: (tx: Transaction) => void;
  selected?: boolean;
  onToggleSelect?: (tx: Transaction) => void;
  walletId?: string;
}) {
  // Só pode ser selecionada em lote a transação que o backend marcou como "sem
  // carteira real" (carteira virtual injetada em transactions.service.ts/findAll).
  // Selecionar uma transação que já tem carteiraId tomaria 400 no bulk-wallet.
  const isLegacy = tx.carteira?._id === "legacy-wallet";
  const showSelect = Boolean(onToggleSelect) && isLegacy;
  const isTransfer = tx.type === "TRANSFER" || Boolean(tx.carteiraDestinoId);
  const isIncome = tx.type === "INCOME";
  // Transferências: positivo apenas quando esta carteira é o DESTINO.
  // Sem contexto de carteira (lista geral) mantém o "+" histórico.
  const isIncomingTransfer =
    isTransfer && walletId
      ? tx.carteiraDestinoId === walletId
      : isTransfer;
  const label =
    tx.description ||
    (isIncome ? "Entrada" : isTransfer ? "Transferência" : "Saída");
  const amountCls = tx.agendado
    ? "text-text-muted"
    : isIncome
      ? "text-accent-lime"
      : isIncomingTransfer
        ? "text-blue-400"
        : "text-accent-red";
  const sign = isIncome || isIncomingTransfer ? "+" : "–";

  return (
    // Mobile (abaixo de sm): coluna — descrição em cima, valor+ações embaixo,
    // alinhados nas pontas. A partir de sm: volta a ser uma única linha, como antes.
    <div className="group flex flex-col gap-2 border-b border-bg-muted py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {showSelect && (
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => onToggleSelect?.(tx)}
            className="h-4 w-4 shrink-0 cursor-pointer rounded border-bg-muted bg-bg-muted accent-accent-lime"
            aria-label="Selecionar transação para associar a uma carteira"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isTransfer && (
              <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-blue-400" />
            )}
            <p className="truncate text-sm font-semibold">{label}</p>
            {tx.agendado && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-blue-400">
                <Calendar className="h-3 w-3" />
                Agendado
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary">{fmtDate(tx.date)}</p>
        </div>
      </div>

      <div className={cn("flex shrink-0 items-center justify-between gap-3", showSelect && "pl-7 sm:pl-0")}>
        <span className={cn("shrink-0 font-bold tabular-nums", amountCls)}>
          {sign}
          {brl.format(tx.amount)}
        </span>

        {(onEdit || onDelete) && (
          <div className="flex shrink-0 items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(tx)}
                className="grid h-8 w-8 place-items-center rounded-lg text-text-secondary hover:bg-bg-overlay hover:text-white"
                aria-label="Editar transação"
              >
                <Edit2 className="h-4 w-4" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(tx)}
                className="grid h-8 w-8 place-items-center rounded-lg text-text-secondary hover:bg-bg-overlay hover:text-accent-red"
                aria-label="Excluir transação"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
