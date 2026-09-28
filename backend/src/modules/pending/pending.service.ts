import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PendingAccount, PendingAccountDocument } from './schemas/pending-account.schema';
import { Transaction, TransactionDocument, TransactionType } from '../transactions/schemas/transaction.schema';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { Wallet, WalletDocument } from '../wallets/schemas/wallet.schema';
import { CartoesService } from '../cartoes/cartoes.service';
import { CreatePendingDto } from './dto/create-pending.dto';
import { UpdatePendingDto } from './dto/update-pending.dto';

@Injectable()
export class PendingService {
  private readonly logger = new Logger(PendingService.name);

  constructor(
    @InjectModel(PendingAccount.name) private pendingModel: Model<PendingAccountDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    private cartoesService: CartoesService,
  ) {}

  private static readonly CATEGORY_KEYWORDS: Record<string, string[]> = {
    'Transporte': [
      'moto', 'carro', 'bike', 'bicicleta', 'ônibus', 'onibus', 'taxi', 'táxi',
      'uber', '99', 'cabify', 'combustível', 'combustivel', 'gasolina', 'etanol',
      'diesel', 'pedágio', 'pedagio', 'estacionamento', 'bros', 'fan', 'cg',
      'honda', 'yamaha', 'kawasaki', 'suzuki', 'ducati', 'bmw', 'ford', 'gol',
      'civic', 'corolla', 'fiat', 'volkswagen', 'chevrolet', 'hyundai', 'renault',
      'metrô', 'metro', 'trem', 'ônibus', 'viação', 'viacão', 'transporte', 'veículo',
    ],
    'Alimentação': [
      'restaurante', 'lanche', 'mercado', 'supermercado', 'pizza', 'hamburguer',
      'hambúrguer', 'açaí', 'acai', 'refeição', 'refeicao', 'almoço', 'almoco',
      'jantar', 'café', 'cafe', 'padaria', 'ifood', 'rappi', 'delivery', 'comida',
      'feira', 'hortifruti', 'churrasco', 'sushi', 'lanchonete', 'mcdonald',
      'burger king', 'subway', 'habib', 'china', 'japonês', 'japonesa', 'bar',
    ],
    'Saúde': [
      'médico', 'medico', 'farmácia', 'farmacia', 'remédio', 'remedio', 'consulta',
      'dentista', 'hospital', 'plano', 'unimed', 'amil', 'bradesco saude', 'academia',
      'clínica', 'clinica', 'exame', 'laboratorio', 'laboratório', 'cirurgia',
      'fisioterapia', 'psicólogo', 'psicologo', 'psiquiatra', 'terapia', 'saúde',
      'saude', 'vacina', 'drogaria', 'drogasil', 'ultrafarma',
    ],
    'Educação': [
      'escola', 'faculdade', 'curso', 'livro', 'material', 'mensalidade',
      'universidade', 'colégio', 'colegio', 'aula', 'apostila', 'udemy', 'alura',
      'estudo', 'educação', 'educacao', 'senai', 'senac', 'idioma', 'inglês', 'ingles',
      'espanhol', 'vestibular', 'concurso', 'pós', 'pos', 'mba', 'graduação',
    ],
    'Lazer': [
      'cinema', 'show', 'festa', 'viagem', 'hotel', 'streaming', 'netflix', 'spotify',
      'amazon prime', 'disney', 'hbo', 'jogo', 'game', 'esporte', 'teatro', 'museu',
      'parque', 'steam', 'playstation', 'xbox', 'nintendo', 'ingresso', 'balada',
      'clube', 'piscina', 'praia', 'viagem', 'hospedagem', 'airbnb', 'booking',
    ],
  };

  private resolveCategory(categoriaText: string): string | null {
    const lower = categoriaText.toLowerCase().trim();
    for (const [category, keywords] of Object.entries(PendingService.CATEGORY_KEYWORDS)) {
      if (keywords.some((kw) => lower.includes(kw) || kw.includes(lower))) {
        return category;
      }
    }
    return null;
  }

  private addMonths(date: Date, months: number) {
    const nextDate = new Date(date);
    nextDate.setMonth(nextDate.getMonth() + months);
    return nextDate;
  }

  private isRetroactive(date: Date): boolean {
    const now = new Date();
    // Usa UTC para ser consistente com datas ISO (UTC midnight) vindas do DTO.
    return (
      date.getUTCFullYear() < now.getUTCFullYear() ||
      (date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() < now.getUTCMonth())
    );
  }

