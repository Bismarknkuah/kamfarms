import os, re, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

G4 = '44444444-4444-4444-8444-444444444444'; G5 = '55555555-5555-4555-8555-555555555555'
A, B, C, R = 'DS-2026-000101', 'DS-2026-000102', 'DS-2026-000103', 'RQ-2026-009105'
def txt(l): return l.inner_text()
def api(path, key, method='GET', body=None):
    st, r = http('/api' + path, method, 'tok-' + key, body); return st, (r.get('data') if isinstance(r, dict) and 'data' in r else r)
pages = []
def U(b, key, **kw):
    ctx, p = as_user(b, key, **kw); pages.append(p); return ctx, p
def open_tracker(b, key, **kw):
    ctx, p = U(b, key, **kw); p.goto(BASE + '/track-dispatch'); p.get_by_test_id('dispatch-tracker').wait_for(); p.get_by_test_id('journey').first.wait_for(); p.wait_for_timeout(300); return ctx, p
def farm_refs(p): return sorted(c.get_attribute('data-ref') for c in p.locator('[data-testid=journey][data-kind=FARM_DISPATCH]').all())
def card(p, ref): return p.locator(f'[data-testid=journey][data-ref="{ref}"]')

TRACK = {'fm': True, 'wm1': True, 'wm2': True, 'sup': True, 'sup2': True, 'fsup': True, 'fsup2': True, 'md': True, 'ceo': True, 'sales1': False, 'sales2': False, 'fd': True, 'ops': False, 'ops2': False, 'oo': False}
TRACE = {'fd': True, 'md': True, 'ceo': True, 'sales1': True, 'sales2': True, 'sup': True, 'sup2': True, 'admin': True, 'wm1': False, 'wm2': False, 'fm': False, 'fsup': False, 'fsup2': False, 'ops': False, 'ops2': False, 'oo': False}
ALL4 = sorted([A, B, C, R])
VIS = {'fm': sorted([A, C]), 'wm1': sorted([A, R]), 'wm2': sorted([B, C]), 'sup': ALL4, 'sup2': ALL4, 'fsup': ALL4, 'fsup2': ALL4, 'md': ALL4, 'ceo': ALL4}

