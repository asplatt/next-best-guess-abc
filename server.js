const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.OPENAI_MODEL || 'gpt-5';
const FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4.1';
const REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || 'low';
const ROOT = __dirname;
const KEY_FILE = path.join(ROOT, 'api_key.txt');
const CACHE_FILE = process.env.ANSWER_CACHE_FILE || path.join(ROOT, 'answer_cache.json');
const ANSWER_CACHE_ENABLED = process.env.DISABLE_ANSWER_CACHE !== '1';
const SERVER_VERSION = 'v82-round3-fact-joke';

function getApiKey(){
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) return process.env.OPENAI_API_KEY.trim();
  try {
    const key = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (key && !key.includes('PASTE_') && key.startsWith('sk-')) return key;
  } catch (e) {}
  return '';
}


function normalizeCacheText(x){
  return String(x || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function cacheKeyFor(mode, question, answer){
  return ['round3-v10', mode || 'unknown', normalizeCacheText(question), normalizeCacheText(answer)].join('::');
}
function loadAnswerCache(){
  if (!ANSWER_CACHE_ENABLED) return {};
  try {
    const txt = fs.readFileSync(CACHE_FILE, 'utf8');
    const obj = JSON.parse(txt);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) { return {}; }
}
function saveAnswerCache(cache){
  if (!ANSWER_CACHE_ENABLED) return;
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (e) { console.warn('Answer cache write failed:', e.message); }
}
function getCachedAnswer(mode, question, answer){
  const key = cacheKeyFor(mode, question, answer);
  const cache = loadAnswerCache();
  return cache[key] || null;
}
function setCachedAnswer(mode, question, answer, result){
  if (!result) return result;
  const key = cacheKeyFor(mode, question, answer);
  const cache = loadAnswerCache();
  cache[key] = {
    mode,
    question: String(question || ''),
    answer: String(answer || ''),
    result,
    createdAt: cache[key]?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  saveAnswerCache(cache);
  return result;
}
function cacheStats(){
  const cache = loadAnswerCache();
  return { enabled: ANSWER_CACHE_ENABLED, file: CACHE_FILE, count: Object.keys(cache).length };
}

function send(res, code, body, type='application/json') {
  res.writeHead(code, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store'
  });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1_000_000) { req.destroy(); reject(new Error('too large')); } });
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
    req.on('error', reject);
  });
}
function extractText(apiJson) {
  if (apiJson.output_text) return apiJson.output_text;
  const parts = [];
  for (const item of apiJson.output || []) {
    for (const c of item.content || []) {
      if (c.text) parts.push(c.text);
      if (c.type === 'output_text' && c.text) parts.push(c.text);
    }
  }
  return parts.join('\n');
}

function parseModelJson(text) {
  let cleaned = String(text || '').trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (e) {}

  // Some models obey the JSON request, then add a second note or extra characters.
  // Pull the first balanced JSON object and parse only that.
  const start = cleaned.indexOf('{');
  if (start < 0) throw new Error('model returned no JSON object');
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString) {
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = cleaned.slice(start, i + 1);
          return JSON.parse(candidate);
        }
      }
    }
  }
  throw new Error('model returned malformed JSON');
}


function normalizeAnswer(x){
  if (x && typeof x === 'object') {
    const val = x.answer ?? x.text ?? x.value ?? x.response ?? '';
    return String(val || 'No answer given').trim();
  }
  return String(x || 'No answer given').trim();
}

function fallbackReasonFor(question='', answer=''){
  const q = String(question || '').toLowerCase();
  const a = String(answer || 'No answer given').trim();
  const specific = specificReasonFor(question, answer);
  if (specific) return specific;
  if (q.includes('elective surgery')) return bulletReason({
    fit: `A mass procedure needs vanity, safety, and repeat demand`,
    path: `By 2045, weird alone is not enough to scale`,
    joke: `The waiting room has standards, somehow`
  });
  if (/\b(health\s*)?insurance|insurer|premium|deductible/.test(q)) return bulletReason({
    fit: `Insurers need claims data, not just a strange habit`,
    path: `By 2038, insurers will prefer passive health signals over trivia`,
    joke: `The premium may shrug, which is rare for premiums`
  });
  if (q.includes('olympic sport')) return bulletReason({
    fit: `${a} needs clear rules and a clean TV image`,
    path: `By 2040, global participation has to look medal-worthy`,
    joke: `The announcers will make chaos sound ancient and noble`
  });
  if (q.includes('fashion trend')) return bulletReason({
    fit: `${a} needs nostalgia, celebrity spark, and visual identity`,
    path: `By 2038, shame has had enough time to rebrand`,
    joke: `Fashion is just regret with better lighting`
  });
  if (q.includes('holiday')) return bulletReason({
    fit: `${a} needs a simple ritual people can repeat`,
    path: `By 2050, sponsors and schools need a reason to care`,
    joke: `Every holiday begins as nonsense with better snacks`
  });
  if (q.includes('collect instead')) return bulletReason({
    fit: `${a} needs scarcity, proof, and bragging rights`,
    path: `By 2040, status still wants something to display`,
    joke: `Future snobs will make vinyl people seem relaxed`
  });
  if (q.includes('ban private cars')) return specificReasonFor(question, answer, 'exact') || bulletReason({
    fit: `${a} is judged as a city answer`,
    path: `Density, transit, climate politics, and enforcement decide it`,
    joke: `Every driver will insist their errand is historic`
  });
  return bulletReason({
    fit: `${a} needs a believable route into the target year`,
    path: `Scale comes from incentives, cost, culture, and habit`,
    joke: `The oracle respects the swing, then checks the landing`
  });
}
function fallbackScoreFor(question='', answer='', index=0){
  const guard = guardrailFor(question, answer);
  if (guard) {
    let base = typeof guard.floor === 'number' ? guard.floor : 70;
    if (typeof guard.cap === 'number') base = Math.min(base, guard.cap);
    return base;
  }
  const q = String(question || '').toLowerCase();
  const a = String(answer || '').toLowerCase();
  if (!a || a === 'no answer given') return 25;
  if (q.includes('elective surgery') && /(organ|weapon|robot arm|personality|immortality|brain|chip|neural)/.test(a)) return 43;
  return index === 0 ? 72 : 68;
}
function fallbackOpen(payload, fallbackError='Live OpenAI unavailable'){
  const answers = (payload.answers || []).map(normalizeAnswer);
  const question = payload.question || '';
  return { fallback: true, fallbackError, players: ensureDistinctLastJokes(answers.map((a, i) => reviewScoredResult({ score: fallbackScoreFor(question, a, i), reason: fallbackReasonFor(question, a) }, question, a)), question, answers) };
}
function fallbackFinal(payload, fallbackError='Live OpenAI unavailable'){
  const question = payload.question || '';
  const answer = normalizeAnswer(payload.answer);
  const reviewed = reviewFinalResult({ score: fallbackScoreFor(question, answer, 0), reason: fallbackReasonFor(question, answer) }, question, answer);
  return { fallback: true, fallbackError, score: reviewed.score, reason: reviewed.reason };
}
function clamp(n, min=1, max=99){
  const x = Number(n);
  if (!Number.isFinite(x)) return 72;
  return Math.max(min, Math.min(max, Math.round(x)));
}
function parseScoredText(text){
  const raw = String(text || '').trim();
  let score = null;
  const scoreMatch = raw.match(/(?:SCORE|PERCENT|LIKELIHOOD)\s*[:=\-]?\s*(\d{1,3})\s*%?/i) || raw.match(/\b(\d{1,3})\s*%/);
  if (scoreMatch) score = clamp(scoreMatch[1]);
  let reason = '';
  const reasonMatch = raw.match(/REASON\s*[:=\-]\s*([\s\S]*)/i);
  if (reasonMatch) reason = reasonMatch[1].trim();
  else {
    reason = raw
      .replace(/(?:SCORE|PERCENT|LIKELIHOOD)\s*[:=\-]?\s*\d{1,3}\s*%?/ig, '')
      .replace(/^[-–—\s]+/, '')
      .trim();
  }
  reason = reason
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  if (!reason || reason.length < 20) {
    reason = 'This answer has a signal, but it needs a cleaner path to mass adoption. By the target year, the idea has to feel normal, not just novel. The oracle likes the swing, not the landing.';
  }
  reason = cleanReasonForDisplay(reason);
  return { score: score ?? 72, reason };
}

