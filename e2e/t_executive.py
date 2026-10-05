import os, re, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

def txt(l): return l.inner_text()
pages = []
def U(b, key, **kw):
    ctx, p = as_user(b, key, **kw); pages.append(p); return ctx, p
def dash(b, key, **kw):
    ctx, p = U(b, key, **kw); p.goto(BASE + '/dashboard'); p.get_by_test_id('exec-dashboard').wait_for(); p.get_by_test_id('kpi-sales-value').wait_for(); p.get_by_test_id('place-card').first.wait_for(); p.wait_for_timeout(400); return ctx, p
def val(p, tid): return float(p.get_by_test_id(tid).get_attribute('data-value'))
def places(p, kind):
    card = p.locator(f'[data-testid=place-card][data-kind={kind}]'); return {r.get_attribute('data-name'): float(r.get_attribute('data-amount')) for r in card.get_by_test_id('place-row').all()}
def hrefs(p): return set(p.eval_on_selector_all('a[href]', 'els => els.map(e => e.getAttribute("href"))'))
def ledger(b, key, query='', **kw):
    ctx, p = U(b, key, **kw); p.goto(BASE + '/money' + query); p.get_by_test_id('ledger-total-in').wait_for(); p.wait_for_timeout(500); return ctx, p
def pick(p, tid, value): p.get_by_test_id(tid).select_option(value); p.wait_for_timeout(700)
def rows(p): return sorted(r.get_attribute('data-number') for r in p.get_by_test_id('ledger-row').all())

