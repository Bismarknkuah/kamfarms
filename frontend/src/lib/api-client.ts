import type { SiteContent } from './site-content';
import type { Watchlist } from './watchlist';
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

/** What a person is told when the browser gets no reply at all from the server (it is restarting, down, or unreachable). */
export const SERVER_UNREACHABLE_MESSAGE = 'The server did not answer. It may be restarting after an update, so please wait a minute and try again.';

async function request<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(typeof FormData !== 'undefined' && options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });
  } catch (err) {
    // A deliberate cancel is not a server problem. Anything else here means no reply at all (the browser shows it as a
    // CORS error when the server is down), which used to surface as a raw "Failed to fetch" and "Something went wrong".
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(SERVER_UNREACHABLE_MESSAGE, 'SERVER_UNREACHABLE', 0);
  }

  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!res.ok || !body || body.success === false) {
    throw new ApiError(body?.message ?? 'Request failed.', body?.errorCode ?? null, res.status);
  }

  return body.data;
}

/** A file from the server (a receipt), fetched with the person's own sign-in: it is not public, so it cannot be a plain image link. */
async function fetchBlob(path: string, accessToken: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new ApiError(SERVER_UNREACHABLE_MESSAGE, 'SERVER_UNREACHABLE', 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string; errorCode?: string } | null;
    throw new ApiError(body?.message ?? 'The file could not be opened.', body?.errorCode ?? null, res.status);
  }
  return res.blob();
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
  mustChangePassword: boolean;
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
    request<{
      farmId: string;
      byGrade: { gradeCode: string; gradeLabel: string; bagCount: number; totalKg: number }[];
      totalKg: number;
      totalBags: number;
      dispatchedByGrade: { gradeCode: string; gradeLabel: string; bagCount: number; totalKg: number }[];
      dispatchedTotalKg: number;
      dispatchedTotalBags: number;
    }>(
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
  directory: (accessToken: string) => request<{ id: string; name: string; location?: string | null; millingCenters?: { id: string; name: string }[] }[]>('/warehouses/directory', { method: 'GET' }, accessToken),
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
  // Built and working on the backend since an earlier phase
  // (warehouse.inventory.view) with no frontend consumer at all - the
  // exact same class of gap already found and closed for the farm
  // equivalent. Real-time paddy-by-grade and packaged-rice-by-product
  // balances for one specific warehouse.
  getInventory: (accessToken: string, warehouseId: string) =>
    request<WarehouseInventory>(`/warehouses/${warehouseId}/inventory`, { method: 'GET' }, accessToken),
};

export interface WarehouseInventory {
  warehouseId: string;
  paddyByGrade: { gradeCode: string; gradeLabel: string; bagCount: number; totalKg: number }[];
  paddyTotalKg: number;
  packagedByProduct: { productName: string; packageLabel: string; bagCount: number; totalKg: number }[];
}

