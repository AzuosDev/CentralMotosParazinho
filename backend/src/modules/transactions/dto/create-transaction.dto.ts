import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsNumber, Min, MaxLength, ValidateIf, IsDateString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';
import { TransactionType } from '../schemas/transaction.schema';

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  type!: TransactionType;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  value!: number;

  @ValidateIf((o) => o.type === TransactionType.EXPENSE)
  @IsNotEmpty()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  carteiraId?: string;

  // Vincula o lançamento a uma moto do estoque. A posse é checada no service (a moto tem
  // que ser do usuário autenticado), não aqui — o DTO só garante o formato.
  @IsOptional()
  @IsString()
  motoId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }) : value))
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fitId?: string;

  // Só relevante quando carteiraId aponta para um cartão de crédito e a compra
  // ultrapassaria o limite disponível — sem isso, o backend bloqueia com 409.
  @IsOptional()
  @IsBoolean()
  confirmarMesmoAssim?: boolean;
}
