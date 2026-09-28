import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";
import { getApiErrorMessages } from "../../lib/errors";
import { useToast } from "../ui/Toast";

type SupportReply = {
  _id: string;
  authorRole: "user" | "admin";
  mensagem: string;
  createdAt: string;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function SupportThread({
  messageId,
  viewerRole,
  invalidateListKey,
}: {
  messageId: string;
  viewerRole: "admin" | "user";
  invalidateListKey: string[];
}) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");

  const threadQuery = useQuery<{ replies: SupportReply[] }>({
    queryKey: ["support-thread", messageId],
    queryFn: async () => {
      const { data } = await api.get(`/api/support/messages/${messageId}/thread`);
      return data;
    },
    staleTime: 0,
    refetchInterval: 4000,
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/api/support/messages/${messageId}/replies`, { mensagem: reply.trim() });
    },
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["support-thread", messageId] });
      queryClient.invalidateQueries({ queryKey: invalidateListKey });
    },
    onError: (error) => {
      getApiErrorMessages(error).forEach((message) => addToast(message, "error"));
    },
  });

  const replies = threadQuery.data?.replies ?? [];

  // Avisa com um toast quando chega resposta nova do outro lado enquanto a conversa
  // está aberta (o polling acima já traz o dado; aqui só decide quando notificar).
  const seenCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (!threadQuery.data) return;
    const previous = seenCountRef.current;
    if (previous !== null && replies.length > previous) {
      const newest = replies[replies.length - 1];
      if (newest.authorRole !== viewerRole) {
        addToast(viewerRole === "admin" ? "Nova resposta do usuário." : "Nova resposta do suporte.");
      }
    }
    seenCountRef.current = replies.length;
  }, [threadQuery.data, replies, viewerRole, addToast]);

  return (
    <div className="mt-3 border-t border-bg-muted pt-3">
      {threadQuery.isLoading ? (
        <div className="flex items-center justify-center py-4 text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : replies.length > 0 ? (
        <div className="flex flex-col gap-2">
          {replies.map((r) => {
            const isViewer = r.authorRole === viewerRole;
            const label = r.authorRole === "admin" ? (viewerRole === "admin" ? "Você" : "Suporte") : viewerRole === "user" ? "Você" : "Usuário";
            return (
              <div
                key={r._id}
                className={cn(
                  "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm",
                  isViewer ? "self-end bg-accent-lime/15 text-white" : "self-start bg-bg-muted text-white",
                )}
              >
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-text-secondary">
                  <span className={r.authorRole === "admin" ? "text-accent-lime" : undefined}>{label}</span>
                  <span>{formatDateTime(r.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap">{r.mensagem}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-text-muted">Ainda sem respostas nessa conversa.</p>
      )}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          id={`support-reply-${messageId}`}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder={viewerRole === "admin" ? "Responder ao usuário..." : "Escreva sua resposta..."}
          rows={2}
          maxLength={2000}
          className="w-full resize-none rounded-xl border border-bg-muted bg-bg-muted px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-text-muted focus:border-accent-lime"
        />
        <button
          type="button"
          onClick={() => replyMutation.mutate()}
          disabled={reply.trim().length === 0 || replyMutation.isPending}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-accent-lime px-3.5 py-2.5 text-sm font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {replyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
