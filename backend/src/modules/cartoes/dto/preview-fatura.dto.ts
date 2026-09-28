import { IsDateString } from 'class-validator';

export class PreviewFaturaDto {
  @IsDateString()
  data!: string;
}
