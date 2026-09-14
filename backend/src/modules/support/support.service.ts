import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SupportMessage, SupportMessageDocument, SupportMessageStatus } from './schemas/support-message.schema';
import { SupportReply, SupportReplyDocument } from './schemas/support-reply.schema';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { EmailService } from '../../common/services/email.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ADMIN_EMAIL } from '../../common/guards/admin.guard';

type Requester = { userId: string; email: string };

@Injectable()
export class SupportService {
  constructor(
    @InjectModel(SupportMessage.name) private supportMessageModel: Model<SupportMessageDocument>,
    @InjectModel(SupportReply.name) private supportReplyModel: Model<SupportReplyDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}

  async create(userId: string, userEmail: string, dto: CreateSupportMessageDto) {
    await this.supportMessageModel.create({
      userId: new Types.ObjectId(userId),
      titulo: dto.titulo,
      tipo: dto.tipo,
      mensagem: dto.mensagem,
    });

    // Falha no envio de email não deve derrubar a request do usuário — a mensagem já
    // está salva; EmailService já engole erros internamente e retorna false.
    await this.emailService.sendSupportMessageEmail({
      titulo: dto.titulo,
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

  // Data da última resposta do admin em cada mensagem — usado tanto pra marcar "tem
  // resposta nova" na lista do usuário quanto pro sininho.
  private async getLastAdminReplyTimes(messageIds: Types.ObjectId[]): Promise<Map<string, Date>> {
    if (messageIds.length === 0) return new Map();
    const rows = await this.supportReplyModel.aggregate([
      { $match: { supportMessageId: { $in: messageIds }, authorRole: 'admin' } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$supportMessageId', createdAt: { $first: '$createdAt' } } },
    ]);
    return new Map(rows.map((r) => [r._id.toString(), r.createdAt as Date]));
  }

  async findMessagesForUser(userId: string) {
    const messages = await this.supportMessageModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec();

    const ids = messages.map((m) => m._id);
    const counts = await this.supportReplyModel.aggregate([
      { $match: { supportMessageId: { $in: ids } } },
      { $group: { _id: '$supportMessageId', count: { $sum: 1 } } },
    ]);
    const countById = new Map(counts.map((c) => [c._id.toString(), c.count as number]));
    const lastAdminReplyById = await this.getLastAdminReplyTimes(ids);

    return messages.map((m) => {
      const lastAdminReply = lastAdminReplyById.get(m._id.toString());
      const hasUnread = !!lastAdminReply && (!m.lastViewedByUserAt || lastAdminReply > m.lastViewedByUserAt);
      return {
        ...m,
        status: m.status ?? 'aberto',
        replyCount: countById.get(m._id.toString()) ?? 0,
        hasUnread,
      };
    });
  }

  // Itens exibidos no sininho de notificações compartilhado: pra admin, chamados
  // abertos; pra usuário comum, chamados com resposta do suporte ainda não vista.
  // Não escreve nada na coleção Notification (bill-reminders) — é só leitura,
  // computada aqui, pra não arriscar mexer naquele schema.
  async getBellNotifications(userId: string, email: string) {
    if (email === ADMIN_EMAIL) {
      const open = await this.supportMessageModel
        .find({ status: 'aberto' })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean()
        .exec();
      return open.map((m) => ({
        id: m._id.toString(),
        title: 'Chamado aberto',
        message: m.titulo,
        createdAt: m.createdAt,
        targetPath: '/admin/suporte',
      }));
    }

    const mine = await this.supportMessageModel
      .find({ userId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    if (mine.length === 0) return [];

    const lastAdminReplyById = await this.getLastAdminReplyTimes(mine.map((m) => m._id));

    return mine
      .map((m) => ({ m, lastReply: lastAdminReplyById.get(m._id.toString()) }))
      .filter(({ m, lastReply }) => !!lastReply && (!m.lastViewedByUserAt || lastReply! > m.lastViewedByUserAt))
      .map(({ m, lastReply }) => ({
        id: m._id.toString(),
        title: 'Nova resposta do suporte',
        message: m.titulo,
        createdAt: lastReply as Date,
        targetPath: '/faq',
      }));
  }

  // Dispensa o item do sininho: pro admin marca o chamado como lido (some da contagem
  // de "abertas"), pro usuário marca a conversa como vista (some o "Nova resposta").
  // Não navega nem mexe na thread — só o que já era usado nos dois fluxos existentes.
  async dismissBellItem(messageId: string, requester: Requester) {
    const { message, isAdmin } = await this.authorizeThread(messageId, requester);
    if (isAdmin) {
      message.status = 'lido';
    } else {
      message.lastViewedByUserAt = new Date();
    }
    await message.save();
    return { ok: true };
  }

  // Um usuário só enxerga a própria conversa; o admin enxerga qualquer uma. Devolve
  // NotFoundException (não Forbidden) pra quem não é dono nem admin, pra não revelar
  // que a mensagem existe.
  private async authorizeThread(messageId: string, requester: Requester) {
    const message = await this.supportMessageModel.findById(messageId).exec();
    if (!message) throw new NotFoundException('Mensagem não encontrada');

    const isAdmin = requester.email === ADMIN_EMAIL;
    const isOwner = message.userId.toString() === requester.userId;
    if (!isAdmin && !isOwner) throw new NotFoundException('Mensagem não encontrada');

    return { message, isAdmin };
  }

  async getThread(messageId: string, requester: Requester) {
    const { message, isAdmin } = await this.authorizeThread(messageId, requester);
    const replies = await this.supportReplyModel
      .find({ supportMessageId: message._id })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    let userEmail: string | undefined;
    if (isAdmin) {
      const author = await this.userModel.findById(message.userId).select('email').lean().exec();
      userEmail = author?.email;
    } else {
      message.lastViewedByUserAt = new Date();
      await message.save();
    }

    return {
      message: { ...message.toObject(), status: message.status ?? 'aberto', userEmail },
      replies,
    };
  }

  async addReply(messageId: string, requester: Requester, mensagem: string) {
    const { message, isAdmin } = await this.authorizeThread(messageId, requester);
    const authorRole = isAdmin ? 'admin' : 'user';

    await this.supportReplyModel.create({
      supportMessageId: message._id,
      authorRole,
      mensagem,
    });

    // Resposta do admin = conversa tratada; resposta do usuário reabre pro admin ver.
    message.status = isAdmin ? 'lido' : 'aberto';
    await message.save();

    if (isAdmin) {
      const author = await this.userModel.findById(message.userId).select('email').lean().exec();
      if (author?.email) {
        await this.emailService.sendSupportReplyToUserEmail({ mensagem, toEmail: author.email });
      }
    } else {
      await this.emailService.sendSupportReplyToAdminEmail({ mensagem, fromEmail: requester.email });
    }

    return { ok: true };
  }
}
