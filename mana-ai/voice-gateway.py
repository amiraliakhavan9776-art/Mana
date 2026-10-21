#!/usr/bin/env python3
"""Loopback-only speech gateway. Optional faster-whisper ASR and Piper CLI TTS."""
import io
import json
import os
import subprocess
import tempfile
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT = int(os.getenv("MANA_VOICE_PORT", "8791"))
MAX_AUDIO = 2 * 1024 * 1024
MAX_TEXT = 3000
MAX_WAV = 4 * 1024 * 1024

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, data, mime="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def fail(self, status, message):
        self.reply(status, json.dumps({"error": message}).encode("utf-8"))

    def do_POST(self):
        if self.path not in ("/v1/audio/transcriptions", "/v1/audio/speech"):
            return self.fail(404, "Not found")
        try:
            length = int(self.headers.get("Content-Length", "-1"))
            limit = MAX_AUDIO if self.path.endswith("transcriptions") else MAX_TEXT * 4
            if length < 1 or length > limit:
                return self.fail(413, "Invalid request size")
            data = self.rfile.read(length)
            if len(data) != length:
                return self.fail(400, "Incomplete request")
            if self.path.endswith("transcriptions"):
                if self.headers.get("Content-Type") != "audio/webm":
                    return self.fail(415, "Expected audio/webm")
                result = transcribe(data)
                return self.reply(200, json.dumps({"text": result}, ensure_ascii=False).encode("utf-8"))
            if self.headers.get("Content-Type") != "application/json":
                return self.fail(415, "Expected JSON")
            body = json.loads(data)
            if not isinstance(body, dict) or body.get("language") != "fa" or body.get("format") != "wav":
                return self.fail(400, "Expected Persian WAV request")
            txt = body.get("text")
            if not isinstance(txt, str) or not txt.strip() or len(txt) > MAX_TEXT:
                return self.fail(400, "Invalid text")
            wav_data = synthesize(txt)
            return self.reply(200, wav_data, "audio/wav")
        except (ValueError, json.JSONDecodeError):
            return self.fail(400, "Malformed input")
        except Exception:
            return self.fail(503, "Local voice engine unavailable")

def transcribe(data):
    # Model weights must be pre-downloaded. No network download permitted at runtime.
    model_dir = os.environ.get("MANA_ASR_MODEL_DIR")
    if not model_dir or not Path(model_dir).is_dir():
        raise RuntimeError("Local ASR model directory not configured")
    from faster_whisper import WhisperModel
    model = WhisperModel(model_dir, device=os.getenv("MANA_ASR_DEVICE", "cpu"), compute_type=os.getenv("MANA_ASR_COMPUTE", "int8"), local_files_only=True)
    with tempfile.TemporaryDirectory() as temp:
        source = Path(temp) / "speech.webm"
        source.write_bytes(data)
        segments, _ = model.transcribe(str(source), language="fa", beam_size=3)
        return " ".join(s.text.strip() for s in segments)[:MAX_TEXT]

def synthesize(text):
    voice = os.environ.get("MANA_TTS_VOICE_PATH")
    if not voice or not Path(voice).is_file():
        raise RuntimeError("Local Piper voice model not configured")
    with tempfile.TemporaryDirectory() as temp:
        output = Path(temp) / "output.wav"
        # Never invoke shell. Limit time and output; model and voice installed separately.
        subprocess.run(["piper", "--model", voice, "--output_file", str(output)], input=text.encode("utf-8"), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=45, check=True)
        if output.stat().st_size > MAX_WAV:
            raise RuntimeError("Speech output too large")
        with wave.open(str(output), "rb") as wav:
            if wav.getnchannels() < 1:
                raise RuntimeError("Invalid audio")
        return output.read_bytes()

if __name__ == "__main__":
    if not 1 <= PORT <= 65535:
        raise SystemExit("Invalid port")
    print(f"Mana offline speech gateway listening on http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
