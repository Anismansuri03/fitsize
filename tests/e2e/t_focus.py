from playwright.sync_api import sync_playwright
from common import *
with sync_playwright() as p:
    browser, page, logs = launch(p)
    page.goto(f"{BASE}/compress-pdf/"); page.wait_for_load_state("networkidle")
    for _ in range(14):
        page.keyboard.press("Tab")
        if page.evaluate("document.activeElement.type") == "file": break
    page.wait_for_timeout(400)
    print("border after 400ms:", page.evaluate("getComputedStyle(document.querySelector('.drop')).borderColor"), "(accent = rgb(35, 64, 217))")
    print("background:", page.evaluate("getComputedStyle(document.querySelector('.drop')).backgroundColor"))
    page.locator(".drop").screenshot(path=f"{SHOTS}/drop_focus.png")
    browser.close()
