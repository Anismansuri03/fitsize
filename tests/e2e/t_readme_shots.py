"""Curated screenshots for the README / GitHub social preview. Not a correctness test."""
import os
from playwright.sync_api import sync_playwright
from ed_common import *

OUT = "/home/claude/fitsize/docs/screenshots"
A4W = 595.28

def scr(page, i, x, y):
    b = page.locator(".page").nth(i).bounding_box(); z = b["width"] / A4W
    return b["x"] + x * z, b["y"] + y * z

with sync_playwright() as p:
    browser, page, logs = launch(p, width=1440, height=960)

    # 1) Home page hero, just the top fold
    page.goto(f"{BASE}/"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(1400)
    page.screenshot(path=f"{OUT}/home-hero.png", clip={"x": 0, "y": 0, "width": 1440, "height": 720})

    # 2) Compress PDF result with the fit gauge (the signature visual)
    page.goto(f"{BASE}/compress-pdf/"); page.wait_for_load_state("networkidle")
    page.set_input_files("input[type=file]", os.path.join(FILES, "scan.pdf"))
    page.get_by_text("scan.pdf").first.wait_for()
    page.locator("input[type=number]").first.fill("200")
    page.get_by_role("button", name="Compress PDF").click()
    page.get_by_role("button", name="Download PDF").wait_for(timeout=60000)
    page.wait_for_timeout(600)
    page.locator(".panel").first.screenshot(path=f"{OUT}/compress-gauge.png")

    # 3) PDF editor with a Google Font in use + tools visible
    open_editor(page, "sample.pdf", 3)
    tool(page, "Text")
    page.mouse.click(*scr(page, 0, 72, 330))
    page.locator("#text-font").select_option("playfair")
    page.wait_for_timeout(400)
    page.keyboard.type("Certificate of Completion")
    page.wait_for_timeout(250)
    page.locator(".ed").screenshot(path=f"{OUT}/editor.png")

    # 4) Every-tool category grid
    page.goto(f"{BASE}/#tools"); page.wait_for_load_state("networkidle")
    page.locator("#tools").scroll_into_view_if_needed(); page.wait_for_timeout(300)
    page.locator("#tools").screenshot(path=f"{OUT}/every-tool.png")

    print("LOGS:", logs[:5])
    browser.close()

    # 5) Mobile / Android view of the home hero
    b2 = p.chromium.launch()
    ctx = b2.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, device_scale_factor=2)
    pg = ctx.new_page()
    pg.goto(f"{BASE}/"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(1200)
    pg.screenshot(path=f"{OUT}/mobile-home.png", clip={"x": 0, "y": 0, "width": 412, "height": 850})
    b2.close()
