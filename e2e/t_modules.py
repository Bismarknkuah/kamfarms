import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

def dialog(p): return p.locator('[role=dialog][aria-modal=true]:has(#review-title)')
def reject_flow(p, call_suffix, comment, label):
    dlg = dialog(p); dlg.wait_for()
    dlg.get_by_role('button', name='Reject', exact=True).click()
    conf = dlg.get_by_role('button', name='Confirm rejection')
    check(f'{label}: rejecting asks for a comment and cannot be confirmed empty', conf.is_disabled() and dlg.get_by_text('A comment is required when rejecting').count() == 1)
    dlg.locator('#reject-comment').fill('no'); check(f'{label}: two letters are not enough', conf.is_disabled())
    dlg.locator('#reject-comment').fill(comment); check(f'{label}: a real comment enables it', conf.is_enabled())
    conf.click(); p.wait_for_timeout(900)
    c = last_call(call_suffix); check(f'{label}: the exact comment reached the server (validated by the real rejection form)', c and c['body'] == {'reason': comment}, c)
    check(f'{label}: the window closes after the decision', dialog(p).count() == 0)

def find_row(p, number, card):
    if not card: return p.locator('tr', has_text=number).first
    return p.locator('div', has_text=number).filter(has=p.get_by_role('button', name='Review')).last

def screen(b, path, number, ident, shows, calls_prefix, label, comment, approve_suffix='/approve', tab=None, card=False):
    reset(); ctx, p = as_user(b, 'admin'); p.goto(BASE + path)
    if tab: p.get_by_role('button', name=tab).click()
    p.wait_for_selector(f'text={number}')
    rw = find_row(p, number, card)
    check(f'{label}: the row has a Review button, and no bare Approve/Reject buttons', rw.get_by_role('button', name='Review').count() == 1 and rw.get_by_role('button', name='Approve').count() == 0 and rw.get_by_role('button', name='Reject', exact=True).count() == 0)
    rw.get_by_role('button', name='Review').click(); dlg = dialog(p); dlg.wait_for()
    txt = dlg.inner_text()
    check(f'{label}: the details are in the window before any decision', all(x in txt for x in shows) and 'read the details first' in txt.lower(), [x for x in shows if x not in txt])
    check(f'{label}: the window has Approve and Reject, and closes with Escape', dlg.get_by_role('button', name=__import__("re").compile('^(Approve|Verify)')).count() >= 1)
    p.keyboard.press('Escape'); check(f'{label}: Escape closes it without deciding', dialog(p).count() == 0 and not [c for c in calls() if c['path'].endswith('/reject') or c['path'].endswith(approve_suffix)])
    rw.get_by_role('button', name='Review').click(); reject_flow(p, '/reject', comment, label)
    reset(); p.reload()
    if tab: p.get_by_role('button', name=tab).click()
    p.wait_for_selector(f'text={number}'); find_row(p, number, card).get_by_role('button', name='Review').click(); dialog(p).wait_for()
    dialog(p).get_by_role('button', name=__import__("re").compile('^(Approve|Verify)')).first.click(); p.wait_for_timeout(900)
    c = last_call(approve_suffix); check(f'{label}: approving inside the window works', c and c['item'] == ident, c)
    check(f'{label}: no page errors', not p.errors, p.errors[:2]); ctx.close()

