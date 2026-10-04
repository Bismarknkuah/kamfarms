import json, os, re, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

G4 = '44444444-4444-4444-8444-444444444444'; G5 = '55555555-5555-4555-8555-555555555555'
NOTE = 'Load the Size 4 first. The truck leaves at 6am.'
def card(p, ref): return p.locator(f'[data-testid=request-card][data-request="{ref}"]')
def sec(p, tid): return p.get_by_test_id(tid)
def txt(loc): return loc.inner_text()
def dispatch_calls(suffix=''): return [c for c in calls() if '/delivery-reports/dispatch' in c['path'] and c['path'].endswith('dispatch' + suffix)]

with sync_playwright() as pw:
    b = pw.chromium.launch()
    reset()
    dirs = http('/api/warehouses/directory', 'GET', 'tok-admin')[1]['data']
    WH = dirs[0]; WH_NAME, WH_LOC, WH_ID = WH['name'], WH['location'], WH['id']

    # =============== 1. The Farm Supervisor's desk: what needs a decision first, then everything else, with where it is ===============
    ctx, p = as_user(b, 'fsup'); p.goto(BASE + '/deliveries'); p.get_by_test_id('request-card').first.wait_for()
    check('the page opens on the Dispatch desk, with the supervisor\'s purpose stated', 'Ask a farm manager to dispatch, approve what they prepare, and follow it until it arrives.' in txt(sec(p, 'dispatch-desk')))
    need = sec(p, 'desk-needs-action')
    check('"Waiting for your decision" holds ONLY what is waiting for the supervisor to approve', 'Waiting for your decision' in txt(need) and need.locator('[data-testid=request-card]').count() == 1 and card(need, 'RQ-2026-009002').count() == 1)
    check('and offers Review & approve on it', card(need, 'RQ-2026-009002').get_by_test_id('act-review').count() == 1)
    prog = sec(p, 'desk-progress')
    r1, r3, r5 = card(prog, 'RQ-2026-009001'), card(prog, 'RQ-2026-009003'), card(prog, 'RQ-2026-009005')
    check('REQUESTED: with the farm manager, nobody has started', 'Waiting for the farm manager to start loading' in txt(r1.get_by_test_id('card-stage')) and 'With: Farm manager' in txt(r1.get_by_test_id('card-holder')))
    check('ON THE WAY: names the warehouse, with the driver and vehicle', f'On the way to {WH_NAME}' in txt(r3.get_by_test_id('card-stage')) and 'driver Yaw Boateng' in txt(r3.get_by_test_id('card-dispatch')) and 'vehicle GT-5521-21' in txt(r3.get_by_test_id('card-dispatch')))
    r3.get_by_test_id('act-track').click(); check('"Track" opens the timeline with who approved it', 'Efua Mensah' in txt(r3.get_by_test_id('card-steps')) and 'Driver Yaw Boateng, vehicle GT-5521-21' in txt(r3.get_by_test_id('card-steps')), txt(r3.get_by_test_id('card-steps')))
    check('SENT BACK: back with the farm manager, with the reason', 'Sent back to the farm manager' in txt(r5.get_by_test_id('card-stage')) and 'The weight does not match the bags' in txt(r5.get_by_test_id('card-sentback')))
    arr = card(sec(p, 'desk-arrived'), 'RQ-2026-009004')
    check('ARRIVED: shows what arrived and that 2 bags were short and need approval', f'Received at {WH_NAME}' in txt(arr.get_by_test_id('card-stage')) and '2 bags short on arrival' in txt(arr.get_by_test_id('card-variance')) and 'Needs approval' in txt(arr.get_by_test_id('card-variance')))
    check('the supervisor is never offered "Load & dispatch" or "Send for approval" (the mistake in the screenshot)', p.get_by_test_id('act-dispatch').count() == 0 and p.get_by_test_id('act-send-draft').count() == 0)
    check('the cards say where each one goes, with the location', all(WH_LOC in t for t in p.get_by_test_id('card-location').all_inner_texts()[:3]))

    # =============== 2. Asking: every detail, in one request, from the desk ===============
    p.get_by_test_id('open-request-form').click(); form = p.get_by_test_id('request-form'); form.wait_for()
    p.get_by_test_id('request-send').click(); p.wait_for_timeout(300)
    probs = txt(p.get_by_test_id('request-problems'))
    check('an empty request says what is missing, and sends nothing', all(x in probs for x in ['Choose the warehouse', 'needed at the warehouse', 'Put the bags on Size 4 or Size 5']) and len([c for c in calls() if c['path'].endswith('/delivery-orders/request')]) == 0, probs)
    form.locator('#req-farm').select_option(index=1); form.locator('#req-warehouse').select_option(label=f'{WH_NAME} - {WH_LOC}'); form.locator('#req-date').fill('2026-10-09'); form.locator('#req-priority').select_option('HIGH'); form.locator('#req-notes').fill(NOTE)
    check('Size 4 and Size 5 are BOTH already on the request form', form.get_by_test_id('size-row').count() == 2)
    form.get_by_label('Bags of Size 4').fill('17'); form.get_by_label('Bags of Size 5').fill('3')
    p.get_by_test_id('request-send').click(); p.get_by_test_id('request-sent').wait_for(); p.wait_for_timeout(400)
    REF = txt(p.get_by_test_id('request-ref')).strip(); NEW = card(p, REF)
    check('both sizes went in ONE request, and a confirmation says where, by when, and who has the task', re.match(r'RQ-2026-\d{6}$', REF) and 'Yaa Owusu' in txt(p.get_by_test_id('request-sent')) and f'{WH_NAME} ({WH_LOC})' in txt(p.get_by_test_id('request-sent')) and 'Fri 9 Oct 2026' in txt(p.get_by_test_id('request-sent')))
    NEW.wait_for(); check('the new request is on the supervisor\'s desk at once, waiting for the farm manager', 'Waiting for the farm manager to start loading' in txt(NEW.get_by_test_id('card-stage')) and '17 bags' in txt(NEW.get_by_test_id('card-sizes')) and '3 bags' in txt(NEW.get_by_test_id('card-sizes')) and NOTE in txt(NEW.get_by_test_id('card-notes')))
    tasks = http('/__tasks')[1]
    check('and it became a task for the farm manager, due on the date it is needed', len(tasks) == 1 and tasks[0]['assignedToId'] == 'u-fm' and tasks[0]['deliveryRequestRef'] == REF and tasks[0]['dueDate'].startswith('2026-10-09'), tasks)
    ctx.close()

    # =============== 3. The Farm Manager: the task, the desk, ONE dispatch with both sizes ===============
    ctx, m = as_user(b, 'fm'); m.goto(BASE + '/tasks'); m.get_by_test_id('task-description').first.wait_for()
    d = txt(m.get_by_test_id('task-description').first)
    check('the task is SHORT and says what to send and by when, and the note', 'Size 4: 17 bags, Size 5: 3 bags · by Fri 9 Oct 2026' in d and f'Note: {NOTE}' in d, d)
    check('and nothing more: no priority line, no contacts, no instructions label (the button opens the work)', len(d.split(chr(10))) == 2 and all(x not in d for x in ['Priority', 'Who to ask', 'Instructions from', 'Request RQ']), d)
    m.get_by_test_id('open-dispatch').first.click(); m.wait_for_selector('[data-testid=request-card][data-focus="true"]')
    mine = sec(m, 'desk-needs-action'); mc = card(m, REF)
    check('"Open the dispatch" lands on the desk with that request highlighted, under "Your move"', 'Your move' in txt(mine) and mc.count() == 1 and mine.locator(f'[data-request="{REF}"]').count() == 1 and '/deliveries?request=' in m.url)
    check('the farm manager\'s desk says what is asked of them', 'Requests from your Farm Supervisor. Load the truck, then submit ONE dispatch with every size on it.' in txt(sec(m, 'dispatch-desk')))
    check('they see what is theirs (requested and sent back) and not the supervisor\'s approvals', card(mine, 'RQ-2026-009001').count() == 1 and card(mine, 'RQ-2026-009005').count() == 1 and card(mine, 'RQ-2026-009002').count() == 0 and m.get_by_test_id('act-review').count() == 0)
    mc.get_by_test_id('act-dispatch').click(); f = mc.get_by_test_id('dispatch-form'); f.wait_for(); f.get_by_label('Bags of Size 4').wait_for(); f.page.wait_for_timeout(600)
    check('the dispatch form opens with where it goes and the supervisor\'s instruction', f'Send to {WH_NAME} ({WH_LOC})' in txt(f.get_by_test_id('dispatch-destination')) and NOTE in txt(f))
    check('BOTH sizes are on one form, prefilled with what was asked', f.get_by_test_id('size-row').count() == 2 and f.get_by_label('Bags of Size 4').input_value() == '17' and f.get_by_label('Bags of Size 5').input_value() == '3' and 'On the truck: 20 bags (Size 4 17, Size 5 3)' in txt(f.get_by_test_id('dispatch-total')))
    f.get_by_label('Bags of Size 4').fill('0'); f.get_by_label('Bags of Size 5').fill('0'); f.get_by_test_id('dispatch-submit').click(); m.wait_for_timeout(300)
    check('an empty truck is never met with silence: it says what to do, and sends nothing', 'Put at least one size on the truck' in txt(f.get_by_test_id('dispatch-problems')) and len(dispatch_calls()) == 0)
    f.get_by_label('Bags of Size 4').fill('17'); f.get_by_label('Bags of Size 5').fill('2')
    check('a size loaded short of what was asked is flagged as it is typed', '1 fewer than asked' in txt(f))
    f.get_by_label('Bags of Size 5').fill('3')
    f.get_by_label('Vehicle number').fill('GT-7788-20'); f.get_by_label('Vehicle type').fill('Truck'); f.get_by_label('Driver name').fill('Kofi Mensah'); f.get_by_label('Driver phone').fill('0244000111')
    f.get_by_label('Labour cost in GHS').fill('120'); f.get_by_label('Transport in GHS').fill('300'); f.get_by_label('Other costs in GHS').fill('30'); f.get_by_label('What the other costs were').fill('Loading fee')
    f.get_by_test_id('dispatch-submit').click(); m.get_by_test_id('dispatch-sent').wait_for(); m.wait_for_timeout(500)
    sent = dispatch_calls(); body = sent[0]['body'] if sent else {}
    check('both sizes, the truck and the costs go in ONE request (no separate reports), with no kilograms', len(sent) == 1 and sorted(l['actualBagCount'] for l in body['lines']) == [3, 17] and all('actualKg' not in l for l in body['lines']) and body['vehiclePlateNumber'] == 'GT-7788-20' and body['driverName'] == 'Kofi Mensah' and body['submit'] is True, sent)
    ok = txt(m.get_by_test_id('dispatch-sent'))
    check('a confirmation says it was submitted for approval, both sizes together', 'Dispatch submitted' in ok and 'Size 4: 17 bags' in ok and 'Size 5: 3 bags' in ok and '20 bags in all' in ok and 'approved, or sent back, as one' in ok and re.search(r'DS-2026-\d{6}', ok) is not None, ok)
    DS1 = re.search(r'DS-2026-\d{6}', ok).group(0)
    check('the card now says it is waiting for the supervisor, and the manager is no longer asked to load it', 'Waiting for the supervisor to approve' in txt(card(m, REF).get_by_test_id('card-stage')) and 'With: Farm supervisor' in txt(card(m, REF).get_by_test_id('card-holder')) and card(m, REF).get_by_test_id('act-dispatch').count() == 0 and card(sec(m, 'desk-progress'), REF).count() == 1)
    check('the card shows the dispatch: both sizes, who prepared it, driver and vehicle', all(x in txt(card(m, REF).get_by_test_id('card-dispatch')) for x in [DS1, '20 bags (Size 4 17, Size 5 3)', 'Yaa Owusu', 'driver Kofi Mensah', 'vehicle GT-7788-20']))
    reps = [r for r in http('/__reports')[1] if r.get('dispatchRef') == DS1]
    check('on the server: two reports (one per size) under one dispatch, in review, the trip\'s cost recorded once', len(reps) == 2 and all(r['status'] == 'SUPERVISOR_REVIEW' for r in reps) and sum(r['totalDeliveryCost'] for r in reps) == 450 and sorted(r['totalDeliveryCost'] for r in reps) == [0, 450], reps)
    tk = http('/__tasks')[1]; notes = http('/__notes')[1]
    check('the farm manager\'s task is now in progress, and the supervisor was told once for the whole dispatch', tk[0]['status'] == 'IN_PROGRESS' and any(n['userIds'] == ['u-fsup'] and n['title'] == f'Dispatch ready for approval: {DS1}' and '20 bags (Size 4 17, Size 5 3)' in n['body'] for n in notes), notes)
    check('no page errors for the farm manager', not m.errors, m.errors[:2]); ctx.close()

    # =============== 4. The Farm Supervisor decides the WHOLE dispatch: sent back first, then approved ===============
    ctx, p = as_user(b, 'fsup'); p.goto(BASE + '/deliveries'); sec(p, 'desk-needs-action').wait_for(); sc = card(sec(p, 'desk-needs-action'), REF); sc.wait_for()
    check('the dispatch is waiting for the supervisor, who may review it, and nothing else', sc.get_by_test_id('act-review').count() == 1 and sc.get_by_test_id('act-send-draft').count() == 0 and sc.get_by_test_id('act-dispatch').count() == 0)
    sc.get_by_test_id('act-review').click(); det = p.get_by_test_id('dispatch-details'); det.wait_for(); dt = txt(det)
    check('the review window shows what was asked and where it goes, before any decision', all(x in dt for x in [f'{WH_NAME} ({WH_LOC})', 'Fri 9 Oct 2026', NOTE]))
    check('and what was loaded against it, both sizes', all(x in txt(det.get_by_test_id('dispatch-loaded')) for x in ['Size 4', 'Size 5', '17', '3', 'All sizes', '20']))
    check('and the truck and the cost', all(x in dt for x in ['Kofi Mensah (0244000111)', 'GT-7788-20, Truck', 'GHS 450', 'Loading fee']), dt)
    p.get_by_role('button', name='Reject', exact=True).click(); conf = p.get_by_role('button', name='Confirm rejection')
    check('sending it back needs a comment', conf.is_disabled())
    p.locator('#reject-comment').fill('The weights do not match the bags'); conf.click(); p.get_by_test_id('desk-notice').wait_for(); p.wait_for_timeout(400)
    rj = [c for c in calls() if c['path'].endswith('/reject') and 'dispatch' in c['path']]
    check('the supervisor\'s reason reaches the server for the whole dispatch', rj and rj[-1]['body'] == {'reason': 'The weights do not match the bags'}, rj)
    check('and the desk says it was sent back, with both sizes', 'Sent back to the farm manager: 20 bags (Size 4 17, Size 5 3).' in txt(p.get_by_test_id('desk-notice')))
    check('both reports were sent back together', all(r['status'] == 'REJECTED' for r in http('/__reports')[1] if r.get('dispatchRef') == DS1))
    ctx.close()

    ctx, m = as_user(b, 'fm'); m.goto(BASE + '/deliveries'); mc = card(sec(m, 'desk-needs-action'), REF); mc.wait_for()
    check('the farm manager has it again, with the reason, and is offered to prepare it again', 'The weights do not match the bags' in txt(mc.get_by_test_id('card-sentback')) and 'Prepare it again' in txt(mc.get_by_test_id('act-dispatch')))
    mc.get_by_test_id('act-dispatch').click(); f = mc.get_by_test_id('dispatch-form'); f.wait_for(); f.get_by_label('Bags of Size 4').wait_for(); f.page.wait_for_timeout(600)
    check('the form remembers the truck, the driver and the costs, and shows the reason', f.get_by_label('Driver name').input_value() == 'Kofi Mensah' and f.get_by_label('Vehicle number').input_value() == 'GT-7788-20' and f.get_by_label('Labour cost in GHS').input_value() == '120' and 'The weights do not match the bags' in txt(f))
    f.get_by_label('Remarks').fill('Re-weighed at the gate'); f.get_by_test_id('dispatch-submit').click(); m.get_by_test_id('dispatch-sent').wait_for(); DS2 = re.search(r'DS-2026-\d{6}', txt(m.get_by_test_id('dispatch-sent'))).group(0)
    check('it goes again as a NEW dispatch, and the old one stays as history', DS2 != DS1 and len([r for r in http('/__reports')[1] if r.get('dispatchRef') == DS2]) == 2)
    ctx.close()

    ctx, p = as_user(b, 'fsup'); p.goto(BASE + '/deliveries'); sc = card(sec(p, 'desk-needs-action'), REF); sc.wait_for(); sc.get_by_test_id('act-review').click(); p.get_by_test_id('dispatch-details').wait_for()
    p.get_by_role('button', name='Approve', exact=True).click(); p.get_by_test_id('desk-notice').wait_for(); p.wait_for_timeout(500)
    check('approving says both sizes are on the way to the warehouse', f'Approved: 20 bags (Size 4 17, Size 5 3) are now on the way to {WH_NAME}.' in txt(p.get_by_test_id('desk-notice')), txt(p.get_by_test_id('desk-notice')))
    ap = [c for c in calls() if c['path'].endswith('/approve') and 'dispatch' in c['path']]
    check('ONE approval for the whole dispatch', len(ap) == 1 and DS2 in ap[0]['path'])
    done = card(sec(p, 'desk-progress'), REF)
    check('the card is now on its way, with the driver and vehicle', f'On the way to {WH_NAME}' in txt(done.get_by_test_id('card-stage')) and 'driver Kofi Mensah' in txt(done.get_by_test_id('card-dispatch')) and 'vehicle GT-7788-20' in txt(done.get_by_test_id('card-dispatch')), txt(done))
    live = [r for r in http('/__reports')[1] if r.get('dispatchRef') == DS2]
    check('on the server both sizes left the farm together: two reports in transit and two shipments', len(live) == 2 and all(r['status'] == 'IN_TRANSIT' for r in live) and len(http('/__shipments')[1]) == 2, live)
    st = http('/__stockmap')[1]; check('and the farm\'s stock went down by exactly what was sent (17 of Size 4, 3 of Size 5)', st.get(G4) == 83 and st.get(G5) == 97, st)
    tk = http('/__tasks')[1]; notes = http('/__notes')[1]
    check('the farm manager\'s task is completed, and the receiving warehouse is told it is coming', tk[0]['status'] == 'COMPLETED' and tk[0]['completedById'] == 'u-fm' and any(n['userIds'] == ['u-wm1'] and n['title'] == 'Incoming: 20 bags (Size 4 17, Size 5 3)' for n in notes), notes)
    check('no page errors for the supervisor', not p.errors, p.errors[:2]); ctx.close()

    # =============== 5. A draft belongs to the person who prepared it ===============
    ctx, m = as_user(b, 'fm'); m.goto(BASE + '/deliveries'); c1 = card(sec(m, 'desk-needs-action'), 'RQ-2026-009001'); c1.wait_for(); c1.get_by_test_id('act-dispatch').click()
    f = c1.get_by_test_id('dispatch-form'); f.wait_for(); f.get_by_label('Bags of Size 4').wait_for(); f.page.wait_for_timeout(600); f.get_by_label('Bags of Size 4').fill('90'); f.get_by_test_id('dispatch-draft').click(); m.get_by_test_id('dispatch-sent').wait_for()
    check('saving as a draft says it is NOT sent yet', 'saved as a draft' in txt(m.get_by_test_id('dispatch-sent')) and 'not sent yet' in txt(m.get_by_test_id('dispatch-sent')))
    check('the farm manager can then send it for approval from the card', card(m, 'RQ-2026-009001').get_by_test_id('act-send-draft').count() == 1)
    ctx.close()
    ctx, p = as_user(b, 'fsup'); p.goto(BASE + '/deliveries'); c1 = card(p, 'RQ-2026-009001'); c1.wait_for()
    check('the supervisor sees the draft as still being prepared, with NO button to send it (it is not theirs)', c1.get_by_test_id('act-send-draft').count() == 0 and c1.get_by_test_id('act-review').count() == 0 and card(sec(p, 'desk-progress'), 'RQ-2026-009001').count() == 1)
    old = {'success': True, 'data': [{'id': 'old-draft', 'reportNumber': 'DR-2026-000777', 'status': 'DRAFT', 'submittedById': 'u-someone-else', 'dispatchRef': None, 'actualBagCount': 2, 'actualKg': 100, 'actualKgEstimated': False, 'farm': {'name': 'Nkawkaw Farm'}, 'destinationWarehouse': {'name': WH_NAME}, 'paddyGrade': {'label': 'Size 5'}, 'labourCost': 0, 'transportationFee': 0, 'otherCosts': 0, 'vehicle': None, 'driver': None, 'rejectionReason': None}]}
    p.route('**/api/delivery-reports', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(old)))
    p.goto(BASE + '/deliveries?tab=reports'); p.wait_for_selector('text=DR-2026-000777')
    check('on the older reports list, a draft someone else prepared shows no "Submit for approval" button (the exact error in the screenshot)', p.get_by_role('button', name='Submit for approval').count() == 0 and 'still being prepared by the farm manager' in p.inner_text('body'))
    ctx.close()
    ctx, mm = as_user(b, 'fm'); old['data'][0]['submittedById'] = 'u-fm'
    mm.route('**/api/delivery-reports', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(old)))
    mm.goto(BASE + '/deliveries?tab=reports'); mm.wait_for_selector('text=DR-2026-000777')
    check('whereas the person who prepared it is offered to submit it', mm.get_by_role('button', name='Submit for approval').count() == 1); ctx.close()

    # =============== 6. The same desk on both dashboards, and on My Office ===============
    ctx, d = as_user(b, 'fsup'); d.goto(BASE + '/dashboard'); box = d.get_by_test_id('dashboard-dispatch-desk'); box.wait_for(); box.get_by_test_id('request-card').first.wait_for()
    check('the Farm Supervisor\'s dashboard carries the Dispatch desk, with what waits for their decision first', 'Waiting for your decision' in txt(box) and card(box, 'RQ-2026-009002').get_by_test_id('act-review').count() == 1 and box.get_by_test_id('request-card').count() >= 3)
    check('and no page errors on the Farm Supervisor\'s dashboard', not d.errors, d.errors[:2]); ctx.close()
    ctx, d = as_user(b, 'fm'); d.goto(BASE + '/dashboard'); box = d.get_by_test_id('dashboard-dispatch-desk'); box.wait_for(); box.get_by_test_id('request-card').first.wait_for()
    check('the Farm Manager\'s dashboard carries the SAME desk, with their next move first', 'Your move' in txt(box) and box.get_by_test_id('act-dispatch').count() >= 1 and box.get_by_test_id('act-review').count() == 0)
    check('and no page errors on the Farm Manager\'s dashboard', not d.errors, d.errors[:2]); ctx.close()
    ctx, o = as_user(b, 'fm'); o.goto(BASE + '/office'); o.get_by_test_id('dispatch-desk').wait_for(); o.get_by_test_id('request-card').first.wait_for()
    check('My Office shows the same desk for the farm manager, with their next move', o.get_by_test_id('act-dispatch').count() >= 1 and not o.errors, o.errors[:2]); ctx.close()

    # =============== 7. A phone ===============
    ctx, ph = as_user(b, 'fm', viewport={'width': 390, 'height': 844}); ph.goto(BASE + '/deliveries'); c = card(sec(ph, 'desk-needs-action'), 'RQ-2026-009005'); c.wait_for(); c.get_by_test_id('act-dispatch').click(); c.get_by_test_id('dispatch-form').wait_for(); ph.wait_for_timeout(400)
    check('on a phone the desk and the dispatch form do not scroll sideways', ph.evaluate('document.documentElement.scrollWidth - window.innerWidth') <= 1, ph.evaluate('document.documentElement.scrollWidth'))
    ctx.close()

    # =============== 8. Receiving a shipment by counting bags ===============
    reset(); ctx, w = as_user(b, 'wm1'); w.goto(BASE + '/shipments'); w.get_by_role('button', name='Receive this shipment').first.click()
    check('the hint uses the shipment\'s own weight per bag (5,200 kg for 100 bags is 52 a bag), not a flat 50', '52 KG/bag' in w.inner_text('body'))
    w.get_by_role('button', name='Confirm receipt').click(); w.wait_for_timeout(700); c = [x for x in calls() if 'shipments' in x['path'] and x['path'].endswith('/receive')][-1]
    check('receiving by counting the bags sends NO kilograms: the server works them out', c['body']['receivedBags'] == 100 and 'receivedKg' not in c['body'], c)
    ctx.close()
    b.close()
sys.exit(1 if finish() else 0)
