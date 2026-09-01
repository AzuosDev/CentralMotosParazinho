import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CartoesService } from './cartoes.service';

// Transição aberta→fechada das faturas vencidas + gatilho de rotativo/juros. Mesmo
// agendamento/gate/timezone do cron de notificações (notifications-cron.service.ts) — não é
// o mesmo serviço porque fechar fatura é responsabilidade do módulo de cartões, mas segue a
// mesma convenção para não exigir uma segunda variável de ambiente.
@Injectable()
export class FaturasCronService {
  private readonly logger = new Logger(FaturasCronService.name);
  private isRunning = false;

  constructor(private readonly cartoesService: CartoesService) {}

  @Cron('0 8 * * *', { timeZone: 'America/Sao_Paulo' })
  async handleDailyClosing() {
    if (process.env.CRON_NOTIFICATIONS !== 'true') return;
    if (this.isRunning) {
      this.logger.warn('Faturas cron already running, skipping');
      return;
    }
    this.isRunning = true;
    try {
      const count = await this.cartoesService.fecharFaturasVencidas();
      this.logger.log(`${count} fatura(s) fechada(s)`);
    } catch (err) {
      this.logger.error('Error closing faturas', err);
    } finally {
      this.isRunning = false;
    }
  }
}
