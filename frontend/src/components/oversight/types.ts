import type { farmsApi } from '@/lib/api-client';

export type FarmInventory = Awaited<ReturnType<typeof farmsApi.getInventory>>;
