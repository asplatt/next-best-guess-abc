const isDisplayWindow = new URLSearchParams(window.location.search).get('display') === '1';
let displayWindowRef = null;
let channel = null;
try { channel = new BroadcastChannel('next_best_guess_pitch_v7'); } catch(e) {}
const hostSessionId = (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2));
const displayControllerId = new URLSearchParams(window.location.search).get('controller') || '';
function escapeHtml(v){ return String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c])); }

const state = {
  index: -1,
  view: 'title',
  scores: [0, 0],
  playerNames: ['Player 1', 'Player 2'],
  selected: [null, null],
  orderAnswers: [[], []],
  openAnswers: ['', ''],
  openRevealCount: 0,
  openAwarded: [false, false],
  finalAnswer: null,
  finalTextAnswer: '',
  finalBank: 0,
  finalCorrect: 0,
  finalAnswers: ['', '', '', '', ''],
  finalReviewStep: 0,
  finalResults: [],
  finalPrize: 0,
  finalistIndex: 0,
  aiMode: localStorage.getItem('nbgAiMode') || 'live',
  aiEndpoint: ((location.protocol.startsWith('http') && !location.hostname.match(/^(127\.0\.0\.1|localhost)$/)) ? '/api/evaluate' : (localStorage.getItem('nbgAiEndpoint') || (location.protocol.startsWith('http') ? '/api/evaluate' : 'http://127.0.0.1:8787/api/evaluate'))),
  liveResults: {},
  liveError: '',
  revealData: null,
  sound: true,
  externalDisplay: false,
  sessionId: hostSessionId,
  timerVisible: false,
  timerTotal: 0,
  timerEnd: 0,
  revealed: false,
  rankRevealStep: 0,
  soundEventId: 0,
  soundKind: null,
  ts: 0
};

const $ = (id) => document.getElementById(id);
const els = {
  titleCard: $('titleCard'), gameCard: $('gameCard'), processing: $('processing'), reveal: $('reveal'), finale: $('finale'),
  roundPill: $('roundPill'), roundLabel: $('roundLabel'), questionText: $('questionText'), choices: $('choices'), ordering: $('ordering'), openAnswers: $('openAnswers'),
  timer: $('timer'), timerRing: $('timerRing'), timerNumber: $('timerNumber'), processingText: $('processingText'), codeStream: $('codeStream'),
  revealKicker: $('revealKicker'), revealTitle: $('revealTitle'), revealBody: $('revealBody'), scoreAwards: $('scoreAwards'),
  p1NameDisplay: $('p1NameDisplay'), p2NameDisplay: $('p2NameDisplay'), p1Score: $('p1Score'), p2Score: $('p2Score'),
  hostPanel: $('hostPanel'), answerControls: $('answerControls'), hostNotes: $('hostNotes'), soundStatus: $('soundStatus'),
  p1Input: $('p1Input'), p2Input: $('p2Input'), finaleTitle: $('finaleTitle'), finaleBody: $('finaleBody'), winnerName: $('winnerName'),
  openDisplay: $('openDisplay'), displayStatus: $('displayStatus'), aiModeSelect: $('aiModeSelect'), aiEndpointInput: $('aiEndpointInput'), testAiBtn: $('testAiBtn'), aiStatus: $('aiStatus')
};
let processingInterval = null, processingTimeout = null, timerInterval = null, lastSoundEventSeen = 0;

function snapshot(){ return JSON.parse(JSON.stringify({...state, ts: Date.now()})); }
function sync(){
  if (isDisplayWindow) return;
  const data = snapshot();
  try { localStorage.setItem('nbgPitchSyncV7', JSON.stringify(data)); } catch(e) {}
  if (channel) channel.postMessage(data);
  try { if (displayWindowRef && !displayWindowRef.closed) displayWindowRef.postMessage({ source:'nbg-host', payload:data }, '*'); } catch(e) {}
}
function applySync(data){
  if (!data || !isDisplayWindow) return;
  // Display windows should only follow the host window that opened them.
  // This prevents old tabs or stale localStorage from randomly jumping the TV back to an earlier slide.
  if(displayControllerId && data.sessionId && data.sessionId !== displayControllerId) return;
  if(Number(data.ts || 0) < Number(state.ts || 0)) return;
  Object.assign(state, data);
  renderCurrent(false);
  if (state.soundEventId && state.soundEventId !== lastSoundEventSeen){ lastSoundEventSeen = state.soundEventId; playSound(state.soundKind); }
}
if (channel) channel.onmessage = e => applySync(e.data);
window.addEventListener('storage', e => { if(e.key==='nbgPitchSyncV7'){ try{ applySync(JSON.parse(e.newValue)); }catch(err){} } });
window.addEventListener('message', e => {
  const msg = e.data || {};
  if (isDisplayWindow && msg.source === 'nbg-host') { applySync(msg.payload); try{ window.opener?.postMessage({source:'nbg-display', type:'ready'}, '*'); }catch(err){} }
  if (!isDisplayWindow && msg.source === 'nbg-display' && els.displayStatus) els.displayStatus.textContent = 'TV game window connected. Drag it to the TV, fullscreen it, then run from this host board.';
});

function hideAll(){ [els.titleCard, els.gameCard, els.processing, els.reveal, els.finale].forEach(el => el?.classList.add('hidden')); stopProcessingAnimation(); document.body.classList.remove('final-round','ai-awake-mode','round-title-mode','final-review-mode','open-reveal-mode','panel-mode','order-mode','mcrank-mode'); }
function setNames(){ state.playerNames = [els.p1Input.value || 'Player 1', els.p2Input.value || 'Player 2']; updateScoreboard(); renderHostControls(); sync(); }
function updateScoreboard(flash=false){
  const q = current();
  const board = document.querySelector('.scoreboard');
  const p1Box = document.querySelector('.player-score.p1');
  const p2Box = document.querySelector('.player-score.p2');
  const title = document.querySelector('.score-title');
  const inFinal = q?.round?.includes('Round 4');
  if(inFinal){
    board?.classList.add('final-mode');
    title.textContent = 'GRAND PRIZE';
    const finalName = state.playerNames[state.finalistIndex];
    const prize = state.finalPrize || 0;
    if(state.finalistIndex === 0){
      p1Box.classList.remove('hidden-final'); p2Box.classList.add('hidden-final');
      els.p1NameDisplay.textContent = finalName; els.p1Score.textContent = `$${prize.toLocaleString()}`;
    } else {
      p2Box.classList.remove('hidden-final'); p1Box.classList.add('hidden-final');
      els.p2NameDisplay.textContent = finalName; els.p2Score.textContent = `$${prize.toLocaleString()}`;
    }
  } else {
    board?.classList.remove('final-mode'); p1Box?.classList.remove('hidden-final'); p2Box?.classList.remove('hidden-final');
    title.textContent = 'SCOREBOARD';
    els.p1NameDisplay.textContent = state.playerNames[0]; els.p2NameDisplay.textContent = state.playerNames[1];
    els.p1Score.textContent = state.scores[0]; els.p2Score.textContent = state.scores[1];
  }
  els.soundStatus.textContent = `Sound: ${state.sound ? 'On' : 'Muted'}`;
  if(flash){ const b=document.querySelector('.scoreboard'); b?.classList.remove('flash'); void b?.offsetWidth; b?.classList.add('flash'); }
}
function resetQuestionState(){ state.selected=[null,null]; state.orderAnswers=[[],[]]; state.openAnswers=['','']; state.openRevealCount=0; state.openAwarded=[false,false]; state.finalAnswer=null; state.finalTextAnswer=''; state.revealed=false; state.rankRevealStep=0; state.revealData=null; clearTimeout(processingTimeout); }
function startGame(){ setNames(); state.scores=[0,0]; state.finalBank=0; state.finalCorrect=0; state.finalAnswers=['','','','','']; state.finalReviewStep=0; state.finalResults=[]; state.finalPrize=0; state.finalistIndex=0; state.liveResults={}; state.liveError=''; state.index=0; resetQuestionState(); state.view='game'; renderCurrent(true); emitSound('advance'); sync(); }
function current(){ return questions[state.index]; }

