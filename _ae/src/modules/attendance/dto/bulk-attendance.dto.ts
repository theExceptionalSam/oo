import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { AttendanceStatus } from '../entities/attendance.entity';

export class AttendanceEntryDto {
  @ApiProperty()
  @IsUUID()
  studentId: string;

  @ApiProperty({ enum: ['present', 'absent', 'late', 'excused'] })
  @IsEnum(['present', 'absent', 'late', 'excused'])
  status: AttendanceStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class BulkMarkAttendanceDto {
  @ApiProperty()
  @IsUUID()
  classId: string;

  @ApiProperty({ example: '2025-01-15' })
  @IsDateString()
  date: string;

  @ApiProperty({ type: [AttendanceEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries: AttendanceEntryDto[];
}

export class LeaveApplicationDto {
  @ApiProperty()
  @IsUUID()
  studentId: string;

  @ApiProperty({ example: '2025-01-20' })
  @IsDateString()
  fromDate: string;

  @ApiProperty({ example: '2025-01-22' })
  @IsDateString()
  toDate: string;

  @ApiProperty()
  @IsString()
  reason: string;
}
