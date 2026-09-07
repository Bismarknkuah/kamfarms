import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty() @IsString() @MinLength(1) body: string;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() requiresAcknowledgment?: boolean;
  @ApiProperty({ required: false, description: 'A link to a document to share (Drive, Dropbox, etc.), or a data: URI for a voice note recorded in-browser - no file upload, since this project has no live storage backend.' })
  @IsOptional() @IsString() attachmentUrl?: string;
  @ApiProperty({ required: false, enum: ['DOCUMENT', 'VOICE_NOTE'], default: 'DOCUMENT' })
  @IsOptional() @IsIn(['DOCUMENT', 'VOICE_NOTE']) attachmentType?: string;
}
