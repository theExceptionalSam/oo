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

import { ClassesService } from './classes.service';
import { Class } from './entities/class.entity';
import { CreateClassDto, UpdateClassDto, ListClassDto } from './dto/classes.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Caller } from '../../common/utils/tenant';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('classes')
@ApiBearerAuth('access-token')
@Controller('classes')
export class ClassesController {
  constructor(private readonly service: ClassesService) {}

  @Get()
  @ApiOperation({ summary: 'List class with pagination' })
  findAll(@Query() query: ListClassDto, @CurrentUser() caller: Caller) {
    return this.service.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
      where: query.schoolId ? ({ schoolId: query.schoolId } as Record<string, unknown>) : undefined,
    }, caller);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single class by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.findOne(id, caller);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Create a class' })
  create(@Body() dto: CreateClassDto, @CurrentUser() caller: Caller) {
    return this.service.create(dto as unknown as Partial<Class>, caller);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Update a class' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClassDto, @CurrentUser() caller: Caller) {
    return this.service.update(id, dto as unknown as Partial<Class>, caller);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a class' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.remove(id, caller);
  }
}
