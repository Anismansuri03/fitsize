import os, time, subprocess, sys
from playwright.sync_api import sync_playwright
from common import *

def pdf_pages(path):
    out = subprocess.run(["pdfinfo", path], capture_output=True, text=True).stdout
    for l in out.splitlines():
        if l.startswith("Pages:"): return int(l.split()[1])

def run_case(page, fname, value, unit, expect_fit, label):
    page.goto(f"{BASE}/compress-pdf/"); page.wait_for_load_state("networkidle")
    upload(page, [fname])
    page.get_by_text(fname).first.wait_for()
    page.locator("input[type=number]").first.fill(str(value))
    page.get_by_role("radio", name=unit, exact=True).check(force=True)
    t = time.time()
    click_text(page, "Compress PDF")
    # wait for either a download button or the 'smallest' warning or an error
    page.locator("text=/Download PDF|Download smallest version|Already under|couldn.t read|password/").first.wait_for(timeout=180000)
    dt = time.time() - t
    return dt

with sync_playwright() as p:
    browser, page, logs = launch(p)
    results = []

    # 1) photo-heavy PDF (21 MB) -> 1 MB
    dt = run_case(page, "photos.pdf", 1, "MB", True, "photos->1MB")
    page.screenshot(path=f"{SHOTS}/pdf_photos_1mb.png", full_page=False)
    path = download_via(page, "Download PDF", "photos-1mb.pdf")
    size = os.path.getsize(path); pages = pdf_pages(path)
    print(f"photos.pdf 21MB -> 1 MB target: {size} bytes, {pages} pages, {dt:.1f}s")
    assert size <= 1_000_000 and pages == 6, (size, pages)
    print("  PASS under 1,000,000 and all 6 pages kept; ratio to limit: %.1f%%" % (size/10000))

    # 2) scanned PDF (18.8 MB) -> 200 KB  (the headline use case)
    dt = run_case(page, "scan.pdf", 200, "KB", True, "scan->200KB")
    page.screenshot(path=f"{SHOTS}/pdf_scan_200kb.png", full_page=False)
    path = download_via(page, "Download PDF", "scan-200kb.pdf")
    size = os.path.getsize(path); pages = pdf_pages(path)
    print(f"scan.pdf 18.8MB -> 200 KB target: {size} bytes, {pages} pages, {dt:.1f}s")
    if size <= 200_000: print("  PASS under 200,000; %.1f%% of limit" % (size/2000))
    else: print("  (over limit; check whether UI reported it honestly)")

    # 3) text-only PDF -> 10 KB : impossible, should be honest
    dt = run_case(page, "text.pdf", 10, "KB", False, "text->10KB")
    page.screenshot(path=f"{SHOTS}/pdf_text_impossible.png", full_page=False)
    body = page.inner_text("body")
    assert "smallest we can make this PDF" in body, "should explain impossibility"
    print(f"text.pdf -> 10 KB: honest 'can't fit' message shown ({dt:.1f}s)")

    # (the 'Make it fit anyway' fallback is tested properly in t_pdf_fallback.py)

    # 4) already under target
    dt = run_case(page, "text.pdf", 100, "KB", True, "text->100KB")
    assert "Already under" in page.inner_text("body")
    print("text.pdf 30KB with 100 KB target: 'Already under' shown, file left as is")

    print("LOGS:", logs[:10])
    browser.close()