export interface ExecutiveSummary {
  totalPaddyAvailableKg: number;
  totalPaddyAvailableBags: number;
  paddyInTransitKg: number;
  paddyInTransitBags: number;
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
  /** Binary file responses (CSV/Excel/PDF) never go through request()  - 
   * that helper always calls .json(), which would break on a real file
   * body. Fetches the blob directly and triggers a browser download,
   * reading the filename straight from the server's own
   * Content-Disposition header rather than guessing an extension.
   */
  downloadFarmReport: async (accessToken: string, params: { farmId?: string; from?: string; to?: string; format: 'csv' | 'xlsx' | 'pdf' }) => {
    const qs = new URLSearchParams();
    if (params.farmId) qs.set('farmId', params.farmId);
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    qs.set('format', params.format);
    const res = await fetch(`${API_URL}/reports/farms?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(body?.message ?? 'Failed to download report.', body?.errorCode ?? null, res.status);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="(.+)"/);
    const filename = match ? match[1] : `farm-report.${params.format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  downloadInventory: async (accessToken: string, format: 'csv' | 'xlsx' | 'pdf') => {
    const res = await fetch(`${API_URL}/reports/inventory?format=${format}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(body?.message ?? 'Failed to download inventory.', body?.errorCode ?? null, res.status);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="(.+)"/);
    const filename = match ? match[1] : `inventory-by-location.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  getWarehouseOverview: (accessToken: string, warehouseId?: string) =>
    request<WarehouseOverview>(`/reports/warehouse-overview${warehouseId ? `?warehouseId=${warehouseId}` : ''}`, { method: 'GET' }, accessToken),
  getFarmOverview: (accessToken: string, farmId?: string) =>
    request<FarmOverview>(`/reports/farm-overview${farmId ? `?farmId=${farmId}` : ''}`, { method: 'GET' }, accessToken),
  downloadFarmOverview: async (accessToken: string, format: 'csv' | 'xlsx' | 'pdf', farmId?: string) => {
    const qs = new URLSearchParams({ format });
    if (farmId) qs.set('farmId', farmId);
    const res = await fetch(`${API_URL}/reports/farm-overview?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(body?.message ?? 'Failed to download.', body?.errorCode ?? null, res.status);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="(.+)"/);
    const filename = match ? match[1] : `farm-overview.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  getProductionOverview: (accessToken: string, millingCenterId?: string) =>
    request<ProductionOverview>(`/reports/production-overview${millingCenterId ? `?millingCenterId=${millingCenterId}` : ''}`, { method: 'GET' }, accessToken),
  downloadProductionOverview: async (accessToken: string, format: 'csv' | 'xlsx' | 'pdf', millingCenterId?: string) => {
    const qs = new URLSearchParams({ format });
    if (millingCenterId) qs.set('millingCenterId', millingCenterId);
    const res = await fetch(`${API_URL}/reports/production-overview?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(body?.message ?? 'Failed to download.', body?.errorCode ?? null, res.status);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="(.+)"/);
    const filename = match ? match[1] : `production-overview.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  downloadSalesReport: async (accessToken: string, format: 'csv' | 'xlsx' | 'pdf', params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams({ format });
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    const res = await fetch(`${API_URL}/reports/sales?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(body?.message ?? 'Failed to download sales report.', body?.errorCode ?? null, res.status);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="(.+)"/);
    const filename = match ? match[1] : `sales-report.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  downloadFinanceReport: async (accessToken: string, format: 'csv' | 'xlsx' | 'pdf', params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams({ format });
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    const res = await fetch(`${API_URL}/reports/finance?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(body?.message ?? 'Failed to download finance report.', body?.errorCode ?? null, res.status);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="(.+)"/);
    const filename = match ? match[1] : `finance-report.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  downloadWarehouseReport: async (accessToken: string, format: 'csv' | 'xlsx' | 'pdf', warehouseId?: string) => {
    const qs = new URLSearchParams({ format });
    if (warehouseId) qs.set('warehouseId', warehouseId);
    const res = await fetch(`${API_URL}/reports/warehouses?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(body?.message ?? 'Failed to download warehouse report.', body?.errorCode ?? null, res.status);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="(.+)"/);
    const filename = match ? match[1] : `warehouse-report.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  downloadWarehouseOverview: async (accessToken: string, format: 'csv' | 'xlsx' | 'pdf', warehouseId?: string) => {
    const qs = new URLSearchParams({ format });
    if (warehouseId) qs.set('warehouseId', warehouseId);
    const res = await fetch(`${API_URL}/reports/warehouse-overview?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(body?.message ?? 'Failed to download.', body?.errorCode ?? null, res.status);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="(.+)"/);
    const filename = match ? match[1] : `warehouse-overview.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export interface WarehouseOverview {
  paddy: {
    received: { gradeLabel: string; bags: number; kg: number }[];
    available: { gradeLabel: string; bags: number; kg: number }[];
    inTransit: { gradeLabel: string; bags: number; kg: number }[];
  };
  atMilling: { gradeLabel: string; bags: number; kg: number }[];
  packagedRice: { label: string; kg: number; bags: number }[];
}

export interface FarmOverview {
  paddy: {
    received: { gradeLabel: string; bags: number; kg: number }[];
    available: { gradeLabel: string; bags: number; kg: number }[];
    dispatched: { gradeLabel: string; bags: number; kg: number }[];
  };
}

export interface ProductionOverview {
  processed: { gradeLabel: string; bags: number; kg: number }[];
  recoveredRiceKg: number;
  brokenRiceKg: number;
  riceHullKg: number;
  recoveryPercent: number;
  energyConsumedKwh: number;
}

export interface Task {
  id: string;
  taskNumber: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  completionEvidence: string | null;
  attachmentUrl: string | null;
  /** Set on a dispatch task: the request the farm manager is being asked to carry out. */
  deliveryRequestRef?: string | null;
  supplyRequestNumber?: string | null;
  salesOrderId?: string | null;
  paddyRequestId?: string | null;
  farm?: { name: string } | null;
  warehouse?: { name: string; location?: string | null } | null;
  assignedTo: { firstName: string; lastName: string } | null;
  createdBy: { firstName: string; lastName: string };
}

export const tasksApi = {
  listMine: (accessToken: string) => request<Task[]>('/tasks?mine=true', { method: 'GET' }, accessToken),
  listAll: (accessToken: string) => request<Task[]>('/tasks', { method: 'GET' }, accessToken),
  updateStatus: (accessToken: string, id: string, status: string, completionEvidence?: string, attachmentUrl?: string) =>
    request<Task>(
      `/tasks/${id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status, completionEvidence, attachmentUrl }) },
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
  entityType?: string | null;
  entityId?: string | null;
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
  phone: string | null;
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
  create: (
    accessToken: string,
    data: { firstName: string; lastName: string; email: string; phone?: string; temporaryPassword: string; roleCodes?: string[] },
  ) => request<AppUser>('/users', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  update: (
    accessToken: string,
    id: string,
    data: { firstName?: string; lastName?: string; phone?: string; departmentId?: string; status?: string },
  ) => request<AppUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, accessToken),
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
  createProduct: (accessToken: string, data: { name: string; description?: string }) =>
    request<Product>('/master-data/products', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  toggleProduct: (accessToken: string, id: string, isActive: boolean) =>
    request<Product>(`/master-data/products/${id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }, accessToken),
  packagingSizes: (accessToken: string) =>
    request<PackagingSize[]>('/master-data/packaging-sizes', { method: 'GET' }, accessToken),
  createPackagingSize: (accessToken: string, data: { label: string; sizeKg: number }) =>
    request<PackagingSize>('/master-data/packaging-sizes', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  togglePackagingSize: (accessToken: string, id: string, isActive: boolean) =>
    request<PackagingSize>(`/master-data/packaging-sizes/${id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }, accessToken),
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
  address: string | null;
  location: string | null;
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
  totalKg: number;
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
  deliveryLocation: string | null;
  receiptUrl: string | null;
  /** Who did what, in order: the order's activity trail. Complete when one order is opened; a list carries only the latest stage change. */
  events?: SalesOrderEvent[];
  /** Uploaded payment receipts (the files themselves are fetched one at a time). Present when one order is opened. */
  receipts?: SalesReceiptInfo[];
  _count?: { receipts: number };
  requestedDeliveryDate: string | null;
  notes: string | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  submittedById: string;
  approvedBy?: { firstName: string; lastName: string } | null;
  allocatedWarehouse?: { id: string; name: string } | null;
  preferredWarehouseId?: string | null;
  /** The delivery task created when the order is released: it is how
   * "who released this, and when" is known. */
  tasks?: { id: string; title: string; status: string; createdAt: string; createdBy: { firstName: string; lastName: string } }[];
  items: SalesOrderItem[];
}

export interface SalesOrderEvent {
  id: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorId: string | null;
  actorName: string;
  actorRole: string | null;
  comment: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface SalesReceiptInfo {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  uploadedById: string;
  uploadedByName: string;
  createdAt: string;
}

export interface SalesOrderAvailability {
  orderId: string;
  preferredWarehouseId: string | null;
  warehouses: {
    warehouseId: string;
    warehouseName: string;
    canFulfillAll: boolean;
    lines: { itemId: string; product: string; size: string; requestedBags: number; availableBags: number; enough: boolean }[];
  }[];
}

export interface ProductPrice {
  id: string; productId: string; packagingSizeId: string; customerId: string | null;
  /** A decimal, which the server sends as text. */
  pricePerBag: string | number; effectiveFrom: string; effectiveTo: string | null; isActive: boolean;
  product: { id: string; name: string }; packagingSize: { id: string; label: string; sizeKg: number }; customer: { id: string; name: string } | null;
}
/** The price in force right now for one product and size: the customer's own where they have one, otherwise the list price. */
export interface EffectivePrice { productId: string; packagingSizeId: string; pricePerBag: number; source: 'customer' | 'list' }

export const productPricesApi = {
  list: (accessToken: string) => request<ProductPrice[]>('/product-prices', { method: 'GET', cache: 'no-store' }, accessToken),
  effective: (accessToken: string, customerId?: string) =>
    request<EffectivePrice[]>(`/product-prices/effective${customerId ? `?customerId=${encodeURIComponent(customerId)}` : ''}`, { method: 'GET', cache: 'no-store' }, accessToken),
  create: (accessToken: string, data: { productId: string; packagingSizeId: string; customerId?: string; pricePerBag: number; effectiveFrom: string }) =>
    request<ProductPrice>('/product-prices', { method: 'POST', body: JSON.stringify(data) }, accessToken),
};

export const customersApi = {
  list: (accessToken: string, search?: string) =>
    request<Customer[]>(`/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`, { method: 'GET' }, accessToken),
  create: (accessToken: string, data: { name: string; company?: string; phone?: string; email?: string; address?: string; location?: string; creditLimit?: number }) =>
    request<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) }, accessToken),
};

export const salesOrdersApi = {
  list: (accessToken: string, status?: string) =>
    request<SalesOrder[]>(`/sales-orders${status ? `?status=${status}` : ''}`, { method: 'GET' }, accessToken),
  findById: (accessToken: string, id: string) =>
    request<SalesOrder>(`/sales-orders/${id}`, { method: 'GET' }, accessToken),
  create: (
    accessToken: string,
    data: { customerId: string; preferredWarehouseId?: string; requestedDeliveryDate?: string; deliveryLocation?: string; notes?: string; items: { productId: string; packagingSizeId: string; bagCount: number }[] },
  ) => request<SalesOrder>('/sales-orders', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  submit: (accessToken: string, id: string) =>
    request<SalesOrder>(`/sales-orders/${id}/submit`, { method: 'POST' }, accessToken),
  attachReceipt: (accessToken: string, id: string, receiptUrl: string) =>
    request<SalesOrder>(`/sales-orders/${id}/receipt`, { method: 'POST', body: JSON.stringify({ receiptUrl }) }, accessToken),
  /** The Finance Director's decision. Purely financial: no warehouse involved. */
  approve: (accessToken: string, id: string, note?: string) =>
    request<SalesOrder>(`/sales-orders/${id}/approve`, { method: 'POST', body: JSON.stringify(note ? { note } : {}) }, accessToken),
  /** The Managing Director's / CEO's step: release the approved order. The Warehouse Supervisor chooses the warehouse next. */
  release: (accessToken: string, id: string, data: { note?: string } = {}) =>
    request<SalesOrder>(`/sales-orders/${id}/release`, { method: 'POST', body: JSON.stringify(data) }, accessToken),
  /** The Warehouse Supervisor's step: which warehouse prepares and sends it (or, before it starts, moves it to another). */
  assignWarehouse: (accessToken: string, id: string, data: { warehouseId: string; note?: string }) =>
    request<SalesOrder>(`/sales-orders/${id}/assign-warehouse`, { method: 'POST', body: JSON.stringify(data) }, accessToken),
  startProcessing: (accessToken: string, id: string, note?: string) =>
    request<SalesOrder>(`/sales-orders/${id}/start-processing`, { method: 'POST', body: JSON.stringify(note ? { note } : {}) }, accessToken),
  /** "On track": it has left the warehouse. */
  dispatch: (accessToken: string, id: string, data: { driverName?: string; vehicleNumber?: string; expectedDeliveryAt?: string; note?: string }) =>
    request<SalesOrder>(`/sales-orders/${id}/dispatch`, { method: 'POST', body: JSON.stringify(data) }, accessToken),
  /** A payment receipt, uploaded as a file from a phone or computer. */
  uploadReceipt: (accessToken: string, id: string, file: Blob, fileName: string, note?: string) => {
    const form = new FormData();
    form.append('file', file, fileName);
    if (note) form.append('note', note);
    return request<SalesOrder>(`/sales-orders/${id}/receipts`, { method: 'POST', body: form }, accessToken);
  },
  receiptFile: (accessToken: string, id: string, receiptId: string) => fetchBlob(`/sales-orders/${id}/receipts/${receiptId}/file`, accessToken),
  removeReceipt: (accessToken: string, id: string, receiptId: string) =>
    request<SalesOrder>(`/sales-orders/${id}/receipts/${receiptId}`, { method: 'DELETE' }, accessToken),
  availability: (accessToken: string, id: string) =>
    request<SalesOrderAvailability>(`/sales-orders/${id}/availability`, { method: 'GET' }, accessToken),
  cancel: (accessToken: string, id: string, reason?: string) =>
    request<SalesOrder>(`/sales-orders/${id}/cancel`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) }, accessToken),
  reject: (accessToken: string, id: string, reason: string) =>
    request<SalesOrder>(`/sales-orders/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
  /** Confirms the delivery: the stock leaves the warehouse. */
  fulfill: (accessToken: string, id: string, note?: string) =>
    request<SalesOrder>(`/sales-orders/${id}/fulfill`, { method: 'POST', body: JSON.stringify(note ? { note } : {}) }, accessToken),
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
  notes: string | null;
  receiptUrl: string | null;
  recordedBy: { id: string; firstName: string; lastName: string };
}

export interface TopDebtor {
  customerId: string;
  customerName: string;
  customerNumber: string;
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
  create: (accessToken: string, data: { customerId: string; amount: number; method: string; paymentDate: string; notes?: string; receiptUrl?: string }) =>
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
  machine: { machineName: string } | null;
  operator: { id: string; firstName: string; lastName: string };
  paddyProcessedKg: number;
  recoveredRiceKg: number;
  brokenRiceKg: number;
  riceHullKg: number;
  wasteLossKg: number;
  recoveryPercent: number;
  massBalanceFlag: boolean;
  sourceReferenceNumbers: string[];
  date: string;
}

export interface Machine {
  id: string;
  machineCode: string;
  machineName: string;
  status: string;
  millingCenter: { id: string; name: string };
}

export const productionApi = {
  list: (accessToken: string, status?: string) =>
    request<ProductionRecord[]>(`/production-records${status ? `?status=${status}` : ''}`, { method: 'GET' }, accessToken),
  create: (
    accessToken: string,
    data: {
      millingCenterId: string; machineId?: string; date: string; shift?: string; paddyGradeId: string;
      paddyProcessedKg: number; paddyProcessedBags?: number; recoveredRiceKg: number; brokenRiceKg: number; riceHullKg: number; riceHullBags?: number; wasteLossKg: number;
      electricityMeterOpening?: number; electricityMeterClosing?: number; energyConsumptionKwh?: number;
      remarks?: string; sourceReferenceNumbers?: string[];
    },
  ) => request<ProductionRecord>('/production-records', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  predict: (accessToken: string, paddyGradeId: string, bagCount: number) =>
    request<YieldPrediction>(`/production-records/predict?paddyGradeId=${paddyGradeId}&bagCount=${bagCount}`, { method: 'GET' }, accessToken),
  approve: (accessToken: string, id: string) =>
    request<ProductionRecord>(`/production-records/${id}/approve`, { method: 'POST' }, accessToken),
  reject: (accessToken: string, id: string, reason: string) =>
    request<ProductionRecord>(`/production-records/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
};

export interface YieldPrediction {
  hasHistory: boolean;
  sampleSize: number;
  inputKg?: number;
  expectedRecoveredKg?: number;
  expectedBrokenKg?: number;
  expectedHullKg?: number;
  expectedWasteKg?: number;
  expectedEnergyKwh?: number | null;
  basedOnRecoveryPercent?: number;
  basedOnBrokenPercent?: number;
  basedOnHullPercent?: number;
}

export interface PaddyMillingReceipt {
  id: string;
  receiptNumber: string;
  millingCenter: { name: string };
  date: string;
  recordedBy: { firstName: string; lastName: string };
  notes: string | null;
  lines: { paddyGrade: { label: string }; bagCount: number; kg: number }[];
}

export const paddyMillingReceiptsApi = {
  list: (accessToken: string, millingCenterId?: string) =>
    request<PaddyMillingReceipt[]>(`/paddy-milling-receipts${millingCenterId ? `?millingCenterId=${millingCenterId}` : ''}`, { method: 'GET' }, accessToken),
  create: (accessToken: string, data: { millingCenterId: string; date: string; lines: { paddyGradeId: string; bagCount: number; kg?: number }[]; notes?: string }) =>
    request<PaddyMillingReceipt>('/paddy-milling-receipts', { method: 'POST', body: JSON.stringify(data) }, accessToken),
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
  create: (
    accessToken: string,
    data: { machineCode: string; machineName: string; millingCenterId: string; type?: string; manufacturer?: string; model?: string; serialNumber?: string; installationDate?: string; ratedCapacity?: number; meterType?: string },
  ) => request<Machine>('/machines', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  updateStatus: (accessToken: string, id: string, data: { status: string; notes?: string }) =>
    request<Machine>(`/machines/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }, accessToken),
  recordMaintenance: (
    accessToken: string,
    id: string,
    data: { type: string; scheduledDate?: string; completedDate?: string; technician?: string; cost?: number; downtimeHours?: number; notes?: string },
  ) => request<MachineDetail>(`/machines/${id}/maintenance`, { method: 'POST', body: JSON.stringify(data) }, accessToken),
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
  sourceReferenceNumbers: string[];
  warehouse: { name: string };
  createdAt: string;
}

export const packagingApi = {
  list: (accessToken: string, warehouseId?: string) =>
    request<PackagingBatch[]>(`/packaging-batches${warehouseId ? `?warehouseId=${warehouseId}` : ''}`, { method: 'GET' }, accessToken),
  create: (
    accessToken: string,
    data: { productId: string; packagingSizeId: string; bagCount: number; millingCenterId: string; sourceBulkKg?: number; packagingDate: string; notes?: string; sourceReferenceNumbers?: string[] },
  ) => request<PackagingBatch>('/packaging-batches', { method: 'POST', body: JSON.stringify(data) }, accessToken),
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
  attachmentUrl: string | null;
  attachmentType: string | null;
}

export const messagingApi = {
  listConversations: (accessToken: string) =>
    request<Conversation[]>('/conversations', { method: 'GET' }, accessToken),
  listMessages: (accessToken: string, conversationId: string) =>
    request<Message[]>(`/conversations/${conversationId}/messages`, { method: 'GET' }, accessToken),
  sendMessage: (accessToken: string, conversationId: string, body: string, attachmentUrl?: string, attachmentType?: string) =>
    request<Message>(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ body, attachmentUrl, attachmentType }) }, accessToken),
  createConversation: (accessToken: string, data: { type: string; title?: string; memberIds: string[] }) =>
    request<Conversation>('/conversations', { method: 'POST', body: JSON.stringify(data) }, accessToken),
};

// ── Calls ──────────────────────────────────────────────────────────
// The base URL for the WebSocket signaling connection - same server
// as the REST API, just without the /api prefix, since the gateway is
// registered at its own namespace rather than under /api.
export const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

export interface CallParticipant {
  id: string;
  status: string;
  joinedAt: string | null;
  leftAt: string | null;
  user: { id: string; firstName: string; lastName: string };
}

export interface CallSession {
  id: string;
  type: string;
  title: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  initiatedBy: { id: string; firstName: string; lastName: string };
  participants: CallParticipant[];
}

export interface CallRequest {
  id: string;
  reason: string | null;
  status: string;
  createdAt: string;
  respondedAt: string | null;
  requestedBy: { id: string; firstName: string; lastName: string };
  requestedTo: { id: string; firstName: string; lastName: string };
}

export const callsApi = {
  myActiveCall: (accessToken: string) => request<CallSession | null>('/calls/active', { method: 'GET' }, accessToken),
  listMyCallRequests: (accessToken: string) => request<CallRequest[]>('/call-requests', { method: 'GET' }, accessToken),
  requestCall: (accessToken: string, requestedToId: string, reason?: string) =>
    request<CallRequest>('/call-requests', { method: 'POST', body: JSON.stringify({ requestedToId, reason }) }, accessToken),
  respondToCallRequest: (accessToken: string, id: string, approve: boolean) =>
    request<{ approved: boolean; call: CallSession | null }>(`/call-requests/${id}/respond`, { method: 'POST', body: JSON.stringify({ approve }) }, accessToken),
  initiateCall: (accessToken: string, participantIds: string[], type?: string, title?: string) =>
    request<CallSession>('/calls', { method: 'POST', body: JSON.stringify({ participantIds, type, title }) }, accessToken),
  joinCall: (accessToken: string, id: string) => request<CallSession>(`/calls/${id}/join`, { method: 'POST' }, accessToken),
  declineCall: (accessToken: string, id: string) => request<CallSession>(`/calls/${id}/decline`, { method: 'POST' }, accessToken),
  leaveCall: (accessToken: string, id: string) => request<CallSession>(`/calls/${id}/leave`, { method: 'POST' }, accessToken),
};

// ── AI Assistant ───────────────────────────────────────────────────
export interface AssistantAnswer {
  answer: string;
  sourceData: string;
  dateRange: string;
  confidencePercent: number;
  assumptions: string;
  /** Whose activities the answer covers: "Whole company", or the person's own places. */
  jurisdiction?: string;
  /** Who worked the answer out: Claude (when connected) or the built-in answerer. */
  engine?: 'claude' | 'built-in';
  /** The lookups the answer was drawn from. */
  toolsUsed?: { name: string; label: string; period: string }[];
}

export type AiConfidence = 'high' | 'medium' | 'low';
export interface AiPerKwh { paddyKg: number; riceKg: number; brokenKg: number; hullKg: number; wasteKg: number }
export interface AiYieldRates {
  runs: number;
  basis: 'history' | 'benchmark';
  confidence: AiConfidence;
  energyKwh: number;
  paddyKg: number;
  /** What 1 kWh of metered power gives, in kilograms. */
  perKwh: AiPerKwh;
  /** One spread either side of the figure, per kWh. Null for a benchmark. */
  typical: { riceKg: [number, number]; brokenKg: [number, number]; hullKg: [number, number] } | null;
}
export interface AiBagSizes { paddyKg: number; riceKg: number; brokenKg: number; hullKg: number; hullBasis: 'history' | 'setting' }
export interface AiJurisdiction { companyWide: boolean; label: string; farms: string[]; warehouses: string[] }
export type AiInsights =
  | { available: false; reason: string; jurisdiction: AiJurisdiction }
  | {
      available: true;
      generatedAt: string;
      jurisdiction: AiJurisdiction;
      bagSizes: AiBagSizes;
      window: { runs: number; from: string | null; to: string | null };
      overall: AiYieldRates;
      overallNote: string;
      byGrade: { gradeId: string; code: string; label: string; rates: AiYieldRates; note: string }[];
      byCenter: { centerId: string; code: string; name: string; rates: AiYieldRates; note: string }[];
    };

/** True only for a reply shaped the way the AI page needs. Anything else (an old server, a proxy's error page) is reported, not trusted. */
export function isAiInsights(x: unknown): x is AiInsights {
  const o = x as Record<string, any> | null;
  if (!o || typeof o !== 'object' || typeof o.available !== 'boolean') return false;
  const j = o.jurisdiction;
  if (!j || typeof j.companyWide !== 'boolean' || typeof j.label !== 'string') return false;
  if (!o.available) return typeof o.reason === 'string';
  const rates = (r: any) => !!r && typeof r.runs === 'number' && !!r.perKwh && typeof r.perKwh.riceKg === 'number';
  return rates(o.overall) && typeof o.overallNote === 'string' && !!o.bagSizes && typeof o.bagSizes.riceKg === 'number' && !!o.window && Array.isArray(o.byGrade) && Array.isArray(o.byCenter)
    && o.byGrade.every((g: any) => rates(g?.rates)) && o.byCenter.every((c: any) => rates(c?.rates));
}

export type AiVerdict = 'more' | 'as_expected' | 'less';
export interface AiAmounts { riceKg: number; riceBags: number; brokenKg: number; brokenBags: number; hullKg: number; hullBags: number }
export interface AiRunFeedback {
  id: string; recordNumber: string; date: string; approved: boolean;
  centerId: string; centerName: string; gradeLabel: string; kwh: number; paddyKg: number;
  basis: 'grade' | 'overall' | 'benchmark'; baselineRuns: number;
  expected: AiAmounts; actual: AiAmounts;
  variance: { ricePercent: number; brokenPercent: number; hullPercent: number };
  verdict: AiVerdict; exact: boolean; early: boolean; sentence: string;
}
export interface AiScorecard {
  early: boolean; centerId: string; centerName: string; runs: number; more: number; asExpected: number; less: number;
  kwh: number; expectedRiceBags: number; actualRiceBags: number; riceVariancePercent: number; verdict: AiVerdict;
  latest: { date: string; verdict: AiVerdict; ricePercent: number } | null; sentence: string;
}
export interface AiLearning {
  trainedOnRuns: number; lastRunAt: string | null; halfLifeRuns: number; tolerancePercent: number;
  evaluatedRuns: number; accuracyPercent: number | null; trend: 'learning' | 'improving' | 'steady' | 'worsening';
  recentErrorPercent: number | null; earlierErrorPercent: number | null;
  weekly: { weekStart: string; errorPercent: number; runs: number }[];
  explanation: string;
}
export type AiFeedback =
  | { available: false; reason: string; jurisdiction: AiJurisdiction }
  | {
      available: true; generatedAt: string; jurisdiction: AiJurisdiction; days: number; tolerancePercent: number; bagSizes: AiBagSizes;
      summary: { runs: number; early: number; more: number; asExpected: number; less: number; pendingApproval: number };
      learning: AiLearning; centers: AiScorecard[]; runs: AiRunFeedback[];
    };

/** True only for a reply shaped the way the feedback screens need. */
export function isAiFeedback(x: unknown): x is AiFeedback {
  const o = x as Record<string, any> | null;
  if (!o || typeof o !== 'object' || typeof o.available !== 'boolean') return false;
  if (!o.jurisdiction || typeof o.jurisdiction.companyWide !== 'boolean') return false;
  if (!o.available) return typeof o.reason === 'string';
  return !!o.summary && typeof o.summary.runs === 'number' && !!o.learning && typeof o.learning.trainedOnRuns === 'number' && Array.isArray(o.learning.weekly)
    && Array.isArray(o.centers) && Array.isArray(o.runs) && !!o.bagSizes;
}

export const aiApi = {
  ask: (accessToken: string, question: string, history?: { role: 'user' | 'assistant'; text: string }[]) =>
    request<AssistantAnswer>('/ai/assistant/ask', { method: 'POST', body: JSON.stringify({ question, ...(history?.length ? { history } : {}) }) }, accessToken),
  /** Each milling run against what the AI expected, per milling center, and how the AI itself is learning. */
  feedback: (accessToken: string, days = 30, millingCenterId?: string) =>
    request<AiFeedback>(`/ai/feedback?days=${days}${millingCenterId ? `&millingCenterId=${encodeURIComponent(millingCenterId)}` : ''}`, { method: 'GET', cache: 'no-store' }, accessToken),
  /** What power and paddy turn into, within the signed-in person's jurisdiction (the whole company for the MD and CEO). */
  insights: (accessToken: string) => request<AiInsights>('/ai/insights', { method: 'GET', cache: 'no-store' }, accessToken),
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

export interface NotificationSettings {
  fromEmail: string | null;
  fromName: string | null;
  fromPhone: string | null;
}

export const settingsApi = {
  getNotificationSettings: (accessToken: string) =>
    request<NotificationSettings>('/settings/notifications', { method: 'GET' }, accessToken),
  updateNotificationSettings: (accessToken: string, data: Partial<NotificationSettings>) =>
    request<NotificationSettings>('/settings/notifications', { method: 'PATCH', body: JSON.stringify(data) }, accessToken),
};

export const systemResetApi = {
  list: (accessToken: string) => request<ResetRequest[]>('/reset-requests', { method: 'GET' }, accessToken),
  create: (
    accessToken: string,
    data: { resetType: string; scope: string; affectedTables: string[]; reason: string; impactDescription: string },
  ) => request<ResetRequest>('/reset-requests', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  approve: (accessToken: string, id: string) =>
    request<ResetRequest>(`/reset-requests/${id}/approve`, { method: 'POST' }, accessToken),
  reject: (accessToken: string, id: string, reason: string) =>
    request<ResetRequest>(`/reset-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
  execute: (accessToken: string, id: string) =>
    request<ResetRequest>(`/reset-requests/${id}/execute`, { method: 'POST' }, accessToken),
};

// ── Master data: paddy grades ─────────────────────────────────────
export interface PaddyGrade {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
}

export interface PaddyType {
  id: string;
  name: string;
  isActive: boolean;
}

export const paddyGradesApi = {
  list: (accessToken: string) => request<PaddyGrade[]>('/master-data/paddy-grades', { method: 'GET' }, accessToken),
  create: (accessToken: string, data: { code: string; label: string; description?: string }) =>
    request<PaddyGrade>('/master-data/paddy-grades', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  toggle: (accessToken: string, id: string, isActive: boolean) =>
    request<PaddyGrade>(`/master-data/paddy-grades/${id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }, accessToken),
};

export const paddyTypesApi = {
  list: (accessToken: string) => request<PaddyType[]>('/master-data/paddy-types', { method: 'GET' }, accessToken),
  create: (accessToken: string, name: string) =>
    request<PaddyType>('/master-data/paddy-types', { method: 'POST', body: JSON.stringify({ name }) }, accessToken),
};

// ── Paddy entries ──────────────────────────────────────────────────
export interface PaddyEntry {
  id: string;
  entryNumber: string;
  /** Sizes saved together as one intake share this reference (e.g. 17 bags of Size 4 and 3 bags of Size 5). */
  intakeRef?: string | null;
  status: string;
  farm: { name: string; code: string };
  paddyGradeId: string;
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

/** One intake with several sizes, saved together (all or none). */
export interface PaddyIntakeInput {
  farmId: string;
  entryDate: string;
  lines: { paddyGradeId: string; bagCount: number; weightKg?: number }[];
  moisturePercent?: number;
  qualityGrade?: string;
  supplierName?: string;
  notes?: string;
  /** Default true: send it for approval straight away. false saves a draft. */
  submit?: boolean;
}
export interface PaddyIntakeResult {
  intakeRef: string;
  status: 'SUBMITTED' | 'DRAFT';
  submitted: boolean;
  farmName: string;
  totalBags: number;
  totalKg: number;
  anyWeightEstimated: boolean;
  entries: { id: string; entryNumber: string; paddyGradeId: string; gradeLabel: string; bagCount: number; weightKg: number; weightEstimated: boolean; status: string }[];
}

export const paddyEntriesApi = {
  list: (accessToken: string, farmId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (farmId) params.set('farmId', farmId);
    if (status) params.set('status', status);
    const qs = params.toString();
    return request<PaddyEntry[]>(`/paddy-entries${qs ? `?${qs}` : ''}`, { method: 'GET' }, accessToken);
  },
  /** Every size that arrived in one go: all of it is saved, or none of it, and the server says why if it fails. */
  createIntake: (accessToken: string, data: PaddyIntakeInput) =>
    request<PaddyIntakeResult>('/paddy-entries/intake', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  create: (
    accessToken: string,
    data: { farmId: string; entryDate: string; paddyGradeId: string; weightKg?: number; bagCount: number; moisturePercent?: number; qualityGrade?: string; notes?: string },
  ) => request<PaddyEntry>('/paddy-entries', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  update: (
    accessToken: string,
    id: string,
    data: { entryDate?: string; paddyGradeId?: string; weightKg?: number; bagCount?: number; moisturePercent?: number; qualityGrade?: string; notes?: string },
  ) => request<PaddyEntry>(`/paddy-entries/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, accessToken),
  submit: (accessToken: string, id: string) =>
    request<PaddyEntry>(`/paddy-entries/${id}/submit`, { method: 'POST' }, accessToken),
  approve: (accessToken: string, id: string) =>
    request<PaddyEntry>(`/paddy-entries/${id}/approve`, { method: 'POST' }, accessToken),
  reject: (accessToken: string, id: string, reason: string) =>
    request<PaddyEntry>(`/paddy-entries/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
  listComments: (accessToken: string, id: string) =>
    request<PaddyEntryComment[]>(`/paddy-entries/${id}/comments`, { method: 'GET' }, accessToken),
  addComment: (accessToken: string, id: string, message: string) =>
    request<PaddyEntryComment>(`/paddy-entries/${id}/comments`, { method: 'POST', body: JSON.stringify({ message }) }, accessToken),
};

export interface PaddyEntryComment {
  id: string;
  message: string;
  author: { firstName: string; lastName: string };
  createdAt: string;
}

// ── Deliveries: orders, reports, shipments ────────────────────────
/** Where a dispatch order is, in plain words (worked out by the server from what has actually happened). */
export interface DispatchStep { id: 'requested' | 'preparing' | 'approved' | 'road' | 'arrived'; label: string; state: 'done' | 'current' | 'upcoming'; at: string | null; by: string | null; detail: string | null }
export interface DispatchTracking {
  stage: 'REQUESTED' | 'PREPARING' | 'IN_REVIEW' | 'ON_THE_WAY' | 'ARRIVED' | 'CANCELLED';
  label: string;
  holder: string | null;
  since: string | null;
  sentBack: string | null;
  steps: DispatchStep[];
  driverName: string | null;
  vehiclePlate: string | null;
  bagsLoaded: number | null;
  bagsReceived: number | null;
  bagVariance: number | null;
  varianceRequiresApproval: boolean;
}

export interface DeliveryOrder {
  id: string;
  orderNumber: string;
  /** Orders made together in one request share this. */
  requestRef?: string | null;
  status: string;
  priority?: string;
  notes?: string | null;
  farm: { name: string };
  destinationWarehouse: { name: string; location?: string | null };
  paddyGrade: { label: string };
  createdBy?: { firstName: string; lastName: string } | null;
  bagCount: number;
  totalKg: number;
  totalKgEstimated: boolean;
  requestedDate: string;
  tracking?: DispatchTracking;
}

/** One card per dispatch request, shared by the Farm Supervisor who asked and the farm manager who does it (see the server's dispatch-board). */
export type DispatchStage = DispatchTracking['stage'];
export interface RequestCardLine { orderId: string; orderNumber: string; gradeLabel: string; bagCount: number; totalKg: number; totalKgEstimated: boolean; stage: DispatchStage; label: string }
export interface DispatchLineView {
  reportId: string; reportNumber: string; orderNumber: string; gradeLabel: string; bags: number; kg: number; kgEstimated: boolean; status: string;
  shipment: { shipmentNumber: string | null; expectedBags: number | null; receivedBags: number | null; receivedAt: string | null; varianceRequiresApproval: boolean } | null;
}
export interface DispatchView {
  ref: string; dispatchRef: string | null; status: string; lines: DispatchLineView[]; totalBags: number; totalKg: number;
  preparedBy: string; preparedById: string | null; preparedAt: string | null; submittedAt: string | null; approvedBy: string; approvedAt: string | null; rejectionReason: string | null;
  driverName: string | null; driverPhone: string | null; vehiclePlate: string | null; vehicleType: string | null;
  departureDate: string | null; departureTime: string | null; expectedArrivalTime: string | null; remarks: string | null;
  labourCost: number; numberOfLabourers: number | null; transportationFee: number; otherCosts: number; otherCostsDescription: string | null; totalCost: number;
}
export interface RequestCard {
  key: string; requestRef: string | null;
  farm: { id: string; name: string }; warehouse: { id: string; name: string; location: string | null };
  requestedDate: string | null; priority: string; notes: string | null; requestedBy: string; requestedById: string | null; createdAt: string | null;
  lines: RequestCardLine[]; totalBags: number; dispatches: DispatchView[];
  stage: DispatchStage; label: string; holder: string | null; since: string | null; sentBack: string | null; steps: DispatchStep[];
  overdue: boolean; daysOverdue: number; awaitingApproval: boolean; arrivedAt: string | null; bagVariance: number | null; varianceRequiresApproval: boolean;
}
export interface DispatchInput {
  /** An order the request already has, or just a size (paddyGradeId): its order is made as the truck is loaded. */
  lines: { deliveryOrderId?: string; paddyGradeId?: string; actualBagCount: number; actualKg?: number }[];
  /** For a size no order exists for: which request this truck is for; or, with no request at all, where it leaves from and goes to. */
  requestRef?: string; farmId?: string; destinationWarehouseId?: string;
  labourCost?: number; numberOfLabourers?: number; transportationFee?: number; otherCosts?: number; otherCostsDescription?: string;
  vehiclePlateNumber?: string; vehicleType?: string; driverName?: string; driverPhone?: string;
  departureDate?: string; departureTime?: string; expectedArrivalTime?: string; remarks?: string;
  /** Default true: send it to the supervisor straight away. false saves a draft. */
  submit?: boolean;
}
export interface DispatchResult {
  dispatchRef: string; status: string; submitted: boolean; farmName: string; warehouse: { name: string; location: string | null };
  totalBags: number; totalKg: number; anyKgEstimated: boolean;
  lines: { reportNumber: string; orderNumber: string | null; gradeLabel: string; bags: number; kg: number; kgEstimated: boolean }[];
  driverName: string | null; vehiclePlate: string | null; totalCost: number;
}

export interface DispatchRequestInput {
  farmId: string;
  destinationWarehouseId: string;
  requestedDate: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  notes?: string;
  lines: { paddyGradeId: string; bagCount: number; totalKg?: number }[];
}
export interface DispatchRequestResult {
  requestRef: string;
  farmName: string;
  warehouse: { id: string; name: string; location: string | null; contacts: { name: string; phone?: string | null }[] };
  requestedDate: string;
  priority: string;
  notes: string | null;
  totalBags: number;
  orders: { id: string; orderNumber: string; gradeLabel: string; bagCount: number; totalKg: number; totalKgEstimated: boolean }[];
  tasks: { id: string; taskNumber: string; assignedTo: string }[];
  managers: string[];
  noTaskCreated: boolean;
  noManagerOnFarm: boolean;
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
  /** True when only the bags were counted: the kg is worked out from them, not weighed. */
  actualKgEstimated?: boolean;
  /** Who prepared it, and the trip it belongs to (every size on one truck). */
  submittedById?: string;
  dispatchRef?: string | null;
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
  events?: { id: string; eventType: string; notes: string | null; createdAt: string }[];
}

export const deliveryOrdersApi = {
  list: (accessToken: string, farmId?: string) =>
    request<DeliveryOrder[]>(`/delivery-orders${farmId ? `?farmId=${farmId}` : ''}`, { method: 'GET' }, accessToken),
  create: (
    accessToken: string,
    data: { farmId: string; destinationWarehouseId: string; requestedDate: string; paddyGradeId: string; bagCount: number; totalKg?: number },
  ) => request<DeliveryOrder>('/delivery-orders', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  /** Every dispatch request as one card: the same picture for the supervisor who asked and the farm manager who does it. */
  requests: (accessToken: string) => request<RequestCard[]>('/delivery-orders/requests', { method: 'GET' }, accessToken),
  /** A request to a farm manager: every size in one go, to one warehouse, by a date, with instructions. It also becomes the farm manager's task. */
  createRequest: (accessToken: string, data: DispatchRequestInput) =>
    request<DispatchRequestResult>('/delivery-orders/request', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  getFullTrace: (accessToken: string, orderNumber: string) =>
    request<DispatchTrace>(`/delivery-orders/trace/${encodeURIComponent(orderNumber)}`, { method: 'GET' }, accessToken),
};

export interface DispatchTrace {
  order: {
    orderNumber: string; status: string; farmName: string; warehouseName: string; gradeLabel: string;
    bagCount: number; totalKg: number; totalKgEstimated: boolean; requestedDate: string;
  };
  report: {
    reportNumber: string; status: string; actualBagCount: number; actualKg: number;
    driverName: string | null; vehiclePlateNumber: string | null; departureDate: string | null;
  } | null;
  shipment: {
    shipmentNumber: string; departedAt: string; receivedAt: string | null;
    receivedKg: number | null; receivedBags: number | null; varianceKg: number | null;
    varianceRequiresApproval: boolean; receivedCondition: string | null;
    events: { eventType: string; notes: string | null; createdAt: string }[];
  } | null;
};

export const deliveryReportsApi = {
  /** ONE dispatch: one truck with every size on it, prepared in one go (and sent to the supervisor unless submit is false). */
  createDispatch: (accessToken: string, data: DispatchInput) => request<DispatchResult>('/delivery-reports/dispatch', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  submitDispatch: (accessToken: string, ref: string) => request<DispatchResult>(`/delivery-reports/dispatch/${encodeURIComponent(ref)}/submit`, { method: 'POST' }, accessToken),
  approveDispatch: (accessToken: string, ref: string) => request<DispatchResult>(`/delivery-reports/dispatch/${encodeURIComponent(ref)}/approve`, { method: 'POST' }, accessToken),
  rejectDispatch: (accessToken: string, ref: string, reason: string) => request<DispatchResult>(`/delivery-reports/dispatch/${encodeURIComponent(ref)}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
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
      /** Only if it was weighed; leave out when the bags were counted. */
      actualKg?: number;
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
  update: (
    accessToken: string,
    id: string,
    data: {
      actualBagCount?: number;
      actualKg?: number;
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
  ) => request<DeliveryReport>(`/delivery-reports/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, accessToken),
  submit: (accessToken: string, id: string) =>
    request<DeliveryReport>(`/delivery-reports/${id}/submit`, { method: 'POST' }, accessToken),
  approve: (accessToken: string, id: string) =>
    request<DeliveryReport>(`/delivery-reports/${id}/approve`, { method: 'POST' }, accessToken),
  reject: (accessToken: string, id: string, reason: string) =>
    request<DeliveryReport>(`/delivery-reports/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
};

export const shipmentsApi = {
  list: (accessToken: string, filters: { warehouseId?: string; farmId?: string; inTransitOnly?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (filters.warehouseId) params.set('warehouseId', filters.warehouseId);
    if (filters.farmId) params.set('farmId', filters.farmId);
    if (filters.inTransitOnly) params.set('inTransitOnly', 'true');
    const qs = params.toString();
    return request<Shipment[]>(`/shipments${qs ? `?${qs}` : ''}`, { method: 'GET' }, accessToken);
  },
  findById: (accessToken: string, id: string) => request<Shipment>(`/shipments/${id}`, { method: 'GET' }, accessToken),
  addLocationUpdate: (accessToken: string, id: string, notes: string) =>
    request<Shipment>(`/shipments/${id}/location`, { method: 'POST', body: JSON.stringify({ notes }) }, accessToken),
  receive: (
    accessToken: string,
    id: string,
    /** Only if it was weighed; pass undefined when the bags were counted. */
    receivedKg: number | undefined,
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
  create: (accessToken: string, data: { code: string; name: string; description?: string; permissionCodes?: string[] }) =>
    request<Role>('/roles', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  updateDetails: (accessToken: string, code: string, data: { name?: string; description?: string }) =>
    request<Role>(`/roles/${code}`, { method: 'PATCH', body: JSON.stringify(data) }, accessToken),
  updatePermissions: (accessToken: string, code: string, permissionCodes: string[]) =>
    request<Role>(`/roles/${code}/permissions`, { method: 'PATCH', body: JSON.stringify({ permissionCodes }) }, accessToken),
  clone: (accessToken: string, sourceCode: string, newCode: string, newName: string) =>
    request<Role>(`/roles/${sourceCode}/clone`, { method: 'POST', body: JSON.stringify({ newCode, newName }) }, accessToken),
  delete: (accessToken: string, code: string) =>
    request<{ success: boolean; message: string }>(`/roles/${code}`, { method: 'DELETE' }, accessToken),
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
  attachmentUrl: string | null;
  notes: string | null;
  rejectionReason: string | null;
  submittedById?: string;
  /** Set by the server: an expense the Finance Director entered personally is
   * approved by the MD or CEO instead, because nobody may approve their own. */
  submittedByFinanceDirector?: boolean;
  submittedBy: { firstName: string; lastName: string };
}

export const expensesApi = {
  list: (accessToken: string, status?: string) =>
    request<Expense[]>(`/expenses${status ? `?status=${status}` : ''}`, { method: 'GET' }, accessToken),
  create: (
    accessToken: string,
    data: { categoryId: string; amount: number; date: string; farmId?: string; warehouseId?: string; paymentMethod?: string; reference?: string; customCategoryLabel?: string; itemDescription?: string; attachmentUrl?: string; notes?: string },
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
    farmBags: number;
    warehouseKg: number;
    inTransitKg: number;
    inTransitBags: number;
    atMillingKg: number;
    byFarm: { gradeLabel: string; kg: number; bags: number }[];
  };
  finishedRice: { label: string; availableBags: number; availableKg: number; reservedBags: number; reservedKg: number; totalBags: number; totalKg: number }[];
  riceHullKg: number;
  brokenRiceKg: number;
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
    data: { sourceWarehouseId: string; destWarehouseId: string; productId: string; packagingSizeId: string; bagCount: number; /** Leave out: it is the bags times the pack size. */ totalKg?: number; reason?: string },
  ) => request<StockTransfer>('/stock-transfers', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  receive: (accessToken: string, id: string, receivedBagCount: number, receivedKg?: number) =>
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
  approve: (accessToken: string, id: string, overrides?: { adjustmentKg?: number; adjustmentBags?: number; reason?: string }) =>
    request<InventoryAdjustment>(`/inventory-adjustments/${id}/approve`, { method: 'POST', body: JSON.stringify(overrides ?? {}) }, accessToken),
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

export interface InventoryTraceReferences {
  referencedByProductionRecords: { recordNumber: string; date: string; allReferences: string[] }[];
  referencedByPackagingBatches: { batchNumber: string; date: string; allReferences: string[] }[];
  referencedBySalesOrders: { orderNumber: string; allReferences: string[] }[];
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
  traceReferences: (accessToken: string, referenceNumber: string) =>
    request<InventoryTraceReferences>(`/inventory-transactions/trace-references?referenceNumber=${encodeURIComponent(referenceNumber)}`, { method: 'GET' }, accessToken),
};

// ── Farm Equipment ───────────────────────────────────────────────────
export interface FarmEquipment {
  id: string;
  farm: { name: string };
  name: string;
  status: string;
  notes: string | null;
  addedBy: { firstName: string; lastName: string };
  updatedAt: string;
}

export const farmEquipmentApi = {
  list: (accessToken: string, farmId?: string) =>
    request<FarmEquipment[]>(`/farm-equipment${farmId ? `?farmId=${farmId}` : ''}`, { method: 'GET' }, accessToken),
  create: (accessToken: string, data: { farmId: string; name: string; status?: string; notes?: string }) =>
    request<FarmEquipment>('/farm-equipment', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  update: (accessToken: string, id: string, data: { status?: string; name?: string; notes?: string }) =>
    request<FarmEquipment>(`/farm-equipment/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, accessToken),
};

export interface WarehouseEquipment {
  id: string;
  warehouse: { name: string };
  name: string;
  status: string;
  notes: string | null;
  addedBy: { firstName: string; lastName: string };
  updatedAt: string;
}

export const warehouseEquipmentApi = {
  list: (accessToken: string, warehouseId?: string) =>
    request<WarehouseEquipment[]>(`/warehouse-equipment${warehouseId ? `?warehouseId=${warehouseId}` : ''}`, { method: 'GET' }, accessToken),
  create: (accessToken: string, data: { warehouseId: string; name: string; status?: string; notes?: string }) =>
    request<WarehouseEquipment>('/warehouse-equipment', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  update: (accessToken: string, id: string, data: { status?: string; name?: string; notes?: string }) =>
    request<WarehouseEquipment>(`/warehouse-equipment/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, accessToken),
};

// ── Paddy Requests (Warehouse ↔ Farm Supervisor) ────────────────────
export interface PaddyRequest {
  id: string;
  requestNumber: string;
  warehouse: { name: string };
  paddyGrade: { label: string };
  requestedBagCount: number;
  requestedKg: number;
  notes: string | null;
  status: string;
  requestedBy: { firstName: string; lastName: string };
  respondedBy: { firstName: string; lastName: string } | null;
  responseNote: string | null;
  respondedAt: string | null;
  linkedOrder: { orderNumber: string } | null;
  createdAt: string;
}

export const paddyRequestsApi = {
  list: (accessToken: string, warehouseId?: string) =>
    request<PaddyRequest[]>(`/paddy-requests${warehouseId ? `?warehouseId=${warehouseId}` : ''}`, { method: 'GET' }, accessToken),
  create: (accessToken: string, data: { warehouseId: string; paddyGradeId: string; requestedBagCount: number; requestedKg?: number; notes?: string }) =>
    request<PaddyRequest>('/paddy-requests', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  respond: (accessToken: string, id: string, decision: 'ACCEPTED' | 'DECLINED', responseNote?: string) =>
    request<PaddyRequest>(`/paddy-requests/${id}/respond`, { method: 'POST', body: JSON.stringify({ decision, responseNote }) }, accessToken),
  linkOrder: (accessToken: string, id: string, orderId: string) =>
    request<PaddyRequest>(`/paddy-requests/${id}/link-order`, { method: 'POST', body: JSON.stringify({ orderId }) }, accessToken),
  assignToFarm: (accessToken: string, id: string, data: { farmId: string; bagCount: number; kg?: number; note?: string }) =>
    request<{ task: { taskNumber: string }; request: PaddyRequest }>(`/paddy-requests/${id}/assign`, { method: 'POST', body: JSON.stringify(data) }, accessToken),
};

// ---------------------------------------------------------------------------
// The editable public homepage
// ---------------------------------------------------------------------------

/** Where an uploaded picture or video is served from. Public: no sign-in needed to view it. */
export const siteMediaUrl = (id: string) => `${API_URL}/site/media/${id}`;

export interface SiteContentResponse {
  content: SiteContent | null;
  version: number;
  updatedAt: string | null;
  updatedBy?: { firstName: string; lastName: string } | null;
}

export interface SiteMediaItem {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  inUse: boolean;
}

export const siteApi = {
  /** Public. A plain GET with no custom headers, so the browser never needs a pre-flight check first. */
  getContent: async (): Promise<SiteContentResponse> => {
    const res = await fetch(`${API_URL}/site/content`, { cache: 'no-store' });
    const body = (await res.json().catch(() => null)) as ApiEnvelope<SiteContentResponse> | null;
    if (!res.ok || !body || body.success === false) throw new ApiError(body?.message ?? 'Request failed.', body?.errorCode ?? null, res.status);
    return body.data;
  },
  getAdminContent: (accessToken: string) =>
    request<SiteContentResponse>('/site/admin/content', { method: 'GET', cache: 'no-store' }, accessToken),
  saveContent: (accessToken: string, content: SiteContent) =>
    request<SiteContentResponse>('/site/admin/content', { method: 'PUT', body: JSON.stringify(content) }, accessToken),
  resetContent: (accessToken: string) => request<SiteContentResponse>('/site/admin/content', { method: 'DELETE' }, accessToken),
  listMedia: (accessToken: string) => request<SiteMediaItem[]>('/site/admin/media', { method: 'GET', cache: 'no-store' }, accessToken),
  deleteMedia: (accessToken: string, id: string) => request<{ deleted: boolean }>(`/site/admin/media/${id}`, { method: 'DELETE' }, accessToken),
  /** Multipart, so it cannot go through request() (which always sends JSON). */
  uploadMedia: async (accessToken: string, file: Blob, fileName: string): Promise<SiteMediaItem> => {
    const form = new FormData();
    form.append('file', file, fileName);
    const res = await fetch(`${API_URL}/site/admin/media`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form });
    const body = (await res.json().catch(() => null)) as ApiEnvelope<SiteMediaItem> | null;
    if (!res.ok || !body || body.success === false) throw new ApiError(body?.message ?? 'Upload failed.', body?.errorCode ?? null, res.status);
    return body.data;
  },
};

// ---------------------------------------------------------------------------
// The watchlist (MD and CEO)
// ---------------------------------------------------------------------------

export const insightsApi = {
  /** Where recent records look unusual against each place's own history, over the last `days` days (7 to 90). */
  watchlist: (accessToken: string, days = 30) =>
    request<Watchlist>(`/insights/watchlist?days=${days}`, { method: 'GET', cache: 'no-store' }, accessToken),
};

// ---------------------------------------------------------------------------
// The System Administrator's tools
// ---------------------------------------------------------------------------

export interface SettingItem {
  key: string;
  group: string;
  label: string;
  help: string;
  type: 'number' | 'roles';
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  default: number | string[];
  value: number | string[];
  isDefault: boolean;
}
export interface SettingGroupInfo { id: string; title: string; intro: string }
export interface SettingsRegistry { groups: SettingGroupInfo[]; items: SettingItem[] }

export const settingsRegistryApi = {
  list: (accessToken: string) => request<SettingsRegistry>('/settings/registry', { method: 'GET', cache: 'no-store' }, accessToken),
  update: (accessToken: string, values: Record<string, number | string[]>) =>
    request<SettingsRegistry>('/settings/registry', { method: 'PATCH', body: JSON.stringify({ values }) }, accessToken),
  reset: (accessToken: string, key: string) => request<SettingsRegistry>(`/settings/registry/${encodeURIComponent(key)}`, { method: 'DELETE' }, accessToken),
};

export interface SystemOverview {
  generatedAt: string;
  api: { version: string; commit: string | null; startedAt: string; features: string[]; databaseOk: boolean; databaseMs: number; schema?: { state: 'ok' | 'missing' | 'unknown'; missing: string[] } };
  people: { total: number | null; active: number | null; disabled: number | null; lockedNow: number | null; mustChangePassword: number | null; neverSignedIn: number | null; roles: { code: string; name: string; isSystemRole: boolean; members: number }[] | null };
  organization: { farms: number | null; warehouses: number | null; millingCenters: number | null; machines: number | null; customers: number | null };
  access: { roles: number | null; permissions: number | null };
  pending: { resetRequests: number | null };
  activity: { last24h: number | null; last7d: number | null; recent: { at: string; who: string; action: string; entity: string }[] | null };
  homepage: { saved: boolean; version: number; updatedAt: string | null; files: number | null };
  settings: { total: number | null; changedFromDefault: number | null };
}
export const systemApi = {
  overview: (accessToken: string) => request<SystemOverview>('/system/overview', { method: 'GET', cache: 'no-store' }, accessToken),
};

/** What the running server says about itself. A server older than this website has no `features` at all. */
export interface ApiInfo { status: string; version?: string; commit?: string | null; startedAt?: string; features?: string[] }
export const healthApi = {
  /** Public, and read even when the server reports itself degraded. */
  info: async (): Promise<ApiInfo> => {
    const res = await fetch(`${API_URL}/health`, { cache: 'no-store' });
    const body = (await res.json().catch(() => null)) as { data?: ApiInfo } | null;
    if (!body?.data) throw new ApiError('The server did not answer.', null, res.status);
    return body.data;
  },
};

export interface CatalogReport { id: string; title: string; description: string; group: string; dated: boolean; jurisdiction: string }
export const reportCatalogApi = {
  list: (accessToken: string) => request<CatalogReport[]>('/reports/catalog', { method: 'GET', cache: 'no-store' }, accessToken),
  /** Streams the file and saves it, the same way the other report downloads do. */
  download: async (accessToken: string, id: string, params: { format: 'csv' | 'xlsx' | 'pdf'; from?: string; to?: string }) => {
    const qs = new URLSearchParams({ format: params.format });
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    const res = await fetch(`${API_URL}/reports/catalog/${encodeURIComponent(id)}/download?${qs.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string; errorCode?: string } | null;
      throw new ApiError(body?.message ?? 'Failed to download.', body?.errorCode ?? null, res.status);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id}-${new Date().toISOString().slice(0, 10)}.${params.format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};


// ----------------------------------------------------------------------------------------------------------------------------------------
// Paddy requests: passed up the chain (warehouse -> Warehouse Supervisor -> Farm Director; mill -> Operations Manager -> Warehouse Supervisor)
// ----------------------------------------------------------------------------------------------------------------------------------------
export type SupplyStage = 'WITH_REVIEWER' | 'WITH_SUPPLIER' | 'DISPATCHING' | 'ON_THE_WAY' | 'RECEIVED' | 'READY' | 'DECLINED' | 'CANCELLED';
export interface SupplyStepView { label: string; state: 'done' | 'current' | 'upcoming' | 'stopped'; who: string | null; at: string | null; detail: string | null }
export interface SupplyTransfer { id: string; transferNumber: string; status: string; label: string; driverName: string | null; vehiclePlate: string | null; bags: number; receivedBags: number | null; bagVariance: number | null; sentAt: string | null; arrivedAt: string | null }
export interface SupplyView {
  sourceWarehouse: { id: string; name: string } | null; transfer: SupplyTransfer | null; receivedBy: string | null; receivedAt: string | null;
  id: string; requestNumber: string; kind: 'WAREHOUSE' | 'MILL'; status: string; stage: SupplyStage; label: string; holder: string | null; since: string | null;
  warehouse: { id: string; name: string; location: string | null }; millingCenter: { id: string; name: string } | null;
  lines: { paddyGradeId: string; gradeLabel: string; bags: number }[]; totalBags: number; neededBy: string | null; notes: string | null;
  requestedBy: string; requestedById: string; requestedAt: string | null; forwardedBy: string | null; forwardedAt: string | null; forwardNote: string | null;
  decidedBy: string | null; decidedAt: string | null; decisionNote: string | null;
  sourceFarm: { id: string; name: string } | null;
  dispatch: { requestRef: string; stage: string; label: string; holder: string | null; driverName: string | null; vehiclePlate: string | null; bagVariance: number | null; arrivedAt: string | null } | null;
  parentNumber: string | null; childNumber: string | null; childLabel: string | null; childStage: SupplyStage | null; steps: SupplyStepView[];
}
export interface SupplySizeCheck { paddyGradeId: string; label: string; needed: number; has: number; enough: boolean }
export type SupplySources =
  | { kind: 'WAREHOUSE'; farms: { farmId: string; farmName: string; managers: string[]; bySize: SupplySizeCheck[]; canCover: boolean; totalHas: number }[]; warehouses: { warehouseId: string; warehouseName: string; supervisors: string[]; bySize: SupplySizeCheck[]; canCover: boolean; totalHas: number }[] }
  | { kind: 'MILL'; warehouse: { id: string; name: string }; bySize: SupplySizeCheck[]; canCover: boolean };
export interface Whereabouts {
  sizes: { id: string; label: string }[];
  places: { type: 'FARM' | 'ROAD' | 'WAREHOUSE' | 'MILL'; id: string; name: string; location: string | null; detail: string | null; bags: Record<string, number>; total: number }[];
  totals: Record<string, number>;
}
export interface SupplyRequestInput { warehouseId?: string; millingCenterId?: string; lines: { paddyGradeId: string; bagCount: number }[]; neededBy?: string; notes?: string }
export const supplyApi = {
  board: (accessToken: string) => request<SupplyView[]>('/supply-requests', { method: 'GET' }, accessToken),
  create: (accessToken: string, data: SupplyRequestInput) => request<SupplyView>('/supply-requests', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  sources: (accessToken: string, id: string) => request<SupplySources>(`/supply-requests/${id}/sources`, { method: 'GET' }, accessToken),
  forward: (accessToken: string, id: string, note?: string) => request<SupplyView>(`/supply-requests/${id}/forward`, { method: 'POST', body: JSON.stringify({ note }) }, accessToken),
  decline: (accessToken: string, id: string, reason: string) => request<SupplyView>(`/supply-requests/${id}/decline`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
  assign: (accessToken: string, id: string, data: { sourceFarmId?: string; sourceWarehouseId?: string; note?: string }) => request<SupplyView>(`/supply-requests/${id}/assign`, { method: 'POST', body: JSON.stringify(data) }, accessToken),
  ready: (accessToken: string, id: string, note?: string) => request<SupplyView>(`/supply-requests/${id}/ready`, { method: 'POST', body: JSON.stringify({ note }) }, accessToken),
  askFarmDirector: (accessToken: string, id: string, note?: string) => request<SupplyView>(`/supply-requests/${id}/ask-farm-director`, { method: 'POST', body: JSON.stringify({ note }) }, accessToken),
  cancel: (accessToken: string, id: string) => request<SupplyView>(`/supply-requests/${id}/cancel`, { method: 'POST' }, accessToken),
  received: (accessToken: string, id: string, note?: string) => request<SupplyView>(`/supply-requests/${id}/received`, { method: 'POST', body: JSON.stringify({ note }) }, accessToken),
  whereabouts: (accessToken: string) => request<Whereabouts>('/supply-requests/whereabouts', { method: 'GET' }, accessToken),
};

export interface PaddyTransferLine { paddyGradeId: string; gradeLabel: string; bags: number }
export interface PaddyTransferView {
  id: string; transferNumber: string; status: 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED'; label: string; direction: 'IN' | 'OUT' | 'BOTH';
  from: { id: string; name: string }; to: { id: string; name: string }; lines: PaddyTransferLine[]; totalBags: number;
  driverName: string | null; vehiclePlate: string | null; notes: string | null; sentBy: string; sentAt: string | null;
  receivedBy: string | null; receivedAt: string | null; receivedLines: PaddyTransferLine[] | null; varianceBags: number | null; receiveNote: string | null; cancelReason: string | null;
  supplyRequestNumber: string | null;
}
export interface PaddyTransferPlaces {
  mine: { id: string; name: string; location: string | null; stock: { paddyGradeId: string; label: string; bags: number }[] }[];
  others: { id: string; name: string; location: string | null }[];
}
export interface SendPaddyInput { fromWarehouseId: string; toWarehouseId: string; lines: { paddyGradeId: string; bags: number }[]; driverName?: string; vehiclePlate?: string; notes?: string; supplyRequestNumber?: string }
export const paddyTransfersApi = {
  list: (accessToken: string) => request<PaddyTransferView[]>('/paddy-transfers', { method: 'GET' }, accessToken),
  places: (accessToken: string) => request<PaddyTransferPlaces>('/paddy-transfers/places', { method: 'GET' }, accessToken),
  send: (accessToken: string, data: SendPaddyInput) => request<PaddyTransferView>('/paddy-transfers', { method: 'POST', body: JSON.stringify(data) }, accessToken),
  receive: (accessToken: string, id: string, data: { lines: { paddyGradeId: string; bags: number }[]; notes?: string }) => request<PaddyTransferView>(`/paddy-transfers/${id}/receive`, { method: 'POST', body: JSON.stringify(data) }, accessToken),
  cancel: (accessToken: string, id: string, reason?: string) => request<PaddyTransferView>(`/paddy-transfers/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken),
};
