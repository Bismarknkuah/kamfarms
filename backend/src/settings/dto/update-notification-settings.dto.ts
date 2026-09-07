import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @ApiProperty({ required: false, description: 'The email address password-reset and other outgoing notifications are sent from.' })
  @IsOptional()
  @IsEmail()
  fromEmail?: string;

  @ApiProperty({ required: false, description: 'The display name shown alongside the sender email, e.g. "KAM-ROMS".' })
  @IsOptional()
  @IsString()
  fromName?: string;

  @ApiProperty({ required: false, description: 'The phone number used as the sender identity for outgoing SMS/WhatsApp messages.' })
  @IsOptional()
  @IsString()
  fromPhone?: string;
}