with sync_playwright() as pw:
    b = pw.chromium.launch()
    screen(b, '/expenses', 'EXP-2026-000001', 'e1', ['GHS 450', 'Fuel', 'Yaa Owusu', 'Diesel for the tractor', 'INV-7731'], '/expenses', 'Expenses', 'Receipt does not match the diesel quantity')
    reset(); ctx, p = as_user(b, 'admin'); p.goto(BASE + '/expenses'); p.wait_for_selector('text=EXP-2026-000001'); p.locator('tr', has_text='EXP-2026-000001').first.get_by_role('button', name='Review').click(); dialog(p).wait_for()
    check('Expenses: the receipt photo is shown in the window', dialog(p).locator('img[alt=Receipt]').evaluate('i => i.complete && i.naturalWidth > 0')); ctx.close()
    screen(b, '/paddy-entries', 'PE-2026-000001', 'pe1', ['2,500 KG', 'Nkawkaw Farm', 'Size 4', 'Dry and clean', 'Mensah Farms', '14.2%'], '/paddy-entries', 'Paddy entries', 'Weight looks too high for 50 bags')
    screen(b, '/production', 'PR-2026-000001', 'pr1', ['Tamale Mill', '3,300', 'Broken rice', 'Rice hull', '66.0%', 'PE-2026-000001'], '/production-records', 'Production', 'Recovery is too low for this machine')
    screen(b, '/deliveries', 'DR-2026-000001', 'dr1', ['Nkawkaw Farm', 'Tamale Warehouse', 'GT-5521-21', 'GHS 770', 'Yaw Boateng'], '/delivery-reports', 'Deliveries', 'Weight on the waybill is different', tab='Dispatch reports', card=True)

    # ---------- My Office: the shared queues ----------
    reset(); ctx, p = as_user(b, 'admin'); p.goto(BASE + '/office'); p.wait_for_selector('h2:has-text("Paddy entries")')
    def box(title): return p.locator('div.rounded-2xl', has=p.locator('h2', has_text=title)).last
    for title, shows, suffix, comment in [('Paddy entries', ['2,500 KG', 'Nkawkaw Farm'], '/reject', 'Moisture is above our limit'), ('Payments to verify', ['GHS 5,000', 'Koforidua Wholesale', 'Akosua Frimpong'], '/reject', 'Not on the bank statement'), ('Production records', ['Tamale Mill', '66.0%'], '/reject', 'Quantities do not add up')]:
        reset(); p.reload(); p.wait_for_selector(f'h2:has-text("{title}")')
        bx = box(title); bx.get_by_role('button', name='Review').wait_for(); check(f'Office, {title}: no bare Approve/Reject buttons, only Review', bx.get_by_role('button', name='Review').count() == 1 and bx.get_by_role('button', name='Approve').count() == 0 and bx.get_by_role('button', name='Reject', exact=True).count() == 0)
        bx.get_by_role('button', name='Review').click(); dialog(p).wait_for(); t = dialog(p).inner_text()
        check(f'Office, {title}: details shown first', all(x in t for x in shows), [x for x in shows if x not in t])
        reject_flow(p, suffix, comment, f'Office, {title}')
    reset(); p.reload(); p.wait_for_selector('h2:has-text("System reset requests")'); bx = box('System reset requests')
    bx.get_by_role('button', name='Review').click(); dialog(p).wait_for()
    check('Office, resets: the window warns that data may be removed and shows the request', 'permanently remove data' in dialog(p).inner_text() and 'Clearing demo data before go-live' in dialog(p).inner_text())
    reject_flow(p, '/reject', 'We are not ready to clear this yet', 'Office, resets (a reset could not be rejected here before)')
    reset(); p.reload(); p.wait_for_selector('h2:has-text("Inventory correction requests")'); bx = box('Inventory correction requests')
    bx.get_by_role('button', name='Reject', exact=True).click()
    conf = bx.get_by_role('button', name='Confirm rejection')
    check('Office, stock corrections: rejecting asks for a comment first', conf.is_disabled() and bx.get_by_text('A comment is required when rejecting').count() == 1)
    bx.locator('textarea').fill('ab'); check('Office, stock corrections: two letters are not enough', conf.is_disabled())
    bx.locator('textarea').fill('Recount the shed before correcting'); conf.click(); p.wait_for_timeout(900)
    c = last_call('/reject'); check('Office, stock corrections: the typed comment (not a canned sentence) was sent', c and c['body'] == {'reason': 'Recount the shed before correcting'}, c)
    check('Office: no page errors', not p.errors, p.errors[:2]); ctx.close()
    b.close()
sys.exit(1 if finish() else 0)
