import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SupportMessage, SupportMessageSchema } from './schemas/support-message.schema';
import { SupportReply, SupportReplySchema } from './schemas/support-reply.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { SupportService } from './support.service';
import { SupportController } from './support.controller';
import { EmailService } from '../../common/services/email.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupportMessage.name, schema: SupportMessageSchema },
      { name: SupportReply.name, schema: SupportReplySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [SupportService, EmailService],
  controllers: [SupportController],
})
export class SupportModule {}