function normalizeTvSentence(value, fallback=''){
  let line = String(value || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^[•\-–—\s]+/, '')
    .replace(/^(Fit|Why|Likelihood|Probability|Scale|Future|Future path|Friction|Block|Score logic|Forecast|Joke|Evidence|Adoption path|Human behavior|Burn|Oracle Burn)\s*:\s*/i, '')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!line) line = String(fallback || '').trim();
  if (!line) return '';
  line = line.replace(/\s+([,.!?])/g, '$1');
  if (!/[.!?]$/.test(line)) line += '.';
  return line;
}

function isCompleteTvSentence(value, {minWords=7, maxWords=24}={}){
  const line = normalizeTvSentence(value);
  if (!line) return false;
  const words = line.replace(/^[•\-–—\s]+/, '').split(/\s+/).filter(Boolean);
  if (words.length < minWords || words.length > maxWords) return false;
  if (!/[.!?]$/.test(line)) return false;
  if (/\b(and|or|but|with|without|to|for|of|the|a|an|your|their|its|by|in|on|at|as|than|before|after|if|against|within|since|because|is|are|was|were|be|been|being|would|could|should|might|may)\s*[.!?]$/i.test(line)) return false;
  if (/\b(this has a signal|not enough scale|target year|future still wants|could become .* if\.|payoff is\.|weigh the scale|behavior within)\b/i.test(line)) return false;
  return true;
}

function cleanReasonForDisplay(reason){
  const raw = String(reason || '').trim();
  const bullets = raw.split(/\n+/)
    .map(x => normalizeTvSentence(x))
    .filter(Boolean);
  return bullets.slice(0,3).map(line => `• ${line}`).join('\n');
}

function reasonLooksBroken(reason){
  const r = String(reason || '').trim();
  return !r || /\.{3,}|…/.test(r) || !/[.!?]$/.test(r) || /\b(to|and|or|with|for|than|as|before|after)$/i.test(r);
}

function bulletReason({fit='Forecast fit', path='Future path', friction='Friction', score='Score logic', joke='The oracle has spoken, and somehow it still has to validate parking.'} = {}){
  const clean = x => String(x || '')
    .replace(/\s+/g, ' ')
    .replace(/^[•\-\s]+/, '')
    .replace(/^(Fit|Why|Likelihood|Probability|Scale|Future|Future path|Friction|Block|Score logic|Forecast|Joke|Evidence|Adoption path|Human behavior|Burn|Oracle Burn)\s*:\s*/i, '')
    .trim()
    .replace(/[.?!]*$/, '');
  const shorten = (x, max=70) => {
    x = clean(x);
    if (x.length > max) x = x.slice(0, max).replace(/\s+\S*$/, '').trim();
    if (/\b(and|or|but|with|without|to|for|of|the|a|an|your|their|its|by|in|on|at)$/i.test(x)) x = x.replace(/\s+\S+$/,'').trim();
    return x;
  };
  return [
    `• ${shorten(fit)}.`,
    `• ${shorten(path || score || friction)}.`,
    `• ${shorten(joke, 76)}.`
  ].join('\n');
}


function lastBulletText(reason){
  const lines = String(reason || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
  if (!lines.length) return '';
  return lines[lines.length - 1].replace(/^[•\-–—\s]+/, '').replace(/[.?!]*$/, '').trim().toLowerCase();
}
function answerSpecificJoke(question='', answer='', playerNum=1){
  const q = String(question || '').toLowerCase();
  const a = String(answer || '').toLowerCase();
  if (q.includes('elective surgery')) {
    if (/(brain|neural|neuralink|cognitive|chip|implant)/.test(a)) return 'Even in 2045, people will read the skull-update terms twice';
    if (/(hair|follicle|bald|scalp)/.test(a)) return 'By 2045, barbers may upsell bangs, buzzcuts, and full executive density';
    if (/(nose|face|jaw|chin)/.test(a)) return 'The future changes faces faster than group chat opinions';
    if (/(allergy|immune)/.test(a)) return 'Heroic tech, but nobody flexes a peanut-safe pancreas';
  }
  if (/\b(health\s*)?insurance|insurer|premium|deductible/.test(q)) {
    if (/(breath|breathing|respiration|heart rate|pulse|hrv)/.test(a)) return 'Your premium may know you panic-breathed through Tuesday';
    if (/(plant|plants|houseplant|fern|air quality)/.test(a)) return 'Unless the fern files claims, this stays decorative';
    if (/(ai usage|ai watching|mental health|therapy bot|chatbot|alexa)/.test(a)) return 'Your copay may know you vented to a chatbot';
    if (/(sleep|phone|screen|scroll)/.test(a)) return 'Your deductible will know you watched one more episode';
    if (/(grocery|food|alcohol|cart|receipt)/.test(a)) return 'The checkout line becomes a tiny insurance deposition';
    return playerNum === 1 ? 'The premium may shrug, which is rare for premiums' : 'Your deductible will politely pretend this is science';
  }
  if (q.includes('phobia')) return 'The monster under the bed now has push notifications';
  if (q.includes('olympic sport')) return 'The announcers will whisper like this is ancient Greece with batteries';
  if (q.includes('fashion trend')) return 'Fashion is just regret with better lighting';
  if (q.includes('collect instead')) return 'Future snobs will make vinyl people seem relaxed';
  if (q.includes('ban private cars')) return 'Every driver will insist burrito pickup is constitutionally protected';
  return playerNum === 1 ? 'The oracle likes bold guesses, but still checks the receipt' : 'The future applauds, then checks the category';
}
function ensureDistinctLastJokes(players, question, answers){
  if (!Array.isArray(players) || players.length < 2) return players;
  const j1 = lastBulletText(players[0]?.reason);
  const j2 = lastBulletText(players[1]?.reason);
  if (j1 && j2 && j1 === j2) {
    players[0].reason = replaceLastBullet(players[0].reason, answerSpecificJoke(question, answers?.[0], 1));
    players[1].reason = replaceLastBullet(players[1].reason, answerSpecificJoke(question, answers?.[1], 2));
  }
  return players;
}
function replaceLastBullet(reason, replacement){
  const lines = String(reason || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
  if (!lines.length) return `• ${replacement}.`;
  lines[lines.length - 1] = `• ${String(replacement).replace(/[.?!]*$/, '')}.`;
  return lines.join('\n');
}

function reasonHasBullets(reason){
  return String(reason || '').split(/\n+/).filter(line => /^\s*[•\-]/.test(line)).length >= 4;
}
async function callResponsesAPI(apiKey, model, system, user) {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      reasoning: { effort: REASONING_EFFORT },
      text: { verbosity: 'low' },
      max_output_tokens: 520
    })
  });
  if (!r.ok) {
    let detail = '';
    try { detail = await r.text(); } catch (e) {}
    throw new Error(`Responses API ${r.status}${detail ? ': ' + detail.slice(0, 220) : ''}`);
  }
  const apiJson = await r.json();
  const text = apiJson.output_text || extractText(apiJson) || '';
  return String(text || '').trim();
}

async function callChatCompletionsAPI(apiKey, model, system, user) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.78,
      max_tokens: 440
    })
  });
  if (!r.ok) {
    let detail = '';
    try { detail = await r.text(); } catch (e) {}
    throw new Error(`Chat Completions API ${r.status}${detail ? ': ' + detail.slice(0, 220) : ''}`);
  }
  const apiJson = await r.json();
  const text = apiJson?.choices?.[0]?.message?.content || extractText(apiJson) || '';
  return String(text || '').trim();
}

