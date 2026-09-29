import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2 } from "lucide-react";

import { api } from "../../lib/api";
import { getApiErrorMessages } from "../../lib/errors";
import { useToast } from "../ui/Toast";
import { ModalShell } from "./ModalShell";
import type { Cartao } from "../../types/api";

type TemplateLike = {
  id: string;
  title: string;
};

export function VincularRecorrenteModal({
  open,
  onClose,
  template,
  cartaoId,
  cartaoNome,
}: {
  open: boolean;
  onClose: () => void;
  // Modo 1 (ContasPage): a conta recorrente já é conhecida, usuário escolhe o cartão.
  template?: TemplateLike | null;
  // Modo 2 (CartaoPage): o cartão já é conhecido (esta página), usuário escolhe a
  // assinatura. Os dois modos são mutuamente exclusivos — passe um ou outro.
  cartaoId?: string;
  cartaoNome?: string;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [carteiraId, setCarteiraId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const pickingTemplate = !!cartaoId;

  useEffect(() => {
    if (open) {
      setCarteiraId("");
      setTemplateId("");
    }
  }, [open, template, cartaoId]);

  const cartoesQuery = useQuery<Cartao[]>({
    queryKey: ["cartoes"],
    queryFn: async () => {
      const { data } = await api.get<Cartao[]>("/api/cartoes");
      return Array.isArray(data) ? data : [];
    },
    enabled: open && !pickingTemplate,
  });

  // Sem month/year, GET /api/accounts devolve os moldes crus (não instâncias mensais
  // projetadas) — já vem filtrado no backend pra excluir recorrenciaTemplateId, só falta
  // filtrar isRecorrente aqui.
  const templatesQuery = useQuery<TemplateLike[]>({
    queryKey: ["accounts", "recorrentes-templates"],
    queryFn: async () => {
      const { data } = await api.get("/api/accounts", { params: { tipo: "PAGAR" } });
      const list = Array.isArray(data) ? data : [];
      return list
        .filter((item: { isRecorrente?: boolean }) => item.isRecorrente)
        .map((item: { _id: string; title: string }) => ({ id: item._id, title: item.title }));
    },
    enabled: open && pickingTemplate,
  });

  const effectiveTemplateId = template?.id ?? templateId;
  const effectiveCarteiraId = cartaoId ?? carteiraId;
  const selectedTemplateTitle = template?.title ?? templatesQuery.data?.find((t) => t.id === templateId)?.title;

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post("/api/cartoes/vincular-recorrente", {
        templateId: effectiveTemplateId,
        carteiraId: effectiveCarteiraId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      addToast("Assinatura vinculada ao cartão. As próximas cobranças entram na fatura automaticamente.", "success");
      onClose();
    },
    onError: (error) => {
      addToast(getApiErrorMessages(error, "Não foi possível vincular esta assinatura ao cartão.")[0], "error");
    },
  });

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Vincular a um cartão"
      icon={<CreditCard className="h-6 w-6 text-accent-lime" />}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="flex-1 rounded-xl border border-bg-muted bg-transparent px-5 py-3 text-sm font-bold text-text-primary transition hover:bg-bg-overlay disabled:opacity-70"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !effectiveTemplateId || !effectiveCarteiraId}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-lime px-5 py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-70"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Vincular
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          {selectedTemplateTitle ? (
            <>A partir de agora, <span className="font-semibold text-text-primary">"{selectedTemplateTitle}"</span> é cobrada</>
          ) : (
            "A partir de agora, a assinatura escolhida é cobrada"
          )}{" "}
          automaticamente {pickingTemplate ? <>em <span className="font-semibold text-text-primary">{cartaoNome}</span></> : "no cartão escolhido"} todo
          mês, na fatura do ciclo certo — sem precisar marcar como paga manualmente. Isso vale só pra cobranças a
          partir de hoje; meses já pagos não mudam.
        </p>

        {pickingTemplate ? (
          <div>
            <span className="mb-2 block text-sm text-text-secondary">Conta recorrente</span>
            {templatesQuery.isLoading ? (
              <div className="h-12 animate-pulse rounded-xl bg-bg-muted" />
            ) : (templatesQuery.data ?? []).length === 0 ? (
              <p className="rounded-xl bg-yellow-500/10 p-3 text-sm text-status-warning">
                Você não tem nenhuma conta recorrente cadastrada.
              </p>
            ) : (
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none transition focus:border-accent-lime"
              >
                <option value="">Selecione…</option>
                {(templatesQuery.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div>
            <span className="mb-2 block text-sm text-text-secondary">Cartão</span>
            {cartoesQuery.isLoading ? (
              <div className="h-12 animate-pulse rounded-xl bg-bg-muted" />
            ) : (cartoesQuery.data ?? []).length === 0 ? (
              <p className="rounded-xl bg-yellow-500/10 p-3 text-sm text-status-warning">
                Você ainda não tem nenhum cartão cadastrado.
              </p>
            ) : (
              <select
                value={carteiraId}
                onChange={(e) => setCarteiraId(e.target.value)}
                className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none transition focus:border-accent-lime"
              >
                <option value="">Selecione…</option>
                {(cartoesQuery.data ?? []).map((c) => (
                  <option key={c._id} value={c._id}>{c.nome}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
