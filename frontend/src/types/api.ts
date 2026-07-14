export type ApiId = string;
export type ApiDate = string;

export type MongoDocument = {
  _id: ApiId;
  createdAt?: ApiDate;
  updatedAt?: ApiDate;
  __v?: number;
};

export type User = MongoDocument & {
  email: string;
  emailVerified: boolean;
  name?: string;
  avatarUrl?: string;
  gravatarUrl?: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type TransactionType = "EXPENSE" | "INCOME" | "TRANSFER";
export type TipoTransacao = "entrada" | "saida" | "transferencia";

export type Transaction = MongoDocument & {
  userId: ApiId;
  type: TransactionType;
  tipoTransacao?: TipoTransacao;
  value: number;
  categoryId?: ApiId;
  description?: string;
  date: ApiDate;
  carteiraId?: ApiId;
  carteiraDestinoId?: ApiId;
  agendado?: boolean;
  carteira?: VirtualWallet;
};

export type Wallet = MongoDocument & {
  userId: ApiId;
  nome: string;
  saldo: number;
  icone?: string;
  tipo?: "VIRTUAL";
};

/**
 * Carteira virtual injetada pelo backend quando uma transação/conta antiga não possui
 * carteiraId (dado anterior à feature de múltiplas carteiras). Não existe na coleção de
 * carteiras real — use sempre com optional chaining (`item.carteira?.nome`).
 */
export type VirtualWallet = {
  _id: "legacy-wallet";
  nome: string;
  tipo: "VIRTUAL";
};

export type TransactionsResponse = {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
};

export type Category = MongoDocument & {
  userId?: ApiId | null;
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  isDefault: boolean;
};

export type PendingAccount = MongoDocument & {
  /**
   * Indica se a conta é parcelada.
   * @default false
   */
  /**
   * Indica se a conta é parcelada.
   * @default false
   */
  isParcelada?: boolean;

  /**
   * Indica se a conta é recorrente.
   * @default false
   */
  isRecorrente?: boolean;

  /**
   * Categoria da conta.
   * @default 'Outro'
   */
  categoria?: 'Alimentação' | 'Transporte' | 'Saúde' | 'Educação' | 'Lazer' | 'Outro';

  /**
   * Forma de pagamento.
   * @default 'Outro'
   */
  formatoPagamento?: 'Cartão de Crédito' | 'Pix' | 'Dinheiro' | 'Outro';

  /**
   * Indica se a conta é a pagar (despesa) ou a receber (receita).
   * @default 'PAGAR'
   */
  tipo?: 'PAGAR' | 'RECEBER';

  /**
   * Sub‑documento de parcelas – presente somente se isParcelada = true.
   */
  parcelas?: {
    totalParcelas: number;
    valorParcela: number;
    qtdParcelasPagas?: number;
    parcelasPagas?: number[];
    dataInicio: string; // ISO date
    dataFim: string;    // ISO date
  };
  numeroParcela?: number;
  grupoParceladoId?: string;

  /**
   * Sub‑documento de recorrência – presente somente se isRecorrente = true.
   */
  recorrencia?: {
    periodoRecorrencia: 'Diário' | 'Semanal' | 'Mensal' | 'Anual';
    dataProxima: string; // ISO date
  };

  userId: ApiId;
  title: string;
  value: number;
  dueDate: ApiDate;
  paid: boolean;
  paidAt?: ApiDate;
  description?: string;
  carteiraId?: ApiId;
  carteira?: VirtualWallet;
};

export type Goal = MongoDocument & {
  userId: ApiId;
  name: string;
  targetValue: number;
  currentValue: number;
  deadline?: ApiDate;
  completed: boolean;
  percentComplete?: number;
  linkedCategoryId?: ApiId | null;
};

export type DashboardExpenseByCategory = {
  categoryId: ApiId;
  categoryName: string;
  categoryColor?: string;
  categoryIcon?: string;
  total: number;
};

export type DashboardMonthlyEvolution = {
  month: number;
  income: number;
  expenses: number;
};

export type DashboardResponse = {
  month: number;
  year: number;
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  savingsRate: number;
  expensesByCategory: DashboardExpenseByCategory[];
  monthlyEvolution: DashboardMonthlyEvolution[];
  pendingAccounts: {
    items: PendingAccount[];
    totalPending: number;
  };
  goalsSummary: Goal[];
};

export type ApiValidationError = {
  statusCode?: number;
  error?: string;
  message?: string | string[];
};