async function callOpenAIText(system, user) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY missing or api_key.txt not set');

  // Default now uses the next level up from GPT-4.1: GPT-5 via the Responses API.
  // If the user's key/account does not have that model, fall back to GPT-4.1 so the pitch keeps moving.
  if (/^gpt-5/i.test(MODEL)) {
    try {
      return await callResponsesAPI(apiKey, MODEL, system, user);
    } catch (err) {
      console.warn(`Primary model ${MODEL} failed; falling back to ${FALLBACK_MODEL}: ${err.message}`);
      return await callChatCompletionsAPI(apiKey, FALLBACK_MODEL, system, user);
    }
  }

  return await callChatCompletionsAPI(apiKey, MODEL, system, user);
}
function lensForQuestion(question=''){
  const q = String(question).toLowerCase();
  if (q.includes('elective surgery')) return `Question lens: This is a 2045 forecast, not a 2026 medical snapshot. Judge which answer could plausibly become the #1 mass elective surgery after twenty years of cost decline, automation, normalization, status pressure, aging anxiety, and wellness rebranding. Reward actual elective procedures or routine implants with repeat demand, visible payoff, consumer financing, lighter regulation, pain-free recovery, and obvious reasons millions of people would pay. Strong examples: automated hair restoration, regenerative skin repair, longevity hormone implants, scarless body-contouring implants, fertility optimization, dental/jawline reshaping, vision upgrades. Futuristic medical answers can score if they show a credible path to safe, elective, mass-consumer adoption by 2045. Brain chips / AI brain implants should not be dismissed as impossible, but they are capped at 38-46 unless framed as safe consumer elective enhancement, because invasive neurosurgery, cybersecurity, ethics, trust, and regulation make them unlikely to beat lower-friction vanity and longevity procedures. The joke should come from tomorrow's technology colliding with timeless human vanity, and should sound like a host tag, not a warning label.`;
  if (/\b(health\s*)?insurance|insurer|premium|deductible/.test(q)) return `Question lens: This is about behavior health insurers will track by 2038 that is not commonly tracked now. Strong answers are passive, measurable, legally defensible, and tied to claims cost: sleep regularity, driving style, grocery receipts, alcohol purchases, loneliness, medication adherence, movement, stress, screen time, social connection, risky hobbies, or wearable/device data. Strongest answers feel creepy but not impossible. Weak answers are impossible to measure, already tracked, illegal without consent, or too obviously dystopian for an insurer to put in a cheerful wellness app. The joke should come from surveillance being marketed as care.`;
  if (q.includes('holiday')) return `Question lens: This is about a currently non-existent holiday celebrated globally by 2050. Strong answers have a simple ritual, institutional sponsors, emotional need, global relevance, and a reason schools, brands, or governments would put it on calendars. Weak answers are niche, confusing, too grim, or just a hashtag wearing a party hat. Think future civic ritual, not random theme day.`;
  if (q.includes('olympic sport')) return `Question lens: This is about a specific new Olympic sport by 2040, not a general entertainment category. Strong answers need physical or clearly competitive skill, global participation, governing bodies, clean scoring, broadcast clarity, youth appeal, and a way for the IOC to explain it without sweating. Generic 'e-sports' is too broad unless framed as a specific Olympic-ready discipline like drone racing, mixed-reality racing, or parkour. The oracle should punish category fog.`;
  if (q.includes('fashion trend')) return `Question lens: This is about a huge fashion comeback in 2038. Strong answers should have a real nostalgia cycle, thrift/resale supply, celebrity/TikTok revival potential, a distinct silhouette, comfort or rebellion value, and easy visual recognition. Weak answers are too vague or never left enough to return. The joke should make the trend feel painfully inevitable.`;
  if (q.includes('collect instead')) return `Question lens: This is about future collectibles replacing physical books, records, or art by 2040. Strong answers have scarcity, provenance, identity signaling, display value, and bragging rights: authenticated experiences, personal data artifacts, AI co-created works, digital memories, access passes, location-based originals, or verified human-made objects. Weak answers are infinitely copyable, utility items, or lack status. The joke should come from future snobbery being just as ridiculous as current snobbery.`;
  if (q.includes('ban private cars')) return `Question lens: This is about the first city to ban private cars entirely. Strong answers should be dense, transit-rich, politically climate-forward, geographically enforceable, congested, and used to public-space experiments. Reward places like dense European cores, Singapore-style governance, or cities with car-free precedents. Penalize sprawling, lawsuit-heavy, transit-poor, car-culture places. The joke should come from urban planning meeting human whining.`;
  return `Question lens: Reward answers with a clear path from today's signals to tomorrow's outcome: adoption, cost, incentives, regulation, culture, institutions, and human vanity. Penalize clever answers that don't actually answer the question. The joke should come from the logic, not from a random punchline.`;
}

function examplesForQuestion(question=''){
  const q = String(question).toLowerCase();
  if (q.includes('elective surgery')) return `Examples for calibration only, do not copy them: "AI chip in the brain" or "AI chip brain implant" should score around 42. It could exist by 2045, but it is still invasive neuroscience with liability, ethics, hacking fears, and a much harder mass-elective path than hair, skin, hormones, weight, fertility, dental, vision, or longevity. Do not rewrite it as hormone optimization or a better adjacent idea. "At-home hair transplant" should score higher because hair loss has repeat demand, status anxiety, visible payoff, and automation potential. "Swappable nose" is visually funny but should be penalized unless framed as safe regenerative cartilage or modular cosmetic surgery.`;
  if (/\b(health\s*)?insurance|insurer|premium|deductible/.test(q)) return `Examples for calibration only: "sleep score" should rate high because wearables already measure it and insurers can tie it to risk; "how often you lie" should rate low because it is not passively measurable; "grocery purchases" should rate high but creepy because receipts already expose diet patterns.`;
  if (q.includes('holiday')) return `Examples for calibration only: "Digital Detox Day" and "Climate Restoration Day" should rate high because they have simple rituals and institutional sponsors; "Space Migration Anniversary" is weaker by 2050 because too few people will have migrated anywhere except away from group chats.`;
  if (q.includes('olympic sport')) return `Examples for calibration only: "drone racing" should rate high because it has TV clarity and global youth appeal; "speed typing" should rate lower because it is legible but not athletic enough unless paired with a physical arena format.`;
  if (q.includes('fashion trend')) return `Examples for calibration only: "low-rise jeans" or "Y2K" can rate high because nostalgia cycles are brutal; "cloaks" can be funny but needs a celebrity/status path to score well.`;
  if (q.includes('collect instead')) return `Examples for calibration only: "verified memories" or "authenticated experiences" should rate high because scarcity plus identity signaling matters; "real conversations" is poetic but needs proof, display, and status mechanics to score high.`;
  if (q.includes('ban private cars')) return `Examples for calibration only: This question asks for a CITY, so city names are the correct answer type. "Paris," "Singapore," "Amsterdam," "New York City," and "San Francisco" can rate high if the forecast references density, transit, climate policy, congestion, and enforcement. Never say a city is wrong because it is not a technology or product; that is a category error.`;
  return `Examples for calibration only: score the exact answer, not the cleverness of the person saying it.`;
}


