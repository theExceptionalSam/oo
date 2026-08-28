import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export class CreateStudentDto {
  @ApiProperty({ description: 'User account id this student profile belongs to' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ example: 'STD-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  rollNumber?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  admissionDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  guardianInfo?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  medicalInfo?: Record<string, unknown>;

  // ---- Biodata (blueprint 3.2) ----
  @ApiPropertyOptional({ example: '2014-06-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @IsIn(GENDERS)
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nationality?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  stateOfOrigin?: string;

  @ApiPropertyOptional({ example: 'Surulere' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  localGovernment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  homeAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  religion?: string;

  @ApiPropertyOptional({ enum: BLOOD_GROUPS })
  @IsOptional()
  @IsIn(BLOOD_GROUPS)
  bloodGroup?: string;

  @ApiPropertyOptional({ example: 'AA' })
  @IsOptional()
  @Matches(/^(AA|AS|SS|AC)$/, { message: 'genotype must be one of AA, AS, SS, AC' })
  genotype?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  height?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  weight?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  disabilities?: string;

  @ApiPropertyOptional({ example: 'English,Yoruba' })
  @IsOptional()
  @IsString()
  languagesSpoken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  photoUrl?: string;
}

export class UpdateStudentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  rollNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  admissionDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  guardianInfo?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  medicalInfo?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @IsIn(GENDERS)
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nationality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  stateOfOrigin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  localGovernment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  homeAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  religion?: string;

  @ApiPropertyOptional({ enum: BLOOD_GROUPS })
  @IsOptional()
  @IsIn(BLOOD_GROUPS)
  bloodGroup?: string;

  @ApiPropertyOptional({ example: 'AA' })
  @IsOptional()
  @Matches(/^(AA|AS|SS|AC)$/, { message: 'genotype must be one of AA, AS, SS, AC' })
  genotype?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;
}

export class ListStudentDto extends PaginationDto {}
