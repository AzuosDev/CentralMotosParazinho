import { useCallback, useEffect, useRef, useState } from "react";
import { escolherMimeType } from "../lib/voz";

export type EstadoGravador = "parado" | "pedindo-permissao" | "gravando";

export const DURACAO_MAXIMA_S = 120;

type Gravacao = { blob: Blob; mimeType: string };

/**
 * Grava áudio do microfone com MediaRecorder. Expõe um nível de 0 a 1 (para animar o
 * botão e o usuário ver que está sendo ouvido) e para sozinho em DURACAO_MAXIMA_S, que
 * mantém o arquivo bem abaixo do limite de upload do backend.
 */
export function useGravadorVoz() {
  const [estado, setEstado] = useState<EstadoGravador>("parado");
  const [segundos, setSegundos] = useState(0);
  const [nivel, setNivel] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const resolverRef = useRef<((g: Gravacao | null) => void) | null>(null);
  // Gravação que parou sozinha (limite de duração) antes de alguém chamar parar().
  const pendenteRef = useRef<Gravacao | null>(null);

  const liberarRecursos = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setNivel(0);
  }, []);

  /** Para a gravação e devolve o áudio (ou null se nada foi gravado). */
  const parar = useCallback((): Promise<Gravacao | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      const pendente = pendenteRef.current;
      pendenteRef.current = null;
      return Promise.resolve(pendente);
    }
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const iniciar = useCallback(async () => {
    setErro(null);
    setSegundos(0);
    chunksRef.current = [];
    pendenteRef.current = null;
    setEstado("pedindo-permissao");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const nome = (e as DOMException)?.name;
      setErro(
        nome === "NotAllowedError" || nome === "SecurityError"
          ? "Permita o acesso ao microfone no navegador para lançar por voz."
          : nome === "NotFoundError"
            ? "Nenhum microfone encontrado neste dispositivo."
            : "Não foi possível acessar o microfone.",
      );
      setEstado("parado");
      return false;
    }
    streamRef.current = stream;

    const mimeType = escolherMimeType((m) => MediaRecorder.isTypeSupported(m));
    // Opus a ~32 kbps é inteligível para fala e mantém 2 min em ~0,5 MB.
    const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
    recorderRef.current = recorder;

    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      const tipo = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: tipo });
      const gravacao = blob.size > 0 ? { blob, mimeType: tipo } : null;
      liberarRecursos();
      if (resolverRef.current) resolverRef.current(gravacao);
      else pendenteRef.current = gravacao;
      resolverRef.current = null;
      setEstado("parado");
    };

    // Medidor de nível: só visual, falha silenciosa se o navegador não suportar.
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;
      const dados = new Uint8Array(analyser.frequencyBinCount);
      const medir = () => {
        analyser.getByteTimeDomainData(dados);
        let soma = 0;
        for (const v of dados) soma += ((v - 128) / 128) ** 2;
        setNivel(Math.min(1, Math.sqrt(soma / dados.length) * 4));
        rafRef.current = requestAnimationFrame(medir);
      };
      medir();
    } catch {
      // sem medidor
    }

    recorder.start(250);
    setEstado("gravando");
    const inicio = Date.now();
    timerRef.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - inicio) / 1000);
      setSegundos(s);
      if (s >= DURACAO_MAXIMA_S && recorder.state === "recording") recorder.stop();
    }, 250);
    return true;
  }, [liberarRecursos]);

  /** Descarta a gravação em andamento sem devolver áudio. */
  const cancelar = useCallback(() => {
    const recorder = recorderRef.current;
    resolverRef.current = null;
    pendenteRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        liberarRecursos();
        setEstado("parado");
      };
      recorder.stop();
    } else {
      liberarRecursos();
      setEstado("parado");
    }
  }, [liberarRecursos]);

  // Desmontar no meio da gravação não pode deixar o microfone aberto (ícone vermelho no celular).
  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    liberarRecursos();
  }, [liberarRecursos]);

  return { estado, segundos, nivel, erro, iniciar, parar, cancelar };
}