function specificReasonFor(question='', answer='', category=''){
  const q = String(question).toLowerCase();
  const a = String(answer || '').trim();
  const al = a.toLowerCase();

  if (q.includes('elective surgery')) {
    if (/(face|arm|organ|eye|hand|limb).*transplant|transplant.*(face|arm|organ|eye|hand|limb)/i.test(a)) {
      return bulletReason({
        fit: 'Transplants may improve, but they stay serious medicine',
        path: 'By 2045, risk and scarcity keep this far from mass elective demand',
        joke: 'Nobody books a face transplant between Botox and lunch'
      });
    }
    if (/(swappable|replaceable|interchangeable|modular).*(nose|face)|(?:nose|face).*(swappable|replaceable|interchangeable|modular)/i.test(a)) {
      return bulletReason({
        fit: 'Facial customization could grow with printing and scarless work',
        path: 'It is visual and elective, but too extreme to become number one',
        joke: 'Seasonal noses still feel more sci-fi than Sephora'
      });
    }
    if (/(allergy|allergies|immune|immunity|inflammation)/i.test(a)) {
      return bulletReason({
        fit: 'Immune upgrades could sell as comfort medicine by 2045',
        path: 'Useful, but less status-driven than hair, skin, or body work',
        joke: 'Great procedure; terrible thirst-trap caption'
      });
    }
    if (/(brain|neural|neuralink|cognitive|chip)/i.test(a)) {
      return bulletReason({
        fit: 'Brain implants may exist by 2045, but trust scales slowly',
        path: 'Neurosurgery, privacy, and hacking fears keep it niche',
        joke: 'Most people still prefer upgrades outside the skull'
      });
    }
    if (/(hair\s*removal|remove hair|laser|wax|body hair)/i.test(a)) {
      return bulletReason({
        fit: 'Automated hair removal fits routine vanity medicine',
        path: 'It can scale if robots make it painless, cheap, and private',
        joke: 'The future still hates shaving; it just delegates better'
      });
    }
    if (/(hair|follicle|bald|scalp|transplant)/i.test(a)) {
      return bulletReason({
        fit: 'Hair restoration has vanity, visibility, and repeat demand',
        path: 'Robotics can make it cheaper, easier, and normal',
        joke: 'Your barber may upsell the executive density package'
      });
    }
    if (/(butt|bbl|body|contour|tighten|tightening|lift|cellulite|skin|wrinkle|botox|filler|weight|hormone|fertility|vision|dental|teeth|jaw|chin|nose|face)/i.test(a)) {
      return bulletReason({
        fit: 'Body upgrades have visible payoff and status pressure',
        path: 'By 2045, safer devices can make cosmetic work feel routine',
        joke: 'The waiting room will call it wellness with better lighting'
      });
    }
  }

  if (/\b(health\s*)?insurance|insurer|premium|deductible/.test(q)) {
    if (/(breath|breathing|respiration|respiratory|heart rate|pulse|hrv)/i.test(a)) {
      return bulletReason({
        fit: 'Wearables can track breathing, recovery, stress, and sleep',
        path: 'By 2038, passive vitals can become risk pricing',
        joke: 'Your premium may know you panic-breathed through Tuesday'
      });
    }
    if (/(protein|macro|nutrition)/i.test(a)) {
      return bulletReason({
        fit: 'Smart fridges, receipts, and wearables can infer diet',
        path: 'By 2038, food patterns become cheap risk signals',
        joke: 'Your premium may someday know you eyeballed the cheese'
      });
    }
    if (/(plant|plants|houseplant|houseplants|fern|air quality|air-quality)/i.test(a)) {
      return bulletReason({
        fit: 'Houseplants hint at wellness, but insurers need harder proof',
        path: 'Insurers will prefer sensors over living-room décor',
        joke: 'Unless the fern files claims, this stays decorative'
      });
    }
    if (/(ai usage|mental health|therapy bot|chatbot|therapist app|therapy app|vent to ai|alexa)/i.test(a)) {
      return bulletReason({
        fit: 'Digital therapy use can reveal stress and care seeking',
        path: 'By 2038, platforms can summarize patterns without diaries',
        joke: 'Your copay may know you vented to a chatbot'
      });
    }
    if (/(camera|watching|surveillance|ai watching)/i.test(a)) {
      return bulletReason({
        fit: 'Cameras could measure habits, stress, and safety',
        path: 'By 2038, passive monitoring becomes technically easy',
        joke: 'The future wants consent, even when the camera does not'
      });
    }
    if (/(sleep|screen|phone|scroll|doomscroll|stress)/i.test(a)) {
      return bulletReason({
        fit: 'Phones and wearables already expose sleep and stress',
        path: 'Insurers can package it as prevention with a discount',
        joke: 'Your deductible will know you watched one more episode'
      });
    }
    if (/(grocery|food|alcohol|delivery|sugar|snack)/i.test(a)) {
      return bulletReason({
        fit: 'Receipts and delivery apps already expose diet patterns',
        path: 'By 2038, grocery behavior can become risk math',
        joke: 'The checkout line becomes a tiny insurance deposition'
      });
    }
    if (/(steps|movement|heart|driving|loneliness|social|medication)/i.test(a)) {
      return bulletReason({
        fit: 'Daily behavior can connect to claims cost',
        path: 'The data is cheap, passive, and easy to package as care',
        joke: 'The app praises hydration while judging nachos'
      });
    }
  }

  if (q.includes('phobia')) {
    if (/(ai|deepfake|privacy|algorithm|job|replacement|drones|climate|medical|bill|loneliness|social|humiliation)/i.test(a)) {
      return bulletReason({
        fit: `${a} can touch work, identity, privacy, or safety`,
        path: 'Mass fear grows when news and feeds reinforce it daily',
        joke: 'This phobia only needs a notification badge'
      });
    }
  }
  if (q.includes('holiday')) {
    if (/(detox|unplug|screen|phone|digital)/i.test(a)) return bulletReason({ fit:'A global ritual can form around attention overload', path:'Schools, workplaces, and wellness brands can all participate', joke:'Everyone celebrates by posting that they are offline' });
    if (/(climate|restoration|earth|rewild|repair)/i.test(a)) return bulletReason({ fit:'Climate anxiety can turn into a repair ritual', path:'Governments and brands both get an easy participation story', joke:'Earth Day gets a sequel with better landscaping' });
    if (/(robot|machine|ai appreciation|ai respect|ai day)/i.test(a)) return bulletReason({ fit:'Machine gratitude is funny, but culturally uneven', path:'It works best as workplace theater, not a global holiday', joke:'Finally, a holiday where the toaster feels seen' });
  }
  if (q.includes('olympic sport')) {
    if (/(?:^|\b)(e-?sport|esports|gaming|video game|speed typing|typing)(?:\b|$)/i.test(a)) return bulletReason({ fit:'Too broad: the Olympics need a named event', path:'A medal sport needs rules, bodies, and one clean TV image', joke:'The IOC needs a sport, not browser history with uniforms' });
    if (/(drone|parkour|obstacle|mixed reality|vr|climbing|racing|pickleball)/i.test(a)) return bulletReason({ fit:`${a} has a clear visual contest`, path:'By 2040, global participation and TV clarity matter most', joke:'Announcers will make chaos sound ancient and noble' });
  }
  if (q.includes('fashion trend')) {
    if (/(y2k|low-rise|high-waist|wide leg|baggy|skinny|cargo|clogs|dad sneaker|denim|tracksuit)/i.test(a)) return bulletReason({ fit:`${a} has nostalgia and instant visual recognition`, path:'Fashion revives old shame every 15 to 25 years', joke:'Fashion is just regret with better lighting' });
  }
  if (q.includes('collect instead')) {
    if (/(memory|experience|verified|authentic|human|conversation|friend|data|ai art|access|moment|digital)/i.test(a)) return bulletReason({ fit:`${a} works if it signals scarcity and identity`, path:'Collectors follow status, proof, and bragging rights', joke:'Future snobs will make vinyl people seem relaxed' });
  }
  if (q.includes('ban private cars')) {
    if (/(san francisco|sf)/i.test(a)) return bulletReason({ fit:'San Francisco has density, transit, and climate politics', path:'Car-free districts can expand as congestion gets worse', joke:'Every driver will claim burrito pickup is essential' });
    if (/(new york|nyc|new york city)/i.test(a)) return bulletReason({ fit:'New York has density, transit, and congestion pressure', path:'Manhattan restrictions could spread into a broader ban', joke:'The last parking space will rent for more than the apartment' });
    if (/(paris|singapore|amsterdam|oslo|copenhagen|london|barcelona)/i.test(a)) return bulletReason({ fit:`${a} can enforce car-free life at urban scale`, path:'Climate rules and congestion push streets away from cars', joke:'The last parking spot becomes a UNESCO site' });
  }
  return '';
}