function renderCurrent(){ updateScoreboard(); renderTimerState(); if(state.view==='title') renderTitle(); else if(state.view==='game') renderGame(); else if(state.view==='processing') renderProcessing(); else if(state.view==='reveal') renderRevealState(); else if(state.view==='finale') renderFinaleState(); if(!isDisplayWindow){ renderHostControls(); renderNotes(); } }
function renderTitle(){ hideAll(); els.titleCard.classList.remove('hidden'); els.roundPill.textContent='Pitch Demo'; }
function renderGame(){
  const q=current(); if(!q) return renderTitle(); hideAll();
  if(q.type === 'roundTitle') return renderRoundTitle(q);
  if(q.type === 'panel') return renderPanel(q);
  if(q.type === 'aiAwake') return renderAiAwake(q);
  if(q.type === 'bankReveal') return renderBankReveal(q);
  if(q.type === 'finalReview') return renderFinalReview(q);
  if(q.type === 'finalTotal') return renderFinalTotal(q);
  els.gameCard.classList.remove('hidden');
  if(q.round && q.round.includes('Round 4')) document.body.classList.add('final-round');
  els.roundPill.textContent = q.round; els.roundLabel.textContent = q.round; els.questionText.textContent = q.question;
  els.choices.innerHTML=''; els.ordering.innerHTML=''; els.openAnswers.innerHTML='';
  els.choices.classList.add('hidden'); els.ordering.classList.add('hidden'); els.openAnswers.classList.add('hidden');
  if(q.type==='mcRank') document.body.classList.add('mcrank-mode');
  if(q.type==='mc' || q.type==='mcRank' || q.type==='finalMc') renderMultipleChoice(q);
  if(q.type==='order'){ document.body.classList.add('order-mode'); renderOrdering(q); }
  if(q.type==='open') renderOpen(q);
  if(q.type==='finalPercent') renderFinalPercent(q);
  if(q.type==='finalCollect') renderFinalCollect(q);
  paintSelections();
}
function renderRoundTitle(q){
  els.finale.classList.remove('hidden'); if(q.round.includes('Round 4')) document.body.classList.add('final-round');
  document.body.classList.add('round-title-mode');
  els.finale.querySelector('.kicker').textContent = q.title;
  els.finaleTitle.textContent = q.subtitle;
  els.finaleBody.textContent = q.body;
  els.winnerName.textContent = '';
  els.roundPill.textContent = q.round;
}
function renderPanel(q){
  document.body.classList.add('panel-mode');
  els.reveal.classList.remove('hidden'); els.roundPill.textContent = 'Comedic Panel';
  els.revealKicker.textContent=''; els.revealTitle.textContent=''; els.revealBody.textContent='';
  els.scoreAwards.innerHTML = `<div class="panel-image-wrap panel-only"><img src="${q.image}" alt="Comedic Panel"></div>`;
}
function renderAiAwake(q){
  document.body.classList.add('final-round','ai-awake-mode'); els.processing.classList.remove('hidden'); els.roundPill.textContent=q.round;
  els.processingText.textContent = `${state.playerNames[state.finalistIndex]} vs The Future`;
  els.codeStream.textContent = '';
  // Static intro beat. No long fake loading loop here.
}
function renderBankReveal(q){
  document.body.classList.add('final-round'); els.reveal.classList.remove('hidden'); els.roundPill.textContent=q.round;
  els.revealKicker.textContent='BANK LOCKED'; els.revealTitle.textContent=`$${state.finalBank}`; els.revealBody.textContent=`${state.playerNames[state.finalistIndex]} got ${state.finalCorrect} correct. ${q.body}`;
  els.scoreAwards.innerHTML = `<div class="mini-answer-row">Final formula: Bank × AI predictability percentage = Grand Prize</div>`;
}
const PHOTO_URLS = [
  // User-supplied pitch images for the fashion/trends question
  {re:/gender|neutral|clothing/i, url:'gender_neutral.jpg'},
  {re:/y2k|nostalgia|90s|revival/i, url:'y2k_90s_cd.jpg'},
  {re:/sneaker|shoe|dad/i, url:'chunky_sneaker.jpg'},
  {re:/high-waisted|high waisted|pants|jean|waist|denim/i, url:'high_waisted_jeans.jpg'},

  // Real photo thumbnails for remaining Round 1 and Round 2 answers
  {re:/swip/i, url:'swiping.jpg'},
  {re:/profile picture|photo/i, url:'profile_pic.jpg'},
  {re:/location/i, url:'location_dating.jpg'},
  {re:/personality/i, url:'personality_test.jpg'},
  {re:/cricket/i, url:'cricket_bar.jpg'},
  {re:/meat|lab-grown/i, url:'https://images.unsplash.com/photo-1603048297172-c92544798d5a?auto=format&fit=crop&w=360&q=75'},
  {re:/algae|milk/i, url:'algae_milk.jpg'},
  {re:/cheetos|heat/i, url:'cheeto.jpg'},
  {re:/marriage/i, url:'marry_ai.jpg'},
  {re:/estate|inherit|inherits/i, url:'inherit_estate.jpg'},
  {re:/cuddler|therapist/i, url:'cuddler.jpg'},
  {re:/memory|deletion/i, url:'memory_deletion.jpg'},
  {re:/pet|fur|cat|dog/i, url:'designer_pet.jpg'},
  {re:/toilet/i, url:'smart_toilet.jpg'},
  {re:/dream|ad/i, url:'ads_in_dreams.jpg'},
  {re:/clone|canceled/i, url:'ai_clone.jpg'},
  {re:/ai/i, url:'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=360&q=75'}
];
function thumbForChoice(choice){
  const c=String(choice||'');
  const match = PHOTO_URLS.find(x=>x.re.test(c));
  if(match) return `<span class="thumb photo-thumb" style="background-image:linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.35)), url('${match.url}')"></span>`;
  return `<span class="thumb photo-thumb"></span>`;
}
function renderMultipleChoice(q){
  els.choices.classList.remove('hidden');
  q.choices.forEach((choice,i)=>{ const div=document.createElement('div'); div.className='choice choice-with-image'; div.dataset.index=i; div.innerHTML=`${thumbForChoice(choice)}<span class="letter">${String.fromCharCode(65+i)}</span><span class="choice-text">${choice}</span>`; els.choices.appendChild(div); });
}
function renderOrdering(q){
  els.ordering.classList.remove('hidden');
  q.choices.forEach((choice,i)=>{ const div=document.createElement('div'); div.className='order-item order-with-image'; div.innerHTML=`${thumbForChoice(choice)}<div class="order-number">${String.fromCharCode(65+i)}</div><div class="order-text">${choice}</div>`; els.ordering.appendChild(div); });
}
function renderOpen(){
  els.openAnswers.classList.remove('hidden');
  els.openAnswers.innerHTML = [0,1].map(i=>`<div class="answer-card"><h3>${state.playerNames[i]}</h3><p>${state.openAnswers[i] || 'Waiting for answer...'}</p></div>`).join('');
}
function renderFinalPercent(){
  els.openAnswers.classList.remove('hidden');
  const i = state.finalistIndex;
  els.openAnswers.innerHTML = `<div class="answer-card solo"><h3>${state.playerNames[i]}</h3><p>${state.finalTextAnswer || 'Waiting for final prediction...'}</p></div><div class="answer-card ai-card"><h3>AI Multiplier</h3><p>Bank × Forecast %</p></div>`;
}
function renderFinalCollect(q){
  els.openAnswers.classList.remove('hidden');
  els.openAnswers.innerHTML = `<div class="answer-card solo final-answer-entry"><h3>${state.playerNames[state.finalistIndex]}'s Prediction</h3><p>${state.finalAnswers[q.finalIdx] || 'Waiting for prediction...'}</p></div>`;
}
function renderFinalReview(q){
  document.body.classList.add('final-round','ai-awake-mode','final-review-mode');
  document.body.classList.remove('final-single-review-mode');
  els.reveal.classList.remove('hidden');
  els.roundPill.textContent=q.round;
  els.revealKicker.textContent='AI FINAL REVIEW';
  els.revealTitle.textContent=q.title;
  const total = state.finalAnswers.length || 5;
  els.revealBody.textContent = state.finalReviewStep > 0
    ? `Forecast ${Math.min(state.finalReviewStep,total)} of ${total}. Press Reveal to show the next forecast.`
    : `${state.playerNames[state.finalistIndex]}'s predictions are locked. Reveal the forecasts one by one.`;
  const finalQuestions = questions.filter(x=>x.type==='finalCollect');
  const rows = Array.from({length: total}, (_,i)=>{
    const shown = i < state.finalReviewStep && !!state.finalResults[i];
    const question = finalQuestions[i]?.question || '';
    const answer = state.finalAnswers[i] || 'No answer entered';
    const res = state.finalResults[i];
    const impact = shown ? `+$${(res.score*(q.multiplier||100)).toLocaleString()} <span>${res.score}%</span>` : 'LOCKED';
    return `<div class="final-review-row ${shown?'revealed':'locked'} answer-only">
      <div class="review-q"><b>Q${i+1}</b> ${escapeHtml(question)}</div>
      <div class="review-mid final-answer-only"><div class="review-answer">${escapeHtml(state.playerNames[state.finalistIndex])}: ${escapeHtml(answer)}</div></div>
      <div class="review-impact">${impact}</div>
    </div>`;
  }).join('');
  els.scoreAwards.innerHTML = `<div class="final-review-board">${rows}<div class="final-running-total">Running Grand Prize: $${state.finalPrize.toLocaleString()}</div></div>`;
}

