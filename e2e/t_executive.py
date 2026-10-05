import os, re, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

def txt(l): return l.inner_text()
pages = []
def U(b, key, **kw):
    ctx, p = as_user(b, key, **kw); pages.append(p); return ctx, p
def dash(b, key, **kw):
    ctx, p = U(b, key, **kw); p.goto(BASE + '/dashboard'); p.get_by_test_id('exec-dashboard').wait_for(); p.get_by_test_id('exec-greeting').wait_for(); p.get_by_test_id('place-card').first.wait_for(); p.wait_for_timeout(700); return ctx, p
def ids(p): return set(p.eval_on_selector_all('[data-testid]', 'els => els.map(e => e.getAttribute("data-testid"))'))
def val(p, tid): return float(p.get_by_test_id(tid).get_attribute('data-value'))
def places(p, kind):
    card = p.locator(f'[data-testid=place-card][data-kind={kind}]'); return {r.get_attribute('data-name'): float(r.get_attribute('data-amount')) for r in card.get_by_test_id('place-row').all()}
def hrefs(p): return set(p.eval_on_selector_all('a[href]', 'els => els.map(e => e.getAttribute("href"))'))
def ledger(b, key, query='', **kw):
    ctx, p = U(b, key, **kw); p.goto(BASE + '/money' + query); p.get_by_test_id('ledger-total-in').wait_for(); p.wait_for_timeout(500); return ctx, p
def pick(p, tid, value): p.get_by_test_id(tid).select_option(value); p.wait_for_timeout(700)
def rows(p): return sorted(r.get_attribute('data-number') for r in p.get_by_test_id('ledger-row').all())
def rnd(x): return int(x + 0.5) if x >= 0 else -int(-x + 0.5)
def dispatch(token):
    js = http('/api/dispatch-tracking?status=all', token=token)[1]['data']; j = js['journeys']
    done = [x for x in j if x['status'] == 'DELIVERED']
    return {'open': len([x for x in j if x['status'] != 'DELIVERED']), 'late': len([x for x in j if x['status'] != 'DELIVERED' and x['late']]), 'delivered': len(done), 'review': js['counts'].get('review', 0),
            'ontime': (rnd((len(done) - len([x for x in done if x['late']])) / len(done) * 100) if done else None)}

