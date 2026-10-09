import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bike, ChevronLeft } from "lucide-react";

import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { formatCompactValue, formatCurrency, formatDisplayDate } from "../lib/finance";
import { MONTH_NAMES } from "../components/insights/period";
import { ChartTooltip, ReportCard } from "../components/insights/ReportPrimitives";
import { MotoStatusBadge } from "../components/motos/MotoStatusBadge";
import type { MotoRelatorio, MotoRelatorioLinha } from "../types/api";

const MESES_CURTOS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

/** AAAA-MM do mês corrente, no fuso local — é o mês que a loja está vivendo. */
function mesAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

function isMes(value: string | null): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function partes(mes: string) {
  const [ano, numero] = mes.split("-").map(Number);
  return { ano, numero };
}

function rotuloMes(mes: string) {
  const { ano, numero } = partes(mes);
  return `${MONTH_NAMES[numero - 1]} de ${ano}`;
}

function TotalCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "income" | "expense";
}) {
  return (
    <div className="rounded-card bg-bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-sans text-2xl font-bold tabular-nums",
          tone === "income" && "text-semantic-income",
          tone === "expense" && "text-semantic-expense",
          tone === "neutral" && "text-text-primary",
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-text-secondary">{hint}</p>
    </div>
  );
}

/** "R$ 18.000,00 em 12/03/2026" ou "—" para quem segue no pátio. */
function textoVenda(linha: MotoRelatorioLinha) {
  if (linha.valorVenda === null) return "—";
  const data = linha.dataVenda ? formatDisplayDate(linha.dataVenda) : null;
  return data ? `${formatCurrency(linha.valorVenda)} em ${data}` : formatCurrency(linha.valorVenda);
}

function LucroValor({ lucro }: { lucro: number }) {
  const prejuizo = lucro < 0;

  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        prejuizo ? "text-semantic-expense" : "text-semantic-income",
      )}
    >
      {prejuizo ? "−" : "+"}
      {formatCurrency(Math.abs(lucro))}
    </span>
  );
}