function tightFinalLineFallback(question='', answer=''){
  const q=String(question||'').toLowerCase();
  const a=String(answer||'No answer').trim();
  const al=a.toLowerCase();
  const cap=line=>{
    line=String(line||'').replace(/\.{2,}|…/g,'').replace(/\s+/g,' ').replace(/[.?!]+$/,'').trim();
    if(line.length>92) line=line.slice(0,92).replace(/\s+\S*$/,'').trim();
    return line+'.';
  };
  if(q.includes('holiday')){
    if(/(ai|robot|machine|bot)/.test(al)) return cap(`${a} works if offices turn machine gratitude into an annual ritual`);
    if(/(climate|earth|planet|water|ocean)/.test(al)) return cap(`${a} works if schools and brands can turn repair into a yearly ritual`);
    if(/(sleep|rest|quiet|offline|detox)/.test(al)) return cap(`${a} has legs because burnout already speaks every language`);
    return cap(`${a} works if the ritual is simple enough to copy worldwide`);
  }
  if(q.includes('olympic sport')){
    if(/drone/.test(al)) return cap(`${a} has speed, clean scoring, and enough crashes for prime time`);
    if(/pickle/.test(al)) return cap(`${a} already has courts, sponsors, and suspiciously intense calves`);
    if(/(slam|slamball|trampoline|dunk)/.test(al)) return cap(`${a} has contact, aerial highlights, and rules a TV audience can follow`);
    if(/(esport|e-sport|gaming|video)/.test(al)) return cap(`${a} is too broad; the Olympics need one sport, not the whole internet`);
    return cap(`${a} works if it becomes global, visual, and easy to score by 2040`);
  }
  if(q.includes('fashion trend')){
    if(/(bell|flare)/.test(al)) return cap(`${a} has nostalgia, silhouette, and just enough bad judgment to return`);
    if(/(baggy|oversized|wide)/.test(al)) return cap(`${a} has comfort, nostalgia, and enough celebrity photos to come roaring back`);
    if(/(jean|denim|waist)/.test(al)) return cap(`${a} has resale nostalgia and a shape people can spot from space`);
    return cap(`${a} can come back if it photographs clearly and annoys the right parents`);
  }
  if(q.includes('collect instead')){
    if(/(friend|human|conversation|relationship)/.test(al)) return cap(`${a} becomes collectible only if real connection turns into status`);
    if(/(memory|experience|moment|dream)/.test(al)) return cap(`${a} works if it can be verified, displayed, and bragged about`);
    if(/(ai|digital|avatar|data)/.test(al)) return cap(`${a} needs scarcity and proof before collectors treat it like treasure`);
    return cap(`${a} works if it carries proof, scarcity, and social status`);
  }
  if(q.includes('ban private cars')){
    if(/(san\s*fran|francisco|sf)/.test(al)) return cap('Eco-friendly, high-density, and already more Waymos than patience');
    if(/(new york|nyc|manhattan)/.test(al)) return cap('New York has density, transit, and parking rage strong enough to become policy');
    if(/paris/.test(al)) return cap('Paris already treats cars like guests who overstayed and blocked the view');
    if(/(amsterdam|copenhagen|oslo|london|tokyo|singapore|barcelona)/.test(al)) return cap(`${a} has the density and policy muscle to make private cars optional`);
    return cap(`${a} works if transit, density, and political will can beat driver outrage`);
  }
  return cap(`${a} works if it becomes visible, repeatable, and easy to brag about`);
}
function compactFinalReason(reason, answer='', question=''){
  const bad=/judged against the target year|future is bold|hates paperwork|three streaming|not a technology|not a future technology|not a technology or outcome|city name is not|basically screens|called basically|unless the question is about the future|not a direct answer unless|not a tangible future trend|the model|data trail|future path|category fit|exact fit|mixed fit|needs a clearer|not enough scale|clear evidence|possible, but|this idea needs|\.\.\.|…/i;
  const ans = String(answer||'').trim();
  const tokens = ans.toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>3);
  const clean = (x='') => x.replace(/^[•\-–—\s]+/,'').replace(/^(why|likelihood|future|burn|forecast|oracle)\s*:\s*/i,'').replace(/\.{2,}|…/g,'').replace(/\s+/g,' ').replace(/[.?!]+$/,'').trim();
  let lines = formatReasonBullets(reason).split(/\n+/).map(clean).filter(Boolean).filter(x=>!bad.test(x));
  let line = lines.find(x=>tokens.some(t=>x.toLowerCase().includes(t))) || lines.find(x=>/by\s+20\d\d|could|will|becomes|scales|global|city|transit|market/i.test(x)) || '';
  if(!line || bad.test(line) || line.length < 18) line = tightFinalLineFallback(question, answer).replace(/[.?!]+$/,'');
  if(line.length > 110) line = tightFinalLineFallback(question, answer).replace(/[.?!]+$/,'');
  if(/\b(and|or|but|with|without|to|for|of|the|a|an|your|their|its|by|in|on|at|as|than|before|after|who)$/i.test(line)) line = tightFinalLineFallback(question, answer).replace(/[.?!]+$/,'');
  return line + '.';
}
function renderFinalTotal(q){
  document.body.classList.add('final-round','ai-awake-mode');
  els.finale.classList.remove('hidden');
  els.roundPill.textContent=q.round;
  els.finale.querySelector('.kicker').textContent='GRAND PRIZE FORECAST';
  els.finaleTitle.textContent=`$${state.finalPrize.toLocaleString()}`;
  els.finaleBody.textContent=`${state.playerNames[state.finalistIndex]} challenged the future across five predictions. The AI converted each predictability percentage into prize money.`;
  els.winnerName.innerHTML=`${state.playerNames[state.finalistIndex]}<div class="formula">Five forecasts scored · $100 per predictability point</div>`;
}
function paintSelections(){
  document.querySelectorAll('.choice').forEach(el => el.classList.remove('selected-p1','selected-p2','correct','selected-final'));
  const q=current();
  if(q?.type==='finalMc') { if(state.finalAnswer!==null) document.querySelector(`.choice[data-index="${state.finalAnswer}"]`)?.classList.add('selected-final'); return; }
  state.selected.forEach((sel, player)=>{ if(sel!==null) document.querySelector(`.choice[data-index="${sel}"]`)?.classList.add(player===0?'selected-p1':'selected-p2'); });
}

