import { cn } from "../../lib/utils";
import type { MotoStatus } from "../../types/api";

const statusLabel: Record<MotoStatus, string> = {
  em_estoque: "Em estoque",
  vendida: "Vendida",
};

// Mesmo vocabulário dos badges de fatura (CartaoPage) e de conta paga (ContasPage):
// neutro para "em andamento", verde para o que se encerrou com dinheiro entrando.
// "Vendida" não pode ser vermelha: numa lista de estoque isso pinta de alerta justamente
// a moto que deu certo, e gasta no normal a cor que só deveria acender no problema.
const statusCls: Record<MotoStatus, string> = {
  em_estoque: "bg-status-info/15 text-status-info",
  vendida: "bg-semantic-income/15 text-semantic-income",
};

export function MotoStatusBadge({
  status,
  className,
}: {
  status: MotoStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
        statusCls[status],
        className,
      )}
    >
      {statusLabel[status]}
    </span>
  );
}
