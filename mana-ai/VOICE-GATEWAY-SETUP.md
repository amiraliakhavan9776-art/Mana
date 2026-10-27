# Mana offline Persian speech gateway — development setup

New: `voice-gateway.py` implements a loopback-only HTTP adapter to separately installed **faster-whisper** (ASR) and **Piper** (TTS). The Mana local chat server exposes proxy endpoints `POST /api/voice/transcribe` (audio/webm) and `POST /api/voice/speak` (JSON text). No cloud service is called by these adapters.

**Important:** No models or dependencies have been installed and no real Persian audio was tested by this commit. You must source compatible, licensed Persian ASR weights and a Persian Piper voice model (if available and of acceptable quality) before use. Do not assume a voice model exists for your desired accent.

Example on an isolated development computer (Python, Node 20+, ffmpeg/PyAV requirements, Piper CLI installed):
```sh
python -m pip install faster-whisper
export MANA_ASR_MODEL_DIR='/absolute/path/to/pre-downloaded/whisper-model'
export MANA_TTS_VOICE_PATH='/absolute/path/to/pre-downloaded/piper-voice.onnx'
python mana-ai/voice-gateway.py
```
In a separate shell, with your locally installed text model server:
```sh
export MANA_AI_LOCAL_PROVIDER_URL='http://127.0.0.1:1234/'
export MANA_AI_MODEL='<installed-local-model>'
export MANA_AI_LOCAL_VOICE_URL='http://127.0.0.1:8791/'
node mana-ai/local-chat-ui.cjs
```

The mobile UI currently retains its browser-based speech controls; it **has not yet been switched** to the local gateway. No remote phone access is enabled: the server binds to loopback, lacks production authentication and should not be exposed publicly. For iPhone/Android, implement a secure authenticated HTTPS deployment and compatible MediaRecorder format testing first.

Tests (fake voice provider only):
```sh
node --test mana-ai/tests/local-voice-api.test.cjs mana-ai/tests/local-voice.test.cjs
```

Do not submit confidential audio to browser speech recognition. Production readiness also requires rate limits, bounded concurrency, model warmup, privacy review, server-side authentication, audit and resilience testing.