function renderHostControls(){
  if(isDisplayWindow) return; syncAiControls(); const q=current(); els.answerControls.innerHTML=''; if(!q) return;
  if(q.type==='mcRank' && state.view==='reveal' && (state.rankRevealStep||0) < 3){ els.answerControls.innerHTML='<span>Ranking reveal in progress. Press the main Reveal button for the next reveal.</span>'; els.hostNotes.textContent='Ranking reveal in progress: #4, then #3, then #2 and #1 together.'; return; }
  if(['roundTitle','panel','aiAwake','bankReveal','finalTotal'].includes(q.type)){ els.answerControls.innerHTML='<span>No answer entry on this beat. Hit Next Question when ready.</span>'; return; }
  if(q.type==='finalReview'){ els.answerControls.innerHTML=`<span>AI Final Review. Mode: ${state.aiMode==='live'?'Live AI with scripted fallback':'Scripted fallback only'}. Press Reveal to process and reveal the next forecast.</span>`; return; }
  if(q.type==='open' && state.view==='reveal'){
    if(state.openRevealCount===1){
      els.answerControls.innerHTML='<span>Both AI explanations are on screen. Press the main Reveal button to reveal both percentages together.</span>'; return;
    }
    if(state.openRevealCount>=2){ els.answerControls.innerHTML='<span>Scores revealed. Hit Next Question when ready.</span>'; return; }
  }
  if(q.type==='mc' || q.type==='mcRank'){
    [0,1].forEach(player=>{ const label=document.createElement('label'); label.textContent=`${state.playerNames[player]} answer `; const select=document.createElement('select'); select.innerHTML='<option value="">Choose</option>'+q.choices.map((c,i)=>`<option value="${i}">${String.fromCharCode(65+i)}: ${c}</option>`).join(''); if(state.selected[player]!==null) select.value=String(state.selected[player]); select.addEventListener('change',()=>{ state.selected[player]=select.value===''?null:Number(select.value); paintSelections(); sync(); }); label.appendChild(select); els.answerControls.appendChild(label); });
  }
  if(q.type==='order'){
    [0,1].forEach(player=>{ const wrap=document.createElement('label'); wrap.textContent=`${state.playerNames[player]} order `; const input=document.createElement('input'); input.placeholder='Example: D B A C'; input.value=(state.orderAnswers[player]||[]).map(n=>String.fromCharCode(65+n)).join(' '); input.addEventListener('input',()=>{ state.orderAnswers[player]=parseOrder(input.value); sync(); }); wrap.appendChild(input); els.answerControls.appendChild(wrap); });
  }
  if(q.type==='open'){
    [0,1].forEach(player=>{ const wrap=document.createElement('label'); wrap.textContent=`${state.playerNames[player]} answer `; const textarea=document.createElement('textarea'); textarea.placeholder='Type short spoken answer'; textarea.value=state.openAnswers[player]||''; textarea.addEventListener('input',()=>{ state.openAnswers[player]=textarea.value; renderOpen(); sync(); }); wrap.appendChild(textarea); els.answerControls.appendChild(wrap); });
  }
  if(q.type==='finalMc'){
    const label=document.createElement('label'); label.textContent=`${state.playerNames[state.finalistIndex]} answer `; const select=document.createElement('select'); select.innerHTML='<option value="">Choose</option>'+q.choices.map((c,i)=>`<option value="${i}">${String.fromCharCode(65+i)}: ${c}</option>`).join(''); if(state.finalAnswer!==null) select.value=String(state.finalAnswer); select.addEventListener('change',()=>{ state.finalAnswer=select.value===''?null:Number(select.value); paintSelections(); sync(); }); label.appendChild(select); els.answerControls.appendChild(label);
  }
  if(q.type==='finalCollect'){
    const wrap=document.createElement('label'); wrap.textContent=`${state.playerNames[state.finalistIndex]} prediction `; const textarea=document.createElement('textarea'); textarea.placeholder='Type spoken prediction'; textarea.value=state.finalAnswers[q.finalIdx]||''; textarea.addEventListener('input',()=>{ state.finalAnswers[q.finalIdx]=textarea.value; renderFinalCollect(q); sync(); }); wrap.appendChild(textarea); els.answerControls.appendChild(wrap);
  }
  if(q.type==='finalPercent'){
    const wrap=document.createElement('label'); wrap.textContent=`${state.playerNames[state.finalistIndex]} prediction `; const textarea=document.createElement('textarea'); textarea.placeholder='Type city answer'; textarea.value=state.finalTextAnswer||''; textarea.addEventListener('input',()=>{ state.finalTextAnswer=textarea.value; renderFinalPercent(); sync(); }); wrap.appendChild(textarea); els.answerControls.appendChild(wrap);
  }
}
function parseOrder(value){ return (value||'').toUpperCase().replace(/[^ABCD]/g,'').split('').map(ch=>ch.charCodeAt(0)-65).filter(n=>n>=0&&n<4); }
function renderNotes(){
  const q=current(); if(!q){ els.hostNotes.textContent='Open the TV window, drag it to the television, then use this MacBook screen as your control board.'; return; }
  let notes = `Current: ${q.round}. `;
  if(q.type==='roundTitle') notes += 'Round title slide. Hit Next Question after you intro it.';
  if(q.type==='panel') notes += 'Comedic panel explainer. Hit Next Question when done.';
  if(q.type==='mcRank') notes += 'Enter both spoken answers, then hit Reveal. The game will process, then reveal #4, then #3, then #2 and #1 together. 1st place = 40 points, 2nd = 30, 3rd = 20, 4th = 10.';
  if(q.type==='mc') notes += 'Enter both spoken answers, then hit Reveal.';
  if(q.type==='order') notes += 'Enter each player order as letters. Each exact placement earns 1 point.';
  if(q.type==='open') notes += state.aiMode==='live' ? 'Type short answers, then hit Reveal. The game runs live AI scoring behind the scenes, with fallback armed.' : 'Type short answers, then hit Reveal. The game runs scripted scoring behind the scenes.';
  if(q.type==='aiAwake') notes += 'Final challenge intro. Hit Next Question to begin the five-question bank.';
  if(q.type==='finalMc') notes += `${state.playerNames[state.finalistIndex]} only. Correct answer adds $${q.bankValue} to the final bank.`;
  if(q.type==='finalCollect') notes += `${state.playerNames[state.finalistIndex]} only. Type the prediction, then hit Next Question. No reveal until the AI Final Review.`;
  if(q.type==='finalReview') notes += state.aiMode==='live' ? 'Press Reveal for the next final answer. The game runs live AI scoring behind the scenes, with instant fallback if the server is unavailable.' : 'Press Reveal to show the next final forecast percentage and prize impact. After all five, hit Next Question for the grand prize page.';
  if(q.type==='finalTotal') notes += 'Final prize page.';
  if(q.type==='bankReveal') notes += 'Bank reveal. Hit Next Question for the final percentage prediction.';
  if(q.type==='finalPercent') notes += 'Type the finalist city answer, then hit Reveal for the percentage multiplier and grand prize.';
  els.hostNotes.textContent = notes;
}
function showProcessing(){
  const q=current(); if(state.index<0 || ['roundTitle','panel','aiAwake','bankReveal','finalCollect','finalTotal'].includes(q?.type)) return;
  clearTimeout(processingTimeout); state.view='processing'; renderCurrent(true); emitSound('process'); sync();
  if(state.aiMode==='live' && (q?.type==='open' || q?.type==='finalReview')){
    let finished=false;
    const revealSoon=()=>{ if(finished) return; finished=true; clearTimeout(processingTimeout); processingTimeout=setTimeout(()=>revealAnswer(), 350); };
    runLiveEvaluation(q).then(revealSoon).catch(revealSoon);
    processingTimeout=setTimeout(revealSoon, 45000);
  } else {
    processingTimeout=setTimeout(()=>revealAnswer(), q?.type==='finalReview' ? 1200 : 1900);
  }
}
function renderProcessing(){ hideAll(); const q=current(); if(q?.round?.includes('Round 4')) document.body.classList.add('final-round','ai-awake-mode'); els.processing.classList.remove('hidden'); startProcessingAnimation(); }
function startProcessingAnimation(keepText=false){
  stopProcessingAnimation();
  const phrases = ['Scanning trend velocity...', 'Cross-checking adoption curves...', 'Modeling social backlash...', 'Locking future signal...']; let i=0;
  if(!keepText) els.processingText.textContent=phrases[0];
  if(!keepText) els.codeStream.textContent='';
  processingInterval=setInterval(()=>{ if(els.processing.classList.contains('hidden')) return stopProcessingAnimation(); i=(i+1)%phrases.length; if(!keepText) els.processingText.textContent=phrases[i]; const line=`> corpus: culture/economics/policy/behavior • confidence ${(62+Math.random()*31).toFixed(1)}% • signal locked\n`; els.codeStream.textContent=(els.codeStream.textContent+line).slice(-520); }, 300);
}
function stopProcessingAnimation(){ if(processingInterval) clearInterval(processingInterval); processingInterval=null; }

