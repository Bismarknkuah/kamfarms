'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import {
  findSingleLocationScope,
  hasFinancialVisibility,
} from '@/lib/nav-items';
import {
  reportsApi,
  ExecutiveSummary,
  ApiError,
  tasksApi,
  notificationsApi,
  paddyEntriesApi,
  deliveryReportsApi,
  salesOrdersApi,
  paymentsApi,
  shipmentsApi,
  productionApi,
  usersApi,
  farmsApi,
} from '@/lib/api-client';

type StatTone = 'default' | 'paddy' | 'husk' | 'soil';

const STAT_TONE_STYLES: Record<StatTone, string> = {
  default:
    'border border-paddy-100 bg-white text-paddy-900 [&.stat-label]:text-ink-500 [&.stat-unit]:text-ink-500',
  paddy:
    'bg-paddy-900 text-rice-50 [&.stat-label]:text-paddy-300 [&.stat-unit]:text-paddy-300',
  husk:
    'bg-husk-500 text-white [&.stat-label]:text-husk-100 [&.stat-unit]:text-husk-100',
  soil:
    'bg-soil-700 text-rice-50 [&.stat-label]:text-husk-100 [&.stat-unit]:text-husk-100',
};

function StatCard({
  label,
  value,
  unit,
  tone = 'default',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: StatTone;
}) {
  return (
    <div className={`rounded-2xl p-5 ${STAT_TONE_STYLES[tone]}`}>
      <p className="stat-label text-xs font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl">
        {value}
        {unit && (
          <span className="stat-unit ml-1 text-sm font-sans">{unit}</span>
        )}
      </p>
    </div>
  );
}

function fmtKg(kg: number) {
  return kg.toLocaleString('en-US', {
    maximumFractionDigits: 0,
  });
}

function fmtGHS(amount: number) {
  return `GHS ${amount.toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })}`;
}

interface AttentionItem {
  label: string;
  count: number;
  href: string;
}

interface PersonalStat {
  label: string;
  value: string;
  unit?: string;
}

/**
 * Returns true when a date falls within the current calendar month.
 */
function isThisMonth(isoDate: string): boolean {
  const d = new Date(isoDate);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth()
  );
}

