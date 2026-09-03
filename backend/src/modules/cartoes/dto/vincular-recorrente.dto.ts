import { IsNotEmpty, IsString } from 'class-validator';

export class VincularRecorrenteDto {
  @IsString()
  @IsNotEmpty()
  templateId!: string;

  @IsString()
  @IsNotEmpty()
  carteiraId!: string;
}
