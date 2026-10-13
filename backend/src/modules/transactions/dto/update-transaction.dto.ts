import { IsEnum, IsOptional, IsString, IsNumber, Min, MaxLength, ValidateIf, IsDateString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';
import { TransactionType } from '../schemas/transaction.schema';

export class UpdateTransactionDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.01)
  value?: number;

  @ValidateIf((o) => o.type === TransactionType.EXPENSE || o.categoryId)
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }) : value))
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  carteiraId?: string;

  @IsOptional()
  @IsString()
  carteiraDestinoId?: string;

  // String vazia desvincula a moto (volta a transação para "sem moto"); um ObjectId
  // revincula. Ver TransactionsService#update.
  @IsOptional()
  @IsString()
  motoId?: string;
}
