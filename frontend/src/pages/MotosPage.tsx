import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, Bike, Pencil, Plus } from "lucide-react";

import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { formatCurrency, formatDisplayDate } from "../lib/finance";
import { MotoStatusBadge } from "../components/motos/MotoStatusBadge";
import { MotoModal } from "../components/modals/MotoModal";
import type { Moto, MotoStatus } from "../types/api";

type Filtro = MotoStatus | "todas";

const filtros: { value: Filtro; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "em_estoque", label: "Em estoque" },
  { value: "vendida", label: "Vendidas" },
];

function isFiltro(value: string | null): value is Filtro {
  return value === "todas" || value === "em_estoque" || value === "vendida";
}

/** "2021 · Vermelha · 24.500 km" — a linha de apoio do modelo, igual no card e na tabela. */
function detalheMoto(moto: Moto) {
  return `${moto.ano} · ${moto.cor} · ${moto.km.toLocaleString("pt-BR")} km`;
}

function LucroCaption({ moto }: { moto: Moto }) {
  if (moto.status !== "vendida" || moto.lucro === null) return null;
  const prejuizo = moto.lucro < 0;

  return (
    <p className="text-xs text-text-secondary">
      {moto.dataVenda ? `Vendida em ${formatDisplayDate(moto.dataVenda)} · ` : ""}
      <span className={cn("font-semibold", prejuizo ? "text-accent-red" : "text-accent-brand")}>
        {prejuizo ? "Prejuízo" : "Lucro"} de {formatCurrency(Math.abs(moto.lucro))}
      </span>
    </p>
  );
}