with sync_playwright() as pw:
    b = pw.chromium.launch(); reset()

    # =============== 1. Who gets which dashboard ===============
    for key, role, first in [('fd', 'FINANCE_DIRECTOR', 'Kwesi'), ('md', 'MD', 'Kwame'), ('ceo', 'CEO', 'Ama')]:
        ctx, p = dash(b, key)
        check(f'{key}: gets the dashboard made for the {role}', p.get_by_test_id('exec-dashboard').get_attribute('data-role') == role)
        check(f'{key}: it greets them by name, with the "Control center" heading of the Administrator\'s', first in txt(p.get_by_test_id('exec-greeting')) and re.match(r'Good (morning|afternoon|evening)', txt(p.get_by_test_id('exec-greeting'))) and p.locator('p', has_text='Control center').count() >= 1)
        check(f'{key}: and the work waiting for them', p.get_by_test_id('control-center').count() == 1 and p.get_by_test_id('cc-tile').count() >= 3); ctx.close()
    for key in ['sup', 'wm1', 'sales1', 'ops', 'fsup']:
        ctx, p = U(b, key); p.goto(BASE + '/dashboard'); p.wait_for_timeout(2200)
        check(f'{key}: other roles do not get one', p.get_by_test_id('exec-dashboard').count() == 0); ctx.close()
    ctx, p = U(b, 'admin'); p.goto(BASE + '/dashboard'); p.get_by_test_id('admin-control-center').wait_for(); check('the Administrator keeps their own control center', p.get_by_test_id('exec-dashboard').count() == 0); ctx.close()

    # =============== 2. The three dashboards are three different pages ===============
    D = {}
    PRESENT = {'fd': ['money-band', 'exec-invoices', 'exec-ledger', 'exec-debtors', 'exec-resets', 'exec-delegate'], 'md': ['exec-pulse', 'exec-operations', 'exec-setup', 'kpi-row', 'exec-resets', 'exec-delegate', 'exec-broadcast'], 'ceo': ['exec-scorecard', 'exec-risk', 'exec-narrative', 'exec-resets', 'exec-delegate', 'exec-broadcast']}
    ABSENT = {'fd': ['exec-pulse', 'exec-operations', 'exec-setup', 'exec-scorecard', 'exec-risk', 'exec-narrative', 'exec-broadcast', 'kpi-row'], 'md': ['money-band', 'exec-invoices', 'exec-scorecard', 'exec-risk', 'exec-narrative', 'exec-ledger', 'exec-debtors'], 'ceo': ['money-band', 'exec-invoices', 'exec-pulse', 'exec-operations', 'exec-setup', 'kpi-row', 'exec-ledger', 'exec-debtors']}
    for key in ['fd', 'md', 'ceo']:
        ctx, p = dash(b, key); D[key] = ids(p); i = D[key]
        check(f'{key}: has the sections of its own role ({", ".join(PRESENT[key][:3])}...)', all(x in i for x in PRESENT[key]), [x for x in PRESENT[key] if x not in i])
        check(f'{key}: and none of the other two\'s', not any(x in i for x in ABSENT[key]), [x for x in ABSENT[key] if x in i]); ctx.close()
    uniq = {k: D[k] - set().union(*[D[o] for o in D if o != k]) for k in D}
    check('each page has sections that appear on neither of the other two', all(len(uniq[k]) >= 3 for k in uniq), {k: sorted(uniq[k])[:6] for k in uniq})
    common = D['fd'] & D['md'] & D['ceo']
    check('and all three have the tools every one of them needs: the control center, a desk to decide on, the reset sign-off, giving a task, spending by place', all(x in common for x in ['control-center', 'exec-desk', 'exec-resets', 'exec-delegate', 'exec-spending']), sorted(common)[:12])

    # =============== 3. The Finance Director: the money band and where the money is spent ===============
    ctx, p = dash(b, 'fd')
    check('sales booked: the two approved orders of the month, not the submitted or rejected ones', val(p, 'kpi-sales-value') == 16000 and '2 approved orders' in txt(p.get_by_test_id('kpi-sales')), txt(p.get_by_test_id('kpi-sales')))
    check('money collected: the verified payments only', val(p, 'kpi-collected-value') == 8000 and '2 verified payments' in txt(p.get_by_test_id('kpi-collected')))
    check('money spent: the approved expenses only', val(p, 'kpi-spent-value') == 11450 and '7 approved expenses' in txt(p.get_by_test_id('kpi-spent')))
    check('net cash: collected less spent, and a loss is shown with its minus sign', val(p, 'kpi-net-value') == -3450 and txt(p.get_by_test_id('kpi-net-value')).startswith('-GHS 3,450'), txt(p.get_by_test_id('kpi-net-value')))
    check('each figure says how it compares with last month', p.get_by_test_id('kpi-sales-change').get_attribute('data-dir') == 'up' and 'vs last month' in txt(p.get_by_test_id('kpi-sales-change')) and p.get_by_test_id('kpi-net-change').get_attribute('data-dir') == 'down')
    check('spending that went UP is not shown as good news (amber, not green)', 'text-husk-300' in p.get_by_test_id('kpi-spent-change').get_attribute('class') and 'text-emerald-300' in p.get_by_test_id('kpi-collected-change').get_attribute('class'))
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
    check('clicking a place opens the ledger already limited to that place', '/money?place=mill:' in p.url and rows(p) == ['EXP-e12', 'EXP-e5'] and p.get_by_test_id('ledger-place-note').count() == 1, (p.url, rows(p))); ctx.close()

    # =============== 4. Choosing the period ===============
    ctx, p = dash(b, 'fd')
    check('this month is the starting period', p.get_by_test_id('period-month').get_attribute('aria-pressed') == 'true')
    p.get_by_test_id('period-all').click(); p.wait_for_timeout(900)
    check('All time adds up everything ever spent, and has nothing to compare with', val(p, 'kpi-spent-value') == 18450 and p.get_by_test_id('kpi-spent-change').count() == 0 and p.get_by_test_id('period-all').get_attribute('aria-pressed') == 'true')
    check('...and the places follow the period', places(p, 'farms')['Nkawkaw Farm'] == 1500 + 800 + 5000, places(p, 'farms'))
    p.get_by_test_id('period-quarter').click(); p.wait_for_timeout(900)
    check('This quarter works, and compares with the quarter before', val(p, 'kpi-spent-value') == 11450 and 'vs last quarter' in txt(p.get_by_test_id('kpi-spent-change')))
    p.get_by_test_id('period-month').click(); p.wait_for_timeout(900)
    check('going back to this month restores this month\'s figures', val(p, 'kpi-spent-value') == 11450)
    check('it says when the figures were last updated, and can be refreshed', 'Updated' in txt(p.get_by_test_id('exec-updated')) and p.get_by_test_id('exec-refresh').is_enabled()); ctx.close()

    # =============== 5. The Finance Director: the rest of the money picture ===============
    ctx, p = dash(b, 'fd')
    t = {x.get_attribute('data-key'): txt(x.get_by_test_id('money-tile-value')) for x in p.get_by_test_id('money-tile').all()}
    check('owed to us, payments to verify, and expenses to approve are shown with their amounts', t.get('receivables') == 'GHS 8,000' and t.get('pending-payments') == 'GHS 1,500' and t.get('pending-expenses') == 'GHS 1,000', t)
    check('who owes the company: invoices less VERIFIED payments only, with what is overdue', [(r.get_attribute('data-name'), float(r.get_attribute('data-amount'))) for r in p.get_by_test_id('debtor-row').all()] == [('Adom Foods', 7000), ('Boateng Stores', 1000)] and 'GHS 5,000 overdue' in txt(p.get_by_test_id('exec-debtors')))
    check('the sales record: the approved orders of the month, newest first', [r.get_attribute('data-amount') for r in p.get_by_test_id('sales-row').all()] == ['6000', '10000'] and 'Nana Yeboah' in txt(p.get_by_test_id('sales-row').first) and 'Fulfilled' in txt(p.get_by_test_id('sales-row').first))
    check('what the money is spent on, biggest first', [r.get_attribute('data-name') for r in p.get_by_test_id('category-row').all()] == ['Salaries', 'Electricity', 'Transport', 'Labour', 'Fuel'])
    check('the six-month chart is drawn', p.get_by_test_id('trend-chart').locator('svg').count() >= 1 and 'Sales booked' in txt(p.get_by_test_id('exec-trend')))
    check('the latest money in and out, with what is waiting marked, and no refused payment', p.get_by_test_id('ledger-row').count() == 12 and p.locator('[data-testid=ledger-row][data-number=PAY-p4][data-state=waiting]').count() == 1 and p.locator('[data-testid=ledger-row][data-number=PAY-p5]').count() == 0)
    check('his own desk is on the page, to decide without leaving it', 'Decide here' in txt(p.get_by_test_id('exec-desk')))
    h = {a.get_attribute('href') for a in p.get_by_test_id('manage-link').all()}; check('and the places he goes to, including the money ledger', all(x in h for x in ['/finance', '/money', '/expenses', '/sales', '/reports'])); ctx.close()

    # =============== 6. The Managing Director: running the business ===============
    api = dispatch('tok-md'); ctx, p = dash(b, 'md')
    pulse = {t.get_attribute('data-key'): t.get_attribute('data-value') for t in p.get_by_test_id('pulse-tile').all()}
    check('the business in motion shows what the dispatch list says: on the way, running late, damaged-bag reports, delivered', pulse == {'road': str(api['open']), 'late': str(api['late']), 'reports': str(api['review']), 'delivered': str(api['delivered'])}, (pulse, api))
    check('a late delivery is shown as a warning, with which one is longest late', api['late'] == 0 or ('border-amber-300' in p.locator('[data-testid=pulse-tile][data-key=late]').get_attribute('class') and 'Longest:' in txt(p.locator('[data-testid=pulse-tile][data-key=late]'))))
    check('the money is here, briefly: the four figures as cards, and spending at every place', val(p, 'kpi-spent-value') == 11450 and val(p, 'kpi-sales-value') == 16000 and places(p, 'milling-centers') == {'Tamale Mill': 3000, 'Kumasi Mill': 0})
    check('he sees the company on the ground (stock) and the watch-list', p.get_by_test_id('exec-operations').count() == 1 and p.get_by_test_id('exec-watch').count() == 1 and '/oversight' in hrefs(p))
    su = p.get_by_test_id('exec-setup'); check('and the two things only he manages: the company\'s places, and the master lists', {a.get_attribute('href') for a in su.get_by_test_id('manage-link').all()} == {'/organization', '/master-data'}, txt(su)[:120]); ctx.close()
    ctx, p = dash(b, 'ceo'); check('the CEO has no set-up cards: managing places and lists is not theirs', p.get_by_test_id('exec-setup').count() == 0); ctx.close()

    # =============== 7. The CEO: how the company is doing, and where it is exposed ===============
    api = dispatch('tok-ceo'); ctx, p = dash(b, 'ceo'); p.wait_for_timeout(500)
    g = {x.get_attribute('data-key'): (x.get_attribute('data-value'), x.get_attribute('data-tone')) for x in p.get_by_test_id('gauge').all()}
    want = {'collection': ('50', 'watch'), 'margin': ('-43', 'bad'), 'spending': ('143', 'bad'), 'overdue': ('75', 'bad'), 'concentration': ('63', 'bad')}
    check('the scorecard has six dials', sorted(g) == ['collection', 'concentration', 'margin', 'ontime', 'overdue', 'spending'], sorted(g))
    check('each dial works out its share from the real figures, and colours it: collected 50% of sold, margin -43%, spending 143% of collections, 75% of debt overdue, biggest customer 63%', all(g[k] == v for k, v in want.items()), {k: g.get(k) for k in want})
    check('deliveries on time follow the dispatch list, and the colour follows the number', g['ontime'][0] == ('' if api['ontime'] is None else str(api['ontime'])) and g['ontime'][1] == ('none' if api['ontime'] is None else 'good' if api['ontime'] >= 90 else 'watch' if api['ontime'] >= 70 else 'bad'), (g['ontime'], api['ontime']))
    check('a dial says in words what it measures', 'share of sales booked' in txt(p.locator('[data-testid=gauge][data-key=collection]')) or 'sales booked' in txt(p.locator('[data-testid=gauge][data-key=collection]')))
    r = {x.get_attribute('data-key'): (x.get_attribute('data-level'), txt(x.get_by_test_id('risk-value'))) for x in p.get_by_test_id('risk-card').all()}
    check('the risk radar: overdue debts and a negative cash position need action; money waiting for a decision is to be watched', r['overdue'] == ('high', 'GHS 6,000') and r['cash'] == ('high', '-GHS 3,450') and r['payments'] == ('medium', 'GHS 1,500') and r['expenses'] == ('medium', 'GHS 1,000'), r)
    check('late trucks and damaged-bag reports come from the dispatch list', r['late'][0] == ('high' if api['late'] > 0 else 'ok') and r['late'][1] == str(api['late']) and r['bags'] == ('ok' if api['review'] == 0 else 'medium', str(api['review'])), r)
    nar = {x.get_attribute('data-key'): (x.get_attribute('data-dir'), x.get_attribute('data-value')) for x in p.get_by_test_id('narrative-line').all()}
    check('"What changed" says it in plain words: sales, collections and spending up on last month, net cash down', nar['sales'] == ('up', '16000') and nar['collected'] == ('up', '8000') and nar['spent'] == ('up', '11450') and nar['net'] == ('down', '-3450'), nar)
    check('...and names the biggest cost', 'Salaries' in txt(p.locator('[data-testid=narrative-line][data-key=top-cost]')) and 'on last month' in txt(p.locator('[data-testid=narrative-line][data-key=sales]')))
    check('who the company depends on: each customer with their share of the sales', [(c.get_attribute('data-name'), txt(c.get_by_test_id('customer-share'))) for c in p.get_by_test_id('customer-row').all()] == [('Adom Foods', '63%'), ('Boateng Stores', '38%')])
    check('the same spending at every place, and the decisions that are the CEO\'s', places(p, 'milling-centers') == {'Tamale Mill': 3000, 'Kumasi Mill': 0} and 'Decide here' in txt(p.get_by_test_id('exec-desk')) and '/oversight' in hrefs(p)); ctx.close()

    # =============== 8. The Finance Director raises invoices ===============
    reset(); ctx, p = dash(b, 'fd'); inv = p.get_by_test_id('exec-invoices'); rws = inv.get_by_test_id('invoice-row')
    check('the delivered orders with no invoice are listed, newest first (not the one already invoiced, not the one not yet delivered)', [r.get_attribute('data-order') for r in rws.all()] == ['SO-2026-000031', 'SO-2026-000032'], [r.get_attribute('data-order') for r in rws.all()])
    check('it says how many are waiting and how much they come to', '2 orders waiting' in txt(inv.get_by_test_id('invoice-summary')) and 'GHS 6,000.00' in txt(inv.get_by_test_id('invoice-summary')))
    rws.nth(1).get_by_test_id('invoice-open').click(); inv.get_by_test_id('invoice-tax').fill('-5'); inv.get_by_test_id('invoice-confirm').click(); p.wait_for_timeout(400)
    check('a negative tax is refused on the spot and nothing is sent', 'zero or more' in txt(inv.get_by_test_id('invoice-error')) and last_call('/invoices') is None)
    inv.get_by_test_id('invoice-tax').fill('0'); inv.get_by_test_id('invoice-confirm').click(); inv.get_by_test_id('invoice-notice').wait_for()
    check('the invoice is raised for the order he opened, and says its number and total', re.search(r'INV-\d{4}-000002 raised for SO-2026-000032: GHS 1,800\.00', txt(inv.get_by_test_id('invoice-notice'))) is not None, txt(inv.get_by_test_id('invoice-notice')))
    check('it leaves the list, and only the other order is still waiting', [r.get_attribute('data-order') for r in rws.all()] == ['SO-2026-000031'] and '1 order waiting' in txt(inv.get_by_test_id('invoice-summary')))
    rws.first.get_by_test_id('invoice-open').click(); inv.get_by_test_id('invoice-tax').fill('15'); inv.get_by_test_id('invoice-discount').fill('100'); inv.get_by_test_id('invoice-due').fill('2026-11-30'); inv.get_by_test_id('invoice-confirm').click(); p.wait_for_timeout(900)
    sent = last_call('/invoices')
    check('tax, discount and due date go to the server with the order', sent and sent['body']['salesOrderId'] == 'a0000001-0000-4000-8000-000000000001' and sent['body']['taxRatePercent'] == 15 and sent['body']['discount'] == 100 and sent['body']['dueDate'].startswith('2026-11-30'), sent)
    check('the total allows for them: 4,200 less 100, plus 15% tax = 4,715', 'GHS 4,715.00' in txt(inv.get_by_test_id('invoice-notice')), txt(inv.get_by_test_id('invoice-notice')))
    check('when every delivered order has its invoice, it says so', inv.get_by_test_id('invoice-empty').count() == 1 and len(http('/__desks')[1]['invoices']) == 3); ctx.close()
    c1, b1 = http('/api/invoices', 'POST', 'tok-fd', {'salesOrderId': 'a0000003-0000-4000-8000-000000000003'}); c2, b2 = http('/api/invoices', 'POST', 'tok-fd', {'salesOrderId': 'a0000004-0000-4000-8000-000000000004'})
    check('the server\'s own rules hold: an order is invoiced once, and only after it is delivered', c1 == 400 and 'already has an invoice' in json.dumps(b1) and c2 == 400 and 'Only FULFILLED' in json.dumps(b2), (c1, c2))

    # =============== 9. Signing off a system reset ===============
    reset(); ctx, p = dash(b, 'fd'); q = p.get_by_test_id('exec-resets')
    check('a reset request waiting for sign-off is listed, with who has signed it so far', q.get_by_test_id('reset-item').count() == 1 and 'RST-2026-000001' in txt(q) and 'Finance: waiting' in txt(q) and 'MD or CEO: waiting' in txt(q), txt(q)[:200])
    q.get_by_test_id('reset-review').click(); p.get_by_role('dialog').get_by_role('button', name='Approve', exact=True).click(); p.wait_for_timeout(900)
    check('the Finance Director approves it from his dashboard', last_call('/reset-requests/rs1/approve') is not None and last_call('/reset-requests/rs1/approve')['by'] == 'fd'); ctx.close()
    for key in ['md', 'ceo']:
        ctx, p = dash(b, key); q = p.get_by_test_id('exec-resets'); check(f'{key}: sees the same request in the queue on their dashboard', q.get_by_test_id('reset-item').count() == 1 and 'RST-2026-000001' in txt(q)); ctx.close()
    ctx, p = dash(b, 'md'); q = p.get_by_test_id('exec-resets'); q.get_by_test_id('reset-review').click(); p.get_by_role('dialog').get_by_role('button', name='Approve', exact=True).click(); p.wait_for_timeout(900)
    check('the Managing Director signs it from his', len([c for c in calls() if c['path'].endswith('/reset-requests/rs1/approve')]) == 2 and last_call('/reset-requests/rs1/approve')['by'] == 'md'); ctx.close()

    # =============== 10. Giving someone a task ===============
    reset(); ctx, p = dash(b, 'fd'); d = p.get_by_test_id('exec-delegate')
    d.get_by_test_id('delegate-submit').click(); p.wait_for_timeout(300); check('an empty task is refused, in words', 'Say what the task is' in txt(d.get_by_test_id('delegate-error')))
    d.get_by_test_id('delegate-title').fill('Count the Kumasi stock'); d.get_by_test_id('delegate-submit').click(); p.wait_for_timeout(300); check('a task for nobody is refused, in words', 'Choose who' in txt(d.get_by_test_id('delegate-error')) and last_call('/tasks') is None)
    opts = d.get_by_test_id('delegate-assignee').locator('option').all_inner_texts()
    check('he can give it to a whole role or to one person, and is not offered himself', 'Warehouse Supervisor' in opts and any('Efua Darko' in o for o in opts) and not any('Kwesi Appiah' in o for o in opts), opts[:8])
    d.get_by_test_id('delegate-assignee').select_option('role:WAREHOUSE_SUPERVISOR'); d.get_by_test_id('delegate-due').fill('2026-11-05'); d.get_by_test_id('delegate-priority').select_option('HIGH'); d.get_by_test_id('delegate-details').fill('Both sizes, before the Friday sale.'); d.get_by_test_id('delegate-submit').click(); d.get_by_test_id('delegate-notice').wait_for()
    sent = last_call('/tasks')['body']
    check('a task for a whole role goes to the server with its priority, due date and detail', sent['title'] == 'Count the Kumasi stock' and sent['assignedRoleCode'] == 'WAREHOUSE_SUPERVISOR' and 'assignedToId' not in sent and sent['priority'] == 'HIGH' and sent['dueDate'].startswith('2026-11-05') and sent['description'] == 'Both sizes, before the Friday sale.', sent)
    check('he is told it is done, and who has it', 'TASK-2026-000001' in txt(d.get_by_test_id('delegate-notice')) and 'everyone who is Warehouse Supervisor' in txt(d.get_by_test_id('delegate-notice')) and d.get_by_test_id('delegate-title').input_value() == '')
    d.get_by_test_id('delegate-title').fill('Send me the mill report'); d.get_by_test_id('delegate-assignee').select_option('user:u-sup'); d.get_by_test_id('delegate-submit').click(); p.wait_for_timeout(800)
    sent = last_call('/tasks')['body']; check('a task for one person goes to that person', sent.get('assignedToId') == 'u-sup' and 'assignedRoleCode' not in sent and 'Efua Darko' in txt(d.get_by_test_id('delegate-notice')), sent); ctx.close()
    for key in ['md', 'ceo']:
        ctx, p = dash(b, key); d = p.get_by_test_id('exec-delegate'); d.get_by_test_id('delegate-title').fill(f'Report to me from {key}'); d.get_by_test_id('delegate-assignee').select_option('role:FARM_MANAGER'); d.get_by_test_id('delegate-submit').click(); d.get_by_test_id('delegate-notice').wait_for()
        check(f'{key}: can give a task too', last_call('/tasks')['by'] == key and last_call('/tasks')['body']['assignedRoleCode'] == 'FARM_MANAGER'); ctx.close()

    # =============== 11. Announcing to the team (the MD and the CEO) ===============
    reset(); ctx, p = dash(b, 'md'); bc = p.get_by_test_id('exec-broadcast'); opts = bc.get_by_test_id('broadcast-audience').locator('option').all_inner_texts()
    check('the audience can be everyone, or everyone with one role, with the numbers', 'Everyone (15 people)' in opts and 'All Warehouse Manager (2)' in opts, opts[:5])
    bc.get_by_test_id('broadcast-send').click(); p.wait_for_timeout(300); check('no title is refused, in words', 'short title' in txt(bc.get_by_test_id('broadcast-error')))
    bc.get_by_test_id('broadcast-title').fill('Stock count on Friday'); bc.get_by_test_id('broadcast-send').click(); p.wait_for_timeout(300); check('no message is refused, in words', 'Write the message' in txt(bc.get_by_test_id('broadcast-error')) and http('/__desks')[1]['convs'] == [])
    bc.get_by_test_id('broadcast-body').fill('Please finish counting by 5pm.'); bc.get_by_test_id('broadcast-ack').check(); bc.get_by_test_id('broadcast-send').click(); bc.get_by_test_id('broadcast-notice').wait_for()
    st = http('/__desks')[1]; cv, mg = st['convs'][-1], st['msgs'][-1]
    check('an announcement goes to everyone else (15 people) as an ANNOUNCEMENT that asks to be acknowledged, and the message follows', cv['type'] == 'ANNOUNCEMENT' and len(cv['memberIds']) == 15 and 'u-md' not in cv['memberIds'] and cv['requiresResponse'] is True and cv['title'] == 'Stock count on Friday' and mg['body'] == 'Please finish counting by 5pm.' and mg['conversationId'] == cv['id'], st)
    check('he is told how many it reached', 'Sent to 15 people' in txt(bc.get_by_test_id('broadcast-notice')) and 'acknowledge' in txt(bc.get_by_test_id('broadcast-notice')))
    bc.get_by_test_id('broadcast-audience').select_option('role:WAREHOUSE_MANAGER'); bc.get_by_test_id('broadcast-title').fill('Warehouse managers'); bc.get_by_test_id('broadcast-body').fill('A meeting at 9.'); bc.get_by_test_id('broadcast-send').click(); p.wait_for_timeout(900)
    cv = http('/__desks')[1]['convs'][-1]; check('an announcement to one role goes only to the people who hold it', sorted(cv['memberIds']) == ['u-wm1', 'u-wm2'] and cv['requiresResponse'] is False and 'Sent to 2 people' in txt(bc.get_by_test_id('broadcast-notice')), cv); ctx.close()
    ctx, p = dash(b, 'ceo'); bc = p.get_by_test_id('exec-broadcast'); bc.get_by_test_id('broadcast-title').fill('From the CEO'); bc.get_by_test_id('broadcast-body').fill('Thank you for a good month.'); bc.get_by_test_id('broadcast-send').click(); bc.get_by_test_id('broadcast-notice').wait_for()
    check('the CEO can announce too', http('/__desks')[1]['convs'][-1]['title'] == 'From the CEO' and 'Sent to 15 people' in txt(bc.get_by_test_id('broadcast-notice'))); ctx.close()
    code, body = http('/api/conversations', 'POST', 'tok-fd', {'type': 'ANNOUNCEMENT', 'title': 'x y z', 'memberIds': ['u-md']})
    check('the Finance Director has no announcement panel, and the server refuses him one', code == 403 and 'broadcasts or announcements' in json.dumps(body) and 'exec-broadcast' not in D['fd'], (code, body))

    # =============== 12. The control center inside them, styled like the Administrator's ===============
    ctx, p = dash(b, 'fd'); st = txt(p.get_by_test_id('cc-status'))
    check('the control center says how much is waiting for them, in one line', re.search(r'\d+ waiting for you', st) is not None, st)
    check('each piece of work has an icon, and the shortcuts are cards with the dark icon squares', all(t.locator('svg').count() >= 1 for t in p.get_by_test_id('cc-tile').all()) and p.get_by_test_id('cc-control').first.locator('svg').count() == 1 and 'bg-paddy-900' in p.get_by_test_id('cc-control').first.locator('span').first.get_attribute('class')); ctx.close()
    ctx, p = U(b, 'sup'); p.goto(BASE + '/dashboard'); p.get_by_test_id('control-center').wait_for(); p.get_by_test_id('cc-tile').first.wait_for()
    check('the other roles\' control centers have the same look', p.get_by_test_id('cc-status').count() == 1 and p.get_by_test_id('cc-tile').first.locator('svg').count() >= 1); ctx.close()

    # =============== 13. The money ledger ===============
    ctx, p = ledger(b, 'fd')
    check('every payment and expense is listed, with the totals of what is confirmed', txt(p.get_by_test_id('ledger-total-in')) == 'GHS 10,500.00' and txt(p.get_by_test_id('ledger-total-out')) == 'GHS 18,450.00' and txt(p.get_by_test_id('ledger-total-net')) == '-GHS 7,950.00' and txt(p.get_by_test_id('ledger-total-count')) == '18')
    check('what is waiting is shown apart from the totals', 'GHS 1,500.00 waiting' in txt(p.get_by_test_id('ledger-total-in').locator('xpath=..')) and 'GHS 1,000.00 waiting' in txt(p.get_by_test_id('ledger-total-out').locator('xpath=..')))
    pick(p, 'ledger-filter-kind', 'in'); check('money in only', p.get_by_test_id('ledger-row').count() == 5 and all(r.get_attribute('data-kind') == 'IN' for r in p.get_by_test_id('ledger-row').all()))
    pick(p, 'ledger-filter-kind', 'out'); check('money out only', p.get_by_test_id('ledger-row').count() == 13 and all(r.get_attribute('data-kind') == 'OUT' for r in p.get_by_test_id('ledger-row').all()))
    pick(p, 'ledger-filter-kind', ''); pick(p, 'ledger-filter-status', 'waiting'); check('only what is waiting for a decision', rows(p) == ['EXP-e8', 'EXP-e9', 'PAY-p4'], rows(p))
    pick(p, 'ledger-filter-status', ''); pick(p, 'ledger-filter-place', 'office'); check('a place filter shows spending only, and says why', rows(p) == ['EXP-e6'] and p.get_by_test_id('ledger-place-note').count() == 1)
    opts = p.get_by_test_id('ledger-filter-place').locator('option').all_inner_texts(); check('the place list offers every farm, warehouse and milling center', all(n in opts for n in ['Nkawkaw Farm', 'Tamale Warehouse', 'Kumasi Mill', 'Head office']), opts)
    pick(p, 'ledger-filter-place', ''); p.get_by_test_id('ledger-q').fill('boateng'); p.wait_for_timeout(900); check('search finds by customer', rows(p) == ['PAY-p2'], rows(p))
    p.get_by_test_id('ledger-q').fill(''); p.get_by_test_id('ledger-from').fill('2026-10-14'); p.get_by_test_id('ledger-to').fill('2026-10-14'); p.wait_for_timeout(900); check('and by date, the last day included', rows(p) == ['PAY-p2', 'PAY-p4'], rows(p))
    p.get_by_test_id('ledger-q').fill('zzzzqq'); p.wait_for_timeout(900); check('nothing matching says so', p.get_by_test_id('ledger-empty').count() == 1); ctx.close()
    for key in ['md', 'ceo']:
        ctx, p = ledger(b, key); check(f'{key}: can open the whole ledger', txt(p.get_by_test_id('ledger-total-count')) == '18'); ctx.close()

    # =============== 14. Who may see the company's money ===============
    for key in ['fd', 'md', 'ceo']:
        ctx, p = U(b, key); p.goto(BASE + '/notifications'); p.get_by_test_id('top-bar').wait_for(); p.wait_for_timeout(300); check(f'{key}: the menu has the Money ledger', '/money' in hrefs(p)); ctx.close()
    for key in ['sales1', 'fm', 'wm1', 'sup', 'oo']:
        ctx, p = U(b, key); p.goto(BASE + '/notifications'); p.get_by_test_id('top-bar').wait_for(); p.wait_for_timeout(300); check(f'{key}: the menu does not', '/money' not in hrefs(p)); ctx.close()
    for key in ['sales1', 'wm1', 'sup', 'fsup', 'ops']:
        c1, _ = http('/api/finance-center/overview', token=f'tok-{key}'); c2, _ = http('/api/finance-center/ledger', token=f'tok-{key}')
        check(f'{key}: the server refuses them the company-wide money, even if they ask directly', c1 == 403 and c2 == 403, (c1, c2))
    check('the Finance Director, MD, CEO and Administrator are answered', all(http('/api/finance-center/overview', token=f'tok-{k}')[0] == 200 for k in ['fd', 'md', 'ceo', 'admin']))
    ctx, p = U(b, 'sales1'); p.goto(BASE + '/money'); p.get_by_test_id('ledger-error').wait_for(); check('someone who opens the page anyway is told plainly', 'whole company' in txt(p.get_by_test_id('ledger-error'))); ctx.close()
    ctx, p = U(b, 'oo'); p.goto(BASE + '/expenses'); p.wait_for_timeout(1500); check('an Operations Officer is told they log expenses for their milling center', 'Log expenses for your milling center' in txt(p.locator('main, body').first)); ctx.close()

    # =============== 15. A phone ===============
    for key, tid in [('fd', 'kpi-spent-value'), ('md', 'kpi-spent-value'), ('ceo', 'gauge')]:
        ctx, p = dash(b, key, viewport={'width': 390, 'height': 844})
        check(f'{key}: on a phone the page does not scroll sideways, and its headline figures fit', p.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2') and p.get_by_test_id(tid).first.is_visible()); ctx.close()

    errs = [e for pg in pages for e in getattr(pg, 'errors', [])]
    check('no page threw a script error', not errs, errs[:3])
    n = finish(); b.close(); sys.exit(1 if n else 0)
