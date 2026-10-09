import { Link } from "react-router-dom";
import { ArrowLeftRight, Bike, Calendar, Edit2, Lock, Trash2 } from "lucide-react";

import { useMotos } from "./motos/useMotos";
import { cn } from "../lib/utils";
import { formatDisplayDate } from "../lib/finance";
import type { Transaction } from "../types/finance";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function fmtDate(iso: string) {
  return !iso ? "--/--/--" : formatDisplayDate(iso);
}

/**
 * Qual moto este gasto encareceu. Fica num componente próprio porque só é montado quando
 * a transação tem vínculo: a lista de motos (cache ["motos"], compartilhado com o
 * formulário e com o filtro) não é buscada em telas onde nenhuma linha tem moto.
 *
 * Enquanto carrega — ou se a moto não vier na lista — não mostra nada: um badge "Moto"
 * sem nome não diz mais do que a ausência dele.
 */
function MotoBadge({ motoId }: { motoId: string }) {
  const { data } = useMotos();
  const moto = (data ?? []).find((item) => item._id === motoId);

  if (!moto) return null;

  return (
    <Link
      to={`/motos/${moto._id}`}
      className="flex min-w-0 items-center gap-1 rounded-pill bg-accent-brand/10 px-2 py-0.5 text-xs font-semibold text-accent-brand transition hover:bg-accent-brand/20"
      title={`Ver ficha de ${moto.modelo} · ${moto.placa}`}
    >
      <Bike className="h-3 w-3 shrink-0" />
      <span className="truncate">
        {moto.modelo} · {moto.placa}
      </span>
    </Link>
  );
}

export function TxRow({
  tx,
  onEdit,
  onDelete,
  selected,
  onToggleSelect,
  walletId,
  showMotoBadge = true,
}: {
  tx: Transaction;
  onEdit?: (tx: Transaction) => void;
  onDelete?: (tx: Transaction) => void;
  selected?: boolean;
  onToggleSelect?: (tx: Transaction) => void;
  walletId?: string;
  /** Desligado na ficha da moto, onde toda linha é da mesma moto e o badge é ruído. */
  showMotoBadge?: boolean;
}) {
  // Só pode ser selecionada em lote a transação que o backend marcou como "sem
  // carteira real" (carteira virtual injetada em transactions.service.ts/findAll).
  // Selecionar uma transação que já tem carteiraId tomaria 400 no bulk-wallet.
  const isLegacy = tx.carteira?._id === "legacy-wallet";
  const showSelect = Boolean(onToggleSelect) && isLegacy;
  // Compra e venda geradas pela ficha da moto: o backend recusa editar e excluir por aqui
  // (ficha e extrato têm que contar a mesma história), então a linha não oferece as ações
  // e explica para onde ir.
  const daFichaDaMoto = tx.origem === "venda_moto" || tx.origem === "compra_moto";
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
      ? "text-semantic-income"
      : isIncomingTransfer
        ? "text-status-info"
        : "text-accent-red";
  const sign = isIncome || isIncomingTransfer ? "+" : "–";

  return (
    // Mobile (abaixo de sm): coluna, descrição em cima, valor+ações embaixo,
    // alinhados nas pontas. A partir de sm: volta a ser uma única linha, como antes.
    <div className="group flex flex-col gap-2 border-b border-bg-muted py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {showSelect && (
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => onToggleSelect?.(tx)}
            className="h-4 w-4 shrink-0 cursor-pointer rounded border-bg-muted bg-bg-muted accent-accent-brand"
            aria-label="Selecionar transação para associar a uma carteira"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isTransfer && (
              <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-status-info" />
            )}
            <p className="truncate text-sm font-semibold">{label}</p>
            {tx.agendado && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-status-info/15 px-2 py-0.5 text-xs font-semibold text-status-info">
                <Calendar className="h-3 w-3" />
                Agendado
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-xs text-text-secondary">{fmtDate(tx.date)}</p>
            {showMotoBadge && tx.motoId && <MotoBadge motoId={tx.motoId} />}
            {daFichaDaMoto && (
              <span
                className="flex shrink-0 items-center gap-1 rounded-pill bg-bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary"
                title="Lançamento criado pela ficha da moto: edite ou remova pela ficha."
              >
                <Lock className="h-3 w-3" />
                {tx.origem === "venda_moto" ? "Venda da moto" : "Compra da moto"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className={cn("flex shrink-0 items-center justify-between gap-3", showSelect && "pl-7 sm:pl-0")}>
        <span className={cn("shrink-0 font-bold tabular-nums", amountCls)}>
          {sign}
          {brl.format(tx.amount)}
        </span>

        {/* Na própria ficha (showMotoBadge desligado) o aviso não faz sentido: os botões
            de venda e de edição da moto estão logo acima, na mesma tela. */}
        {daFichaDaMoto && showMotoBadge && (onEdit || onDelete) && (
          <p className="shrink-0 text-xs text-text-muted sm:max-w-[11rem] sm:text-right">
            Edite pela ficha da moto
          </p>
        )}

        {!daFichaDaMoto && (onEdit || onDelete) && (
          <div className="flex shrink-0 items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(tx)}
                className="grid h-8 w-8 place-items-center rounded-lg text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
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
