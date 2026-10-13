import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeftRight,
  Keyboard,
  Loader2,
  Mic,
  Plus,
  Sparkles,
  Square,
  Trash2,
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
  extensaoDoMime,
  lerCarteiraPadrao,
  linhaEmBranco,
  motivoSemVoz,
  paraLinhas,
  paraPayload,
  pendenciasDaLinha,
  salvarCarteiraPadrao,
  trocarTipo,
  vozSuportada,
  type InterpretacaoVoz,
  type LinhaVoz,
  type ResultadoConfirmacaoVoz,
  type TipoLancamentoVoz,
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

const TIPOS: Array<{ valor: TipoLancamentoVoz; rotulo: string; Icone: typeof TrendingDown; cor: string }> = [
  { valor: "EXPENSE", rotulo: "Gasto", Icone: TrendingDown, cor: "bg-accent-red text-white" },
  { valor: "INCOME", rotulo: "Ganho", Icone: TrendingUp, cor: "bg-semantic-income text-white" },
  { valor: "TRANSFER", rotulo: "Transf.", Icone: ArrowLeftRight, cor: "bg-accent-brand text-white" },
];

const campo =
  "w-full rounded-lg bg-bg-muted px-2.5 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent-brand";

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
  const [transcricao, setTranscricao] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
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
    setTranscricao(res.transcricao);
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

  const atualizar = (chave: string, mudanca: Partial<LinhaVoz> | ((l: LinhaVoz) => LinhaVoz)) =>
    setLinhas((atuais) =>
      atuais.map((l) => {
        if (l.chave !== chave) return l;
        const nova = typeof mudanca === "function" ? mudanca(l) : { ...l, ...mudanca };
        // Marcar "lançar mesmo assim" mantém o erro de limite à vista (o checkbox mora nele);
        // qualquer outra edição invalida o erro que o servidor deu para a versão anterior.
        const soConfirmacao =
          typeof mudanca === "object" && Object.keys(mudanca).every((k) => k === "confirmarMesmoAssim");
        return soConfirmacao
          ? nova
          : { ...nova, erro: undefined, limiteExcedido: undefined, confirmarMesmoAssim: undefined };
      }),
    );

  const aplicarCarteiraPadrao = (id: string | null) => {
    setCarteiraPadrao(id);
    salvarCarteiraPadrao(id);
    if (!id) return;
    setLinhas((atuais) =>
      atuais.map((l) =>
        l.type === "TRANSFER" || (l.type === "INCOME" && isCartao(id))
          ? l
          : { ...l, carteiraId: id, parcelas: isCartao(id) ? l.parcelas : 1, erro: undefined },
      ),
    );
  };

  const pendencias = linhas.map((l) => pendenciasDaLinha(l, isCartao));
  const prontas = pendencias.filter((p) => p.length === 0).length;
  const totalGastos = linhas.filter((l) => l.type === "EXPENSE").reduce((s, l) => s + (l.value ?? 0), 0);
  const totalGanhos = linhas.filter((l) => l.type === "INCOME").reduce((s, l) => s + (l.value ?? 0), 0);
  const tudoPronto = linhas.length > 0 && prontas === linhas.length;

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
      containerClassName={fase === "revisao" ? "max-w-2xl" : ""}
      footer={
        fase === "revisao" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-text-secondary">
              <span className="font-semibold text-text-primary">
                {prontas}/{linhas.length} pronto{linhas.length !== 1 ? "s" : ""}
              </span>
              {totalGastos > 0 && <> · Gastos <span className="text-accent-red">{formatCurrency(totalGastos)}</span></>}
              {totalGanhos > 0 && <> · Ganhos <span className="text-semantic-income">{formatCurrency(totalGanhos)}</span></>}
            </div>
            <button
              type="button"
              onClick={() => salvar.mutate(linhas)}
              disabled={!tudoPronto || salvar.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {salvar.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
              ) : (
                `Salvar ${linhas.length} lançamento${linhas.length !== 1 ? "s" : ""}`
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
            {linhas.length > 0 && (
              <button
                type="button"
                onClick={() => { gravador.cancelar(); setFase("revisao"); }}
                className="rounded-xl px-4 py-2 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
              >
                Voltar aos {linhas.length} lançamentos
              </button>
            )}
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
          {transcricao && (
            <p className="rounded-xl bg-bg-muted/60 px-3 py-2 text-xs italic text-text-secondary">
              Você disse: “{transcricao}”
            </p>
          )}

          <label className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            <span className="shrink-0">Carteira padrão:</span>
            <SeletorCarteira
              carteiras={carteiras}
              value={carteiraPadrao}
              onChange={aplicarCarteiraPadrao}
              incluirCartoes
              placeholder="Escolher e aplicar a todos"
              className="min-w-0 flex-1"
            />
          </label>

          <div className="space-y-2.5">
            {linhas.map((linha, i) => (
              <CartaoLinha
                key={linha.chave}
                linha={linha}
                pendencias={pendencias[i]}
                carteiras={carteiras}
                expenseCats={expenseCats}
                incomeCats={incomeCats}
                isCartao={isCartao}
                onChange={(m) => atualizar(linha.chave, m)}
                onRemover={() => setLinhas((atuais) => atuais.filter((l) => l.chave !== linha.chave))}
              />
            ))}
            {linhas.length === 0 && (
              <p className="py-6 text-center text-sm text-text-secondary">Nenhum lançamento na lista.</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={falarMais}
              disabled={!vozSuportada()}
              className="flex flex-col items-center gap-1 rounded-xl bg-accent-brand/10 px-2 py-3 text-xs font-semibold text-accent-brand transition hover:bg-accent-brand/20 disabled:opacity-40"
            >
              <Mic className="h-5 w-5" /> Falar mais
            </button>
            <button
              type="button"
              onClick={() => { setModoTexto(true); setFase("ouvindo"); }}
              className="flex flex-col items-center gap-1 rounded-xl bg-bg-muted px-2 py-3 text-xs font-semibold text-text-secondary transition hover:bg-bg-overlay"
            >
              <Keyboard className="h-5 w-5" /> Digitar mais
            </button>
            <button
              type="button"
              onClick={() => setLinhas((atuais) => [...atuais, linhaEmBranco(localDateString(), carteiraPadrao)])}
              className="flex flex-col items-center gap-1 rounded-xl bg-bg-muted px-2 py-3 text-xs font-semibold text-text-secondary transition hover:bg-bg-overlay"
            >
              <Plus className="h-5 w-5" /> Linha manual
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function SeletorCarteira({
  carteiras,
  value,
  onChange,
  incluirCartoes,
  placeholder,
  className,
  invalido,
}: {
  carteiras: Wallet[];
  value: string | null;
  onChange: (id: string | null) => void;
  incluirCartoes: boolean;
  placeholder: string;
  className?: string;
  invalido?: boolean;
}) {
  const contas = carteiras.filter((w) => w.tipo !== "credito");
  const cartoes = incluirCartoes ? carteiras.filter((w) => w.tipo === "credito") : [];
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={cn(campo, invalido && "ring-2 ring-accent-yellow/70", className)}
    >
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

function CartaoLinha({
  linha,
  pendencias,
  carteiras,
  expenseCats,
  incomeCats,
  isCartao,
  onChange,
  onRemover,
}: {
  linha: LinhaVoz;
  pendencias: string[];
  carteiras: Wallet[];
  expenseCats: Category[];
  incomeCats: Category[];
  isCartao: (id: string | null) => boolean;
  onChange: (m: Partial<LinhaVoz> | ((l: LinhaVoz) => LinhaVoz)) => void;
  onRemover: () => void;
}) {
  const falta = (nome: string) => pendencias.some((p) => p.startsWith(nome));
  const cartao = linha.type === "EXPENSE" && isCartao(linha.carteiraId);
  const categorias = linha.type === "INCOME" ? incomeCats : expenseCats;

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border p-3",
        linha.erro ? "border-status-danger/60" : pendencias.length ? "border-accent-yellow/50" : "border-bg-muted",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-bg-muted p-0.5" role="group" aria-label="Tipo do lançamento">
          {TIPOS.map(({ valor, rotulo, Icone, cor }) => (
            <button
              key={valor}
              type="button"
              aria-pressed={linha.type === valor}
              onClick={() => onChange((l) => trocarTipo(l, valor))}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition",
                linha.type === valor ? cor : "text-text-secondary hover:text-text-primary",
              )}
            >
              <Icone className="h-3.5 w-3.5" /> {rotulo}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onRemover}
          aria-label="Remover lançamento"
          className="grid h-8 w-8 place-items-center rounded-lg text-text-secondary hover:bg-bg-overlay hover:text-status-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className={cn("rounded-lg bg-bg-muted px-2.5 py-1.5", falta("valor") && "ring-2 ring-accent-yellow/70")}>
          <CurrencyInput
            value={linha.value ?? 0}
            onChange={(v) => onChange({ value: v > 0 ? v : null })}
            className={cn(
              "w-full bg-transparent text-lg font-bold outline-none",
              linha.type === "INCOME" ? "text-semantic-income" : linha.type === "EXPENSE" ? "text-accent-red" : "text-accent-brand",
            )}
          />
        </div>
        <input
          type="date"
          value={linha.date}
          onChange={(e) => onChange({ date: e.target.value })}
          aria-label="Data"
          className={cn(campo, "w-auto")}
        />
      </div>

      <input
        type="text"
        value={linha.description}
        maxLength={200}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Descrição"
        aria-label="Descrição"
        className={campo}
      />

      <div className={cn("grid gap-2", cartao ? "grid-cols-[1fr_1fr_auto]" : "grid-cols-2")}>
        {linha.type === "TRANSFER" ? (
          <SeletorCarteira
            carteiras={carteiras}
            value={linha.carteiraDestinoId}
            onChange={(id) => onChange({ carteiraDestinoId: id })}
            incluirCartoes={false}
            placeholder="Para qual carteira?"
            invalido={falta("carteira de destino") || falta("carteiras diferentes")}
          />
        ) : (
          <select
            value={linha.categoryId ?? ""}
            onChange={(e) => onChange({ categoryId: e.target.value || null })}
            aria-label="Categoria"
            className={cn(campo, falta("categoria") && "ring-2 ring-accent-yellow/70")}
          >
            <option value="">{linha.type === "INCOME" ? "Sem categoria" : "Categoria"}</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        <SeletorCarteira
          carteiras={carteiras}
          value={linha.carteiraId}
          onChange={(id) => onChange((l) => ({ ...l, carteiraId: id, parcelas: isCartao(id) ? l.parcelas : 1 }))}
          incluirCartoes={linha.type === "EXPENSE"}
          placeholder={linha.type === "TRANSFER" ? "De qual carteira?" : "Carteira"}
          invalido={falta("carteira")}
        />

        {cartao && (
          <select
            value={linha.parcelas}
            onChange={(e) => onChange({ parcelas: Number(e.target.value) })}
            aria-label="Parcelas"
            className={cn(campo, "w-auto")}
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}x</option>
            ))}
          </select>
        )}
      </div>

      {pendencias.length > 0 && !linha.erro && (
        <p className="text-xs text-accent-yellow">Falta: {pendencias.join(", ")}</p>
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
    </div>
  );
}
