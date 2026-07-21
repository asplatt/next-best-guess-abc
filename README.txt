Server version: v74-abc-round4-answer-only-variety
NEXT BEST GUESS PITCH GAME

SAFE MODE, OFFLINE
1. Open index.html in Chrome.
2. Click Open TV Game Window and drag that window to the TV.
3. Use the MacBook window as the host board.
4. For live AI, use START_GAME.command. For no-internet rehearsal, AI Mode can stay on Scripted fallback only.

HYBRID LIVE AI MODE
This lets Crystal Brawl and the Round 4 final review try live OpenAI scoring first, with scripted fallback if Wi-Fi/API fails.

1. Make sure Node.js 18+ is installed on the Mac.
2. Double-click SET_API_KEY.command once and paste your temporary OpenAI API key.
3. Double-click START_GAME.command. It will read api_key.txt, start the server, and open Chrome automatically.
4. Open http://127.0.0.1:8787/index.html in Chrome if it does not open by itself.
5. On the host board, set AI Mode to Live OpenAI + fallback.
6. Click Test Live AI.
7. Open TV Game Window, drag it to the TV, fullscreen the TV window.

IMPORTANT
Do not use Live AI unless you have internet. If the server or Wi-Fi fails, the game automatically uses the scripted fallback so the pitch does not stop.

HOST KEYS
H = host controls
F = fullscreen
P = AI processing
R = reveal
Space = timer when not typing
Right arrow = next
Left arrow = back

LIVE AI TROUBLESHOOTING
- You must launch with START_GAME.command, not by double-clicking index.html.
- Open http://127.0.0.1:8787/index.html in Chrome.
- Set AI Mode to Live OpenAI + fallback.
- Click Test Live AI. The status must say "Live AI evaluation succeeded". "Server connected" alone is not enough.
- If it says API key missing, invalid, timeout, or OpenAI 401/429, the game will correctly use fallback.


TEMP API KEY MODE
If you are using a disposable API key just for the pitch, run SET_API_KEY.command once. This writes the key to api_key.txt in this local folder. After the pitch, delete api_key.txt and revoke or disable the key in your OpenAI dashboard. Do not send this folder to anyone with api_key.txt inside it.


LIVE AI TROUBLESHOOTING
1. Double-click STOP_SERVER.command before starting a new version.
2. Double-click START_GAME.command.
3. Use Chrome at http://127.0.0.1:8787/index.html, not an old localhost tab.
4. The host panel live test should show server version v31-no-top-explainer.

MODEL NOTE
Default live model is now GPT-5 through the Responses API, with reasoning effort set to low for speed. If the API key/account cannot access GPT-5, the local server automatically falls back to GPT-4.1 so the pitch does not break. You can override with environment variables: OPENAI_MODEL, OPENAI_FALLBACK_MODEL, and OPENAI_REASONING_EFFORT.


V51 notes:
- For live AI, launch with START_GAME.command and use the Chrome window it opens: http://127.0.0.1:8787/index.html. Do not run live scoring from a Finder-opened file window.
- Round 1 and Round 2 use real photo thumbnails from remote image URLs when internet is available; the game still runs if they fail to load.


Build: v72-abc-final-review-two-line-fit
Round 4 final review now uses wrapped two-line answer explanations instead of clipping ellipses.


Answer cache:
The hosted demo now stores repeated open-answer scores in a server-side cache. If ABC plays on Tuesday from one laptop and again Thursday from another laptop, the same recognized question/answer pair will reuse the same score because the cache lives on the hosted server, not in the browser.

For long-lived hosting, set ANSWER_CACHE_FILE to a persistent path. On Render, attach a persistent disk and set:
ANSWER_CACHE_FILE=/var/data/answer_cache.json

Without a persistent disk, the cache will still work across different computers while the server is running, but it can reset after a redeploy, restart, or host filesystem wipe.
