import os, re, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
FAKE_INSTALL = "() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__prompted = true; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); }"
STANDALONE = "const orig = window.matchMedia.bind(window); window.matchMedia = (q) => (String(q).includes('standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : orig(q));"

def txt(l): return l.inner_text()
pages = []
def U(b, key, **kw):
    ctx, p = as_user(b, key, **kw); pages.append(p); return ctx, p
def hrefs(p): return set(p.eval_on_selector_all('a[href]', 'els => els.map(e => e.getAttribute("href"))'))
def at(b, key, path='/notifications', **kw):
    ctx, p = U(b, key, **kw); p.goto(BASE + path); p.get_by_test_id('top-bar').wait_for(); p.wait_for_timeout(400); return ctx, p
def center(b, key, **kw):
    ctx, p = U(b, key, **kw); p.goto(BASE + '/control-center'); p.get_by_test_id('control-center').wait_for(); p.get_by_test_id('cc-tile').first.wait_for(); p.wait_for_timeout(300); return ctx, p
def tiles(p): return {t.get_attribute('data-key'): int(txt(t.get_by_test_id('cc-count')).replace(',', '')) for t in p.get_by_test_id('cc-tile').all()}
def track(b, key, **kw):
    ctx, p = U(b, key, **kw); p.goto(BASE + '/track-dispatch'); p.get_by_test_id('dispatch-tracker').wait_for(); p.get_by_test_id('journey').first.wait_for(); p.wait_for_timeout(300); return ctx, p
def card(p, ref): return p.locator(f'[data-testid=journey][data-ref="{ref}"]')
def found(p):
    out = {}
    for g in p.get_by_test_id('search-group').all(): out[g.get_attribute('data-label')] = [txt(r.locator('span').first).strip() for r in g.get_by_test_id('search-result').all()]
    return out
def notes(token): return [n['title'] for n in http('/api/notifications', token=token)[1]['data']]
def reviews(): return http('/__reviews')[1]
REF = 'DS-2026-000101'

