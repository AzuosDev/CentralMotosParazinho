import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

// `status`, `valorVenda` e `dataVenda` ficam de fora de propósito: a venda tem suas próprias
// regras e entra por PATCH /api/motos/:id/vender (VenderMotoDto). Deixar o status editável
// aqui permitiria marcar a moto como vendida sem valor nem data de venda.
export class UpdateMotoDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  modelo?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1900)
  @Max(2200)
  ano?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  placa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  chassi?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  cor?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  km?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  valorCompra?: number;

  @IsOptional()
  @IsDateString()
  dataCompra?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  margemDesejada?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  precoAnunciado?: number;
}
