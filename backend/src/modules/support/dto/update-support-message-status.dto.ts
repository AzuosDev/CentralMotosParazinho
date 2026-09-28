import { IsIn } from 'class-validator';
import type { SupportMessageStatus } from '../schemas/support-message.schema';

export class UpdateSupportMessageStatusDto {
  @IsIn(['aberto', 'lido'])
  status!: SupportMessageStatus;
}
