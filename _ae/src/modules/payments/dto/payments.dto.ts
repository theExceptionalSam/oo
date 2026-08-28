import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateFeePaymentDto {
  @ApiProperty()
  @IsUUID()
  studentId: string;

  @ApiProperty()
  @IsUUID()
  feeStructureId: string;

  @ApiProperty({ example: 75000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ enum: ['cash', 'card', 'bank_transfer', 'online'] })
  @IsOptional()
  @IsIn(['cash', 'card', 'bank_transfer', 'online'])
  method?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  transactionId?: string;

  @ApiPropertyOptional({ enum: ['pending', 'completed', 'failed', 'refunded'], default: 'completed' })
  @IsOptional()
  @IsIn(['pending', 'completed', 'failed', 'refunded'])
  status?: string;

  @ApiPropertyOptional({ example: '2026-09-10T10:30:00Z' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class UpdateFeePaymentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ enum: ['pending', 'completed', 'failed', 'refunded'] })
  @IsOptional()
  @IsIn(['pending', 'completed', 'failed', 'refunded'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  transactionId?: string;
}

export class ListFeePaymentDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  feeStructureId?: string;
}
