import os, re, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

def req_calls(): return [c for c in calls() if c['path'].endswith('/delivery-orders/request')]

with sync_playwright() as pw:
    b = pw.chromium.launch()
    reset()
    dirs = http('/api/warehouses/directory', 'GET', 'tok-admin')[1]['data']
    WH = dirs[0]; WH_NAME, WH_LOC, WH_ID = WH['name'], WH['location'], WH['id']
    check('the warehouse list now says where each warehouse is', all(d.get('location') for d in dirs), dirs)

    # =============== 1. The Farm Supervisor follows each dispatch, wherever it is ===============
    ctx, p = as_user(b, 'fsup'); p.goto(BASE + '/deliveries'); p.wait_for_selector('text=DO-2026-009001')
    row = lambda n: p.locator('tbody tr', has_text=n).first
    r1, r2, r3, r4, r5 = [row(f'DO-2026-00900{i}') for i in range(1, 6)]
    check('REQUESTED: waiting for the farm manager, who has it', 'Waiting for the farm manager to start loading' in r1.get_by_test_id('tracker-stage').inner_text() and 'With: Farm manager' in r1.get_by_test_id('tracker-holder').inner_text())
    check('IN REVIEW: waiting for the supervisor, who has it', 'Waiting for the supervisor to approve' in r2.get_by_test_id('tracker-stage').inner_text() and 'With: Farm supervisor' in r2.get_by_test_id('tracker-holder').inner_text())
    check('ON THE WAY: names the warehouse it is heading to', f'On the way to {WH_NAME}' in r3.get_by_test_id('tracker-stage').inner_text())
    r3.get_by_role('button', name='Track').click()
    steps = r3.get_by_test_id('tracker-steps').inner_text()
    check('and the Track timeline shows the driver and vehicle, and who approved it', 'Driver Yaw Boateng, vehicle GT-5521-21' in steps and 'Efua Mensah' in steps, steps)
    check('ARRIVED: says so, and that 2 bags were short and need approval', f'Received at {WH_NAME}' in r4.get_by_test_id('tracker-stage').inner_text() and '2 bags short on arrival' in r4.get_by_test_id('tracker-variance').inner_text() and 'Needs approval' in r4.get_by_test_id('tracker-variance').inner_text())
    r4.get_by_role('button', name='Track').click(); check('the timeline says how many bags arrived against what left', '96 bags received (-2 bags against what left)' in r4.get_by_test_id('tracker-steps').inner_text())
    check('SENT BACK: back with the farm manager, with the reason', 'Sent back to the farm manager' in r5.get_by_test_id('tracker-stage').inner_text() and 'The weight does not match the bags' in r5.get_by_test_id('tracker-sentback').inner_text())
    has_btn = lambda r: r.get_by_role('button', name='Log delivery report').count() == 1
    check('a report can be logged only where it makes sense (not while in review, on the road, or arrived)', has_btn(r1) and has_btn(r5) and not has_btn(r2) and not has_btn(r3) and not has_btn(r4))

    # =============== 2. Asking the farm manager: every detail, in one request ===============
    p.get_by_role('button', name='Ask a farm manager to dispatch').click(); form = p.get_by_test_id('request-form'); form.wait_for()
    p.get_by_test_id('request-send').click(); p.wait_for_timeout(300)
    probs = p.get_by_test_id('request-problems').inner_text()
    check('an empty request is never met with silence: it says what is missing, and sends nothing', all(x in probs for x in ['Choose the farm', 'Choose the warehouse', 'needed at the warehouse', 'Add at least one size']) and len(req_calls()) == 0, probs)
    wh_options = form.locator('#req-warehouse option').all_inner_texts()
    check('the warehouse choices say WHERE each one is', f'{WH_NAME} - {WH_LOC}' in wh_options, wh_options)
    form.locator('#req-farm').select_option(index=1); form.locator('#req-warehouse').select_option(label=f'{WH_NAME} - {WH_LOC}')
    check('choosing one spells out where the farm manager will be told to send it', f'{WH_NAME} ({WH_LOC})' in p.get_by_test_id('request-destination').inner_text(), p.get_by_test_id('request-destination').inner_text())
    form.locator('#req-date').fill('2026-10-09'); form.locator('#req-priority').select_option('HIGH')
    NOTE = 'Load the Size 4 first. The truck leaves at 6am.'
    form.locator('#req-notes').fill(NOTE)
    form.get_by_label('Size, line 1').select_option(label='Size 4'); form.get_by_label('Bags, line 1').fill('17')
    form.get_by_role('button', name='+ Add another size').click(); form.get_by_label('Size, line 2').select_option(label='Size 5'); form.get_by_label('Bags, line 2').fill('3')
    check('the total updates: 20 bags across 2 sizes', '20 bags in all, across 2 sizes' in p.get_by_test_id('request-total').inner_text())
    p.get_by_test_id('request-send').click(); p.get_by_test_id('request-sent').wait_for(); p.wait_for_timeout(500)
    sent = req_calls()
    check('both sizes, the warehouse, the date, the priority and the instruction go in ONE request', len(sent) == 1 and [l['bagCount'] for l in sent[0]['body']['lines']] == [17, 3] and sent[0]['body']['destinationWarehouseId'] == WH_ID and sent[0]['body']['requestedDate'] == '2026-10-09' and sent[0]['body']['priority'] == 'HIGH' and sent[0]['body']['notes'] == NOTE, sent)
    card = p.get_by_test_id('request-sent').inner_text()
    check('a confirmation says it was sent, where to, by when, and what', 'Dispatch request sent' in card and f'{WH_NAME} ({WH_LOC})' in card and 'Fri 9 Oct 2026' in card and 'Size 4: 17 bags' in card and 'Size 5: 3 bags' in card and '20 bags in all' in card, card)
    check('it says WHO now has it, as which task', 'Yaa Owusu' in card and re.search(r'TASK-2026-\d{6}', p.get_by_test_id('request-tasks').inner_text()) is not None and NOTE in card, card)
    new_rows = p.locator('tbody tr[data-focus-request="true"]')
    check('the two new orders are in the list, highlighted, waiting for the farm manager', new_rows.count() == 2 and all('Waiting for the farm manager to start loading' in t for t in new_rows.locator('[data-testid=tracker-stage]').all_inner_texts()))
    tasks = http('/__tasks')[1]; notes = http('/__notes')[1]
    check('it AUTOMATICALLY became a task for the farm manager, due on the date it is needed', len(tasks) == 1 and tasks[0]['assignedToId'] == 'u-fm' and tasks[0]['dueDate'].startswith('2026-10-09') and tasks[0]['title'] == f'Dispatch 20 bags to {WH_NAME}', tasks)
    check('and the farm manager was notified, by name, of what is being asked', len(notes) == 1 and notes[0]['userIds'] == ['u-fm'] and 'Efua Mensah asks you to dispatch 20 bags' in notes[0]['body'] and WH_NAME in notes[0]['body'], notes)

    # =============== 3. The Farm Manager gets the task, knows where to go, and can act on it ===============
    ctx2, m = as_user(b, 'fm'); m.goto(BASE + '/tasks'); m.get_by_test_id('task-description').first.wait_for()
    d = m.get_by_test_id('task-description').first.inner_text()
    for line in [f'Dispatch from Nkawkaw Farm to {WH_NAME} ({WH_LOC}).', 'Needed there by: Fri 9 Oct 2026.', 'Priority: HIGH.', '- Size 4: 17 bags', '- Size 5: 3 bags', 'Total: 20 bags.', 'Who to ask at the warehouse: Kwabena Adjei (0244111222).', f'Instructions from Efua Mensah: {NOTE}', 'log a dispatch report for each size']:
        check(f'the farm manager\'s task says: {line[:60]}', line in d, d)
    check('and shows the destination at a glance', f'To: {WH_NAME} ({WH_LOC})' in m.get_by_test_id('task-destination').first.inner_text())
    m.get_by_test_id('open-dispatch').first.click(); m.wait_for_selector('tbody tr[data-focus-request="true"]')
    check('"Open the dispatch" goes to the dispatch page with that request\'s orders highlighted', '/deliveries?request=RQ-' in m.url and m.locator('tbody tr[data-focus-request="true"]').count() == 2, m.url)
    m.locator('tbody tr[data-focus-request="true"]').first.get_by_role('button', name='Log delivery report').click(); m.get_by_test_id('order-brief').wait_for()
    check('logging the report starts with the brief: where it goes, with its location', m.get_by_test_id('brief-warehouse').inner_text() == WH_NAME and WH_LOC in m.get_by_test_id('brief-location').inner_text())
    check('and the supervisor\'s instruction', NOTE in m.get_by_test_id('brief-notes').inner_text() and 'Efua Mensah' in m.get_by_test_id('brief-notes').inner_text())
    m.goto(BASE + '/office'); tab = m.get_by_role('button', name=re.compile(r'^2\. Submit report')); tab.wait_for(); tab.click(); sel = m.locator('select', has=m.locator('option', has_text='Which order is this for?'))
    sel.first.wait_for(); opts = sel.first.locator('option').all_inner_texts(); idx = next(i for i, t in enumerate(opts) if 'Size 4, 17 bags' in t)
    check('on My Office, the order list says where each one goes, with the location', f'{WH_NAME} ({WH_LOC})' in opts[idx], opts[idx])
    sel.first.select_option(index=idx); check('and picking one shows the whole brief', NOTE in m.get_by_test_id('brief-notes').inner_text() and m.get_by_test_id('brief-warehouse').inner_text() == WH_NAME)
    check('no page errors for the farm manager', not m.errors, m.errors[:2]); ctx2.close()

    # =============== 4. When it cannot be done, or nobody is there to do it ===============
    before = p.locator('tbody tr').count(); http(f'/__stock?g={G4}&n=5' if False else '/__stock?g=44444444-4444-4444-8444-444444444444&n=5', 'POST')
    form.locator('#req-farm').select_option(index=1); form.locator('#req-warehouse').select_option(label=f'{WH_NAME} - {WH_LOC}'); form.locator('#req-date').fill('2026-10-09')
    form.get_by_label('Size, line 1').select_option(label='Size 4'); form.get_by_label('Bags, line 1').fill('17'); p.get_by_test_id('request-send').click(); p.get_by_test_id('request-failed').wait_for()
    check('a request the farm cannot cover says it was NOT sent, nothing was saved, and why', 'NOT sent' in p.get_by_test_id('request-failed').inner_text() and 'Nothing was saved' in p.get_by_test_id('request-failed').inner_text() and 'only has 5 bag(s)' in p.get_by_test_id('request-failed-reason').inner_text() and 'cannot request 17' in p.get_by_test_id('request-failed-reason').inner_text(), p.get_by_test_id('request-failed').inner_text())
    check('what was typed is still there, and no half-saved order appeared', form.get_by_label('Bags, line 1').input_value() == '17' and p.locator('tbody tr').count() == before)
    reset(); http('/__no_manager', 'POST'); p.reload(); p.get_by_role('button', name='Ask a farm manager to dispatch').click(); form = p.get_by_test_id('request-form'); form.wait_for()
    form.locator('#req-farm').select_option(index=1); form.locator('#req-warehouse').select_option(label=f'{WH_NAME} - {WH_LOC}'); form.locator('#req-date').fill('2026-10-09')
    form.get_by_label('Size, line 1').select_option(label='Size 4'); form.get_by_label('Bags, line 1').fill('10'); p.get_by_test_id('request-send').click(); p.get_by_test_id('request-sent').wait_for()
    check('a farm with no manager is never a silent miss: the card warns that nobody was given the task', 'no manager assigned' in p.get_by_test_id('request-no-task').inner_text() and len(http('/__tasks')[1]) == 0, p.get_by_test_id('request-no-task').inner_text())
    p.set_viewport_size({'width': 390, 'height': 844}); p.reload(); p.get_by_role('button', name='Ask a farm manager to dispatch').click(); p.get_by_test_id('request-form').wait_for()
    check('on a phone the request form does not scroll sideways', p.evaluate('document.documentElement.scrollWidth - window.innerWidth') <= 1)
    check('no page errors for the supervisor', not p.errors, p.errors[:2]); ctx.close()

    # =============== 5. Receiving a shipment by counting bags: no kilograms needed, and the hint uses the shipment's own weight per bag ===============
    reset(); ctx, w = as_user(b, 'wm1'); w.goto(BASE + '/shipments'); w.get_by_role('button', name='Receive this shipment').first.click()
    check('the hint uses the shipment\'s own weight per bag (5,200 kg for 100 bags is 52 a bag), not a flat 50', '52 KG/bag' in w.inner_text('body'), 'hint missing')
    w.get_by_role('button', name='Confirm receipt').click(); w.wait_for_timeout(700); c = [x for x in calls() if 'shipments' in x['path'] and x['path'].endswith('/receive')][-1]
    check('receiving by counting the bags sends NO kilograms: the server works them out', c['body']['receivedBags'] == 100 and 'receivedKg' not in c['body'], c)
    check('no page errors for the warehouse manager', not w.errors, w.errors[:2]); ctx.close()
    b.close()
sys.exit(1 if finish() else 0)
