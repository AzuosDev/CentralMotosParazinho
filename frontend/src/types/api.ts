export type ApiId = string;
export type ApiDate = string;

export type MongoDocument = {
  _id: ApiId;
  createdAt?: ApiDate;
  updatedAt?: ApiDate;
  __v?: number;
};

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled';

export type User = MongoDocument & {
  email: string;
  emailVerified: boolean;
  name?: string;
  avatarUrl?: string;
  gravatarUrl?: string;
  // Subscription
  subscriptionStatus?: SubscriptionStatus | null;
  plan?: string | null;
  trialEndsAt?: string | null;
  isLegacyFree?: boolean;
  subscriptionExpiresAt?: string | null;
  billingCycle?: string | null;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type TransactionType = "EXPENSE" | "INCOME" | "TRANSFER";
export type TipoTransacao = "entrada" | "saida" | "transferencia";

// Estado do limite após uma compra no cartão: 80%+ do limite sem estourar. Distinto do
// bloqueio (409 ConflictException) — presente só quando a compra foi aceita.
export type AvisoLimite = {
  limite: number;
  limiteUsado: number;
  limiteDisponivel: number;
  percentualUsado: number;
  excedeLimite: boolean;
  avisoProximoLimite: boolean;
} | null;

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
  // Presentes só em transações de cartão de crédito.
  faturaId?: ApiId;
  parcelamentoId?: ApiId;
  numeroParcela?: number;
  totalParcelas?: number;
  isEstorno?: boolean;
  // Presente só na transação de estorno, aponta pra compra original que ela reverte.
  estornoDeTransacaoId?: ApiId;
  // Anexado (não-persistido) pela API de criação quando a compra passou de 80% do limite.
  avisoLimite?: AvisoLimite;
};

export type WalletTipo = "conta" | "dinheiro" | "credito";

export type Wallet = MongoDocument & {
  userId: ApiId;
  nome: string;
  saldo: number;
  saldoInicial?: number;
  icone?: string;
  tipo?: WalletTipo | "VIRTUAL";
  // Campos abaixo só têm sentido quando tipo === 'credito'.
  limite?: number;
  diaFechamento?: number;
  diaVencimento?: number;
  carteiraPagamentoId?: ApiId;
  taxaJurosRotativo?: number;
  bandeira?: string;
  ultimosDigitos?: string;
  // Presente quando a carteira foi arquivada — some de listagens/seletores/soma de
  // patrimônio, mas o histórico de transações continua intacto.
  arquivadaEm?: ApiDate;
};

// Cartão de crédito: resposta de GET /api/cartoes e /api/cartoes/:id — Wallet(tipo=credito)
// enriquecida com os campos calculados pelo backend.
export type Cartao = Wallet & {
  limiteUsado: number;
  limiteDisponivel?: number;
  faturaAberta?: Fatura | null;
  faturas?: Fatura[];
};

export type FaturaStatus = "aberta" | "fechada" | "parcial" | "paga";

export type Fatura = MongoDocument & {
  userId: ApiId;
  carteiraId: ApiId;
  mesReferencia: string;
  dataInicio: ApiDate;
  dataFechamento: ApiDate;
  dataVencimento: ApiDate;
  valorTotal: number;
  valorPago: number;
  status: FaturaStatus;
  saldoRotativoAnterior: number;
  jurosAplicados: number;
  pendingAccountId?: ApiId;
  transacoes?: Transaction[];
};

export type Parcelamento = MongoDocument & {
  userId: ApiId;
  carteiraId: ApiId;
  categoryId?: ApiId;
  descricao: string;
  valorTotal: number;
  totalParcelas: number;
  dataCompra: ApiDate;
  transacoes: Transaction[];
  parcelasPagas: number;
  parcelasRestantes: number;
  valorRestante: number;
};

export type PreviewFatura = {
  mesReferencia: string;
  dataInicio: ApiDate;
  dataFechamento: ApiDate;
  dataVencimento: ApiDate;
  faturaId: ApiId | null;
};

/**
 * Carteira virtual injetada pelo backend quando uma transação/conta antiga não possui
 * carteiraId (dado anterior à feature de múltiplas carteiras). Não existe na coleção de
 * carteiras real. Use sempre com optional chaining (`item.carteira?.nome`).
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
  // Presente quando esta conta pendente É a fatura de um cartão — bloqueia o fluxo
  // genérico de "marcar como paga" (o backend rejeita); a UI deve levar ao detalhe do
  // cartão em vez de abrir o PayBillModal.
  faturaId?: ApiId;
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