  // Datas-only (ex.: '2026-06-05') são parseadas pelo JS como meia-noite UTC, não local.
  // Toda a matemática de mês/dia de contas recorrentes precisa operar em UTC para não
  // sofrer deslocamento de ±1 dia conforme o fuso horário do servidor (mesma convenção já
  // usada em transactions.service.ts).
  private monthRangeUtc(year: number, month: number) {
    return {
      start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
      end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
    };
  }

  private daysInMonthUtc(year: number, month: number) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  // Mesma carteira virtual de fallback usada em transactions.service.ts, para contas
  // antigas sem carteiraId não chegarem como null no frontend.
  private static readonly LEGACY_WALLET = {
    _id: 'legacy-wallet',
    nome: 'Saldo Histórico (Sem Carteira)',
    tipo: 'VIRTUAL' as const,
  };

  private attachVirtualWallet(item: Record<string, unknown>): Record<string, unknown> {
    return { ...item, carteira: item.carteiraId ? undefined : PendingService.LEGACY_WALLET };
  }

  // 'tipo' foi adicionado depois da criação do módulo: documentos legados (gravados antes
  // dessa feature, ex.: pelo deploy antigo) não têm o campo no banco. O default do schema
  // ('PAGAR') só é aplicado pelo Mongoose DEPOIS que o Mongo já leu o documento — o filtro
  // de query roda antes e um match exato `{ tipo: 'PAGAR' }` não casa com campo ausente.
  // Por isso o filtro de 'PAGAR' precisa aceitar também o caso de tipo inexistente.
  private tipoMatch(tipo?: string): Record<string, unknown> {
    if (!tipo) return {};
    if (tipo === 'PAGAR') {
      return { $or: [{ tipo: 'PAGAR' }, { tipo: { $exists: false } }] };
    }
    return { tipo };
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async createSettlementTransaction(pending: PendingAccountDocument) {
    const userId = pending.userId as Types.ObjectId;
    const isReceber = pending.tipo === 'RECEBER';
    let category = null;

    // Caminho preferido: usar categoryId gravado diretamente (contas novas)
    if (pending.categoryId) {
      category = await this.categoryModel.findById(pending.categoryId).exec();
    }

    // Fallback para contas antigas que só têm o nome textual em `categoria`
    if (!category && pending.categoria && pending.categoria.toLowerCase() !== 'outro') {
      // 1. Busca exata (case-insensitive, nome escapado para evitar regex injection)
      category = await this.categoryModel
        .findOne({
          name: { $regex: new RegExp(`^${this.escapeRegex(pending.categoria)}$`, 'i') },
          isIncome: isReceber,
          $or: [{ userId: null }, { userId: userId }],
        })
        .exec();

      // 2. Sem match exato → tenta mapeamento por palavras-chave
      if (!category && !isReceber) {
        const mapped = this.resolveCategory(pending.categoria);
        if (mapped) {
          category = await this.categoryModel
            .findOne({
              name: { $regex: new RegExp(`^${this.escapeRegex(mapped)}$`, 'i') },
              isIncome: false,
              $or: [{ userId: null }, { userId: userId }],
            })
            .exec();
        }
      }
    }

    // Fallback seguro: se uma conta RECEBER não encontrou categoria de receita
    // correspondente pelo nome, usa a primeira categoria de receita disponível para o
    // usuário em vez de deixar a transação sem categoria.
    if (!category && isReceber) {
      category = await this.categoryModel
        .findOne({ isIncome: true, $or: [{ userId: null }, { userId: userId }] })
        .exec();
    }

    try {
      // Se a forma de pagamento escolhida é um cartão de crédito, a liquidação genérica
      // (Transaction solta com carteiraId) não serve: não teria faturaId, não apareceria
      // na fatura, não respeitaria o ciclo de fechamento. Roteia pelo mesmo caminho de
      // qualquer outra compra no cartão — inclusive pra uma ocorrência recorrente
      // materializada aqui (payRecurringInstance chama este método antes de salvar).
      const wallet = !isReceber && pending.carteiraId
        ? await this.walletModel.findOne({ _id: pending.carteiraId, userId, tipo: 'credito' }).exec()
        : null;

      if (wallet) {
        const tx = await this.cartoesService.criarCompraAvulsa(userId, wallet, {
          value: pending.value,
          categoryId: category?._id as Types.ObjectId | undefined,
          description: pending.title,
          date: pending.dueDate,
        });
        // Sinaliza "isto é negócio de cartão" pro frontend (mesmo campo que a
        // PendingAccount da própria fatura usa) — a transação de liquidação em si não
        // carrega pendingAccountId, igual a qualquer outra compra no cartão.
        pending.faturaId = tx.faturaId as Types.ObjectId;
        return;
      }

      await this.transactionModel.create({
        userId,
        type: isReceber ? TransactionType.INCOME : TransactionType.EXPENSE,
        value: pending.value,
        categoryId: category?._id ?? undefined,
        carteiraId: pending.carteiraId ?? undefined,
        description: pending.title,
        date: pending.dueDate,
        pendingAccountId: pending._id,
      });
    } catch (error) {
      this.logger.error(
        `Falha ao criar transação de liquidação da conta ${pending._id?.toString()} (tipo=${pending.tipo}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async create(userId: string, dto: CreatePendingDto) {
    if (dto.isParcelada) {
      if (!dto.parcelas) {
        throw new BadRequestException('Parcelas sao obrigatorias quando isParcelada = true');
      }
      const { totalParcelas } = dto.parcelas;
      if (totalParcelas <= 0) {
        throw new BadRequestException('totalParcelas deve ser maior que zero');
      }

      const baseDate = new Date(dto.dueDate);
      const valorParcela = Number((dto.value / totalParcelas).toFixed(2));
      const grupoParceladoId = new Types.ObjectId().toString();
      const docs = Array.from({ length: totalParcelas }, (_, index) => {
        const numeroParcela = index + 1;
        const dueDate = this.addMonths(baseDate, index);
        return {
          userId: new Types.ObjectId(userId),
          title: dto.title,
          value: valorParcela,
          dueDate,
          description: dto.description,
          paid: false,
          paidAt: undefined,
          isParcelada: true,
          isRecorrente: false,
          categoria: dto.categoria,
          formatoPagamento: dto.formatoPagamento,
          tipo: dto.tipo ?? 'PAGAR',
          affectsBalance: this.isRetroactive(dueDate) ? (dto.affectsBalance ?? true) : true,
          carteiraId: dto.carteiraId ? new Types.ObjectId(dto.carteiraId) : undefined,
          categoryId: dto.categoryId && Types.ObjectId.isValid(dto.categoryId) ? new Types.ObjectId(dto.categoryId) : undefined,
          numeroParcela,
          grupoParceladoId,
          parcelas: {
            totalParcelas,
            valorParcela,
            qtdParcelasPagas: 0,
            parcelasPagas: [],
            dataInicio: baseDate,
            dataFim: this.addMonths(baseDate, totalParcelas - 1),
          },
        };
      });

      return this.pendingModel.insertMany(docs);
    }

    if (dto.isRecorrente && !dto.recorrencia) {
      throw new BadRequestException('Recorrencia e obrigatoria quando isRecorrente = true');
    }

    const created = new this.pendingModel({
      userId: new Types.ObjectId(userId),
      title: dto.title,
      value: dto.value,
      dueDate: new Date(dto.dueDate),
      description: dto.description,
      paid: false,
      isParcelada: false,
      isRecorrente: dto.isRecorrente ?? false,
      categoria: dto.categoria,
      formatoPagamento: dto.formatoPagamento,
      tipo: dto.tipo ?? 'PAGAR',
      affectsBalance: dto.affectsBalance ?? true,
      carteiraId: dto.carteiraId ? new Types.ObjectId(dto.carteiraId) : undefined,
      categoryId: dto.categoryId && Types.ObjectId.isValid(dto.categoryId) ? new Types.ObjectId(dto.categoryId) : undefined,
      recorrencia: dto.recorrencia
        ? {
            periodoRecorrencia: dto.recorrencia.periodoRecorrencia,
            dataProxima: dto.recorrencia.dataProxima
              ? new Date(dto.recorrencia.dataProxima)
              : new Date(dto.dueDate),
            dataTermino: dto.recorrencia.dataTermino
              ? new Date(dto.recorrencia.dataTermino)
              : undefined,
          }
        : undefined,
    });

    return created.save();
  }

  async findAll(userId: string, month?: number, year?: number, paid?: boolean, tipo?: string) {
    const uid = new Types.ObjectId(userId);

    // Sem filtro de mês: retorna moldes e contas normais
    if (!month || !year) {
      const filter: Record<string, unknown> = {
        userId: uid,
        recorrenciaTemplateId: { $exists: false },
      };
      if (typeof paid === 'boolean') filter.paid = paid;
      Object.assign(filter, this.tipoMatch(tipo));
      const docs = await this.pendingModel.find(filter).sort({ dueDate: 1 }).exec();
      return docs.map((d) => this.attachVirtualWallet(d.toObject() as Record<string, unknown>));
    }

    const { start: monthStart, end: monthEnd } = this.monthRangeUtc(year, month);

    // 1. Contas normais (não recorrentes, não instâncias)
    const regularFilter: Record<string, unknown> = {
      userId: uid,
      isRecorrente: { $ne: true },
      recorrenciaTemplateId: { $exists: false },
      dueDate: { $gte: monthStart, $lte: monthEnd },
    };
    if (typeof paid === 'boolean') regularFilter.paid = paid;
    Object.assign(regularFilter, this.tipoMatch(tipo));
    const regularAccounts = await this.pendingModel.find(regularFilter).sort({ dueDate: 1 }).exec();

    // 2. Moldes recorrentes
    const templatesFilter: Record<string, unknown> = {
      userId: uid,
      isRecorrente: true,
      recorrenciaTemplateId: { $exists: false },
    };
    Object.assign(templatesFilter, this.tipoMatch(tipo));
    const templates = await this.pendingModel.find(templatesFilter).exec();

    // 3. Instâncias já criadas para este mês (pagamentos)
    const instancesFilter: Record<string, unknown> = {
      userId: uid,
      recorrenciaTemplateId: { $exists: true, $ne: null },
      dueDate: { $gte: monthStart, $lte: monthEnd },
    };
    Object.assign(instancesFilter, this.tipoMatch(tipo));
    const instances = await this.pendingModel.find(instancesFilter).exec();

    const instanceByTemplate = new Map<string, PendingAccountDocument>();
    for (const inst of instances) {
      if (inst.recorrenciaTemplateId) {
        instanceByTemplate.set(inst.recorrenciaTemplateId, inst);
      }
    }

    // 4. Projeção JIT dos moldes recorrentes
    const recurringEntries: Record<string, unknown>[] = [];

    for (const template of templates) {
      const templateId = template._id.toString();
      const startDate = new Date(template.dueDate);
      const startYear = startDate.getUTCFullYear();
      const startMonth = startDate.getUTCMonth() + 1;
      const startDay = startDate.getUTCDate();
      const periodo = template.recorrencia?.periodoRecorrencia ?? 'Mensal';

      let shouldProject = false;
      if (periodo === 'Mensal' || periodo === 'Diário' || periodo === 'Semanal') {
        shouldProject = year > startYear || (year === startYear && month >= startMonth);
      } else if (periodo === 'Anual') {
        shouldProject = month === startMonth && year >= startYear;
      }

      if (!shouldProject) continue;

      // Respeita data de término: não projeta ocorrências após dataTermino.
      if (template.recorrencia?.dataTermino) {
        const daysInMonth = this.daysInMonthUtc(year, month);
        const day = Math.min(startDay, daysInMonth);
        const candidateDate = new Date(Date.UTC(year, month - 1, day));
        if (candidateDate > template.recorrencia.dataTermino) continue;
      }

      const existingInstance = instanceByTemplate.get(templateId);

      if (existingInstance) {
        if (existingInstance.skipped) continue;
        if (typeof paid === 'boolean' && existingInstance.paid !== paid) continue;
        recurringEntries.push(existingInstance.toObject() as Record<string, unknown>);
      } else {
        if (paid === true) continue; // virtual sempre é não paga

        const daysInMonth = this.daysInMonthUtc(year, month);
        const day = Math.min(startDay, daysInMonth);
        const projectedDueDate = new Date(Date.UTC(year, month - 1, day));

        const templateObj = template.toObject() as Record<string, unknown>;
        recurringEntries.push({
          ...templateObj,
          dueDate: projectedDueDate,
          paid: false,
          paidAt: undefined,
          isVirtual: true,
          templateId,
          recorrenciaTemplateId: templateId,
        });
      }
    }

    const allResults = [
      ...regularAccounts.map(d => d.toObject() as Record<string, unknown>),
      ...recurringEntries,
    ].map((item) => this.attachVirtualWallet(item));

    return allResults.sort(
      (a, b) =>
        new Date(a.dueDate as string | Date).getTime() -
        new Date(b.dueDate as string | Date).getTime(),
    );
  }

  async payRecurringInstance(userId: string, templateId: string, month: number, year: number, carteiraId?: string) {
    const uid = new Types.ObjectId(userId);

    const template = await this.pendingModel
      .findOne({ _id: new Types.ObjectId(templateId), userId: uid, isRecorrente: true })
      .exec();

    if (!template) throw new NotFoundException('Molde recorrente não encontrado');

    const { start: monthStart, end: monthEnd } = this.monthRangeUtc(year, month);

    const existing = await this.pendingModel
      .findOne({
        userId: uid,
        recorrenciaTemplateId: templateId,
        dueDate: { $gte: monthStart, $lte: monthEnd },
      })
      .exec();

    if (existing) {
      if (!existing.paid) {
        if (carteiraId) existing.carteiraId = new Types.ObjectId(carteiraId);
        // Cria a transação de liquidação ANTES de persistir paid=true (ver update()).
        await this.createSettlementTransaction(existing);
        existing.paid = true;
        existing.paidAt = new Date();
        await existing.save();
      }
      return existing;
    }

    const startDay = new Date(template.dueDate).getUTCDate();
    const daysInMonth = this.daysInMonthUtc(year, month);
    const day = Math.min(startDay, daysInMonth);
    const dueDate = new Date(Date.UTC(year, month - 1, day));

    const instance = new this.pendingModel({
      userId: uid,
      title: template.title,
      value: template.value,
      dueDate,
      description: template.description,
      isParcelada: false,
      isRecorrente: false,
      categoria: template.categoria,
      formatoPagamento: template.formatoPagamento,
      tipo: template.tipo,
      carteiraId: carteiraId ? new Types.ObjectId(carteiraId) : template.carteiraId,
      categoryId: template.categoryId,
      recorrenciaTemplateId: templateId,
      paid: false,
    });

    // Cria a transação de liquidação ANTES de persistir paid=true (ver update()).
    await this.createSettlementTransaction(instance);
    instance.paid = true;
    instance.paidAt = new Date();
    await instance.save();
    return instance;
  }

  async update(userId: string, id: string, dto: UpdatePendingDto) {
    const pending = await this.pendingModel
      .findOne({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) })
      .exec();
    if (!pending) throw new NotFoundException('Pending account not found');

    if (typeof dto.title !== 'undefined') pending.title = dto.title;
    if (typeof dto.value !== 'undefined') pending.value = dto.value;
    if (typeof dto.dueDate !== 'undefined') pending.dueDate = new Date(dto.dueDate);
    if (typeof dto.description !== 'undefined') pending.description = dto.description;
    if (typeof dto.carteiraId !== 'undefined') pending.carteiraId = dto.carteiraId ? new Types.ObjectId(dto.carteiraId) : undefined;
    if (typeof dto.categoryId !== 'undefined') pending.categoryId = dto.categoryId && Types.ObjectId.isValid(dto.categoryId) ? new Types.ObjectId(dto.categoryId) : undefined;
    if (typeof dto.tipo !== 'undefined') pending.tipo = dto.tipo;

    if (dto.isRecorrente === true && !dto.recorrencia && !pending.recorrencia) {
      throw new BadRequestException('Recorrencia e obrigatoria quando isRecorrente = true');
    }

    if (typeof dto.isParcelada !== 'undefined') pending.isParcelada = dto.isParcelada;
    if (typeof dto.isRecorrente !== 'undefined') pending.isRecorrente = dto.isRecorrente;

    // dto.parcelas chegava sendo ignorado por completo aqui: o front manda
    // totalParcelas/dataInicio/dataFim corretamente ao editar uma conta parcelada, mas
    // nada neste método lia esse campo — o save() retornava 200 sem persistir a data
    // nova. qtdParcelasPagas/parcelasPagas nunca são aceitos do cliente (o front hoje
    // manda parcelasPagas: 0 só por reaproveitar o builder de criação): são progresso de
    // pagamento controlado só pelo backend, no bloco de sincronização logo abaixo.
    if (typeof dto.parcelas !== 'undefined') {
      const dataInicio = dto.parcelas.dataInicio ? new Date(dto.parcelas.dataInicio) : pending.parcelas?.dataInicio;
      const dataFim = dto.parcelas.dataFim ? new Date(dto.parcelas.dataFim) : pending.parcelas?.dataFim;
      if (!dataInicio || !dataFim) {
        throw new BadRequestException('Data de início e fim das parcelas são obrigatórias');
      }
      pending.parcelas = {
        totalParcelas: dto.parcelas.totalParcelas,
        valorParcela: dto.parcelas.valorParcela ?? pending.parcelas?.valorParcela ?? 0,
        qtdParcelasPagas: pending.parcelas?.qtdParcelasPagas ?? 0,
        parcelasPagas: pending.parcelas?.parcelasPagas ?? [],
        dataInicio,
        dataFim,
      };
      // A 1ª parcela do grupo compartilha a data com o início do parcelamento — mover
      // "Data de início" deve mover o vencimento desta parcela também. Demais parcelas
      // do grupo não têm seu próprio vencimento editável por este modal (o campo "Data
      // de vencimento" fica oculto quando isParcelada=true), então só a metadata do
      // grupo é atualizada para elas.
      if ((pending.numeroParcela ?? 1) === 1 && dto.parcelas.dataInicio) {
        pending.dueDate = dataInicio;
      }
    }

    if (typeof dto.recorrencia !== 'undefined') {
      pending.recorrencia = {
        periodoRecorrencia: dto.recorrencia.periodoRecorrencia,
        dataProxima: dto.recorrencia.dataProxima ? new Date(dto.recorrencia.dataProxima) : pending.recorrencia?.dataProxima,
        dataTermino: dto.recorrencia.dataTermino ? new Date(dto.recorrencia.dataTermino) : pending.recorrencia?.dataTermino,
      };
    }

    const wasPaid = pending.paid;
    const willSettle   = dto.paid === true  && !wasPaid;
    const willUnsettle = dto.paid === false && wasPaid;

    // Rejeitar tentativa de desmarcar uma conta/parcela que já está desmarcada.
    if (dto.paid === false && !wasPaid) {
      throw new BadRequestException('Esta conta/parcela não está marcada como paga');
    }

    // Fatura de cartão: liquidação genérica (createSettlementTransaction) criaria uma
    // segunda EXPENSE fora da fatura, duplicando o que as compras já lançaram nela, e não
    // sabe escolher carteira pagadora nem tratar pagamento parcial/rotativo.
    if ((willSettle || willUnsettle) && pending.faturaId) {
      throw new BadRequestException(
        'Esta conta é a fatura de um cartão. Pague ou reverta o pagamento pela tela de Cartões.',
      );
    }

    // Cria a transação de liquidação ANTES de persistir paid=true: se isso falhar, a
    // conta nunca fica marcada como paga/recebida sem o lançamento correspondente.
    // Respeitamos affectsBalance: se false, nenhuma transação é gerada.
    if (willSettle && pending.affectsBalance !== false) {
      await this.createSettlementTransaction(pending);
    }

    // Remove a transação de liquidação ao desmarcar (deleteMany é no-op se nenhuma existir,
    // o que acontece quando affectsBalance=false foi usado no pagamento original).
    if (willUnsettle) {
      await this.transactionModel.deleteMany({
        userId: pending.userId,
        pendingAccountId: pending._id,
      }).exec();
    }

    if (typeof dto.paid !== 'undefined') {
      pending.paid = dto.paid;
      if (dto.paid)  pending.paidAt = pending.paidAt ?? new Date();
      if (!dto.paid) pending.paidAt = undefined;
    }

    if (typeof dto.affectsBalance !== 'undefined') pending.affectsBalance = dto.affectsBalance;

    await pending.save();

    // Sincroniza metadados do grupo parcelado (parcelasPagas / qtdParcelasPagas).
    if (willSettle && pending.grupoParceladoId && pending.numeroParcela) {
      await this.pendingModel.updateMany(
        { userId: pending.userId, grupoParceladoId: pending.grupoParceladoId },
        {
          $addToSet: { 'parcelas.parcelasPagas': pending.numeroParcela },
          $inc: { 'parcelas.qtdParcelasPagas': 1 },
        },
      ).exec();
    }

    // Reverte metadados do grupo parcelado ao desmarcar.
    if (willUnsettle && pending.grupoParceladoId && pending.numeroParcela) {
      await this.pendingModel.updateMany(
        { userId: pending.userId, grupoParceladoId: pending.grupoParceladoId },
        {
          $pull: { 'parcelas.parcelasPagas': pending.numeroParcela },
          $inc: { 'parcelas.qtdParcelasPagas': -1 },
        },
      ).exec();
    }

    // O updateMany opera diretamente no banco e não atualiza o objeto em memória;
    // re-lemos o documento para retornar parcelasPagas/qtdParcelasPagas consistentes.
    if ((willSettle || willUnsettle) && pending.grupoParceladoId) {
      const fresh = await this.pendingModel.findById(pending._id).exec();
      if (fresh) return fresh;
    }

    return pending;
  }

  async skipRecurringMonth(userId: string, templateId: string, month: number, year: number) {
    const uid = new Types.ObjectId(userId);
    const template = await this.pendingModel
      .findOne({ _id: new Types.ObjectId(templateId), userId: uid, isRecorrente: true })
      .exec();
    if (!template) throw new NotFoundException('Molde recorrente não encontrado');

    const { start: monthStart, end: monthEnd } = this.monthRangeUtc(year, month);

    const existing = await this.pendingModel
      .findOne({ userId: uid, recorrenciaTemplateId: templateId, dueDate: { $gte: monthStart, $lte: monthEnd } })
      .exec();

    if (existing) {
      if (existing.paid) {
        await this.transactionModel.deleteMany({ userId: uid, pendingAccountId: existing._id }).exec();
      }
      await existing.deleteOne();
    }

    // Cria marcador de mês pulado para o JIT não projetar este mês
    const startDay = new Date(template.dueDate).getUTCDate();
    const day = Math.min(startDay, this.daysInMonthUtc(year, month));
    await this.pendingModel.create({
      userId: uid,
      title: template.title,
      value: template.value,
      dueDate: new Date(Date.UTC(year, month - 1, day)),
      isParcelada: false,
      isRecorrente: false,
      categoria: template.categoria,
      tipo: template.tipo,
      recorrenciaTemplateId: templateId,
      paid: false,
      skipped: true,
    });

    return { skipped: true };
  }

  async remove(userId: string, id: string) {
    const uid = new Types.ObjectId(userId);
    const oid = new Types.ObjectId(id);

    // Fatura de cartão não pode ser apagada pelo fluxo genérico de contas pendentes — ela é
    // recriada/gerenciada por CartoesService e tem transações de compra vinculadas por
    // faturaId, não por pendingAccountId, então o deleteMany abaixo não as alcançaria mesmo.
    const existing = await this.pendingModel.findOne({ _id: oid, userId: uid }).exec();
    if (existing?.faturaId) {
      throw new BadRequestException(
        'Esta conta é a fatura de um cartão e não pode ser excluída pela tela de Contas.',
      );
    }

    const result = await this.pendingModel.findOneAndDelete({ _id: oid, userId: uid }).exec() as unknown as PendingAccountDocument | null;
    if (!result) throw new NotFoundException('Pending account not found');
    await this.transactionModel.deleteMany({ userId: uid, pendingAccountId: oid }).exec();
    // Se for molde recorrente, remove todas as instâncias/skip markers
    if (result.isRecorrente) {
      const instances = await this.pendingModel.find({ userId: uid, recorrenciaTemplateId: id }).exec();
      const instanceIds = instances.map(i => i._id);
      if (instanceIds.length) {
        await this.transactionModel.deleteMany({ userId: uid, pendingAccountId: { $in: instanceIds } }).exec();
        await this.pendingModel.deleteMany({ userId: uid, recorrenciaTemplateId: id }).exec();
      }
    }
    return { deleted: true };
  }

  async findGroup(userId: string, grupoParceladoId: string) {
    const uid = new Types.ObjectId(userId);
    return this.pendingModel
      .find({ userId: uid, grupoParceladoId })
      .sort({ numeroParcela: 1 })
      .exec();
  }

  async removeGroup(userId: string, grupoParceladoId: string) {
    const uid = new Types.ObjectId(userId);
    const accounts = await this.pendingModel.find({ userId: uid, grupoParceladoId }).exec();
    if (!accounts.length) throw new NotFoundException('Pending account not found');
    const ids = accounts.map(a => a._id);
    await this.pendingModel.deleteMany({ userId: uid, grupoParceladoId }).exec();
    await this.transactionModel.deleteMany({ userId: uid, pendingAccountId: { $in: ids } }).exec();
    return { deleted: true, count: accounts.length };
  }
}
