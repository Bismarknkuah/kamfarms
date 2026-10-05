import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ShipmentsService } from '../shipments.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

const W1 = 'w1', W2 = 'w2';
const actor = (wh: string) => ({ id: 'wm', permissionCodes: new Set(['warehouse.receive']), roles: [{ roleId: 'r', roleCode: 'WAREHOUSE_MANAGER', permissions: [], scopes: [{ scopeType: 'WAREHOUSE', scopeId: wh }] }] }) as unknown as AuthenticatedUser;
const ship = (id: string, grade: string, received = false) => ({ id, paddyGradeId: grade, warehouseId: W1, receivedAt: received ? new Date() : null });
function build(rows: any[]) {
  const svc: any = Object.create(ShipmentsService.prototype);
  svc.prisma = { shipment: { findMany: jest.fn(async () => rows) } };
  svc.receive = jest.fn(async () => ({}));
  return svc as any;
}
const dto = (lines: [string, number][], extra: Record<string, unknown> = {}) => ({ lines: lines.map(([paddyGradeId, receivedBags]) => ({ paddyGradeId, receivedBags })), ...extra }) as any;

describe('counting a whole truck in at once', () => {
  it('counts every size with the bags that arrived of that size, through the ordinary receive, and keeps the condition and note', async () => {
    const s = build([ship('s4', 'g4'), ship('s5', 'g5')]);
    const out = await s.receiveDispatch('DS-1', dto([['g5', 3], ['g4', 16]], { receivedCondition: 'Good', notes: 'One torn bag' }), actor(W1));
    expect(out).toEqual({ dispatchRef: 'DS-1', countedIn: 2, alreadyCountedIn: 0 });
    expect(s.receive.mock.calls.map((c: any[]) => [c[0], c[1]])).toEqual([['s4', { receivedBags: 16, receivedCondition: 'Good', notes: 'One torn bag' }], ['s5', { receivedBags: 3, receivedCondition: 'Good', notes: 'One torn bag' }]]);
  });
  it('looks the truck up by its dispatch reference or its report number', async () => {
    const s = build([ship('s4', 'g4')]); await s.receiveDispatch('DR-9', dto([['g4', 1]]), actor(W1));
    expect(s.prisma.shipment.findMany.mock.calls[0][0].where).toEqual({ deliveryReport: { OR: [{ dispatchRef: 'DR-9' }, { reportNumber: 'DR-9' }] } });
  });
  it('checks everything first: a missing count, an unknown size or a size twice changes nothing', async () => {
    const s = build([ship('s4', 'g4'), ship('s5', 'g5')]);
    await expect(s.receiveDispatch('DS-1', dto([['g4', 16]]), actor(W1))).rejects.toThrow('every size on the truck');
    await expect(s.receiveDispatch('DS-1', dto([['g4', 16], ['g9', 1]]), actor(W1))).rejects.toThrow('not on this truck');
    await expect(s.receiveDispatch('DS-1', dto([['g4', 16], ['g4', 15], ['g5', 3]]), actor(W1))).rejects.toThrow('twice');
    expect(s.receive).not.toHaveBeenCalled();
  });
  it('only the warehouse the truck is going to may count it in, and nothing is counted before that is checked', async () => {
    const s = build([ship('s4', 'g4')]);
    await expect(s.receiveDispatch('DS-1', dto([['g4', 16]]), actor(W2))).rejects.toThrow(ForbiddenException);
    expect(s.receive).not.toHaveBeenCalled();
  });
  it('an unknown truck is not found, and a truck already counted in says so', async () => {
    await expect(build([]).receiveDispatch('DS-9', dto([['g4', 1]]), actor(W1))).rejects.toThrow(NotFoundException);
    await expect(build([ship('s4', 'g4', true)]).receiveDispatch('DS-1', dto([['g4', 1]]), actor(W1))).rejects.toThrow(BadRequestException);
  });
  it('pressing it again after a failure finishes only what is left: a size already counted in is never counted twice', async () => {
    const s = build([ship('s4', 'g4', true), ship('s5', 'g5')]);
    const out = await s.receiveDispatch('DS-1', dto([['g5', 3]]), actor(W1));
    expect(out).toEqual({ dispatchRef: 'DS-1', countedIn: 1, alreadyCountedIn: 1 });
    expect(s.receive.mock.calls.map((c: any[]) => c[0])).toEqual(['s5']);
  });
});
