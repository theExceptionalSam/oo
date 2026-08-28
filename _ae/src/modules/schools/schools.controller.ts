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

import { SchoolsService } from './schools.service';
import { School } from './entities/school.entity';
import { CreateSchoolDto, UpdateSchoolDto, ListSchoolDto } from './dto/schools.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Caller } from '../../common/utils/tenant';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('schools')
@ApiBearerAuth('access-token')
@Controller('schools')
export class SchoolsController {
  constructor(private readonly service: SchoolsService) {}

  @Get()
  @ApiOperation({ summary: 'List schools — non-super-admins see only their own' })
  findAll(@Query() query: ListSchoolDto, @CurrentUser() caller: Caller) {
    return this.service.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
    }, caller);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single school by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.findOne(id, caller);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a school' })
  create(@Body() dto: CreateSchoolDto) {
    return this.service.create(dto as unknown as Partial<School>);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Update a school' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSchoolDto, @CurrentUser() caller: Caller) {
    return this.service.update(id, dto as unknown as Partial<School>, caller);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a school' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
