import { IsDateString, IsMongoId, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * PATCH /api/motos/:id/venda — corrige uma venda já registrada e mantém a receita
 * vinculada em sincronia (valor, data e carteira). O mesmo DTO atende a moto antiga, que
 * foi marcada como vendida antes de a venda gerar lançamento: nesse caso mandar apenas
 * carteiraId cria a receita que faltava, sem mexer no valor nem na data.
 */
export class EditarVendaMotoDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  valorVenda?: number;

  @IsOptional()
  @IsDateString()
  dataVenda?: string;

  @IsOptional()
  @IsMongoId()
  carteiraId?: string;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;
}
