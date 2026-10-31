import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

reset()
with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- the progress bar, the slow flag, the labels ----------
    ctx, p = as_user(b, 'sales1')
    for number, expected in [('SO-2026-000002', '1 of 7 steps done: With Finance Director'), ('SO-2026-000008', '6 of 7 steps done: On track'), ('SO-2026-000009', 'Delivered: sale complete'), ('SO-2026-000010', 'Stopped: Rejected by the MD')]:
        open_order(p, number)
        check(f'tracker on {number} reads "{expected}"', detail(p).get_by_test_id('tracker-label').inner_text() == expected, detail(p).get_by_test_id('tracker-label').inner_text())
    open_order(p, 'SO-2026-000009'); bar = detail(p).get_by_role('progressbar')
    check('a delivered order\'s bar is full (100%) and has seven segments', bar.get_attribute('aria-valuenow') == '100' and bar.locator('span').count() == 7)
    check('an order only 30 hours with Finance is NOT flagged as slow', row(p, 'SO-2026-000002').get_by_test_id('slow-flag').count() == 0)
    ctx.close()

    ctx, p = as_user(b, 'fd'); p.goto(BASE + '/sales'); p.wait_for_selector('table tbody tr'); show_all(p)
    flag = row(p, 'SO-2026-000003').get_by_test_id('slow-flag')
    check('an order waiting 3 days with Finance is flagged in the list', flag.count() == 1 and 'waiting a while' in flag.inner_text() and '3 days' in flag.inner_text(), flag.inner_text() if flag.count() else 'no flag')
    row(p, 'SO-2026-000003').click(); p.wait_for_selector('[data-testid=holder-banner]')
    check('and the order\'s banner says so too', 'This has been waiting a while' in detail(p).get_by_test_id('holder-banner').inner_text())
    ctx.close()
    ctx, p = as_user(b, 'wm1'); p.goto(BASE + '/sales'); p.wait_for_selector('table tbody tr')
    check('a warehouse manager\'s list is labelled for their warehouse, not "All orders"', p.get_by_role('button', name='Orders at my warehouse (3)').count() == 1, p.locator('[aria-label="Which orders to show"]').inner_text())
    ctx.close()

    # ---------- a phone-sized screen ----------
    reset(); ctx, p = as_user(b, 'sales1', viewport={'width': 390, 'height': 844}); open_order(p, 'SO-2026-000001'); d = detail(p)
    overflow = p.evaluate('document.documentElement.scrollWidth - window.innerWidth')
    check('on a phone the order page does not scroll sideways', overflow <= 1, overflow)
    check('on a phone both receipt buttons are on screen and big enough to tap', all(d.get_by_text(t).bounding_box()['height'] >= 30 and d.get_by_text(t).bounding_box()['x'] >= 0 and d.get_by_text(t).bounding_box()['x'] + d.get_by_text(t).bounding_box()['width'] <= 392 for t in ['Take a photo', 'Choose a photo or PDF']))
    ctx.close()
    reset(); ctx, p = as_user(b, 'admin', viewport={'width': 390, 'height': 844}); p.goto(BASE + '/expenses'); p.wait_for_selector('text=EXP-2026-000001')
    p.locator('tr', has_text='EXP-2026-000001').first.get_by_role('button', name='Review').click(); dlg = p.locator('[role=dialog]:has(#review-title)'); dlg.wait_for()
    bb = dlg.bounding_box()
    check('on a phone the review window fits the screen', bb['x'] >= -1 and bb['x'] + bb['width'] <= 391 and bb['y'] >= -1 and bb['y'] + bb['height'] <= 845, bb)
    dlg.get_by_role('button', name='Reject', exact=True).scroll_into_view_if_needed()
    check('and its decision buttons can be reached by scrolling inside it', dlg.get_by_role('button', name='Reject', exact=True).is_visible())
    ctx.close(); b.close()
sys.exit(1 if finish() else 0)
