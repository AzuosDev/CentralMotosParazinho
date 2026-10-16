import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeftRight,
  Banknote,
  CalendarDays,
  Check,
  Keyboard,
  Loader2,
  Mic,
  Plus,
  Sparkles,
  Square,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { ModalShell } from "./ModalShell";
import { useCategories, useIncomeCategories, useWalletsWithCartoes } from "./TransactionFormFields";
import { CurrencyInput } from "../ui/CurrencyInput";
import { useToast } from "../ui/Toast";
import { api } from "../../lib/api";
import { getApiErrorText } from "../../lib/errors";
import { formatCurrency, localDateString } from "../../lib/finance";
import { cn } from "../../lib/utils";
import { DURACAO_MAXIMA_S, useGravadorVoz } from "../../hooks/useGravadorVoz";
import {
  ehCarteiraDinheiro,
  extensaoDoMime,
  lerCarteiraPadrao,
  motivoSemVoz,
  paraLinhas,
  paraPayload,
  pendenciasDaLinha,
  rotuloData,
  salvarCarteiraPadrao,
  vozSuportada,
  type InterpretacaoVoz,
  type LinhaVoz,
  type ResultadoConfirmacaoVoz,
} from "../../lib/voz";
import type { Wallet } from "../../types/api";
import type { Category } from "../../types/finance";

type Fase = "ouvindo" | "processando" | "revisao";

const EXEMPLOS = [
  "Gastei 32 de almoço e 15 de Uber",
  "Recebi 1.500 do cliente Marcos no Pix",
  "Ontem paguei 180 de luz no Nubank",
  "Comprei um pneu de 900 em 3x no cartão",
];

// Campo que só aparece quando a IA não identificou algo obrigatório.
const campoFaltante =
  "w-full rounded-lg bg-bg-muted px-2.5 py-2 text-sm text-text-primary outline-none ring-2 ring-accent-yellow/70 focus:ring-accent-brand";

