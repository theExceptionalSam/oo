import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateMessageDto {
  @ApiProperty({ description: 'Recipient user id (sender is derived from the access token)' })
  @IsUUID()
  receiverId: string;

  @ApiProperty({ example: 'Welcome to class!' })
  @IsString()
  @MaxLength(4000)
  content: string;

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  attachments?: unknown[];
}

export class UpdateMessageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;
}

export class ListMessageDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  senderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  receiverId?: string;
}
