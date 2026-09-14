import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
