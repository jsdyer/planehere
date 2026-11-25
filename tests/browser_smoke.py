"""Test Plane Here at a project subpath using explicit synthetic API fixtures."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import shutil
import tempfile
import threading
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

def main():
    screenshots = ROOT / "browser-checks"
    screenshots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT / "dist", Path(temporary) / "planehere")
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=temporary))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 1280, "height": 1000}, accept_downloads=True)
                errors, calls = [], []
                page.on("pageerror", lambda error: errors.append(str(error)))
                now = datetime.now(timezone.utc)
                sample = {"fetched_at": now.isoformat(), "data": {"source_at": now.isoformat(), "aircraft": [
                    {"hex":"aaaaaa","lat":44.66,"lon":-63.59,"callsign":"TEST123","registration":"C-TEST","aircraft_type":"E295","position_at":(now-timedelta(seconds=5)).isoformat(),"altitude_ft":12000,"speed_knots":250,"track_deg":90,"on_ground":False},
                    {"hex":"bbbbbb","lat":44.67,"lon":-63.6,"callsign":"<img src=x>","registration":None,"aircraft_type":None,"position_at":(now-timedelta(seconds=10)).isoformat(),"altitude_ft":None,"speed_knots":0,"track_deg":None,"on_ground":True}
                ]}}
                fail = {"enabled": False}
                def api(route):
                    calls.append(route.request.url)
                    route.fulfill(status=503 if fail["enabled"] else 200, content_type="application/json", body=json.dumps({"error":{"message":"Source resting for test"}} if fail["enabled"] else sample))
                page.route("**/api/planehere/nearby?*", api)
                page.route("https://tile.openstreetmap.org/**", lambda route: route.abort())
                page.goto(f"http://127.0.0.1:{server.server_port}/planehere/")
                page.wait_for_function("!document.getElementById('refresh').disabled")
                assert not calls
                page.locator("#refresh").click()
                page.wait_for_function("document.getElementById('count').textContent === '1 aircraft'")
                assert 'lat=44.6' in calls[0] and 'lon=-63.6' in calls[0]
                assert page.get_by_role("button", name="TEST123", exact=True).count() == 1
                page.locator("#ground").check()
                assert page.locator("#count").inner_text() == "2 aircraft"
                assert page.locator(".aircraft-card img").count() == 0
                page.locator("#filter").fill("E295")
                assert page.locator("#count").inner_text() == "1 aircraft"
                page.locator("#units").select_option("metric")
                assert "3,658 m" in page.locator(".aircraft-card").inner_text()
                with page.expect_download() as download_info:
                    page.locator("#export").click()
                assert download_info.value.suggested_filename.startswith("planehere-")
                fail["enabled"] = True
                page.locator("#refresh").click()
                page.wait_for_function("document.getElementById('status').textContent.includes('Source resting')")
                assert page.locator("#count").inner_text() == "1 aircraft"
                page.locator("#save-place").click()
                assert page.evaluate("localStorage.getItem('coolcode:planehere:viewpoint')")
                page.locator("#forget-place").click()
                assert page.evaluate("localStorage.getItem('coolcode:planehere:viewpoint')") is None
                page.screenshot(path=str(screenshots / "desktop.png"), full_page=True)
                page.set_viewport_size({"width":390,"height":844})
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                page.screenshot(path=str(screenshots / "mobile.png"), full_page=True)
                assert not errors, errors
                browser.close()
            print("Plane Here browser checks passed: source fixture, filtering, map/list, privacy, export, errors and mobile layout")
        finally:
            server.shutdown()

if __name__ == "__main__": main()
