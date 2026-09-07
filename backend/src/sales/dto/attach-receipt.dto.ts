import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AttachReceiptDto {
  @ApiProperty({ description: 'A link to wherever the receipt already lives (Google Drive, Dropbox, etc.) - no file upload, since this project has no live storage backend.' })
  @IsString() receiptUrl: string;
}
