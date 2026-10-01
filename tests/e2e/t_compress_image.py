import os, time
from playwright.sync_api import sync_playwright
from PIL import Image
from common import *

with sync_playwright() as p:
    browser, page, logs = launch(p)
    page.goto(f"{BASE}/compress-image/")
    page.wait_for_load_state("networkidle")
    upload(page, ["photo_big.jpg"])
    page.wait_for_selector("text=photo_big.jpg")
    # default target is 200 KB
    print("size input value:", page.locator("input[type=number]").first.input_value())
    t = time.time()
    click_text(page, "Compress picture")
    page.get_by_role("button", name="Download").first.wait_for(timeout=120000)
    print(f"compressed in {time.time()-t:.1f}s")
    page.screenshot(path=f"{SHOTS}/img_result.png", full_page=True)
    path = download_via(page, "Download", "photo_big-out.jpg")
    size = os.path.getsize(path)
    im = Image.open(path)
    print("output:", size, "bytes", im.size, im.format)
    assert size <= 200_000, f"OVER LIMIT: {size}"
    print("PASS: under 200 KB (1 KB = 1000 B):", size, f"({size/200000*100:.1f}% of limit)")
    print("LOGS:", logs[:8])
    browser.close()
