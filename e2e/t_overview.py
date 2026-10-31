import sys
from lib import *

def run():
    reset()
    with sync_playwright() as p:
        b = p.chromium.launch()
        blocks = [('fsup', 'farm-analytics'), ('sup', 'warehouse-analytics'), ('ops', 'ops-analytics'), ('md', 'exec-analytics'), ('sales1', 'sales-analytics'), ('fd', 'finance-analytics'), ('admin', 'system-analytics'), ('fm', 'farm-analytics'), ('wm1', 'warehouse-analytics'), ('oo', 'ops-analytics')]
        for key, bid in blocks:
            ctx, page = as_user(b, key)
            page.goto(BASE + '/dashboard')
            try:
                page.wait_for_selector(f'[data-testid={bid}]', timeout=15000)
                page.wait_for_selector(f'[data-testid={bid}] [data-testid=kpi]', timeout=15000)
            except Exception as e:
                check(f'{key}: {bid} renders KPIs', False, str(e)[:120])
                ctx.close(); continue
            blk = page.locator(f'[data-testid={bid}]')
            check(f'{key}: starts with the greeting', page.locator('[data-testid=overview-greeting]').count() == 1 and 'Good' in page.locator('[data-testid=overview-greeting]').inner_text())
            ov = page.locator('[data-testid=overview]')
            check(f'{key}: nothing to click except the analytics controls (no links)', ov.locator('a').count() == 0, ov.locator('a').count())
            txt = ov.inner_text()
            check(f'{key}: no control center, run-your-area, quick access or task strips', not any(x in txt for x in ['Control center', 'Run your area', 'Quick access', 'Needs your attention', 'Your activity this month', 'Tap to review']))
            check(f'{key}: the greeting comes first, the analytics straight after', ov.locator('> *').first.get_attribute('data-testid') == 'overview-greeting-card')
            check(f'{key}: {bid} has KPIs', blk.locator('[data-testid=kpi]').count() >= 3)
            check(f'{key}: {bid} has a chart', blk.locator('svg.recharts-surface').count() >= 1 or blk.locator('[data-testid=place-bar]').count() >= 1)
            for d in (7, 90, 30):
                blk.locator(f'[data-testid={bid}-range-{d}]').click(); page.wait_for_timeout(500)
            check(f'{key}: range toggle keeps it rendered', blk.locator('[data-testid=kpi]').count() >= 3 and blk.locator(f'[data-testid={bid}-error]').count() == 0)
            check(f'{key}: no page errors', not page.errors, page.errors)
            ctx.close()

        # isolation: a Farm Director scoped to one farm sees only that farm
        ctx, page = as_user(b, 'fsup2')
        page.goto(BASE + '/dashboard')
        page.wait_for_selector('[data-testid=farm-analytics] [data-testid=kpi]')
        txt = page.locator('[data-testid=farm-analytics]').inner_text()
        check('scoped Farm Director sees own farm', 'Nkawkaw Farm' in txt)
        check('scoped Farm Director does not see the other farm', 'Sefwi Farm' not in txt)
        ctx.close()

        # reports: each role gets only the reports of its own area
        def report_titles(key):
            ctx, page = as_user(b, key); page.goto(BASE + '/reports'); page.wait_for_selector('h1:has-text("Reports")'); page.wait_for_timeout(1200)
            t = page.locator('main').inner_text(); ctx.close(); return t
        t = report_titles('fsup')
        check('Farm Supervisor sees the farm intake report', 'Farm intake report' in t)
        check('Farm Supervisor sees no warehouse, finance or milling reports', not any(x in t for x in ['Warehouse report', 'Finance report', 'Milling runs', 'Machine power', 'Audit log']), t[:300])
        t = report_titles('sup')
        check('Warehouse Supervisor sees the warehouse report and no farm intake report', 'Warehouse report' in t and 'Farm intake report' not in t and 'Paddy intake' not in t, t[:300])
        t = report_titles('ops')
        check('Operations Manager sees milling reports and no farm, warehouse or finance report', 'Milling runs' in t and not any(x in t for x in ['Farm intake report', 'Warehouse report', 'Finance report']), t[:300])
        t = report_titles('fd')
        check('Finance Director sees the finance report and no milling run report', 'Finance report' in t and 'Milling runs' not in t, t[:300])
        check('the server refuses a Farm Supervisor the warehouse analytics', http('/api/overview/analytics/warehouses', 'GET', 'tok-fsup')[0] == 403)
        check('the server refuses a Sales Officer the finance analytics', http('/api/overview/analytics/finance', 'GET', 'tok-sales1')[0] == 403)

        # notifications: every role can delete; each only their own
        for key in ('fsup', 'sup', 'ops', 'md', 'fm'):
            reset()
            ctx, page = as_user(b, key)
            page.goto(BASE + '/notifications'); page.wait_for_selector('[data-testid=notif-row]')
            n0 = page.locator('[data-testid=notif-row]').count()
            check(f'{key}: sees 4 notifications', n0 == 4, n0)
            page.locator('[data-testid=notif-delete]').first.click(); page.wait_for_timeout(600)
            check(f'{key}: delete one row', page.locator('[data-testid=notif-row]').count() == 3)
            page.click('[data-testid=notif-clear-older]')
            check(f'{key}: older asks to confirm', page.locator('[data-testid=notif-confirm]').is_visible())
            page.click('[data-testid=notif-confirm-yes]'); page.wait_for_timeout(600)
            left = page.locator('[data-testid=notif-row]').count()
            check(f'{key}: older than 30 days removed', left < 3, left)
            page.click('[data-testid=notif-clear-all]'); page.click('[data-testid=notif-confirm-yes]'); page.wait_for_timeout(600)
            check(f'{key}: clear all empties list', page.locator('[data-testid=notif-row]').count() == 0)
            others = [n for n in http('/__notifs')[1] if n['userId'] != f'u-{key}']
            check(f'{key}: other users untouched', len(others) == 16, len(others))
            check(f'{key}: no page errors (notifications)', not page.errors, page.errors)
            ctx.close()
        b.close()
    return finish()

if __name__ == '__main__': sys.exit(run())
