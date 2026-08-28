import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { Caller } from '../../common/utils/tenant';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
  ) {}

  async create(payload: Partial<Notification>): Promise<Notification> {
    const entity = this.repo.create(payload);
    const saved = await this.repo.save(entity);
    this.logger.log(`Created Notification id=${saved.id}`);
    return saved;
  }

  async findAll(opts: {
    page?: number;
    limit?: number;
    search?: string;
    where?: Record<string, unknown>;
  } = {}, caller?: Caller): Promise<{ items: Notification[]; meta: { page: number; limit: number; total: number } }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 200);
    // Users only see their own notifications (super admins see all).
    const where: Record<string, unknown> = { ...(opts.where as Record<string, unknown>) };
    if (caller?.sub && caller.role !== 'SUPER_ADMIN') where.userId = caller.sub;
    const [items, total] = await this.repo.findAndCount({
      where: where as never,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' } as never,
    });
    return { items, meta: { page, limit, total } };
  }

  async findOne(id: string, caller?: Caller): Promise<Notification> {
    const entity = await this.repo.findOne({ where: { id } as never });
    if (!entity) throw new NotFoundException(`Notification ${id} not found`);
    if (caller?.sub && caller.role !== 'SUPER_ADMIN' && entity.userId && entity.userId !== caller.sub) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    return entity;
  }

  async update(id: string, payload: Partial<Notification>, caller?: Caller): Promise<Notification> {
    const entity = await this.findOne(id, caller);
    Object.assign(entity, payload);
    return this.repo.save(entity);
  }

  async remove(id: string, caller?: Caller): Promise<{ success: boolean; id: string }> {
    const entity = await this.findOne(id, caller);
    await this.repo.softDelete(entity.id);
    return { success: true, id };
  }
}
