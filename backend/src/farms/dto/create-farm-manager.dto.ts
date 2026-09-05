import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

/** Deliberately narrower than the general CreateUserDto (Admin-only,
 * users.manage-gated): no roleCodes field — the role is always
 * FARM_MANAGER, hardcoded server-side, not chosen by the caller — and
 * no temporaryPassword field, since letting a non-admin caller pick a
 * password risks a weak or guessable one. The password is generated
 * server-side and returned once in the response, the same "show it
 * once" principle already used for the password-reset flow. */
export class CreateFarmManagerDto {
  @ApiProperty() @IsString() firstName: string;
  @ApiProperty() @IsString() lastName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
}