export default function DashboardPage() {
  const {
    me,
    accessToken,
    loading,
    error,
    hasPermission,
  } = useCurrentUser();

  const [summary, setSummary] =
    useState<ExecutiveSummary | null>(null);
  const [summaryError, setSummaryError] =
    useState<string | null>(null);
  const [attention, setAttention] =
    useState<AttentionItem[]>([]);
  const [personalStats, setPersonalStats] =
    useState<PersonalStat[]>([]);
  const [myFarmInventory, setMyFarmInventory] =
    useState<{
      totalKg: number;
      totalBags: number;
      byGrade: {
        gradeCode: string;
        gradeLabel: string;
        totalKg: number;
      }[];
    } | null>(null);

  useEffect(() => {
    if (!accessToken || !me) {
      return;
    }

    /*
     * Load company-wide executive figures only when appropriate.
     */
    if (
      hasFinancialVisibility(me) ||
      !findSingleLocationScope(me, 'FARM')
    ) {
      reportsApi
        .executiveSummary(accessToken)
        .then(setSummary)
        .catch((err: unknown) => {
          setSummaryError(
            err instanceof ApiError
              ? err.message
              : 'Failed to load KPIs.',
          );
        });
    }

    /*
     * Needs your attention.
     */
    const items: Promise<AttentionItem | null>[] = [
      tasksApi
        .listMine(accessToken)
        .then((tasks) => {
          const open = tasks.filter(
            (task) =>
              ![
                'COMPLETED',
                'CANCELLED',
                'REJECTED',
              ].includes(task.status),
          );

          return open.length > 0
            ? {
                label: 'Tasks assigned to you',
                count: open.length,
                href: '/tasks',
              }
            : null;
        })
        .catch(() => null),

      notificationsApi
        .unreadCount(accessToken)
        .then((count) =>
          count > 0
            ? {
                label: 'Unread notifications',
                count,
                href: '/notifications',
              }
            : null,
        )
        .catch(() => null),
    ];

    /*
     * Paddy approvals.
     */
    if (hasPermission('paddy.approve')) {
      items.push(
        paddyEntriesApi
          .list(
            accessToken,
            undefined,
            'SUBMITTED',
          )
          .then((entries) =>
            entries.length > 0
              ? {
                  label:
                    'Paddy entries awaiting your approval',
                  count: entries.length,
                  href: '/paddy-entries',
                }
              : null,
          )
          .catch(() => null),
      );
    }

    /*
     * Delivery report approvals.
     */
    if (hasPermission('delivery.approve')) {
      items.push(
        deliveryReportsApi
          .list(
            accessToken,
            undefined,
            'SUPERVISOR_REVIEW',
          )
          .then((reports) =>
            reports.length > 0
              ? {
                  label:
                    'Delivery reports awaiting your approval',
                  count: reports.length,
                  href: '/deliveries',
                }
              : null,
          )
          .catch(() => null),
      );
    }

    /*
     * Long-running shipment / unreceived shipment alert.
     *
     * Shipments that departed more than three days ago and have
     * not yet been received are flagged for warehouse users.
     */
    if (hasPermission('warehouse.receive')) {
      items.push(
        shipmentsApi
          .list(accessToken)
          .then((shipments) => {
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(
              threeDaysAgo.getDate() - 3,
            );

            const overdue = shipments.filter(
              (shipment) =>
                !shipment.receivedAt &&
                new Date(shipment.departedAt) <
                  threeDaysAgo,
            );

            return overdue.length > 0
              ? {
                  label:
                    'Shipments overdue — departed 3+ days ago, still unreceived',
                  count: overdue.length,
                  href: '/shipments',
                }
              : null;
          })
          .catch(() => null),
      );
    }

    /*
     * Sales approvals.
     */
    if (hasPermission('sales.approve')) {
      items.push(
        salesOrdersApi
          .list(accessToken, 'SUBMITTED')
          .then((orders) =>
            orders.length > 0
              ? {
                  label:
                    'Sales orders awaiting your approval',
                  count: orders.length,
                  href: '/sales',
                }
              : null,
          )
          .catch(() => null),
      );
    }

    /*
     * Payment verification.
     */
    if (hasPermission('payment.verify')) {
      items.push(
        paymentsApi
          .list(
            accessToken,
            'PENDING_VERIFICATION',
          )
          .then((payments) =>
            payments.length > 0
              ? {
                  label:
                    'Payments awaiting verification',
                  count: payments.length,
                  href: '/finance',
                }
              : null,
          )
          .catch(() => null),
      );
    }

    Promise.all(items).then((results) => {
      setAttention(
        results.filter(
          (result): result is AttentionItem =>
            result !== null,
        ),
      );
    });

    /*
     * Personal activity.
     */
    const roleCodes = me.roles.map(
      (role) => role.code,
    );

    /*
     * Sales Officer statistics.
     */
    if (roleCodes.includes('SALES_OFFICER')) {
      salesOrdersApi
        .list(accessToken)
        .then((orders) => {
          const mine = orders.filter(
            (order) =>
              order.salesOfficer.id === me.id &&
              isThisMonth(order.createdAt),
          );

          const total = mine.reduce(
            (sum, order) =>
              sum + order.totalAmount,
            0,
          );

          setPersonalStats((prev) => [
            ...prev,
            {
              label: 'Your sales this month',
              value: `GHS ${total.toLocaleString(
                'en-US',
                {
                  maximumFractionDigits: 2,
                },
              )}`,
            },
            {
              label:
                'Orders you created this month',
              value: String(mine.length),
            },
          ]);
        })
        .catch(() => {});
    }

    /*
     * Farm Manager inventory.
     */
    const farmId = findSingleLocationScope(
      me,
      'FARM',
    );

    if (farmId) {
      farmsApi
        .getInventory(accessToken, farmId)
        .then(setMyFarmInventory)
        .catch(() => {});
    }

    /*
     * Farm Manager statistics.
     */
    if (roleCodes.includes('FARM_MANAGER')) {
      paddyEntriesApi
        .list(accessToken)
        .then((entries) => {
          const pending = entries.filter(
            (entry) =>
              entry.status === 'SUBMITTED',
          ).length;

          setPersonalStats((prev) => [
            ...prev,
            {
              label:
                'Entries awaiting your Farm Supervisor’s approval',
              value: String(pending),
            },
          ]);
        })
        .catch(() => {});
    }

    /*
     * Finance Officer statistics.
     */
    if (roleCodes.includes('FINANCE_OFFICER')) {
      paymentsApi
        .list(accessToken)
        .then((payments) => {
          const mine = payments.filter(
            (payment) =>
              payment.recordedBy.id === me.id &&
              isThisMonth(payment.paymentDate),
          );

          const total = mine.reduce(
            (sum, payment) =>
              sum + payment.amount,
            0,
          );

          setPersonalStats((prev) => [
            ...prev,
            {
              label:
                'Payments you recorded this month',
              value: `GHS ${total.toLocaleString(
                'en-US',
                {
                  maximumFractionDigits: 2,
                },
              )}`,
            },
          ]);
        })
        .catch(() => {});
    }

    /*
     * Warehouse Manager statistics.
     */
    if (
      roleCodes.includes('WAREHOUSE_MANAGER')
    ) {
      shipmentsApi
        .list(accessToken)
        .then((shipments) => {
          const mine = shipments.filter(
            (shipment) =>
              shipment.receivedBy?.id === me.id &&
              shipment.receivedAt &&
              isThisMonth(
                shipment.receivedAt,
              ),
          );

          const totalKg = mine.reduce(
            (sum, shipment) =>
              sum +
              (shipment.receivedKg ?? 0),
            0,
          );

          const inTransit = shipments.filter(
            (shipment) =>
              !shipment.receivedAt,
          ).length;

          setPersonalStats((prev) => [
            ...prev,
            {
              label:
                'Shipments you received this month',
              value: String(mine.length),
            },
            {
              label:
                'KG received this month',
              value:
                totalKg.toLocaleString(
                  'en-US',
                  {
                    maximumFractionDigits: 0,
                  },
                ),
              unit: 'KG',
            },
            {
              label:
                'Shipments currently in transit',
              value: String(inTransit),
            },
          ]);
        })
        .catch(() => {});
    }

    /*
     * Operations Officer statistics.
     */
    if (
      roleCodes.includes('OPERATIONS_OFFICER')
    ) {
      productionApi
        .list(accessToken)
        .then((records) => {
          const mine = records.filter(
            (record) =>
              record.operator.id === me.id &&
              isThisMonth(record.date),
          );

          const totalRecoveredKg =
            mine.reduce(
              (sum, record) =>
                sum + record.recoveredRiceKg,
              0,
            );

          setPersonalStats((prev) => [
            ...prev,
            {
              label:
                'Production records logged this month',
              value: String(mine.length),
            },
            {
              label:
                'Rice recovered this month',
              value:
                totalRecoveredKg.toLocaleString(
                  'en-US',
                  {
                    maximumFractionDigits: 0,
                  },
                ),
              unit: 'KG',
            },
          ]);
        })
        .catch(() => {});
    }

    /*
     * Line-manager roles.
     */
    if (
      roleCodes.some((role) =>
        [
          'FARM_DIRECTOR',
          'WAREHOUSE_SUPERVISOR',
          'OPERATIONS_MANAGER',
        ].includes(role),
      )
    ) {
      usersApi
        .list(accessToken)
        .then((res) => {
          setPersonalStats((prev) => [
            ...prev,
            {
              label: 'People on your team',
              value: String(
                res.items.length,
              ),
            },
          ]);
        })
        .catch(() => {});
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, me]);

  if (loading) {
    return (
      <DashboardShell>
        <p className="text-sm text-ink-500">
          Loading your dashboard…
        </p>
      </DashboardShell>
    );
  }

  if (error || !me) {
    return (
      <DashboardShell>
        <p className="text-sm text-red-600">
          {error ??
            'Unable to load your session.'}
        </p>
      </DashboardShell>
    );
  }

  const myFarmId = findSingleLocationScope(
    me,
    'FARM',
  );

  return (
    <DashboardShell>
      <div className="mb-8">
        <h1 className="font-display text-2xl text-paddy-900">
          Welcome, {me.firstName}{' '}
          {me.lastName}
        </h1>
        <p className="text-sm text-ink-500">
          {me.roles
            .map((role) => role.code)
            .join(', ')}
        </p>
      </div>

      {attention.length > 0 && (
        <div className="mb-8 overflow-hidden rounded-2xl bg-paddy-900">
          {attention.map((item, index) => (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center justify-between px-6 py-4 transition hover:bg-paddy-700 ${
                index > 0
                  ? 'border-t border-paddy-700'
                  : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-husk-500 text-sm font-medium text-white">
                  {item.count}
                </span>

                <span className="text-sm font-medium text-rice-50">
                  {item.label}
                </span>
              </div>

              <span className="text-xs font-medium text-husk-300">
                Review &rarr;
              </span>
            </Link>
          ))}
        </div>
      )}

      {personalStats.length > 0 && (
        <div className="mb-8">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">
            Your activity this month
          </p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {personalStats.map((stat) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                unit={stat.unit}
                tone="husk"
              />
            ))}
          </div>
        </div>
      )}

      {myFarmId ? (
        myFarmInventory && (
          <div className="mb-8">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">
              Your farm&rsquo;s inventory
            </p>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard
                label="Total paddy on your farm"
                value={fmtKg(
                  myFarmInventory.totalKg,
                )}
                unit="KG"
                tone="paddy"
              />

              <StatCard
                label="Total bags"
                value={String(
                  myFarmInventory.totalBags,
                )}
              />

              {myFarmInventory.byGrade.map(
                (grade) => (
                  <StatCard
                    key={grade.gradeCode}
                    label={grade.gradeLabel}
                    value={fmtKg(
                      grade.totalKg,
                    )}
                    unit="KG"
                  />
                ),
              )}
            </div>
          </div>
        )
      ) : (
        <div className="mb-8">
          {summaryError ? (
            <p className="text-sm text-red-600">
              {summaryError}
            </p>
          ) : !summary ? (
            <p className="text-sm text-ink-500">
              Loading live figures…
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              <StatCard
                label="Paddy on farms"
                value={fmtKg(
                  summary.totalPaddyAvailableKg,
                )}
                unit="KG"
              />

              <StatCard
                label="Paddy in transit"
                value={fmtKg(
                  summary.paddyInTransitKg,
                )}
                unit="KG"
              />

              <StatCard
                label="Paddy in warehouses"
                value={fmtKg(
                  summary.paddyInWarehousesKg,
                )}
                unit="KG"
              />

              <StatCard
                label="Bulk rice at milling"
                value={fmtKg(
                  summary.bulkRiceAtMillingKg,
                )}
                unit="KG"
              />

              <StatCard
                label="Packaged rice available"
                value={fmtKg(
                  summary.packagedRiceAvailableKg,
                )}
                unit="KG"
                tone="paddy"
              />

              {hasFinancialVisibility(me) && (
                <>
                  <StatCard
                    label="Sales today"
                    value={fmtGHS(
                      summary.salesTodayAmount,
                    )}
                    tone="husk"
                  />

                  <StatCard
                    label="Sales this month"
                    value={fmtGHS(
                      summary.salesThisMonthAmount,
                    )}
                    tone="husk"
                  />

                  <StatCard
                    label="Outstanding receivables"
                    value={fmtGHS(
                      summary.outstandingReceivables,
                    )}
                    tone="soil"
                  />

                  <StatCard
                    label="Expenses this month"
                    value={fmtGHS(
                      summary.expensesThisMonth,
                    )}
                    tone="soil"
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}