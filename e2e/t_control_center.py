import os, re, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

WH1 = '11111111-1111-4111-8111-111111111111'; WH2 = '22222222-2222-4222-8222-222222222222'
G4 = '44444444-4444-4444-8444-444444444444'; G5 = '55555555-5555-4555-8555-555555555555'
EVERYONE = ['sales1', 'sales2', 'fd', 'md', 'ceo', 'ops', 'ops2', 'sup', 'sup2', 'wm1', 'wm2', 'fsup', 'fsup2', 'fm', 'oo', 'admin']
def txt(l): return l.inner_text()
def api(path, key, method='GET', body=None):
    st, r = http('/api' + path, method, 'tok-' + key, body); return st, (r.get('data') if isinstance(r, dict) and 'data' in r else r)
pages = []
def U(b, key, **kw):
    ctx, p = as_user(b, key, **kw); pages.append(p); return ctx, p
def open_cc(b, key, **kw):
    ctx, p = U(b, key, **kw); p.goto(BASE + '/dashboard'); p.get_by_test_id('control-center').wait_for(); p.get_by_test_id('cc-tile').first.wait_for(); p.wait_for_timeout(300); return ctx, p
def tiles(p): return {t.get_attribute('data-key'): int(txt(t.get_by_test_id('cc-count')).replace(',', '')) for t in p.get_by_test_id('cc-tile').all()}
def geometry(p):
    return p.evaluate('''() => { const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, c: (b.left + b.right) / 2 }; };
        return { bar: r('[data-testid=top-bar]'), search: r('[data-testid=top-bar-search]'), tools: r('[data-testid=top-bar-tools]') }; }''')

EXPECT = {
    'fd':    ('Finance control center', 'the whole company', {'orders-approve': 2, 'payments-verify': 3, 'expenses-decide': 2, 'my-tasks': 0}),
    'md':    ("Managing Director's control center", 'the whole company', {'orders-release': 3, 'expenses-director': 1, 'supply-open': 0, 'my-tasks': 0}),
    'fsup':  ("Farm Supervisor's control center", 'the whole company', {'paddy-entries': 3, 'dispatch-approvals': 2, 'stock-corrections': 3, 'supply-waiting': 0, 'supply-open': 0, 'my-tasks': 0}),
    'fsup2': ("Farm Supervisor's control center", 'Nkawkaw Farm', {'paddy-entries': 2, 'dispatch-approvals': 1, 'stock-corrections': 1, 'supply-waiting': 0, 'supply-open': 0, 'my-tasks': 0}),
    'wm1':   ('Warehouse control center', 'Tamale Warehouse', {'orders-prepare': 2, 'trucks-coming': 2, 'transfers-coming': 0, 'supply-open': 0, 'my-tasks': 0}),
    'wm2':   ('Warehouse control center', 'Kumasi Warehouse', {'orders-prepare': 1, 'trucks-coming': 1, 'transfers-coming': 0, 'supply-open': 0, 'my-tasks': 0}),
    'sup':   ('Warehouse control center', 'the whole company', {'orders-assign': 1, 'orders-prepare': 3, 'stock-corrections': 3, 'supply-waiting': 0, 'transfers-coming': 0, 'rice-coming': 2, 'supply-open': 0, 'my-tasks': 0}),
    'sup2':  ('Warehouse control center', 'Kumasi Warehouse', {'orders-assign': 1, 'orders-prepare': 1, 'stock-corrections': 1, 'supply-waiting': 0, 'transfers-coming': 0, 'rice-coming': 1, 'supply-open': 0, 'my-tasks': 0}),
    'ops':   ('Operations control center', 'the whole company', {'stock-corrections': 3, 'production-approve': 2, 'supply-waiting': 0, 'supply-open': 0, 'my-tasks': 0}),
    'ops2':  ('Operations control center', 'Tamale Mill', {'stock-corrections': 0, 'production-approve': 1, 'supply-waiting': 0, 'supply-open': 0, 'my-tasks': 0}),
}

