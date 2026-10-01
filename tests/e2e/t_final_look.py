from playwright.sync_api import sync_playwright
from ed_common import *
with sync_playwright() as p:
    browser, page, logs = launch(p, width=1400, height=1000)
    open_editor(page, "sample.pdf", 3)
    tool(page, "Text")
    b = page.locator(".page").first.bounding_box(); z = b["width"] / 595.28
    page.mouse.click(b["x"]+72*z, b["y"]+330*z)
    page.locator("#text-font").select_option("playfair")
    page.wait_for_timeout(400)
    page.keyboard.type("Certificate of Completion")
    page.wait_for_timeout(200)
    page.screenshot(path=f"{SHOTS}/final_editor_fonts.png")
    browser.close()
