import { Matches } from 'class-validator';

export class GetRelatorioMotosDto {
  // Obrigatório e no formato AAAA-MM. Sem default de "mês atual" de propósito: um relatório
  // mensal sem o mês explícito na URL é impossível de compartilhar ou recarregar sem mudar
  // de significado na virada do mês.
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'mes deve estar no formato AAAA-MM' })
  mes!: string;
}
