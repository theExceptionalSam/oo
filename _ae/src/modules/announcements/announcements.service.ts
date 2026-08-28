import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Announcement } from './entities/announcement.entity';
import { Caller, assertSameTenant, isSuperAdmin, tenantWhere } from '../../common/utils/tenant';
import { EventBus } from '../../shared/events/event-bus.module';
import { SchoolSyncEvents } from '../../shared/events';

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    @InjectRepository(Announcement) private readonly repo: Repository<Announcement>,
    private readonly eventBus: EventBus,
  ) {}

  async create(payload: Partial<Announcement>, caller?: Caller): Promise<Announcement> {
    if (caller && !isSuperAdmin(caller) && caller.school_id) {
      payload = { ...payload, schoolId: caller.school_id };
    }
    const entity = this.repo.create(payload);
    const saved = await this.repo.save(entity);
    this.logger.log(`Created Announcement id=${saved.id}`);

    // Fan out through the queue: notification persistence + realtime sockets.
    await this.eventBus.publish(SchoolSyncEvents.ANNOUNCEMENT_PUBLISHED, {
      announcementId: saved.id,
      title: saved.title,
      schoolId: saved.schoolId,
      userId: caller?.sub ?? null,
    });
    return saved;
  }

  async findAll(opts: {
    page?: number;
    limit?: number;
    search?: string;
    where?: Record<string, unknown>;
  } = {}, caller?: Caller): Promise<{ items: Announcement[]; meta: { page: number; limit: number; total: number } }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 200);
    const where = tenantWhere(caller, (opts.where as Record<string, unknown>) ?? {});
    const [items, total] = await this.repo.findAndCount({
      where: where as never,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' } as never,
    });
    return { items, meta: { page, limit, total } };
  }

  async findOne(id: string, caller?: Caller): Promise<Announcement> {
    const entity = await this.repo.findOne({ where: { id } as never });
    if (!entity) throw new NotFoundException(`Announcement ${id} not found`);
    assertSameTenant(caller, (entity as unknown as { schoolId?: string }).schoolId);
    return entity;
  }

  async update(id: string, payload: Partial<Announcement>, caller?: Caller): Promise<Announcement> {
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