function mmss(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function VozModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const gravador = useGravadorVoz();
  const { data: expenseCats = [] } = useCategories();
  const { data: incomeCats = [] } = useIncomeCategories();
  const { data: todasCarteiras = [] } = useWalletsWithCartoes();

  const carteiras = useMemo(() => todasCarteiras.filter((w) => w.tipo !== "VIRTUAL" && !w.arquivadaEm), [todasCarteiras]);
  const cartaoIds = useMemo(() => new Set(carteiras.filter((w) => w.tipo === "credito").map((w) => w._id)), [carteiras]);
  const isCartao = useCallback((id: string | null) => Boolean(id && cartaoIds.has(id)), [cartaoIds]);

  const [fase, setFase] = useState<Fase>("ouvindo");
  const [modoTexto, setModoTexto] = useState(() => !vozSuportada());
  const [texto, setTexto] = useState("");
  const [linhas, setLinhas] = useState<LinhaVoz[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  // O que foi ouvido na última fala — mostra se um erro veio da transcrição ou da interpretação.
  const [transcricao, setTranscricao] = useState("");
  const [carteiraPadrao, setCarteiraPadrao] = useState<string | null>(() => lerCarteiraPadrao());

  // Abre já ouvindo: o objetivo é falar sem nenhum toque extra.
  const iniciouRef = useRef(false);
  useEffect(() => {
    if (open && !modoTexto && !iniciouRef.current) {
      iniciouRef.current = true;
      void gravador.iniciar();
    }
  }, [open, modoTexto, gravador]);

  const receberInterpretacao = (res: InterpretacaoVoz) => {
    if (res.itens.length === 0) {
      setAviso(
        res.transcricao
          ? `Não identifiquei nenhum lançamento em: “${res.transcricao}”. Tente dizer o valor e o que foi.`
          : "Não consegui ouvir nada. Fale mais perto do microfone e tente de novo.",
      );
      setFase(linhas.length > 0 ? "revisao" : "ouvindo");
      return;
    }
    setAviso(null);
    setTexto("");
    setTranscricao(res.transcricao);
    setLinhas((atuais) => [...atuais, ...paraLinhas(res.itens)]);
    setFase("revisao");
  };

  const falhaInterpretacao = (err: unknown) => {
    setAviso(getApiErrorText(err, "Não foi possível interpretar. Tente novamente."));
    setFase(linhas.length > 0 ? "revisao" : "ouvindo");
  };

  const interpretar = useMutation({
    mutationFn: async (entrada: { audio: Blob; mimeType: string } | { texto: string }) => {
      const comum = { carteiraPadraoId: carteiraPadrao ?? undefined, hoje: localDateString() };
      if ("texto" in entrada) {
        const { data } = await api.post<InterpretacaoVoz>("/api/voz/interpretar", { ...comum, texto: entrada.texto });
        return data;
      }
      const form = new FormData();
      form.append("audio", entrada.audio, `gravacao.${extensaoDoMime(entrada.mimeType)}`);
      if (comum.carteiraPadraoId) form.append("carteiraPadraoId", comum.carteiraPadraoId);
      form.append("hoje", comum.hoje);
      const { data } = await api.post<InterpretacaoVoz>("/api/voz/interpretar", form, { timeout: 60000 });
      return data;
    },
    onMutate: () => setFase("processando"),
    onSuccess: receberInterpretacao,
    onError: falhaInterpretacao,
  });

  const concluirGravacao = async () => {
    const gravacao = await gravador.parar();
    if (!gravacao) {
      setAviso("Nada foi gravado. Tente de novo.");
      return;
    }
    interpretar.mutate({ audio: gravacao.blob, mimeType: gravacao.mimeType });
  };

  // Atingir a duração máxima para a gravação sozinha — processa o que foi gravado.
  const estadoAnterior = useRef(gravador.estado);
  useEffect(() => {
    if (estadoAnterior.current === "gravando" && gravador.estado === "parado" && gravador.segundos >= DURACAO_MAXIMA_S) {
      void concluirGravacao();
    }
    estadoAnterior.current = gravador.estado;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gravador.estado]);

  const falarMais = () => {
    setAviso(null);
    setModoTexto(false);
    setFase("ouvindo");
    void gravador.iniciar();
  };

  const atualizar = (chave: string, mudanca: Partial<LinhaVoz>) =>
    setLinhas((atuais) =>
      atuais.map((l) => {
        if (l.chave !== chave) return l;
        const nova = { ...l, ...mudanca };
        // Marcar "lançar mesmo assim" mantém o erro de limite à vista (o checkbox mora nele);
        // qualquer outra edição invalida o erro que o servidor deu para a versão anterior.
        const soConfirmacao = Object.keys(mudanca).every((k) => k === "confirmarMesmoAssim");
        return soConfirmacao
          ? nova
          : { ...nova, erro: undefined, limiteExcedido: undefined, confirmarMesmoAssim: undefined };
      }),
    );

  // Escolher a carteira numa linha que veio sem ela preenche todas as outras que também
  // vieram sem (e vira a padrão das próximas falas) — um toque em vez de um por linha.
  // Só entre linhas com a mesma forma de pagamento dita: escolher o Itaú para um gasto sem
  // forma citada não pode arrastar junto um gasto que foi "em espécie".
  const preencherCarteiraFaltante = (origem: LinhaVoz, id: string | null) => {
    if (!id) return;
    if (!origem.formaPagamento) {
      setCarteiraPadrao(id);
      salvarCarteiraPadrao(id);
    }
    setLinhas((atuais) =>
      atuais.map((l) => {
        const semCarteiraValida = !l.carteiraId || (l.type === "INCOME" && isCartao(l.carteiraId));
        if (l.chave !== origem.chave && l.formaPagamento !== origem.formaPagamento) return l;
        if (l.type === "TRANSFER" || !semCarteiraValida || (l.type === "INCOME" && isCartao(id))) return l;
        return { ...l, carteiraId: id, parcelas: 1, erro: undefined };
      }),
    );
  };

  // Falou "em espécie" sem ter carteira de dinheiro: cria uma num toque e já a usa nessas linhas.
  const temCarteiraDinheiro = carteiras.some(ehCarteiraDinheiro);
  const criarCarteiraDinheiro = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Wallet>("/api/wallets", { nome: "Dinheiro", tipo: "dinheiro", saldo: 0, icone: "💵" });
      return data;
    },
    onSuccess: (nova) => {
      void queryClient.invalidateQueries({ queryKey: ["wallets"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setLinhas((atuais) =>
        atuais.map((l) =>
          l.formaPagamento === "dinheiro" && !l.carteiraId && l.type !== "TRANSFER"
            ? { ...l, carteiraId: nova._id, parcelas: 1, erro: undefined }
            : l,
        ),
      );
      addToast("Carteira Dinheiro criada.", "success");
    },
    onError: (err) => setAviso(getApiErrorText(err, "Não foi possível criar a carteira.")),
  });

  // "Não está certo": descarta o que foi entendido e volta a ouvir.
  const refazer = () => {
    setLinhas([]);
    setTranscricao("");
    if (vozSuportada()) {
      falarMais();
    } else {
      setAviso(null);
      setModoTexto(true);
      setFase("ouvindo");
    }
  };

  const pendencias = linhas.map((l) => pendenciasDaLinha(l, isCartao));
  const tudoPronto = linhas.length > 0 && pendencias.every((p) => p.length === 0);

  const salvar = useMutation({
    mutationFn: async (lote: LinhaVoz[]) => {
      const { data } = await api.post<{ resultados: ResultadoConfirmacaoVoz[] }>("/api/voz/confirmar", {
        itens: lote.map((l) => paraPayload(l, isCartao)),
      });
      return { lote, resultados: data.resultados };
    },
    onSuccess: ({ lote, resultados }) => {
      // Um lote pode tocar carteiras, cartões/faturas, contas, metas e dashboard de uma vez —
      // invalidar tudo é mais seguro que manter uma lista de chaves que fica desatualizada.
      void queryClient.invalidateQueries();

      const salvas = resultados.filter((r) => r.ok).length;
      const falhas = new Map(
        resultados.flatMap((r) => (r.ok ? [] : [[r.indice, r] as const])),
      );
      if (resultados.some((r) => r.ok && r.avisoLimite?.avisoProximoLimite)) {
        addToast("Atenção: um dos cartões passou de 80% do limite.", "warning");
      }

      if (falhas.size === 0) {
        addToast(salvas === 1 ? "1 lançamento salvo." : `${salvas} lançamentos salvos.`, "success");
        onClose();
        return;
      }
      if (salvas > 0) addToast(`${salvas} salvo(s). ${falhas.size} precisa(m) de ajuste.`, "warning");
      setLinhas(
        lote.flatMap((l, i) => {
          const falha = falhas.get(i);
          if (!falha || falha.ok) return [];
          return [{ ...l, erro: falha.mensagem, limiteExcedido: falha.limiteExcedido }];
        }),
      );
    },
    onError: (err) => setAviso(getApiErrorText(err, "Não foi possível salvar. Tente novamente.")),
  });

  const fechar = () => {
    gravador.cancelar();
    onClose();
  };

  const processando = fase === "processando" || interpretar.isPending;

  return (
    <ModalShell
      open={open}
      title="Lançar por voz"
      icon={<Sparkles className="h-5 w-5 text-accent-brand" />}
      onClose={fechar}
      footer={
        fase === "revisao" ? (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={refazer}
              disabled={salvar.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-bg-muted px-4 py-3 text-sm font-semibold text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary disabled:opacity-50"
            >
              {vozSuportada() ? <Mic className="h-4 w-4" /> : <Keyboard className="h-4 w-4" />} Falar de novo
            </button>
            <button
              type="button"
              onClick={() => salvar.mutate(linhas)}
              disabled={!tudoPronto || salvar.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-brand px-4 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {salvar.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
              ) : (
                <><Check className="h-4 w-4" /> Confirmar</>
              )}
            </button>
          </div>
        ) : null
      }
    >
      {aviso && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-accent-red/10 p-3 text-sm text-status-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{aviso}</span>
        </div>
      )}

      {processando && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-accent-brand" />
          <p className="font-semibold text-text-primary">Entendendo o que você disse...</p>
          <p className="text-xs text-text-secondary">Separando valores, categorias e carteiras.</p>
        </div>
      )}

      {!processando && fase === "ouvindo" && !modoTexto && (
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <button
            type="button"
            onClick={() => (gravador.estado === "gravando" ? void concluirGravacao() : void gravador.iniciar())}
            disabled={gravador.estado === "pedindo-permissao"}
            aria-label={gravador.estado === "gravando" ? "Concluir gravação" : "Começar a gravar"}
            className="relative grid h-28 w-28 place-items-center rounded-full bg-accent-brand text-white shadow-lg shadow-accent-brand/40 transition active:scale-95"
          >
            {gravador.estado === "gravando" && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-full bg-accent-brand/40 transition-transform duration-75"
                style={{ transform: `scale(${1 + gravador.nivel * 0.6})` }}
              />
            )}
            <span className="relative">
              {gravador.estado === "gravando" ? <Square className="h-9 w-9 fill-current" /> : <Mic className="h-11 w-11" />}
            </span>
          </button>

          <div>
            <p className="text-lg font-bold text-text-primary">
              {gravador.estado === "gravando"
                ? "Pode falar, estou ouvindo"
                : gravador.estado === "pedindo-permissao"
                  ? "Aguardando o microfone..."
                  : "Toque para falar"}
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              {gravador.estado === "gravando"
                ? `${mmss(gravador.segundos)} de ${mmss(DURACAO_MAXIMA_S)} · toque no botão quando terminar`
                : "Fale vários lançamentos de uma vez, um depois do outro."}
            </p>
          </div>

          {gravador.erro && (
            <div className="flex items-start gap-2 rounded-xl bg-accent-red/10 p-3 text-left text-sm text-status-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {gravador.erro}
            </div>
          )}

          <ul className="w-full space-y-1.5 rounded-xl bg-bg-muted/60 p-3 text-left text-sm text-text-secondary">
            <li className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Exemplos</li>
            {EXEMPLOS.map((e) => (
              <li key={e}>“{e}”</li>
            ))}
          </ul>

          <div className="flex w-full flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => { gravador.cancelar(); setModoTexto(true); }}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
            >
              <Keyboard className="h-4 w-4" /> Prefiro digitar
            </button>
          </div>
        </div>
      )}

      {!processando && fase === "ouvindo" && modoTexto && (
        <form
          className="space-y-3 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim()) interpretar.mutate({ texto: texto.trim() });
          }}
        >
          <label className="block text-sm text-text-secondary" htmlFor="voz-texto">
            Escreva do jeito que falaria, quantos lançamentos quiser:
          </label>
          <textarea
            id="voz-texto"
            autoFocus
            rows={5}
            maxLength={2000}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
            }}
            placeholder={"mercado 150 no débito\nuber 25 ontem\nrecebi 800 do João no Pix"}
            className="w-full resize-none rounded-xl bg-bg-muted p-3 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent-brand"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {vozSuportada() ? (
              <button
                type="button"
                onClick={falarMais}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
              >
                <Mic className="h-4 w-4" /> Usar microfone
              </button>
            ) : (
              <span className="text-xs text-text-secondary">{motivoSemVoz()}</span>
            )}
            <button
              type="submit"
              disabled={!texto.trim()}
              className="flex items-center gap-2 rounded-xl bg-accent-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" /> Interpretar
            </button>
          </div>
        </form>
      )}

      {!processando && fase === "revisao" && (
        <div className="space-y-3 py-1">
          <p className="text-sm text-text-secondary">
            {linhas.length === 1 ? "Entendi isto. Está certo?" : `Entendi ${linhas.length} lançamentos. Está certo?`}
          </p>
          {transcricao && (
            <p className="rounded-lg bg-bg-muted/60 px-3 py-2 text-xs italic text-text-secondary">
              Ouvi: “{transcricao}”
            </p>
          )}
          <ul className="divide-y divide-bg-muted overflow-hidden rounded-xl border border-bg-muted">
            {linhas.map((linha, i) => (
              <LinhaResumo
                key={linha.chave}
                linha={linha}
                pendencias={pendencias[i]}
                carteiras={carteiras}
                expenseCats={expenseCats}
                incomeCats={incomeCats}
                onChange={(m) => atualizar(linha.chave, m)}
                onEscolherCarteira={(id) => preencherCarteiraFaltante(linha, id)}
                semCarteiraDinheiro={linha.formaPagamento === "dinheiro" && !temCarteiraDinheiro}
                onCriarCarteiraDinheiro={() => criarCarteiraDinheiro.mutate()}
                criandoCarteira={criarCarteiraDinheiro.isPending}
              />
            ))}
          </ul>
        </div>
      )}
    </ModalShell>
  );
}

