from playwright.sync_api import sync_playwright
from common import *
with sync_playwright() as p:
    browser, page, logs = launch(p, width=1280, height=900)
    for path, setup in [
        ("/merge-pdf/", lambda: upload(page, ["sample.pdf", "two.pdf"])),
        ("/remove-pages/", lambda: upload(page, ["sample.pdf"])),
        ("/protect-pdf/", lambda: upload(page, ["sample.pdf"])),
        ("/repair-pdf/", None),
    ]:
        page.goto(f"{BASE}{path}"); page.wait_for_load_state("networkidle")
        if setup: setup()
        page.wait_for_timeout(1000)
        page.screenshot(path=f"{SHOTS}/desk2_{path.strip('/').replace('/','_')}.png", full_page=True)
    print("LOGS", logs[:6])
    browser.close()
