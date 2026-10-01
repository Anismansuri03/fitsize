from playwright.sync_api import sync_playwright
from common import *
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 412, "height": 915}, has_touch=True, is_mobile=True, device_scale_factor=2)
    pg = ctx.new_page(); pg.goto(f"{BASE}/"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(1200)
    print("cards:", pg.locator(".toolcard").count(), "| overflow:", pg.evaluate("[document.documentElement.scrollWidth, innerWidth]"))
    pg.screenshot(path=f"{SHOTS}/final_m_top.png")
    pg.locator("#tools").scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{SHOTS}/final_m_cards.png")
    b.close()
