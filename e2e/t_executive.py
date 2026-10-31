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

    n = finish(); b.close(); sys.exit(1 if n else 0)
