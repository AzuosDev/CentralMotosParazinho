import { IsDateString, IsMongoId, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class VenderMotoDto {
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  valorVenda!: number;

  @IsDateString()
  dataVenda!: string;

  // Obrigatória: a venda vira uma receita de verdade na carteira que recebeu o dinheiro,
  // senão a moto sai do estoque e nada aparece em saldo, dashboard ou extrato.
  @IsMongoId()
  carteiraId!: string;

  // Sem categoria explícita o serviço usa a categoria de sistema "Venda de Moto".
  @IsOptional()
  @IsMongoId()
  categoryId?: string;
}
