"""Checks for the launch-readiness work: SEO tags, structured data, manifest, headers-related behaviour,
home page cards, Android touch polish and the Google Fonts picker."""
import json, os, re, sys, urllib.request
from playwright.sync_api import sync_playwright
from common import *

ok = 0
def check(cond, msg):
    global ok
    assert cond, "FAIL: " + msg
    ok += 1; print("  PASS:", msg)

def get(path):
    return urllib.request.urlopen(BASE + path).read()

with sync_playwright() as p:
    browser, page, logs = launch(p, width=1300, height=900)

    print("== manifest + icons")
    m = json.loads(get("/manifest.webmanifest"))
    check(m["display"] == "standalone" and m["short_name"] == "Fitsize", "manifest is valid JSON, standalone")
    for icon in m["icons"]:
        data = get(icon["src"]); check(data[:4] == b"\x89PNG", f"icon {icon['src']} is a real PNG ({len(data)} bytes)")
    check(any(i["purpose"] == "maskable" for i in m["icons"]), "a maskable icon is declared (Android adaptive icons)")

    print("== SEO tags on every tool page")
    slugs = re.findall(r"<loc>[^<]*?/([a-z0-9-]+)/</loc>", get("/sitemap.xml").decode())
    check(len(slugs) >= 30, f"sitemap lists {len(slugs)} pages")
    problems = []
    for slug in sorted(set(slugs)):
        html = get(f"/{slug}/").decode()
        title = re.search(r"<title>(.*?)</title>", html).group(1)
        desc = re.search(r'<meta name="description" content="(.*?)"', html)
        h1s = len(re.findall(r"<h1[ >]", html))
        if h1s != 1: problems.append(f"{slug}: {h1s} h1 tags")
        if not desc or not (60 <= len(desc.group(1)) <= 165): problems.append(f"{slug}: description length {len(desc.group(1)) if desc else 'missing'}")
        if len(title) > 75: problems.append(f"{slug}: title {len(title)} chars")
        for need in ['rel="canonical"', 'property="og:image"', 'name="twitter:card"', 'rel="manifest"']:
            if need not in html: problems.append(f"{slug}: missing {need}")
        blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
        for b in blocks:
            try: json.loads(b)
            except Exception as e: problems.append(f"{slug}: bad JSON-LD ({e})")
        kinds = set()
        for b in blocks:
            data = json.loads(b)
            for item in (data if isinstance(data, list) else [data]):
                kinds.add(item.get("@type"))
        if slug in ("compress-pdf", "merge-pdf", "edit-pdf", "protect-pdf") and not {"WebApplication", "FAQPage", "BreadcrumbList", "HowTo"} <= kinds:
            problems.append(f"{slug}: schema types {kinds}")
    print("   ", problems or "no problems")
    check(not problems, "every page: one h1, sane title/description, canonical, OG, Twitter, manifest, valid JSON-LD")
    check(b'name="robots" content="noindex"' in get("/404.html"), "404 page is noindex")
    check(b"Sitemap:" in get("/robots.txt"), "robots.txt points at the sitemap")

    print("== home page: big tool cards with descriptions")
    page.goto(f"{BASE}/"); page.wait_for_load_state("networkidle")
    cards = page.locator(".toolcard")
    check(cards.count() == 19, f"{cards.count()} tool cards on the home page")
    check(all(len(t.strip()) > 25 for t in page.locator(".toolcard__desc").all_inner_texts()), "every card has a real description")
    check(page.locator(".catblock__title").count() == 4, "4 category headings")
    page.screenshot(path=f"{SHOTS}/launch_home.png", full_page=True)

    print("== Google Fonts picker")
    page.goto(f"{BASE}/edit-pdf/"); page.wait_for_load_state("networkidle")
    page.set_input_files("input[type=file]", os.path.join(FILES, "sample.pdf"))
    page.locator(".page__canvas").first.wait_for(); page.wait_for_timeout(500)
    page.locator(".tool-btn", has_text="Text").click()
    opts = page.locator("#text-font option").all_inner_texts()
    print("    fonts offered:", opts)
    check(len(opts) == 9 and "Playfair Display" in opts and "Roboto" in opts, "9 fonts offered (3 built-in + 6 Google Fonts)")
    check(page.locator("#text-font optgroup").count() == 2, "fonts are grouped so it stays easy to scan")

    print("== camera capture still present on Scan to PDF")
    page.goto(f"{BASE}/scan-to-pdf/"); page.wait_for_load_state("networkidle")
    check(page.evaluate("!!document.querySelector('input[capture=environment]')"), "camera input uses the rear camera")
    print(f"\nALL GOOD: {ok} checks. console problems: {[l for l in logs if 'favicon' not in l][:4]}")
    browser.close()

    print("== Android-style phone: touch behaviour")
    b2 = p.chromium.launch()
    ctx = b2.new_context(viewport={"width": 412, "height": 915}, has_touch=True, is_mobile=True, device_scale_factor=2.625,
                         user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36")
    pg = ctx.new_page()
    pg.goto(f"{BASE}/"); pg.wait_for_load_state("networkidle")
    check(pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")[0] <= 412, "no sideways scroll at 412px (Pixel width)")
    ta = pg.evaluate("getComputedStyle(document.querySelector('.btn')).touchAction")
    check(ta == "manipulation", f"buttons use touch-action: manipulation ({ta}), so no 300ms tap delay")
    th = pg.evaluate("getComputedStyle(document.querySelector('a')).webkitTapHighlightColor")
    check("0, 0, 0, 0" in th or th == "transparent" or "rgba(0, 0, 0, 0)" in th, f"tap highlight is off ({th})")
    small = pg.evaluate("""() => [...document.querySelectorAll('button, a.btn, .btn, .chip, .icon-btn, input[type=checkbox], input[type=radio], summary')]
        .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 36 || r.width < 36); }).map(e => e.className + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)).slice(0, 8)""")
    print("    controls smaller than 36px on the home page:", small or "none")
    pg.goto(f"{BASE}/compress-pdf/"); pg.wait_for_load_state("networkidle")
    pg.set_input_files("input[type=file]", os.path.join(FILES, "text.pdf")); pg.get_by_text("text.pdf").first.wait_for()
    small2 = pg.evaluate("""() => [...document.querySelectorAll('button, .btn, .chip, .icon-btn, summary, select, input:not([type=file]):not(.sr-only)')]
        .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40; }).map(e => (e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)).slice(0, 10)""")
    print("    controls under 40px tall on the compress page:", small2 or "none")
    pg.screenshot(path=f"{SHOTS}/launch_android_compress.png", full_page=True)
    b2.close()
