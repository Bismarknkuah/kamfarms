import os, re, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import urllib.parse

def num(text):
    m = re.search(r'-?[\d,]*\.?\d+', text.replace('\u00a0', ' ')); return float(m.group(0).replace(',', '')) if m else None
def close(ui, exp):
    dec = 2 if exp < 10 else 1 if exp < 100 else 0   # the page rounds the same way a person would read it
    return ui is not None and abs(ui - exp) <= 0.5 * 10 ** (-dec) + 1e-9
def expect(mode, amount, scope): return http('/__expect?' + urllib.parse.urlencode({'mode': mode, 'amount': amount, 'scope': scope}))[1]

def calculate(p, mode, amount, scope_label=None):
    p.get_by_test_id(f'mode-{mode}').click()
    if scope_label: p.get_by_test_id('calc-scope').select_option(label=scope_label)
    else: p.get_by_test_id('calc-scope').select_option(index=0)
    box = p.get_by_test_id('calc-input'); box.fill(''); box.fill(str(amount)); p.wait_for_timeout(250)
    g = lambda t: num(p.get_by_test_id(t).inner_text())
    return {'rice': g('out-rice-bags'), 'broken': g('out-broken-bags'), 'hull': g('out-hull-bags'), 'kwh': g('calc-kwh') if mode != 'power' else None, 'paddy': g('calc-paddy-bags') if mode != 'paddy' else None}

