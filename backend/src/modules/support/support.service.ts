import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SupportMessage, SupportMessageDocument, SupportMessageStatus } from './schemas/support-message.schema';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { EmailService } from '../../common/services/email.service';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class SupportService {
  constructor(
    @InjectModel(SupportMessage.name) private supportMessageModel: Model<SupportMessageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}

  async create(userId: string, userEmail: string, dto: CreateSupportMessageDto) {
    await this.supportMessageModel.create({
      userId: new Types.ObjectId(userId),
      tipo: dto.tipo,
      mensagem: dto.mensagem,
    });

    // Falha no envio de email não deve derrubar a request do usuário — a mensagem já
    // está salva; EmailService já engole erros internamente e retorna false.
    await this.emailService.sendSupportMessageEmail({
      tipo: dto.tipo,
      mensagem: dto.mensagem,
      fromEmail: userEmail,
    });

    return { ok: true };
  }

  async findAllForAdmin() {
    const messages = await this.supportMessageModel.find().sort({ createdAt: -1 }).limit(200).lean().exec();
    const userIds = [...new Set(messages.map((m) => m.userId.toString()))].map((id) => new Types.ObjectId(id));
    const users = await this.userModel.find({ _id: { $in: userIds } }).select('email').lean().exec();
    const emailById = new Map(users.map((u) => [u._id.toString(), u.email]));

    return messages.map((m) => ({
      ...m,
      status: m.status ?? 'aberto',
      userEmail: emailById.get(m.userId.toString()) ?? 'desconhecido',
    }));
  }

  async updateStatus(id: string, status: SupportMessageStatus) {
    const updated = await this.supportMessageModel
      .findByIdAndUpdate(id, { $set: { status } }, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Mensagem não encontrada');
    return updated;
  }
}
