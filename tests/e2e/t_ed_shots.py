from playwright.sync_api import sync_playwright
from ed_common import *
A4W=595.28
def scr(page,i,x,y):
    b=page.locator(".page").nth(i).bounding_box(); z=b["width"]/A4W; return b["x"]+x*z, b["y"]+y*z
with sync_playwright() as p:
    browser,page,logs=launch(p,width=1400,height=900)
    open_editor(page,"sample.pdf",3)
    page.screenshot(path=f"{SHOTS}/e1_loaded.png")
    tool(page,"Text"); page.screenshot(path=f"{SHOTS}/e2_text_tool.png")
    page.mouse.click(*scr(page,0,72,330)); page.keyboard.type("Approved by Priya Sharma"); page.wait_for_timeout(200)
    page.screenshot(path=f"{SHOTS}/e3_typing.png")
    page.keyboard.press("Escape")
    tool(page,"Shapes"); page.get_by_label("Fill").check()
    a=scr(page,0,300,380); b=scr(page,0,420,440); page.mouse.move(*a); page.mouse.down(); page.mouse.move(*b,steps=8); page.mouse.up(); page.wait_for_timeout(200)
    page.screenshot(path=f"{SHOTS}/e4_shape_selected.png")
    tool(page,"Redact"); page.screenshot(path=f"{SHOTS}/e5_redact_tip.png")
    tool(page,"Sign"); dlg=page.get_by_role("dialog"); dlg.wait_for()
    c=dlg.locator("canvas.sigpad").bounding_box()
    page.mouse.move(c["x"]+80,c["y"]+90); page.mouse.down()
    for k in range(30): page.mouse.move(c["x"]+80+k*8, c["y"]+90+ (30 if k%6<3 else -30)*0.8)
    page.mouse.up(); page.wait_for_timeout(200)
    page.screenshot(path=f"{SHOTS}/e6_sign.png")
    browser.close()

    # narrow desktop (nav check) + home
    browser,page,logs=launch(p,width=1024,height=800)
    page.goto(f"{BASE}/"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(1500)
    page.screenshot(path=f"{SHOTS}/e7_home_1024.png", full_page=True)
    browser.close()

    # phone
    browser,page,logs=launch(p,width=390,height=844,mobile=True)
    page.goto(f"{BASE}/edit-pdf/"); page.wait_for_load_state("networkidle")
    page.screenshot(path=f"{SHOTS}/m1_empty.png")
    page.set_input_files("input[type=file]", os.path.join(FILES,"sample.pdf")); wait_ready(page,3); page.wait_for_timeout(900)
    page.screenshot(path=f"{SHOTS}/m2_loaded.png")
    page.locator(".ed__sidebtn").click(); page.wait_for_timeout(500)
    page.screenshot(path=f"{SHOTS}/m3_sidebar.png")
    w=page.evaluate("[document.documentElement.scrollWidth, innerWidth]"); print("phone overflow check:", w)
    print("LOGS", logs[:4]); browser.close()