function syncAiControls(){
  if(!els.aiModeSelect) return;
  els.aiModeSelect.value = state.aiMode;
  els.aiEndpointInput.value = state.aiEndpoint;
  if(els.aiStatus){
    const live = state.aiMode === 'live';
    els.aiStatus.textContent = live ? (state.liveError ? `Live AI: fallback active (${state.liveError})` : 'Live AI: on, fallback armed') : 'Live AI: off, using scripted fallback';
  }
}
function saveAiControls(){
  state.aiMode = els.aiModeSelect?.value || 'fallback';
  state.aiEndpoint = els.aiEndpointInput?.value || (location.protocol.startsWith('http') ? '/api/evaluate' : 'http://127.0.0.1:8787/api/evaluate');
  localStorage.setItem('nbgAiMode', state.aiMode);
  localStorage.setItem('nbgAiEndpoint', state.aiEndpoint);
  state.liveError=''; syncAiControls(); sync();
}
function candidateAiEndpoints(){
  const saved = state.aiEndpoint || '';
  const list = [saved];
  if(location.protocol.startsWith('http')){
    list.push(`${location.origin}/api/evaluate`);
    list.push('/api/evaluate');
  }
  list.push('http://127.0.0.1:8787/api/evaluate','http://localhost:8787/api/evaluate');
  return [...new Set(list.filter(Boolean))];
}
function healthEndpointFor(ep){ return String(ep).replace(/\/api\/evaluate$/, '/api/health').replace('/evaluate','/health'); }
async function fetchJsonWithEndpoint(ep, payload, signal){
  const res = await fetch(ep, { method:'POST', mode:'cors', cache:'no-store', credentials:'omit', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal });
  if(!res.ok) throw new Error(`server ${res.status}`);
  return await res.json();
}
async function testAiServer(){
  saveAiControls();
  if(els.aiStatus) els.aiStatus.textContent='Testing Live AI server and API key...';
  let lastError = null;
  for(const ep of candidateAiEndpoints()){
    try{
      const health = await fetch(healthEndpointFor(ep), { method:'GET', mode:'cors', cache:'no-store', credentials:'omit' });
      if(!health.ok) throw new Error('local server not ready');
      const h = await health.json().catch(()=>({}));
      if(!h.hasKey) throw new Error('API key missing');
      const data = await fetchJsonWithEndpoint(ep, {
        mode:'open', round:'Live test', question:'Which future behavior is most predictable?',
        answers:[{player:'Player 1',answer:'AI assistants schedule most appointments'},{player:'Player 2',answer:'People stop using phones'}]
      });
      if(data.fallback) throw new Error(data.fallbackError || 'OpenAI call fell back');
      if(!data.players) throw new Error('unexpected live response');
      state.aiEndpoint = ep; localStorage.setItem('nbgAiEndpoint', ep); if(els.aiEndpointInput) els.aiEndpointInput.value=ep;
      state.aiMode='live';
      localStorage.setItem('nbgAiMode','live');
      if(els.aiModeSelect) els.aiModeSelect.value='live';
      if(els.aiStatus) els.aiStatus.textContent=`Live AI evaluation succeeded using ${h.model || 'OpenAI model'} at ${ep}. Live scoring is ON, fallback still armed.`;
      state.liveError='';
      sync();
      return;
    }catch(e){ lastError = e; }
  }
  state.liveError=(lastError && lastError.message) || 'live unavailable';
  const extra = /Load failed|Failed to fetch|NetworkError/i.test(state.liveError) ? ' Local server was not reachable. Run start-live-ai.command and use http://127.0.0.1:8787/index.html, not the file opened from Finder.' : '';
  if(els.aiStatus) els.aiStatus.textContent=`Live AI unavailable: ${state.liveError}.${extra} Scripted fallback will run.`;
  sync();
}
function liveKeyFor(q, extra=''){ return `q${state.index}${extra}`; }
async function runLiveEvaluation(q){
  if(state.aiMode!=='live') return null;
  state.liveError=''; syncAiControls();
  const payload = { mode:q.type, round:q.round, question:q.question || q.title || '', show:'Next Best Guess', constraints:'Return tight, pitch-safe scoring. Sound like a predictive AI using data signals, with one clean joke. No insults. No politics unless unavoidable.', choices:q.choices||[] };
  if(q.type==='open'){
    payload.answers = state.openAnswers.map((a,i)=>({ player: state.playerNames[i], answer: a || 'No answer entered' }));
    payload.expected = q.revealBody || '';
  }
  if(q.type==='finalReview'){
    const idx = state.finalReviewStep;
    payload.mode='finalForecast'; payload.finalIndex=idx; payload.question=(q.questions||[])[idx]||''; payload.answer=state.finalAnswers[idx]||'No answer entered'; payload.player=state.playerNames[state.finalistIndex];
  }
  try{
    let data=null, lastErr=null, usedEndpoint=null;
    for(const ep of candidateAiEndpoints()){
      const controller = new AbortController();
      const t = setTimeout(()=>controller.abort(), 45000);
      try{
        data = await fetchJsonWithEndpoint(ep, payload, controller.signal);
        usedEndpoint = ep;
        clearTimeout(t);
        break;
      }catch(e){ clearTimeout(t); lastErr=e; data=null; }
    }
    if(!data) throw lastErr || new Error('live failed');
    if(usedEndpoint && usedEndpoint !== state.aiEndpoint){ state.aiEndpoint=usedEndpoint; localStorage.setItem('nbgAiEndpoint', usedEndpoint); if(els.aiEndpointInput) els.aiEndpointInput.value=usedEndpoint; }
    if(!data) throw new Error('bad response');
    if(data.fallback) state.liveError = data.fallbackError || 'OpenAI fallback';
    if(data.error && !data.players && !Number.isFinite(Number(data.score))) throw new Error(data.error || 'bad response');
    if(q.type==='open'){
      state.liveResults[liveKeyFor(q)] = { type:'open', players:(data.players||[]).slice(0,2).map(p=>({ score:clampScore(p.score), reason:formatReasonBullets(p.reason||'The live model returned a score, but not much reasoning. Fallback would have been more charming.') })) };
    } else if(q.type==='finalReview'){
      const idx = state.finalReviewStep;
      state.liveResults[liveKeyFor(q,`-final-${idx}`)] = { type:'finalForecast', score:clampScore(data.score), reason:formatReasonBullets(data.reason||'The live score came through, but the explanation came back thin.') };
    }
    if(!data.fallback) state.liveError='';
    syncAiControls(); sync();
    return data;
  } catch(e){
    state.liveError = e.name === 'AbortError' ? 'timeout' : (e.message || 'live failed');
    syncAiControls(); sync();
    return null;
  }
}
function clampScore(n){ n=Number(n); if(!Number.isFinite(n)) return 70; return Math.max(25, Math.min(96, Math.round(n))); }
function formatReasonBullets(reason){
  const raw = String(reason || '').trim();
  if(!raw) return '';
  const lines = raw.split(/\n+/)
    .map(line => line.replace(/^[•\-–—\s]+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0,3)
    .map(line => /[.!?]$/.test(line) ? line : line + '.');
  return lines.map(line => '• ' + line).join('\n');
}

function formatOpenReasonBullets(reason){
  return formatReasonBullets(reason);
}

function getOpenScored(q){
  return [0,1].map(i=>scoreOpenAnswer(q,state.openAnswers[i],i));
}
function buildOpenRevealData(q, count, showScores=false){
  const scored=getOpenScored(q);
  const awards=[];
  for(let i=0;i<Math.min(count,2);i++){
    awards.push({
      player: state.playerNames[i],
      answer: state.openAnswers[i] || 'No answer entered',
      score: scored[i].score,
      reason: formatOpenReasonBullets(scored[i].reason)
    });
  }
  return { kicker:'REAL AI RESPONSE', title:q.revealTitle, body:'', awards, openAwards:true, single:false, scoresVisible:showScores };
}
function awardOpenScores(){
  if(state.openAwarded[0] && state.openAwarded[1]) return;
  const q=current();
  const scored=getOpenScored(q);
  [0,1].forEach(i=>{
    if(!state.openAwarded[i]){
      state.scores[i]+=scored[i].score || 0;
      state.openAwarded[i]=true;
    }
  });
  state.revealed=true;
  updateScoreboard(true);
}
function revealSecondOpenAnswer(){
  const q=current();
  if(!q || q.type!=='open') return;
  state.openRevealCount=2;
  state.revealData=buildOpenRevealData(q,2,false);
  state.view='reveal';
  renderCurrent(true);
  emitSound('reveal');
  sync();
}
function revealOpenScores(){
  const q=current();
  if(!q || q.type!=='open') return;
  state.openRevealCount=2;
  awardOpenScores();
  state.revealData=buildOpenRevealData(q,2,true);
  state.view='reveal';
  renderCurrent(true);
  emitSound('score');
  sync();
}

function buildMcRankRevealData(q, step){
  const ranks = {}; q.ranking.forEach((r,idx)=>{ ranks[r.idx]=idx+1; });
  const awards=[0,1].map(i=>state.selected[i]===null?0:((5-ranks[state.selected[i]])*10));
  const visible = step <= 1 ? [q.ranking[3]] : step === 2 ? [q.ranking[3], q.ranking[2]] : [q.ranking[3], q.ranking[2], q.ranking[1], q.ranking[0]];
  const rankingHtml = visible.map((r)=>{
    const place = ranks[r.idx];
    const label = `${place}. ${String.fromCharCode(65+r.idx)} ${q.choices[r.idx]}`;
    return `<div class="rank-row rank-place-${place}">${thumbForChoice(q.choices[r.idx])}<div class="rank-copy"><div><b>${label}</b> <span>${r.pct}%</span></div><p>${r.reason}</p></div></div>`;
  }).join('');
  const body = step < 3 ? 'Ranking reveal: starting from the bottom.' : q.revealBody;
  const reveal = { kicker:'FORECAST RESPONSE', title:q.revealTitle, body:'', awards:[] };
  reveal.html = `<p>${body}</p><div class="ranking-board ranking-step-${step}">${rankingHtml}</div>`;
  if(step >= 3) reveal.awards=awards.map((p,i)=>({player:state.playerNames[i], text:`${p} points`}));
  return { reveal, awards };
}
function advanceMcRankReveal(){
  const q=current(); if(!q || q.type!=='mcRank') return;
  state.rankRevealStep = Math.min(3, (state.rankRevealStep||1)+1);
  const { reveal, awards } = buildMcRankRevealData(q,state.rankRevealStep);
  if(state.rankRevealStep >= 3) awardPoints(awards);
  state.revealData=reveal; state.view='reveal'; renderCurrent(true); emitSound(state.rankRevealStep>=3?'score':'reveal'); sync();
}

function revealAnswer(){
  clearTimeout(processingTimeout); const q=current();
  if(q?.type==='mcRank' && state.view==='reveal') return advanceMcRankReveal();
  if(q?.type==='open' && state.view==='reveal' && state.openRevealCount===1) return revealOpenScores();
  if(!q) return; stopTimer(); if(['roundTitle','panel','aiAwake','bankReveal','finalCollect','finalTotal'].includes(q.type)) return;
  if(q.type==='finalPercent') return revealFinalPercent(q);
  if(q.type==='finalReview') return revealNextFinalForecast(q);
  const reveal = { kicker:'REAL AI RESPONSE', title:q.revealTitle, body:q.revealBody, awards:[] };
  if(q.type==='mcRank'){
    state.rankRevealStep = 1;
    const built = buildMcRankRevealData(q,state.rankRevealStep);
    Object.assign(reveal, built.reveal);
  }
  if(q.type==='mc'){
    const awards=[0,1].map(i=>state.selected[i]===q.correct?q.points:0); reveal.awards=awards.map((p,i)=>({player:state.playerNames[i], text:`+${p}`})); awardPoints(awards);
  }
  if(q.type==='order'){
    const exacts=[scoreOrder(state.orderAnswers[0],q.correctOrder), scoreOrder(state.orderAnswers[1],q.correctOrder)]; const awards=exacts.map(x=>x*q.pointsPerSlot);
    const orderHtml=q.correctOrder.map((idx,place)=>`<div class="timeline-step">${thumbForChoice(q.choices[idx])}<div class="timeline-num">${place+1}</div><div>${String.fromCharCode(65+idx)} · ${q.choices[idx]}</div></div>`).join('');
    reveal.html=`<div class="timeline-row">${orderHtml}</div><p class="timeline-explain">${q.revealBody}</p>`;
    reveal.awards=awards.map((p,i)=>({player:state.playerNames[i], text:`${exacts[i]} exact slots • +${p}`})); awardPoints(awards);
  }
  if(q.type==='open'){
    state.openRevealCount=1;
    Object.assign(reveal, buildOpenRevealData(q,2,false));
  }
  if(q.type==='finalMc'){
    const correct = state.finalAnswer === q.correct; const add = correct ? q.bankValue : 0; if(!state.revealed){ state.finalBank += add; if(correct) state.finalCorrect += 1; state.revealed=true; }
    reveal.kicker='AI BANK QUESTION'; reveal.awards=[{player:state.playerNames[state.finalistIndex], text:`${correct?'Correct':'Incorrect'} • Bank +$${add}`},{player:'Current bank', text:`$${state.finalBank}`}];
  }
  state.revealData=reveal; state.view='reveal'; renderCurrent(true); emitSound(q.type==='finalMc'?'finale':'reveal'); sync();
}
function scoreOrder(answer, correct){ let count=0; for(let i=0;i<correct.length;i++) if(answer[i]===correct[i]) count++; return count; }
function scoreOpenAnswer(q, answer, playerIndex){ const live=state.liveResults[liveKeyFor(q)]; if(live?.players?.[playerIndex]) return live.players[playerIndex]; const text=(answer||'').toLowerCase(); for(const rule of (q.rubric||[])){ if((rule.keywords||[]).some(k=>text.includes(k))) return {score:rule.score, reason:formatReasonBullets(rule.reason)}; } const fallback=(q.defaultScores&&q.defaultScores[playerIndex])||74; const reason=(q.defaultReasons&&q.defaultReasons[playerIndex])||'This has a signal, but it needs a cleaner path to everyday behavior. The strongest future answers connect incentives, scale, and one embarrassing human reason people actually adopt it.'; return {score:fallback, reason:formatReasonBullets(reason)}; }
function awardPoints(points){ if(state.revealed) return; state.revealed=true; state.scores[0]+=points[0]||0; state.scores[1]+=points[1]||0; updateScoreboard(true); }

function fitTextToBox(el, minPx=11){
  if(!el) return;
  el.style.fontSize='';
  el.style.lineHeight='';
  let fs=parseFloat(getComputedStyle(el).fontSize) || 22;
  const start=fs;
  let safety=0;
  while(safety++ < 26 && fs > minPx && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)){
    fs -= 1;
    el.style.fontSize = fs + 'px';
    el.style.lineHeight = '1.06';
  }
  if(fs < start) el.classList.add('auto-fitted');
}
function fitRevealText(){
  requestAnimationFrame(()=>{
    const awards=[...document.querySelectorAll('.reveal:not(.hidden) .award')];
    awards.forEach(a=>fitTextToBox(a, document.body.classList.contains('open-reveal-mode') ? 15 : 10));
    if(!document.body.classList.contains('open-reveal-mode')) document.querySelectorAll('.award-text').forEach(a=>fitTextToBox(a, 10));
    // If the whole reveal is still tall, shrink the title and award text one more step.
    const screen=document.querySelector('.screen');
    const reveal=document.querySelector('.reveal:not(.hidden)');
    if(screen && reveal && reveal.getBoundingClientRect().height > screen.clientHeight - 28){
      const h=reveal.querySelector('h2');
      if(h){
        let fs=parseFloat(getComputedStyle(h).fontSize)||56;
        h.style.fontSize=Math.max(30, fs-8)+'px';
      }
      awards.forEach(a=>{
        let fs=parseFloat(getComputedStyle(a).fontSize)||18;
        a.style.fontSize=Math.max(10, fs-2)+'px';
        a.style.lineHeight='1.04';
      });
    }
  });
}

