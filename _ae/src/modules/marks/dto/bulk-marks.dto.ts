import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class MarkEntryDto {
  @ApiProperty()
  @IsUUID()
  studentId: string;

  @ApiProperty()
  @IsUUID()
  subjectId: string;

  @ApiProperty({ example: 87.5 })
  @IsNumber()
  @Min(0)
  @Max(1000)
  marksObtained: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class BulkUploadMarksDto {
  @ApiProperty({ type: [MarkEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MarkEntryDto)
  entries: MarkEntryDto[];
}
