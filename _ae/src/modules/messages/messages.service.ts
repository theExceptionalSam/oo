import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { Caller } from '../../common/utils/tenant';
import { EventBus } from '../../shared/events/event-bus.module';
import { SchoolSyncEvents } from '../../shared/events';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectRepository(Message) private readonly repo: Repository<Message>,
    private readonly eventBus: EventBus,
  ) {}

  async create(payload: Partial<Message>): Promise<Message> {
    const entity = this.repo.create(payload);
    const saved = await this.repo.save(entity);
    this.logger.log(`Created Message id=${saved.id}`);

    // Realtime ping to the recipient (userId drives the socket room).
    await this.eventBus.publish(SchoolSyncEvents.MESSAGE_SENT, {
      messageId: saved.id,
      senderId: saved.senderId,
      userId: saved.receiverId,
      preview: (saved.content ?? '').slice(0, 80),
    });
    return saved;
  }

  async findAll(opts: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}, caller?: Caller): Promise<{ items: Message[]; meta: { page: number; limit: number; total: number } }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 200);
    // A user only ever sees conversations they participate in.
    const qb = this.repo
      .createQueryBuilder('m')
      .orderBy('m.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (caller?.sub) qb.where('m.senderId = :uid OR m.receiverId = :uid', { uid: caller.sub });
    const [items, total] = await qb.getManyAndCount();
    return { items, meta: { page, limit, total } };
  }

  async findOne(id: string, caller?: Caller): Promise<Message> {
    const entity = await this.repo.findOne({ where: { id } as never });
    if (!entity) throw new NotFoundException(`Message ${id} not found`);
    if (caller?.sub && entity.senderId !== caller.sub && entity.receiverId !== caller.sub) {
      throw new NotFoundException(`Message ${id} not found`);
    }
    return entity;
  }

  async update(id: string, payload: Partial<Message>, caller?: Caller): Promise<Message> {
    const entity = await this.findOne(id, caller);
    Object.assign(entity, payload);
    return this.repo.save(entity);
  }

  async remove(id: string, payload?: Partial<Message>, caller?: Caller): Promise<{ success: boolean; id: string }> {
    const entity = await this.findOne(id, caller);
    await this.repo.softDelete(entity.id);
    return { success: true, id };
  }
}