with sync_playwright() as pw:
    b = pw.chromium.launch(); reset()

    # =============== 1. Who gets the new control center ===============
    for key, mode, first in [('fd', 'FINANCE', 'Kwesi'), ('md', 'EXECUTIVE', 'Kwame'), ('ceo', 'EXECUTIVE', 'Ama')]:
        ctx, p = dash(b, key)
        check(f'{key}: the Finance Director, MD and CEO each get the new control center ({mode})', p.get_by_test_id('exec-dashboard').get_attribute('data-mode') == mode)
        check(f'{key}: it greets them by name', first in txt(p.get_by_test_id('exec-greeting')) and re.match(r'Good (morning|afternoon|evening)', txt(p.get_by_test_id('exec-greeting'))), txt(p.get_by_test_id('exec-greeting')))
        check(f'{key}: it carries the "Control center" heading style of the Administrator\'s, and the work waiting for them', p.locator('p', has_text='Control center').count() >= 1 and p.get_by_test_id('control-center').count() == 1 and p.get_by_test_id('cc-tile').count() >= 3); ctx.close()
    for key in ['sup', 'wm1', 'sales1', 'ops', 'fsup']:
        ctx, p = U(b, key); p.goto(BASE + '/dashboard'); p.wait_for_timeout(2200)
        check(f'{key}: other roles do not get it', p.get_by_test_id('exec-dashboard').count() == 0); ctx.close()
    ctx, p = U(b, 'admin'); p.goto(BASE + '/dashboard'); p.get_by_test_id('admin-control-center').wait_for()
    check('the Administrator keeps their own control center', p.get_by_test_id('exec-dashboard').count() == 0); ctx.close()

    # =============== 2. The money band (this month) ===============
    ctx, p = dash(b, 'fd')
    check('sales booked: the two approved orders of the month, not the submitted or rejected ones', val(p, 'kpi-sales-value') == 16000 and '2 approved orders' in txt(p.get_by_test_id('kpi-sales')), txt(p.get_by_test_id('kpi-sales')))
    check('money collected: the verified payments only', val(p, 'kpi-collected-value') == 8000 and '2 verified payments' in txt(p.get_by_test_id('kpi-collected')))
    check('money spent: the approved expenses only', val(p, 'kpi-spent-value') == 11450 and '7 approved expenses' in txt(p.get_by_test_id('kpi-spent')))
    check('net cash: collected less spent, and a loss is shown with its minus sign', val(p, 'kpi-net-value') == -3450 and txt(p.get_by_test_id('kpi-net-value')).startswith('-GHS 3,450'), txt(p.get_by_test_id('kpi-net-value')))
    check('each figure says how it compares with last month', p.get_by_test_id('kpi-sales-change').get_attribute('data-dir') == 'up' and 'vs last month' in txt(p.get_by_test_id('kpi-sales-change')) and p.get_by_test_id('kpi-net-change').get_attribute('data-dir') == 'down')
    check('spending that went UP is not shown as good news (amber, not green)', 'text-husk-300' in p.get_by_test_id('kpi-spent-change').get_attribute('class') and 'text-emerald-300' in p.get_by_test_id('kpi-collected-change').get_attribute('class'))

    # =============== 3. Where the money is spent: every farm, warehouse and milling center ===============
    check('four places are shown: farms, warehouses, milling centers and the head office', sorted(c.get_attribute('data-kind') for c in p.get_by_test_id('place-card').all()) == ['farms', 'head-office', 'milling-centers', 'warehouses'])
    check('every farm with what it spent', places(p, 'farms') == {'Nkawkaw Farm': 1500, 'Techiman Farm': 700}, places(p, 'farms'))
    check('every warehouse, including one that spent nothing; an expense naming a farm AND a warehouse is counted once, at the warehouse', places(p, 'warehouses') == {'Tamale Warehouse': 2250, 'Kumasi Warehouse': 0}, places(p, 'warehouses'))
    check('every milling center, including one that spent nothing', places(p, 'milling-centers') == {'Tamale Mill': 3000, 'Kumasi Mill': 0}, places(p, 'milling-centers'))
    tot = {c.get_attribute('data-kind'): float(c.get_by_test_id('place-total').get_attribute('data-value')) for c in p.get_by_test_id('place-card').all()}
    check('the four totals add up to exactly what was spent: nothing counted twice, nothing lost', tot == {'farms': 2200, 'warehouses': 2250, 'milling-centers': 3000, 'head-office': 4000} and sum(tot.values()) == 11450, tot)
    mill = p.locator('[data-testid=place-card][data-kind=milling-centers]')
    check('spending still waiting for approval at a place is shown on that place', 'GHS 900 waiting for approval' in txt(mill.locator('[data-testid=place-row][data-name="Kumasi Mill"]')))
    check('each place says its share of the spending', '26% of spending' in txt(mill) and '35% of spending' in txt(p.locator('[data-testid=place-card][data-kind=head-office]')), txt(mill)[:120])
    mill.locator('[data-testid=place-row][data-name="Tamale Mill"]').click(); p.get_by_test_id('ledger-total-in').wait_for(); p.wait_for_timeout(700)
    check('clicking a place opens the ledger already limited to that place: its own expenses, nothing else', '/money?place=mill:' in p.url and rows(p) == ['EXP-e12', 'EXP-e5'] and p.get_by_test_id('ledger-place-note').count() == 1, (p.url, rows(p)))
    ctx.close()

    # =============== 4. Choosing the period ===============
    ctx, p = dash(b, 'fd')
    check('this month is the starting period', p.get_by_test_id('period-month').get_attribute('aria-pressed') == 'true')
    p.get_by_test_id('period-all').click(); p.wait_for_timeout(900)
    check('All time adds up everything ever spent, and has nothing to compare with', val(p, 'kpi-spent-value') == 18450 and p.get_by_test_id('kpi-spent-change').count() == 0 and p.get_by_test_id('period-all').get_attribute('aria-pressed') == 'true', val(p, 'kpi-spent-value'))
    check('...and the places follow the period (the farm that spent 5,000 in April now shows it)', places(p, 'farms')['Nkawkaw Farm'] == 1500 + 800 + 5000, places(p, 'farms'))
    p.get_by_test_id('period-quarter').click(); p.wait_for_timeout(900)
    check('This quarter works, and compares with the quarter before', val(p, 'kpi-spent-value') == 11450 and 'vs last quarter' in txt(p.get_by_test_id('kpi-spent-change')))
    p.get_by_test_id('period-month').click(); p.wait_for_timeout(900)
    check('going back to this month restores this month\'s figures', val(p, 'kpi-spent-value') == 11450 and p.get_by_test_id('period-month').get_attribute('aria-pressed') == 'true')
    check('it says when the figures were last updated, and can be refreshed', 'Updated' in txt(p.get_by_test_id('exec-updated')) and p.get_by_test_id('exec-refresh').is_enabled()); ctx.close()

    # =============== 5. Everything else on the page ===============
    ctx, p = dash(b, 'fd')
    t = {x.get_attribute('data-key'): txt(x.get_by_test_id('money-tile-value')) for x in p.get_by_test_id('money-tile').all()}
    check('owed to us, payments to verify, and expenses to approve are shown with their amounts', t.get('receivables') == 'GHS 8,000' and t.get('pending-payments') == 'GHS 1,500' and t.get('pending-expenses') == 'GHS 1,000', t)
    check('who owes the company: invoices less VERIFIED payments only, with what is overdue', [(r.get_attribute('data-name'), float(r.get_attribute('data-amount'))) for r in p.get_by_test_id('debtor-row').all()] == [('Adom Foods', 7000), ('Boateng Stores', 1000)] and 'GHS 5,000 overdue' in txt(p.get_by_test_id('exec-debtors')))
    check('the sales record: the approved orders of the month, newest first, with customer, officer and stage', [r.get_attribute('data-amount') for r in p.get_by_test_id('sales-row').all()] == ['6000', '10000'] and 'Boateng Stores' in txt(p.get_by_test_id('sales-row').first) and 'Nana Yeboah' in txt(p.get_by_test_id('sales-row').first) and 'Fulfilled' in txt(p.get_by_test_id('sales-row').first))
    check('what the money is spent on, biggest first', [r.get_attribute('data-name') for r in p.get_by_test_id('category-row').all()] == ['Salaries', 'Electricity', 'Transport', 'Labour', 'Fuel'])
    check('the six-month chart is drawn', p.get_by_test_id('trend-chart').locator('svg').count() >= 1 and 'Sales booked' in txt(p.get_by_test_id('exec-trend')))
    led = p.get_by_test_id('ledger-row')
    check('the latest money in and out, with what is waiting for a decision marked', led.count() == 12 and p.locator('[data-testid=ledger-row][data-number=PAY-p4][data-state=waiting]').count() == 1 and p.locator('[data-testid=ledger-row][data-number=EXP-e8][data-state=waiting]').count() == 1)
    check('a refused payment is not part of the money story', p.locator('[data-testid=ledger-row][data-number=PAY-p5]').count() == 0)
    check('the Finance Director\'s own desk is on the page, to decide without leaving it', 'Decide here' in txt(p.get_by_test_id('exec-desk')) and p.get_by_test_id('exec-operations').count() == 0)
    h = hrefs(p); check('and the places he goes to, including the money ledger', all(x in h for x in ['/finance', '/money', '/expenses', '/sales', '/reports']) and p.get_by_test_id('manage-link').count() >= 5); ctx.close()
    for key in ['md', 'ceo']:
        ctx, p = dash(b, key)
        check(f'{key}: the same money, company-wide', val(p, 'kpi-spent-value') == 11450 and val(p, 'kpi-sales-value') == 16000 and places(p, 'milling-centers') == {'Tamale Mill': 3000, 'Kumasi Mill': 0})
        check(f'{key}: plus the company on the ground, the watch-list, and the places they go to (Oversight)', p.get_by_test_id('exec-operations').count() == 1 and p.get_by_test_id('exec-watch').count() == 1 and '/oversight' in hrefs(p))
        check(f'{key}: orders waiting for release are decided here', 'Decide here' in txt(p.get_by_test_id('exec-desk'))); ctx.close()

    # =============== 6. The control center inside it, styled like the Administrator's ===============
    ctx, p = dash(b, 'fd'); st = txt(p.get_by_test_id('cc-status'))
    check('the control center says how much is waiting for them, in one line', re.search(r'\d+ waiting for you', st) is not None, st)
    check('each piece of work has an icon, and the shortcuts are cards with the dark icon squares', all(t.locator('svg').count() >= 1 for t in p.get_by_test_id('cc-tile').all()) and p.get_by_test_id('cc-control').first.locator('svg').count() == 1 and 'bg-paddy-900' in p.get_by_test_id('cc-control').first.locator('span').first.get_attribute('class')); ctx.close()
    ctx, p = U(b, 'sup'); p.goto(BASE + '/dashboard'); p.get_by_test_id('control-center').wait_for(); p.get_by_test_id('cc-tile').first.wait_for()
    check('the other roles\' control centers have the same look', p.get_by_test_id('cc-status').count() == 1 and p.get_by_test_id('cc-tile').first.locator('svg').count() >= 1); ctx.close()

    # =============== 7. The money ledger ===============
    ctx, p = ledger(b, 'fd')
    check('every payment and expense is listed, with the totals of what is confirmed', txt(p.get_by_test_id('ledger-total-in')) == 'GHS 10,500.00' and txt(p.get_by_test_id('ledger-total-out')) == 'GHS 18,450.00' and txt(p.get_by_test_id('ledger-total-net')) == '-GHS 7,950.00' and txt(p.get_by_test_id('ledger-total-count')) == '18', [txt(p.get_by_test_id(f'ledger-total-{k}')) for k in ('in', 'out', 'net', 'count')])
    check('what is waiting is shown apart from the totals', 'GHS 1,500.00 waiting' in txt(p.get_by_test_id('ledger-total-in').locator('xpath=..')) and 'GHS 1,000.00 waiting' in txt(p.get_by_test_id('ledger-total-out').locator('xpath=..')))
    pick(p, 'ledger-filter-kind', 'in'); check('money in only', p.get_by_test_id('ledger-row').count() == 5 and all(r.get_attribute('data-kind') == 'IN' for r in p.get_by_test_id('ledger-row').all()))
    pick(p, 'ledger-filter-kind', 'out'); check('money out only', p.get_by_test_id('ledger-row').count() == 13 and all(r.get_attribute('data-kind') == 'OUT' for r in p.get_by_test_id('ledger-row').all()))
    pick(p, 'ledger-filter-kind', ''); pick(p, 'ledger-filter-status', 'waiting'); check('only what is waiting for a decision', rows(p) == ['EXP-e8', 'EXP-e9', 'PAY-p4'], rows(p))
    pick(p, 'ledger-filter-status', ''); pick(p, 'ledger-filter-place', 'office'); check('a place filter shows spending only, and says why', rows(p) == ['EXP-e6'] and p.get_by_test_id('ledger-place-note').count() == 1)
    opts = p.get_by_test_id('ledger-filter-place').locator('option').all_inner_texts()
    check('the place list offers every farm, warehouse and milling center', all(n in opts for n in ['Nkawkaw Farm', 'Tamale Warehouse', 'Kumasi Mill', 'Head office']), opts)
    pick(p, 'ledger-filter-place', ''); p.get_by_test_id('ledger-q').fill('boateng'); p.wait_for_timeout(900); check('search finds by customer', rows(p) == ['PAY-p2'], rows(p))
    p.get_by_test_id('ledger-q').fill(''); p.get_by_test_id('ledger-from').fill('2026-10-14'); p.get_by_test_id('ledger-to').fill('2026-10-14'); p.wait_for_timeout(900); check('and by date, the last day included', rows(p) == ['PAY-p2', 'PAY-p4'], rows(p))
    p.get_by_test_id('ledger-q').fill('zzzzqq'); p.wait_for_timeout(900); check('nothing matching says so', p.get_by_test_id('ledger-empty').count() == 1); ctx.close()
    ctx, p = ledger(b, 'fd', '?kind=out&place=farm:11111111-1111-4111-8111-aaaaaaaaaaaa'); check('a link from the dashboard arrives with its filters already chosen', p.get_by_test_id('ledger-filter-kind').input_value() == 'out'); ctx.close()
    for key in ['md', 'ceo']:
        ctx, p = ledger(b, key); check(f'{key}: can open the whole ledger', txt(p.get_by_test_id('ledger-total-count')) == '18'); ctx.close()

    # =============== 8. Who may see the company's money ===============
    for key in ['fd', 'md', 'ceo']:
        ctx, p = U(b, key); p.goto(BASE + '/notifications'); p.get_by_test_id('top-bar').wait_for(); p.wait_for_timeout(300)
        check(f'{key}: the menu has the Money ledger', '/money' in hrefs(p)); ctx.close()
    for key in ['sales1', 'fm', 'wm1', 'sup', 'oo']:
        ctx, p = U(b, key); p.goto(BASE + '/notifications'); p.get_by_test_id('top-bar').wait_for(); p.wait_for_timeout(300)
        check(f'{key}: the menu does not', '/money' not in hrefs(p)); ctx.close()
    for key in ['sales1', 'wm1', 'sup', 'fsup', 'ops']:
        c1, b1 = http('/api/finance-center/overview', token=f'tok-{key}'); c2, b2 = http('/api/finance-center/ledger', token=f'tok-{key}')
        check(f'{key}: the server refuses them the company-wide money, even if they ask directly', c1 == 403 and c2 == 403, (c1, c2))
    check('the Finance Director, MD, CEO and Administrator are answered', all(http('/api/finance-center/overview', token=f'tok-{k}')[0] == 200 for k in ['fd', 'md', 'ceo', 'admin']))
    ctx, p = U(b, 'sales1'); p.goto(BASE + '/money'); p.get_by_test_id('ledger-error').wait_for(); check('someone who opens the page anyway is told plainly', 'whole company' in txt(p.get_by_test_id('ledger-error'))); ctx.close()

    # =============== 9. A mill can now spend, and the page says so ===============
    ctx, p = U(b, 'oo'); p.goto(BASE + '/expenses'); p.wait_for_timeout(1500)
    check('an Operations Officer is told they log expenses for their milling center', 'Log expenses for your milling center' in txt(p.locator('main, body').first), txt(p.locator('main, body').first)[:200]); ctx.close()

    # =============== 10. A phone ===============
    for key in ['fd', 'md']:
        ctx, p = dash(b, key, viewport={'width': 390, 'height': 844})
        check(f'{key}: on a phone the page does not scroll sideways, and the money band fits', p.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2') and p.get_by_test_id('kpi-spent-value').is_visible()); ctx.close()

    errs = [e for pg in pages for e in getattr(pg, 'errors', [])]
    check('no page threw a script error', not errs, errs[:3])
    n = finish(); b.close(); sys.exit(1 if n else 0)
