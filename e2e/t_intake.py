import os, re, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

G4 = '44444444-4444-4444-8444-444444444444'; FARM = '33333333-3333-4333-8333-333333333333'
def intake_calls(): return [c for c in calls() if c['path'].endswith('/paddy-entries/intake')]
def rows_of(p): return p.locator('tbody tr').filter(has_text='PE-')

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # =============== 1. the Paddy entries page: ONE intake, several sizes, clear feedback ===============
    reset(); ctx, p = as_user(b, 'admin'); p.goto(BASE + '/paddy-entries'); p.wait_for_selector('text=Paddy entries')
    p.get_by_role('button', name='Log paddy intake').click(); form = p.get_by_test_id('intake-form'); form.wait_for()
    check('the farm is chosen automatically when there is only one, and the date is filled in', form.locator('#intake-farm').input_value() == FARM and form.locator('#intake-date').input_value() != '')
    check('kilograms are optional and the form says so', 'optional' in form.inner_text().lower() and form.get_by_label('Kilograms, line 1, optional').count() == 1)
    form.get_by_test_id('intake-submit').click(); p.wait_for_timeout(300)
    check('submitting an empty form is never met with silence: it says what to fix, and sends nothing', 'Add at least one size with its bags' in form.get_by_test_id('intake-problems').inner_text() and len(intake_calls()) == 0)
    form.get_by_label('Size, line 1').select_option(label='Size 4'); form.get_by_label('Bags, line 1').fill('17')
    form.get_by_role('button', name='Add another size').click()
    check('a second line appears, and the size already chosen cannot be picked twice', form.get_by_test_id('intake-line').count() == 2 and form.get_by_label('Size, line 2').locator('option', has_text='Size 4').is_disabled())
    form.get_by_label('Size, line 2').select_option(label='Size 5'); form.get_by_label('Bags, line 2').fill('3')
    check('the total updates as you type: 20 bags (Size 4 17, Size 5 3)', '20 bags' in form.get_by_test_id('intake-total').inner_text() and 'Size 4 17' in form.get_by_test_id('intake-total').inner_text() and 'Size 5 3' in form.get_by_test_id('intake-total').inner_text(), form.get_by_test_id('intake-total').inner_text())
    form.get_by_test_id('intake-submit').click(); p.get_by_test_id('intake-success').wait_for(); p.wait_for_timeout(500)
    sent = intake_calls()
    check('both sizes went in ONE request, with no kilograms, not two separate ones', len(sent) == 1 and [l['bagCount'] for l in sent[0]['body']['lines']] == [17, 3] and all('weightKg' not in l for l in sent[0]['body']['lines']), sent)
    ok_card = p.get_by_test_id('intake-success'); txt = ok_card.inner_text()
    check('a confirmation says it was submitted, and that it is waiting for approval', 'Intake submitted' in txt and 'waiting for approval' in txt, txt)
    check('it lists each size with its bags, and says the kilograms were worked out from the bags', 'Size 4: 17 bags' in txt and 'Size 5: 3 bags' in txt and 'estimated from the bags' in txt and '20 bags in all' in txt, txt)
    check('it shows the intake reference', re.search(r'IN-2026-\d{6}', ok_card.get_by_test_id('intake-ref').inner_text()) is not None)
    check('the confirmation stays on screen (it does not vanish after a few seconds)', (p.wait_for_timeout(4500) or True) and p.get_by_test_id('intake-success').count() == 1)
    new_rows = rows_of(p)
    check('the list now shows both entries, submitted, tied together by the same intake reference', new_rows.count() >= 3 and p.get_by_test_id('entry-intake').count() == 2 and len(set(p.get_by_test_id('entry-intake').all_inner_texts())) == 1, p.get_by_test_id('entry-intake').all_inner_texts())
    check('the form is cleared and ready for the next intake', form.get_by_label('Bags, line 1').input_value() == '')

    # a failure says NOTHING was saved, and why, and keeps what was typed
    before = rows_of(p).count()
    http('/__farm_inactive', 'POST')
    form.get_by_label('Size, line 1').select_option(label='Size 4'); form.get_by_label('Bags, line 1').fill('5'); form.get_by_test_id('intake-submit').click(); p.get_by_test_id('intake-failure').wait_for()
    fail_card = p.get_by_test_id('intake-failure')
    check('a failure says plainly that the intake was NOT submitted and nothing was saved', 'NOT submitted' in fail_card.inner_text() and 'Nothing was saved' in fail_card.inner_text())
    check('and gives the reason the server gave', 'Farm not found or inactive' in fail_card.get_by_test_id('intake-failure-reason').inner_text(), fail_card.inner_text())
    check('what was typed is still there, and no half-saved entry appeared', form.get_by_label('Bags, line 1').input_value() == '5' and rows_of(p).count() == before)
    reset(); p.reload(); p.get_by_role('button', name='Log paddy intake').click(); form = p.get_by_test_id('intake-form'); form.wait_for()
    http('/__fail_next', 'POST'); form.get_by_label('Size, line 1').select_option(label='Size 5'); form.get_by_label('Bags, line 1').fill('2'); form.get_by_test_id('intake-submit').click(); p.get_by_test_id('intake-failure').wait_for()
    check('even an unexpected server failure is shown, with its message, rather than nothing', 'An unexpected error occurred' in p.get_by_test_id('intake-failure-reason').inner_text())
    check('a draft can be saved instead, and says it is NOT yet sent for approval', (form.get_by_label('Size, line 1').select_option(label='Size 4') or True) and (form.get_by_label('Bags, line 1').fill('4') or True) and (form.get_by_test_id('intake-draft').click() or True) and (p.get_by_test_id('intake-success').wait_for() or True) and 'saved as a draft' in p.get_by_test_id('intake-success').inner_text() and 'not sent for approval' in p.get_by_test_id('intake-success').inner_text())
    draft_row = rows_of(p).filter(has_text='DRAFT').first; draft_row.get_by_role('button', name='Submit', exact=True).click(); p.get_by_test_id('page-notice').wait_for()
    check('submitting a draft from the list also confirms it', 'submitted for approval' in p.get_by_test_id('page-notice').inner_text(), p.get_by_test_id('page-notice').inner_text())
    # the server's own rules, asked directly
    tok = 'tok-admin'; s1, r1 = http('/api/paddy-entries/intake', 'POST', tok, {'farmId': FARM, 'entryDate': '2026-10-05', 'lines': [{'paddyGradeId': G4, 'bagCount': 10}, {'paddyGradeId': G4, 'bagCount': 7}]})
    check('the server refuses the same size twice, by name', s1 == 400 and 'Size 4 is on the list twice' in r1['message'], r1)
    s2, r2 = http('/api/paddy-entries/intake', 'POST', tok, {'farmId': FARM, 'entryDate': '2026-10-05', 'lines': [{'paddyGradeId': G4, 'bagCount': 0}]})
    check('and a size with no bags, in words that say what to do', s2 == 400 and 'at least 1 bag' in r2['message'], r2)
    check('no page errors on the Paddy entries page', not p.errors, p.errors[:2]); ctx.close()

    # a phone
    reset(); ctx, p = as_user(b, 'admin', viewport={'width': 390, 'height': 844}); p.goto(BASE + '/paddy-entries'); p.get_by_role('button', name='Log paddy intake').click(); p.get_by_test_id('intake-form').wait_for()
    check('on a phone the intake form does not scroll sideways', p.evaluate('document.documentElement.scrollWidth - window.innerWidth') <= 1)
    ctx.close()

    # =============== 2. My Office: the same, one call, with the reason visible from the review panel ===============
    reset(); ctx, p = as_user(b, 'admin'); p.goto(BASE + '/office'); p.wait_for_selector('h2:has-text("Log paddy intake")')
    box = p.locator('div.rounded-2xl', has=p.locator('h2', has_text='Log paddy intake')).last
    check('the Review button explains why it is not available yet', box.get_by_test_id('intake-hint').count() == 1 and box.get_by_role('button', name=re.compile('^Review')).is_disabled())
    rows = box.locator('div.rounded-xl.border', has_text='Bag size / grade')
    rows.nth(0).get_by_role('button', name='Size 4', exact=True).click(); rows.nth(0).locator('input').first.fill('17')
    box.get_by_role('button', name='+ Add another size').click()
    rows.nth(1).get_by_role('button', name='Size 5', exact=True).click(); rows.nth(1).locator('input').first.fill('3')
    box.get_by_role('button', name=re.compile('^Review')).click(); box.get_by_role('button', name='Confirm & submit').click(); p.get_by_test_id('intake-success').wait_for(); p.wait_for_timeout(400)
    sent = intake_calls()
    check('My Office also sends both sizes as ONE intake (it used to save one, then the next)', len(sent) == 1 and [l['bagCount'] for l in sent[0]['body']['lines']] == [17, 3], sent)
    check('and confirms it, with both sizes listed', 'Intake submitted' in p.get_by_test_id('intake-success').inner_text() and 'Size 4: 17 bags' in p.get_by_test_id('intake-success').inner_text() and 'Size 5: 3 bags' in p.get_by_test_id('intake-success').inner_text())
    http('/__farm_inactive', 'POST'); rows.nth(0).get_by_role('button', name='Size 4', exact=True).click(); rows.nth(0).locator('input').first.fill('5')
    box.get_by_role('button', name=re.compile('^Review')).click(); box.get_by_role('button', name='Confirm & submit').click(); p.get_by_test_id('intake-failure').wait_for()
    check('when saving fails from the REVIEW panel, the reason is now shown (it used to be hidden there)', 'Farm not found or inactive' in p.get_by_test_id('intake-failure-reason').inner_text() and 'NOT submitted' in p.get_by_test_id('intake-failure').inner_text())
    check('no page errors on My Office', not p.errors, p.errors[:2]); ctx.close()

    # =============== 3. Adding a user: a temporary password you can see, keep, change or regenerate ===============
    reset(); ctx, p = as_user(b, 'admin', permissions=['clipboard-read', 'clipboard-write']); p.goto(BASE + '/users'); p.get_by_role('button', name='+ New user').click(); p.get_by_test_id('temp-password-field').wait_for()
    pw_box = p.get_by_test_id('new-user-password'); first = pw_box.input_value()
    check('a strong temporary password is already filled in, with a capital, a small letter and a digit', len(first) >= 10 and re.search('[A-Z]', first) and re.search('[a-z]', first) and re.search('[0-9]', first), first)
    p.get_by_test_id('generate-password').click(); second = pw_box.input_value()
    check('"Generate another" gives a different one', second != first and len(second) >= 10)
    p.get_by_test_id('toggle-password').click(); check('Hide / Show works', pw_box.get_attribute('type') == 'password'); p.get_by_test_id('toggle-password').click()
    p.get_by_placeholder('First name').fill('Nana'); p.get_by_placeholder('Last name').fill('Yeboah'); p.get_by_placeholder('Email').fill('nana.new@kam.local')
    pw_box.fill('Short1'); create = p.get_by_role('button', name='Create user')
    check('a password that is too short is explained, and cannot be used', create.is_disabled() and 'At least 10 characters (6 so far)' in p.get_by_test_id('password-help').inner_text(), p.get_by_test_id('password-help').inner_text())
    pw_box.fill('Harvest2026x'); check('your own temporary password is accepted', create.is_enabled())
    create.click(); p.get_by_test_id('credentials-box').wait_for(); p.wait_for_timeout(300)
    c = last_call('/users'); check('the password you chose is what was sent, and the account is created', c and c['body']['temporaryPassword'] == 'Harvest2026x' and c['body']['email'] == 'nana.new@kam.local', c)
    box = p.get_by_test_id('credentials-box'); t = box.inner_text()
    check('the account is confirmed with the sign-in address, email and temporary password', 'Account created for Nana' in t and '/login' in t and 'nana.new@kam.local' in t and p.get_by_test_id('credentials-password').inner_text() == 'Harvest2026x', t)
    check('and says they must choose their own on first sign-in', 'choose their own' in t)
    p.get_by_test_id('copy-message').click(); p.wait_for_timeout(300); clip = p.evaluate('navigator.clipboard.readText()')
    check('"Copy a message" puts a ready-to-send message on the clipboard', all(x in clip for x in ['Hello Nana', '/login', 'nana.new@kam.local', 'Harvest2026x', 'choose your own password']), clip)
    check('the new person appears in the list', p.locator('tbody tr', has_text='nana.new@kam.local').count() == 1)
    check('no page errors on the Users page', not p.errors, p.errors[:2]); ctx.close()

    # =============== 4. Kilograms are optional wherever things are dispatched ===============
    reset(); ctx, p = as_user(b, 'fm'); p.goto(BASE + '/deliveries'); c1 = p.locator('[data-testid=request-card][data-request="RQ-2026-009001"]'); c1.wait_for()
    c1.get_by_test_id('act-dispatch').click(); f = c1.get_by_test_id('dispatch-form'); f.wait_for()
    check('the dispatch form says kilograms are optional', 'optional' in f.inner_text().lower() or f.get_by_label('Kilograms of Size 4, optional').count() == 1)
    f.get_by_label('Bags of Size 4').fill('80'); f.get_by_test_id('dispatch-submit').click(); p.get_by_test_id('dispatch-sent').wait_for(); p.wait_for_timeout(300)
    c = last_call('/delivery-reports/dispatch'); check('a dispatch with only the bags goes through (no kilograms sent)', c and c['body']['lines'][0]['actualBagCount'] == 80 and 'actualKg' not in c['body']['lines'][0], c)
    rep = http('/__reports')[1]; check('the server works the kilograms out at the order\'s own 50 kg a bag (80 x 50 = 4,000) and marks them as an estimate', rep and rep[-1]['actualKg'] == 4000 and rep[-1]['actualKgEstimated'] is True, rep[-1] if rep else rep)
    check('no page errors on the Dispatch page', not p.errors, p.errors[:2]); ctx.close()

    reset(); ctx, p = as_user(b, 'admin'); p.goto(BASE + '/office'); p.wait_for_selector('text=Total KG', state='attached') if False else p.wait_for_timeout(1500)
    def fill_selects(container, picks):
        for i, idx in enumerate(picks): container.locator('select').nth(i).select_option(index=idx)
    # stock transfer: bags only
    tkg = p.get_by_placeholder('Total KG (optional)'); tkg.wait_for(); grid = tkg.locator('xpath=..')
    fill_selects(grid, [1, 1, 1, 1]); grid.get_by_placeholder('Bag count').fill('40'); btn = grid.get_by_role('button', name=re.compile('Dispatch|Send|Transfer', re.I)).last
    check('a stock transfer can be sent with only the bags (the kilograms are the bags times the pack size)', btn.is_enabled())
    btn.click(); p.wait_for_timeout(700); c = last_call('/stock-transfers')
    check('and no kilograms are sent', c and c['body']['bagCount'] == 40 and 'totalKg' not in c['body'], c)
    p.get_by_text(re.compile(r'2\. Receive')).first.click(); rkg = p.get_by_placeholder('KG received (optional)'); rkg.wait_for(); rgrid = rkg.locator('xpath=..').locator('xpath=..')
    rgrid.locator('select').first.select_option(index=1); p.get_by_placeholder('Bags actually received').fill('40'); rbtn = p.get_by_role('button', name='Confirm receipt')
    check('a transfer can be received with only the bags', rbtn.is_enabled()); rbtn.click(); p.wait_for_timeout(700); c = [x for x in calls() if x['path'].endswith('/receive') and 'stock-transfers' in x['path']][-1]
    check('with no kilograms sent', c['body']['receivedBagCount'] == 40 and 'receivedKg' not in c['body'], c)
    # paddy request
    qkg = p.get_by_placeholder('KG needed (optional)'); qgrid = qkg.locator('xpath=..'); fill_selects(qgrid, [1, 1]); p.get_by_placeholder('Bags needed').fill('40'); qbtn = qgrid.locator('xpath=..').get_by_role('button', name=re.compile('Send|Request', re.I)).last
    check('a paddy request needs only the bags', qbtn.is_enabled()); qbtn.click(); p.wait_for_timeout(700); c = last_call('/paddy-requests')
    check('and sends no kilograms', c and c['body']['requestedBagCount'] == 40 and 'requestedKg' not in c['body'], c)
    check('no page errors on My Office', not p.errors, p.errors[:2]); ctx.close()

    b.close()
sys.exit(1 if finish() else 0)
