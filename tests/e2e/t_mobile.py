from playwright.sync_api import sync_playwright
from common import *

def wait_done(page, timeout=240000):
    pb = page.locator("[role=progressbar]").first
    try: pb.wait_for(state="visible", timeout=6000)
    except Exception: pass
    pb.wait_for(state="hidden", timeout=timeout)

with sync_playwright() as p:
    browser, page, logs = launch(p, width=390, height=844, mobile=True)
    page.goto(f"{BASE}/"); page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1800)  # let the hero gauge finish settling
    page.screenshot(path=f"{SHOTS}/m_home.png", full_page=True)
    # any sideways scroll = layout bug
    for path in ["/", "/compress-pdf/", "/compress-image/", "/resize-image/", "/convert-image/", "/image-to-pdf/", "/pdf-to-image/"]:
        page.goto(f"{BASE}{path}"); page.wait_for_load_state("networkidle")
        w = page.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
        print(f"{path:18s} scrollWidth={w[0]} viewport={w[1]}", "OK" if w[0] <= w[1] else "<-- HORIZONTAL OVERFLOW")
    page.goto(f"{BASE}/compress-pdf/"); page.wait_for_load_state("networkidle")
    page.screenshot(path=f"{SHOTS}/m_pdf_empty.png")
    upload(page, ["scan.pdf"]); page.get_by_text("scan.pdf").first.wait_for()
    page.locator("input[type=number]").first.fill("200")
    click_text(page, "Compress PDF"); wait_done(page)
    page.screenshot(path=f"{SHOTS}/m_pdf_result.png", full_page=True)
    page.get_by_label("Advanced settings").check()
    page.screenshot(path=f"{SHOTS}/m_pdf_advanced.png", full_page=True)
    # menu
    page.goto(f"{BASE}/"); page.locator("summary", has_text="Tools").click()
    page.screenshot(path=f"{SHOTS}/m_menu.png")
    print("LOGS:", logs[:5])
    browser.close()