function SeletorCarteira({
  carteiras,
  onChange,
  incluirCartoes,
  placeholder,
}: {
  carteiras: Wallet[];
  onChange: (id: string | null) => void;
  incluirCartoes: boolean;
  placeholder: string;
}) {
  const contas = carteiras.filter((w) => w.tipo !== "credito");
  const cartoes = incluirCartoes ? carteiras.filter((w) => w.tipo === "credito") : [];
  return (
    <select value="" onChange={(e) => onChange(e.target.value || null)} aria-label={placeholder} className={campoFaltante}>
      <option value="">{placeholder}</option>
      <optgroup label="Carteiras">
        {contas.map((w) => (
          <option key={w._id} value={w._id}>{w.nome}</option>
        ))}
      </optgroup>
      {cartoes.length > 0 && (
        <optgroup label="Cartões de crédito">
          {cartoes.map((w) => (
            <option key={w._id} value={w._id}>{w.nome}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

const ESTILO_TIPO = {
  EXPENSE: { Icone: TrendingDown, fundo: "bg-accent-red/15", texto: "text-accent-red", sinal: "-", nome: "Gasto" },
  INCOME: { Icone: TrendingUp, fundo: "bg-semantic-income/15", texto: "text-semantic-income", sinal: "+", nome: "Ganho" },
  TRANSFER: { Icone: ArrowLeftRight, fundo: "bg-accent-brand/15", texto: "text-accent-brand", sinal: "", nome: "Transferência" },
} as const;

/**
 * O que a IA entendeu, em uma linha só-leitura. O único ajuste sempre à mão é a data;
 * um campo de edição só aparece para o que faltou — sem ele o lançamento não salva.
 */
function LinhaResumo({
  linha,
  pendencias,
  carteiras,
  expenseCats,
  incomeCats,
  onChange,
  onEscolherCarteira,
  semCarteiraDinheiro,
  onCriarCarteiraDinheiro,
  criandoCarteira,
}: {
  linha: LinhaVoz;
  pendencias: string[];
  carteiras: Wallet[];
  expenseCats: Category[];
  incomeCats: Category[];
  onChange: (m: Partial<LinhaVoz>) => void;
  onEscolherCarteira: (id: string | null) => void;
  semCarteiraDinheiro: boolean;
  onCriarCarteiraDinheiro: () => void;
  criandoCarteira: boolean;
}) {
  const falta = (nome: string) => pendencias.includes(nome);
  const categorias = linha.type === "INCOME" ? incomeCats : expenseCats;
  const nomeCategoria = categorias.find((c) => c.id === linha.categoryId)?.name;
  const nomeCarteira = (id: string | null) => carteiras.find((w) => w._id === id)?.nome;
  const estilo = ESTILO_TIPO[linha.type];

  const detalhes =
    linha.type === "TRANSFER"
      ? [nomeCarteira(linha.carteiraId), nomeCarteira(linha.carteiraDestinoId)].filter(Boolean).join(" → ")
      : [nomeCategoria, nomeCarteira(linha.carteiraId), linha.parcelas >= 2 ? `${linha.parcelas}x` : null]
          .filter(Boolean)
          .join(" · ");

  return (
    <li className={cn("space-y-2 px-3 py-3", linha.erro && "bg-accent-red/5")}>
      <div className="flex items-center gap-3">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", estilo.fundo, estilo.texto)}>
          <estilo.Icone className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-text-primary">{linha.description || nomeCategoria || estilo.nome}</p>
          {detalhes && <p className="truncate text-xs text-text-secondary">{detalhes}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {linha.value ? (
            <span className={cn("font-bold tabular-nums", estilo.texto)}>
              {estilo.sinal}
              {formatCurrency(linha.value)}
            </span>
          ) : null}
          <label className="relative inline-flex cursor-pointer items-center gap-1 rounded-md bg-bg-muted px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary">
            <CalendarDays className="h-3 w-3" />
            {rotuloData(linha.date, localDateString())}
            <input
              type="date"
              value={linha.date}
              onChange={(e) => e.target.value && onChange({ date: e.target.value })}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch {
                  // sem showPicker: o próprio toque no input abre o calendário
                }
              }}
              aria-label="Mudar a data"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>
      </div>

      {falta("valor") && (
        <div className="rounded-lg bg-bg-muted px-2.5 py-1.5 ring-2 ring-accent-yellow/70">
          <CurrencyInput
            value={linha.value ?? 0}
            onChange={(v) => onChange({ value: v > 0 ? v : null })}
            className="w-full bg-transparent font-bold text-text-primary outline-none"
          />
        </div>
      )}
      {falta("categoria") && (
        <select
          value=""
          onChange={(e) => onChange({ categoryId: e.target.value || null })}
          aria-label="Categoria"
          className={campoFaltante}
        >
          <option value="">Qual a categoria?</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}
      {falta("carteira") && semCarteiraDinheiro && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent-yellow/10 px-2.5 py-2 text-xs text-text-primary">
          <Banknote className="h-4 w-4 shrink-0 text-accent-yellow" />
          <span className="flex-1">Você falou em dinheiro, mas ainda não tem uma carteira de dinheiro.</span>
          <button
            type="button"
            onClick={onCriarCarteiraDinheiro}
            disabled={criandoCarteira}
            className="flex items-center gap-1.5 rounded-md bg-accent-brand px-2.5 py-1 font-semibold text-white transition hover:bg-accent-brand-hover disabled:opacity-50"
          >
            {criandoCarteira ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Criar carteira Dinheiro
          </button>
        </div>
      )}
      {pendencias.some((p) => p === "carteira" || p.startsWith("carteira (")) && (
        <SeletorCarteira
          carteiras={carteiras}
          onChange={onEscolherCarteira}
          incluirCartoes={linha.type === "EXPENSE"}
          placeholder="Em qual carteira?"
        />
      )}
      {falta("carteira de origem") && (
        <SeletorCarteira
          carteiras={carteiras}
          onChange={(id) => onChange({ carteiraId: id })}
          incluirCartoes={false}
          placeholder="De qual carteira?"
        />
      )}
      {(falta("carteira de destino") || falta("carteiras diferentes")) && (
        <SeletorCarteira
          carteiras={carteiras}
          onChange={(id) => onChange({ carteiraDestinoId: id })}
          incluirCartoes={false}
          placeholder="Para qual carteira?"
        />
      )}

      {linha.erro && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-status-danger">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{linha.erro}</span>
          {linha.limiteExcedido && (
            <label className="flex items-center gap-1.5 text-text-primary">
              <input
                type="checkbox"
                checked={Boolean(linha.confirmarMesmoAssim)}
                onChange={(e) => onChange({ confirmarMesmoAssim: e.target.checked })}
                className="accent-accent-brand"
              />
              Lançar mesmo assim
            </label>
          )}
        </div>
      )}
    </li>
  );
}
