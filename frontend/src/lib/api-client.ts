const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export interface ApiEnvelope<T> {
  success: boolean;
  message: string | null;
  errorCode: string | null;
  data: T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode: string | null,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!res.ok || !body || body.success === false) {
    throw new ApiError(body?.message ?? 'Request failed.', body?.errorCode ?? null, res.status);
  }

  return body.data;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; firstName: string; lastName: string };
}

export interface MeResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: { code: string; scopes: { scopeType: string; scopeId: string | null }[] }[];
  permissions: string[];
}

export const authApi = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: (accessToken: string) => request<MeResponse>('/auth/me', { method: 'GET' }, accessToken),
  logout: (refreshToken: string) =>
    request<null>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
  forgotPassword: (email: string) =>
    request<null>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, newPassword: string) =>
    request<null>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
  changePassword: (accessToken: string, currentPassword: string, newPassword: string) =>
    request<null>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }, accessToken),
  updateProfile: (accessToken: string, data: { firstName?: string; lastName?: string; phone?: string }) =>
    request<{ id: string; email: string; firstName: string; lastName: string; phone: string | null }>(
      '/auth/me',
      { method: 'PATCH', body: JSON.stringify(data) },
      accessToken,
    ),
};

export interface Farm {
  id: string;
  code: string;
  name: string;
  location: string | null;
  isActive: boolean;
  managers: { user: { id: string; firstName: string; lastName: string; email: string } }[];
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  location: string | null;
  isActive: boolean;
  managers: { user: { id: string; firstName: string; lastName: string; email: string } }[];
  millingCenters: { id: string; code: string; name: string; isActive: boolean }[];
}