with sync_playwright() as pw:
    b = pw.chromium.launch(); reset()

    # =============== 1. Who is offered Track dispatch, and who is offered Trace batch ===============
    seen_t, seen_r = {}, {}
    for key in sorted(set(TRACK) | set(TRACE)):
        ctx, p = U(b, key); p.goto(BASE + '/notifications'); p.wait_for_load_state('networkidle'); p.wait_for_timeout(300)
        seen_t[key] = p.locator('a[href="/track-dispatch"]').count() > 0; seen_r[key] = p.locator('a[href="/trace"]').count() > 0; ctx.close()
    check('Track dispatch is offered to farm managers, warehouse managers, the supervisors, the Farm Supervisor, MD, CEO and (to follow, read only) the Finance Director, and to no one else', all(seen_t[k] == v for k, v in TRACK.items()), {k: seen_t[k] for k in TRACK if seen_t[k] != TRACK[k]})
    check('Trace batch is offered ONLY to the Finance Director, MD, CEO, Sales Officers and Warehouse Supervisors (and the Administrator\'s own menu)', all(seen_r[k] == v for k, v in TRACE.items()), {k: seen_r[k] for k in TRACE if seen_r[k] != TRACE[k]})

    # =============== 2. Each role tracks only what is theirs ===============
    VIS['fd'] = VIS['md']   # the Finance Director follows everything, as the MD does (read only)
    for key, want in VIS.items():
        ctx, p = open_tracker(b, key); got = farm_refs(p)
        check(f'{key}: tracks exactly {want}', got == want, got); ctx.close()
    ctx, p = open_tracker(b, 'fm'); check('a Farm Manager sees nothing of another farm (not even its name)', 'Techiman' not in txt(p.get_by_test_id('dispatch-tracker'))); ctx.close()
    ctx, p = open_tracker(b, 'wm2'); check('a Warehouse Manager tracks what is coming to their warehouse and what leaves it (the three rice transfers to and from Kumasi), and no truck for Tamale', len(p.locator('[data-kind=RICE_TRANSFER]').all()) == 3 and A not in farm_refs(p)); ctx.close()

    # =============== 3. Where each dispatch is, and the time it was supposed to arrive ===============
    ctx, p = open_tracker(b, 'md'); a, bb, c, r = card(p, A), card(p, B), card(p, C), card(p, R)
    check('A: one truck, both sizes on one card, still IN TRANSIT, and it says how overdue it is', a.get_attribute('data-status') == 'IN_TRANSIT' and 'Size 4: 17' in txt(a.get_by_test_id('journey-sizes')) and 'Size 5: 3' in txt(a.get_by_test_id('journey-sizes')) and 'Overdue by' in txt(a.get_by_test_id('journey-late')), txt(a))
    check('B: DELIVERED on time (and does not say it was late)', bb.get_attribute('data-status') == 'DELIVERED' and bb.get_by_test_id('journey-ontime').count() == 1 and bb.get_by_test_id('journey-late').count() == 0, txt(bb))
    check('C: DELIVERED, but late, and it says by how long', c.get_attribute('data-status') == 'DELIVERED' and 'Late by' in txt(c.get_by_test_id('journey-late')) and 'days' in txt(c.get_by_test_id('journey-late')), txt(c))
    check('R: asked for, not loaded yet', 'Requested: not loaded yet' in txt(r.get_by_test_id('journey-status')))
    check('every dispatch says the day it was supposed to arrive by', all('Supposed to arrive by' in txt(x.get_by_test_id('journey-times')) for x in (a, bb, c, r)))
    check('a dispatch still on the way says who it is waiting for: the Warehouse Manager for the truck, the Farm Manager for the request', 'Warehouse Manager' in txt(a.get_by_test_id('journey-holding')) and 'Farm Manager' in txt(r.get_by_test_id('journey-holding')))

    # =============== 4. What the Managing Director sees: every step, who, when, and who delayed ===============
    c.get_by_test_id('act-steps').click(); steps = [s.get_attribute('data-key') for s in c.get_by_test_id('journey-step').all()]; text = txt(c.get_by_test_id('journey-steps'))
    check('every step of the journey is listed, in order', steps == ['requested', 'loaded', 'approved', 'departed', 'delivered'], steps)
    check('each step names who did it', all(n in text for n in ('Efua Mensah', 'Yaa Owusu', 'Kofi Mensah', 'Abena Gyasi')), text)
    check('and how long it waited after the step before (the approval sat for 3 days 8 hours)', '3 days 8 hours after the step before' in text, text)
    sl = txt(c.get_by_test_id('journey-slowest'))
    check('the longest wait is named, with who held it: the approval, the Farm Supervisor', 'Approved' in sl and 'Efua Mensah' in sl and '3 days 8 hours' in sl, sl)
    a.get_by_test_id('act-steps').click()
    check('a truck still on the road shows the step it is stuck on, and how long it has waited so far', 'Waiting now' in txt(a.get_by_test_id('journey-steps')) and a.locator('[data-testid=journey-step][data-state=current]').get_attribute('data-key') == 'delivered')

    # =============== 5. Narrowing it down ===============
    chips = {k: txt(p.get_by_test_id(f'filter-{k}')).strip() for k in ('all', 'open', 'delivered', 'late')}
    check('the counts say what is on the way, delivered and late', chips == {'all': 'All (7)', 'open': 'On the way (4)', 'delivered': 'Delivered (3)', 'late': 'Late (2)'}, chips)
    p.get_by_test_id('filter-late').click(); p.wait_for_timeout(200); check('"Late" shows the overdue truck and the late delivery, nothing else', sorted(x.get_attribute('data-ref') for x in p.get_by_test_id('journey').all()) == sorted([A, C]))
    p.get_by_test_id('filter-all').click(); p.get_by_test_id('track-search').fill('techiman'); p.wait_for_timeout(200)
    check('searching by farm finds that farm\'s dispatches', sorted(x.get_attribute('data-ref') for x in p.get_by_test_id('journey').all()) == sorted([B, R]))
    p.get_by_test_id('track-search').fill('zzzz'); p.wait_for_timeout(200); check('and says plainly when nothing matches', 'No dispatch matches' in txt(p.get_by_test_id('track-empty'))); ctx.close()

    # =============== 6. The warehouse manager confirms the truck has arrived ===============
    who = {}
    for key in ('wm1', 'sup', 'md', 'fm'):
        ctx, p = open_tracker(b, key); who[key] = card(p, A).get_by_test_id('act-confirm').count(); ctx.close()
    check('only the Warehouse Manager of the warehouse the truck is going to is offered "Truck received"', who == {'wm1': 1, 'sup': 0, 'md': 0, 'fm': 0}, who)
    st, _ = api('/shipments/dispatch/' + A + '/receive', 'wm2', 'POST', {'lines': [{'paddyGradeId': G4, 'receivedBags': 17}, {'paddyGradeId': G5, 'receivedBags': 3}]})
    check('another warehouse\'s manager cannot count it in (refused by the server), and nothing changed', st == 403 and all(s['receivedAt'] is None for s in http('/__trk')[1]['shipments'] if s['id'] in ('trk-sA4', 'trk-sA5')), st)
    ctx, p = open_tracker(b, 'wm1'); a = card(p, A); a.get_by_test_id('act-confirm').click(); cf = a.get_by_test_id('confirm-form'); cf.wait_for(); cf.get_by_label('Arrived bags of Size 4').wait_for(); p.wait_for_timeout(400)
    check('the count starts at what was sent, with a big plus and minus for each size', cf.get_by_label('Arrived bags of Size 4').input_value() == '17' and cf.get_by_label('Arrived bags of Size 5').input_value() == '3' and 'sent: 17' in txt(cf))
    cf.get_by_label('Arrived bags of Size 4').fill('16'); cf.get_by_test_id('confirm-note').fill('One bag torn'); cf.get_by_test_id('confirm-submit').click(); p.get_by_test_id('track-notice').wait_for(); p.wait_for_timeout(500)
    notice = txt(p.get_by_test_id('track-notice'))
    check('one confirmation counts in the whole truck, and says it is now delivered, with the bag that was short', 'Delivered' in notice and '1 short' in notice, notice)
    a = card(p, A)
    check('the dispatch changes from "In transit" to "Delivered"', a.get_attribute('data-status') == 'DELIVERED' and 'Delivered' in txt(a.get_by_test_id('journey-status')) and a.get_by_test_id('act-confirm').count() == 0)
    trk = {s['id']: s for s in http('/__trk')[1]['shipments']}
    check('every size was counted in by the warehouse manager, with the bags that arrived', (trk['trk-sA4']['receivedBags'], trk['trk-sA5']['receivedBags'], trk['trk-sA4']['receivedById'], trk['trk-sA5']['receivedById']) == (16, 3, 'u-wm1', 'u-wm1') and trk['trk-sA4']['receivedAt'] and trk['trk-sA5']['receivedAt'], trk['trk-sA4'])
    a.get_by_test_id('act-steps').click(); last = a.locator('[data-testid=journey-step][data-key=delivered]')
    check('the last step now shows who counted it in and the shortage', last.get_attribute('data-state') == 'done' and 'Kwabena Adjei' in txt(last) and '1 bag short' in txt(last), txt(last))
    check('it also says how late it was, since it arrived after its day', 'Late by' in txt(a.get_by_test_id('journey-late'))); ctx.close()
    ctx, p = open_tracker(b, 'md'); check('the Managing Director sees it as delivered too', card(p, A).get_attribute('data-status') == 'DELIVERED'); ctx.close()
    st, r2 = api('/shipments/dispatch/' + A + '/receive', 'wm1', 'POST', {'lines': [{'paddyGradeId': G4, 'receivedBags': 17}, {'paddyGradeId': G5, 'receivedBags': 3}]})
    check('counting it in a second time is refused', st == 400 and 'already been counted in' in str(r2), (st, r2))

    # =============== 7. A phone ===============
    ctx, ph = open_tracker(b, 'fm', viewport={'width': 390, 'height': 844}); ph.get_by_test_id('journey').first.get_by_test_id('act-steps').click(); ph.wait_for_timeout(300)
    check('on a phone the tracker does not scroll sideways', ph.evaluate('document.documentElement.scrollWidth - window.innerWidth') <= 1, ph.evaluate('document.documentElement.scrollWidth')); ctx.close()
    check('no page threw an error anywhere', not any(pg.errors for pg in pages), [e for pg in pages for e in pg.errors][:3])
    b.close()
sys.exit(1 if finish() else 0)
