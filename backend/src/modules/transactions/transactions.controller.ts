import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ICurrentUser } from '../../common/types/current-user.type';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { GetTransactionsDto } from './dto/get-transactions.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { BulkWalletDto } from './dto/bulk-wallet.dto';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('api/transactions')
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@CurrentUser() user: ICurrentUser, @Body() dto: CreateTransactionDto) {
    return this.transactionsService.create(user._id.toString(), dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@CurrentUser() user: ICurrentUser, @Query() query: GetTransactionsDto) {
    return this.transactionsService.findAll(
      user._id.toString(),
      query.type,
      query.page,
      query.limit,
      query.categoryId,
      query.month,
      query.year,
      query.carteiraId,
      query.semCategoria,
      query.motoId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    return this.transactionsService.findOne(user._id.toString(), id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('bulk-wallet')
  async bulkWallet(@CurrentUser() user: ICurrentUser, @Body() dto: BulkWalletDto) {
    return this.transactionsService.associateTransactionsToWallet(
      user._id.toString(),
      dto.transactionIds,
      dto.targetWalletId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@CurrentUser() user: ICurrentUser, @Param('id') id: string, @Body() dto: UpdateTransactionDto) {
    return this.transactionsService.update(user._id.toString(), id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    return this.transactionsService.remove(user._id.toString(), id);
  }
}
