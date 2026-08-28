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

import { ExamsService } from './exams.service';
import { Exam } from './entities/exam.entity';
import { CreateExamDto, UpdateExamDto, ListExamDto } from './dto/exams.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Caller } from '../../common/utils/tenant';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('exams')
@ApiBearerAuth('access-token')
@Controller('exams')
export class ExamsController {
  constructor(private readonly service: ExamsService) {}

  @Get()
  @ApiOperation({ summary: 'List exam with pagination' })
  findAll(@Query() query: ListExamDto, @CurrentUser() caller: Caller) {
    return this.service.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
      where: query.schoolId ? ({ schoolId: query.schoolId } as Record<string, unknown>) : undefined,
    }, caller);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single exam by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.findOne(id, caller);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Create a exam' })
  create(@Body() dto: CreateExamDto, @CurrentUser() caller: Caller) {
    return this.service.create(dto as unknown as Partial<Exam>, caller);
  }

  @Post(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Transition exam status: draft→submitted→reviewed→approved→published→locked' })
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { status: string; notes?: string },
    @CurrentUser() caller: Caller,
  ) {
    return this.service.transition(id, dto.status as never, caller.sub, caller, dto.notes);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Update a exam' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExamDto, @CurrentUser() caller: Caller) {
    return this.service.update(id, dto as unknown as Partial<Exam>, caller);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a exam' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.remove(id, caller);
  }
}
