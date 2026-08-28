import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '../../users/entities/user.entity';

export class LoginDto {
  @ApiProperty({ example: 'principal@school.edu' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3cur3!Pass' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ required: false, example: 'acme-high' })
  @IsOptional()
  @IsString()
  subdomain?: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'principal@school.edu' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3cur3!Pass' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: UserRole, example: UserRole.ADMIN })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ required: false, example: 'Acme High School' })
  @IsOptional()
  @IsString()
  schoolName?: string;

  @ApiProperty({ required: false, example: 'acme-high' })
  @IsOptional()
  @IsString()
  subdomain?: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'N3wS3cur3!Pass' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class AcceptInviteDto {
  @ApiProperty({ description: 'Invitation token from the invite link' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'MyS3cur3!Pass' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  expiresIn: number;

  @ApiProperty({ type: Object })
  user: Record<string, unknown>;
}