with sync_playwright() as pw:
    b = pw.chromium.launch(); reset()

    # =============== 1. The Control center button, for everyone who has one ===============
    for key in ['md', 'ceo', 'fd', 'fsup', 'wm1', 'sup', 'ops', 'oo']:
        ctx, p = at(b, key); check(f'{key}: the menu has a Control center button', '/control-center' in hrefs(p)); ctx.close()
    for key in ['sales1', 'fm']:
        ctx, p = at(b, key); check(f'{key}: a role without one is not offered the button', '/control-center' not in hrefs(p)); ctx.close()
    ctx, p = at(b, 'fd'); p.locator('a[href="/control-center"]').first.click(); p.get_by_test_id('control-center').wait_for()
    check('clicking the button opens the control center', p.url.endswith('/control-center') and p.get_by_test_id('cc-title').count() == 1); ctx.close()
    ctx, p = center(b, 'ceo'); t = tiles(p)
    check('the CEO has a control center of their own, with what they decide', "CEO" in txt(p.get_by_test_id('cc-title')) and 'orders-release' in t, (txt(p.get_by_test_id('cc-title')), t)); ctx.close()
    ctx, p = center(b, 'oo'); t = tiles(p)
    check('an Operations Officer sees paddy on its way to THEIR mill and the finished products waiting there', t.get('mill-paddy-coming') == 2 and t.get('mill-products-ready') == 2, t); ctx.close()
    ctx, p = center(b, 'sup'); t = tiles(p)
    check('a Warehouse Supervisor sees paddy for the mill to approve, milled rice coming, and (none yet) damaged bags to review', t.get('mill-approvals') == 2 and t.get('milled-rice-coming') == 2 and t.get('receipts-review') == 0, t); ctx.close()
    ctx, p = center(b, 'ops'); t = tiles(p)
    check('the Operations Manager approves what comes back from the mill, not the paddy going out', t.get('mill-approvals') == 1 and 'milled-rice-coming' not in t, t); ctx.close()
    ctx, p = center(b, 'wm1'); t = tiles(p)
    check('a Warehouse Manager sees the milled rice coming to THEIR warehouse, and no approvals', t.get('milled-rice-coming') == 1 and 'mill-approvals' not in t, t); ctx.close()
    ctx, p = U(b, 'fm'); p.goto(BASE + '/control-center'); p.wait_for_timeout(1500)
    check('a role without a control center is told so, plainly', p.get_by_test_id('no-control-center').count() == 1 and p.get_by_test_id('cc-tile').count() == 0); ctx.close()

    # =============== 2. The Finance Director can see across the operation, and change none of it ===============
    ctx, p = at(b, 'fd'); h = hrefs(p)
    check('the Finance Director now reaches tracking, paddy requests, mill dispatch and production', all(x in h for x in ['/track-dispatch', '/warehouse-requests', '/mill-dispatch', '/production']), sorted(h))
    check('...and still has his own pages', all(x in h for x in ['/finance', '/expenses', '/sales']), sorted(h))
    check('...but is not handed the working pages of other people', not any(x in h for x in ['/log-paddy-intake', '/dispatch-quick', '/paddy-entries', '/stock-correction']), sorted(h)); ctx.close()
    ctx, p = track(b, 'fd')
    check('on Track dispatch he can follow every truck, and cannot count one in or decide on damaged bags', p.get_by_test_id('journey').count() >= 4 and p.get_by_test_id('act-confirm').count() == 0 and p.get_by_test_id('review-actions').count() == 0); ctx.close()

    # =============== 3. The mill ===============
    for key in ['oo', 'sup', 'wm1']:
        ctx, p = U(b, key); p.goto(BASE + '/mill-dispatch'); p.get_by_test_id('mill-steps').wait_for()
        check(f'{key}: the Mill dispatch page opens with the five-step guide', 'Ask for paddy' in txt(p.get_by_test_id('mill-steps')) and 'Send it back' in txt(p.get_by_test_id('mill-steps'))); ctx.close()

    # =============== 4. The install pop-up ===============
    ctx, p = U(b, 'md', install_popup=True); p.goto(BASE + '/dashboard'); p.get_by_test_id('install-dialog').wait_for(timeout=7000)
    d = p.get_by_test_id('install-dialog')
    check('after sign-in a pop-up offers to put the app on the device', d.is_visible() and d.get_attribute('role') == 'dialog' and d.get_attribute('aria-modal') == 'true')
    check('where the browser gives no install button it shows the exact steps for this device', d.get_attribute('data-platform') == 'desktop-chromium' and p.get_by_test_id('install-instructions').count() == 1 and p.get_by_test_id('install-now').count() == 0, txt(d)[:120])
    p.keyboard.press('Escape'); p.wait_for_timeout(200); check('Escape closes it', p.get_by_test_id('install-dialog').count() == 0); ctx.close()

    ctx, p = U(b, 'md', install_popup=True); p.goto(BASE + '/dashboard'); p.evaluate(FAKE_INSTALL); p.get_by_test_id('install-now').wait_for(timeout=7000)
    check('when the browser offers a real install, there is one big "Install now" button', 'Install now' in txt(p.get_by_test_id('install-now')) and p.get_by_test_id('install-instructions').count() == 0)
    p.get_by_test_id('install-now').click(); p.wait_for_timeout(500)
    check('pressing it starts the browser\'s own install, closes the pop-up, and remembers the app is installed', p.evaluate('window.__prompted') is True and p.get_by_test_id('install-dialog').count() == 0 and p.evaluate("localStorage.getItem('kam_roms_installed')") == '1'); ctx.close()

    ctx, p = U(b, 'md', install_popup=True); p.goto(BASE + '/dashboard'); p.get_by_test_id('install-dialog').wait_for(timeout=7000); p.get_by_test_id('install-not-now').click()
    p.goto(BASE + '/notifications'); p.wait_for_timeout(3500)
    check('"Not now" keeps it away for the rest of this sign-in, even after the page is reloaded', p.get_by_test_id('install-dialog').count() == 0)
    p2 = ctx.new_page(); pages.append(p2); p2.goto(BASE + '/dashboard'); p2.get_by_test_id('install-dialog').wait_for(timeout=7000)
    check('...but it is offered again at the next sign-in (a fresh session)', p2.get_by_test_id('install-dialog').is_visible()); p2.get_by_test_id('install-snooze').click(); p2.wait_for_timeout(200)
    p3 = ctx.new_page(); pages.append(p3); p3.goto(BASE + '/dashboard'); p3.wait_for_timeout(3800)
    check('"Don\'t ask for 30 days" keeps it away from every later sign-in', p3.get_by_test_id('install-dialog').count() == 0); ctx.close()

    ctx, p = U(b, 'md', install_popup=True, user_agent=IOS_UA, viewport={'width': 390, 'height': 844}); p.goto(BASE + '/dashboard'); p.get_by_test_id('install-dialog').wait_for(timeout=7000)
    check('on an iPhone, which has no install button, it shows the Share and "Add to Home Screen" steps', p.get_by_test_id('install-dialog').get_attribute('data-platform') == 'ios-safari' and 'Add to Home Screen' in txt(p.get_by_test_id('install-instructions')) and 'Share' in txt(p.get_by_test_id('install-instructions'))); ctx.close()
    ctx, p = U(b, 'md', install_popup=True); ctx.add_init_script(STANDALONE); p.goto(BASE + '/dashboard'); p.wait_for_timeout(3800)
    check('once the app is installed (opened as an app) it never asks again', p.get_by_test_id('install-dialog').count() == 0); ctx.close()
    ctx, p = U(b, 'md', install_popup=True); p.goto(BASE + '/login'); p.wait_for_timeout(3500)
    check('it does not interrupt the sign-in page', p.get_by_test_id('install-dialog').count() == 0); ctx.close()

    # =============== 5. Search: quick parts first, nothing blanked, and plain words when something is slow ===============
    reset(); http('/__search_mode', 'POST', body={'delay': 1500, 'fail': False})
    ctx, p = at(b, 'md'); box = p.get_by_test_id('search-input'); box.fill('tamale'); p.locator('[data-testid=search-result]').first.wait_for(timeout=3000)
    check('the quick kinds appear at once, while the slower dispatches are still being looked up (and it says so)', 'Warehouses' in found(p) and 'Dispatches' not in found(p) and p.get_by_test_id('search-more').count() == 1, found(p))
    p.wait_for_timeout(2300)
    check('...then the dispatches follow, and the "still looking" line goes away', 'Dispatches' in found(p) and p.get_by_test_id('search-more').count() == 0, found(p))
    box.fill('tama'); seen = []
    for _ in range(16): seen.append(p.get_by_test_id('search-result').count()); p.wait_for_timeout(100)
    check('while the next letters are searched the list never goes blank', min(seen) > 0, seen); ctx.close()
    reset(); http('/__search_mode', 'POST', body={'delay': 0, 'fail': True})
    ctx, p = at(b, 'md'); p.get_by_test_id('search-input').fill('tamale'); p.get_by_test_id('search-gap').wait_for(timeout=6000)
    check('a part that fails is named in words, and the results that did arrive stay on screen', 'Dispatches' in txt(p.get_by_test_id('search-gap')) and 'Warehouses' in found(p), (txt(p.get_by_test_id('search-gap')), found(p)))
    http('/__search_mode', 'POST', body={'delay': 0, 'fail': False}); p.get_by_test_id('search-input').fill('tamale '); p.locator('[data-testid=search-group][data-label=Dispatches]').wait_for(timeout=6000)
    check('trying again once it recovers brings the dispatches back (a gap is never remembered)', 'Dispatches' in found(p) and p.get_by_test_id('search-gap').count() == 0); ctx.close()
    reset(); ctx, p = at(b, 'md'); http('/__me_delay', 'POST', body={'ms': 1200})
    p.get_by_test_id('search-input').fill('adom'); p.get_by_test_id('search-result').first.wait_for(); p.get_by_test_id('search-result').first.click()
    menu_gone = bar_gone = 0
    for _ in range(40):
        menu_gone += 0 if p.locator('a[href="/dashboard"]').count() else 1; bar_gone += 0 if p.get_by_test_id('search-input').count() else 1; p.wait_for_timeout(30)
    # Before the fix the whole screen (menu and top bar) was blank for as long as the user details took to load (here 1.2 s, about 40 samples). The top bar may be missing for the single
    # moment the new page replaces the old one; the menu never is.
    check('jumping to a result never blanks the screen: the menu stays and the top bar stays while the page loads', menu_gone == 0 and bar_gone <= 2, (menu_gone, bar_gone)); http('/__me_delay', 'POST', body={'ms': 0}); ctx.close()

    # =============== 6. Damaged bags: reported, held, decided, and visible to everyone along the way ===============
    reset(); ctx, w = track(b, 'wm1'); a = card(w, REF); a.get_by_test_id('act-confirm').click(); a.get_by_test_id('confirm-form').wait_for()
    check('counting a truck in now asks how many of the arrived bags are spoiled or broken', a.get_by_test_id('damage-block').is_visible())
    w.get_by_label('Spoiled or broken bags of Size 4').fill('2'); a.get_by_test_id('confirm-submit').click(); w.wait_for_timeout(400)
    check('damaged bags without a comment are refused on the spot, and nothing is sent', w.get_by_test_id('track-error').count() == 1 and 'Say what is wrong' in txt(w.get_by_test_id('track-error')) and last_call('/receive') is None, w.get_by_test_id('track-error').count())
    a.get_by_test_id('damage-note').fill('Wet and torn'); a.get_by_test_id('confirm-submit').click(); a.get_by_test_id('review-panel').wait_for()
    sent = last_call(f'/shipments/dispatch/{REF}/receive')
    check('the report goes with the count: the damaged bags for that size, and the comment', sent and sent['body']['damageNote'] == 'Wet and torn' and [l['damagedBags'] for l in sent['body']['lines'] if l.get('damagedBags')] == [2], sent)
    pn = a.get_by_test_id('review-panel'); rv = reviews()
    check('the truck is counted in, and the report shows on it: waiting for the Warehouse Supervisor', a.get_attribute('data-status') == 'DELIVERED' and pn.get_attribute('data-status') == 'PENDING' and 'waiting for the Warehouse Supervisor' in txt(pn.get_by_test_id('review-head')), txt(pn))
    check('it says what, how many, who reported it and what they wrote, and how long it has waited', 'Size 4: 2 spoiled or broken of the 17' in txt(pn) and 'Wet and torn' in txt(pn.get_by_test_id('review-reported')) and 'Waiting' in txt(pn.get_by_test_id('review-waiting')), txt(pn))
    check('the damaged bags are held out of the stock (15 good bags credited, 2 held), and one review is open', len(rv['reviews']) == 1 and rv['reviews'][0]['status'] == 'PENDING' and {'op': 'hold', 'bags': 2, 'credited': 15} in rv['ledger'], rv)
    check('the reporter cannot approve their own report', pn.get_by_test_id('review-actions').count() == 0)
    check('a "Needs review" filter appears, with the count', w.get_by_test_id('filter-review').count() == 1 and '(1)' in txt(w.get_by_test_id('filter-review')))
    check('the Warehouse Supervisor is told, and the notification opens that truck', any('Damaged bags to review' in n and REF in n for n in notes('tok-sup'))); ctx.close()
    ctx, m = track(b, 'md'); check('the Managing Director sees the same report, with no buttons to decide', card(m, REF).get_by_test_id('review-panel').count() == 1 and card(m, REF).get_by_test_id('review-actions').count() == 0); ctx.close()
    ctx, s2 = track(b, 'sup2'); check('a Warehouse Supervisor of another place sees it but cannot decide it', card(s2, REF).get_by_test_id('review-panel').count() == 1 and card(s2, REF).get_by_test_id('review-actions').count() == 0); ctx.close()
    ctx, s = track(b, 'sup'); s.get_by_test_id('filter-review').click(); s.wait_for_timeout(300)
    check('the Needs review filter leaves only that truck', s.get_by_test_id('journey').count() == 1 and card(s, REF).count() == 1)
    pn = card(s, REF).get_by_test_id('review-panel')
    check('the supervisor of that warehouse is offered Approve and Refuse, and cannot refuse without saying why', pn.get_by_test_id('review-approve').is_enabled() and pn.get_by_test_id('review-reject').is_disabled())
    pn.get_by_test_id('review-comment').fill('They look fine to me'); pn.get_by_test_id('review-reject').click(); s.wait_for_timeout(700)
    pn = card(s, REF).get_by_test_id('review-panel') if card(s, REF).count() else s.get_by_test_id('review-panel').first
    s.get_by_test_id('filter-all').click(); s.wait_for_timeout(300); pn = card(s, REF).get_by_test_id('review-panel'); rv = reviews()
    check('refusing is recorded with who decided and why, and the bags return to the stock', pn.get_attribute('data-status') == 'REJECTED' and 'refused' in txt(pn.get_by_test_id('review-head')) and 'They look fine to me' in txt(pn.get_by_test_id('review-decision')), txt(pn))
    check('the held bags went back into the warehouse stock', any(e.get('op') == 'adjust' and e.get('where') == 'WAREHOUSE' and e['bags'] == 2 for e in rv['ledger']) and any(e.get('op') == 'adjust' and e.get('hold') and e['bags'] == -2 for e in rv['ledger']), rv['ledger'])
    check('the Warehouse Manager who reported it is told what was decided', any('refused' in n and REF in n for n in notes('tok-wm1'))); ctx.close()

    reset(); trk = http('/__trk')[1]; sid = {s['id']: s['paddyGradeId'] for s in trk['shipments']}
    code, body = http(f'/api/shipments/dispatch/{REF}/receive', 'POST', 'tok-wm1', {'lines': [{'paddyGradeId': sid['trk-sA4'], 'receivedBags': 17, 'damagedBags': 3}, {'paddyGradeId': sid['trk-sA5'], 'receivedBags': 3}], 'damageNote': 'Soaked in the rain'})
    check('a whole truck can be counted in with damaged bags through the API too', code == 200 and len(reviews()['reviews']) == 1, (code, body))
    ctx, s = track(b, 'sup'); s.get_by_test_id('filter-review').click(); pn = card(s, REF).get_by_test_id('review-panel')
    pn.get_by_test_id('review-comment').fill('Confirmed on site'); pn.get_by_test_id('review-approve').click(); s.wait_for_timeout(700); s.get_by_test_id('filter-all').click(); s.wait_for_timeout(300)
    pn = card(s, REF).get_by_test_id('review-panel'); rv = reviews()
    check('approving writes the damaged bags off as a loss, and the report says so', pn.get_attribute('data-status') == 'APPROVED' and 'written off' in txt(pn.get_by_test_id('review-decision')) and any(e.get('op') == 'txn' and e['type'] == 'STOCK_LOSS' and e['bags'] == 3 for e in rv['ledger']), (txt(pn), rv['ledger'])); ctx.close()
    code, body = http(f"/api/receipt-reviews/{reviews()['reviews'][0]['id']}/approve", 'POST', 'tok-sup', {'note': 'again'})
    check('a decision is made once', code == 400 and 'already approved' in json.dumps(body), (code, body))
    reset()
    code, body = http(f'/api/shipments/dispatch/{REF}/receive', 'POST', 'tok-wm1', {'lines': [{'paddyGradeId': sid['trk-sA4'], 'receivedBags': 17, 'damagedBags': 99}, {'paddyGradeId': sid['trk-sA5'], 'receivedBags': 3}], 'damageNote': 'Wet'})
    check('more damaged bags than arrived is refused, and nothing is counted in', code == 400 and len(reviews()['reviews']) == 0, (code, body))
    code, body = http(f'/api/shipments/dispatch/{REF}/receive', 'POST', 'tok-wm1', {'lines': [{'paddyGradeId': sid['trk-sA4'], 'receivedBags': 17, 'damagedBags': 2}, {'paddyGradeId': sid['trk-sA5'], 'receivedBags': 3}]})
    check('damaged bags with no comment are refused by the server too', code == 400 and len(reviews()['reviews']) == 0, (code, body))
    http(f'/api/shipments/dispatch/{REF}/receive', 'POST', 'tok-wm1', {'lines': [{'paddyGradeId': sid['trk-sA4'], 'receivedBags': 17, 'damagedBags': 3}, {'paddyGradeId': sid['trk-sA5'], 'receivedBags': 3}], 'damageNote': 'Soaked'})
    code, body = http(f"/api/receipt-reviews/{reviews()['reviews'][0]['id']}/approve", 'POST', 'tok-wm1', {})
    check('a Warehouse Manager cannot approve damaged bags (not even their own report)', code == 403, (code, body)); reset()

    # =============== 7. Who can use what ===============
    ctx, a = at(b, 'admin', '/settings'); a.get_by_test_id('fa-table').wait_for(); roles = [r.get_attribute('data-role') for r in a.get_by_test_id('fa-role').all()]
    check('System settings has a "Who can use what" table, with a column for each role but the Administrator', 'FARM_MANAGER' in roles and 'MD' in roles and 'ADMIN' not in roles, roles)
    cell = a.locator('[data-testid=fa-cell][data-role=FARM_MANAGER][data-feature=track-dispatch]')
    check('a Farm Manager has Track dispatch by default; a role never given it shows a dash, not a box', cell.is_checked() and a.locator('[data-testid=fa-cell][data-role=SALES_OFFICER][data-feature=track-dispatch]').count() == 0)
    check('Save is not available until something is changed', a.get_by_test_id('fa-save').is_disabled())
    cell.uncheck(); check('changing a box makes Save available, and says for how many roles', a.get_by_test_id('fa-save').is_enabled() and '1 role' in txt(a.get_by_test_id('fa-save')))
    a.get_by_test_id('fa-save').click(); a.get_by_test_id('fa-notice').wait_for(); sent = last_call('/access/features/FARM_MANAGER')
    check('saving sends that role\'s list, and confirms', sent and sent['body'] == {'denied': ['track-dispatch']} and 'Saved' in txt(a.get_by_test_id('fa-notice')), sent)
    a.reload(); a.get_by_test_id('fa-table').wait_for(); check('it is still switched off after the page is reloaded', not a.locator('[data-testid=fa-cell][data-role=FARM_MANAGER][data-feature=track-dispatch]').is_checked()); ctx.close()
    ctx, p = at(b, 'fm'); check('the Farm Manager no longer sees Track dispatch in the menu', '/track-dispatch' not in hrefs(p)); ctx.close()
    me = http('/api/auth/me', token='tok-fm')[1]['data']
    check('the server no longer lists that permission for them', 'dispatch.track' not in me['permissions'] and 'paddy.create' in me['permissions'], me['permissions'])
    ctx, p = at(b, 'wm1'); check('other roles keep it', '/track-dispatch' in hrefs(p)); ctx.close()
    code, body = http('/api/access/features/MD', 'PUT', 'tok-admin', {'denied': ['quick-search', 'control-center']})
    check('the Administrator can switch off the search box and the control center for a role', code == 200, (code, body))
    ctx, p = at(b, 'md'); p.goto(BASE + '/dashboard'); p.wait_for_timeout(1200)
    check('for that role the search box is gone and so is the control center (menu and dashboard)', not p.get_by_test_id('search-input').is_visible() and '/control-center' not in hrefs(p) and p.get_by_test_id('control-center').count() == 0); ctx.close()
    code, body = http('/api/control-center', token='tok-md'); check('...and the server refuses it too', code == 403 and 'turned the control center off' in json.dumps(body), (code, body))
    code, body = http('/api/search?q=adom', token='tok-md'); check('...and search returns nothing for them', code == 200 and body['data']['groups'] == [], (code, body))
    ctx, p = center(b, 'ceo'); check('a different role is not affected', p.get_by_test_id('cc-tile').count() > 0 and p.get_by_test_id('search-input').is_visible()); ctx.close()
    check('the Administrator\'s own access cannot be switched off', http('/api/access/features/ADMIN', 'PUT', 'tok-admin', {'denied': ['trace']})[0] == 400)
    check('only features that can be switched off are accepted', http('/api/access/features/MD', 'PUT', 'tok-admin', {'denied': ['sales-approval']})[0] == 400)
    http('/api/access/features/MD', 'PUT', 'tok-admin', {'denied': []}); http('/api/access/features/FARM_MANAGER', 'PUT', 'tok-admin', {'denied': []})
    ctx, p = at(b, 'md'); check('switching them back on restores them', '/control-center' in hrefs(p) and p.get_by_test_id('search-input').is_visible()); ctx.close()
    ctx, p = at(b, 'fm'); check('...for the Farm Manager too', '/track-dispatch' in hrefs(p)); ctx.close()

    errs = [e for pg in pages for e in getattr(pg, 'errors', [])]
    check('no page threw a script error', not errs, errs[:3])
    n = finish(); b.close(); sys.exit(1 if n else 0)
