NEXT BEST GUESS: ABC HOSTED DEMO BUILD

Purpose:
This is the send-after-pitch version. ABC gets a private web link and plays in the browser. They do not need Terminal, command files, or an API key.

Recommended hosting:
Use Render, Railway, Fly.io, or any Node host that can run `npm start`.

Required environment variables on the host:
OPENAI_API_KEY = your temporary OpenAI API key
DEMO_USERNAME = abc
DEMO_PASSWORD = the password you want ABC to enter

Optional environment variables:
OPENAI_MODEL = gpt-5
OPENAI_FALLBACK_MODEL = gpt-4.1
OPENAI_REASONING_EFFORT = low
PORT = set automatically by most hosts

Run command:
npm start

Health check:
/api/health

ABC user flow:
1. Send ABC the hosted URL and password.
2. They open the URL in Chrome/Safari.
3. The browser asks for username/password if DEMO_PASSWORD is set.
4. They play the game directly in the browser.
5. Live AI uses the server-side OPENAI_API_KEY. The key is never exposed to the browser.

Security notes:
Do not place the real OpenAI API key inside app.js, index.html, questions.js, or any public client file.
Use a dedicated temporary OpenAI key for this demo.
Set a low spend cap in the OpenAI dashboard if possible.
Revoke the key after ABC has reviewed the demo.

Local test before deploying:
1. From this folder, run: OPENAI_API_KEY=sk-... DEMO_PASSWORD=test npm start
2. Open: http://127.0.0.1:8787/index.html
3. Username: abc
4. Password: test
5. Use host controls > Test Live AI.


Answer cache:
The hosted demo now stores repeated open-answer scores in a server-side cache. If ABC plays on Tuesday from one laptop and again Thursday from another laptop, the same recognized question/answer pair will reuse the same score because the cache lives on the hosted server, not in the browser.

For long-lived hosting, set ANSWER_CACHE_FILE to a persistent path. On Render, attach a persistent disk and set:
ANSWER_CACHE_FILE=/var/data/answer_cache.json

Without a persistent disk, the cache will still work across different computers while the server is running, but it can reset after a redeploy, restart, or host filesystem wipe.
