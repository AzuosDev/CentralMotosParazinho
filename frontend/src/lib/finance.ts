import type {
  Category,
  CategoryExpense,
  Transaction,
  TransactionType,
  VirtualWallet,
} from "../types/finance";
import { CATEGORY_NEUTRAL, INCOME_HEX } from "./colors";

export const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatCurrency(value: number) {
  return brlFormatter.format(value);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function readNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value.replace(",", "."));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

export function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
}

export function normalizeCategory(value: unknown, fallbackIndex = 0): Category {
  const item = asRecord(value);

  return {
    id:
      readString(item.id, item._id, item.categoryId) ||
      `category-${fallbackIndex}`,
    name: readString(item.name, item.categoryName, item.label) || "Categoria",
    color: readString(item.color, item.categoryColor) || CATEGORY_NEUTRAL,
    icon: readString(item.icon, item.iconName, item.categoryIcon) || "Receipt",
    isDefault: item.isDefault === true,
  };
}

export function normalizeTransaction(
  value: unknown,
  fallbackIndex = 0,
): Transaction {
  const item = asRecord(value);
  const nestedCategory = asRecord(item.category);
  const type = readString(item.type, item.transactionType).toUpperCase();
  const category =
    Object.keys(nestedCategory).length > 0
      ? normalizeCategory(nestedCategory, fallbackIndex)
      : undefined;
  const nestedCarteira = asRecord(item.carteira);
  const carteira: VirtualWallet | undefined =
    nestedCarteira._id === "legacy-wallet"
      ? {
          _id: "legacy-wallet",
          nome: readString(nestedCarteira.nome) || "Saldo Histórico (Sem Carteira)",
          tipo: "VIRTUAL",
        }
      : undefined;

  return {
    id: readString(item.id, item._id) || `transaction-${fallbackIndex}`,
    type: type === "INCOME" ? "INCOME" : type === "TRANSFER" ? "TRANSFER" : "EXPENSE",
    amount: readNumber(item.amount, item.value, item.total),
    date:
      readString(item.date, item.createdAt, item.paidAt, item.dueDate) ||
      new Date().toISOString(),
    description: readString(item.description, item.notes),
    categoryId: readString(
      item.categoryId,
      nestedCategory.id,
      nestedCategory._id,
    ),
    carteiraId: readString(item.carteiraId) || undefined,
    carteiraDestinoId: readString(item.carteiraDestinoId) || undefined,
    motoId: readString(item.motoId) || undefined,
    agendado: Boolean(item.agendado),
    carteira,
    faturaId: readString(item.faturaId) || undefined,
    numeroParcela: typeof item.numeroParcela === "number" ? item.numeroParcela : undefined,
    totalParcelas: typeof item.totalParcelas === "number" ? item.totalParcelas : undefined,
    isEstorno: Boolean(item.isEstorno),
    category:
      category ??
      (type === "INCOME"
        ? {
            id: "income",
            name: "Ganho",
            color: INCOME_HEX,
            icon: "TrendingUp",
          }
        : undefined),
  };
}

export function normalizeTransactionsResponse(data: unknown) {
  const record = asRecord(data);
  const source =
    record.items ??
    record.data ??
    record.transactions ??
    record.results ??
    data;

  const total = readNumber(record.total);
  const page = readNumber(record.page);
  const limit = readNumber(record.limit);

  return {
    transactions: asArray(source).map(normalizeTransaction),
    hasMore:
      Boolean(record.hasMore ?? record.nextPage ?? record.nextCursor) ||
      (total > 0 && page > 0 && limit > 0 && page * limit < total),
  };
}

export function normalizeExpenseCategory(
  value: unknown,
  fallbackIndex = 0,
): CategoryExpense {
  const item = asRecord(value);
  const nestedCategory = asRecord(item.category);
  const category = normalizeCategory(
    Object.keys(nestedCategory).length > 0 ? nestedCategory : item,
    fallbackIndex,
  );
  const amount = readNumber(
    item.amount,
    item.total,
    item.value,
    item.currentAmount,
  );
  const previousAmount = readNumber(
    item.previousAmount,
    item.previousTotal,
    item.previousValue,
  );
  const variation =
    "variation" in item || "changePercent" in item
      ? readNumber(item.variation, item.changePercent)
      : previousAmount > 0
        ? ((amount - previousAmount) / previousAmount) * 100
        : 0;

  return {
    ...category,
    amount,
    previousAmount,
    variation,
  };
}

export function isPastMonth(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() < now.getFullYear() ||
    (d.getFullYear() === now.getFullYear() && d.getMonth() < now.getMonth())
  );
}

// Returns today's date as YYYY-MM-DD using the user's LOCAL calendar day,
// not UTC. Avoids showing "yesterday" for users in UTC-3 after midnight.
export function localDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Formats a date stored as UTC midnight (the format we persist) for pt-BR display.
// Always renders in UTC so the calendar day never shifts due to timezone offset.
export function formatDisplayDate(
  value: string,
  opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" },
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--/--/----";
  return new Intl.DateTimeFormat("pt-BR", { ...opts, timeZone: "UTC" }).format(date);
}

// Extracts YYYY-MM-DD from a UTC-midnight ISO string without timezone conversion.
export function utcDateStr(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function dateInputValue(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return localDateString();
  }

  return date.toISOString().slice(0, 10);
}

/**
 * Converte o valor retornado por um <input type="number"> em número.
 * O browser sempre usa "." como separador decimal em e.target.value,
 * mas aceitamos "," também (locales pt-BR) por segurança.
 */
export function parseCurrencyInput(raw: string | number): number {
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function buildTransactionPayload(values: {
  amount: number;
  date: string;
  description?: string;
  categoryId?: string;
  type: TransactionType;
}) {
  return {
    type: values.type,
    value: values.amount,
    date: values.date,
    description: values.description?.trim() || undefined,
    categoryId: values.categoryId || undefined,
  };
}

/** Eixo Y dos gráficos: 12500 vira "12,5K" para não comer a largura útil. */
export function formatCompactValue(value: number) {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })}K`;
  }

  return value.toLocaleString("pt-BR");
}
