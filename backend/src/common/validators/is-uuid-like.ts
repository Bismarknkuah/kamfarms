import { Matches, ValidationOptions } from 'class-validator';

/** Any well-formed 8-4-4-4-12 hexadecimal id.
 *
 * Why this exists instead of class-validator's @IsUUID(): that decorator
 * also enforces the RFC 4122 version and variant bits, which silently
 * rejects ids that are perfectly valid as database keys. The seed
 * hard-codes ids such as 00000000-0000-0000-0000-000000000021 (Pectra
 * Rice), and with the strict check every request carrying one failed
 * with "productId must be a UUID" - including creating a sales order.
 * These ids are only ever compared for equality against the database,
 * so the version bits add no safety here; the shape check still rejects
 * anything that is not an id (empty strings, free text, injection
 * attempts) before it reaches a query. */
export const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function IsUuidLike(options?: ValidationOptions): PropertyDecorator {
  return Matches(UUID_SHAPE, { message: '$property must be a UUID', ...options });
}
