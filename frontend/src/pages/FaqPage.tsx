import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Bug, ChevronDown, HelpCircle, Lightbulb, Loader2, Send } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { getApiErrorMessages } from "../lib/errors";
import { useToast } from "../components/ui/Toast";

type FaqItem = { q: string; a: string };
type FaqTopic = { key: string; label: string; items: FaqItem[] };

const topics: FaqTopic[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    items: [
      {
        q: "O que exatamente é o \"Saldo\" no topo?",
        a: "É quanto você tem agora — a soma de todas as carteiras, exceto cartões de crédito (compra no crédito é dívida, não dinheiro que já saiu). Ele não muda com o mês/ano selecionado no topo; só \"Entradas/Saídas\" e o gráfico mudam com o período escolhido.",
      },
      {
        q: "Por que uma compra no cartão aparece em \"Gastos por Categoria\" mas não em \"Saídas\"?",
        a: "\"Gastos por categoria\" responde \"no que eu gastei\" e inclui compras no cartão. \"Saídas\" responde \"quanto dinheiro saiu de verdade\" — só conta a compra quando a fatura é paga.",
      },
      {
        q: "Editei ou criei uma carteira e o Saldo não atualizou na hora — é bug?",
        a: "Não deveria mais acontecer: editar, criar, excluir ou transferir entre carteiras já atualiza o Saldo do Dashboard na hora. Se acontecer de novo, um recarregamento da página resolve.",
      },
    ],
  },
  {
    key: "transacoes",
    label: "Transações",
    items: [
      {
        q: "O que é uma transação \"agendada\"?",
        a: "Uma transação com data futura. Ela fica registrada, mas só desconta ou soma no saldo da carteira quando a data chega.",
      },
      {
        q: "Apaguei uma categoria — o que acontece com as transações que usavam ela?",
        a: "Elas continuam existindo normalmente, só ficam sem categoria — nada é apagado nem reatribuído automaticamente.",
      },
      {
        q: "Qual a diferença entre \"Gastos\", \"Ganhos\" e \"Transações\"?",
        a: "\"Transações\" e \"Ganhos\" são a mesma lista de lançamentos — Ganhos só abre já filtrada pra receitas. \"Gastos\" é diferente: é um resumo por categoria (gráfico e ranking dos maiores gastos do período), não uma lista de lançamentos avulsos.",
      },
      {
        q: "Uma transferência entre minhas próprias carteiras conta como gasto?",
        a: "Não — transferência move dinheiro dentro das suas próprias carteiras, então não entra em Entradas/Saídas nem no gráfico de evolução.",
      },
    ],
  },
  {
    key: "carteiras",
    label: "Carteiras",
    items: [
      {
        q: "Qual a diferença entre excluir e arquivar uma carteira?",
        a: "Excluir remove de vez. Arquivar esconde da lista e do total de patrimônio, mas mantém o histórico de transações passadas — bom pra uma carteira que você parou de usar mas não quer perder o registro.",
      },
      {
        q: "Uma carteira pode ficar com saldo negativo?",
        a: "Sim — o app não bloqueia um gasto maior que o saldo disponível; o saldo só reflete a conta (entradas − saídas) e pode ficar negativo.",
      },
      {
        q: "O que é a carteira \"Saldo Histórico (Sem Carteira)\"?",
        a: "É um agrupamento automático dos lançamentos feitos antes de o app ter múltiplas carteiras — não é algo que você criou, e não dá pra editar ou excluir. Pra tirar uma transação de lá, vá em Transações, selecione os lançamentos antigos e atribua uma carteira real a eles.",
      },
    ],
  },
  {
    key: "cartoes",
    label: "Cartões",
    items: [
      {
        q: "Comprei no cartão, mas meu Saldo não mudou. Cadê meu dinheiro?",
        a: "Compra no cartão é dívida, não dinheiro saindo — ela só desconta do Saldo quando você paga a fatura. Por isso ela aparece em \"no que eu gastei\" (categorias), mas não tira nada do Saldo na hora.",
      },
      {
        q: "O que é \"saldo rotativo\"?",
        a: "É o valor que sobrou de uma fatura paga parcialmente e foi arrastado pra próxima, geralmente com juros aplicados.",
      },
      {
        q: "Por que a fatura selecionada mudou sozinha?",
        a: "A tela sempre abre a fatura do mês atual. Se você tem um parcelamento de vários meses, pode existir mais de uma fatura \"em aberto\" ao mesmo tempo — a do mês corrente é sempre priorizada.",
      },
      {
        q: "Qual a diferença entre \"Marcar como pago\" e \"Pagar fatura\"?",
        a: "\"Marcar como pago\" é pra contas normais em Contas a Pagar. O cartão tem seu próprio fluxo — \"Pagar fatura\", dentro da tela do cartão — que desconta do Saldo e aparece em Saídas/gráfico.",
      },
      {
        q: "Qual a diferença entre \"Estornar\" e \"Desfazer pagamento\"?",
        a: "Estornar reverte a compra (a fatura fica menor). Desfazer pagamento reverte o dinheiro que saiu pra pagar a fatura (o Saldo volta). São ações em momentos diferentes.",
      },
      {
        q: "Paguei a fatura e ela voltou a aparecer como pendente. Por quê?",
        a: "Uma compra nova ou atrasada pode cair num ciclo já pago, reabrindo saldo devedor — o app reflete isso corretamente em vez de manter a fatura marcada como paga por engano.",
      },
      {
        q: "Por que não consigo excluir essa compra parcelada?",
        a: "Alguma das faturas afetadas já teve pagamento registrado. É preciso \"Desfazer pagamento\" nela antes — a mensagem de erro sempre diz qual fatura está travando.",
      },
      {
        q: "Vinculei uma assinatura ao cartão. Preciso marcar como paga todo mês?",
        a: "Não — a cobrança entra sozinha na fatura no vencimento. Por isso os botões de ação manual somem e aparece o selo \"Vinculada a [cartão]\".",
      },
      {
        q: "Posso arquivar um cartão que não uso mais?",
        a: "Sim, mas só se não houver fatura em aberto nem parcela futura pendente. O histórico continua acessível, ele só some das listas.",
      },
    ],
  },
  {
    key: "contas",
    label: "Contas",
    items: [
      {
        q: "Qual a diferença entre \"Marcar como pago\" e \"Pagar fatura\"?",
        a: "\"Marcar como pago\" é pra contas normais aqui em Contas a Pagar — desconta direto de uma carteira de dinheiro. Se a conta estiver vinculada a um cartão, esse botão nem aparece mais: a cobrança entra sozinha na fatura.",
      },
      {
        q: "Como faço uma assinatura (Netflix, academia...) ser cobrada automaticamente no cartão?",
        a: "Na conta recorrente, toque em \"Vincular a um cartão\" e escolha o cartão. A partir daí a cobrança entra sozinha na fatura certa todo mês, sem precisar marcar como paga.",
      },
      {
        q: "Posso lançar uma conta atrasada de um mês passado?",
        a: "Sim — a data original que você informar é respeitada, não vira a data de hoje.",
      },
      {
        q: "O que significa uma conta estar \"recorrente\"?",
        a: "É um molde que se repete todo mês (ex: aluguel, internet) — cada mês gera uma nova ocorrência automaticamente, sem precisar recriar a conta.",
      },
    ],
  },
  {
    key: "metas",
    label: "Metas Financeiras",
    items: [
      {
        q: "Uma compra no cartão conta pra minha meta?",
        a: "Sim — se a categoria da compra estiver vinculada a uma meta, ela soma no progresso mesmo sendo no crédito, diferente do Saldo, que só desconta quando a fatura é paga.",
      },
      {
        q: "O que acontece com a meta se eu estornar uma compra?",
        a: "O progresso da meta é revertido junto — estornar desfaz o efeito da compra em tudo que ela tinha afetado.",
      },
    ],
  },
];

