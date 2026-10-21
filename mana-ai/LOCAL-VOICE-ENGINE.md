# Mana AI — self-hosted Persian voice interface (pilot)

Implemented: loopback-only client adapters for Persian ASR (audio/webm request, JSON `{"text":"..."}` response) and TTS (JSON `{"text":"...","language":"fa","format":"wav"}` request, WAV response). Size limits and basic response checks are enforced.

This is an **internal contract**. It does not imply that Whisper, faster-whisper, Piper, or any other engine supports these exact endpoints out of the box. A separately deployed local gateway will be needed to translate this contract to the selected engine.

No ASR/TTS models, weights, runtime, or GPU are installed by this commit. There is **no production microphone-to-server pipeline yet**. The existing browser voice controls remain optional and may use vendor services; do not dictate confidential content.

Test with Node.js 20+:
```sh
node --test mana-ai/tests/local-voice.test.cjs
```

Next: implement and validate a local speech gateway, connect authenticated upload/download endpoints to the mobile UI, and replace browser speech recognition after end-to-end privacy and device testing. Avoid exposing loopback development endpoints publicly. Production mobile access requires authenticated HTTPS/VPN.
