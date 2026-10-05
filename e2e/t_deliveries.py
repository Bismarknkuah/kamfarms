import os, re, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

WH1 = '11111111-1111-4111-8111-111111111111'; WH2 = '22222222-2222-4222-8222-222222222222'; MC1 = '66666666-6666-4666-8666-666666666666'
G4 = '44444444-4444-4444-8444-444444444444'; G5 = '55555555-5555-4555-8555-555555555555'
def sc(p, num): return p.locator(f'[data-testid=supply-card][data-number="{num}"]')
def sec(p, tid): return p.get_by_test_id(tid)
def txt(l): return l.inner_text()
def api(path, key, method='GET', body=None):
    st, r = http('/api' + path, method, 'tok-' + key, body); return st, (r.get('data') if isinstance(r, dict) and 'data' in r else r)
def totals(): return api('/supply-requests/whereabouts', 'fsup')[1]['totals']
def stock(): return http('/__whstock')[1]
def transfers(): return http('/__transfers')[1]
def posts(suffix): return [c for c in calls() if c['path'].endswith(suffix) and c['method'] == 'POST']
def dict_of(lines, key='bags'): return {l['paddyGradeId']: l[key] for l in lines}
def titles(key): return [n['title'] for n in api('/notifications', key)[1]]
def sent_number(p): return txt(p.get_by_test_id('supply-sent-number')).strip()
def ask(p, s4=0, s5=0, when='Tomorrow'):
    p.get_by_test_id('open-supply-form').click(); f = p.get_by_test_id('supply-form'); f.wait_for()
    if s4: f.get_by_label('Bags of Size 4').fill(str(s4))
    if s5: f.get_by_label('Bags of Size 5').fill(str(s5))
    f.get_by_role('button', name=when).click(); p.get_by_test_id('supply-send').click(); p.get_by_test_id('supply-sent').wait_for(); return sent_number(p)

pages = []
def U(b, key, **kw):
    ctx, p = as_user(b, key, **kw); pages.append(p); return ctx, p