with sync_playwright() as pw:
    b = pw.chromium.launch(); reset()

    # =============== 1. The red row is gone for everyone ===============
    quick = {}
    for key in EVERYONE:
        ctx, p = U(b, key); p.goto(BASE + '/notifications'); p.wait_for_load_state('networkidle'); p.wait_for_timeout(300); quick[key] = p.get_by_text('Quick access').count(); ctx.close()
    check('the "Quick access" row is gone for every role (checked for all 16 people)', all(v == 0 for v in quick.values()), {k: v for k, v in quick.items() if v})

    # =============== 2. The green top bar: search in the centre, tools at the right edge ===============
    for width in (1440, 1366, 1280, 1100):
        ctx, p = U(b, 'sup2', viewport={'width': width, 'height': 900}); p.goto(BASE + '/notifications'); p.get_by_test_id('top-bar').wait_for(); p.wait_for_timeout(400); g = geometry(p)
        check(f'at {width}px the search field is in the true centre of the bar', abs(g['search']['c'] - g['bar']['c']) <= 2, g)
        check(f'at {width}px the bell, messages and profile are at the right edge, not next to the search', 22 <= g['bar']['r'] - g['tools']['r'] <= 26 and g['tools']['l'] > g['search']['r'] + 8, g)
        if width >= 1360: check(f'at {width}px the person\'s name is still shown beside the icons', 'Yaw Boateng' in txt(p.get_by_test_id('top-bar-tools')))
        check(f'at {width}px the search field is no longer at the left, and does not run into the tools', g['search']['l'] - g['bar']['l'] > 100 and g['search']['r'] < g['tools']['l'], g)
        ctx.close()
    ctx, p = U(b, 'sup2'); p.goto(BASE + '/notifications'); p.get_by_test_id('top-bar').wait_for()
    check('the bell, the messages icon and the person\'s name are all still in the bar', p.get_by_label('Notifications').count() == 1 and p.get_by_label('Messages').count() == 1 and 'Yaw Boateng' in txt(p.get_by_test_id('top-bar-tools')))
    inp = p.get_by_test_id('search-input'); inp.fill('track'); p.get_by_test_id('search-result').first.wait_for(); inp.press('Enter'); p.wait_for_url('**/track-dispatch')
    check('the search works from the middle of the bar: it opens the first match', '/track-dispatch' in p.url); ctx.close()
    for key, must in {'wm1': ['/dashboard', '/shipments', '/warehouse-requests', '/site-deliveries'], 'fd': ['/dashboard', '/sales', '/expenses', '/finance'], 'md': ['/dashboard', '/sales', '/finance']}.items():
        ctx, p = U(b, key); p.goto(BASE + '/notifications'); p.wait_for_load_state('networkidle'); p.wait_for_timeout(300)
        hrefs = set(p.eval_on_selector_all('a[href]', 'els => els.map(e => e.getAttribute("href"))'))
        check(f'{key}: the left menu still has its pages ({", ".join(must)})', all(m in hrefs for m in must), sorted(hrefs)[:12]); ctx.close()

    # =============== 3. Each role's control center: its own work, its own place ===============
    for key, (title, area, want) in EXPECT.items():
        ctx, p = open_cc(b, key); got = tiles(p)
        check(f'{key}: titled "{title}", for {area}', txt(p.get_by_test_id('cc-title')).strip() == title and area in txt(p.get_by_test_id('cc-jurisdiction')), (txt(p.get_by_test_id('cc-title')), txt(p.get_by_test_id('cc-jurisdiction'))))
        check(f'{key}: shows exactly its own work, with its own figures', list(got.items()) == list(want.items()), got)
        offered = set(p.eval_on_selector_all('a[href]:not([data-testid^=cc-])', 'els => els.map(e => e.getAttribute("href"))'))
        shortcuts = [c.get_attribute('href') for c in p.get_by_test_id('cc-control').all()]
        check(f'{key}: "Run your area" offers only pages that are in their menu', len(shortcuts) >= 3 and all(s in offered for s in shortcuts), (shortcuts, sorted(offered)[:10]))
        ctx.close()
    ctx, p = open_cc(b, 'wm1'); t = {x.get_attribute('data-key'): x.get_attribute('data-tone') for x in p.get_by_test_id('cc-tile').all()}
    check('work waiting is highlighted, and a zero is not', t['orders-prepare'] == 'warn' and t['trucks-coming'] == 'warn' and t['transfers-coming'] == 'plain' and t['supply-open'] == 'plain', t)
    check('the Warehouse Manager of Tamale sees nothing of Kumasi anywhere in their control center', 'Kumasi' not in txt(p.get_by_test_id('control-center'))); ctx.close()
    ctx, p = open_cc(b, 'fsup2'); check('the Farm Supervisor of one farm sees nothing of the other farm', 'Techiman' not in txt(p.get_by_test_id('control-center')) and 'Nkawkaw Farm' in txt(p.get_by_test_id('cc-jurisdiction'))); ctx.close()

    # =============== 4. The figures are live ===============
    st, r = api('/supply-requests', 'wm1', 'POST', {'warehouseId': WH1, 'lines': [{'paddyGradeId': G4, 'bagCount': 17}, {'paddyGradeId': G5, 'bagCount': 3}], 'neededBy': '2026-10-09'})
    check('Tamale asks for paddy (through the real service)', st == 200 or st == 201, (st, r))
    def fig(key): ctx, p = open_cc(b, key); t = tiles(p); ctx.close(); return t
    t = fig('sup'); check('the supervisor now has 1 request waiting for their move, 1 open, and 1 new task', (t['supply-waiting'], t['supply-open'], t['my-tasks']) == (1, 1, 1), t)
    check('the Managing Director sees it in progress, but not as theirs to move', (lambda x: (x['supply-open'], 'my-tasks' in x and x['my-tasks']))(fig('md')) == (1, 0))
    t = fig('sup2'); check('Kumasi\'s supervisor, who is not responsible for Tamale, sees none of it (and no new task)', (t['supply-waiting'], t['supply-open'], t['my-tasks']) == (0, 0, 0), t)
    api('/supply-requests/' + r['id'] + '/forward', 'sup', 'POST', {})
    t = fig('fsup'); check('once sent on, it is waiting for the Farm Supervisor, who also has the task', (t['supply-waiting'], t['supply-open'], t['my-tasks']) == (1, 1, 1), t)
    check('and no longer waiting for the supervisor', fig('sup')['supply-waiting'] == 0)
    st, tr = api('/paddy-transfers', 'sup2', 'POST', {'fromWarehouseId': WH2, 'toWarehouseId': WH1, 'lines': [{'paddyGradeId': G4, 'bags': 5}]})
    check('Kumasi sends paddy to Tamale', st in (200, 201), (st, tr))
    got = {k: fig(k)['transfers-coming'] for k in ('wm1', 'wm2', 'sup', 'sup2')}
    check('only the receiving warehouse (and the supervisor responsible for all) see it coming; the sender does not', got == {'wm1': 1, 'wm2': 0, 'sup': 1, 'sup2': 0}, got)

    # =============== 5. The server decides, not the screen ===============
    refused = {k: api('/control-center', k)[0] for k in ('sales1', 'sales2', 'fm', 'oo', 'ceo')}
    check('people whose role has no control center are refused by the server (Sales Officers, Farm Manager, Operations Officer, CEO)', set(refused.values()) == {403}, refused)
    st, a = api('/control-center', 'admin'); check('the Administrator may ask (and has their own control center on the screen)', st == 200 and a['role'] == 'ADMIN')
    api_keys = {k: [t['key'] for t in api('/control-center', k)[1]['tiles']] for k in EXPECT}
    check('the server\'s tiles are exactly what each person\'s screen showed', all(api_keys[k] == list(EXPECT[k][2].keys()) for k in EXPECT), api_keys)
    for key in ('fm', 'sales1', 'oo', 'ceo'):
        ctx, p = U(b, key); p.goto(BASE + '/dashboard'); p.wait_for_load_state('networkidle'); p.wait_for_timeout(500)
        check(f'{key}: no control center on their home page', p.get_by_test_id('control-center').count() == 0 and 'Application error' not in txt(p.locator('body'))); ctx.close()

    # =============== 6. A phone ===============
    ctx, ph = U(b, 'fd', viewport={'width': 390, 'height': 844}); ph.goto(BASE + '/dashboard'); ph.get_by_test_id('control-center').wait_for(); ph.get_by_test_id('cc-tile').first.wait_for(); ph.wait_for_timeout(400)
    check('on a phone the control center does not scroll sideways', ph.evaluate('document.documentElement.scrollWidth - window.innerWidth') <= 1, ph.evaluate('document.documentElement.scrollWidth')); ctx.close()
    check('no page threw an error anywhere', not any(pg.errors for pg in pages), [e for pg in pages for e in pg.errors][:3])
    b.close()
sys.exit(1 if finish() else 0)