export function FaqPage() {
  const [searchParams] = useSearchParams();
  const requestedTopic = searchParams.get("topic");
  const initialTopic = topics.some((t) => t.key === requestedTopic) ? requestedTopic! : topics[0].key;

  const [topic, setTopic] = useState(initialTopic);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const active = useMemo(() => topics.find((t) => t.key === topic) ?? topics[0], [topic]);

  return (
    <section className="space-y-6">
      <div>
        <p className="flex items-center gap-1.5 text-sm text-text-secondary">
          <HelpCircle className="h-3.5 w-3.5" /> Ajuda
        </p>
        <h1 className="font-sans text-2xl font-bold">Perguntas Frequentes</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          Dúvidas comuns, organizadas por tela do app.
        </p>
      </div>

      <div className="flex w-full flex-wrap gap-1 rounded-xl bg-bg-muted p-1">
        {topics.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTopic(t.key);
              setOpenIndex(null);
            }}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              topic === t.key ? "bg-accent-lime text-black" : "text-white hover:bg-bg-overlay",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 rounded-2xl bg-bg-card p-4">
        {active.items.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <div key={item.q} className="rounded-xl border border-bg-muted">
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-white"
              >
                {item.q}
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition", isOpen && "rotate-180")} />
              </button>
              {isOpen && <p className="px-4 pb-3.5 text-sm text-text-secondary">{item.a}</p>}
            </div>
          );
        })}
      </div>

      <SupportForm />
    </section>
  );
}

function SupportForm() {
  const { addToast } = useToast();
  const [tipo, setTipo] = useState<"bug" | "sugestao">("bug");
  const [mensagem, setMensagem] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post("/api/support/messages", { tipo, mensagem: mensagem.trim() });
    },
    onSuccess: () => {
      addToast("Mensagem enviada! Obrigado pelo retorno.");
      setMensagem("");
    },
    onError: (error) => {
      getApiErrorMessages(error).forEach((message) => addToast(message, "error"));
    },
  });

  const tipoOptions = [
    { value: "bug" as const, label: "Erro", icon: Bug },
    { value: "sugestao" as const, label: "Sugestão", icon: Lightbulb },
  ];

  return (
    <div className="rounded-2xl bg-bg-card p-5">
      <h2 className="font-sans text-lg font-bold text-white">Não achou sua dúvida?</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Relate um erro ou mande uma sugestão — a mensagem vai direto pro suporte.
      </p>

      <div className="mt-4 flex w-fit gap-1 rounded-xl bg-bg-muted p-1">
        {tipoOptions.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTipo(value)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition",
              tipo === value ? "bg-accent-lime text-black" : "text-white hover:bg-bg-overlay",
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <textarea
        id="support-mensagem"
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        placeholder={tipo === "bug" ? "O que aconteceu? Em qual tela?" : "O que você gostaria de ver no app?"}
        rows={4}
        maxLength={2000}
        className="mt-4 w-full resize-none rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none transition placeholder:text-text-muted focus:border-accent-lime"
      />

      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mensagem.trim().length < 5 || mutation.isPending}
        className="mt-3 flex items-center gap-2 rounded-xl bg-accent-lime px-4 py-2.5 text-sm font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Enviar
      </button>
    </div>
  );
}
