import json, struct, urllib.request, urllib.error, zlib
from playwright.sync_api import sync_playwright

BASE, API = 'http://localhost:3100', 'http://localhost:4000'
results = []

def check(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('PASS  ' if cond else 'FAIL  ') + name + ((f'   -> {detail}') if (detail and not cond) else ''), flush=True)

def http(path, method='GET', token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={**({'Authorization': f'Bearer {token}'} if token else {}), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'null')

def reset(): http('/__reset', 'POST')
def calls(): return http('/__calls')[1]
def last_call(suffix):
    hits = [c for c in calls() if c['path'].endswith(suffix)]
    return hits[-1] if hits else None

def png(w=48, h=48):
    raw = b''.join(b'\x00' + bytes([180, 40, 40]) * w for _ in range(h))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')
PDF = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'

def as_user(browser, key, viewport=None):
    ctx = browser.new_context(viewport=viewport or {'width': 1400, 'height': 1000})
    ctx.add_init_script(f"sessionStorage.setItem('kam_roms_access_token', 'tok-{key}');")
    page = ctx.new_page()
    page.set_default_timeout(15000)
    page.errors = []
    page.on('pageerror', lambda e: page.errors.append(str(e)))
    return ctx, page

def show_all(page):
    page.locator('[aria-label="Which orders to show"] button').nth(1).click(); page.wait_for_timeout(300)

def open_order(page, number):
    page.goto(BASE + '/sales'); page.wait_for_selector('table tbody tr'); show_all(page)
    page.locator('tr', has_text=number).first.click()
    page.wait_for_selector('[data-testid=order-detail]')
    page.wait_for_selector('[data-testid=order-detail] >> text=Who has handled this order')
    page.wait_for_timeout(500)

def detail(page): return page.locator('[data-testid=order-detail]')
def row(page, number): return page.locator('tbody tr', has_text=number).first

def finish():
    bad = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(bad)} passed, {len(bad)} failed", flush=True)
    if bad: print('FAILED:', *bad, sep='\n  ')
    return len(bad)
