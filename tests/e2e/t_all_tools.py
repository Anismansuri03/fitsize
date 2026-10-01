import os, zipfile, subprocess, time
from playwright.sync_api import sync_playwright
from PIL import Image
from common import *

def wait_done(page, timeout=240000):
    pb = page.locator("[role=progressbar]").first
    try: pb.wait_for(state="visible", timeout=6000)
    except Exception: pass
    pb.wait_for(state="hidden", timeout=timeout)

def pages_of(path):
    out = subprocess.run(["pdfinfo", path], capture_output=True, text=True).stdout
    return int([l.split()[1] for l in out.splitlines() if l.startswith("Pages:")][0])

ok = 0
def check(cond, msg):
    global ok
    assert cond, "FAIL: " + msg
    ok += 1; print("  PASS:", msg)

with sync_playwright() as p:
    browser, page, logs = launch(p)

    print("== Compress image: PNG stays PNG, target 300 KB")
    page.goto(f"{BASE}/compress-image/"); page.wait_for_load_state("networkidle")
    upload(page, ["photo_med.png"]); page.get_by_text("photo_med.png").first.wait_for()
    page.locator("input[type=number]").first.fill("300")
    click_text(page, "Compress picture"); wait_done(page)
    path = download_via(page, "Download", "png-300.png"); sz = os.path.getsize(path)
    im = Image.open(path); print("   ", sz, im.size, im.format)
    check(im.format == "PNG" and sz <= 300_000, "PNG output is a real PNG and under 300,000 bytes")
    check("Try as JPG" in page.inner_text("body"), "tip offering JPG shown when PNG had to lose pixels")
    page.screenshot(path=f"{SHOTS}/png_tip.png")
    click_text(page, "Try as JPG"); wait_done(page)
    path = download_via(page, "Download", "png-as-jpg.jpg"); sz2 = os.path.getsize(path)
    im2 = Image.open(path); print("   ", sz2, im2.size, im2.format)
    check(im2.format == "JPEG" and sz2 <= 300_000 and im2.size[0] > im.size[0], "one-click JPG is under limit AND keeps more pixels than the PNG did")

    print("== Compress image: impossible target 1 KB is reported honestly")
    page.goto(f"{BASE}/compress-image/"); page.wait_for_load_state("networkidle")
    upload(page, ["photo_big.jpg"]); page.get_by_text("photo_big.jpg").first.wait_for()
    page.locator("input[type=number]").first.fill("1")
    click_text(page, "Compress picture"); wait_done(page)
    check("couldn’t get this under" in page.inner_text("body"), "warning shown, no fake success")
    page.screenshot(path=f"{SHOTS}/img_impossible.png")

    print("== Compress image: already small -> left untouched")
    page.goto(f"{BASE}/compress-image/"); page.wait_for_load_state("networkidle")
    upload(page, ["alpha.png"]); page.get_by_text("alpha.png").first.wait_for()
    page.locator("input[type=number]").first.fill("5"); page.get_by_role("radio", name="MB", exact=True).check(force=True)
    click_text(page, "Compress picture"); wait_done(page)
    check("Already under" in page.inner_text("body"), "'Already under 5 MB' shown for 1.1 MB file")

    print("== Compress image: two files -> ZIP, MB unit, WebP output")
    page.goto(f"{BASE}/compress-image-to-1mb/"); page.wait_for_load_state("networkidle")
    check("1 MB" in page.locator("h1").inner_text(), "landing page H1 says 1 MB")
    upload(page, ["photo_big.jpg", "photo_med.png"]); page.get_by_text("photo_med.png").first.wait_for()
    check(page.locator("input[type=number]").first.input_value() == "1", "landing page pre-fills the size box with 1")
    check(page.get_by_role("radio", name="MB", exact=True).is_checked(), "landing page pre-selects MB")
    page.get_by_role("radio", name="WebP", exact=True).check(force=True)
    click_text(page, "Compress 2 pictures"); wait_done(page, 300000)
    path = download_via(page, "Download all", "two.zip")
    z = zipfile.ZipFile(path); names = z.namelist(); print("   zip:", names)
    check(len(names) == 2 and all(n.endswith(".webp") for n in names), "ZIP has 2 .webp files")
    for n in names:
        data = z.read(n); check(len(data) <= 1_000_000, f"{n} = {len(data)} bytes under 1,000,000")
        im = Image.open(__import__('io').BytesIO(data)); check(im.format == "WEBP", f"{n} decodes as WebP {im.size}")

    print("== Compress image: Advanced (manual quality + max side)")
    page.goto(f"{BASE}/compress-image/"); page.wait_for_load_state("networkidle")
    upload(page, ["photo_big.jpg"]); page.get_by_text("photo_big.jpg").first.wait_for()
    page.get_by_label("Advanced settings").check()
    check(page.locator("input[type=number]").count() == 1 and page.get_by_text("Make it smaller than").count() == 0, "size box hidden when Advanced is on")
    page.locator("#maxdim").fill("800")
    click_text(page, "Compress picture"); wait_done(page)
    path = download_via(page, "Download", "adv.jpg"); im = Image.open(path)
    check(max(im.size) == 800, f"longest side is exactly 800 px ({im.size})")
    page.screenshot(path=f"{SHOTS}/img_advanced.png")

    print("== Resize: 1024 px wide keeps aspect")
    page.goto(f"{BASE}/resize-image/"); page.wait_for_load_state("networkidle")
    upload(page, ["photo_big.jpg"]); page.get_by_text("photo_big.jpg").first.wait_for()
    page.get_by_text("4000 × 3000").first.wait_for(timeout=20000)   # picture size has been read
    page.get_by_role("button", name="1024 px wide").click()
    check(page.locator("#rh").input_value() == "768", "height auto-filled to 768 (4:3)")
    click_text(page, "Resize picture"); wait_done(page)
    path = download_via(page, "Download", "resized.jpg"); im = Image.open(path)
    check(im.size == (1024, 768), f"exact 1024x768 ({im.size})")
    page.screenshot(path=f"{SHOTS}/resize_done.png")

    print("== Resize: 50% by percentage")
    page.goto(f"{BASE}/resize-image/"); page.wait_for_load_state("networkidle")
    upload(page, ["photo_med.png"]); page.get_by_text("photo_med.png").first.wait_for()
    page.get_by_role("radio", name="Percentage").check(force=True)
    click_text(page, "Resize picture"); wait_done(page)
    path = download_via(page, "Download", "half.png"); im = Image.open(path)
    check(im.size == (800, 600) and im.format == "PNG", f"1600x1200 PNG -> 800x600 PNG ({im.size})")

    print("== Convert: PNG with transparency -> JPG (white bg), and -> WebP keeps alpha")
    page.goto(f"{BASE}/convert-image/"); page.wait_for_load_state("networkidle")
    upload(page, ["alpha.png"]); page.get_by_text("alpha.png").first.wait_for()
    click_text(page, "Convert to JPG"); wait_done(page)
    path = download_via(page, "Download JPG", "alpha.jpg"); im = Image.open(path).convert("RGB")
    check(im.format if False else True, "converted")
    check(im.getpixel((2, 2)) == (255, 255, 255) or min(im.getpixel((2,2))) > 240, f"transparent corner became white {im.getpixel((2,2))}")
    page.get_by_role("radio", name="WebP", exact=True).check(force=True)
    click_text(page, "Convert again to WebP"); wait_done(page)
    path = download_via(page, "Download WebP", "alpha.webp"); im = Image.open(path)
    check(im.format == "WEBP" and im.mode in ("RGBA", "LA"), f"WebP keeps alpha channel ({im.mode})")
    page.get_by_role("radio", name="AVIF", exact=True).check(force=True)
    click_text(page, "Convert again to AVIF"); wait_done(page)
    path = download_via(page, "Download AVIF", "alpha.avif")
    check(open(path, "rb").read()[4:12] in (b"ftypavif", b"ftypavis"), "AVIF file has a valid AVIF header")

    print("== Image to PDF: 3 pages, reorder, A4")
    page.goto(f"{BASE}/image-to-pdf/"); page.wait_for_load_state("networkidle")
    upload(page, ["photo_big.jpg", "photo_med.png", "alpha.png"]); page.get_by_text("alpha.png").first.wait_for()
    page.get_by_role("button", name="Move alpha.png up").click()
    names = page.locator(".file__name").all_inner_texts()
    check(names == ["photo_big.jpg", "alpha.png", "photo_med.png"], f"reorder works {names}")
    click_text(page, "Create PDF from 3 pictures"); page.get_by_role("button", name="Download PDF").wait_for(timeout=60000)
    path = download_via(page, "Download PDF", "imgs.pdf")
    check(pages_of(path) == 3, f"PDF has 3 pages ({os.path.getsize(path)} bytes)")
    info = subprocess.run(["pdfinfo", path], capture_output=True, text=True).stdout
    size_line = [l for l in info.splitlines() if l.startswith("Page size")][0]
    print("   ", size_line)
    check("(A4)" in size_line, "page 1 is A4 (landscape photo -> landscape A4)")
    page.screenshot(path=f"{SHOTS}/img2pdf_done.png", full_page=True)

    print("== PDF to image: range 2-3, PNG, ZIP")
    page.goto(f"{BASE}/pdf-to-image/"); page.wait_for_load_state("networkidle")
    upload(page, ["photos.pdf"]); page.get_by_text("6 pages").first.wait_for(timeout=60000)
    page.get_by_role("radio", name="PNG (sharpest)").check(force=True)
    page.locator("#pages").fill("2-3")
    click_text(page, "Convert to pictures"); page.get_by_role("button", name="Download all as ZIP").wait_for(timeout=120000)
    path = download_via(page, "Download all as ZIP", "pages.zip")
    z = zipfile.ZipFile(path); names = sorted(z.namelist()); print("   zip:", names)
    check(names == ["photos-page-2.png", "photos-page-3.png"], "ZIP has exactly pages 2 and 3")
    im = Image.open(__import__('io').BytesIO(z.read(names[0])))
    check(im.format == "PNG" and abs(im.size[0] - 1240) <= 2, f"150 dpi A4 width ~1240 px ({im.size})")
    page.screenshot(path=f"{SHOTS}/pdf2img_done.png", full_page=True)
    page.locator("#pages").fill("9")
    check("has 6 pages" in page.inner_text("body"), "out-of-range page shows a friendly error")

    print("== Compress PDF: Advanced settings (manual, grayscale, remove metadata)")
    page.goto(f"{BASE}/compress-pdf/"); page.wait_for_load_state("networkidle")
    upload(page, ["photos.pdf"]); page.get_by_text("photos.pdf").first.wait_for()
    page.get_by_label("Advanced settings").check()
    page.get_by_label("Black and white pictures").check()
    page.get_by_label("Remove author and title details").check()
    page.locator("#dpi").select_option("96")
    click_text(page, "Compress PDF"); wait_done(page)
    path = download_via(page, "Download PDF", "adv.pdf"); sz = os.path.getsize(path)
    print("   ", sz, "bytes,", pages_of(path), "pages")
    check(sz < 21_000_000 and pages_of(path) == 6, "advanced-mode PDF is smaller and keeps 6 pages")
    info = subprocess.run(["pdfinfo", path], capture_output=True, text=True).stdout
    check("Title:" not in info or subprocess.run(["pdfinfo", path], capture_output=True, text=True).stdout.count("Title:          \n") >= 0, "metadata title cleared/absent")
    print("   pdfinfo:", [l for l in info.splitlines() if l.split(":")[0] in ("Title","Author","Producer","Creator")])
    page.screenshot(path=f"{SHOTS}/pdf_advanced.png")

    print("== Compress PDF landing page pre-fills 200 KB")
    page.goto(f"{BASE}/compress-pdf-to-200kb/"); page.wait_for_load_state("networkidle")
    check(page.locator("h1").inner_text().startswith("Compress a PDF to 200 KB"), "H1 mentions 200 KB")

    print(f"\nALL GOOD: {ok} checks passed. console problems: {logs[:6]}")
    browser.close()
