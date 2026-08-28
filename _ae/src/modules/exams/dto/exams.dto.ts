import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateExamDto {
  @ApiProperty({ example: 'Midterm Mathematics' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty()
  @IsUUID()
  schoolId: string;

  @ApiProperty()
  @IsUUID()
  academicYearId: string;

  @ApiPropertyOptional({ enum: ['midterm', 'final', 'quiz', 'assignment'] })
  @IsOptional()
  @IsIn(['midterm', 'final', 'quiz', 'assignment'])
  type?: string;

  @ApiPropertyOptional({ enum: ['first', 'second', 'third'], description: 'Academic term' })
  @IsOptional()
  @IsIn(['first', 'second', 'third'])
  term?: string;

  @ApiPropertyOptional({ example: '2026-10-15' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-10-16' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxMarks?: number;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  weightage?: number;
}

export class UpdateExamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: ['midterm', 'final', 'quiz', 'assignment'] })
  @IsOptional()
  @IsIn(['midterm', 'final', 'quiz', 'assignment'])
  type?: string;

  @ApiPropertyOptional({ enum: ['first', 'second', 'third'], description: 'Academic term' })
  @IsOptional()
  @IsIn(['first', 'second', 'third'])
  term?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxMarks?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  weightage?: number;
}

export class ListExamDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}