export const farmsApi = {
  list: (accessToken: string, includeInactive?: boolean) =>
    request<Farm[]>(`/farms${includeInactive ? '?includeInactive=true' : ''}`, { method: 'GET' }, accessToken),
  getInventory: (accessToken: string, farmId: string) =>
    request<{ farmId: string; byGrade: { gradeCode: string; gradeLabel: string; bagCount: number; totalKg: number }[]; totalKg: number; totalBags: number }>(
      `/farms/${farmId}/inventory`,
      { method: 'GET' },
      accessToken,
    ),
  create: (accessToken: string, data: { code: string; name: string; location?: string }) =>
    request<Farm>('/farms', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  update: (accessToken: string, id: string, data: { name?: string; location?: string; isActive?: boolean }) =>
    request<Farm>(`/farms/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, accessToken),
  deactivate: (accessToken: string, id: string) =>
    request<Farm>(`/farms/${id}`, { method: 'DELETE' }, accessToken),
  assignManager: (accessToken: string, farmId: string, userId: string) =>
    request<Farm>(`/farms/${farmId}/managers`, { method: 'POST', body: JSON.stringify({ userId }) }, accessToken),
  createManager: (accessToken: string, farmId: string, data: { firstName: string; lastName: string; email: string; phone?: string }) =>
    request<{ id: string; firstName: string; lastName: string; email: string; temporaryPassword: string }>(
      `/farms/${farmId}/managers/new`,
      { method: 'POST', body: JSON.stringify(data) },
      accessToken,
    ),
  removeManager: (accessToken: string, farmId: string, userId: string) =>
    request<null>(`/farms/${farmId}/managers/${userId}`, { method: 'DELETE' }, accessToken),
};

export const warehousesApi = {
  list: (accessToken: string, includeInactive?: boolean) =>
    request<Warehouse[]>(`/warehouses${includeInactive ? '?includeInactive=true' : ''}`, { method: 'GET' }, accessToken),
  create: (accessToken: string, data: { code: string; name: string; location?: string }) =>
    request<Warehouse>('/warehouses', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  update: (accessToken: string, id: string, data: { name?: string; location?: string; isActive?: boolean }) =>
    request<Warehouse>(`/warehouses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, accessToken),
  deactivate: (accessToken: string, id: string) =>
    request<Warehouse>(`/warehouses/${id}`, { method: 'DELETE' }, accessToken),
  assignManager: (accessToken: string, warehouseId: string, userId: string) =>
    request<Warehouse>(`/warehouses/${warehouseId}/managers`, { method: 'POST', body: JSON.stringify({ userId }) }, accessToken),
  removeManager: (accessToken: string, warehouseId: string, userId: string) =>
    request<null>(`/warehouses/${warehouseId}/managers/${userId}`, { method: 'DELETE' }, accessToken),
};

export interface ExecutiveSummary {
  totalPaddyAvailableKg: number;
  paddyInTransitKg: number;
  paddyInWarehousesKg: number;
  bulkRiceAtMillingKg: number;
  packagedRiceAvailableKg: number;
  salesTodayAmount: number;
  salesThisMonthAmount: number;
  outstandingReceivables: number;
  expensesThisMonth: number;
}

export const reportsApi = {
  executiveSummary: (accessToken: string) =>
    request<ExecutiveSummary>('/reports/executive-summary', { method: 'GET' }, accessToken),
};

export interface Task {
  id: string;
  taskNumber: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  assignedTo: { firstName: string; lastName: string } | null;
  createdBy: { firstName: string; lastName: string };
}

export const tasksApi = {
  listMine: (accessToken: string) => request<Task[]>('/tasks?mine=true', { method: 'GET' }, accessToken),
  listAll: (accessToken: string) => request<Task[]>('/tasks', { method: 'GET' }, accessToken),
  updateStatus: (accessToken: string, id: string, status: string, completionEvidence?: string) =>
    request<Task>(
      `/tasks/${id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status, completionEvidence }) },
      accessToken,
    ),
  create: (
    accessToken: string,
    data: {
      title: string;
      description?: string;
      assignedToId?: string;
      assignedRoleCode?: string;
      dueDate?: string;
      priority?: string;
    },
  ) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }, accessToken),
};

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export const notificationsApi = {
  list: (accessToken: string) => request<Notification[]>('/notifications', { method: 'GET' }, accessToken),
  unreadCount: (accessToken: string) =>
    request<number>('/notifications/unread-count', { method: 'GET' }, accessToken),
  markRead: (accessToken: string, id: string) =>
    request<null>(`/notifications/${id}/read`, { method: 'POST' }, accessToken),
};

export interface AppUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  roles: { role: { code: string; name: string } }[];
}

export interface PaginatedUsers {
  items: AppUser[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DirectoryUser {
  id: string;
  firstName: string;
  lastName: string;
  roleCode: string | null;
  roleName: string | null;
}

export const usersApi = {
  directory: (accessToken: string) => request<DirectoryUser[]>('/users/directory', { method: 'GET' }, accessToken),
  list: (accessToken: string) => request<PaginatedUsers>('/users', { method: 'GET' }, accessToken),
};

// ── Master data (for pickers in Sales/Production forms) ──────────────
export interface Product {
  id: string;
  name: string;
  isActive: boolean;
}
export interface PackagingSize {
  id: string;
  label: string;
  sizeKg: number;
  isActive: boolean;
}

export interface ExpenseCategory {
  id: string;
  name: string;
}

export const masterDataApi = {
  products: (accessToken: string) => request<Product[]>('/master-data/products', { method: 'GET' }, accessToken),
  packagingSizes: (accessToken: string) =>
    request<PackagingSize[]>('/master-data/packaging-sizes', { method: 'GET' }, accessToken),
  expenseCategories: (accessToken: string) =>
    request<ExpenseCategory[]>('/master-data/expense-categories', { method: 'GET' }, accessToken),
};

// ── Sales ──────────────────────────────────────────────────────────
export interface Customer {
  id: string;
  customerNumber: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  creditLimit: number;
  isActive: boolean;
}

export interface SalesOrderItem {
  id: string;
  productId: string;
  product: { name: string };
  packagingSizeId: string;
  packagingSize: { label: string };
  bagCount: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  status: string;
  customer: { name: string; customerNumber: string };
  salesOfficer: { id: string; firstName: string; lastName: string };
  totalKg: number;
  totalAmount: number;
  notes: string | null;
  rejectionReason: string | null;
  createdAt: string;
  items: SalesOrderItem[];
}

export const customersApi = {
  list: (accessToken: string, search?: string) =>
    request<Customer[]>(`/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`, { method: 'GET' }, accessToken),
  create: (accessToken: string, data: { name: string; company?: string; phone?: string; email?: string; creditLimit?: number }) =>
    request<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) }, accessToken),
};

export const salesOrdersApi = {
  list: (accessToken: string, status?: string) =>
    request<SalesOrder[]>(`/sales-orders${status ? `?status=${status}` : ''}`, { method: 'GET' }, accessToken),
  findById: (accessToken: string, id: string) =>
    request<SalesOrder>(`/sales-orders/${id}`, { method: 'GET' }, accessToken),
  create: (
    accessToken: string,
    data: { customerId: string; preferredWarehouseId?: string; notes?: string; items: { productId: string; packagingSizeId: string; bagCount: number }[] },
  ) => request<SalesOrder>('/sales-orders', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  submit: (accessToken: string, id: string) =>
    request<SalesOrder>(`/sales-orders/${id}/submit`, { method: 'POST' }, accessToken),
  approve: (accessToken: string, id: string) =>
    request<SalesOrder>(`/sales-orders/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }, accessToken),
  reject: (accessToken: string, id: string, reason: string) =>
    request<SalesOrder>(`/sales-orders/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
  fulfill: (accessToken: string, id: string) =>
    request<SalesOrder>(`/sales-orders/${id}/fulfill`, { method: 'POST' }, accessToken),
};

// ── Finance ────────────────────────────────────────────────────────
export interface Invoice {
  id: string;
  invoiceNumber: string;
  customer: { name: string };
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: string;
  dueDate: string | null;
  createdAt: string;
}

export interface Payment {
  id: string;
  paymentNumber: string;
  customer: { name: string };
  amount: number;
  method: string;
  status: string;
  paymentDate: string;
  recordedBy: { id: string; firstName: string; lastName: string };
}

export interface TopDebtor {
  customerId: string;
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
}

export const invoicesApi = {
  list: (accessToken: string) => request<Invoice[]>('/invoices', { method: 'GET' }, accessToken),
};

export const paymentsApi = {
  list: (accessToken: string, status?: string) =>
    request<Payment[]>(`/payments${status ? `?status=${status}` : ''}`, { method: 'GET' }, accessToken),
  create: (accessToken: string, data: { customerId: string; amount: number; method: string; paymentDate: string; notes?: string }) =>
    request<Payment>('/payments', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  verify: (accessToken: string, id: string) =>
    request<Payment>(`/payments/${id}/verify`, { method: 'POST' }, accessToken),
  reject: (accessToken: string, id: string, reason: string) =>
    request<Payment>(`/payments/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
};

export const receivablesApi = {
  topDebtors: (accessToken: string) => request<TopDebtor[]>('/receivables/top-debtors', { method: 'GET' }, accessToken),
};

// ── Production & Machines ─────────────────────────────────────────
export interface ProductionRecord {
  id: string;
  recordNumber: string;
  status: string;
  millingCenter: { name: string };
  machine: { name: string } | null;
  operator: { id: string; firstName: string; lastName: string };
  paddyProcessedKg: number;
  recoveredRiceKg: number;
  recoveryPercent: number;
  massBalanceFlag: boolean;
  date: string;
}

export interface Machine {
  id: string;
  machineCode: string;
  machineName: string;
  status: string;
  millingCenter: { name: string };
}

export const productionApi = {
  list: (accessToken: string, status?: string) =>
    request<ProductionRecord[]>(`/production-records${status ? `?status=${status}` : ''}`, { method: 'GET' }, accessToken),
  approve: (accessToken: string, id: string) =>
    request<ProductionRecord>(`/production-records/${id}/approve`, { method: 'POST' }, accessToken),
  reject: (accessToken: string, id: string, reason: string) =>
    request<ProductionRecord>(`/production-records/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
};

export interface MeterReading {
  id: string;
  date: string;
  shift: string | null;
  openingReading: number;
  closingReading: number;
  consumption: number;
  unit: string;
  isAnomalous: boolean;
  anomalyReason: string | null;
  operator: { firstName: string; lastName: string };
}

export interface MachineDetail extends Machine {
  meterReadings: MeterReading[];
}

export const machinesApi = {
  list: (accessToken: string) => request<Machine[]>('/machines', { method: 'GET' }, accessToken),
  findById: (accessToken: string, id: string) => request<MachineDetail>(`/machines/${id}`, { method: 'GET' }, accessToken),
  recordMeterReading: (
    accessToken: string,
    machineId: string,
    data: { date: string; shift?: string; currentReading: number; unit?: string; notes?: string },
  ) => request<MeterReading>(`/machines/${machineId}/meter-readings`, { method: 'POST', body: JSON.stringify(data) }, accessToken),
};

// ── Packaging ──────────────────────────────────────────────────────
export interface PackagingBatch {
  id: string;
  batchNumber: string;
  product: { name: string };
  packagingSize: { label: string };
  bagCount: number;
  totalKg: number;
  warehouse: { name: string };
  createdAt: string;
}

export const packagingApi = {
  list: (accessToken: string, warehouseId?: string) =>
    request<PackagingBatch[]>(`/packaging-batches${warehouseId ? `?warehouseId=${warehouseId}` : ''}`, { method: 'GET' }, accessToken),
};

// ── Messaging ──────────────────────────────────────────────────────
export interface Conversation {
  id: string;
  type: string;
  title: string | null;
  unreadCount: number;
  members: { user: { id: string; firstName: string; lastName: string } }[];
  messages: { body: string; createdAt: string }[];
}

export interface Message {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; firstName: string; lastName: string };
  requiresAcknowledgment: boolean;
}

export const messagingApi = {
  listConversations: (accessToken: string) =>
    request<Conversation[]>('/conversations', { method: 'GET' }, accessToken),
  listMessages: (accessToken: string, conversationId: string) =>
    request<Message[]>(`/conversations/${conversationId}/messages`, { method: 'GET' }, accessToken),
  sendMessage: (accessToken: string, conversationId: string, body: string) =>
    request<Message>(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ body }) }, accessToken),
  createConversation: (accessToken: string, data: { type: string; title?: string; memberIds: string[] }) =>
    request<Conversation>('/conversations', { method: 'POST', body: JSON.stringify(data) }, accessToken),
};

// ── AI Assistant ───────────────────────────────────────────────────
export interface AssistantAnswer {
  answer: string;
  sourceData: string;
  dateRange: string;
  confidencePercent: number;
  assumptions: string;
}

export const aiApi = {
  ask: (accessToken: string, question: string) =>
    request<AssistantAnswer>('/ai/assistant/ask', { method: 'POST', body: JSON.stringify({ question }) }, accessToken),
};

// ── Admin: audit, backup, reset ───────────────────────────────────
export interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  user: { firstName: string; lastName: string } | null;
  createdAt: string;
}

export interface BackupRecord {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

export interface ResetRequest {
  id: string;
  requestNumber: string;
  resetType: string;
  scope: string;
  status: string;
  reason: string;
  requestedBy: { firstName: string; lastName: string };
  financeApprovedBy: { firstName: string; lastName: string } | null;
  mdApprovedBy: { firstName: string; lastName: string } | null;
  createdAt: string;
}

export const auditApi = {
  list: (accessToken: string) =>
    request<{ items: AuditLogEntry[]; total: number }>('/audit-logs', { method: 'GET' }, accessToken),
};

export const backupApi = {
  status: (accessToken: string) =>
    request<{ lastSuccess: BackupRecord | null; lastFailure: BackupRecord | null; currentlyRunning: BackupRecord | null }>(
      '/backups/status',
      { method: 'GET' },
      accessToken,
    ),
};

export const systemResetApi = {
  list: (accessToken: string) => request<ResetRequest[]>('/reset-requests', { method: 'GET' }, accessToken),
  approve: (accessToken: string, id: string) =>
    request<ResetRequest>(`/reset-requests/${id}/approve`, { method: 'POST' }, accessToken),
  reject: (accessToken: string, id: string, reason: string) =>
    request<ResetRequest>(`/reset-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
};

// ── Master data: paddy grades ─────────────────────────────────────
export interface PaddyGrade {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
}

export const paddyGradesApi = {
  list: (accessToken: string) => request<PaddyGrade[]>('/master-data/paddy-grades', { method: 'GET' }, accessToken),
};

// ── Paddy entries ──────────────────────────────────────────────────
export interface PaddyEntry {
  id: string;
  entryNumber: string;
  status: string;
  farm: { name: string; code: string };
  paddyGrade: { label: string };
  weightKg: number;
  weightEstimated: boolean;
  bagCount: number;
  entryDate: string;
  moisturePercent: number | null;
  qualityGrade: string | null;
  harvestDate: string | null;
  supplierName: string | null;
  storageLocation: string | null;
  notes: string | null;
  rejectionReason: string | null;
  submittedBy: { firstName: string; lastName: string };
}

export const paddyEntriesApi = {
  list: (accessToken: string, farmId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (farmId) params.set('farmId', farmId);
    if (status) params.set('status', status);
    const qs = params.toString();
    return request<PaddyEntry[]>(`/paddy-entries${qs ? `?${qs}` : ''}`, { method: 'GET' }, accessToken);
  },
  create: (
    accessToken: string,
    data: { farmId: string; entryDate: string; paddyGradeId: string; weightKg?: number; bagCount: number; moisturePercent?: number; qualityGrade?: string; notes?: string },
  ) => request<PaddyEntry>('/paddy-entries', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  submit: (accessToken: string, id: string) =>
    request<PaddyEntry>(`/paddy-entries/${id}/submit`, { method: 'POST' }, accessToken),
  approve: (accessToken: string, id: string) =>
    request<PaddyEntry>(`/paddy-entries/${id}/approve`, { method: 'POST' }, accessToken),
  reject: (accessToken: string, id: string, reason: string) =>
    request<PaddyEntry>(`/paddy-entries/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
};

// ── Deliveries: orders, reports, shipments ────────────────────────
export interface DeliveryOrder {
  id: string;
  orderNumber: string;
  status: string;
  farm: { name: string };
  destinationWarehouse: { name: string };
  paddyGrade: { label: string };
  bagCount: number;
  totalKg: number;
  requestedDate: string;
}

export interface DeliveryReport {
  id: string;
  reportNumber: string;
  status: string;
  farm: { name: string };
  destinationWarehouse: { name: string };
  paddyGrade: { label: string };
  actualBagCount: number;
  actualKg: number;
  labourCost: number;
  transportationFee: number;
  otherCosts: number;
  otherCostsDescription: string | null;
  totalDeliveryCost: number;
  vehicle: { plateNumber: string } | null;
  driver: { name: string } | null;
  departureTime: string | null;
  rejectionReason: string | null;
  deliveryOrderId: string;
}

export interface Shipment {
  id: string;
  shipmentNumber: string;
  farm: { name: string };
  warehouse: { name: string };
  paddyGrade: { label: string };
  expectedKg: number;
  expectedBags: number;
  receivedKg: number | null;
  receivedBags: number | null;
  varianceKg: number | null;
  receivedCondition: string | null;
  receivedMoisturePercent: number | null;
  departedAt: string;
  receivedAt: string | null;
  receivedBy: { id: string; firstName: string; lastName: string } | null;
  deliveryReport: { vehicle: { plateNumber: string; vehicleType: string | null } | null; driver: { name: string; phone: string | null } | null } | null;
}

export const deliveryOrdersApi = {
  list: (accessToken: string, farmId?: string) =>
    request<DeliveryOrder[]>(`/delivery-orders${farmId ? `?farmId=${farmId}` : ''}`, { method: 'GET' }, accessToken),
  create: (
    accessToken: string,
    data: { farmId: string; destinationWarehouseId: string; requestedDate: string; paddyGradeId: string; bagCount: number; totalKg: number },
  ) => request<DeliveryOrder>('/delivery-orders', { method: 'POST', body: JSON.stringify(data) }, accessToken),
};

export const deliveryReportsApi = {
  list: (accessToken: string, farmId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (farmId) params.set('farmId', farmId);
    if (status) params.set('status', status);
    const qs = params.toString();
    return request<DeliveryReport[]>(`/delivery-reports${qs ? `?${qs}` : ''}`, { method: 'GET' }, accessToken);
  },
  create: (
    accessToken: string,
    data: {
      deliveryOrderId: string;
      actualBagCount: number;
      actualKg: number;
      labourCost?: number;
      numberOfLabourers?: number;
      transportationFee?: number;
      otherCosts?: number;
      otherCostsDescription?: string;
      vehiclePlateNumber?: string;
      vehicleType?: string;
      driverName?: string;
      driverPhone?: string;
      driverLicenseNumber?: string;
      departureDate?: string;
      departureTime?: string;
    },
  ) => request<DeliveryReport>('/delivery-reports', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  submit: (accessToken: string, id: string) =>
    request<DeliveryReport>(`/delivery-reports/${id}/submit`, { method: 'POST' }, accessToken),
  approve: (accessToken: string, id: string) =>
    request<DeliveryReport>(`/delivery-reports/${id}/approve`, { method: 'POST' }, accessToken),
  reject: (accessToken: string, id: string, reason: string) =>
    request<DeliveryReport>(`/delivery-reports/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
};

export const shipmentsApi = {
  list: (accessToken: string, warehouseId?: string, inTransitOnly?: boolean) => {
    const params = new URLSearchParams();
    if (warehouseId) params.set('warehouseId', warehouseId);
    if (inTransitOnly) params.set('inTransitOnly', 'true');
    const qs = params.toString();
    return request<Shipment[]>(`/shipments${qs ? `?${qs}` : ''}`, { method: 'GET' }, accessToken);
  },
  receive: (
    accessToken: string,
    id: string,
    receivedKg: number,
    receivedBags: number,
    receivedCondition?: string,
    receivedMoisturePercent?: number,
    notes?: string,
  ) =>
    request<Shipment>(
      `/shipments/${id}/receive`,
      { method: 'POST', body: JSON.stringify({ receivedKg, receivedBags, receivedCondition, receivedMoisturePercent, notes }) },
      accessToken,
    ),
};

// ── Roles & Permissions (Admin) ────────────────────────────────────
export interface Permission {
  id: string;
  code: string;
  module: string;
  description: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  permissions: { permission: Permission }[];
}

export const rolesApi = {
  list: (accessToken: string) => request<Role[]>('/roles', { method: 'GET' }, accessToken),
  updatePermissions: (accessToken: string, code: string, permissionCodes: string[]) =>
    request<Role>(`/roles/${code}/permissions`, { method: 'PATCH', body: JSON.stringify({ permissionCodes }) }, accessToken),
  clone: (accessToken: string, sourceCode: string, newCode: string, newName: string) =>
    request<Role>(`/roles/${sourceCode}/clone`, { method: 'POST', body: JSON.stringify({ newCode, newName }) }, accessToken),
};

export const permissionsApi = {
  listGrouped: (accessToken: string) =>
    request<Record<string, Permission[]>>('/permissions?grouped=true', { method: 'GET' }, accessToken),
};

// ── Organization (Admin) ───────────────────────────────────────────
export interface Company {
  id: string;
  name: string;
  poBox: string | null;
  address: string | null;
  email: string | null;
  phone1: string | null;
  phone2: string | null;
  facebook: string | null;
  currency: string;
  timezone: string;
}

export interface Facility {
  id: string;
  name: string;
  type: string;
  region: string | null;
  townOrArea: string | null;
  gpsAddress: string | null;
  isActive: boolean;
}

export const organizationApi = {
  getCompany: (accessToken: string) => request<Company>('/organization/company', { method: 'GET' }, accessToken),
  updateCompany: (
    accessToken: string,
    data: { name?: string; poBox?: string; address?: string; email?: string; phone1?: string; phone2?: string; facebook?: string; currency?: string; timezone?: string },
  ) => request<Company>('/organization/company', { method: 'PATCH', body: JSON.stringify(data) }, accessToken),
  listFacilities: (accessToken: string) => request<Facility[]>('/organization/facilities', { method: 'GET' }, accessToken),
};

// ── Quality Inspections ─────────────────────────────────────────────
export interface QualityInspection {
  id: string;
  batchNumber: string;
  moisturePercent: number | null;
  grainQuality: string | null;
  foreignMaterialPercent: number | null;
  brokenPercent: number | null;
  impurities: string | null;
  appearance: string | null;
  smell: string | null;
  qualityGrade: string | null;
  result: string;
  notes: string | null;
  inspectionDate: string;
  inspector: { firstName: string; lastName: string };
}

export const qualityApi = {
  list: (accessToken: string, batchNumber?: string) =>
    request<QualityInspection[]>(`/quality-inspections${batchNumber ? `?batchNumber=${encodeURIComponent(batchNumber)}` : ''}`, { method: 'GET' }, accessToken),
  create: (
    accessToken: string,
    data: {
      batchNumber: string;
      moisturePercent?: number;
      grainQuality?: string;
      foreignMaterialPercent?: number;
      brokenPercent?: number;
      impurities?: string;
      appearance?: string;
      smell?: string;
      qualityGrade?: string;
      result: string;
      notes?: string;
    },
  ) => request<QualityInspection>('/quality-inspections', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  release: (accessToken: string, id: string, notes?: string) =>
    request<QualityInspection>(`/quality-inspections/${id}/release`, { method: 'POST', body: JSON.stringify({ notes }) }, accessToken),
};

// ── Expenses ─────────────────────────────────────────────────────────
export interface Expense {
  id: string;
  expenseNumber: string;
  category: { name: string };
  amount: number;
  date: string;
  farm: { name: string } | null;
  warehouse: { name: string } | null;
  status: string;
  paymentMethod: string | null;
  reference: string | null;
  customCategoryLabel: string | null;
  itemDescription: string | null;
  notes: string | null;
  rejectionReason: string | null;
  submittedBy: { firstName: string; lastName: string };
}

export const expensesApi = {
  list: (accessToken: string, status?: string) =>
    request<Expense[]>(`/expenses${status ? `?status=${status}` : ''}`, { method: 'GET' }, accessToken),
  create: (
    accessToken: string,
    data: { categoryId: string; amount: number; date: string; farmId?: string; warehouseId?: string; paymentMethod?: string; reference?: string; customCategoryLabel?: string; itemDescription?: string; notes?: string },
  ) => request<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  approve: (accessToken: string, id: string) =>
    request<Expense>(`/expenses/${id}/approve`, { method: 'POST' }, accessToken),
  reject: (accessToken: string, id: string, reason: string) =>
    request<Expense>(`/expenses/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
};

// ── Executive Analytics ────────────────────────────────────────────
export interface ExecutiveAnalytics {
  monthlySales: { month: string; amount: number }[];
  monthlyExpenses: { month: string; amount: number }[];
  salesByProduct: { product: string; amount: number }[];
  paddyByFarm: { farm: string; kg: number }[];
}

export const analyticsApi = {
  get: (accessToken: string) => request<ExecutiveAnalytics>('/reports/analytics', { method: 'GET' }, accessToken),
};

// ── Inventory Overview ──────────────────────────────────────────────
export interface InventoryRow {
  locationType: string;
  locationName: string;
  itemLabel: string;
  quantityKg: number;
  bagCount: number;
}

export interface InventoryOverview {
  farms: InventoryRow[];
  warehouses: InventoryRow[];
  millingCenters: InventoryRow[];
}

export interface InventorySummary {
  paddy: {
    farmKg: number;
    warehouseKg: number;
    inTransitKg: number;
    atMillingKg: number;
    byFarm: { gradeLabel: string; kg: number; bags: number }[];
  };
  finishedRice: { label: string; availableBags: number; availableKg: number; reservedBags: number; reservedKg: number; totalBags: number; totalKg: number }[];
}

export const inventoryApi = {
  get: (accessToken: string) => request<InventoryOverview>('/reports/inventory', { method: 'GET' }, accessToken),
  getSummary: (accessToken: string) => request<InventorySummary>('/reports/inventory-summary', { method: 'GET' }, accessToken),
};

// ── Stock Transfers ──────────────────────────────────────────────────
export interface StockTransfer {
  id: string;
  transferNumber: string;
  status: string;
  sourceWarehouse: { name: string };
  destWarehouse: { name: string };
  product: { name: string };
  packagingSize: { label: string };
  bagCount: number;
  totalKg: number;
  receivedBagCount: number | null;
  receivedKg: number | null;
  varianceKg: number | null;
  reason: string | null;
  requestedBy: { firstName: string; lastName: string };
  dispatchedAt: string;
}

export const stockTransfersApi = {
  list: (accessToken: string, warehouseId?: string) =>
    request<StockTransfer[]>(`/stock-transfers${warehouseId ? `?warehouseId=${warehouseId}` : ''}`, { method: 'GET' }, accessToken),
  create: (
    accessToken: string,
    data: { sourceWarehouseId: string; destWarehouseId: string; productId: string; packagingSizeId: string; bagCount: number; totalKg: number; reason?: string },
  ) => request<StockTransfer>('/stock-transfers', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  receive: (accessToken: string, id: string, receivedBagCount: number, receivedKg: number) =>
    request<StockTransfer>(`/stock-transfers/${id}/receive`, { method: 'POST', body: JSON.stringify({ receivedBagCount, receivedKg }) }, accessToken),
};

// ── Inventory Adjustments ────────────────────────────────────────────
export interface InventoryAdjustment {
  id: string;
  adjustmentNumber: string;
  locationType: string;
  status: string;
  paddyGrade: { label: string } | null;
  product: { name: string } | null;
  packagingSize: { label: string } | null;
  systemQuantityKg: number;
  systemBagCount: number;
  adjustmentKg: number;
  adjustmentBags: number;
  reason: string;
  rejectionReason: string | null;
  requestedBy: { firstName: string; lastName: string };
}

export const inventoryAdjustmentsApi = {
  list: (accessToken: string, status?: string) =>
    request<InventoryAdjustment[]>(`/inventory-adjustments${status ? `?status=${status}` : ''}`, { method: 'GET' }, accessToken),
  create: (
    accessToken: string,
    data: { locationType: string; locationId: string; paddyGradeId?: string; productId?: string; packagingSizeId?: string; adjustmentKg: number; adjustmentBags: number; reason: string },
  ) => request<InventoryAdjustment>('/inventory-adjustments', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  approve: (accessToken: string, id: string) =>
    request<InventoryAdjustment>(`/inventory-adjustments/${id}/approve`, { method: 'POST' }, accessToken),
  reject: (accessToken: string, id: string, reason: string) =>
    request<InventoryAdjustment>(`/inventory-adjustments/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
};

// ── Inventory Transactions (traceability) ────────────────────────────
export interface InventoryTransactionRecord {
  id: string;
  transactionNumber: string;
  type: string;
  sourceLocationType: string | null;
  sourceLocationId: string | null;
  destLocationType: string | null;
  destLocationId: string | null;
  quantityKg: number;
  bagCount: number | null;
  batchNumber: string | null;
  referenceDocument: string | null;
  paddyGrade: { label: string } | null;
  product: { name: string } | null;
  packagingSize: { label: string } | null;
  user: { firstName: string; lastName: string };
  reason: string | null;
  approvalStatus: string;
  createdAt: string;
}

export const inventoryTransactionsApi = {
  list: (accessToken: string, filters: { batchNumber?: string; locationType?: string; locationId?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.batchNumber) params.set('batchNumber', filters.batchNumber);
    if (filters.locationType) params.set('locationType', filters.locationType);
    if (filters.locationId) params.set('locationId', filters.locationId);
    const qs = params.toString();
    return request<InventoryTransactionRecord[]>(`/inventory-transactions${qs ? `?${qs}` : ''}`, { method: 'GET' }, accessToken);
  },
};
