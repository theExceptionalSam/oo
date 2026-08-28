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

import { MarksService } from './marks.service';
import { Mark } from './entities/mark.entity';
import { CreateMarkDto, UpdateMarkDto, ListMarkDto } from './dto/marks.dto';
import { BulkUploadMarksDto } from './dto/bulk-marks.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Caller } from '../../common/utils/tenant';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('marks')
@ApiBearerAuth('access-token')
@Controller('marks')
export class MarksController {
  constructor(private readonly service: MarksService) {}

  @Get()
  @ApiOperation({ summary: 'List marks with pagination (tenant-scoped)' })
  findAll(@Query() query: ListMarkDto, @CurrentUser() caller: Caller) {
    const where: Record<string, unknown> = {};
    if (query.examId) where.examId = query.examId;
    if (query.studentId) where.studentId = query.studentId;
    if (query.subjectId) where.subjectId = query.subjectId;
    return this.service.findAll({
      page: query.page,
      limit: query.limit,
      where: Object.keys(where).length ? where : undefined,
    }, caller);
  }

  @Get('student/:id/report-card')
  @ApiOperation({ summary: 'Report card (latest marks per subject) for a student' })
  reportCard(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.reportCard(id, caller);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a mark by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.findOne(id, caller);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Record a single mark' })
  create(@Body() dto: CreateMarkDto) {
    return this.service.create(dto as unknown as Partial<Mark>);
  }

  @Post('bulk-upload')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Bulk upload marks (CSV/Excel style payload)' })
  bulkUpload(
    @Body() dto: BulkUploadMarksDto,
    @Query('examId', ParseUUIDPipe) examId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.bulkUpload(examId, dto, userId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a mark' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMarkDto, @CurrentUser() caller: Caller) {
    return this.service.update(id, dto as unknown as Partial<Mark>, caller);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a mark' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.remove(id, caller);
  }
}
