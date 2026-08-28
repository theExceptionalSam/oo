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

import { FeesService } from './fees.service';
import { FeeStructure } from './entities/fee-structure.entity';
import { CreateFeeStructureDto, UpdateFeeStructureDto, ListFeeStructureDto } from './dto/fees.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Caller } from '../../common/utils/tenant';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('fees')
@ApiBearerAuth('access-token')
@Controller('fee-structures')
export class FeesController {
  constructor(private readonly service: FeesService) {}

  @Get()
  @ApiOperation({ summary: 'List feestructure with pagination' })
  findAll(@Query() query: ListFeeStructureDto, @CurrentUser() caller: Caller) {
    return this.service.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
      where: query.schoolId ? ({ schoolId: query.schoolId } as Record<string, unknown>) : undefined,
    }, caller);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single feestructure by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.findOne(id, caller);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Create a feestructure' })
  create(@Body() dto: CreateFeeStructureDto, @CurrentUser() caller: Caller) {
    return this.service.create(dto as unknown as Partial<FeeStructure>, caller);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Update a feestructure' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeeStructureDto, @CurrentUser() caller: Caller) {
    return this.service.update(id, dto as unknown as Partial<FeeStructure>, caller);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER, UserRole.ACCOUNTANT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a feestructure' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.remove(id, caller);
  }
}
