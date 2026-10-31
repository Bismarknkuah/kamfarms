import sys
from lib import *

def run():
    reset()
    with sync_playwright() as p:
        b = p.chromium.launch()
        blocks = [('fsup', 'farm-analytics'), ('sup', 'warehouse-analytics'), ('ops', 'ops-analytics'), ('md', 'exec-analytics')]
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
            if key != 'md': check(f'{key}: overview header shows', page.locator('[data-testid=overview-header]').count() >= 1)
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
