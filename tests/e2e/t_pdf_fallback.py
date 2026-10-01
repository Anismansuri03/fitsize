import os, subprocess
from playwright.sync_api import sync_playwright
from common import *

def pages_of(path):
    out = subprocess.run(["pdfinfo", path], capture_output=True, text=True).stdout
    return int([l.split()[1] for l in out.splitlines() if l.startswith("Pages:")][0])

def wait_done(page):
    pb = page.locator("[role=progressbar]").first
    try: pb.wait_for(state="visible", timeout=8000)
    except Exception: pass
    pb.wait_for(state="hidden", timeout=240000)

with sync_playwright() as p:
    browser, page, logs = launch(p)

    # A) vector-heavy PDF, 500 KB target: normal path cannot reach it, fallback should
    page.goto(f"{BASE}/compress-pdf/"); page.wait_for_load_state("networkidle")
    upload(page, ["vector.pdf"]); page.get_by_text("vector.pdf").first.wait_for()
    page.locator("input[type=number]").first.fill("500")
    click_text(page, "Compress PDF"); wait_done(page)
    body = page.inner_text("body")
    assert "smallest we can make this PDF" in body, body[:400]
    print("A1: vector.pdf 2.5MB -> 500 KB: honest 'smallest is ...' message shown")
    page.screenshot(path=f"{SHOTS}/pdf_cant_fit.png")
    click_text(page, "Make it fit anyway"); wait_done(page)
    page.screenshot(path=f"{SHOTS}/pdf_rasterized.png")
    body = page.inner_text("body")
    path = download_via(page, "Download PDF", "vector-fit.pdf")
    size = os.path.getsize(path); n = pages_of(path)
    print(f"A2: after 'Make it fit anyway': {size} bytes, {n} pages")
    assert size <= 500_000 and n == 4, (size, n)
    assert "turned into pictures" in body
    print("    PASS: under 500,000 with all 4 pages; UI warns text is no longer selectable")

    # B) text-only PDF, 10 KB target: pictures would be bigger -> keep the smaller, say so
    page.goto(f"{BASE}/compress-pdf/"); page.wait_for_load_state("networkidle")
    upload(page, ["text.pdf"]); page.get_by_text("text.pdf").first.wait_for()
    page.locator("input[type=number]").first.fill("10")
    click_text(page, "Compress PDF"); wait_done(page)
    click_text(page, "Make it fit anyway"); wait_done(page)
    body = page.inner_text("body")
    assert "would not make this PDF any smaller" in body, body[:600]
    path = download_via(page, "Download smallest version", "text-smallest.pdf")
    print("B: text.pdf: rasterizing would be bigger -> we kept the original smallest (%d bytes) and said so" % os.path.getsize(path))
    page.screenshot(path=f"{SHOTS}/pdf_raster_not_helpful.png")

    print("LOGS:", logs[:10])
    browser.close()
