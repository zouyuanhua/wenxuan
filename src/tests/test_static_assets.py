"""Every local script and stylesheet used by a page must be publicly served."""
from contextlib import contextmanager
from html.parser import HTMLParser
from http.server import ThreadingHTTPServer
from threading import Thread
import unittest
from urllib.parse import urljoin, urlsplit

import httpx
from fastapi.testclient import TestClient

from app import create_app
from dev_server import PreviewHandler


class PageAssets(HTMLParser):
    def __init__(self, page):
        super().__init__()
        self.page = page
        self.assets = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        source = None
        if tag == "script":
            source, media_type = attrs.get("src"), "javascript"
        elif tag == "link" and "stylesheet" in attrs.get("rel", "").split():
            source, media_type = attrs.get("href"), "text/css"
        if source and not urlsplit(source).scheme and not urlsplit(source).netloc:
            self.assets[urljoin(self.page, source)] = media_type


@contextmanager
def preview_client():
    server = ThreadingHTTPServer(("127.0.0.1", 0), PreviewHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{server.server_port}", trust_env=False) as client:
            yield client
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


class StaticAssetTests(unittest.TestCase):
    def check_page_assets(self, client):
        for page in ("/index.html", "/prompt.html"):
            response = client.get(page)
            self.assertEqual(response.status_code, 200, page)
            parser = PageAssets(page)
            parser.feed(response.text)
            self.assertTrue(parser.assets, f"No assets found in {page}")
            for path, media_type in parser.assets.items():
                with self.subTest(page=page, path=path):
                    asset = client.get(path)
                    self.assertEqual(asset.status_code, 200, f"{page} requires {path}")
                    self.assertIn(media_type, asset.headers.get("content-type", ""))
                    self.assertTrue(asset.content, path)

    def check_private_files(self, client):
        for path in ("/key.txt", "/.env", "/app.py", "/config/prompt.json"):
            with self.subTest(path=path):
                self.assertEqual(client.get(path).status_code, 404)

    def test_fastapi_serves_every_page_asset(self):
        with TestClient(create_app(api_key="")) as client:
            self.check_page_assets(client)

    def test_preview_serves_every_page_asset(self):
        with preview_client() as client:
            self.check_page_assets(client)

    def test_fastapi_keeps_private_files_unavailable(self):
        with TestClient(create_app(api_key="")) as client:
            self.check_private_files(client)

    def test_preview_keeps_private_files_unavailable(self):
        with preview_client() as client:
            self.check_private_files(client)


if __name__ == "__main__":
    unittest.main()