function guardrailFor(question='', answer=''){
  const q = String(question).toLowerCase();
  const a = String(answer || '').toLowerCase();
  if (q.includes('elective surgery')) {
    if (/(face|arm|organ|eye|hand|limb).*transplant|transplant.*(face|arm|organ|eye|hand|limb)/.test(a)) return { floor: 43, cap: 49, reason: specificReasonFor(question, answer, 'wrong-category') };
    if (/(swappable|replaceable|interchangeable|modular).*(nose|face)|(?:nose|face).*(swappable|replaceable|interchangeable|modular)/.test(a)) return { floor: 66, cap: 66, reason: specificReasonFor(question, answer, 'adjacent') };
    if (/(allergy|allergies|immune|immunity|inflammation)/.test(a)) return { floor: 70, cap: 70, reason: specificReasonFor(question, answer, 'adjacent') };
    if (/(brain|neural|neuralink|cognitive|chip)/.test(a)) return { cap: 46, floor: 38, reason: specificReasonFor(question, answer, 'future-adjacent') };
    if (/(hair\s*removal|remove hair|laser|wax|body hair)/.test(a)) return { floor: 74, cap: 86, reason: specificReasonFor(question, answer, 'exact') };
    if (/(hair|follicle|bald|scalp|transplant)/.test(a)) return { floor: 82, cap: 92, reason: specificReasonFor(question, answer, 'exact') };
    if (/(butt|bbl|body|contour|tighten|tightening|lift|cellulite|nose|face|jaw|chin|teeth|dental|skin|wrinkle|botox|filler|weight|hormone|fertility|vision|eye)/.test(a)) return { floor: 76, cap: 90, reason: specificReasonFor(question, answer, 'exact') };
  }
  if (/\b(health\s*)?insurance|insurer|premium|deductible/.test(q) && /(breath|breathing|respiration|respiratory|heart rate|pulse|hrv|protein|macro|nutrition|grocery|food|alcohol|sleep|screen|phone|scroll|doomscroll|steps|movement|stress|driving|loneliness|social|medication|camera|watching|surveillance)/.test(a)) return { floor: 78, cap: 94, reason: specificReasonFor(question, answer, 'exact') };
  if (/\b(health\s*)?insurance|insurer|premium|deductible/.test(q) && /(ai usage|ai watching|mental health|therapy bot|chatbot|therapist app|therapy app|alexa)/.test(a)) return { floor: 62, cap: 74, reason: specificReasonFor(question, answer, 'adjacent') };
  if (/\b(health\s*)?insurance|insurer|premium|deductible/.test(q) && /(plant|plants|houseplant|houseplants|fern|air quality|air-quality)/.test(a)) return { floor: 54, cap: 66, reason: specificReasonFor(question, answer, 'weak') };
  if (q.includes('holiday') && /(detox|unplug|screen|phone|digital|climate|restoration|earth|rewild|repair|robot|machine|ai appreciation)/.test(a)) return { floor: 72, cap: 91, reason: specificReasonFor(question, answer, 'exact') };
  if (q.includes('phobia') && /(ai|deepfake|privacy|algorithm|job|replacement|drones|climate|medical|bill|loneliness|social|humiliation)/.test(a)) return { floor: 78, cap: 94, reason: specificReasonFor(question, answer, 'exact') };
  if (q.includes('olympic sport') && /(^|\b)(e-?sport|esports|gaming|video game|speed typing|typing)(\b|$)/.test(a)) return { floor: 55, cap: 62, reason: specificReasonFor(question, answer, 'adjacent') };
  if (q.includes('olympic sport') && /(drone|parkour|obstacle|mixed reality|vr|climbing|racing)/.test(a)) return { floor: 76, cap: 92, reason: specificReasonFor(question, answer, 'exact') };
  if (q.includes('fashion trend') && /(y2k|low-rise|high-waist|wide leg|skinny|cargo|clogs|dad sneaker|denim|tracksuit)/.test(a)) return { floor: 76, cap: 92, reason: specificReasonFor(question, answer, 'exact') };
  if (q.includes('collect instead') && /(memory|experience|verified|authentic|human|conversation|data|ai art|access|moment|digital)/.test(a)) return { floor: 74, cap: 91, reason: specificReasonFor(question, answer, 'exact') };
  if (q.includes('ban private cars') && /(paris|singapore|amsterdam|oslo|copenhagen|london|barcelona|sf|san francisco|new york|nyc|new york city)/.test(a)) return { floor: 72, cap: 94, reason: specificReasonFor(question, answer, 'exact') };
  return null;
}

function clampScoreToGuardrails(parsed, question, answer){
  const result = { ...parsed };
  const guard = guardrailFor(question, answer);
  if (!guard) return result;
  if (typeof result.score !== 'number') result.score = guard.floor || 70;
  if (typeof guard.cap === 'number' && result.score > guard.cap) result.score = guard.cap;
  if (typeof guard.floor === 'number' && result.score < guard.floor) result.score = guard.floor;
  // Use deterministic show-quality reasoning for known answer classes. This prevents the live model
  // from upgrading a contestant's exact answer into a nicer adjacent idea or repeating generic copy.
  if (!result.reason || result.reason.length < 20 || reasonLooksBroken(result.reason) || reasonContainsBadScreenCopy(result.reason)) result.reason = guard.reason;
  result.reason = cleanReasonForDisplay(result.reason);
  return result;
}

function reasonContainsBadScreenCopy(reason){
  return /judged against the target year|future is bold|hates paperwork|three streaming|not a technology|not a future technology|not a technology or outcome|city name is not|basically screens|called basically|unless the question is about the future|not a direct answer unless|not a tangible future trend|\bthe model\b|data trail|future path|mixed signal|strong category|category fit|clearer signal|reliable data|needs a clearer|the answer needs|exact fit|mixed fit|direct answer|the ai wants|oracle wants stronger|future squints|adoption logic|strong category if|if it leaves|monthly\s*\.?$|who\.?$/i.test(String(reason || ''));
}

