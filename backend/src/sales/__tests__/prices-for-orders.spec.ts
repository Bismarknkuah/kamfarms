import { SalesOrdersService } from '../sales-orders.service';
import { ProductPricesService } from '../product-prices.service';

const row = (productId: string, sizeId: string, price: number, customerId: string | null = null) => ({ productId, packagingSizeId: sizeId, customerId, pricePerBag: price });

describe('ProductPricesService.effective: the prices an order would use', () => {
  const build = (rows: unknown[]) => {
    const prisma = { productPrice: { findMany: jest.fn().mockResolvedValue(rows) } };
    return { service: new ProductPricesService(prisma as any, {} as any), prisma };
  };

  it('gives one price per product and size, newest first, as plain numbers', async () => {
    const { service } = build([row('p1', 's5', 95), row('p1', 's5', 80), row('p1', 's25', 420)]);
    expect(await service.effective()).toEqual([
      { productId: 'p1', packagingSizeId: 's5', pricePerBag: 95, source: 'list' },
      { productId: 'p1', packagingSizeId: 's25', pricePerBag: 420, source: 'list' },
    ]);
  });

  it('lets a customer\'s own price beat the list price, wherever it sits in the list, but not an older price of their own', async () => {
    const { service } = build([row('p1', 's5', 95), row('p1', 's5', 90, 'c1'), row('p1', 's5', 70, 'c1')]);
    expect(await service.effective('c1')).toEqual([{ productId: 'p1', packagingSizeId: 's5', pricePerBag: 90, source: 'customer' }]);
  });

  it('asks only for prices in force now, and for the list prices plus that one customer\'s, never another customer\'s', async () => {
    const { service, prisma } = build([]);
    await service.effective('c1');
    const where = prisma.productPrice.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ isActive: true, OR: [{ customerId: null }, { customerId: 'c1' }] });
    expect(where.effectiveFrom.lte).toBeInstanceOf(Date);
    await service.effective();
    expect(prisma.productPrice.findMany.mock.calls[1][0].where.OR).toEqual([{ customerId: null }]);
  });

  it('is empty when no price has been set yet', async () => expect(await build([]).service.effective()).toEqual([]));
});

describe('the message when an order\'s product and size has no price', () => {
  const service = (lookups: unknown) => {
    const svc = Object.create(SalesOrdersService.prototype) as any;
    svc.prisma = { productPrice: { findFirst: jest.fn().mockResolvedValue(null) }, ...(lookups as object) };
    return svc;
  };
  const found = { product: { findUnique: jest.fn().mockResolvedValue({ name: 'Pectra Rice' }) }, packagingSize: { findUnique: jest.fn().mockResolvedValue({ label: '1KG' }) } };

  it('says what has no price and who can fix it, with a code the screen can recognise', async () => {
    await expect(service(found).resolveUnitPrice('p1', 's1', 'c1')).rejects.toMatchObject({
      response: { errorCode: 'PRICE_NOT_CONFIGURED', message: 'No price is set for Pectra Rice 1KG yet, so this order cannot be created. Ask the System Administrator to add the price in Price list, then try again.' },
    });
  });

  it('still gives a useful message if the names cannot be looked up', async () => {
    const failing = { product: { findUnique: jest.fn().mockRejectedValue(new Error('x')) }, packagingSize: { findUnique: jest.fn() } };
    await expect(service(failing).resolveUnitPrice('p1', 's1', 'c1')).rejects.toMatchObject({ response: { message: expect.stringContaining('No price is set for this product and size yet') } });
    await expect(service({}).resolveUnitPrice('p1', 's1', 'c1')).rejects.toMatchObject({ response: { errorCode: 'PRICE_NOT_CONFIGURED' } });
  });

  it('uses a price that was supplied, or one that is set, without any of this', async () => {
    expect(await service(found).resolveUnitPrice('p1', 's1', 'c1', 42)).toBe(42);
    const svc = service(found);
    svc.prisma.productPrice.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ pricePerBag: '95.00' });
    expect(await svc.resolveUnitPrice('p1', 's1', 'c1')).toBe(95);
  });
});
