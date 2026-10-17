import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { User, UserSchema } from '../users/schemas/user.schema';
import { BillingConfig, BillingConfigSchema } from './schemas/billing-config.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: BillingConfig.name, schema: BillingConfigSchema },
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
