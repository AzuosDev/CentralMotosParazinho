export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";

/**
 * Carteira virtual injetada pelo backend quando a transação não tem carteiraId
 * (dado anterior à feature de múltiplas carteiras). Não existe na coleção real.
 */
export type VirtualWallet = {
  _id: "legacy-wallet";
  nome: string;
  tipo: "VIRTUAL";
};

export type Category = {
  id: string;
  name: string;
  color: string;
  icon?: string;
  isDefault?: boolean;
  /** Usado para achar categoria de sistema por slug (ex: "venda-de-moto"). */
  slug?: string;
};

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  date: string;
  description?: string;
  categoryId?: string;
  category?: Category;
  carteiraId?: string;
  carteiraDestinoId?: string;
  agendado?: boolean;
  carteira?: VirtualWallet;
  motoId?: string;
  /** "compra_moto"/"venda_moto": lançamento gerado pela ficha da moto, não editável aqui. */
  origem?: string;
  // Presentes só em transações de cartão de crédito.
  faturaId?: string;
  numeroParcela?: number;
  totalParcelas?: number;
  isEstorno?: boolean;
};

export type CategoryExpense = Category & {
  amount: number;
  previousAmount: number;
  variation: number;
};

