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

import { EnrollmentsService } from './enrollments.service';
import { Enrollment } from './entities/enrollment.entity';
import { CreateEnrollmentDto, UpdateEnrollmentDto, ListEnrollmentDto } from './dto/enrollments.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Caller } from '../../common/utils/tenant';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('enrollments')
@ApiBearerAuth('access-token')
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly service: EnrollmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List enrollments with pagination (tenant-scoped)' })
  findAll(@Query() query: ListEnrollmentDto, @CurrentUser() caller: Caller) {
    const where: Record<string, unknown> = {};
    if (query.studentId) where.studentId = query.studentId;
    if (query.classId) where.classId = query.classId;
    return this.service.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
      where: Object.keys(where).length ? where : undefined,
    }, caller);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single enrollment by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.findOne(id, caller);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Create an enrollment' })
  create(@Body() dto: CreateEnrollmentDto) {
    return this.service.create(dto as unknown as Partial<Enrollment>);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Update an enrollment' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEnrollmentDto, @CurrentUser() caller: Caller) {
    return this.service.update(id, dto as unknown as Partial<Enrollment>, caller);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an enrollment' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.remove(id, caller);
  }
}
