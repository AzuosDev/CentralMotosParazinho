import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import {
  AlertTriangle,
  Camera,
  Check,
  Fingerprint,
  Globe,
  KeyRound,
  Loader2,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  User as UserIcon,
  X,
} from "lucide-react";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON, PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";

import { api } from "../../lib/api";
import { clearTokens, getRefreshToken } from "../../lib/auth";
import { getApiErrorMessages } from "../../lib/errors";
import { useTheme } from "../../hooks/useTheme";
import { ModalShell } from "./ModalShell";
import type { User } from "../../types/api";

// Schemas

const nameSchema = z.object({
  name: z.string().max(100, "Use até 100 caracteres."),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z
      .string()
      .min(8, "Mínimo de 8 caracteres.")
      .regex(/(?=.*[A-Z])/, "Deve conter ao menos uma letra maiúscula.")
      .regex(/(?=.*\d)/, "Deve conter ao menos um número."),
    confirmPassword: z.string().min(1, "Confirme a nova senha."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

type NameValues = z.infer<typeof nameSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

type WebAuthnCredential = {
  credentialId: string;
  deviceType?: string;
  backedUp?: boolean;
  transports?: string[];
  createdAt?: string;
};

// Helpers

function credentialLabel(cred: WebAuthnCredential): string {
  if (cred.backedUp || cred.deviceType === "multiDevice") return "Passkey sincronizada";
  if (cred.transports?.includes("internal")) return "Biometria do dispositivo";
  if (cred.transports?.includes("usb")) return "Chave de segurança USB";
  return "Chave de acesso";
}

function compressImage(file: File, maxSize = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ({ target }) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) { height = Math.round((height * maxSize) / width); width = maxSize; }
        } else {
          if (height > maxSize) { width = Math.round((width * maxSize) / height); height = maxSize; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas not supported")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Sub-components

const inputClass =
  "w-full rounded-xl border border-bg-overlay bg-bg-card px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent-lime placeholder:text-text-muted";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bg-muted p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">{title}</p>
      {children}
    </div>
  );
}

// Main component

export function UserProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nameSaved, setNameSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hasGravatar, setHasGravatar] = useState<boolean | null>(null);
  const [reauthedToken, setReauthedToken] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const userQuery = useQuery<User>({
    queryKey: ["user-profile"],
    queryFn: () => api.get<User>("/api/users/me").then((r) => r.data),
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });

  const credentialsQuery = useQuery<WebAuthnCredential[]>({
    queryKey: ["webauthn-credentials"],
    queryFn: () => api.get<{ credentialId: string }[]>("/api/auth/webauthn/credentials").then((r) => r.data),
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });
  const webAuthnAvailable = (credentialsQuery.data?.length ?? 0) > 0 && browserSupportsWebAuthn();

  const user = userQuery.data;
  const email = user?.email ?? "";
  const avatarUrl = user?.avatarUrl;
  const gravatarUrl = user?.gravatarUrl;
  const initial = (user?.name || email).charAt(0).toUpperCase();

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  useEffect(() => {
    if (!gravatarUrl) return;
    setHasGravatar(null);
    const probeUrl = gravatarUrl.replace("d=mp", "d=404");
    const img = new Image();
    img.onload = () => setHasGravatar(true);
    img.onerror = () => setHasGravatar(false);
    img.src = probeUrl;
  }, [gravatarUrl]);

  // Forms

  const nameForm = useForm<NameValues>({
    resolver: zodResolver(nameSchema),
    values: { name: user?.name ?? "" },
  });

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  // Mutations

  const updateAvatarMutation = useMutation({
    mutationFn: (url: string | null) =>
      api.patch<User>("/api/users/me/avatar", { avatarUrl: url }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      setUploadError(null);
    },
    onError: (error) => {
      setUploadError(getApiErrorMessages(error, "Erro ao salvar imagem.").join(" "));
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: (data: NameValues) =>
      api.patch<User>("/api/users/me", data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword?: string; reauthedToken?: string; newPassword: string }) =>
      api.patch("/api/users/me/password", data),
    onSuccess: () => {
      passwordForm.reset();
      setReauthedToken(null);
      setBiometricError(null);
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2500);
    },
    onError: (error) => {
      const [msg] = getApiErrorMessages(error, "Erro ao alterar a senha.");
      passwordForm.setError("currentPassword", { message: msg });
    },
  });

  const handleBiometricConfirm = async () => {
    setBiometricError(null);
    setBiometricLoading(true);
    try {
      const { data: options } = await api.post<PublicKeyCredentialRequestOptionsJSON>(
        "/api/auth/webauthn/reauth/options",
      );
      const response = await startAuthentication({ optionsJSON: options });
      const { data } = await api.post<{ reauthedToken: string }>(
        "/api/auth/webauthn/reauth/verify",
        response,
      );
      setReauthedToken(data.reauthedToken);
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === "NotAllowedError") {
        setBiometricError("Operação cancelada pelo dispositivo.");
      } else {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setBiometricError(msg ?? "Não foi possível autenticar via biometria.");
      }
    } finally {
      setBiometricLoading(false);
    }
  };

  const removeCredentialMutation = useMutation({
    mutationFn: (credentialId: string) =>
      api.delete(`/api/auth/webauthn/credentials/${encodeURIComponent(credentialId)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webauthn-credentials"] });
    },
  });

  const handleRegisterBiometric = async () => {
    setRegisterError(null);
    setRegisterLoading(true);
    try {
      const { data: options } = await api.post<PublicKeyCredentialCreationOptionsJSON>(
        "/api/auth/webauthn/register/options",
      );
      const response = await startRegistration({ optionsJSON: options });
      await api.post("/api/auth/webauthn/register/verify", response);
      queryClient.invalidateQueries({ queryKey: ["webauthn-credentials"] });
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === "NotAllowedError") {
        setRegisterError("Operação cancelada pelo dispositivo.");
      } else if (name === "InvalidStateError") {
        setRegisterError("Este dispositivo já está cadastrado.");
      } else {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setRegisterError(msg ?? "Não foi possível cadastrar a biometria.");
      }
    } finally {
      setRegisterLoading(false);
    }
  };

  const resetDataMutation = useMutation({
    mutationFn: () => api.delete("/api/users/me/data"),
    onSuccess: () => {
      queryClient.clear();
      window.location.reload();
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => api.delete("/api/users/me"),
    onSuccess: async () => {
      try {
        await api.post("/api/auth/logout", { refreshToken: getRefreshToken() });
      } catch { /* ignored: account already deleted */ }
      clearTokens();
      navigate("/login", { replace: true });
    },
  });

  // Handlers

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Selecione um arquivo de imagem válido.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("A imagem deve ter menos de 10 MB.");
      return;
    }
    setUploadError(null);
    try {
      const compressed = await compressImage(file);
      updateAvatarMutation.mutate(compressed);
    } catch {
      setUploadError("Não foi possível processar a imagem.");
    }
  };

  const handleUseGravatar = () => {
    if (gravatarUrl) updateAvatarMutation.mutate(gravatarUrl);
  };

  const handleLogout = async () => {
    try {
      await api.post("/api/auth/logout", { refreshToken: getRefreshToken() });
    } catch { /* ignored */ }
    clearTokens();
    queryClient.clear();
    navigate("/login", { replace: true });
  };

  const handleClose = () => {
    setShowDeleteConfirm(false);
    setShowResetConfirm(false);
    onClose();
  };

  // Render

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      title="Minha Conta"
      icon={<UserIcon className="h-6 w-6 text-accent-lime" />}
    >
      {/* ── Avatar section ── */}
      <div className="mb-5 flex flex-col items-center gap-3 pt-1">
        {/* Clickable avatar */}
        <div className="group relative">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={updateAvatarMutation.isPending}
            className="relative block overflow-hidden rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-lime"
            aria-label="Alterar foto de perfil"
          >
            {avatarUrl && !imgError ? (
              <img
                src={avatarUrl}
                alt={user?.name || email}
                className="h-20 w-20 rounded-full object-cover ring-4 ring-accent-lime/20"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="grid h-20 w-20 place-items-center rounded-full bg-bg-muted text-3xl font-bold text-accent-lime ring-4 ring-accent-lime/20">
                {userQuery.isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
                ) : (
                  initial || "?"
                )}
              </div>
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition group-hover:opacity-100">
              <Camera className="h-6 w-6 text-white" />
            </div>
          </button>

          {/* Upload loading indicator */}
          {updateAvatarMutation.isPending && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
        </div>

        {/* Email */}
        {userQuery.isLoading ? (
          <div className="h-4 w-40 animate-pulse rounded bg-bg-muted" />
        ) : (
          <p className="text-sm text-text-secondary">{email}</p>
        )}

        {/* Avatar action buttons */}
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={updateAvatarMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            Carregar foto
          </button>

          <button
            type="button"
            onClick={handleUseGravatar}
            disabled={updateAvatarMutation.isPending || hasGravatar !== true}
            className="flex items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary disabled:opacity-50"
            title={
              hasGravatar === null
                ? "Verificando Gravatar..."
                : hasGravatar
                  ? "Usar a foto do seu perfil Gravatar (gravatar.com)"
                  : "Nenhuma foto encontrada no Gravatar com este e-mail"
            }
          >
            <Globe className="h-3.5 w-3.5" />
            {hasGravatar === null ? "Verificando..." : "Usar Gravatar"}
          </button>

          {avatarUrl && (
            <button
              type="button"
              onClick={() => updateAvatarMutation.mutate(null)}
              disabled={updateAvatarMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-xs font-medium text-accent-red transition hover:bg-accent-red/10 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Remover foto
            </button>
          )}
        </div>

        {uploadError && (
          <p className="text-center text-xs text-accent-red">{uploadError}</p>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <div className="space-y-3">
        {/* ── Nome ── */}
        <SectionCard title="Nome de Exibição">
          <form
            onSubmit={nameForm.handleSubmit((data) => updateNameMutation.mutate(data))}
            className="space-y-3"
          >
            <input
              type="text"
              placeholder="Seu nome"
              autoComplete="name"
              className={inputClass}
              {...nameForm.register("name")}
            />
            {nameForm.formState.errors.name && (
              <p className="text-xs text-accent-red">{nameForm.formState.errors.name.message}</p>
            )}
            {updateNameMutation.isError && (
              <p className="text-xs text-accent-red">
                {getApiErrorMessages(updateNameMutation.error, "Erro ao salvar nome.").join(" ")}
              </p>
            )}
            <button
              type="submit"
              disabled={updateNameMutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-lime px-4 py-2.5 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-70"
            >
              {updateNameMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {nameSaved && <Check className="h-4 w-4" />}
              {nameSaved ? "Salvo!" : "Salvar Nome"}
            </button>
          </form>
        </SectionCard>

        {/* ── Senha ── */}
        <SectionCard title="Alterar Senha">
          <form
            onSubmit={passwordForm.handleSubmit((data) => {
              if (reauthedToken) {
                return changePasswordMutation.mutate({ reauthedToken, newPassword: data.newPassword });
              }
              if (!data.currentPassword) {
                passwordForm.setError("currentPassword", { message: "Informe a senha atual." });
                return;
              }
              return changePasswordMutation.mutate({ currentPassword: data.currentPassword, newPassword: data.newPassword });
            })}
            className="space-y-3"
          >
            {/* Campo senha atual, oculto quando biometria confirmada */}
            {reauthedToken ? (
              <div className="flex items-center justify-between rounded-xl bg-accent-lime/10 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-accent-lime">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  Biometria confirmada
                </div>
                <button
                  type="button"
                  onClick={() => setReauthedToken(null)}
                  className="text-xs text-text-secondary underline hover:text-text-primary"
                >
                  Trocar
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="password"
                  placeholder="Senha atual"
                  autoComplete="current-password"
                  className={inputClass}
                  {...passwordForm.register("currentPassword")}
                />
                {passwordForm.formState.errors.currentPassword && (
                  <p className="mt-1 text-xs text-accent-red">
                    {passwordForm.formState.errors.currentPassword.message}
                  </p>
                )}
                {webAuthnAvailable && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={handleBiometricConfirm}
                      disabled={biometricLoading}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary disabled:opacity-50"
                    >
                      {biometricLoading ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Aguardando biometria...</>
                      ) : (
                        <><Fingerprint className="h-3.5 w-3.5 text-accent-lime" /> Confirmar com biometria</>
                      )}
                    </button>
                    {biometricError && (
                      <p className="mt-1 text-xs text-accent-red">{biometricError}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div>
              <input
                type="password"
                placeholder="Nova senha"
                autoComplete="new-password"
                className={inputClass}
                {...passwordForm.register("newPassword")}
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="mt-1 text-xs text-accent-red">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>
            <div>
              <input
                type="password"
                placeholder="Confirmar nova senha"
                autoComplete="new-password"
                className={inputClass}
                {...passwordForm.register("confirmPassword")}
              />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="mt-1 text-xs text-accent-red">
                  {passwordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>
            {passwordSaved && (
              <p className="flex items-center gap-1 text-xs text-accent-lime">
                <Check className="h-3.5 w-3.5" /> Senha alterada com sucesso!
              </p>
            )}
            <button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-lime px-4 py-2.5 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-70"
            >
              {changePasswordMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <KeyRound className="h-4 w-4" />
              Alterar Senha
            </button>
          </form>
        </SectionCard>

        {/* ── Biometria / Passkeys ── */}
        {browserSupportsWebAuthn() && (
          <SectionCard title="Biometria / Passkeys">
            {credentialsQuery.isLoading ? (
              <div className="mb-3 h-10 animate-pulse rounded-xl bg-bg-overlay" />
            ) : (credentialsQuery.data?.length ?? 0) === 0 ? (
              <p className="mb-3 text-xs text-text-muted">Nenhuma chave biométrica cadastrada.</p>
            ) : (
              <ul className="mb-3 space-y-2">
                {credentialsQuery.data?.map((cred) => (
                  <li
                    key={cred.credentialId}
                    className="flex items-center justify-between rounded-xl bg-bg-overlay px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Fingerprint className="h-4 w-4 shrink-0 text-accent-lime" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-text-primary">
                          {credentialLabel(cred)}
                        </p>
                        {cred.createdAt && (
                          <p className="text-xs text-text-muted">
                            {new Date(cred.createdAt).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCredentialMutation.mutate(cred.credentialId)}
                      disabled={removeCredentialMutation.isPending}
                      className="ml-2 shrink-0 rounded-lg p-1.5 text-text-muted transition hover:bg-accent-red/10 hover:text-accent-red disabled:opacity-50"
                      aria-label="Remover credencial"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={handleRegisterBiometric}
              disabled={registerLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-accent-lime/40 px-4 py-2.5 text-sm font-medium text-accent-lime transition hover:bg-accent-lime/5 disabled:opacity-50"
            >
              {registerLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aguardando dispositivo...
                </>
              ) : (
                <>
                  <Fingerprint className="h-4 w-4" />
                  Adicionar biometria
                </>
              )}
            </button>
            {registerError && (
              <p className="mt-2 text-xs text-accent-red">{registerError}</p>
            )}
          </SectionCard>
        )}

        {/* ── Conta ── */}
        <SectionCard title="Conta">
          <div className="space-y-1">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary"
            >
              {isDark ? (
                <Sun className="h-5 w-5 shrink-0" />
              ) : (
                <Moon className="h-5 w-5 shrink-0" />
              )}
              {isDark ? "Ativar Tema Claro" : "Ativar Tema Escuro"}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              Trocar de Conta
            </button>

            {!showResetConfirm ? (
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-accent-red transition hover:bg-accent-red/10"
              >
                <Trash2 className="h-5 w-5 shrink-0" />
                Limpar Todos os Dados
              </button>
            ) : (
              <div className="space-y-3 rounded-xl border border-accent-red/30 bg-accent-red/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-red" />
                  <p className="text-xs text-text-secondary">
                    Esta ação é{" "}
                    <span className="font-semibold text-accent-red">irreversível</span>. Todas as
                    suas transações e carteiras serão apagadas permanentemente.
                  </p>
                </div>
                {resetDataMutation.isError && (
                  <p className="text-xs text-accent-red">
                    {getApiErrorMessages(resetDataMutation.error, "Erro ao limpar dados.").join(" ")}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 rounded-xl border border-bg-overlay px-3 py-2 text-xs font-semibold text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => resetDataMutation.mutate()}
                    disabled={resetDataMutation.isPending}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent-red px-3 py-2 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-70"
                  >
                    {resetDataMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Confirmar Reset
                  </button>
                </div>
              </div>
            )}

            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-accent-red transition hover:bg-accent-red/10"
              >
                <Trash2 className="h-5 w-5 shrink-0" />
                Excluir Conta
              </button>
            ) : (
              <div className="space-y-3 rounded-xl border border-accent-red/30 bg-accent-red/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-red" />
                  <p className="text-xs text-text-secondary">
                    Esta ação é{" "}
                    <span className="font-semibold text-accent-red">irreversível</span>. Todos os
                    seus dados serão excluídos permanentemente.
                  </p>
                </div>
                {deleteAccountMutation.isError && (
                  <p className="text-xs text-accent-red">
                    {getApiErrorMessages(deleteAccountMutation.error, "Erro ao excluir conta.").join(" ")}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 rounded-xl border border-bg-overlay px-3 py-2 text-xs font-semibold text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteAccountMutation.mutate()}
                    disabled={deleteAccountMutation.isPending}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent-red px-3 py-2 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-70"
                  >
                    {deleteAccountMutation.isPending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    Confirmar Exclusão
                  </button>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </ModalShell>
  );
}
