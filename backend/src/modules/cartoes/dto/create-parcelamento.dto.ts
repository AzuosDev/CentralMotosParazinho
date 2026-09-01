import { IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

export class CreateParcelamentoDto {
  @IsString()
  @IsNotEmpty()
  carteiraId!: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }) : value))
  @IsString()
  @MaxLength(200)
  descricao!: string;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  valorTotal!: number;

  @IsNumber()
  @Min(2)
  @Max(48)
  @Type(() => Number)
  totalParcelas!: number;

  @IsDateString()
  dataCompra!: string;

  @IsOptional()
  @IsBoolean()
  confirmarMesmoAssim?: boolean;
}