function renderRevealState(){
  const q=current(), data=state.revealData; hideAll(); if(q?.round?.includes('Round 4')) document.body.classList.add('final-round'); els.reveal.classList.remove('hidden'); if(q?.type==='open') document.body.classList.add('open-reveal-mode'); if(!data) return;
  els.revealKicker.textContent=data.kicker||'REAL AI RESPONSE'; els.revealTitle.textContent=data.title||''; if(data.html){ els.revealBody.innerHTML=data.html; } else { els.revealBody.textContent=data.body||''; }
  els.scoreAwards.classList.toggle('single-award', !!data.single);
  els.scoreAwards.classList.toggle('scores-visible', !!data.scoresVisible);
    if(data.openAwards){
    els.scoreAwards.innerHTML=(data.awards||[]).map(a=>`<div class="award award-card open-award"><div class="open-card-head"><b>${escapeHtml(a.player)}</b><div class="open-answer">Answer: ${escapeHtml(a.answer)}</div></div><div class="open-score ${data.scoresVisible?'':'score-hidden'}">${a.score}%</div><div class="award-text">${escapeHtml(a.reason).replace(/\n/g,'<br>')}</div></div>`).join('');
  } else {
    els.scoreAwards.innerHTML=(data.awards||[]).map(a=>`<div class="award award-card"><div><b>${a.player}</b></div><div class="award-text">${String(a.text).replace(/\n/g,'<br>')}</div></div>`).join('');
  }
  if(q && (q.type==='mc'||q.type==='finalMc')){ const mini=document.createElement('div'); mini.className='mini-answer-row'; mini.textContent=`Correct answer: ${String.fromCharCode(65+q.correct)} · ${q.choices[q.correct]}`; els.scoreAwards.appendChild(mini); }
  fitRevealText();
}
function revealFinalPercent(q){
  const scored=scoreCityAnswer(q,state.finalTextAnswer); const prize=state.finalBank*scored.score;
  state.revealData={ title:q.revealTitle, body:`${q.revealBody} ${state.playerNames[state.finalistIndex]}'s answer: ${state.finalTextAnswer || 'No answer entered'}. AI likelihood: ${scored.score}%. ${scored.reason}`, winner:`$${prize.toLocaleString()}`, subtitle:'GRAND PRIZE WINNINGS', formula:`$${state.finalBank} × ${scored.score} = $${prize.toLocaleString()}` };
  state.view='finale'; renderCurrent(true); emitSound('finale'); sync();
}
function normalizeForecastAnswer(answer){
  return String(answer||'')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ')
    .trim();
}
function ruleMatchesForecastAnswer(rule, text){
  const hay = ` ${text} `;
  return (rule.keywords||[]).some(k=>{
    const key = normalizeForecastAnswer(k);
    if(!key) return false;
    if(key.length <= 3) return hay.includes(` ${key} `);
    return hay.includes(key);
  });
}
function officialFinalForecastScore(q, idx, answer){
  const forecast=(q.forecasts||[])[idx]||{};
  const text=normalizeForecastAnswer(answer);
  for(const rule of (forecast.rules||[])){
    if(ruleMatchesForecastAnswer(rule, text)){
      return {score:Number(rule.score)||70, reason:formatReasonBullets(rule.reason), source:'official-rule'};
    }
  }
  return null;
}
function scoreFinalForecast(q, idx, answer){
  // v79: final-round scoring is locked to the show engine first.
  // Known calibrated answers like Amsterdam must not randomly swing between live/fallback runs.
  const official = officialFinalForecastScore(q, idx, answer);
  if(official) return official;
  const live=state.liveResults[liveKeyFor(q,`-final-${idx}`)];
  if(live) return {score:live.score, reason:formatReasonBullets(live.reason), source:'live'};
  const forecast=(q.forecasts||[])[idx]||{};
  return {score:forecast.defaultScore||70, reason:formatReasonBullets(forecast.defaultReason || 'Possible, but the case is thin: weaker institutions, slower adoption, or not enough everyday demand yet. The future is curious, not ready to give it a parking spot.'), source:'default'};
}

