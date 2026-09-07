import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ConversationType } from '@prisma/client';

export class CreateConversationDto {
  @ApiProperty({ enum: ConversationType }) @IsEnum(ConversationType) type: ConversationType;
  @ApiProperty({ required: false }) @IsOptional() @IsString() title?: string;
  @ApiProperty({ required: false, default: false, description: 'Announcement requiring acknowledgment/response from members.' })
  @IsOptional()
  @IsBoolean()
  requiresResponse?: boolean;

  @ApiProperty({
    type: [String],
    description: 'Member user ids to add immediately (creator is always included automatically).',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds: string[];
}