export function MotosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // O filtro vive na URL para o link ser recarregável e compartilhável — mesmo caminho do
  // filtro de tipo em /transactions.
  const statusParam = searchParams.get("status");
  const filtro: Filtro = isFiltro(statusParam) ? statusParam : "todas";

  const [formOpen, setFormOpen] = useState(false);
  const [motoEmEdicao, setMotoEmEdicao] = useState<Moto | null>(null);

  const motosQuery = useQuery<Moto[]>({
    queryKey: ["motos", { status: filtro }],
    queryFn: async () => {
      const { data } = await api.get<Moto[]>("/api/motos", {
        params: filtro === "todas" ? undefined : { status: filtro },
      });
      return Array.isArray(data) ? data : [];
    },
  });

  const motos = motosQuery.data ?? [];

  function aplicarFiltro(value: Filtro) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === "todas") {
          next.delete("status");
        } else {
          next.set("status", value);
        }
        return next;
      },
      { replace: true },
    );
  }

  function abrirCadastro() {
    setMotoEmEdicao(null);
    setFormOpen(true);
  }

  function abrirEdicao(moto: Moto) {
    setMotoEmEdicao(moto);
    setFormOpen(true);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-text-secondary">Seu estoque</p>
          <h1 className="font-sans text-3xl font-bold">Motos</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/motos/relatorio"
            className="flex items-center gap-2 rounded-xl border border-bg-muted px-4 py-3 text-sm font-semibold text-text-primary transition hover:bg-bg-muted"
          >
            <BarChart2 className="h-4 w-4" />
            Relatório do mês
          </Link>
          <button
            type="button"
            onClick={abrirCadastro}
            className="flex items-center gap-2 rounded-xl bg-accent-brand px-4 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover"
          >
            <Plus className="h-4 w-4" />
            Nova moto
          </button>
        </div>
      </div>

      <div className="flex w-fit gap-1 rounded-xl bg-bg-muted p-1">
        {filtros.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => aplicarFiltro(item.value)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              filtro === item.value
                ? "bg-accent-brand text-white"
                : "text-text-primary hover:bg-bg-overlay",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {motosQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-bg-muted" />
          ))}
        </div>
      ) : motos.length === 0 ? (
        <div className="rounded-2xl bg-bg-card p-10 text-center text-text-secondary">
          <Bike className="mx-auto mb-3 h-10 w-10 text-text-muted" />
          <p className="font-semibold">
            {filtro === "vendida"
              ? "Nenhuma moto vendida por aqui ainda."
              : filtro === "em_estoque"
                ? "Nenhuma moto em estoque."
                : "Nenhuma moto cadastrada ainda."}
          </p>
          <p className="mt-1 text-sm">Clique em "Nova moto" para cadastrar a primeira.</p>
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
                  <th className="px-5 py-3">Placa</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Custo total</th>
                  <th className="px-5 py-3 text-right">Preço sugerido</th>
                  <th className="px-5 py-3">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg-muted">
                {motos.map((moto) => (
                  <tr key={moto._id} className="transition hover:bg-bg-muted/50">
                    <td className="px-5 py-4">
                      <Link
                        to={`/motos/${moto._id}`}
                        className="text-sm font-semibold text-text-primary hover:text-accent-brand"
                      >
                        {moto.modelo}
                      </Link>
                      <p className="text-xs text-text-secondary">{detalheMoto(moto)}</p>
                      <LucroCaption moto={moto} />
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold tabular-nums text-text-primary">
                      {moto.placa}
                    </td>
                    <td className="px-5 py-4">
                      <MotoStatusBadge status={moto.status} />
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-semibold tabular-nums text-text-primary">
                      {formatCurrency(moto.custoTotal)}
                      {moto.custoGastos > 0 && (
                        <span className="block text-xs font-normal text-text-secondary">
                          + {formatCurrency(moto.custoGastos)} de gastos
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-semibold tabular-nums text-text-primary">
                      {formatCurrency(moto.precoSugerido)}
                      {typeof moto.precoAnunciado === "number" && (
                        <span className="block text-xs font-normal text-text-secondary">
                          anunciada por {formatCurrency(moto.precoAnunciado)}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/motos/${moto._id}`}
                          className="rounded-xl border border-bg-muted px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-bg-muted"
                        >
                          Ver ficha
                        </Link>
                        <button
                          type="button"
                          onClick={() => abrirEdicao(moto)}
                          className="rounded-xl border border-bg-muted p-2 text-text-secondary transition hover:bg-bg-muted hover:text-text-primary"
                          aria-label={`Editar ${moto.modelo}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
            {motos.map((moto) => (
              <div key={moto._id} className="flex flex-col gap-4 rounded-2xl bg-bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/motos/${moto._id}`}
                      className="block truncate font-semibold text-text-primary"
                    >
                      {moto.modelo}
                    </Link>
                    <p className="text-xs text-text-secondary">{detalheMoto(moto)}</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                      {moto.placa}
                    </p>
                  </div>
                  <MotoStatusBadge status={moto.status} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-bg-muted p-3">
                    <p className="text-xs text-text-secondary">Custo total</p>
                    <p className="font-sans text-base font-bold text-text-primary">
                      {formatCurrency(moto.custoTotal)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-bg-muted p-3">
                    <p className="text-xs text-text-secondary">Preço sugerido</p>
                    <p className="font-sans text-base font-bold text-text-primary">
                      {formatCurrency(moto.precoSugerido)}
                    </p>
                  </div>
                </div>

                <LucroCaption moto={moto} />

                <div className="flex gap-2">
                  <Link
                    to={`/motos/${moto._id}`}
                    className="flex-1 rounded-xl border border-bg-muted py-2 text-center text-sm font-semibold text-text-primary transition hover:bg-bg-muted"
                  >
                    Ver ficha
                  </Link>
                  <button
                    type="button"
                    onClick={() => abrirEdicao(moto)}
                    className="rounded-xl border border-bg-muted px-3 py-2 text-text-secondary transition hover:bg-bg-muted hover:text-text-primary"
                    aria-label={`Editar ${moto.modelo}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <MotoModal open={formOpen} onClose={() => setFormOpen(false)} moto={motoEmEdicao} />
    </section>
  );
}
