import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetAnnualSummaryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  year?: number;
}
