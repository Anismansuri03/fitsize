from playwright.sync_api import sync_playwright
from common import *
def wait_done(page):
    pb = page.locator("[role=progressbar], .progress").first
    try: pb.wait_for(state="visible", timeout=6000)
    except Exception: pass
    pb.wait_for(state="hidden", timeout=120000)

with sync_playwright() as p:
    browser, page, logs = launch(p, width=390, height=844, mobile=True)
    checks = []
    for path, setup in [
        ("/merge-pdf/", lambda: upload(page, ["sample.pdf", "two.pdf"])),
        ("/rotate-pdf/", lambda: upload(page, ["sample.pdf"])),
        ("/protect-pdf/", lambda: upload(page, ["sample.pdf"])),
        ("/watermark-pdf/", lambda: upload(page, ["sample.pdf"])),
        ("/add-page-numbers/", lambda: upload(page, ["sample.pdf"])),
        ("/scan-to-pdf/", lambda: None),
        ("/edit-pdf/", lambda: upload(page, ["sample.pdf"])),
    ]:
        page.goto(f"{BASE}{path}"); page.wait_for_load_state("networkidle")
        setup()
        page.wait_for_timeout(1200)
        w = page.evaluate("[document.documentElement.scrollWidth, innerWidth]")
        checks.append((path, w))
        name = path.strip("/").replace("/", "_")
        page.screenshot(path=f"{SHOTS}/mob2_{name}.png", full_page=(path != "/edit-pdf/"))
    for path, w in checks:
        print(f"{path:20s} scrollWidth={w[0]} viewport={w[1]}", "OK" if w[0] <= w[1] else "<-- OVERFLOW")
    print("LOGS", logs[:6])
    browser.close()
