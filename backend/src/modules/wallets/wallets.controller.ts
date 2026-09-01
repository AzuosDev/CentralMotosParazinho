import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ICurrentUser } from '../../common/types/current-user.type';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { TransferWalletDto } from './dto/transfer-wallet.dto';

@ApiTags('Wallets')
@ApiBearerAuth()
@Controller('api/wallets')
export class WalletsController {
  constructor(private walletsService: WalletsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: ICurrentUser, @Body() dto: CreateWalletDto) {
    return this.walletsService.create(user._id.toString(), dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user: ICurrentUser, @Query('incluirCartoes') incluirCartoes?: string) {
    return this.walletsService.findAll(user._id.toString(), incluirCartoes === 'true');
  }

  @UseGuards(JwtAuthGuard)
  @Post('transfer')
  transfer(@CurrentUser() user: ICurrentUser, @Body() dto: TransferWalletDto) {
    return this.walletsService.transfer(user._id.toString(), dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    return this.walletsService.findOne(user._id.toString(), id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@CurrentUser() user: ICurrentUser, @Param('id') id: string, @Body() dto: UpdateWalletDto) {
    return this.walletsService.update(user._id.toString(), id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    return this.walletsService.remove(user._id.toString(), id);
  }
}
