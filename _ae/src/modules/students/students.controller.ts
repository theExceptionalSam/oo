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

import { StudentsService } from './students.service';
import { Student } from './entities/student.entity';
import { CreateStudentDto, UpdateStudentDto, ListStudentDto } from './dto/students.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Caller } from '../../common/utils/tenant';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('students')
@ApiBearerAuth('access-token')
@Controller('students')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  @ApiOperation({ summary: 'List students with pagination (tenant-scoped)' })
  findAll(@Query() query: ListStudentDto, @CurrentUser() caller: Caller) {
    return this.service.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
    }, caller);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single student by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.findOne(id, caller);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Create a student' })
  create(@Body() dto: CreateStudentDto) {
    return this.service.create(dto as unknown as Partial<Student>);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Update a student' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentDto, @CurrentUser() caller: Caller) {
    return this.service.update(id, dto as unknown as Partial<Student>, caller);
  }

  @Post(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Transition student status (workflow-enforced)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { status: string; reason?: string },
    @CurrentUser() caller: Caller,
  ) {
    return this.service.updateStatus(id, dto.status as never, caller.sub, caller, dto.reason);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a student' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.remove(id, caller);
  }
}
