from playwright.sync_api import sync_playwright
from ed_common import *
with sync_playwright() as p:
    browser, page, logs = launch(p, width=1400, height=900)
    page.goto(f"{BASE}/edit-pdf/"); page.wait_for_load_state("networkidle")
    page.screenshot(path=f"{SHOTS}/ed_empty.png")
    page.set_input_files("input[type=file]", os.path.join(FILES, "sample.pdf"))
    wait_ready(page, 3); page.wait_for_timeout(800)
    page.screenshot(path=f"{SHOTS}/ed_loaded.png")
    print("pages:", page.locator(".page").count(), "| thumbs:", page.locator(".thumbitem").count())
    print("page px size:", page.locator(".page").first.bounding_box())
    print("LOGS:", logs[:6])
    browser.close()
