import { IsDateString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class VenderMotoDto {
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  valorVenda!: number;

  @IsDateString()
  dataVenda!: string;
}
