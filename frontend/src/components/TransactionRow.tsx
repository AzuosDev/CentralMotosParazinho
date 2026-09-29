import { memo } from "react";
import { Calendar, Edit2, Trash2 } from "lucide-react";

import { formatCurrency, formatDisplayDate } from "../lib/finance";
import { cn } from "../lib/utils";
import type { Transaction, Category } from "../types/finance";
import { DynamicIcon } from "./DynamicIcon";


export const TransactionRow = memo(function TransactionRow({
  transaction,
  onEdit,
  onDelete,
  categoriesMap,
}: {
  transaction: Transaction;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  categoriesMap?: Map<string, Category>;
}) {
  const resolvedCategory =
    transaction.category ??
    (transaction.categoryId ? categoriesMap?.get(transaction.categoryId) : undefined);

  const category = resolvedCategory ?? {
    id: "uncategorized",
    name: transaction.type === "INCOME" ? "Ganho" : "Despesa",
    color: transaction.type === "INCOME" ? "#A3E635" : "#6B7280",
    icon: transaction.type === "INCOME" ? "TrendingUp" : "Receipt",
  };
  const isIncome = transaction.type === "INCOME";

  return (
    <div className="group flex items-center gap-3 border-b border-bg-muted py-3">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: `${category.color}22` }}
      >
        <DynamicIcon
          name={category.icon}
          className="h-5 w-5"
          style={{ color: category.color }}
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-text-primary">{category.name}</p>
          {transaction.agendado && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-status-info">
              <Calendar className="h-3 w-3" />
              Agendado
            </span>
          )}
        </div>
        {transaction.description && (
          <p className="truncate text-xs text-text-secondary">{transaction.description}</p>
        )}
        <p className="text-xs text-text-muted">{formatDisplayDate(transaction.date)}</p>
      </div>

      <strong
        className={cn(
          "shrink-0 text-sm font-semibold",
          isIncome ? "text-accent-lime" : "text-accent-red",
        )}
      >
        {isIncome ? "+" : "-"}
        {formatCurrency(transaction.amount)}
      </strong>

      <div className="flex shrink-0 items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <button
          type="button"
          onClick={() => onEdit(transaction)}
          className="grid h-8 w-8 place-items-center rounded-lg text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
          aria-label="Editar transação"
        >
          <Edit2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(transaction)}
          className="grid h-8 w-8 place-items-center rounded-lg text-text-secondary hover:bg-bg-overlay hover:text-accent-red"
          aria-label="Excluir transação"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});