function polishScreenCopy(reason, question='', answer=''){
  const q = String(question || '').toLowerCase();
  const a = String(answer || '').trim();
  const al = a.toLowerCase();
  const bannedLine = /judged against the target year|future is bold|hates paperwork|three streaming|not a technology|not a future technology|not a technology or outcome|city name is not|basically screens|called basically|unless the question is about the future|not a direct answer unless|not a tangible future trend|\bthe model\b|data trail|future path|mixed signal|strong category|category fit|clearer signal|reliable data|needs a clearer|the answer needs|exact fit|mixed fit|direct answer|the ai wants|oracle wants stronger|future squints|adoption logic|strong category if|if it leaves|monthly\s*\.?$|who\.?$/i;
  const strip = (line='') => String(line)
    .replace(/^[•\-–—\s]+/, '')
    .replace(/^(WHY|LIKELIHOOD|PROBABILITY|SCALE|FUTURE|BURN|ORACLE BURN|FIT|FRICTION|BLOCK|SCORE LOGIC|FORECAST|JOKE|EVIDENCE|ADOPTION PATH|HUMAN BEHAVIOR)\s*:\s*/i, '')
    .replace(/^(exact|mixed|strong|weak)\s+(fit|signal|answer|category)\s*[:\-]?\s*/i, '')
    .replace(/^this answer\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const complete = (line, max=82) => {
    line = strip(line).replace(/[“”]/g, '"').replace(/[’]/g, "'");
    if (!line || bannedLine.test(line)) return '';
    line = line.replace(/[.?!…]+$/,'').replace(/[,;:]+$/,'').trim();
    if (line.length > max) line = line.slice(0, max).replace(/\s+\S*$/,'').trim();
    if (/\b(and|or|but|with|without|to|for|of|the|a|an|your|their|its|by|in|on|at|as|than|before|after|who)$/i.test(line)) return '';
    if (!line) return '';
    return line + '.';
  };

  let rawLines = String(reason || '')
    .replace(/```[\s\S]*?```/g,'')
    .split(/\n+|\s*[•]\s*/)
    .map(strip)
    .filter(Boolean)
    .filter(x => !bannedLine.test(x));

  // If the model returned a paragraph, split it into sentences.
  if (rawLines.length < 2) {
    rawLines = String(reason || '').replace(/\s+/g,' ').match(/[^.!?]+[.!?]/g) || rawLines;
    rawLines = rawLines.map(strip).filter(Boolean).filter(x => !bannedLine.test(x));
  }

  const fallback = universalFallbackBullets(q, a);
  const out = [];
  for (const line of rawLines) {
    if (out.length >= 2) break;
    const cleaned = complete(line, 70);
    if (cleaned && !out.some(x => x.toLowerCase() === cleaned.toLowerCase())) out.push(cleaned);
  }
  // Keep the live joke only if it is complete and not generic; otherwise use a specific joke.
  let jokeCandidate = rawLines.length ? rawLines[rawLines.length - 1] : '';
  let joke = complete(jokeCandidate, 70);
  if (!joke || out.some(x => x.toLowerCase() === joke.toLowerCase())) joke = answerSpecificJoke(question, answer).replace(/[.?!]*$/,'') + '.';
  while (out.length < 2 && fallback.length) {
    const f = complete(fallback.shift(), 86);
    if (f && !/This has a signal|target year|mass adoption/i.test(f)) out.push(f);
  }
  out.push(joke);
  return out.slice(0,3).map(line => `• ${line}`).join('\n');
}

function universalFallbackBullets(q='', a=''){
  const al = String(a || '').toLowerCase();
  if (/\b(health\s*)?insurance|insurer|premium|deductible/.test(q)) {
    if (/(plant|fern|houseplant|air quality)/.test(al)) return ['Houseplants hint at wellness, but insurers need harder proof', 'Sensors and receipts beat living-room vibes by 2038'];
    if (/(breath|heart|pulse|sleep|stress|steps|movement)/.test(al)) return ['Wearables can turn daily body patterns into risk math', 'Passive tracking scales when it feels like prevention'];
    if (/(food|protein|grocery|alcohol|sugar|snack|nutrition)/.test(al)) return ['Receipts and apps can expose diet without a confession', 'By 2038, food choices become cheap risk signals'];
    return ['It only works if it becomes passive and cheap to measure', 'By 2038, insurers will chase signals tied to real claims'];
  }
  if (q.includes('elective surgery')) {
    if (/(brain|chip|neural|implant)/.test(al)) return ['Neural tech may exist by 2045, but trust scales slowly', 'Mass elective medicine favors lower-risk vanity upgrades'];
    if (/(hair|bald|scalp|follicle)/.test(al)) return ['Hair restoration has visible payoff and constant demand', 'Robotics can make the procedure cheaper and more normal'];
    return [`${a} must move from weird upgrade to routine appointment`, 'Mass adoption needs safety, status, and a simple sales pitch'];
  }
  if (q.includes('ban private cars')) return [`${a} is judged as a city, not a gadget`, 'Transit, density, enforcement, and climate politics decide it'];
  if (q.includes('olympic sport')) return [`${a} needs rules, athletes, scoring, and TV clarity`, 'The IOC likes novelty only when it can medal it'];
  return [`${a} needs a path from odd idea to normal behavior`, 'The strongest future answers have incentives and scale'];
}


function finalOneLineFallback(question='', answer=''){
  const q = String(question || '').toLowerCase();
  const a = String(answer || 'No answer given').trim();
  const al = a.toLowerCase();
  const cap = (line) => {
    line = String(line || '').replace(/\.{2,}|…/g,'').replace(/\s+/g,' ').replace(/[.?!]+$/,'').trim();
    if (line.length > 110) line = line.slice(0,110).replace(/\s+\S*$/,'').trim();
    return line + '.';
  };
  if (q.includes('holiday')) {
    if (/(ai|robot|machine|bot)/.test(al)) return cap(`${a} works if companies turn machine gratitude into a global workplace ritual`);
    if (/(earth|climate|planet|water|ocean)/.test(al)) return cap(`${a} works if schools and brands can turn repair into a yearly ritual`);
    if (/(sleep|rest|quiet|offline|detox)/.test(al)) return cap(`${a} has legs because burnout already speaks every language`);
    return cap(`${a} works if the ritual is simple enough to copy worldwide`);
  }
  if (q.includes('olympic sport')) {
    if (/(drone)/.test(al)) return cap(`${a} has speed, clean scoring, and enough crashes for prime time`);
    if (/(pickle)/.test(al)) return cap(`${a} already has courts, sponsors, and suspiciously intense calves`);
    if (/(slam|slamball|trampoline|dunk)/.test(al)) return cap(`${a} has contact, aerial highlights, and rules a TV audience can follow`);
    if (/(esport|e-sport|gaming|video)/.test(al)) return cap(`${a} is too broad; the Olympics need one sport, not the whole internet`);
    return cap(`${a} works if it becomes global, visual, and easy to score by 2040`);
  }
  if (q.includes('fashion trend')) {
    if (/(bell|flare)/.test(al)) return cap(`${a} has nostalgia, silhouette, and just enough bad judgment to return`);
    if (/(baggy|oversized|wide)/.test(al)) return cap(`${a} has comfort, nostalgia, and enough celebrity photos to come roaring back`);
    if (/(jean|denim|waist)/.test(al)) return cap(`${a} has resale nostalgia and a shape people can spot from space`);
    return cap(`${a} can come back if it photographs clearly and annoys the right parents`);
  }
  if (q.includes('collect instead')) {
    if (/(friend|human|conversation|relationship)/.test(al)) return cap(`${a} becomes collectible only if real connection turns into status`);
    if (/(memory|experience|moment|dream)/.test(al)) return cap(`${a} works if it can be verified, displayed, and bragged about`);
    if (/(ai|digital|avatar|data)/.test(al)) return cap(`${a} needs scarcity and proof before collectors treat it like treasure`);
    return cap(`${a} works if it carries proof, scarcity, and social status`);
  }
  if (q.includes('ban private cars')) {
    if (/(san\s*fran|francisco|sf)/.test(al)) return cap(`Eco-friendly, high-density, and already more Waymos than patience`);
    if (/(new york|nyc|manhattan)/.test(al)) return cap(`New York has density, transit, and parking rage strong enough to become policy`);
    if (/(paris)/.test(al)) return cap(`Paris already treats cars like guests who overstayed and blocked the view`);
    if (/(amsterdam|copenhagen|oslo|london|tokyo|singapore|barcelona)/.test(al)) return cap(`${a} has the density and policy muscle to make private cars optional`);
    return cap(`${a} works if transit, density, and political will can beat driver outrage`);
  }
  return cap(`${a} works if it becomes visible, repeatable, and easy to brag about`);
}
function oneLineFinalReason(reason, question='', answer=''){
  const q = String(question || '').toLowerCase();
  const a = String(answer || '').trim();
  const al = a.toLowerCase();
  const banned = /judged against the target year|future is bold|hates paperwork|three streaming|not a technology|not a future technology|not a technology or outcome|city name is not|basically screens|called basically|unless the question is about the future|not a direct answer unless|not a tangible future trend|\bthe model\b|data trail|future path|mixed signal|strong category|category fit|clearer signal|reliable data|needs a clearer|the answer needs|exact fit|mixed fit|direct answer|the ai wants|oracle wants stronger|this has a signal|not enough scale|decent collectible|sharper status/i;
  const strip = (line='') => String(line)
    .replace(/^[•\-–—\s]+/, '')
    .replace(/^(WHY|LIKELIHOOD|PROBABILITY|SCALE|FUTURE|BURN|ORACLE BURN|FIT|FRICTION|BLOCK|SCORE LOGIC|FORECAST|JOKE|EVIDENCE)\s*:\s*/i, '')
    .replace(/^(exact|mixed|strong|weak)\s+(fit|signal|answer|category)\s*[:\-]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  let parts = String(reason || '').split(/\n+|\s*[•]\s*/).map(strip).filter(Boolean).filter(x => !banned.test(x));
  if (parts.length < 1) parts = (String(reason || '').replace(/\s+/g,' ').match(/[^.!?]+[.!?]/g) || []).map(strip).filter(Boolean).filter(x => !banned.test(x));
  const answerTokens = al.split(/[^a-z0-9]+/).filter(x => x.length > 3);
  let line = parts.find(x => answerTokens.some(t => x.toLowerCase().includes(t))) || parts[0] || '';
  line = strip(line).replace(/[.?!…]+$/,'').trim();
  const tooGeneric = !line || banned.test(line) || line.length < 18 || /\.{2,}|…|plausible future signal|runaway forecast|mass adoption|target year|not enough scale|clear evidence|possible, but|this idea needs|ai wants/i.test(line);
  if (tooGeneric) line = finalOneLineFallback(question, answer).replace(/[.?!…]+$/,'');
  if (line.length > 110) line = line.slice(0,110).replace(/\s+\S*$/,'').trim();
  if (/\b(and|or|but|with|without|to|for|of|the|a|an|your|their|its|by|in|on|at|as|than|before|after|who)$/i.test(line)) line = finalOneLineFallback(question, answer).replace(/[.?!…]+$/,'');
  return line + '.';
}

function officialFinalScoreOverride(question='', answer=''){
  const q = String(question||'').toLowerCase();
  const a = String(answer||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const has = (...words) => words.some(w => a.includes(String(w).toLowerCase()));
  if (q.includes('ban private cars')) {
    if (has('paris')) return 92;
    if (has('amsterdam')) return 88;
    if (has('oslo')) return 84;
    if (has('san francisco',' sf ')) return 81;
    if (has('london')) return 77;
    if (has('new york','nyc','manhattan')) return 72;
  }
  if (q.includes('olympic sport')) {
    if (has('drone')) return 89;
    if (has('parkour','freerunning')) return 79;
    if (has('esport','e sport','gaming','video game','speed typing')) return 58;
  }
  if (q.includes('holiday')) {
    if (has('digital detox','detox','unplug','phone free','screen free')) return 88;
    if (has('climate','restoration','rewild','earth')) return 86;
    if (has('robot','ai appreciation','machine')) return 76;
    if (has('space','mars','moon')) return 61;
  }
  if (q.includes('fashion trend')) {
    if (has('y2k','2000','low rise','low-rise','nostalgia','high waisted','high-waisted','jeans')) return 88;
    if (has('formal','suit','tailoring','dress up','dressed up')) return 82;
    if (has('neon','cyber','metallic')) return 76;
  }
  if (q.includes('collect instead')) {
    if (has('memory','memories','experience','experiences','conversation','conversations','real conversation')) return 89;
    if (has('nft','digital','avatar','skin','skins','virtual')) return 83;
    if (has('data','personal data','biometrics','dna')) return 77;
  }
  return null;
}

function reviewFinalResult(result, question, answer){
  const reviewed = { ...result };
  const official = officialFinalScoreOverride(question, answer);
  reviewed.score = clamp(official ?? reviewed.score ?? 72);
  reviewed.reason = oneLineFinalReason(reviewed.reason || fallbackReasonFor(question, answer), question, answer);
  return reviewed;
}

function reviewScoredResult(result, question, answer){
  const reviewed = { ...result };
  reviewed.score = clamp(reviewed.score || 72);
  const lines = String(reviewed.reason || '').split(/\n+/).map(x => normalizeTvSentence(x)).filter(Boolean);
  reviewed.reason = lines.slice(0,3).map(x => `• ${x}`).join('\n');
  return reviewed;
}

function parsePlayerBlock(raw, playerNum){
  const text = String(raw || '');
  const label = `PLAYER ${playerNum}`;
  const nextLabel = `PLAYER ${playerNum+1}`;
  let segment = text;
  const start = text.toUpperCase().indexOf(label);
  if (start >= 0) {
    segment = text.slice(start);
    const next = segment.toUpperCase().indexOf(nextLabel);
    if (next > 0) segment = segment.slice(0, next);
  }
  return parseScoredText(segment);
}

async function scoreSinglePrediction({question, answer, player, round, style}) {
  const system = `You are the live judging voice for NEXT BEST GUESS, a premium ABC game-show pitch.
Judge the contestant's exact answer against the exact question and target year. Do not rewrite the answer into a better idea.
Use adoption, cost, regulation, incentives, technology readiness, institutions, and human behavior.
Write like a sharp game-show oracle: specific, confident, concise, and lightly funny.
Return ONLY valid JSON with this exact shape:
{"score":82,"reason":"One complete TV-ready sentence of 9 to 18 words."}
The reason must be a complete sentence. Never end on a preposition or clipped phrase.`;
  const user = `ABC pitch context: executives are playing live.
Round: ${round}
Question: ${question}
${lensForQuestion(question)}
Contestant answer: ${answer}

Score guide:
93-97 = almost perfect future call.
85-92 = very strong and likely to scale.
74-84 = solid future logic with some friction.
60-73 = possible but partial, niche, or adjacent.
40-59 = clever but weak, overregulated, or wrong category.
Below 40 = barely answers the question.`;
  const text = await callOpenAIText(system, user);
  let parsed;
  try {
    const json = parseModelJson(text);
    parsed = { score: clamp(json.score), reason: normalizeTvSentence(json.reason, fallbackReasonFor(question, answer)) };
  } catch (e) {
    parsed = parseScoredText(text);
  }
  return reviewFinalResult(clampScoreToGuardrails(parsed, question, answer), question, answer);
}

function deterministicOpenPair(question='', answer='', playerNum=1){
  const q = String(question || '').toLowerCase();
  const a = String(answer || 'No answer given').trim();
  const displayAnswer = a ? a.charAt(0).toUpperCase() + a.slice(1) : 'No answer given';
  const al = a.toLowerCase();

  if (/\b(health\s*)?insurance|insurer|premium|deductible/.test(q)) {
    if (/(toilet|bathroom|urine|stool|bowel)/.test(al)) return {
      fact: `Smart toilets could turn ${a} into passive data about hydration, digestion, medication use, and early illness.`,
      joke: `Your deductible may soon know more about your bathroom than your spouse.`
    };
    if (/(neighbor|neighbour|community|kindness|treat people)/.test(al)) return {
      fact: `Insurers could connect ${a} with complaints, conflict, social isolation, stress, and long-term health risk.`,
      joke: `Being nice to Gary next door may soon count as preventive medicine.`
    };
    return {
      fact: `${displayAnswer} could matter if insurers can measure it consistently and prove that it predicts future medical costs.`,
      joke: answerSpecificJoke(question, answer, playerNum) + '.'
    };
  }

  if (q.includes('elective surgery')) {
    if (/(height|leg length|limb length|extension)/.test(al)) return {
      fact: `${displayAnswer} offers a visible status payoff, but painful recovery and medical risk limit mass adoption.`,
      joke: `Elevator shoes may survive because hospitals still charge for parking.`
    };
    if (/(third nipple|extra nipple)/.test(al)) return {
      fact: `${displayAnswer} could attract a body-modification niche, but mainstream demand would remain extremely limited.`,
      joke: `The future may add features, but probably not another cup-size category.`
    };
    return {
      fact: `${displayAnswer} needs a clear consumer benefit, safe recovery, and broad cultural acceptance to become a leading elective procedure.`,
      joke: answerSpecificJoke(question, answer, playerNum) + '.'
    };
  }

  return {
    fact: `${displayAnswer} has a plausible future only if demand, affordability, access, and public acceptance all grow together.`,
    joke: answerSpecificJoke(question, answer, playerNum) + '.'
  };
}

function parseOpenJson(text, question, answers){
  const json = parseModelJson(text);
  if (!json || !Array.isArray(json.players) || json.players.length !== 2) throw new Error('expected exactly two players');
  return json.players.map((p, i) => {
    const fact = normalizeTvSentence(p.fact);
    const joke = normalizeTvSentence(p.joke);
    if (!isCompleteTvSentence(fact, {minWords:10, maxWords:28})) throw new Error(`player ${i+1} fact is incomplete or badly sized`);
    if (!isCompleteTvSentence(joke, {minWords:6, maxWords:20})) throw new Error(`player ${i+1} joke is incomplete or badly sized`);
    if (/this has a signal|not enough scale|target year|needs a clearer path|future path|category fit|mixed fit/i.test(`${fact} ${joke}`)) {
      throw new Error(`player ${i+1} contains banned generic language`);
    }
    return { score: clamp(p.score), fact, joke, reason: `FACT: ${fact}\nJOKE: ${joke}` };
  });
}

async function requestOpenJson(system, user){
  const text = await callOpenAIText(system, user);
  return text;
}

async function scoreOpenMatch(payload){
  const answers = (payload.answers || []).map(normalizeAnswer);
  const q = payload.question || '';
  const system = `You are the live judging voice for NEXT BEST GUESS, a premium network game show.
Judge each contestant's exact answer against the exact question and target year. Never rewrite an answer into a better idea.

Return ONLY valid JSON with exactly this structure:
{"players":[
  {"score":82,"fact":"One complete factual sentence.","joke":"One complete host joke."},
  {"score":74,"fact":"One complete factual sentence.","joke":"One complete host joke."}
]}

For each player:
- FACT must explain in one natural sentence why the exact answer is plausible or weak.
- JOKE must be one short, host-ready sentence specifically about that exact answer.
- FACT must contain 10 to 28 words.
- JOKE must contain 6 to 20 words.
- Both must be complete sentences with natural spoken English.
- Never use generic rubric language such as "this has a signal," "not enough scale," "target year," or "future path."
- Never use fragments, dangling clauses, labels inside the field values, markdown, or text outside the JSON.`;
  const user = `ABC pitch context: executives are playing live.
Round: Round 3: Crystal Brawl
Question: ${q}
${lensForQuestion(q)}
Player 1 exact answer: ${answers[0] || 'No answer given'}
Player 2 exact answer: ${answers[1] || 'No answer given'}

Score guide:
93-97 = exceptionally likely future outcome.
85-92 = strong and likely to scale.
74-84 = plausible with meaningful friction.
60-73 = possible but niche, adjacent, or difficult.
40-59 = weak, overregulated, or poorly matched.
Below 40 = barely answers the question.`;

  let firstText = '';
  try {
    firstText = await requestOpenJson(system, user);
    const players = parseOpenJson(firstText, q, answers);
    return { live: true, players };
  } catch (firstError) {
    console.warn('Round 3 first response rejected:', firstError.message);
    try {
      const repairSystem = `Repair malformed game-show scoring JSON. Return ONLY valid JSON with two players, each containing score, fact, and joke.
Rewrite every defective field from scratch. FACT must be 10-28 words. JOKE must be 6-20 words. Both must be complete natural sentences.`;
      const repairUser = `Question: ${q}
Player 1 exact answer: ${answers[0] || 'No answer given'}
Player 2 exact answer: ${answers[1] || 'No answer given'}
Broken response:
${firstText}`;
      const repairedText = await requestOpenJson(repairSystem, repairUser);
      const players = parseOpenJson(repairedText, q, answers);
      return { live: true, repaired: true, players };
    } catch (repairError) {
      console.warn('Round 3 repair response rejected:', repairError.message);
      const players = answers.map((answer, i) => {
        const pair = deterministicOpenPair(q, answer, i + 1);
        return {
          score: fallbackScoreFor(q, answer, i),
          fact: pair.fact,
          joke: pair.joke,
          reason: `FACT: ${pair.fact}\nJOKE: ${pair.joke}`
        };
      });
      return { live: false, deterministicFallback: true, players };
    }
  }
}

async function evaluateWithOpenAI(payload) {
  if (payload.mode === 'open') {
    // Round 3 is intentionally never cached. Every reveal is generated, validated,
    // and returned as one atomic result so stale or partially repaired copy cannot leak through.
    const result = await scoreOpenMatch(payload);
    return { ...result, cached: false, serverVersion: SERVER_VERSION };
  }
  if (payload.mode === 'finalForecast') {
    const question = payload.question || '';
    const answer = normalizeAnswer(payload.answer || 'No answer given');
    const cached = getCachedAnswer('finalForecast', question, answer);
    if (cached?.result) return { live: false, cached: true, score: cached.result.score, reason: cached.result.reason, serverVersion: SERVER_VERSION };
    const result = await scoreSinglePrediction({
      question,
      answer,
      player: payload.player || 'Finalist',
      round: 'Round 4: Predict the Future'
    });
    setCachedAnswer('finalForecast', question, answer, { score: result.score, reason: result.reason });
    return { live: true, cached: false, score: result.score, reason: result.reason, cacheStats: cacheStats(), serverVersion: SERVER_VERSION };
  }
  throw new Error('unknown evaluation mode');
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/api/health') return send(res, 200, { ok: true, serverVersion: SERVER_VERSION , model: MODEL, fallbackModel: FALLBACK_MODEL, reasoningEffort: REASONING_EFFORT, hasKey: Boolean(getApiKey()), keySource: process.env.OPENAI_API_KEY ? 'environment' : (getApiKey() ? 'api_key.txt' : 'none'), cache: cacheStats() });
  if (url.pathname === '/api/cache/status') return send(res, 200, { ok: true, cache: cacheStats() });
  if (url.pathname === '/api/evaluate' && req.method === 'POST') {
    try {
      const payload = await readBody(req);
      try { return send(res, 200, await evaluateWithOpenAI(payload)); }
      catch (e) {
        const msg = e && e.message ? e.message : 'OpenAI call failed';
        return send(res, 200, payload.mode === 'open' ? { ...(await scoreOpenMatch(payload)), fallback: true, fallbackError: msg, serverVersion: SERVER_VERSION } : fallbackFinal(payload, msg));
      }
    } catch (e) { return send(res, 400, { error: e.message }); }
  }
  // Static file server. For the pitch, be forgiving: if Chrome asks for
  // a missing non-API route, send index.html instead of a dead Not Found page.
  let requested = decodeURIComponent(url.pathname || '/').trim();
  if (requested === '/' || requested === '') requested = '/index.html';
  let filePath = path.normalize(path.join(ROOT, requested));
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(ROOT, 'index.html'), (idxErr, idxData) => {
        if (idxErr) return send(res, 404, 'index.html missing from game folder', 'text/plain');
        return send(res, 200, idxData, 'text/html');
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'application/octet-stream';
    send(res, 200, data, type);
  });
});
server.on('error', (err) => {
  console.error('Server error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Run the included STOP_SERVER.command, then start again.`);
  }
  process.exit(1);
});
if (require.main === module) {
  server.listen(PORT, () => console.log(`Next Best Guess server ${SERVER_VERSION} running at http://localhost:${PORT}`));
}
module.exports = {
  normalizeTvSentence,
  isCompleteTvSentence,
  deterministicOpenPair,
  parseOpenJson,
  scoreOpenMatch,
  cleanReasonForDisplay
};
