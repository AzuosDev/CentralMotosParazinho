import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { PendingModule } from './modules/pending/pending.module';
import { GoalsModule } from './modules/goals/goals.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { InsightsModule } from './modules/insights/insights.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { ImportModule } from './modules/import/import.module';
import { WebAuthnModule } from './modules/webauthn/webauthn.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uri = configService.get<string>('MONGODB_URI');

        if (uri && uri.trim()) {
          return { uri };
        }

        if (process.env.NODE_ENV === 'production') {
          throw new Error('MONGODB_URI is required in production');
        }

        const { MongoMemoryServer } = await import('mongodb-memory-server');
        const mongoServer = await MongoMemoryServer.create();
        return { uri: mongoServer.getUri() };
      },
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot({ ttl: 60, limit: 100 }),
    AuthModule,
    UsersModule,
    CategoriesModule,
    TransactionsModule,
    PendingModule,
    GoalsModule,
    DashboardModule,
    InsightsModule,
    ExpensesModule,
    WalletsModule,
    ImportModule,
    WebAuthnModule,
    NotificationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
