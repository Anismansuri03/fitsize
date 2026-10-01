import os, subprocess
from playwright.sync_api import sync_playwright
from ed_common import *
A4W = 595.28
def scr(page, i, x, y):
    b = page.locator(".page").nth(i).bounding_box(); z = b["width"] / A4W
    return b["x"] + x * z, b["y"] + y * z
def sh(*a): return subprocess.run(list(a), capture_output=True).stdout.decode("utf-8", errors="replace")

with sync_playwright() as p:
    browser, page, logs = launch(p, width=1400, height=1000)
    open_editor(page, "sample.pdf", 3)
    tool(page, "Text")
    page.mouse.click(*scr(page, 0, 72, 300))
    page.locator("#text-font").select_option("playfair")
    page.wait_for_timeout(400)  # font fetch
    page.keyboard.type("Certificate of Completion")
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    # a second one: Caveat, bold toggle shouldn't break anything
    tool(page, "Text")
    page.mouse.click(*scr(page, 0, 72, 350))
    page.locator("#text-font").select_option("caveat")
    page.wait_for_timeout(300)
    page.keyboard.type("Signed, the team")
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    out = download_pdf(page, "fonts_test.pdf")
    print("file size:", os.path.getsize(out), "bytes")
    fonts = sh("pdffonts", out)
    print(fonts)
    assert "Playfair" in fonts and "Caveat" in fonts, "both Google Fonts must be embedded as real fonts"
    assert "TrueType" in fonts or "CID" in fonts
    t = sh("pdftotext", "-f", "1", "-l", "1", out, "-")
    print("extracted text:", repr(t))
    assert "Certificate of Completion" in t
    assert "Signed, the team" in t
    print("LOGS:", logs[:6])
    browser.close()
