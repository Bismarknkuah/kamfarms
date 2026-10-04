import os, re, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

FARM = '33333333-3333-4333-8333-333333333333'; WH1 = '11111111-1111-4111-8111-111111111111'; G4 = '44444444-4444-4444-8444-444444444444'
def sc(p, num): return p.locator(f'[data-testid=supply-card][data-number="{num}"]')
def sec(p, tid): return p.get_by_test_id(tid)
def txt(l): return l.inner_text()
def sent_number(p): return txt(p.get_by_test_id('supply-sent-number')).strip()
def ask(p, s4=0, s5=0, when='Tomorrow'):
    p.get_by_test_id('open-supply-form').click(); f = p.get_by_test_id('supply-form'); f.wait_for()
    if s4: f.get_by_label('Bags of Size 4').fill(str(s4))
    if s5: f.get_by_label('Bags of Size 5').fill(str(s5))
    f.get_by_role('button', name=when).click(); p.get_by_test_id('supply-send').click(); p.get_by_test_id('supply-sent').wait_for(); return sent_number(p)

with sync_playwright() as pw:
    b = pw.chromium.launch(); reset()

    # =============== 1. A warehouse asks for paddy: Size 4 and Size 5 are already there ===============
    ctx, w = as_user(b, 'wm1'); w.goto(BASE + '/warehouse-requests'); w.get_by_test_id('supply-desk').wait_for()
    w.get_by_test_id('open-supply-form').click(); f = w.get_by_test_id('supply-form'); f.wait_for(); f.get_by_test_id('supply-target-fixed').wait_for()
    check('BOTH sizes are already on the form, with a big minus, a number and a plus', f.get_by_test_id('size-row').count() == 2 and [r.get_attribute('data-size') for r in f.get_by_test_id('size-row').all()] == ['Size 4', 'Size 5'])
    check('their own warehouse is already chosen: there is no list to pick from', 'Tamale Warehouse' in txt(f.get_by_test_id('supply-target-fixed')) and f.get_by_test_id('kind-mill').count() == 0)
    w.get_by_test_id('supply-send').click(); w.wait_for_timeout(300)
    check('an empty request is never met with silence', 'Put the bags you need on Size 4 or Size 5' in txt(w.get_by_test_id('supply-problems')) and not [c for c in calls() if c['path'].endswith('/supply-requests') and c['method'] == 'POST'])
    f.get_by_label('Bags of Size 4').fill('17')
    for _ in range(3): f.get_by_label('One more bag of Size 5').click()
    check('the plus button counts, and the total adds up', f.get_by_label('Bags of Size 5').input_value() == '3' and 'Total: 20 bags' in txt(f.get_by_test_id('size-total')))
    f.get_by_role('button', name='Tomorrow').click(); w.get_by_test_id('supply-send').click(); w.get_by_test_id('supply-sent').wait_for(); NUM = sent_number(w); w.wait_for_timeout(500)
    check('it says it was sent, and who has it: the Warehouse Supervisor', re.match(r'SR-2026-\d{6}$', NUM) and 'With the Warehouse Supervisor' in txt(w.get_by_test_id('supply-sent')), txt(w.get_by_test_id('supply-sent')))
    row = http('/__supply')[1][0]
    check('on the server: one request, both sizes, waiting for the supervisor', row['kind'] == 'WAREHOUSE' and row['status'] == 'SUBMITTED' and [l['bags'] for l in row['lines']] == [17, 3] and row['warehouseId'] == WH1, row)
    check('the card is on their desk, with no buttons that are not theirs', 'With the Warehouse Supervisor' in txt(sc(w, NUM).get_by_test_id('supply-stage')) and sc(w, NUM).get_by_test_id('act-forward').count() == 0 and sc(w, NUM).get_by_test_id('act-choose-farm').count() == 0)
    check('no page errors for the warehouse', not w.errors, w.errors[:2]); ctx.close()

    # =============== 2. The Warehouse Supervisor sends it on, in one tap ===============
    ctx, s = as_user(b, 'sup'); s.goto(BASE + '/warehouse-requests'); c = sc(sec(s, 'supply-needs-action'), NUM); c.wait_for()
    check('it is under "Your move" with one big button, in few words', 'Your move' in txt(sec(s, 'supply-needs-action')) and c.get_by_test_id('act-forward').inner_text().strip() == 'Send to the Farm Director' and c.get_by_test_id('act-decline').inner_text().strip() == 'Not possible')
    c.get_by_test_id('act-forward').click(); s.get_by_test_id('supply-notice').wait_for(); s.wait_for_timeout(400)
    check('the supervisor is told it went on, and it is now with the Farm Director', 'Sent on to the Farm Director.' in txt(s.get_by_test_id('supply-notice')) and 'With the Farm Director' in txt(sc(sec(s, 'supply-progress'), NUM).get_by_test_id('supply-stage')))
    tasks = [t for t in http('/__tasks')[1] if t.get('supplyRequestNumber') == NUM]; notes = [n for n in http('/__notes')[1] if n.get('entityId') == NUM]
    check('the supervisor\'s task is done and the Farm Director has a SHORT one with no long description', any(t['assignedToId'] == 'u-sup' and t['status'] == 'COMPLETED' for t in tasks) and any(t['assignedToId'] == 'u-fsup' and t['status'] == 'TODO' and t['title'] == 'Tamale Warehouse needs paddy' and not t.get('description') for t in tasks), tasks)
    check('and the notification carries just the sizes and the day, and points to the request', any('u-fsup' in n['userIds'] and n['body'].startswith('Size 4: 17, Size 5: 3 · by ') for n in notes), notes)
    ctx.close()

    # =============== 3. The Farm Director opens the task, sees the farms' stock, and chooses ===============
    ctx, d = as_user(b, 'fsup'); d.goto(BASE + '/tasks'); d.get_by_test_id('open-task').first.wait_for()
    check('the task has a title and ONE big button that opens the work: no paragraph to read', d.get_by_test_id('task-description').count() == 0 and d.get_by_test_id('open-task').first.inner_text().strip() == 'Open')
    d.get_by_test_id('open-task').first.click(); d.wait_for_selector('[data-testid=supply-card][data-focus="true"]')
    c = sc(d, NUM)
    check('"Open" lands on the request itself, highlighted, under "Your move"', f'request={NUM}' in d.url and sc(sec(d, 'supply-needs-action'), NUM).count() == 1)
    c.get_by_test_id('act-choose-farm').click(); c.get_by_test_id('farm-option').first.wait_for(); opts = c.get_by_test_id('farm-option')
    check('the farms are listed with what each holds of EACH size, the one that can cover it first', opts.count() == 2 and opts.nth(0).get_attribute('data-farm') == 'Nkawkaw Farm' and opts.nth(0).get_attribute('data-can-cover') == 'yes' and 'Size 4: has 100, needs 17' in txt(opts.nth(0)) and 'Size 5: has 100, needs 3' in txt(opts.nth(0)), txt(opts.nth(0)))
    check('a farm that cannot cover it says so and cannot be chosen', opts.nth(1).get_attribute('data-can-cover') == 'no' and opts.nth(1).get_by_test_id('act-ask-farm').is_disabled() and 'Not enough here' in txt(opts.nth(1)))
    check('the farm\'s manager is named beside it', 'Yaa Owusu' in txt(opts.nth(0)))
    opts.nth(0).get_by_test_id('act-ask-farm').click(); d.get_by_test_id('supply-notice').wait_for(); d.wait_for_timeout(500)
    check('choosing a farm says who has the task now', 'Nkawkaw Farm will send it. Yaa Owusu has the task.' in txt(d.get_by_test_id('supply-notice')))
    row = [r for r in http('/__supply')[1] if r['requestNumber'] == NUM][0]; RQ = row['dispatchRequestRef']
    orders = [o for o in http('/__orders')[1] if o.get('requestRef') == RQ]
    check('on the server: the farm manager was asked to dispatch the same sizes to the same warehouse, and the request follows it', row['status'] == 'ASSIGNED' and row['sourceFarmId'] == FARM and sorted(o['bagCount'] for o in orders) == [3, 17] and all(o['destinationWarehouseId'] == WH1 for o in orders), (row, orders))
    check('the card now says the farm is getting it ready, with the farm manager', 'Nkawkaw Farm is getting it ready' in txt(sc(d, NUM).get_by_test_id('supply-stage')) and 'Farm manager' in txt(sc(d, NUM).get_by_test_id('supply-holder')))
    ctx.close()

    # =============== 4. The Farm Manager: a SHORT task, the desk, both sizes on one truck ===============
    ctx, m = as_user(b, 'fm'); m.goto(BASE + '/tasks'); m.get_by_test_id('open-dispatch').first.wait_for()
    check('the dispatch task is one short line and a button', len(txt(m.get_by_test_id('task-description').first).split('\n')) == 1 and 'Size 4: 17 bags, Size 5: 3 bags' in txt(m.get_by_test_id('task-description').first))
    m.get_by_test_id('open-dispatch').first.click(); m.wait_for_selector('[data-testid=request-card][data-focus="true"]')
    rc = m.locator(f'[data-testid=request-card][data-request="{RQ}"]'); rc.get_by_test_id('act-dispatch').click(); df = rc.get_by_test_id('dispatch-form'); df.wait_for(); df.get_by_label('Bags of Size 4').wait_for(); m.wait_for_timeout(600)
    check('both sizes are on the truck form, filled in from the request', df.get_by_test_id('size-row').count() == 2 and df.get_by_label('Bags of Size 4').input_value() == '17' and df.get_by_label('Bags of Size 5').input_value() == '3')
    df.get_by_label('Vehicle number').fill('GT-9000-21'); df.get_by_label('Driver name').fill('Kofi Mensah'); df.get_by_test_id('dispatch-submit').click(); m.get_by_test_id('dispatch-sent').wait_for()
    check('it is submitted as ONE dispatch for the supervisor', 'Dispatch submitted' in txt(m.get_by_test_id('dispatch-sent')) and 'Size 4: 17 bags' in txt(m.get_by_test_id('dispatch-sent')) and 'Size 5: 3 bags' in txt(m.get_by_test_id('dispatch-sent')))
    ctx.close()
    ctx, d = as_user(b, 'fsup'); d.goto(BASE + '/deliveries'); rc = d.locator(f'[data-testid=request-card][data-request="{RQ}"]'); rc.get_by_test_id('act-review').click(); d.get_by_test_id('dispatch-details').wait_for()
    d.get_by_role('button', name='Approve', exact=True).click(); d.get_by_test_id('desk-notice').wait_for(); d.wait_for_timeout(500)

    # =============== 5. Everyone can follow it, and see where the paddy is ===============
    d.goto(BASE + '/warehouse-requests'); c = sc(d, NUM); c.wait_for()
    check('the request now says it is on the road, with the driver and vehicle', 'On the road to Tamale Warehouse' in txt(c.get_by_test_id('supply-stage')) and 'driver Kofi Mensah' in txt(c.get_by_test_id('supply-dispatch')) and 'vehicle GT-9000-21' in txt(c.get_by_test_id('supply-dispatch')), txt(c))
    d.get_by_test_id('open-where').click(); wh = d.get_by_test_id('whereabouts'); wh.get_by_test_id('where-place').first.wait_for()
    totals = [txt(t) for t in wh.get_by_test_id('where-total').all()]
    check('"Where is the paddy?" adds it up by size across farms, the road and the warehouse', len(totals) == 2 and 'all size 4' in totals[0].lower() and '112' in totals[0] and 'all size 5' in totals[1].lower() and '103' in totals[1], totals)
    road = wh.locator('[data-testid=where-place][data-type=ROAD]').first
    check('the truck is on the road ONCE, with both sizes and who is driving', 'Nkawkaw Farm to Tamale Warehouse' in txt(road) and 'Driver Kofi Mensah, vehicle GT-9000-21' in txt(road) and '17' in txt(road) and '3' in txt(road))
    check('the farm\'s stock has gone down by what was sent (83 and 97), the warehouse holds 12 and 3', '83' in txt(wh.locator('[data-testid=where-place][data-type=FARM]').first) and '97' in txt(wh.locator('[data-testid=where-place][data-type=FARM]').first) and '12' in txt(wh.locator('[data-testid=where-place][data-type=WAREHOUSE]').first))
    check('no page errors for the Farm Director', not d.errors, d.errors[:2]); ctx.close()
    ctx, w = as_user(b, 'wm1'); w.goto(BASE + '/warehouse-requests'); c = sc(w, NUM); c.wait_for()
    check('the warehouse that asked sees the same: on the road, and which farm is sending it', 'On the road to Tamale Warehouse' in txt(c.get_by_test_id('supply-stage')) and 'Nkawkaw Farm is sending it' in txt(c.get_by_test_id('supply-dispatch')))
    ctx.close()

    # =============== 6. The mill asks: Operations Officer, Operations Manager, then the Warehouse Supervisor checks the stock ===============
    ctx, o = as_user(b, 'oo'); o.goto(BASE + '/warehouse-requests'); o.get_by_test_id('supply-desk').wait_for(); o.get_by_test_id('open-supply-form').click(); of = o.get_by_test_id('supply-form'); of.get_by_test_id('supply-target-fixed').wait_for()
    check('the mill\'s officer asks for the MILL, already chosen, with both sizes there', 'Tamale Mill' in txt(of.get_by_test_id('supply-target-fixed')) and of.get_by_test_id('size-row').count() == 2 and of.get_by_test_id('kind-warehouse').count() == 0)
    of.get_by_label('Bags of Size 4').fill('10'); of.get_by_label('Bags of Size 5').fill('2'); of.get_by_role('button', name='Tomorrow').click(); o.get_by_test_id('supply-send').click(); o.get_by_test_id('supply-sent').wait_for(); M1 = sent_number(o)
    check('it is with the Operations Manager', 'With the Operations Manager' in txt(o.get_by_test_id('supply-sent')))
    check('the officer cannot see warehouse requests, only the mill\'s', o.locator('[data-testid=supply-card][data-kind=WAREHOUSE]').count() == 0 and sc(o, M1).count() == 1); ctx.close()
    ctx, p = as_user(b, 'ops'); p.goto(BASE + '/warehouse-requests'); c = sc(sec(p, 'supply-needs-action'), M1); c.wait_for()
    check('the Operations Manager sends it to the Warehouse Supervisor in one tap', c.get_by_test_id('act-forward').inner_text().strip() == 'Send to the Warehouse Supervisor')
    c.get_by_test_id('act-forward').click(); p.get_by_test_id('supply-notice').wait_for(); ctx.close()
    ctx, s = as_user(b, 'sup'); s.goto(BASE + '/warehouse-requests'); c = sc(sec(s, 'supply-needs-action'), M1); c.wait_for(); c.get_by_test_id('mill-stock').wait_for()
    stock = txt(c.get_by_test_id('mill-stock'))
    check('the warehouse\'s own stock is shown beside the mill\'s request, size by size', 'Tamale Warehouse' in stock and 'Size 4: has 12, needs 10' in stock and 'Size 5: has 3, needs 2' in stock, stock)
    check('with enough stock the answer is "Paddy is ready", and there is no shortfall button', c.get_by_test_id('act-ready').count() == 1 and c.get_by_test_id('act-ask-director').count() == 0)
    c.get_by_test_id('act-ready').click(); s.get_by_test_id('supply-notice').wait_for(); s.wait_for_timeout(400)
    check('the mill\'s request is done: the paddy is ready at the warehouse', 'Paddy is ready at Tamale Warehouse' in txt(sc(sec(s, 'supply-done'), M1).get_by_test_id('supply-stage')))
    ctx.close()

    # =============== 7. When the warehouse is short: ask the Farm Director for EXACTLY the shortfall ===============
    ctx, o = as_user(b, 'oo'); o.goto(BASE + '/warehouse-requests'); M2 = ask(o, s4=30); ctx.close()
    ctx, p = as_user(b, 'ops'); p.goto(BASE + '/warehouse-requests'); sc(sec(p, 'supply-needs-action'), M2).get_by_test_id('act-forward').click(); p.get_by_test_id('supply-notice').wait_for(); ctx.close()
    ctx, s = as_user(b, 'sup'); s.goto(BASE + '/warehouse-requests'); c = sc(sec(s, 'supply-needs-action'), M2); c.get_by_test_id('mill-stock').wait_for()
    check('short of Size 4: the stock is shown against the need, and only "Ask the Farm Director" is offered', 'Size 4: has 12, needs 30' in txt(c.get_by_test_id('mill-stock')) and c.get_by_test_id('act-ready').count() == 0 and c.get_by_test_id('act-ask-director').count() == 1)
    c.get_by_test_id('act-ask-director').click(); s.get_by_test_id('supply-notice').wait_for(); s.wait_for_timeout(400)
    check('the mill\'s request now says the Farm Director was asked for more', 'Asked the Farm Director for more' in txt(sc(sec(s, 'supply-progress'), M2).get_by_test_id('supply-stage')))
    child = [r for r in http('/__supply')[1] if r.get('parentRequestId')][0]
    check('on the server: a warehouse request for ONLY the 18 bags that are missing (30 asked, 12 held)', child['kind'] == 'WAREHOUSE' and child['status'] == 'FORWARDED' and [(l['gradeLabel'], l['bags']) for l in child['lines']] == [('Size 4', 18)], child)
    ctx.close()
    ctx, d = as_user(b, 'fsup'); d.goto(BASE + '/warehouse-requests'); cc = sc(sec(d, 'supply-needs-action'), child['requestNumber']); cc.wait_for()
    check('the Farm Director has the shortfall request waiting, 18 bags of Size 4, and does not see the mill\'s own request', 'Size 4: 18' in txt(cc.get_by_test_id('supply-sizes')) and d.locator('[data-testid=supply-card][data-kind=MILL]').count() == 0); ctx.close()

    # =============== 8. "Not possible" always carries a reason the person who asked will read ===============
    ctx, w = as_user(b, 'wm1'); w.goto(BASE + '/warehouse-requests'); W2 = ask(w, s4=5); ctx.close()
    ctx, s = as_user(b, 'sup'); s.goto(BASE + '/warehouse-requests'); c = sc(sec(s, 'supply-needs-action'), W2); c.get_by_test_id('act-decline').click(); conf = c.get_by_test_id('decline-confirm')
    check('declining needs a reason: the button waits for a few words', conf.is_disabled())
    c.get_by_test_id('decline-reason').fill('We have stock in Kumasi'); conf.click(); s.get_by_test_id('supply-notice').wait_for(); ctx.close()
    ctx, w = as_user(b, 'wm1'); w.goto(BASE + '/warehouse-requests'); c = sc(w, W2); c.wait_for()
    check('the person who asked sees it was not possible, and why', 'Not possible' in txt(c.get_by_test_id('supply-stage')) and 'We have stock in Kumasi' in txt(c.get_by_test_id('supply-declined')))
    check('the warehouse manager is told, with the reason, and can open it with one tap', any('u-wm1' in n['userIds'] and n['title'] == 'Not possible: Tamale Warehouse' and n['body'] == 'We have stock in Kumasi' for n in http('/__notes')[1])); ctx.close()

    # =============== 9. Notifications open the work ===============
    ctx, d = as_user(b, 'fsup'); d.goto(BASE + '/notifications'); d.get_by_test_id('open-notification').first.wait_for(); href = d.get_by_test_id('open-notification').first.get_attribute('href')
    check('a notification has an "Open" button that goes straight to the request', href and '/warehouse-requests?request=SR-' in href, href)
    d.get_by_test_id('open-notification').first.click(); d.wait_for_selector('[data-testid=supply-card][data-focus="true"]'); check('and it lands on that request, highlighted', 'request=SR-' in d.url); ctx.close()

    # =============== 10. Size 4 and Size 5 everywhere bags are counted ===============
    ctx, d = as_user(b, 'fsup'); d.goto(BASE + '/deliveries'); d.get_by_test_id('open-request-form').click(); d.get_by_test_id('request-form').wait_for()
    check('the Farm Director\'s dispatch request form has both sizes', d.get_by_test_id('request-form').get_by_test_id('size-row').count() == 2); ctx.close()
    ctx, m = as_user(b, 'fm'); m.goto(BASE + '/paddy-entries'); m.get_by_role('button', name='Log paddy intake').click(); m.get_by_test_id('intake-form').wait_for()
    check('the farm intake form has both sizes', m.get_by_test_id('intake-form').get_by_test_id('size-row').count() == 2)
    m.goto(BASE + '/office'); m.wait_for_selector('h2:has-text("Log paddy intake")'); m.wait_for_timeout(1200)
    check('so does the intake on My Office: two sizes, ready to fill', m.locator('div.rounded-xl.border', has_text='Bag size / grade').count() == 2); ctx.close()

    # =============== 11. A size nobody asked for can still go on the truck ===============
    st, r = http('/api/delivery-orders/request', 'POST', 'tok-fsup', {'farmId': FARM, 'destinationWarehouseId': WH1, 'requestedDate': '2026-10-09', 'lines': [{'paddyGradeId': G4, 'bagCount': 10}]})
    RQ2 = r['data']['requestRef']
    ctx, m = as_user(b, 'fm'); m.goto(BASE + '/deliveries'); rc = m.locator(f'[data-testid=request-card][data-request="{RQ2}"]'); rc.get_by_test_id('act-dispatch').click(); df = rc.get_by_test_id('dispatch-form'); df.wait_for(); df.get_by_label('Bags of Size 4').wait_for(); m.wait_for_timeout(600)
    check('the truck form still shows BOTH sizes when only one was asked for, and says so', df.get_by_test_id('size-row').count() == 2 and 'Not asked for' in txt(df.locator('[data-testid=size-row][data-size="Size 5"]')) and df.get_by_label('Bags of Size 4').input_value() == '10')
    df.get_by_label('Bags of Size 5').fill('2'); check('adding it is flagged, and the total counts both', 'it will be added' in txt(df.locator('[data-testid=size-row][data-size="Size 5"]')) and 'On the truck: 12 bags (Size 4 10, Size 5 2)' in txt(df.get_by_test_id('dispatch-total')))
    df.get_by_test_id('dispatch-submit').click(); m.get_by_test_id('dispatch-sent').wait_for(); added = [o for o in http('/__orders')[1] if o.get('requestRef') == RQ2]
    check('the extra size was added to the SAME request as part of the one dispatch', 'Size 5: 2 bags' in txt(m.get_by_test_id('dispatch-sent')) and sorted(o['bagCount'] for o in added) == [2, 10], added); ctx.close()

    # =============== 12. A phone ===============
    ctx, ph = as_user(b, 'wm1', viewport={'width': 390, 'height': 844}); ph.goto(BASE + '/warehouse-requests'); ph.get_by_test_id('open-supply-form').click(); ph.get_by_test_id('supply-form').wait_for(); ph.wait_for_timeout(500)
    check('on a phone the request form does not scroll sideways', ph.evaluate('document.documentElement.scrollWidth - window.innerWidth') <= 1, ph.evaluate('document.documentElement.scrollWidth')); ctx.close()
    b.close()
sys.exit(1 if finish() else 0)
