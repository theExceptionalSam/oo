import {
  BadRequestException,
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

import { AttendanceService } from './attendance.service';
import { Attendance } from './entities/attendance.entity';
import {
  CreateAttendanceDto,
  UpdateAttendanceDto,
  ListAttendanceDto,
} from './dto/attendance.dto';
import { BulkMarkAttendanceDto } from './dto/bulk-attendance.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Caller } from '../../common/utils/tenant';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('attendance')
@ApiBearerAuth('access-token')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get()
  @ApiOperation({ summary: 'List attendance records with pagination' })
  findAll(@Query() query: ListAttendanceDto, @CurrentUser() caller: Caller) {
    return this.service.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
      where: query.schoolId ? { schoolId: query.schoolId } : undefined,
    }, caller);
  }

  @Get('reports')
  @ApiOperation({ summary: 'Aggregate attendance report (per-student present rate). Defaults to the last 30 days.' })
  report(
    @Query('classId') classId: string | undefined,
    @Query('studentId') studentId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentUser() caller: Caller,
  ) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('from/to must be valid ISO date strings');
    }
    return this.service.report({
      classId,
      studentId,
      from: fromDate,
      to: toDate,
    }, caller);
  }

  @Get('student/:id')
  @ApiOperation({ summary: 'Attendance history for a single student' })
  studentHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findAll({ where: { studentId: id }, limit: 500 });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single attendance record by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.findOne(id, caller);
  }

  @Post('bulk-mark')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Bulk-mark attendance for a class on a given date' })
  bulkMark(
    @Body() dto: BulkMarkAttendanceDto,
    @CurrentUser() caller: Caller,
  ) {
    return this.service.bulkMark(dto, caller.sub, caller);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create an attendance record' })
  create(@Body() dto: CreateAttendanceDto, @CurrentUser() caller: Caller) {
    return this.service.create(dto as unknown as Partial<Attendance>, caller);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update an attendance record' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAttendanceDto, @CurrentUser() caller: Caller) {
    return this.service.update(id, dto as unknown as Partial<Attendance>, caller);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an attendance record' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.remove(id, caller);
  }
}
