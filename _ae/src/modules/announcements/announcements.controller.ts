import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AnnouncementsService } from './announcements.service';
import { Announcement } from './entities/announcement.entity';
import { CreateAnnouncementDto, UpdateAnnouncementDto, ListAnnouncementDto } from './dto/announcements.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Caller } from '../../common/utils/tenant';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('announcements')
@ApiBearerAuth('access-token')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get()
  @ApiOperation({ summary: 'List announcement with pagination' })
  findAll(@Query() query: ListAnnouncementDto, @CurrentUser() caller: Caller) {
    return this.service.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
      where: query.schoolId ? ({ schoolId: query.schoolId } as Record<string, unknown>) : undefined,
    }, caller);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single announcement by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.findOne(id, caller);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Create a announcement' })
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() caller: Caller) {
    return this.service.create(dto as unknown as Partial<Announcement>, caller);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Update a announcement' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAnnouncementDto, @CurrentUser() caller: Caller) {
    return this.service.update(id, dto as unknown as Partial<Announcement>, caller);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a announcement' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.remove(id, caller);
  }
}
