# Mana AI mobile pilot (Persian)

Implemented: mobile-first RTL interface served at `/mobile`, chat mode, business-planning mode, installable web-app manifest, safe text rendering, and connection to the **same local-model API** as the desktop pilot.

This is **not** a native iOS/Android app and is **not deployed**. It is a PWA shell; no offline inference on the phone and no model weights are included. The manifest has no custom app icons or service worker yet, so installation experience may vary.

Local demo (Node 20+ plus installed local inference server):
```sh
export MANA_AI_LOCAL_PROVIDER_URL='http://127.0.0.1:1234/'
export MANA_AI_MODEL='<your-installed-model-id>'
node mana-ai/local-chat-ui.cjs
```
Open `http://127.0.0.1:8790/mobile` **on the same computer** to inspect the mobile layout. The development server binds to 127.0.0.1, so an actual phone cannot connect to it over Wi-Fi.

Before using on an iPhone/Android phone: deploy behind authenticated HTTPS with secure reverse proxy/VPN and private network routing to the local GPU, and add production session security, CSRF protections, rate limits, monitoring and independent backups. Do not change the development bind address to 0.0.0.0 or expose this unauthenticated API publicly. Mobile browser installation normally requires HTTPS (except local development exceptions).

Smoke test:
```sh
node --test mana-ai/tests/mobile-ui.test.cjs
```
Test uses a fake model; it does not verify inference quality or production mobile access.