function variedFinalScore(score, idx){
  // v77: Keep the AI's raw score as much as possible.
  // Only adjust when a final-round score lands within 5 points of a previous reveal.
  let raw = Math.round(Number(score) || 73);
  raw = Math.max(35, Math.min(96, raw));
  const used = state.finalResults.slice(0, idx).map(r => Number(r?.score)).filter(Number.isFinite);
  const ok = n => n >= 35 && n <= 96 && used.every(s => Math.abs(n - s) > 5);
  if(ok(raw)) return raw;
  for(let delta = 1; delta <= 30; delta++){
    // Try closest possible values first, alternating down/up.
    const down = raw - delta;
    const up = raw + delta;
    if(ok(down)) return down;
    if(ok(up)) return up;
  }
  return raw;
}

function revealNextFinalForecast(q){
  const idx=state.finalReviewStep;
  if(idx >= state.finalAnswers.length){ state.view='game'; const nextIndex=questions.findIndex((item,i)=>i>state.index && item.type==='finalTotal'); if(nextIndex>=0){ state.index=nextIndex; } renderCurrent(true); emitSound('finale'); sync(); return; }
  const res=scoreFinalForecast(q, idx, state.finalAnswers[idx]);
  res.score = variedFinalScore(res.score, idx);
  state.finalResults[idx]=res;
  state.finalReviewStep += 1;
  state.finalPrize += res.score * (q.multiplier||100);
  state.view='game';
  renderCurrent(true); emitSound('reveal'); sync();
}
function scoreCityAnswer(q, answer){ const text=(answer||'').toLowerCase(); for(const rule of (q.cityScores||[])){ if((rule.keywords||[]).some(k=>text.includes(k))) return {score:rule.score, reason:formatReasonBullets(rule.reason)}; } return {score:q.defaultScore||61, reason:formatReasonBullets('Possible, but the city needs stronger density, transit coverage, political will, and an enforceable car-free path.')}; }
function renderFinaleState(){ hideAll(); document.body.classList.add('final-round','ai-awake-mode'); els.finale.classList.remove('hidden'); const data=state.revealData||{}; els.finale.querySelector('.kicker').textContent=data.subtitle||'FINALE'; els.finaleTitle.textContent=data.title||'The Future Has Spoken'; els.finaleBody.textContent=data.body||''; els.winnerName.innerHTML=data.winner ? `${data.winner}<div class="formula">${data.formula||''}</div>` : ''; }

function setFinalistIfEntering(idx){ const q=questions[idx]; if(q && q.round && q.round.includes('Round 4') && !questions[state.index]?.round?.includes('Round 4')) state.finalistIndex = state.scores[0] >= state.scores[1] ? 0 : 1; }
function nextQuestion(){ if(state.index < questions.length-1){ const ni=state.index+1; setFinalistIfEntering(ni); state.index=ni; resetQuestionState(); state.view='game'; renderCurrent(true); emitSound('advance'); sync(); } }
function prevQuestion(){ if(state.index>0){ state.index--; resetQuestionState(); state.view='game'; renderCurrent(true); emitSound('advance'); sync(); } }
function nextRound(){ const q=current(); if(!q) return nextQuestion(); const currentRound=q.round; const nextIndex=questions.findIndex((item,idx)=>idx>state.index && item.round!==currentRound); if(nextIndex>=0){ setFinalistIfEntering(nextIndex); state.index=nextIndex; resetQuestionState(); state.view='game'; renderCurrent(true); emitSound('advance'); sync(); } }
function resetGame(){ stopTimer(); clearTimeout(processingTimeout); state.index=-1; state.scores=[0,0]; state.finalBank=0; state.finalCorrect=0; state.finalAnswers=['','','','','']; state.finalReviewStep=0; state.finalResults=[]; state.finalPrize=0; state.openRevealCount=0; state.openAwarded=[false,false]; state.liveResults={}; state.liveError=''; state.view='title'; state.revealData=null; renderCurrent(true); sync(); }

