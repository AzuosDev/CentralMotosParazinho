import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PagarFaturaDto {
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  valor!: number;

  @IsOptional()
  @IsString()
  carteiraPagadoraId?: string;

  // false quando a fatura é de um mês já pago na vida real antes de começar a rastrear
  // aqui: marca a fatura como paga (histórico) sem criar a transferência que debitaria a
  // carteira pagadora — mesmo conceito do checkbox equivalente em AccountModal.
  @IsOptional()
  @IsBoolean()
  affectsBalance?: boolean;
}
