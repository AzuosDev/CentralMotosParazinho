import { cn } from "../../lib/utils";
import type { MotoStatus } from "../../types/api";

const statusLabel: Record<MotoStatus, string> = {
  em_estoque: "Em estoque",
  vendida: "Vendida",
};

// Mesmo vocabulário de cor dos badges de fatura (CartaoPage): azul para "em andamento",
// verde-marca para o que já se encerrou.
const statusCls: Record<MotoStatus, string> = {
  em_estoque: "bg-status-info/15 text-status-info",
  vendida: "bg-accent-brand/15 text-accent-brand",
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
