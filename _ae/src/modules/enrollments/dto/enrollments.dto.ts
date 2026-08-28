import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateEnrollmentDto {
  @ApiProperty()
  @IsUUID()
  studentId: string;

  @ApiProperty()
  @IsUUID()
  classId: string;

  @ApiPropertyOptional({ enum: ['active', 'completed', 'withdrawn'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'completed', 'withdrawn'])
  status?: string;
}

export class UpdateEnrollmentDto {
  @ApiPropertyOptional({ enum: ['active', 'completed', 'withdrawn'] })
  @IsOptional()
  @IsIn(['active', 'completed', 'withdrawn'])
  status?: string;
}

export class ListEnrollmentDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classId?: string;
}