with sync_playwright() as pw:
    b = pw.chromium.launch(); reset(); T0 = totals()

    # =============== 1. Who is offered the Deliveries page ===============
    EVERYONE = {'sales1': False, 'sales2': False, 'fd': False, 'md': False, 'ceo': False, 'ops': False, 'sup': True, 'sup2': True, 'wm1': True, 'wm2': True, 'fsup': False, 'fm': False, 'oo': False, 'admin': True}
    seen = {}
    for key in EVERYONE:
        ctx, p = U(b, key); p.goto(BASE + '/notifications'); p.wait_for_load_state('networkidle'); p.wait_for_timeout(500); seen[key] = p.locator('a[href="/site-deliveries"]').count() > 0; ctx.close()
    check('the Deliveries page is offered to warehouse supervisors, warehouse managers and the Administrator, and to NOBODY else (checked for every role)', seen == EVERYONE, {k: v for k, v in seen.items() if v != EVERYONE[k]})

    # =============== 2. Kumasi sends paddy to Tamale: both sizes, bags only ===============
    ctx, s = U(b, 'sup2'); s.goto(BASE + '/site-deliveries'); s.get_by_test_id('deliveries-desk').wait_for(); s.get_by_test_id('open-send').click(); f = s.get_by_test_id('send-paddy-form'); f.wait_for(); f.get_by_label('Bags of Size 4').wait_for(); s.wait_for_timeout(500)
    rows = f.get_by_test_id('size-row')
    check('BOTH sizes are on the form, with what the warehouse holds beside each', rows.count() == 2 and 'in stock: 40' in txt(rows.nth(0)) and 'in stock: 9' in txt(rows.nth(1)), [txt(r) for r in rows.all()])
    check('it says where the paddy leaves from, and does not ask', 'From Kumasi Warehouse' in txt(f) and f.get_by_test_id('send-from').count() == 0)
    opts = [o.inner_text() for o in f.get_by_test_id('send-to').locator('option').all()]
    check('it can go to any OTHER warehouse, never to itself', any('Tamale Warehouse' in o for o in opts) and not any('Kumasi Warehouse' in o for o in opts), opts)
    s.get_by_test_id('send-submit').click(); s.wait_for_timeout(300); probs = txt(s.get_by_test_id('send-problems'))
    check('an empty form says what to fix, in plain words, and sends nothing', 'Choose where it is going.' in probs and 'Put the bags on Size 4 or Size 5.' in probs and not posts('/paddy-transfers'), probs)
    f.get_by_test_id('send-to').select_option(WH1); f.get_by_label('Bags of Size 5').fill('10'); s.get_by_test_id('send-submit').click(); s.wait_for_timeout(300)
    check('more bags than the warehouse holds is caught before anything is sent, saying how many it has', 'Kumasi Warehouse has only 9 bags of Size 5.' in txt(s.get_by_test_id('send-problems')) and not posts('/paddy-transfers'))
    f.get_by_label('Bags of Size 4').fill('5'); f.get_by_label('Bags of Size 5').fill('2'); f.get_by_test_id('send-driver').fill('Kojo Asante'); f.get_by_test_id('send-vehicle').fill('GT-1234-21'); before = totals()
    s.get_by_test_id('send-submit').click(); s.get_by_test_id('send-sent').wait_for(); sent_txt = txt(s.get_by_test_id('send-sent'))
    check('the confirmation says what was sent, where, and that they have been told', 'Sent: 7 bags to Tamale Warehouse' in sent_txt and 'Size 4: 5' in sent_txt and 'Size 5: 2' in sent_txt and 'has been told' in sent_txt, sent_txt)
    c = posts('/paddy-transfers')[-1]; lines = c['body']['lines']
    check('it sends the bags of each size and no kilograms at all', dict_of(lines) == {G4: 5, G5: 2} and all(set(l) == {'paddyGradeId', 'bags'} for l in lines) and c['body']['fromWarehouseId'] == WH2 and c['body']['toWarehouseId'] == WH1 and c['body']['vehiclePlate'] == 'GT-1234-21', c['body'])
    T1 = transfers(); st = stock(); TID = T1[0]['id']
    check('the bags are out of the sender\'s stock at once, and on the road', st['warehouses'][WH2] == {G4: 35, G5: 7} and st['road'][TID] == {G4: 5, G5: 2}, st['warehouses'])
    check('no paddy was lost on the way out: the company total is unchanged', totals() == before == T0, (before, totals(), T0))
    oc = s.get_by_test_id('out-card'); oc.wait_for()
    check('"Going out" shows it: where, both sizes, that it is on the road', 'To Tamale Warehouse' in txt(oc) and 'Size 4: 5' in txt(oc) and 'Size 5: 2' in txt(oc) and 'On the road to Tamale Warehouse' in txt(oc), txt(oc))
    wh = api('/supply-requests/whereabouts', 'fsup')[1]; road = [p for p in wh['places'] if p['type'] == 'ROAD' and p['name'] == 'Kumasi Warehouse to Tamale Warehouse']
    check('"Where is the paddy?" shows it on the road between the warehouses, with the driver', len(road) == 1 and road[0]['bags'] == {G4: 5, G5: 2} and 'Kojo Asante' in (road[0]['detail'] or ''), road)
    ctx.close()

    # =============== 3. Tamale counts it in: one short ===============
    ctx, w = U(b, 'wm1'); w.goto(BASE + '/notifications'); w.get_by_test_id('open-notification').first.wait_for(); n = w.get_by_test_id('open-notification').first; href = n.get_attribute('href')
    check('Tamale\'s manager is told, and the notification opens that delivery', href and f'/site-deliveries?transfer={TID}' in href and 'Kumasi Warehouse is sending you 7 bags' in titles('wm1'), href)
    n.click(); w.wait_for_selector('[data-testid=in-card][data-focus="true"]'); ic = w.get_by_test_id('in-card')
    check('"Coming to you" shows who sent it, both sizes, the driver and the vehicle', 'From Kumasi Warehouse' in txt(ic) and 'Size 4: 5' in txt(ic) and 'Size 5: 2' in txt(ic) and 'Kojo Asante' in txt(ic) and 'GT-1234-21' in txt(ic), txt(ic))
    check('paddy from farms is pointed to the Shipments page', 'Shipments' in txt(w.get_by_test_id('deliveries-farm-note')))
    ic.get_by_test_id('act-count').click(); cf = ic.get_by_test_id('count-form'); cf.wait_for(); cf.get_by_label('Counted bags of Size 4').wait_for(); w.wait_for_timeout(500)
    check('the count starts at what was sent, with a big plus and minus for each size', cf.get_by_label('Counted bags of Size 4').input_value() == '5' and cf.get_by_label('Counted bags of Size 5').input_value() == '2' and 'sent: 5' in txt(cf))
    cf.get_by_label('Counted bags of Size 4').fill('4'); cf.get_by_test_id('count-note').fill('One bag was torn'); cf.get_by_test_id('count-confirm').click(); w.get_by_test_id('deliveries-notice').wait_for()
    check('it says plainly that a bag was short and that it has been written down', '1 bag short' in txt(w.get_by_test_id('deliveries-notice')) and 'Counted in: 6 bags' in txt(w.get_by_test_id('deliveries-notice')), txt(w.get_by_test_id('deliveries-notice')))
    rc = last_call(f'/paddy-transfers/{TID}/receive')['body']
    check('what was counted is sent as bags, per size', dict_of(rc['lines']) == {G4: 4, G5: 2} and rc['notes'] == 'One bag was torn', rc)
    st = stock(); tr = transfers()[0]
    check('Tamale\'s stock is up by what ARRIVED, and nothing is left floating on the road', st['warehouses'][WH1] == {G4: 16, G5: 5} and st['road'][TID] == {G4: 0, G5: 0}, (st['warehouses'], st['road']))
    check('the missing bag is written down for review (not silently lost)', tr['status'] == 'RECEIVED' and tr['varianceBags'] == -1 and any(t['type'] == 'STOCK_ADJUSTMENT' and t['approvalStatus'] == 'PENDING' and t['paddyGradeId'] == G4 for t in st['txns']))
    w.get_by_test_id('deliveries-done').wait_for()
    check('it leaves "Coming to you" and is under "Done", saying it was one short', w.get_by_test_id('in-card').count() == 0 and 'Arrived at Tamale Warehouse: 1 bag short' in txt(w.get_by_test_id('deliveries-done')))
    check('the sender is told it was counted in', 'Tamale Warehouse has counted in your paddy' in titles('sup2'))
    ctx.close()

    # =============== 4. Cancelling before it arrives ===============
    ctx, s = U(b, 'sup2'); s.goto(BASE + '/site-deliveries'); s.get_by_test_id('open-send').click(); f = s.get_by_test_id('send-paddy-form'); f.get_by_label('Bags of Size 4').wait_for(); s.wait_for_timeout(400)
    f.get_by_test_id('send-to').select_option(WH1); f.get_by_label('Bags of Size 4').fill('3'); s.get_by_test_id('send-submit').click(); s.get_by_test_id('send-sent').wait_for()
    check('3 more bags are out of the warehouse', stock()['warehouses'][WH2][G4] == 32)
    oc = s.get_by_test_id('out-card'); oc.get_by_test_id('act-cancel').click(); oc.get_by_test_id('cancel-reason').fill('Wrong truck'); oc.get_by_test_id('cancel-confirm').click(); s.get_by_test_id('deliveries-notice').wait_for()
    check('cancelling puts the bags back in the sender\'s stock and says so', 'Cancelled. The bags are back in your stock.' in txt(s.get_by_test_id('deliveries-notice')) and stock()['warehouses'][WH2][G4] == 35 and transfers()[-1]['status'] == 'CANCELLED')
    check('the delivery is gone from "Going out", and the other warehouse is told', s.get_by_test_id('out-card').count() == 0 and 'Kumasi Warehouse cancelled the paddy it was sending you' in titles('wm1'))
    ctx.close()

    # =============== 5. The Farm Director chooses a WAREHOUSE for a paddy request ===============
    ctx, w = U(b, 'wm1'); w.goto(BASE + '/warehouse-requests'); w.get_by_test_id('supply-desk').wait_for(); NUM = ask(w, 17, 3); ctx.close()
    ctx, p = U(b, 'sup'); p.goto(BASE + '/warehouse-requests'); c = sc(sec(p, 'supply-needs-action'), NUM); c.wait_for(); c.get_by_test_id('act-forward').click(); p.get_by_test_id('supply-notice').wait_for(); ctx.close()
    ctx, d = U(b, 'fsup'); d.goto(BASE + '/warehouse-requests'); c = sc(sec(d, 'supply-needs-action'), NUM); c.wait_for()
    check('the Farm Director\'s button says "where it comes from", not only a farm', txt(c.get_by_test_id('act-choose-farm')).strip() == 'Choose where it comes from')
    c.get_by_test_id('act-choose-farm').click(); c.get_by_test_id('farm-options').wait_for(); c.get_by_test_id('warehouse-options').wait_for()
    names = [o.get_attribute('data-warehouse') for o in c.get_by_test_id('warehouse-option').all()]
    check('the farms are still there, and so is the warehouse that has paddy (not the one asking)', c.get_by_test_id('farm-option').count() == 2 and names == ['Kumasi Warehouse'], names)
    wo = c.get_by_test_id('warehouse-option').first
    check('its stock is shown size by size against the need, and it can cover it', 'Size 4: has 35, needs 17' in txt(wo) and 'Size 5: has 7, needs 3' in txt(wo) and wo.get_attribute('data-can-cover') == 'yes', txt(wo))
    ORD0 = len(http('/__orders')[1])
    wo.get_by_test_id('act-ask-warehouse').click(); d.get_by_test_id('supply-notice').wait_for()
    check('one tap: it says who will send it', 'Kumasi Warehouse will send it.' in txt(d.get_by_test_id('supply-notice')))
    pc = sc(sec(d, 'supply-progress'), NUM); pc.wait_for()
    check('it leaves the Farm Director\'s list and says the warehouse is getting it ready', 'Kumasi Warehouse is getting it ready' in txt(pc.get_by_test_id('supply-stage')) and sc(sec(d, 'supply-needs-action'), NUM).count() == 0)
    check('on the server it is assigned to that warehouse, and no farm was asked to dispatch (no new order was made)', [r for r in http('/__supply')[1] if r['requestNumber'] == NUM][0].get('sourceWarehouseId') == WH2 and len(http('/__orders')[1]) == ORD0); ctx.close()

    ctx, s = U(b, 'sup2'); s.goto(BASE + '/tasks'); s.get_by_test_id('open-task').first.wait_for()
    check('the Kumasi supervisor has a SHORT task and one Open button', 'Send 20 bags to Tamale Warehouse' in txt(s.locator('body')) and s.get_by_test_id('task-description').count() == 0 and s.get_by_test_id('open-task').first.inner_text().strip() == 'Open')
    s.get_by_test_id('open-task').first.click(); s.wait_for_selector('[data-testid=supply-card][data-focus="true"]'); c = sc(sec(s, 'supply-needs-action'), NUM)
    check('the request is in their "Your move", with one big button to send the paddy', c.get_by_test_id('act-send-paddy').inner_text().strip() == 'Send the paddy' and f'/site-deliveries?send={NUM}' in c.get_by_test_id('act-send-paddy').get_attribute('href'))
    c.get_by_test_id('act-send-paddy').click(); f = s.get_by_test_id('send-paddy-form'); f.wait_for(); s.get_by_test_id('send-for-request').wait_for(); f.get_by_label('Bags of Size 4').wait_for(); s.wait_for_timeout(600)
    check('the form is already filled in for that request: where, and both sizes', NUM in txt(s.get_by_test_id('send-for-request')) and 'Tamale Warehouse' in txt(s.get_by_test_id('send-for-request')) and f.get_by_test_id('send-to').input_value() == WH1 and f.get_by_label('Bags of Size 4').input_value() == '17' and f.get_by_label('Bags of Size 5').input_value() == '3')
    f.get_by_test_id('send-vehicle').fill('GT-5678-21'); f.get_by_test_id('send-driver').fill('Kwesi Adu'); s.get_by_test_id('send-submit').click(); s.get_by_test_id('send-sent').wait_for()
    check('it is sent for that request, and says 20 bags', 'Sent: 20 bags to Tamale Warehouse' in txt(s.get_by_test_id('send-sent')) and posts('/paddy-transfers')[-1]['body'].get('supplyRequestNumber') == NUM)
    check('Kumasi\'s stock went down by exactly what was asked', stock()['warehouses'][WH2] == {G4: 18, G5: 4}, stock()['warehouses'][WH2]); ctx.close()

    ctx, w = U(b, 'wm1'); w.goto(BASE + f'/warehouse-requests?request={NUM}'); c = sc(w, NUM); c.wait_for()
    check('the person who asked sees it is on the road, and who is sending it', 'On the road to Tamale Warehouse' in txt(c.get_by_test_id('supply-stage')) and 'Kumasi Warehouse is sending it' in txt(c.get_by_test_id('supply-transfer')) and 'vehicle GT-5678-21' in txt(c.get_by_test_id('supply-transfer')))
    check('and was told it has been sent, with a link to the request', 'Kumasi Warehouse has sent your paddy' in titles('wm1'))
    w.goto(BASE + '/site-deliveries'); ic = w.get_by_test_id('in-card'); ic.wait_for(); check('it is under "Coming to you", marked as for that request', f'for paddy request {NUM}' in txt(ic), txt(ic))
    ic.get_by_test_id('act-count').click(); ic.get_by_test_id('count-form').wait_for(); ic.get_by_test_id('count-confirm').click(); w.get_by_test_id('deliveries-notice').wait_for()
    check('everything arrived: it says so, and all 20 bags are in Tamale\'s stock', 'Counted in: all 20 bags are in your stock.' in txt(w.get_by_test_id('deliveries-notice')) and stock()['warehouses'][WH1] == {G4: 33, G5: 8}, stock()['warehouses'][WH1])
    w.goto(BASE + f'/warehouse-requests?request={NUM}'); c = sc(w, NUM); c.wait_for(); c.get_by_test_id('act-track').click(); steps = txt(c.get_by_test_id('supply-steps'))
    check('the request now says it ARRIVED, and the steps name the warehouse that sent it', 'Arrived at Tamale Warehouse' in txt(c.get_by_test_id('supply-stage')) and 'Farm Director chooses the warehouse' in steps and 'Warehouse Supervisor loads and sends' in steps and 'Kumasi Warehouse' in steps, steps); ctx.close()
    T_end = totals()
    check('across all of it only the one torn bag is missing from the company total', T_end[G4] == T0[G4] - 1 and T_end[G5] == T0[G5], (T0, T_end))

    # =============== 6. The mill confirms the paddy has reached it ===============
    ctx, o = U(b, 'oo'); o.goto(BASE + '/warehouse-requests'); o.get_by_test_id('supply-desk').wait_for(); o.get_by_test_id('open-supply-form').click(); of = o.get_by_test_id('supply-form'); of.get_by_test_id('supply-target-fixed').wait_for()
    of.get_by_label('Bags of Size 4').fill('10'); of.get_by_label('Bags of Size 5').fill('2'); of.get_by_role('button', name='Tomorrow').click(); o.get_by_test_id('supply-send').click(); o.get_by_test_id('supply-sent').wait_for(); M1 = sent_number(o); ctx.close()
    ctx, p = U(b, 'ops'); p.goto(BASE + '/warehouse-requests'); c = sc(sec(p, 'supply-needs-action'), M1); c.wait_for(); c.get_by_test_id('act-forward').click(); p.get_by_test_id('supply-notice').wait_for(); ctx.close()
    ctx, p = U(b, 'sup'); p.goto(BASE + '/warehouse-requests'); c = sc(sec(p, 'supply-needs-action'), M1); c.get_by_test_id('act-ready').wait_for(); c.get_by_test_id('act-ready').click(); p.get_by_test_id('supply-notice').wait_for(); ctx.close()
    ctx, o = U(b, 'oo'); o.goto(BASE + '/warehouse-requests'); c = sc(sec(o, 'supply-needs-action'), M1); c.wait_for()
    check('the mill\'s officer sees the paddy is ready, with ONE big button to say it reached the mill', 'Paddy is ready at Tamale Warehouse' in txt(c.get_by_test_id('supply-stage')) and txt(c.get_by_test_id('act-received')).strip() == 'Paddy received at the mill')
    c.get_by_test_id('act-received').click(); o.get_by_test_id('supply-notice').wait_for()
    check('one tap: it says it is recorded', 'recorded as received at the mill' in txt(o.get_by_test_id('supply-notice')))
    c = sc(o, M1); c.wait_for(); c.get_by_test_id('act-track').click(); steps = txt(c.get_by_test_id('supply-steps'))
    check('the request now says it is received at the mill and has left their "Your move"', 'Received at Tamale Mill' in txt(c.get_by_test_id('supply-stage')) and c.get_by_test_id('act-received').count() == 0 and sc(sec(o, 'supply-needs-action'), M1).count() == 0)
    check('the last step, "Received at the mill", is done and names who', 'Received at the mill' in steps and 'Ama Frimpong' in steps, steps)
    mr = http('/__millreceipts')[1]
    check('the mill\'s own record of paddy received was written, both sizes in bags, for this mill', len(mr) == 1 and mr[0]['millingCenterId'] == MC1 and dict_of(mr[0]['lines'], 'bagCount') == {G4: 10, G5: 2} and M1 in mr[0]['notes'], mr)
    check('the warehouse supervisor and the Operations Manager were told', 'Tamale Mill has received the paddy' in titles('sup') and 'Tamale Mill has received the paddy' in titles('ops')); ctx.close()

    # =============== 7. A phone ===============
    ctx, ph = U(b, 'sup2', viewport={'width': 390, 'height': 844}); ph.goto(BASE + '/site-deliveries'); ph.get_by_test_id('open-send').click(); ph.get_by_test_id('send-paddy-form').wait_for(); ph.wait_for_timeout(500)
    check('on a phone the Deliveries page does not scroll sideways', ph.evaluate('document.documentElement.scrollWidth - window.innerWidth') <= 1, ph.evaluate('document.documentElement.scrollWidth')); ctx.close()
    check('no page threw an error anywhere', not any(pg.errors for pg in pages), [e for pg in pages for e in pg.errors][:3])
    b.close()
sys.exit(1 if finish() else 0)
