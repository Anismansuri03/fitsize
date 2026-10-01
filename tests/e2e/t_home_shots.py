from playwright.sync_api import sync_playwright
from common import *
with sync_playwright() as p:
    browser, page, logs = launch(p, width=1400, height=900)
    page.goto(f"{BASE}/"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(1200)
    page.screenshot(path="/home/claude/shots2/home_desktop.png", full_page=True)
    page.get_by_role("button", name="All tools").first.click(); page.wait_for_timeout(300)
    page.screenshot(path="/home/claude/shots2/home_menu_open.png")
    page.locator(".toolmenu__search input").first.fill("water")
    page.wait_for_timeout(200)
    page.screenshot(path="/home/claude/shots2/home_menu_search.png")
    print("search 'water' results:", page.locator(".toolmenu__grid a").all_inner_texts())
    print("LOGS", logs[:5])
    browser.close()

    browser, page, logs = launch(p, width=390, height=844, mobile=True)
    page.goto(f"{BASE}/"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(1200)
    page.screenshot(path="/home/claude/shots2/home_mobile.png", full_page=True)
    w = page.evaluate("[document.documentElement.scrollWidth, innerWidth]"); print("mobile overflow:", w)
    page.locator(".menu--phone summary").click(); page.wait_for_timeout(300)
    page.screenshot(path="/home/claude/shots2/home_mobile_menu.png")
    print("LOGS", logs[:5]); browser.close()
