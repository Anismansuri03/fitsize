import os, time, sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4321"
FILES = "/home/claude/testfiles"
SHOTS = "/home/claude/shots"
DL = "/home/claude/dl"

def launch(p, width=1280, height=900, mobile=False):
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": width, "height": height}, accept_downloads=True,
                              device_scale_factor=2 if mobile else 1)
    page = ctx.new_page()
    logs = []
    page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
    return browser, page, logs

def upload(page, filenames):
    paths = [os.path.join(FILES, f) for f in filenames]
    page.set_input_files("input[type=file]", paths)

def click_text(page, text, **kw):
    page.get_by_role("button", name=text).first.click(**kw)

def download_via(page, button_name, save_as):
    with page.expect_download(timeout=30000) as d:
        page.get_by_role("button", name=button_name).first.click()
    path = os.path.join(DL, save_as)
    d.value.save_as(path)
    return path
