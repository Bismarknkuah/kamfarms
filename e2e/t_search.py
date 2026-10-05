import os, re, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

def txt(l): return l.inner_text()
pages = []
def U(b, key, **kw):
    ctx, p = as_user(b, key, **kw); pages.append(p); return ctx, p
def start(b, key, path='/notifications'):
    ctx, p = U(b, key); p.goto(BASE + path); p.get_by_test_id('search-input').wait_for(); p.wait_for_timeout(400); return ctx, p
def ask(p, q):
    box = p.get_by_test_id('search-input'); box.fill(''); box.fill(q)
    try: p.locator('[data-testid=search-result], [data-testid=search-empty]').first.wait_for(timeout=4000)
    except Exception: pass
    p.wait_for_timeout(500)
def found(p):
    out = {}
    for g in p.get_by_test_id('search-group').all(): out[g.get_attribute('data-label')] = [txt(r.locator('span').first).strip() for r in g.get_by_test_id('search-result').all()]
    return out

with sync_playwright() as pw:
    b = pw.chromium.launch(); reset()

    # =============== 1. The box ===============
    ctx, p = start(b, 'md'); box = p.get_by_test_id('search-input'); box.fill('a'); p.wait_for_timeout(500)
    check('one character is not enough: no list opens', p.get_by_test_id('search-results').count() == 0)
    ask(p, 'zzzzqq'); check('when nothing matches it says so, plainly', 'Nothing found' in txt(p.get_by_test_id('search-empty')) and 'zzzzqq' in txt(p.get_by_test_id('search-empty')))
    url = p.url; p.get_by_test_id('search-input').press('Enter'); p.wait_for_timeout(300); check('pressing Enter with nothing found does nothing', p.url == url)
    ask(p, 'adom'); p.get_by_test_id('search-input').press('Escape'); p.wait_for_timeout(200); check('Escape closes the list', p.get_by_test_id('search-results').count() == 0)
    ask(p, 'adom'); p.locator('h1, main').first.click(position={'x': 5, 'y': 5}); p.wait_for_timeout(200); check('clicking away closes the list', p.get_by_test_id('search-results').count() == 0); ctx.close()

    # =============== 2. Pages: matched from the menu the person is offered ===============
    ctx, p = start(b, 'md'); ask(p, 'track'); f = found(p)
    check('typing a page\'s name offers that page, instantly', 'Track dispatch' in f.get('Pages', []) and p.locator('[data-testid=search-result][data-href="/track-dispatch"]').count() == 1, f); ctx.close()
    ctx, p = start(b, 'sales1'); ask(p, 'track'); check('a role that is not offered a page is not offered it in search either', 'Track dispatch' not in found(p).get('Pages', [])); ctx.close()

    # =============== 3. Records: found, shown, and they open ===============
    ctx, p = start(b, 'md'); ask(p, 'adom'); f = found(p)
    check('orders are found by customer, newest first, at most five, each opening its order', len(f.get('Orders', [])) == 5 and f['Orders'][0] == 'SO-2026-000011' and p.locator('[data-testid=search-result][data-href^="/sales?order=ord-"]').count() == 5, f)
    check('each result says what it is (customer and stage)', 'Adom' in txt(p.get_by_test_id('search-group').first.get_by_test_id('search-result').first))
    p.get_by_test_id('search-result').first.click(); p.wait_for_url('**/sales?order=ord-11')
    check('clicking a result opens it, and the box is cleared', 'order=ord-11' in p.url and p.get_by_test_id('search-input').input_value() == ''); ctx.close()
    ctx, p = start(b, 'md'); ask(p, 'tamale'); f = found(p)
    check('places and dispatches are found: the warehouse, the mill, and the dispatches going to it', f.get('Warehouses') == ['Tamale Warehouse'] and f.get('Milling centers') == ['Tamale Mill'] and len(f.get('Dispatches', [])) >= 1, f); ctx.close()
    ctx, p = start(b, 'md'); ask(p, 'ds-2026-000103'); p.get_by_test_id('search-result').first.click(); p.wait_for_url('**/track-dispatch?ref=DS-2026-000103'); p.locator('[data-testid=journey][data-focus=true]').wait_for()
    check('a dispatch found by its number opens in Track dispatch, with its steps shown', p.locator('[data-testid=journey][data-focus=true] [data-testid=journey-steps]').count() == 1); ctx.close()

    # =============== 4. Keyboard ===============
    ctx, p = start(b, 'md'); ask(p, 'adom'); box = p.get_by_test_id('search-input'); box.press('ArrowDown'); box.press('ArrowDown')
    check('the arrow keys move through the results', p.locator('[data-testid=search-result][aria-selected=true]').get_attribute('data-href') == '/sales?order=ord-8')
    box.press('Enter'); p.wait_for_url('**/sales?order=ord-8'); check('Enter opens the one that is chosen', 'order=ord-8' in p.url)
    ctx, p = start(b, 'md'); ask(p, 'track'); p.get_by_test_id('search-input').press('Enter'); p.wait_for_url('**/track-dispatch'); check('Enter with none chosen opens the first match', '/track-dispatch' in p.url); ctx.close()

    # =============== 5. Each person finds only what is theirs ===============
    ctx, p = start(b, 'sales1'); ask(p, 'adom'); f = found(p)
    check('a Sales Officer finds their own orders, and never another officer\'s', 'SO-2026-000011' not in f.get('Orders', []) and len(f.get('Orders', [])) == 4 and set(f) <= {'Orders', 'Pages'}, f); ctx.close()
    ctx, p = start(b, 'sales2'); ask(p, 'adom'); check('the other officer finds only theirs', found(p).get('Orders') == ['SO-2026-000011'], found(p)); ctx.close()
    ctx, p = start(b, 'fm'); ask(p, 'farm'); f = found(p); check('a Farm Manager finds their own farm, not the other', f.get('Farms') == ['Nkawkaw Farm'], f); ctx.close()
    ctx, p = start(b, 'md'); ask(p, 'farm'); check('the Managing Director finds every farm', sorted(found(p).get('Farms', [])) == ['Nkawkaw Farm', 'Techiman Farm']); ctx.close()
    ctx, p = start(b, 'wm1'); ask(p, 'kumasi'); check('a Warehouse Manager does not find another warehouse', 'Warehouses' not in found(p), found(p)); ctx.close()
    ctx, p = start(b, 'wm2'); ask(p, 'kumasi'); check('...but finds their own', found(p).get('Warehouses') == ['Kumasi Warehouse'], found(p)); ctx.close()
    ctx, p = start(b, 'fm'); ask(p, 'tamale'); f = found(p); check('a Farm Manager searching for a warehouse finds only the dispatches of their own farm going there, not the warehouse', 'Warehouses' not in f and len(f.get('Dispatches', [])) == 1 and f['Dispatches'][0] == 'DS-2026-000101', f); ctx.close()
    ctx, p = start(b, 'oo'); ask(p, 'tamale'); f = found(p); check('a role with no dispatch or order access finds none of those', 'Dispatches' not in f and 'Orders' not in f, f); ctx.close()
    check('no page threw an error anywhere', not any(pg.errors for pg in pages), [e for pg in pages for e in pg.errors][:3])
    b.close()
sys.exit(1 if finish() else 0)
