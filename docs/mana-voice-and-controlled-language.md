# Clear technical instructions and natural Persian voice

ASD-STE100 is a controlled English standard for technical documentation, not a
programming language or a Persian speech standard. Its official FAQ explains
the documentation focus and the value of short sentences and controlled terms.
Source: https://www.asd-ste100.org/STE_faq.html

MANA uses the following project guidance inspired by clear technical writing.
This is not a claim of full STE100 dictionary/rule compliance or certification.

## Technical instruction profile

Use one action in each instruction. Name the project. Name the required input.
State the expected output. State the condition that stops the task. State the
required approval. Give a test for completion. Use the same term for the same
item. Keep amounts, units, versions and evidence references unchanged.

Example internal instructions:

1. Read the approved project input.
2. Check the project identifier.
3. Create a draft in a new directory.
4. Check the draft with independent tests.
5. Request the required review.
6. Keep the approved source unchanged until the review is complete.

These are project instructions, not executable authorization. Structured scopes,
runtime grants, audit and approval records remain authoritative.

## Persian voice profile

Use natural Persian for conversation. Give a short status first. Explain one
point at a time. Preserve important qualifications and exact amounts/units.
Separate a proposed action from a completed action. Obtain explicit permission
for microphone access and separate consent for stored audio or training.
Do not turn a recognized sentence directly into an authorized business action.

Dessa AI's own site describes real-time conversation and interruptions:
https://dessa-ai.com/
The project reference is conditional on the user's intended product. MANA does
not integrate that paid service, copy its voice or claim equivalent performance.

Target interaction includes local speech recognition/synthesis, turn-taking,
voice-activity detection, interruption, low-latency streaming, and authenticated
access to the existing shared mission runtime. It needs real Persian speech
models, device testing and measured latency; these are not supplied by a writing
standard or by the browser-control changes below.

## Implemented first step

The existing mobile pilot now uses a common voice-turn cancellation token.
Starting microphone capture stops earlier playback and invalidates older ASR/TTS
responses. Stop aborts pending browser requests, releases microphone tracks,
discards cancelled recording and prevents late audio from starting. Recording
timers belong to their own recorder, so an old timer cannot stop a newer capture.
Login/logout, history loading and mode changes stop old voice activity. A chat
reply from an earlier account session cannot become a new spoken answer.

Long replies are refused for speech instead of being silently cut at 3,000
characters. The user can request a shorter response with its qualifications intact.
Abort signals do not certify that a provider stopped server-side computation.

This is explicit button-driven turn control. It is not automatic speech-driven
interruption, continuous listening, streaming ASR/TTS or full-duplex conversation.
No ASR/TTS model, wake word, microphone startup or cloud fallback was installed.
Existing local voice endpoints and production authentication/HTTPS prerequisites
remain unchanged. Browser-behavior tests simulate delayed/aborted responses and
permission waits; they do not establish iPhone/Android audio quality or latency.
