import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
// llama-3.3-70b-versatile foi aposentado na Groq (404 model_not_found) — gpt-oss-120b separa
// bem vários lançamentos numa fala só e responde em ~3s no modo JSON.
const MODELO_PADRAO = 'openai/gpt-oss-120b';
const MODELO_TRANSCRICAO_PADRAO = 'whisper-large-v3-turbo';

// Erros de TLS que indicam HTTPS interceptado (antivírus com "verificação de conexões
// seguras", ex.: Kaspersky, ou proxy corporativo) — o navegador confia no certificado
// dele via repositório do Windows, o Node não. Ver `--use-system-ca` em start:dev.
const ERROS_CERTIFICADO = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_UNTRUSTED',
]);

// Whisper da Groq exige que o nome do arquivo tenha uma extensão reconhecida — o mimetype
// sozinho não basta. Safari/iOS grava em audio/mp4; Chrome/Firefox/Android em webm/ogg.
const EXTENSAO_POR_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'video/webm': 'webm',
};

export function extensaoDoAudio(mimetype: string): string | null {
  const base = (mimetype || '').split(';')[0].trim().toLowerCase();
  return EXTENSAO_POR_MIME[base] ?? null;
}

/**
 * Cliente mínimo da API da Groq (compatível com OpenAI) via fetch nativo — sem SDK, para
 * não adicionar dependência só por dois endpoints. É um provider próprio para que os specs
 * possam substituí-lo (overrideProvider) sem tocar na rede.
 *
 * Modelos configuráveis por env porque a Groq aposenta modelos com frequência; trocar o
 * modelo não deveria exigir deploy de código.
 */
@Injectable()
export class GroqClient {
  constructor(private readonly config: ConfigService) {}

  get configurado(): boolean {
    return Boolean(this.config.get<string>('GROQ_API_KEY'));
  }

  private get apiKey(): string {
    const key = this.config.get<string>('GROQ_API_KEY');
    if (!key) {
      throw new ServiceUnavailableException('O lançamento por voz não está configurado neste servidor.');
    }
    return key;
  }

  async transcrever(audio: Buffer, mimetype: string, dicas?: string): Promise<string> {
    const ext = extensaoDoAudio(mimetype) ?? 'webm';
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimetype || 'audio/webm' }), `gravacao.${ext}`);
    form.append('model', this.config.get<string>('GROQ_STT_MODEL') || MODELO_TRANSCRICAO_PADRAO);
    form.append('language', 'pt');
    form.append('response_format', 'json');
    form.append('temperature', '0');
    // O "prompt" do Whisper funciona como vocabulário: nomes de carteiras/categorias do
    // usuário (ex.: "Nubank", "Inter") passam a ser transcritos corretamente.
    if (dicas) form.append('prompt', dicas.slice(0, 800));

    const data = await this.request<{ text?: string }>('/audio/transcriptions', {
      method: 'POST',
      body: form,
    });
    return (data.text ?? '').trim();
  }

  async completarJson(sistema: string, usuario: string): Promise<unknown> {
    const model = this.config.get<string>('GROQ_MODEL') || MODELO_PADRAO;
    const data = await this.request<{ choices?: Array<{ message?: { content?: string } }> }>(
      '/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          // Modelos de raciocínio: extrair lançamentos não precisa de raciocínio longo, e
          // menos tokens = resposta mais rápida e mais usos dentro da cota gratuita.
          ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
          messages: [
            { role: 'system', content: sistema },
            { role: 'user', content: usuario },
          ],
        }),
      },
    );

    const content = data.choices?.[0]?.message?.content ?? '';
    try {
      return JSON.parse(content);
    } catch {
      throw new BadGatewayException('A IA devolveu uma resposta inválida. Tente falar novamente.');
    }
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${GROQ_BASE_URL}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(25_000),
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // fetch do Node embrulha a causa real (DNS, TLS, timeout) em err.cause — sem logar
      // isso, todo problema de rede vira o mesmo 502 genérico, impossível de diagnosticar.
      const causa = (err as { cause?: { code?: string; message?: string } })?.cause;
      const codigo = causa?.code ?? (err as Error)?.name;
      console.error(`[voz] falha de rede ao chamar a Groq ${path}: ${codigo} ${causa?.message ?? (err as Error)?.message ?? ''}`);
      if (codigo === 'TimeoutError') {
        throw new BadGatewayException('O serviço de IA demorou demais para responder. Tente novamente.');
      }
      if (codigo && ERROS_CERTIFICADO.has(codigo)) {
        throw new BadGatewayException(
          'Conexão HTTPS com a IA bloqueada por certificado não confiável (antivírus ou proxy interceptando). ' +
            'Rode o backend com a flag --use-system-ca do Node.',
        );
      }
      throw new BadGatewayException('Não foi possível falar com o serviço de IA. Tente novamente.');
    }

    if (res.status === 429) {
      throw new HttpException(
        'O limite gratuito do serviço de voz foi atingido. Aguarde alguns minutos e tente de novo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!res.ok) {
      const detalhe = await res.text().catch(() => '');
      // Log só do status/trecho — nunca do áudio nem da chave.
      console.error(`[voz] Groq ${path} respondeu ${res.status}: ${detalhe.slice(0, 300)}`);
      if (res.status === 401) {
        throw new ServiceUnavailableException('A chave GROQ_API_KEY foi recusada pela Groq. Gere uma nova chave.');
      }
      if (res.status === 404 && detalhe.includes('model_not_found')) {
        throw new ServiceUnavailableException('O modelo de IA configurado não existe mais na Groq. Ajuste GROQ_MODEL/GROQ_STT_MODEL.');
      }
      throw new BadGatewayException('O serviço de IA falhou ao processar o pedido. Tente novamente.');
    }
    return (await res.json()) as T;
  }
}
