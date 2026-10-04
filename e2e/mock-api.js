'use strict';
// A stand-in for the API, for browser tests. It reuses the REAL backend modules for the parts that carry the rules:
// the request validation classes, who may see which order, and the receipt file check. So the website is tested against the real contract.
const ROOT = process.env.KAM_ROOT || require('path').resolve(__dirname, '..');
process.env.TS_NODE_PROJECT = ROOT + '/backend/tsconfig.json';
require(ROOT + '/node_modules/ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
require(ROOT + '/node_modules/reflect-metadata');
const express = require(ROOT + '/node_modules/express');
const multer = require(ROOT + '/node_modules/multer');
const { plainToInstance } = require(ROOT + '/node_modules/class-transformer');
const { validate } = require(ROOT + '/node_modules/class-validator');
const B = ROOT + '/backend/src';
const { orderVisibility, canSee } = require(B + '/sales/order-visibility');
const { detectReceipt, isHeic, receiptFileName, RECEIPT_MAX_BYTES, MAX_RECEIPTS_PER_ORDER } = require(B + '/sales/receipt-file.util');
const { actorSnapshot } = require(B + '/sales/order-events');
const dto = (f, n) => require(B + f)[n];
const DTOS = {
  rejectOrder: dto('/sales/dto/reject-sales-order.dto', 'RejectSalesOrderDto'),
  approveOrder: dto('/sales/dto/approve-sales-order.dto', 'ApproveSalesOrderDto'),
  releaseOrder: dto('/sales/dto/release-sales-order.dto', 'ReleaseSalesOrderDto'),
  assign: dto('/sales/dto/assign-warehouse.dto', 'AssignWarehouseDto'),
  dispatch: dto('/sales/dto/dispatch-sales-order.dto', 'DispatchSalesOrderDto'),
  note: dto('/sales/dto/step-note.dto', 'StepNoteDto'),
  cancel: dto('/sales/dto/cancel-sales-order.dto', 'CancelSalesOrderDto'),
  rejectExpense: dto('/finance/dto/reject-expense.dto', 'RejectExpenseDto'),
  rejectPayment: dto('/finance/dto/reject-payment.dto', 'RejectPaymentDto'),
  rejectPaddy: dto('/paddy/dto/reject-paddy-entry.dto', 'RejectPaddyEntryDto'),
  rejectProduction: dto('/production/dto/reject-production-record.dto', 'RejectProductionRecordDto'),
  rejectDelivery: dto('/logistics/dto/reject-delivery-report.dto', 'RejectDeliveryReportDto'),
  rejectReset: dto('/system-reset/dto/reject-reset-request.dto', 'RejectResetRequestDto'),
  rejectAdjustment: dto('/inventory-ledger/dto/reject-inventory-adjustment.dto', 'RejectInventoryAdjustmentDto'),
};

const GLOBAL = [{ scopeType: 'GLOBAL', scopeId: null }];
const WH1 = '11111111-1111-4111-8111-111111111111', WH2 = '22222222-2222-4222-8222-222222222222';
const ALL_PERMS = ['dashboard.view', 'sales.create', 'sales.approve', 'sales.release', 'sales.assign', 'sales.fulfill', 'sales.view', 'finance.view', 'finance.approve', 'finance.approve.director', 'expense.view', 'expense.create', 'paddy.approve', 'paddy.reject', 'paddy.create', 'production.approve', 'delivery.approve', 'delivery.reject', 'payment.verify', 'reset.approve', 'inventory.adjust', 'masterdata.manage', 'customer.manage'];
const USERS = {
  sales1: { id: 'u-sales1', email: 'sales.1@kam.local', firstName: 'Nana', lastName: 'Yeboah', role: 'SALES_OFFICER', scopes: GLOBAL, perms: ['dashboard.view', 'sales.create', 'customer.manage', 'payment.create', 'reports.view', 'reports.export', 'messages.send', 'tasks.complete'] },
  sales2: { id: 'u-sales2', email: 'sales.2@kam.local', firstName: 'Akosua', lastName: 'Frimpong', role: 'SALES_OFFICER', scopes: GLOBAL, perms: ['dashboard.view', 'sales.create', 'customer.manage', 'payment.create', 'reports.view', 'reports.export', 'messages.send', 'tasks.complete'] },
  fd: { id: 'u-fd', email: 'financedirector@kam.local', firstName: 'Kwesi', lastName: 'Appiah', role: 'FINANCE_DIRECTOR', scopes: GLOBAL, perms: ['dashboard.view', 'sales.approve', 'sales.view', 'finance.view', 'finance.approve', 'expense.view', 'payment.verify'] },
  md: { id: 'u-md', email: 'md@kam.local', firstName: 'Kwame', lastName: 'Asante', role: 'MD', scopes: GLOBAL, perms: ['dashboard.view', 'sales.release', 'sales.view', 'finance.view', 'finance.approve.director', 'ai.view', 'ai.use', 'milling.view'] },
  ceo: { id: 'u-ceo', email: 'ceo@kam.local', firstName: 'Ama', lastName: 'Owusu', role: 'CEO', scopes: GLOBAL, perms: ['dashboard.view', 'sales.release', 'sales.view', 'finance.view', 'ai.view', 'ai.use', 'milling.view'] },
  ops: { id: 'u-ops', email: 'operationsmanager.1@kam.local', firstName: 'Kojo', lastName: 'Antwi', role: 'OPERATIONS_MANAGER', scopes: GLOBAL, perms: ['dashboard.view', 'milling.view', 'production.approve', 'reports.view', 'ai.view', 'ai.use'] },
  sup: { id: 'u-sup', email: 'warehousesupervisor@kam.local', firstName: 'Efua', lastName: 'Darko', role: 'WAREHOUSE_SUPERVISOR', scopes: GLOBAL, perms: ['dashboard.view', 'sales.assign', 'sales.fulfill', 'warehouse.view'] },
  wm1: { id: 'u-wm1', email: 'warehousemanager.1@kam.local', firstName: 'Kwabena', lastName: 'Adjei', role: 'WAREHOUSE_MANAGER', scopes: [{ scopeType: 'WAREHOUSE', scopeId: WH1 }], perms: ['dashboard.view', 'sales.fulfill', 'warehouse.view'] },
  wm2: { id: 'u-wm2', email: 'warehousemanager.2@kam.local', firstName: 'Abena', lastName: 'Gyasi', role: 'WAREHOUSE_MANAGER', scopes: [{ scopeType: 'WAREHOUSE', scopeId: WH2 }], perms: ['dashboard.view', 'sales.fulfill', 'warehouse.view'] },
  admin: { id: 'u-admin', email: 'admin@kam.local', firstName: 'System', lastName: 'Administrator', role: 'ADMIN', scopes: GLOBAL, perms: ALL_PERMS },
};
const actorOf = (k) => { const u = USERS[k]; return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, permissionCodes: new Set(u.perms), roles: [{ roleId: u.role, roleCode: u.role, permissions: u.perms, scopes: u.scopes }] }; };
const keyOfToken = (t) => (t && t.startsWith('tok-') ? t.slice(4) : null);
const WAREHOUSES = { [WH1]: 'Tamale Warehouse', [WH2]: 'Kumasi Warehouse' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let seq = 0;
const uid = (p) => `${p}-${++seq}`;
let S;
const person = (k) => ({ id: USERS[k].id, firstName: USERS[k].firstName, lastName: USERS[k].lastName });
function order(id, number, status, officer, extra = {}) {
  const t = (d) => new Date(Date.now() - d * 3600e3).toISOString();
  return Object.assign({
    id, orderNumber: number, status, customerId: 'c1', customer: { name: 'Koforidua Wholesale', customerNumber: 'CUST-001' },
    salesOfficerId: USERS[officer].id, salesOfficer: person(officer), submittedById: USERS[officer].id,
    items: [{ id: id + '-i1', productId: 'p1', product: { name: 'Pectra Rice' }, packagingSizeId: 's25', packagingSize: { label: '25KG' }, bagCount: 50, totalKg: 1250, unitPrice: 210, lineTotal: 10500 }],
    totalKg: 1250, totalAmount: 10500, deliveryLocation: 'UG Legon', receiptUrl: null, requestedDeliveryDate: null, notes: null, rejectionReason: null,
    submittedAt: status === 'DRAFT' ? null : t(30), approvedAt: null, fulfilledAt: null, createdAt: t(40), approvedBy: null, allocatedWarehouse: null, allocatedWarehouseId: null, preferredWarehouseId: null,
    tasks: [], events: [], receipts: [], files: {},
  }, extra);
}
function ev(o, type, from, to, who, comment, meta, hoursAgo = 0) {
  const snap = actorSnapshot(actorOf(who));
  o.events.push({ id: uid('ev'), type, fromStatus: from || null, toStatus: to || null, actorId: snap.actorId, actorName: snap.actorName, actorRole: snap.actorRole, comment: comment || null, meta: meta || null, createdAt: new Date(Date.now() - hoursAgo * 3600e3).toISOString() });
}
function addReceipt(o, who, buf, name, note) {
  const id = uid('rc'); o.files[id] = buf;
  const kind = detectReceipt(buf);
  o.receipts.push({ id, fileName: name, mimeType: kind.mime, sizeBytes: buf.length, note: note || null, uploadedById: USERS[who].id, uploadedByName: `${USERS[who].firstName} ${USERS[who].lastName}`, createdAt: new Date().toISOString() });
  return id;
}
function seed() {
  const o1 = order('o1', 'SO-2026-000001', 'DRAFT', 'sales1'); ev(o1, 'CREATED', null, 'DRAFT', 'sales1', null, null, 41);
  const o2 = order('o2', 'SO-2026-000002', 'SUBMITTED', 'sales1'); ev(o2, 'CREATED', null, 'DRAFT', 'sales1', null, null, 41); addReceipt(o2, 'sales1', PNG, 'deposit.png', '50% deposit, mobile money'); ev(o2, 'RECEIPT_ADDED', null, null, 'sales1', '50% deposit, mobile money', null, 40); ev(o2, 'SUBMITTED', 'DRAFT', 'SUBMITTED', 'sales1', null, null, 30);
  const o3 = order('o3', 'SO-2026-000003', 'SUBMITTED', 'sales2', { customer: { name: 'Accra Mart', customerNumber: 'CUST-002' }, totalAmount: 7000 }); ev(o3, 'SUBMITTED', 'DRAFT', 'SUBMITTED', 'sales2', null, null, 80);
  const o4 = order('o4', 'SO-2026-000004', 'APPROVED', 'sales1', { approvedAt: new Date(Date.now() - 20 * 3600e3).toISOString(), approvedBy: person('fd') }); ev(o4, 'SUBMITTED', 'DRAFT', 'SUBMITTED', 'sales1', null, null, 30); ev(o4, 'APPROVED', 'SUBMITTED', 'APPROVED', 'fd', 'Deposit confirmed on the statement', null, 20); addReceipt(o4, 'sales1', PNG, 'receipt-4.png');
  const o5 = order('o5', 'SO-2026-000005', 'RELEASED', 'sales1', { approvedAt: new Date(Date.now() - 20 * 3600e3).toISOString(), approvedBy: person('fd') }); ev(o5, 'SUBMITTED', 'DRAFT', 'SUBMITTED', 'sales1', null, null, 30); ev(o5, 'APPROVED', 'SUBMITTED', 'APPROVED', 'fd', null, null, 20); ev(o5, 'RELEASED', 'APPROVED', 'RELEASED', 'md', 'Priority customer', null, 10);
  const wh = (id) => ({ allocatedWarehouseId: id, allocatedWarehouse: { id, name: WAREHOUSES[id] } });
  const o6 = order('o6', 'SO-2026-000006', 'RESERVED', 'sales1', wh(WH1)); ev(o6, 'RELEASED', 'APPROVED', 'RELEASED', 'md', null, null, 9); ev(o6, 'ASSIGNED', 'RELEASED', 'RESERVED', 'sup', 'Load the 25KG bags first', { warehouseId: WH1, warehouseName: WAREHOUSES[WH1] }, 6);
  const o7 = order('o7', 'SO-2026-000007', 'PROCESSING', 'sales1', wh(WH1)); ev(o7, 'ASSIGNED', 'RELEASED', 'RESERVED', 'sup', null, { warehouseId: WH1, warehouseName: WAREHOUSES[WH1] }, 6); ev(o7, 'PROCESSING', 'RESERVED', 'PROCESSING', 'wm1', 'Picking now', null, 3);
  const o8 = order('o8', 'SO-2026-000008', 'ON_TRACK', 'sales1', wh(WH2)); ev(o8, 'ASSIGNED', 'RELEASED', 'RESERVED', 'sup', null, { warehouseId: WH2, warehouseName: WAREHOUSES[WH2] }, 8); ev(o8, 'PROCESSING', 'RESERVED', 'PROCESSING', 'wm2', null, null, 5); ev(o8, 'ON_TRACK', 'PROCESSING', 'ON_TRACK', 'wm2', 'Left at 9am', { driverName: 'Yaw Boateng', vehicleNumber: 'GT-1234-22', expectedDeliveryAt: new Date(Date.now() + 5 * 3600e3).toISOString() }, 2);
  const o9 = order('o9', 'SO-2026-000009', 'FULFILLED', 'sales1', Object.assign(wh(WH1), { fulfilledAt: new Date().toISOString() })); ev(o9, 'DELIVERED', 'ON_TRACK', 'FULFILLED', 'wm1', 'Received by Mr Mensah', null, 1);
  const o10 = order('o10', 'SO-2026-000010', 'REJECTED', 'sales1', { rejectionReason: 'Customer is over the credit limit' }); ev(o10, 'REJECTED', 'APPROVED', 'REJECTED', 'md', 'Customer is over the credit limit', { stage: 'MD' }, 4);
  const img = PNG.toString('base64');
  S = {
    orders: [o1, o2, o3, o4, o5, o6, o7, o8, o9, o10], calls: [],
    expenses: [{ id: 'e1', expenseNumber: 'EXP-2026-000001', category: { name: 'Fuel' }, amount: 450, date: new Date().toISOString(), farm: { name: 'Nkawkaw Farm' }, warehouse: null, status: 'PENDING', paymentMethod: 'CASH', reference: 'INV-7731', customCategoryLabel: null, itemDescription: null, attachmentUrl: 'data:image/png;base64,' + img, notes: 'Diesel for the tractor', rejectionReason: null, submittedById: 'u-other', submittedByFinanceDirector: false, submittedBy: { firstName: 'Yaa', lastName: 'Owusu' } }],
    paddy: [{ id: 'pe1', entryNumber: 'PE-2026-000001', status: 'SUBMITTED', farm: { name: 'Nkawkaw Farm', code: 'NKW' }, paddyGradeId: 'g1', paddyGrade: { label: 'Size 4' }, weightKg: 2500, weightEstimated: false, bagCount: 50, entryDate: new Date().toISOString(), moisturePercent: 14.2, qualityGrade: 'A', harvestDate: null, supplierName: 'Mensah Farms', storageLocation: 'Shed 2', notes: 'Dry and clean', rejectionReason: null, submittedBy: { firstName: 'Yaa', lastName: 'Owusu' } }],
    production: [{ id: 'pr1', recordNumber: 'PR-2026-000001', status: 'SUBMITTED', millingCenter: { name: 'Tamale Mill' }, machine: { machineName: 'Huller 1' }, operator: { id: 'u-op', firstName: 'Kofi', lastName: 'Boateng' }, paddyProcessedKg: 5000, recoveredRiceKg: 3300, brokenRiceKg: 400, riceHullKg: 900, wasteLossKg: 400, recoveryPercent: 66, massBalanceFlag: false, sourceReferenceNumbers: ['PE-2026-000001'], date: new Date().toISOString() }],
    deliveries: [{ id: 'dr1', reportNumber: 'DR-2026-000001', status: 'SUPERVISOR_REVIEW', farm: { name: 'Nkawkaw Farm' }, destinationWarehouse: { name: 'Tamale Warehouse' }, paddyGrade: { label: 'Size 4' }, actualBagCount: 60, actualKg: 3000, labourCost: 120, transportationFee: 600, otherCosts: 50, otherCostsDescription: 'Loading', totalDeliveryCost: 770, vehicle: { plateNumber: 'GT-5521-21' }, driver: { name: 'Yaw Boateng' }, departureTime: new Date().toISOString(), rejectionReason: null, deliveryOrderId: 'do1' }],
    payments: [{ id: 'pay1', paymentNumber: 'PAY-2026-000001', customer: { name: 'Koforidua Wholesale' }, amount: 5000, method: 'MOBILE_MONEY', status: 'PENDING_VERIFICATION', paymentDate: new Date().toISOString(), notes: 'Part payment', receiptUrl: null, recordedBy: { id: 'u-sales2', firstName: 'Akosua', lastName: 'Frimpong' } }],
    resets: [{ id: 'rs1', requestNumber: 'RST-2026-000001', resetType: 'DEMO_DATA', scope: 'All demo sales orders', status: 'PENDING', reason: 'Clearing demo data before go-live', requestedBy: { firstName: 'System', lastName: 'Administrator' }, financeApprovedBy: null, mdApprovedBy: null, createdAt: new Date().toISOString() }],
    adjustments: [{ id: 'ia1', adjustmentNumber: 'ADJ-2026-000001', locationType: 'WAREHOUSE', status: 'PENDING', paddyGrade: { label: 'Size 4' }, product: null, packagingSize: null, systemQuantityKg: 5000, systemBagCount: 100, adjustmentKg: -50, adjustmentBags: -1, reason: 'Count came up one bag short', rejectionReason: null, requestedBy: { firstName: 'Kwabena', lastName: 'Adjei' } }],
  };
}
seed();

const app = express();
app.use((req, res, next) => {
  res.set({ 'Access-Control-Allow-Origin': req.headers.origin || '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'Access-Control-Expose-Headers': 'Content-Disposition' });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '5mb' }));
const ok = (res, data) => res.json({ success: true, data });
const fail = (res, status, message, errorCode = null) => res.status(status).json({ success: false, message, errorCode });
const who = (req) => keyOfToken((req.headers.authorization || '').replace('Bearer ', ''));
const meOf = (k) => { const u = USERS[k]; return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, roles: [{ code: u.role, scopes: u.scopes }], permissions: u.perms, mustChangePassword: false }; };

// ---- auth ----
app.post('/api/auth/login', (req, res) => {
  const k = Object.keys(USERS).find((x) => USERS[x].email === (req.body || {}).email);
  if (!k) return fail(res, 401, 'Invalid email or password.');
  ok(res, { accessToken: 'tok-' + k, refreshToken: 'ref-' + k, user: meOf(k) });
});
app.post('/api/auth/refresh', (req, res) => { const k = String((req.body || {}).refreshToken || '').replace('ref-', ''); USERS[k] ? ok(res, { accessToken: 'tok-' + k, refreshToken: 'ref-' + k }) : fail(res, 401, 'Session expired.'); });
app.post('/api/auth/logout', (req, res) => ok(res, null));
app.get('/api/auth/me', (req, res) => { const k = who(req); k && USERS[k] ? ok(res, meOf(k)) : fail(res, 401, 'Please sign in again.'); });

// ---- test controls ----
app.post('/__reset', (req, res) => { seed(); res.json({ ok: true }); });
app.get('/__calls', (req, res) => res.json(S.calls));
app.get('/__token/:k', (req, res) => res.json({ token: 'tok-' + req.params.k }));

// ---- lookups used by the Sales page ----
app.get('/api/customers', (req, res) => ok(res, [{ id: 'c1', customerNumber: 'CUST-001', name: 'Koforidua Wholesale', company: null, phone: '0244000001', email: null, address: 'Koforidua', location: 'Koforidua', creditLimit: 50000, isActive: true }]));
app.get('/api/master-data/products', (req, res) => ok(res, [{ id: 'p1', name: 'Pectra Rice', isActive: true }, { id: 'p2', name: 'Broken Rice', isActive: true }, { id: 'p3', name: 'Rice Hull', isActive: true }]));
app.get('/api/master-data/packaging-sizes', (req, res) => ok(res, [{ id: 's25', label: '25KG', sizeKg: 25, isActive: true }, { id: 's50', label: '50KG', sizeKg: 50, isActive: true }]));
app.get('/api/product-prices/effective', (req, res) => ok(res, [{ productId: 'p1', packagingSizeId: 's25', pricePerBag: 210, source: 'list' }]));
app.get('/api/warehouses/directory', (req, res) => ok(res, Object.entries(WAREHOUSES).map(([id, name]) => ({ id, name }))));

// ---- sales orders (the rules of sales-orders.service.ts, in short) ----
const asList = (o) => { const { files, receipts, events, ...rest } = o; return { ...rest, events: events.filter((e) => e.toStatus).slice(-1), _count: { receipts: receipts.length } }; };
const asFull = (o) => { const { files, ...rest } = o; return JSON.parse(JSON.stringify(rest)); };
const find = (req, res) => {
  const k = who(req); if (!k) { fail(res, 401, 'Please sign in again.'); return {}; }
  const o = S.orders.find((x) => x.id === req.params.id);
  if (!o || !canSee(orderVisibility(actorOf(k)), o)) { fail(res, 404, 'Sales order not found.'); return {}; }
  return { o, k, a: actorOf(k) };
};
const need = (res, a, perm, msg) => { if (a.permissionCodes.has(perm)) return true; fail(res, 403, msg || 'You do not have permission to do this.'); return false; };
async function body(res, Cls, b) {
  const inst = plainToInstance(Cls, b || {}); const errs = await validate(inst, { whitelist: true, forbidNonWhitelisted: true });
  if (errs.length) { fail(res, 400, errs.flatMap((e) => Object.values(e.constraints || {})).join(', ')); return null; }
  return inst;
}
const log = (req, extra) => S.calls.push({ method: req.method, path: req.path.replace('/api', ''), body: req.body && Object.keys(req.body).length ? req.body : undefined, by: who(req), ...extra });

app.get('/api/sales-orders', (req, res) => {
  const k = who(req); if (!k) return fail(res, 401, 'Please sign in again.');
  const v = orderVisibility(actorOf(k));
  ok(res, S.orders.filter((o) => canSee(v, o) && (!req.query.status || o.status === req.query.status)).map(asList).reverse());
});
app.get('/api/sales-orders/:id/availability', (req, res) => {
  const { o, a } = find(req, res); if (!o) return;
  if (!(a.permissionCodes.has('sales.approve') || a.permissionCodes.has('sales.release') || a.permissionCodes.has('sales.assign'))) return fail(res, 403, 'You do not have permission to do this.');
  const line = (wh, avail) => ({ itemId: o.items[0].id, product: 'Pectra Rice', size: '25KG', requestedBags: 50, availableBags: avail, enough: avail >= 50 });
  ok(res, { orderId: o.id, preferredWarehouseId: null, warehouses: [{ warehouseId: WH1, warehouseName: WAREHOUSES[WH1], canFulfillAll: true, lines: [line(WH1, 200)] }, { warehouseId: WH2, warehouseName: WAREHOUSES[WH2], canFulfillAll: false, lines: [line(WH2, 10)] }] });
});
app.get('/api/sales-orders/:id', (req, res) => { const { o } = find(req, res); if (o) ok(res, asFull(o)); });

const step = (path, fn) => app.post('/api/sales-orders/:id/' + path, async (req, res) => { const f = find(req, res); if (!f.o) return; log(req, { order: f.o.id }); try { await fn(f.o, f.k, f.a, req, res); } catch (e) { fail(res, 500, String(e && e.message)); } });
const move = (o, to, from, k, type, comment, meta) => { ev(o, type, from, to, k, comment, meta); o.status = to; };
const inScope = (a, o) => { const sc = a.roles.flatMap((r) => r.scopes); return sc.some((s) => s.scopeType === 'GLOBAL') || sc.some((s) => s.scopeType === 'WAREHOUSE' && s.scopeId === o.allocatedWarehouseId); };

step('submit', (o, k, a, req, res) => { if (o.status !== 'DRAFT') return fail(res, 400, `Only DRAFT orders can be submitted (current status: ${o.status}).`); if (o.submittedById !== a.id) return fail(res, 403, 'Only the original submitter can submit this order.'); o.submittedAt = new Date().toISOString(); move(o, 'SUBMITTED', 'DRAFT', k, 'SUBMITTED'); ok(res, asFull(o)); });
step('approve', async (o, k, a, req, res) => { if (!need(res, a, 'sales.approve')) return; const d = await body(res, DTOS.approveOrder, req.body); if (!d) return; if (o.status !== 'SUBMITTED') return fail(res, 400, `Only SUBMITTED orders can be approved (current status: ${o.status}).`); if (o.submittedById === a.id) return fail(res, 403, 'You cannot approve your own sales order.'); o.approvedBy = person(k); o.approvedAt = new Date().toISOString(); move(o, 'APPROVED', 'SUBMITTED', k, 'APPROVED', d.note); ok(res, asFull(o)); });
step('reject', async (o, k, a, req, res) => { const d = await body(res, DTOS.rejectOrder, req.body); if (!d) return; const fin = o.status === 'SUBMITTED', md = o.status === 'APPROVED'; if (!fin && !md) return fail(res, 400, `Only orders waiting for the Finance Director or the Managing Director can be rejected (current status: ${o.status}).`); if (!need(res, a, fin ? 'sales.approve' : 'sales.release', fin ? 'Only the Finance Director can reject an order at this stage.' : 'Only the Managing Director or CEO can reject an order at this stage.')) return; o.rejectionReason = d.reason; move(o, 'REJECTED', o.status, k, 'REJECTED', d.reason, { stage: fin ? 'FINANCE' : 'MD' }); ok(res, asFull(o)); });
step('release', async (o, k, a, req, res) => { if (!need(res, a, 'sales.release')) return; const d = await body(res, DTOS.releaseOrder, req.body); if (!d) return; if (o.status !== 'APPROVED') return fail(res, 400, 'Only orders approved by the Finance Director can be released for delivery (current status: ' + o.status + ').'); move(o, 'RELEASED', 'APPROVED', k, 'RELEASED', d.note); ok(res, asFull(o)); });
step('assign-warehouse', async (o, k, a, req, res) => { if (!need(res, a, 'sales.assign')) return; const d = await body(res, DTOS.assign, req.body); if (!d) return; if (!['RELEASED', 'RESERVED'].includes(o.status)) return fail(res, 400, `Only released orders can be assigned to a warehouse (current status: ${o.status}).`); const name = WAREHOUSES[d.warehouseId]; if (!name) return fail(res, 400, 'That warehouse was not found or is not active.'); if (d.warehouseId === WH2) return fail(res, 400, `${name} cannot cover this order right now: Pectra Rice (25KG): requested 50 bags, only 10 available. Choose another warehouse.`, 'INSUFFICIENT_STOCK'); const re = o.status === 'RESERVED'; o.allocatedWarehouseId = d.warehouseId; o.allocatedWarehouse = { id: d.warehouseId, name }; move(o, 'RESERVED', o.status, k, re ? 'REASSIGNED' : 'ASSIGNED', d.note, { warehouseId: d.warehouseId, warehouseName: name }); ok(res, asFull(o)); });
step('start-processing', async (o, k, a, req, res) => { if (!need(res, a, 'sales.fulfill')) return; const d = await body(res, DTOS.note, req.body); if (!d) return; if (o.status !== 'RESERVED') return fail(res, 400, 'Only orders assigned to a warehouse can be processed (current status: ' + o.status + ').'); if (!inScope(a, o)) return fail(res, 403, 'This order is assigned to a different warehouse.'); move(o, 'PROCESSING', 'RESERVED', k, 'PROCESSING', d.note); ok(res, asFull(o)); });
step('dispatch', async (o, k, a, req, res) => { if (!need(res, a, 'sales.fulfill')) return; const d = await body(res, DTOS.dispatch, req.body); if (!d) return; if (o.status !== 'PROCESSING') return fail(res, 400, 'Only orders being processed can be marked on track (current status: ' + o.status + ').'); if (!inScope(a, o)) return fail(res, 403, 'This order is assigned to a different warehouse.'); move(o, 'ON_TRACK', 'PROCESSING', k, 'ON_TRACK', d.note, { driverName: d.driverName || null, vehicleNumber: d.vehicleNumber || null, expectedDeliveryAt: d.expectedDeliveryAt || null }); ok(res, asFull(o)); });
step('fulfill', async (o, k, a, req, res) => { if (!need(res, a, 'sales.fulfill')) return; const d = await body(res, DTOS.note, req.body); if (!d) return; if (o.status !== 'ON_TRACK') return fail(res, 400, 'This order has not been sent yet. Mark it on track once it has left the warehouse, then confirm delivery.'); if (!inScope(a, o)) return fail(res, 403, 'This order is assigned to a different warehouse.'); o.fulfilledAt = new Date().toISOString(); move(o, 'FULFILLED', 'ON_TRACK', k, 'DELIVERED', d.note); ok(res, asFull(o)); });
step('cancel', async (o, k, a, req, res) => { const d = await body(res, DTOS.cancel, req.body); if (!d) return; if (!['DRAFT', 'SUBMITTED', 'APPROVED', 'RELEASED', 'RESERVED'].includes(o.status)) return fail(res, 400, `Orders in status ${o.status} cannot be cancelled.`); if (o.submittedById !== a.id && !a.permissionCodes.has('sales.release')) return fail(res, 403, 'Only the Sales Officer who made this order, or the Managing Director, can cancel it.'); move(o, 'CANCELLED', o.status, k, 'CANCELLED', d.reason); ok(res, asFull(o)); });

// ---- receipts: uploaded files ----
const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: RECEIPT_MAX_BYTES + 1 } });
app.post('/api/sales-orders/:id/receipts', up.single('file'), (req, res) => {
  const { o, k, a } = find(req, res); if (!o) return;
  const f = req.file; log(req, { order: o.id, file: f ? { name: f.originalname, type: f.mimetype, size: f.size } : null, fields: req.body });
  if (!need(res, a, 'sales.create')) return;
  if (o.submittedById !== a.id) return fail(res, 403, 'Only the Sales Officer who made this order can add a receipt to it.');
  if (['CANCELLED', 'REJECTED'].includes(o.status)) return fail(res, 400, 'This order is closed, so a receipt cannot be added to it.');
  if (!f || !f.buffer || !f.buffer.length) return fail(res, 400, 'Choose a photo or a PDF of the receipt to upload.');
  if (f.buffer.length > RECEIPT_MAX_BYTES) return fail(res, 400, 'That file is too large. A receipt can be up to 10 MB.');
  if (isHeic(f.buffer)) return fail(res, 400, 'That photo is in HEIC format, which cannot be shown on every device. Take it again as a JPEG, or upload a screenshot of the receipt.');
  const kind = detectReceipt(f.buffer); if (!kind) return fail(res, 400, 'Only photos (JPEG, PNG or WebP) and PDF files can be uploaded as a receipt.');
  if (o.receipts.length >= MAX_RECEIPTS_PER_ORDER) return fail(res, 400, `An order can hold up to ${MAX_RECEIPTS_PER_ORDER} receipt files.`);
  const name = receiptFileName(f.originalname, kind.ext); addReceipt(o, k, f.buffer, name, req.body.note); ev(o, 'RECEIPT_ADDED', null, null, k, req.body.note, { fileName: name });
  ok(res, asFull(o));
});
app.get('/api/sales-orders/:id/receipts/:rid/file', (req, res) => { const { o } = find(req, res); if (!o) return; const r = o.receipts.find((x) => x.id === req.params.rid); if (!r) return fail(res, 404, 'Receipt not found.'); res.set({ 'Content-Type': r.mimeType, 'Content-Length': String(o.files[r.id].length) }); res.status(200).end(o.files[r.id]); });
app.delete('/api/sales-orders/:id/receipts/:rid', (req, res) => { const { o, k, a } = find(req, res); if (!o) return; log(req, { order: o.id }); if (o.submittedById !== a.id) return fail(res, 403, 'Only the Sales Officer who made this order can remove its receipts.'); if (o.status !== 'DRAFT') return fail(res, 400, 'A receipt cannot be removed once the order has been submitted: it is part of the record. Add a corrected one instead.'); o.receipts = o.receipts.filter((x) => x.id !== req.params.rid); ev(o, 'RECEIPT_REMOVED', null, null, k); ok(res, asFull(o)); });

// ---- the other approvals: each checks the comment with the REAL rejection form ----
const queue = (base, key, approvePath, rejectCls, doneStatus, rejectedStatus, extraPaths = []) => {
  app.get('/api/' + base, (req, res) => ok(res, S[key].filter((x) => !req.query.status || x.status === req.query.status)));
  app.post(`/api/${base}/:id/${approvePath}`, (req, res) => { const x = S[key].find((i) => i.id === req.params.id); log(req, { item: req.params.id }); if (!x) return fail(res, 404, 'Not found.'); x.status = doneStatus; ok(res, x); });
  app.post(`/api/${base}/:id/reject`, async (req, res) => { const x = S[key].find((i) => i.id === req.params.id); log(req, { item: req.params.id }); if (!x) return fail(res, 404, 'Not found.'); const d = await body(res, rejectCls, req.body); if (!d) return; x.status = rejectedStatus; x.rejectionReason = d.reason; ok(res, x); });
};
queue('expenses', 'expenses', 'approve', DTOS.rejectExpense, 'APPROVED', 'REJECTED');
queue('paddy-entries', 'paddy', 'approve', DTOS.rejectPaddy, 'APPROVED', 'REJECTED');
queue('production-records', 'production', 'approve', DTOS.rejectProduction, 'APPROVED', 'REJECTED');
queue('delivery-reports', 'deliveries', 'approve', DTOS.rejectDelivery, 'APPROVED', 'REJECTED');
queue('payments', 'payments', 'verify', DTOS.rejectPayment, 'VERIFIED', 'REJECTED');
queue('reset-requests', 'resets', 'approve', DTOS.rejectReset, 'FINANCE_APPROVED', 'REJECTED');
queue('inventory-adjustments', 'adjustments', 'approve', DTOS.rejectAdjustment, 'APPROVED', 'REJECTED');


// ---- report objects the dashboards read (zeros: these tests are about the sales chain, not the figures) ----
app.get('/api/reports/executive-summary', (req, res) => ok(res, { totalPaddyAvailableKg: 0, totalPaddyAvailableBags: 0, paddyInTransitKg: 0, paddyInTransitBags: 0, paddyInWarehousesKg: 0, bulkRiceAtMillingKg: 0, packagedRiceAvailableKg: 0, salesTodayAmount: 0, salesThisMonthAmount: 0, outstandingReceivables: 0, expensesThisMonth: 0 }));
app.get('/api/reports/warehouse-overview', (req, res) => ok(res, { paddy: { received: [], available: [], inTransit: [] }, atMilling: [], packagedRice: [] }));
app.get('/api/reports/analytics', (req, res) => ok(res, { monthlySales: [], monthlyExpenses: [], salesByProduct: [], expensesByCategory: [], topCustomers: [] }));
app.get('/api/notifications/unread-count', (req, res) => ok(res, { count: 0 }));
app.get('/api/audit-logs', (req, res) => ok(res, { items: [], total: 0 }));
app.get('/api/reports/inventory-summary', (req, res) => ok(res, { paddy: { farmKg: 0, farmBags: 0, warehouseKg: 0, inTransitKg: 0, inTransitBags: 0, atMillingKg: 0, byFarm: [] }, finishedRice: [], riceHullKg: 0, brokenRiceKg: 0 }));
app.get('/api/ai/feedback', (req, res) => ok(res, { available: false, reason: 'Not enough milling runs yet.', jurisdiction: { companyWide: true, label: 'The whole company', farms: [], warehouses: [] } }));
app.get('/api/insights/watchlist', (req, res) => ok(res, { generatedAt: new Date().toISOString(), windowDays: 30, items: [], summary: { total: 0 }, findings: [], places: [] }));
app.get('/api/users', (req, res) => ok(res, { items: [], total: 0, page: 1, pageSize: 20 }));

// ---- the AI page: served from the REAL server yield maths, with fixture milling runs, so the page can be checked against the real numbers ----
const Y = require(B + '/ai/ai-yield.util');
const { parseYieldQuestion } = require(B + '/ai/ai-question.util');
const BAGS = { paddyKg: 80, riceKg: 50, brokenKg: 50, hullKg: 20, hullBasis: 'setting' };
const sample = (i, paddyKg, kwh, rice, broken, hull, waste) => ({ paddyKg: paddyKg + (i % 3) * 8, energyKwh: kwh + (i % 2) * 0.4, riceKg: rice + (i % 3) * 4, brokenKg: broken + (i % 2), hullKg: hull + (i % 3), wasteKg: waste });
const RUNS = [
  ...Array.from({ length: 6 }, (_, i) => ({ grade: 'g4', center: 'c1', s: sample(i, 400, 11, 272, 48, 72, 8) })),
  ...Array.from({ length: 2 }, (_, i) => ({ grade: 'g4', center: 'c2', s: sample(i, 400, 12, 266, 50, 74, 10) })),
  ...Array.from({ length: 4 }, (_, i) => ({ grade: 'g5', center: 'c2', s: sample(i, 800, 24, 520, 100, 160, 20) })),
  ...Array.from({ length: 2 }, (_, i) => ({ grade: 'g6', center: 'c2', s: sample(i, 600, 18, 380, 80, 120, 20) })),
];
const GRADES = { g4: 'Size 4', g5: 'Size 5', g6: 'Size 6' }, CENTERS = { c1: 'Tamale Mill', c2: 'Kumasi Mill' };
const ratesOf = (rows) => Y.ratesFromRuns(rows.map((r) => r.s), { halfLifeRuns: 40 });
const scopeRates = (scope) => {
  if (scope === 'all') return { rates: ratesOf(RUNS), label: 'the whole company' };
  const [kind, name] = scope.split(':');
  const id = Object.entries(kind === 'grade' ? GRADES : CENTERS).find(([, v]) => v === name)[0];
  const rows = RUNS.filter((r) => (kind === 'grade' ? r.grade : r.center) === id);
  return { rates: ratesOf(rows), label: kind === 'grade' ? `grade ${name}` : name };
};
app.get('/api/ai/insights', (req, res) => {
  const k = who(req); if (!k || !USERS[k].perms.includes('ai.view')) return fail(res, 403, 'You do not have permission to do this.');
  const overall = ratesOf(RUNS);
  ok(res, { available: true, generatedAt: new Date().toISOString(), jurisdiction: { companyWide: true, label: 'Whole company', farms: [], warehouses: [] }, bagSizes: BAGS,
    window: { runs: RUNS.length, from: '2026-08-01T00:00:00.000Z', to: '2026-09-30T00:00:00.000Z' }, overall, overallNote: Y.describeBasis(overall, 'the whole company'),
    byGrade: Object.entries(GRADES).map(([id, label]) => { const rates = ratesOf(RUNS.filter((r) => r.grade === id)); return { gradeId: id, code: label.toUpperCase().replace(' ', '_'), label, rates, note: Y.describeBasis(rates, `grade ${label}`) }; }),
    byCenter: Object.entries(CENTERS).map(([id, name]) => { const rates = ratesOf(RUNS.filter((r) => r.center === id)); return { centerId: id, code: name.slice(0, 3).toUpperCase(), name, rates, note: Y.describeBasis(rates, name) }; }) });
});
// what the REAL server maths says, for the test to compare the page against
app.get('/__expect', (req, res) => {
  const { mode, amount, scope } = req.query; const { rates } = scopeRates(scope); const a = Number(amount);
  const o = mode === 'power' ? Y.outputsFromEnergy(rates, a, BAGS) : mode === 'paddy' ? Y.outputsFromPaddy(rates, a * BAGS.paddyKg, BAGS) : Y.outputsFromRice(rates, a * BAGS.riceKg, BAGS);
  res.json({ ...o, basis: rates.basis, runs: rates.runs, confidence: rates.confidence });
});
// the question box, using the REAL number reader and the REAL maths
app.post('/api/ai/assistant/ask', (req, res) => {
  const q = String((req.body || {}).question || ''); const n = parseYieldQuestion(q);
  if (!n) return ok(res, { answer: 'I could not tell what to calculate from that.', sourceData: 'N/A', dateRange: 'N/A', confidencePercent: 0, assumptions: 'None.', jurisdiction: 'Whole company', engine: 'built-in' });
  const { rates, label } = scopeRates(n.grade ? `grade:${n.grade.replace('size', 'Size')}` : 'all'); const f = (x) => (Math.round(x * 10) / 10).toString();
  const o = n.paddy_bags ? Y.outputsFromPaddy(rates, n.paddy_bags * BAGS.paddyKg, BAGS) : n.rice_bags ? Y.outputsFromRice(rates, n.rice_bags * BAGS.riceKg, BAGS) : Y.outputsFromEnergy(rates, n.kwh, BAGS);
  ok(res, { answer: `For ${label}: ${f(o.paddyBags)} bags of paddy, ${f(o.kwh)} kWh, ${f(o.riceBags)} bags of packaged rice, ${f(o.brokenBags)} bags of broken rice and ${f(o.hullBags)} bags of hull.`, sourceData: 'Approved milling runs', dateRange: '2026-08-01 to 2026-09-30', confidencePercent: 65, assumptions: 'Test stand-in.', jurisdiction: 'Whole company', engine: 'built-in', toolsUsed: [{ name: 'power_yield', label: 'What power gives', period: '2026-08-01 to 2026-09-30' }], _parsed: n });
});
// ---- anything else the pages ask for: empty, so they load ----
app.get('/api/*', (req, res) => ok(res, []));
app.all('/api/*', (req, res) => ok(res, {}));
app.listen(4000, () => console.log('mock api on :4000'));