reset()
with sync_playwright() as pw:
    b = pw.chromium.launch()
    SCENARIOS = [  # (mode, amount, scope label for the page, scope key for the real maths)
        ('paddy', 5, 'Size 4', 'grade:Size 4'),          # "when they milled 5 bags of Size 4"
        ('paddy', 5, 'Size 5', 'grade:Size 5'),
        ('rice', 100, None, 'all'),                      # "I recovered / I want 100 bags of rice"
        ('rice', 50, 'Size 4', 'grade:Size 4'),
        ('power', 10, 'Tamale Mill', 'center:Tamale Mill'),
        ('paddy', 1000, None, 'all'),
        ('rice', 0.5, 'Kumasi Mill', 'center:Kumasi Mill'),
    ]
    for who_, label in [('md', 'the MD'), ('ceo', 'the CEO'), ('ops', 'the Operations Manager')]:
        ctx, p = as_user(b, who_); p.goto(BASE + '/assistant'); p.wait_for_selector('[data-testid=calculator]'); p.wait_for_timeout(500)
        tabs = [t.strip() for t in p.locator('[role=tab]').all_inner_texts()]
        check(f'{label} can open the AI page and sees the calculator with three ways to ask', tabs == ['I know the power used', 'I know the paddy', 'I know the rice recovered'], tabs)
        for mode, amount, scope_label, scope_key in SCENARIOS:
            e = expect(mode, amount, scope_key); u = calculate(p, mode, amount, scope_label)
            ok_all = close(u['rice'], e['riceBags']) and close(u['broken'], e['brokenBags']) and close(u['hull'], e['hullBags']) and (u['kwh'] is None or close(u['kwh'], e['kwh'])) and (u['paddy'] is None or close(u['paddy'], e['paddyBags']))
            check(f'{label}: {amount} bags/units in "{mode}" mode, {scope_label or "whole company"}: the page agrees with the server maths', ok_all, {'page': u, 'server': {k: e[k] for k in ('riceBags', 'brokenBags', 'hullBags', 'kwh', 'paddyBags')}})
        check(f'{label}: no page errors', not p.errors, p.errors[:2]); ctx.close()

    # ---- the story you described, step by step, as the Operations Manager ----
    ctx, p = as_user(b, 'ops'); p.goto(BASE + '/assistant'); p.wait_for_selector('[data-testid=calculator]'); p.wait_for_timeout(400)
    p.get_by_test_id('mode-paddy').click(); p.get_by_test_id('calc-scope').select_option(label='Size 4')
    p.get_by_test_id('calc-preset').filter(has_text='5').first.click(); p.wait_for_timeout(250)
    check('one tap sets "5 bags" of paddy', p.get_by_test_id('calc-input').input_value() == '5')
    head = p.get_by_test_id('calc-headline').inner_text()
    check('the headline says what 5 bags of paddy needs and gives', '5 bags of paddy needs about' in head and 'kWh' in head and 'should give' in head, head)
    check('packaged rice, broken rice and hull are all shown, in bags and kg', all(p.get_by_test_id(t).count() == 1 for t in ['out-rice', 'out-broken', 'out-hull']) and 'kg' in p.get_by_test_id('out-hull-kg').inner_text())
    check('the page says how far to trust it (8 approved runs of Size 4: medium confidence)', 'Medium' in p.get_by_test_id('calc-confidence').inner_text(), p.get_by_test_id('calc-confidence').inner_text() if p.get_by_test_id('calc-confidence').count() else 'no badge')
    check('and says where the figures come from', 'Based on 8 approved milling runs' in p.get_by_test_id('calc-basis').inner_text(), p.get_by_test_id('calc-basis').inner_text())
    rice_bags = num(p.get_by_test_id('out-rice-bags').inner_text()); paddy_kwh = num(p.get_by_test_id('calc-kwh').inner_text())
    p.get_by_test_id('mode-rice').click(); p.get_by_test_id('calc-input').fill(str(rice_bags)); p.wait_for_timeout(250)
    back = num(p.get_by_test_id('calc-paddy-bags').inner_text()); kwh_back = num(p.get_by_test_id('calc-kwh').inner_text())
    check('asking it the other way round lands on the same 5 bags of paddy and the same power (the three directions agree)', abs(back - 5) / 5 < 0.03 and abs(kwh_back - paddy_kwh) / paddy_kwh < 0.03, (back, kwh_back, paddy_kwh))
    check('the rice tab states what a bag of rice weighs, and what the amount comes to in kg', 'One bag of packaged rice is 50 kg' in p.locator('main').inner_text() and 'kg' in p.locator('#calc-amount').locator('xpath=../../..').inner_text())
    p.get_by_test_id('mode-paddy').click(); p.get_by_test_id('calc-scope').select_option(label='Size 6'); p.wait_for_timeout(250)
    check('a grade with too few runs (Size 6, 2 runs) is labelled as an industry benchmark, not passed off as learned', p.get_by_test_id('calc-benchmark').count() == 1 and 'benchmark' in p.get_by_test_id('calc-benchmark').inner_text().lower())
    p.get_by_test_id('calc-input').fill('0'); check('zero gives no figures, just a prompt', p.get_by_test_id('calc-empty').count() == 1)
    ctx.close()

    # ---- the question box, in the words you used ----
    ctx, p = as_user(b, 'md'); p.goto(BASE + '/assistant'); p.wait_for_selector('[data-testid=assistant-input]')
    for question, expect_in in [('I milled 5 bags size 4, what should it give?', 'For grade Size 4'), ('how much paddy and power do I need for 100 bags of rice?', 'For the whole company'), ('what will 200 kWh give?', 'For the whole company')]:
        p.get_by_test_id('assistant-input').fill(question); p.get_by_test_id('assistant-input').press('Enter')
        p.get_by_test_id('assistant-answer').last.wait_for(); p.wait_for_timeout(300)
        ans = p.get_by_test_id('assistant-answer-text').last.inner_text()
        check(f'the question box answers "{question}" with paddy, power and bags', expect_in in ans and 'kWh' in ans and 'bags of packaged rice' in ans and 'broken rice' in ans and 'hull' in ans, ans)
    check('and shows which lookup it used', p.get_by_test_id('assistant-tool').last.inner_text().startswith('What power gives'))
    check('no page errors for the question box', not p.errors, p.errors[:2]); ctx.close()
    b.close()
sys.exit(1 if finish() else 0)
