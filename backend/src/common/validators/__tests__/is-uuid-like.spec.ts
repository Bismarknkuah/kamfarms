import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';
import { CreateSalesOrderItemDto } from '../../../sales/dto/create-sales-order-item.dto';
import { IsUuidLike, UUID_SHAPE } from '../is-uuid-like';

// The seed hard-codes ids like this one for Pectra Rice. class-validator's
// strict @IsUUID() rejected them, so creating a sales order failed with
// "items.0.productId must be a UUID" for every product in the system.
const SEEDED_PRODUCT_ID = '00000000-0000-0000-0000-000000000021';
const REAL_V4_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

async function itemErrors(productId: unknown) {
  const dto = plainToInstance(CreateSalesOrderItemDto, { productId, packagingSizeId: REAL_V4_ID, bagCount: 2 });
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('IsUuidLike', () => {
  it('accepts the seeded, hand-written product id that the strict validator rejected', async () => {
    expect(await itemErrors(SEEDED_PRODUCT_ID)).toEqual([]);
  });

  it('still accepts a normal generated v4 id', async () => {
    expect(await itemErrors(REAL_V4_ID)).toEqual([]);
  });

  it('is case-insensitive, like a database would be', async () => {
    expect(await itemErrors(REAL_V4_ID.toUpperCase())).toEqual([]);
  });

  it.each([
    ['empty string', ''],
    ['free text', 'Pectra Rice'],
    ['a product name that looks id-ish', 'pectra-rice'],
    ['missing a group', '3f2504e0-4f89-41d3-9a0c'],
    ['non-hex characters', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'],
    ['an injection attempt', "' OR 1=1 --"],
    ['trailing text after a valid id', `${REAL_V4_ID} extra`],
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s with the same wording the API always used', async (_label, value) => {
    expect(await itemErrors(value)).toContain('productId must be a UUID');
  });

  it('supports arrays of ids via { each: true }', async () => {
    class Bulk {
      @IsUuidLike({ each: true })
      ids!: string[];
    }
    expect(await validate(plainToInstance(Bulk, { ids: [SEEDED_PRODUCT_ID, REAL_V4_ID] }))).toHaveLength(0);
    expect(await validate(plainToInstance(Bulk, { ids: [SEEDED_PRODUCT_ID, 'nope'] }))).toHaveLength(1);
  });

  it('the exported shape matches exactly the 8-4-4-4-12 form', () => {
    expect(UUID_SHAPE.test(SEEDED_PRODUCT_ID)).toBe(true);
    expect(UUID_SHAPE.test('00000000-0000-0000-0000-00000000002')).toBe(false);
  });
});

describe('DTO guard', () => {
  it('no DTO uses the strict @IsUUID() any more - it would reintroduce the seeded-id failure', () => {
    const srcRoot = path.resolve(__dirname, '../../..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.dto.ts') && /@IsUUID\(/.test(fs.readFileSync(full, 'utf8'))) offenders.push(path.relative(srcRoot, full));
      }
    };
    walk(srcRoot);
    expect(offenders).toEqual([]);
  });
});