function startTimer(seconds){ state.timerTotal=seconds; state.timerEnd=Date.now()+seconds*1000; state.timerVisible=true; emitSound('timer'); if(timerInterval) clearInterval(timerInterval); timerInterval=setInterval(()=>{ renderTimerState(); if(getTimerRemaining()<=0){ clearInterval(timerInterval); timerInterval=null; state.timerVisible=false; emitSound('timeup'); sync(); renderTimerState(); } },200); renderTimerState(); sync(); }
function getTimerRemaining(){ return state.timerEnd ? Math.max(0, Math.ceil((state.timerEnd-Date.now())/1000)) : 0; }
function stopTimer(){ if(timerInterval) clearInterval(timerInterval); timerInterval=null; state.timerVisible=false; state.timerEnd=0; renderTimerState(); sync(); }
function renderTimerState(){ if(!state.timerVisible){ els.timer.classList.add('hidden'); return; } const remaining=getTimerRemaining(); if(remaining<=0){ els.timer.classList.add('hidden'); return; } els.timer.classList.remove('hidden'); els.timerNumber.textContent=remaining; const total=state.timerTotal||1; els.timerRing.style.strokeDashoffset=327*(1-Math.max(remaining,0)/total); }

let audioCtx;
function canPlayAudio(){ return state.sound && (isDisplayWindow || !state.externalDisplay); }
function getAudio(){ audioCtx=audioCtx || new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
function tone(freq,duration,type='sine',gain=.03,when=0){ if(!canPlayAudio()) return; const ctx=getAudio(), osc=ctx.createOscillator(), g=ctx.createGain(); osc.type=type; osc.frequency.value=freq; g.gain.setValueAtTime(.0001,ctx.currentTime+when); g.gain.exponentialRampToValueAtTime(gain,ctx.currentTime+when+.02); g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+when+duration); osc.connect(g); g.connect(ctx.destination); osc.start(ctx.currentTime+when); osc.stop(ctx.currentTime+when+duration+.03); }
function noiseSweep(duration=.22,gain=.025){ if(!canPlayAudio()) return; const ctx=getAudio(), bufferSize=ctx.sampleRate*duration, buffer=ctx.createBuffer(1,bufferSize,ctx.sampleRate), data=buffer.getChannelData(0); for(let i=0;i<bufferSize;i++) data[i]=(Math.random()*2-1)*(1-i/bufferSize); const src=ctx.createBufferSource(); src.buffer=buffer; const filter=ctx.createBiquadFilter(); filter.type='bandpass'; filter.frequency.value=1800; const g=ctx.createGain(); g.gain.value=gain; src.connect(filter); filter.connect(g); g.connect(ctx.destination); src.start(); }
function playSound(kind){
  if(kind==='advance'){ [440,660,990].forEach((f,i)=>tone(f,.09,'sine',.025,i*.045)); }
  if(kind==='process'){ noiseSweep(.35,.018); [180,240,360].forEach((f,i)=>tone(f,.16,'triangle',.014,i*.12)); }
  if(kind==='reveal'){ noiseSweep(.18,.024); [523,784,1175].forEach((f,i)=>tone(f,.16,'sine',.035,i*.06)); }
  if(kind==='finale'){ noiseSweep(.55,.035); [196,392,523,784,1046,1568].forEach((f,i)=>tone(f,.20,'sine',.04,i*.07)); }
  if(kind==='timer'){ tone(660,.055,'sine',.018); }
  if(kind==='timeup'){ noiseSweep(.24,.026); tone(146,.22,'triangle',.03,.03); }
}
function emitSound(kind){ state.soundEventId+=1; state.soundKind=kind; playSound(kind); }
function toggleSound(){ state.sound=!state.sound; updateScoreboard(); sync(); }
function fullscreen(){ if(!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
function openDisplayWindow(){ state.externalDisplay=true; const url=new URL(window.location.href); url.searchParams.set('display','1'); url.searchParams.set('controller', state.sessionId); displayWindowRef=window.open(url.href,'NextBestGuessDisplay','popup=yes,width=1600,height=900'); if(els.displayStatus) els.displayStatus.textContent='TV window opening. Drag that new window to the TV, click inside it, then press F for fullscreen.'; sync(); setInterval(()=>{ if(displayWindowRef && !displayWindowRef.closed) sync(); },700); }
function manualAdjust(){ state.scores[0]+=Number($('p1Adjust').value||0); state.scores[1]+=Number($('p2Adjust').value||0); $('p1Adjust').value=0; $('p2Adjust').value=0; updateScoreboard(true); sync(); }
function revealButtonAction(){
  const q=current();
  if(!q) return;
  if(state.view==='processing') return;
  if(state.view==='reveal') return revealAnswer();
  if(['roundTitle','panel','aiAwake','bankReveal','finalCollect','finalTotal'].includes(q.type)) return revealAnswer();
  return showProcessing();
}
function bind(id,event,fn){ const el=$(id); if(el) el.addEventListener(event,fn); }
bind('aiModeSelect','change',saveAiControls); bind('aiEndpointInput','change',saveAiControls); bind('testAiBtn','click',testAiServer); bind('applyPlayers','click',setNames); bind('startGame','click',startGame); bind('nextQuestion','click',nextQuestion); bind('nextRound','click',nextRound); bind('prevQuestion','click',prevQuestion); bind('fullscreenBtn','click',fullscreen); bind('openDisplay','click',openDisplayWindow); bind('timer15','click',()=>startTimer(15)); bind('timer30','click',()=>startTimer(30)); bind('stopTimer','click',stopTimer); bind('processBtn','click',showProcessing); bind('revealBtn','click',revealButtonAction); bind('scoresBtn','click',()=>updateScoreboard(true)); bind('soundToggle','click',toggleSound); bind('stingBtn','click',()=>emitSound('reveal')); bind('resetBtn','click',resetGame); bind('adjustScores','click',manualAdjust);
function isTypingTarget(target){ const tag=(target?.tagName||'').toLowerCase(); return tag==='input'||tag==='textarea'||tag==='select'||target?.isContentEditable; }
document.addEventListener('keydown', e=>{ if(isTypingTarget(e.target)){ if(e.key==='Escape') e.target.blur(); return; } if(isDisplayWindow && !['f','F'].includes(e.key)) return; if(e.key.toLowerCase()==='h' && !document.body.classList.contains('host-window')) els.hostPanel.classList.toggle('hidden'); if(e.key.toLowerCase()==='f') fullscreen(); if(e.key==='ArrowRight') nextQuestion(); if(e.key==='ArrowLeft') prevQuestion(); if(e.key.toLowerCase()==='p') revealButtonAction(); if(e.key.toLowerCase()==='r') revealButtonAction(); if(e.key===' '){ e.preventDefault(); startTimer(30); } });
function tryRedirectFileToServer(){
  if(isDisplayWindow || location.protocol !== 'file:') return;
  fetch('http://127.0.0.1:8787/api/health', {mode:'cors', cache:'no-store', credentials:'omit'})
    .then(r=>{ if(r.ok) location.replace('http://127.0.0.1:8787/index.html'); })
    .catch(()=>{});
}
function init(){
  tryRedirectFileToServer();
  if(isDisplayWindow){ document.body.classList.add('display-window'); state.externalDisplay=true; try{ window.opener?.postMessage({source:'nbg-display', type:'ready'}, '*'); }catch(e){} try{ const stored=JSON.parse(localStorage.getItem('nbgPitchSyncV7')); if(stored) applySync(stored); else renderCurrent(false); }catch(e){ renderCurrent(false); } setInterval(()=>renderTimerState(),200); setInterval(()=>{ try{ const stored=JSON.parse(localStorage.getItem('nbgPitchSyncV7')); if(stored && stored.ts && stored.ts!==state.ts) applySync(stored); }catch(e){} },500);
  } else { document.body.classList.add('host-window'); els.hostPanel.classList.remove('hidden'); setNames(); renderCurrent(true); sync(); autoEnableLiveIfReady(); }
}
async function autoEnableLiveIfReady(){
  try{
    const res = await fetch(healthEndpointFor(state.aiEndpoint), {mode:'cors', cache:'no-store', credentials:'omit'});
    if(!res.ok) return;
    const h = await res.json().catch(()=>({}));
    if(h && h.hasKey){
      state.aiMode='live'; localStorage.setItem('nbgAiMode','live');
      if(els.aiModeSelect) els.aiModeSelect.value='live';
      state.liveError='';
      if(els.aiStatus) els.aiStatus.textContent=`Live AI detected (${h.serverVersion || 'server'}). Live scoring is ON; fallback remains armed.`;
      syncAiControls(); sync();
    }
  }catch(e){}
}
init();
