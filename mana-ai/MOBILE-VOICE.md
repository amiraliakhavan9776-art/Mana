# Mana AI — Persian mobile voice pilot

The mobile interface now has **optional** Persian speech-to-text and text-to-speech controls, with a stop button. Speech recognition uses the browser's `SpeechRecognition` / `webkitSpeechRecognition` API when present. Speech playback uses `speechSynthesis`. Unsupported controls stay disabled.

**Important privacy warning:** browser speech recognition can use remote servers operated by the browser vendor, and language voices may require downloading voice packs. Therefore, this is **not a guaranteed offline or Iran-only voice pipeline**. The user must explicitly acknowledge the warning before microphone recognition starts. Do not dictate confidential information.

The local text AI engine is still a separate component requiring a running locally installed model. No microphone audio is stored by Mana in this prototype, but browser/vendor processing is outside our control.

Run tests:
```sh
node --test mana-ai/tests/mobile-voice.test.cjs mana-ai/tests/mobile-ui.test.cjs
```

Production plan: replace browser speech recognition with locally hosted Persian ASR and TTS, enforce authentication/HTTPS and audit, and validate iOS/Android behavior on real devices before deployment.