export function MotosRelatorioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // O mês vive na URL (?mes=AAAA-MM) para o relatório ser recarregável e compartilhável.
  // Sem o parâmetro, cai no mês corrente, como o resto do app.
  const mesParam = searchParams.get("mes");
  const mes = isMes(mesParam) ? mesParam : mesAtual();
  const { ano, numero } = partes(mes);

  const anos = useMemo(() => {
    const atual = new Date().getFullYear();
    const lista = Array.from({ length: 4 }, (_, index) => atual - index);
    // Um link antigo (?mes=2021-07) tem que conseguir se mostrar no seletor; sem isso o
    // <select> fica sem opção correspondente e exibe outro ano.
    return lista.includes(ano) ? lista : [...lista, ano].sort((a, b) => b - a);
  }, [ano]);

  function irPara(novoMes: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("mes", novoMes);
        return next;
      },
      { replace: true },
    );
  }

  const relatorioQuery = useQuery<MotoRelatorio>({
    queryKey: ["motos", "relatorio", mes],
    queryFn: async () => {
      const { data } = await api.get<MotoRelatorio>("/api/motos/relatorio", { params: { mes } });
      return data;
    },
  });

  const relatorio = relatorioQuery.data;
  // Memoizado para o fallback [] não criar um array novo a cada render e invalidar o
  // useMemo do gráfico logo abaixo.
  const linhas = useMemo(() => relatorio?.motos ?? [], [relatorio]);
  const totais = relatorio?.totais;
  const emEstoque = linhas.filter((linha) => linha.status === "em_estoque").length;

  // Só motos que consumiram dinheiro no mês entram no gráfico, em ordem decrescente: uma
  // barra de R$ 0,00 não diz nada e empurra as outras para baixo.
  const dadosGrafico = useMemo(
    () =>
      linhas
        .filter((linha) => linha.gastosNoMes > 0)
        .sort((a, b) => b.gastosNoMes - a.gastosNoMes)
        .map((linha) => ({ label: linha.placa, total: linha.gastosNoMes })),
    [linhas],
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/motos"
            className="mb-1 inline-flex items-center gap-1 text-sm text-text-secondary transition hover:text-text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            Motos
          </Link>
          <h1 className="font-sans text-3xl font-bold">Relatório mensal</h1>
          <p className="mt-1 text-sm text-text-secondary">{rotuloMes(mes)}</p>
        </div>

        <div className="flex gap-2">
          <select
            value={numero}
            onChange={(event) =>
              irPara(`${ano}-${String(Number(event.target.value)).padStart(2, "0")}`)
            }
            className="rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-sm text-text-primary outline-none focus:border-accent-brand"
            aria-label="Mês do relatório"
          >
            {MESES_CURTOS.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={ano}
            onChange={(event) => irPara(`${event.target.value}-${String(numero).padStart(2, "0")}`)}
            className="rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-sm text-text-primary outline-none focus:border-accent-brand"
            aria-label="Ano do relatório"
          >
            {anos.map((opcao) => (
              <option key={opcao} value={opcao}>
                {opcao}
              </option>
            ))}
          </select>
        </div>
      </div>

      {relatorioQuery.isLoading || !totais ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-card bg-bg-card" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TotalCard
            label="Capital em estoque"
            value={formatCurrency(totais.capitalEmEstoque)}
            hint={
              emEstoque === 0
                ? "Nenhuma moto parada no pátio"
                : `Compra + gastos de ${emEstoque} moto${emEstoque === 1 ? "" : "s"} ainda não vendida${emEstoque === 1 ? "" : "s"}`
            }
          />
          <TotalCard
            label="Gastos do mês"
            value={formatCurrency(totais.gastosDoMes)}
            tone={totais.gastosDoMes > 0 ? "expense" : "neutral"}
            hint="Despesas lançadas em motos com data neste mês"
          />
          <TotalCard
            label={totais.lucroDoMes < 0 ? "Prejuízo do mês" : "Lucro do mês"}
            value={formatCurrency(Math.abs(totais.lucroDoMes))}
            tone={totais.lucroDoMes < 0 ? "expense" : "income"}
            hint="Venda menos custo total das motos vendidas no mês"
          />
          <TotalCard
            label="Motos vendidas"
            value={String(totais.quantidadeVendida)}
            hint={
              totais.quantidadeVendida === 0
                ? "Nenhuma venda registrada neste mês"
                : "Vendas com data dentro do mês"
            }
          />
        </div>
      )}

      <ReportCard
        title="Gastos por moto"
        hint="Só o que foi gasto dentro do mês — o custo total de cada moto está na tabela abaixo."
      >
        {relatorioQuery.isLoading ? (
          <div className="h-56 animate-pulse rounded-xl bg-bg-muted" />
        ) : dadosGrafico.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-secondary">
            Nenhum gasto lançado em moto neste mês.
          </p>
        ) : (
          // Barras horizontais: a placa cabe no eixo sem girar o rótulo (inclusive na
          // largura do celular) e a altura cresce com a quantidade de motos, em vez de
          // comprimir as barras.
          <div style={{ height: Math.max(dadosGrafico.length * 44 + 40, 180) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dadosGrafico}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
              >
                <XAxis
                  type="number"
                  stroke="rgb(var(--chart-axis))"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCompactValue}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={84}
                  stroke="rgb(var(--chart-axis))"
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgb(var(--bg-muted))" }} />
                <Bar
                  name="Gastos no mês"
                  dataKey="total"
                  fill="rgb(var(--color-expense))"
                  radius={[0, 6, 6, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ReportCard>

      <div className="space-y-3">
        <div>
          <h2 className="font-sans text-lg font-bold">Moto por moto</h2>
          <p className="text-sm text-text-secondary">
            Entram as motos em estoque, as vendidas no mês e as que receberam gasto no mês.
          </p>
        </div>

        {relatorioQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl bg-bg-card" />
            ))}
          </div>
        ) : relatorioQuery.isError ? (
          <div className="rounded-2xl bg-accent-red/10 p-5 text-sm text-accent-red">
            Não foi possível carregar o relatório deste mês.
          </div>
        ) : linhas.length === 0 ? (
          <div className="rounded-2xl bg-bg-card p-10 text-center text-text-secondary">
            <Bike className="mx-auto mb-3 h-10 w-10 text-text-muted" />
            <p className="font-semibold">Nada para mostrar em {rotuloMes(mes)}.</p>
            <p className="mt-1 text-sm">Sem moto em estoque, venda ou gasto lançado neste mês.</p>
          </div>
        ) : (
          <>
            {/* Tabela no desktop; os mesmos dados viram cards no celular, onde seis colunas
                não caberiam sem rolagem horizontal. */}
            <div className="hidden overflow-hidden rounded-2xl bg-bg-card lg:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-bg-muted text-left text-xs font-medium uppercase tracking-wide text-text-muted">
                    <th className="px-5 py-3">Moto</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Gastos no mês</th>
                    <th className="px-5 py-3 text-right">Custo total</th>
                    <th className="px-5 py-3 text-right">Venda</th>
                    <th className="px-5 py-3 text-right">Lucro no mês</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg-muted">
                  {linhas.map((linha) => (
                    <tr key={linha._id} className="transition hover:bg-bg-muted/50">
                      <td className="px-5 py-4">
                        <Link
                          to={`/motos/${linha._id}`}
                          className="text-sm font-semibold text-text-primary hover:text-accent-brand"
                        >
                          {linha.modelo}
                        </Link>
                        <p className="text-xs tabular-nums text-text-secondary">{linha.placa}</p>
                      </td>
                      <td className="px-5 py-4">
                        <MotoStatusBadge status={linha.status} />
                        {linha.vendidaNoMes && (
                          <p className="mt-1 text-xs text-text-secondary">neste mês</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {linha.gastosNoMes > 0 ? (
                          // Leva para a lista de transações já filtrada por esta moto e
                          // por este mês — é a conferência do número ao lado.
                          <Link
                            to={`/transactions?motoId=${linha._id}&month=${numero}&year=${ano}`}
                            className="text-sm font-semibold tabular-nums text-text-primary underline-offset-4 hover:text-accent-brand hover:underline"
                            title="Ver os gastos desta moto no mês"
                          >
                            {formatCurrency(linha.gastosNoMes)}
                          </Link>
                        ) : (
                          <span className="text-sm text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right text-sm font-semibold tabular-nums text-text-primary">
                        {formatCurrency(linha.custoTotal)}
                      </td>
                      <td className="px-5 py-4 text-right text-sm tabular-nums text-text-secondary">
                        {textoVenda(linha)}
                      </td>
                      <td className="px-5 py-4 text-right text-sm">
                        {/* lucro só vem preenchido para quem foi vendida dentro do mês: uma
                            moto vendida antes aparece aqui pelos gastos, e o lucro dela não
                            é deste mês. */}
                        {linha.lucro === null ? (
                          <span className="text-text-muted">—</span>
                        ) : (
                          <LucroValor lucro={linha.lucro} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
              {linhas.map((linha) => (
                <div key={linha._id} className="flex flex-col gap-4 rounded-2xl bg-bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/motos/${linha._id}`}
                        className="block truncate font-semibold text-text-primary"
                      >
                        {linha.modelo}
                      </Link>
                      <p className="text-xs tabular-nums text-text-secondary">{linha.placa}</p>
                    </div>
                    <MotoStatusBadge status={linha.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-bg-muted p-3">
                      <p className="text-xs text-text-secondary">Gastos no mês</p>
                      <p className="font-sans text-base font-bold tabular-nums text-text-primary">
                        {formatCurrency(linha.gastosNoMes)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-bg-muted p-3">
                      <p className="text-xs text-text-secondary">Custo total</p>
                      <p className="font-sans text-base font-bold tabular-nums text-text-primary">
                        {formatCurrency(linha.custoTotal)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-text-secondary">
                    <p>Venda: {textoVenda(linha)}</p>
                    {linha.lucro !== null && (
                      <p>
                        {linha.lucro < 0 ? "Prejuízo" : "Lucro"} no mês:{" "}
                        <LucroValor lucro={linha.lucro} />
                      </p>
                    )}
                  </div>

                  {linha.gastosNoMes > 0 && (
                    <Link
                      to={`/transactions?motoId=${linha._id}&month=${numero}&year=${ano}`}
                      className="rounded-xl border border-bg-muted py-2 text-center text-sm font-semibold text-text-primary transition hover:bg-bg-muted"
                    >
                      Ver gastos do mês
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
