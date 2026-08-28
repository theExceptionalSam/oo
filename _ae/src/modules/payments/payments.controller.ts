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

import { PaymentsService } from './payments.service';
import { FeePayment } from './entities/fee-payment.entity';
import { CreateFeePaymentDto, UpdateFeePaymentDto, ListFeePaymentDto } from './dto/payments.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Caller } from '../../common/utils/tenant';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('payments')
@ApiBearerAuth('access-token')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'List payments with pagination (tenant-scoped)' })
  findAll(@Query() query: ListFeePaymentDto, @CurrentUser() caller: Caller) {
    const where: Record<string, unknown> = {};
    if (query.studentId) where.studentId = query.studentId;
    if (query.feeStructureId) where.feeStructureId = query.feeStructureId;
    return this.service.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
      where: Object.keys(where).length ? where : undefined,
    }, caller);
  }

  @Get('reports')
  @ApiOperation({ summary: 'Financial report: collected vs outstanding per student. Defaults to the last 30 days.' })
  report(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('studentId') studentId: string | undefined,
    @CurrentUser() caller: Caller,
  ) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('from/to must be valid ISO date strings');
    }
    return this.service.report({
      from: fromDate,
      to: toDate,
      studentId,
    }, caller);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single payment by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.findOne(id, caller);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Create a payment' })
  create(@Body() dto: CreateFeePaymentDto) {
    return this.service.create(dto as unknown as Partial<FeePayment>);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Update a payment' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeePaymentDto, @CurrentUser() caller: Caller) {
    return this.service.update(id, dto as unknown as Partial<FeePayment>, caller);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER, UserRole.ACCOUNTANT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a payment' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.remove(id, caller);
  }
}
