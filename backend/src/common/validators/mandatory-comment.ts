import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export const MIN_COMMENT_LENGTH = 3;

/**
 * For the comment an approver must leave when they reject something. Spaces at either end are removed first, so a blank or
 * "   " comment is refused: the person has to say why. Every reject-*.dto.ts uses this (a test checks they all do).
 */
export function MandatoryComment(message = 'A comment is required when rejecting: say why.') {
  return applyDecorators(
    Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)),
    IsString({ message }),
    MinLength(MIN_COMMENT_LENGTH, { message }),
  );
}
