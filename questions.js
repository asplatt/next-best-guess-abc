const questions = [
  { type: 'panel', round: 'Comedic Panel', title: 'Comedic Panel', image: 'comedic_panel.png' },

  { type: 'roundTitle', round: 'Round 1: Trending or Ending', title: 'Round 1:', subtitle: 'Trending or Ending', body: 'Players pick which answer they think will rank #1. The closer they are to the top of the forecast, the more they score: 40, 30, 20, or 10 points.', bg: true },
  {
    type: 'mcRank', round: 'Round 1: Trending or Ending', question: 'Which current fashion trend will future historians mock us for the most?',
    choices: ['Ultra high-waisted pants','Y2K nostalgia Revival','Chunky dad sneakers','Gender neutral clothing'],
    revealTitle: 'Trend Ranking',
    revealBody: 'The forecast ranks trends by visual obviousness, saturation, meme durability, and how little context future teenagers will need before laughing at us.',
    ranking: [
      { idx: 2, pct: 41, reason: 'Chunky dad sneakers win the ridicule index: heavily photographed, aggressively orthopedic, and already halfway to a costume. Future textbooks will file them under “when irony needed arch support.”' },
      { idx: 0, pct: 29, reason: 'Ultra high-waisted pants have strong mockability because the silhouette is instantly visible. The model flags “denim approaching rib cage” as a historically unstable condition.' },
      { idx: 1, pct: 22, reason: 'Y2K nostalgia revival will absolutely be mocked, but the algorithm discounts it slightly because humanity already made this mistake once and apparently wanted a sequel.' },
      { idx: 3, pct: 8, reason: 'Gender neutral clothing is least likely to age as a joke. The forecast reads it as a durable social shift, not a disposable fashion glitch.' }
    ]
  },
  {
    type: 'mcRank', round: 'Round 1: Trending or Ending', question: 'Which current dating app feature will seem laughably outdated in 10 years?',
    choices: ['Swiping','Personality tests','Location-based matching','Profile pictures'],
    revealTitle: 'Trend Ranking',
    revealBody: 'The forecast ranks dating features by replacement pressure: weak signal quality, user fatigue, fraud exposure, and whether future people will believe we voluntarily did this to ourselves.',
    ranking: [
      { idx: 0, pct: 44, reason: 'Swiping ranks first. It is a low-information, high-fatigue interface for a high-stakes human problem. Future dating will use richer behavior, voice, video, intent, and AI filtering. The thumb casino will look primitive.' },
      { idx: 3, pct: 25, reason: 'Profile pictures rank second because static photos are increasingly vulnerable to filters, AI generation, and general catfishing arts and crafts.' },
      { idx: 2, pct: 18, reason: 'Location-based matching will evolve, but proximity still has utility. Annoying? Yes. Obsolete? Not until teleportation gets a Series B.' },
      { idx: 1, pct: 13, reason: 'Personality tests are clunky, but the underlying idea survives: compatibility signals matter. The future may mock the quizzes, not the concept.' }
    ]
  },
  {
    type: 'mcRank', round: 'Round 1: Trending or Ending', question: 'Which of these bizarre foods will become a mainstream staple by 2035?',
    choices: ['Cricket protein bars','Celebrity endorsed lab-grown meat','Algae milk','Cheetos where you can adjust the heat level on your phone'],
    revealTitle: 'Adoption Ranking',
    revealBody: 'The forecast ranks foods by cost curve, regulatory path, consumer disgust barrier, nutrition story, and how easily a grocery buyer can explain it without sweating.',
    ranking: [
      { idx: 2, pct: 36, reason: 'Algae milk ranks first. It has the cleanest adoption stack: dairy alternative demand, sustainability, protein and omega potential, and no visible insect legs. That last variable is not minor.' },
      { idx: 1, pct: 28, reason: 'Celebrity endorsed lab-grown meat has strong upside, but cost, regulation, politics, and “wait, whose cells am I eating?” slow the path to staple status.' },
      { idx: 3, pct: 21, reason: 'Adjustable Cheetos are possible, which is the most upsetting part. Snack personalization, phone-based novelty, and America’s heroic commitment to bad judgment keep this alive.' },
      { idx: 0, pct: 15, reason: 'Cricket protein bars remain plausible, but the disgust barrier is stubborn. People like sustainability right up until lunch starts chirping.' }
    ]
  },

  { type: 'roundTitle', round: 'Round 2: Future Rollout', title: 'Round 2:', subtitle: 'Future Rollout', body: 'Players arrange future events or milestones in chronological order.', bg: true },
  {
    type: 'order', round: 'Round 2: Future Rollout', question: 'Which of these weird predictions will happen first? Place them in order from first to last.',
    choices: ['Marriage to AI becomes legally recognized','Professional cuddlers outsell therapists','Memory deletion becomes an elective procedure','Designer pets with glow-in-the-dark fur'], correctOrder: [3,1,0,2],
    revealTitle: 'Official Forecast Order',
    revealBody: 'Designer pets go first: gene editing already works in labs, and the luxury-pet market has never met a questionable idea it could not accessorize. Cuddlers follow as loneliness becomes a service economy. AI marriage needs courts and culture to catch up. Memory deletion trails because neuroscience, consent, and malpractice lawyers all get a vote.', pointsPerSlot: 10
  },
  {
    type: 'order', round: 'Round 2: Future Rollout', question: 'Put these in order from soonest to furthest out:',
    choices: ['AI legally inherits someone’s estate','Your smart toilet gives you a health score','People pay for ads to appear in their dreams','The first person is canceled for something their AI clone said'], correctOrder: [1,3,0,2],
    revealTitle: 'Official Forecast Order',
    revealBody: 'Smart toilets lead because sensors, wellness anxiety, and bathroom oversharing are already converging. AI clone cancellation follows because reputation moves faster than law. AI inheritance needs legal architecture. Dream ads trail because even advertisers need a minute before monetizing REM sleep.', pointsPerSlot: 10
  },

  { type: 'roundTitle', round: 'Round 3: Crystal Brawl', title: 'Round 3:', subtitle: 'Crystal Brawl', body: 'Head-to-head battle. How well can you predict the future?', bg: true },
  {
    type: 'open', round: 'Round 3: Crystal Brawl', question: 'What will be the #1 elective surgery by 2045?',
    revealTitle: 'Predictability Scores',
    revealBody: 'The AI forecasts the year in the question, then scores each answer by category fit, adoption path, regulation, cost decline, market demand, and human behavior. The joke is the spoonful of sugar that helps the probability model go down.',
    defaultScores: [58,58],
    defaultReasons: [
      'Body upgrades can scale when the payoff is visible and recovery gets easier. By 2045, vanity will be sold as maintenance. The waiting room will call it wellness with better lighting.',
      'The idea needs mass demand, not just shock value. By 2045, elective winners are safer, cheaper, and socially normal. Nobody wants their touch-up to require a crisis meeting.'
    ],
    rubric: [
      { score: 42, keywords: ['brain','neural','neuralink','chip','cognitive'], reason: 'Future-adjacent, not mass-elective: by 2045, brain chips may exist, but invasive neuroscience still faces regulation, hacking fears, and trust issues. Hairlines scale faster than headware.' },
      { score: 82, keywords: ['hair','transplant','follicle','bald','scalp'], reason: 'Hair restoration has vanity, visibility, and repeat demand. Robotics can make it cheaper, easier, and normal. Your barber may upsell the executive density package.' },
      { score: 87, keywords: ['gene','genetic','dna','aging','age','longevity','cell','regenerative','stem'], reason: 'Very strong fit. Regenerative aging has wealthy buyers, repeat demand, and the perfect disguise: vanity dressed as longevity. Five more “rested” years gets a velvet rope.' },
      { score: 78, keywords: ['hormone','metabolism','regulator','connected','monitor'], reason: 'Hormone optimization has biomarkers, subscriptions, and premium buyers. By 2045, it could be sold as longevity maintenance. Regulators will ask if this is medicine or rich people with Bluetooth.' },
      { score: 70, keywords: ['allergy','immune','immunity','inflammation'], reason: 'Adjacent fit. Allergy implants solve real pain, but elective markets chase visible transformation. “I no longer fear shrimp” is good news, not a Beverly Hills billboard.' },
      { score: 66, keywords: ['nose','face','skin','cosmetic','botox','filler','wrinkle','lift'], reason: 'Cosmetic face work has visible payoff and a huge market. It needs regeneration or automation to lead 2045. Botox will survive the apocalypse, but may not headline it.' }
    ]
  },
  {
    type: 'open', round: 'Round 3: Crystal Brawl', question: 'What behavior will be tracked by health insurance companies by 2038 that isn’t tracked now?',
    revealTitle: 'Predictability Scores',
    revealBody: 'This forecast looks for behaviors with measurable data exhaust, strong links to health outcomes, pricing value for insurers, and enough plausible deniability to be called preventive care instead of surveillance with a deductible.',
    defaultScores: [79,74],
    defaultReasons: [
      'Wearables, receipts, and devices can turn ordinary behavior into risk signals. By 2038, the winning answers are the ones insurers can measure without asking. Your premium may know what your doctor never hears.',
      'Interesting, but it needs a cleaner link to actual claims. The future rewards signals that are passive, measurable, and easy to sell as wellness. Creepy works best when it comes with a discount.'
    ],
    rubric: [
      { score: 88, keywords: ['sleep','stress','screen','phone','scroll','device','blue light','doomscroll','breath','breathing','respiration'], reason: 'Wearables already track sleep, stress, breathing, and recovery. By 2038, passive vitals can become insurance math. Your premium may know you panic-breathed through Tuesday.' },
      { score: 81, keywords: ['food','diet','sugar','alcohol','grocery','delivery','calorie','snack'], reason: 'Strong signal. Food and delivery data are predictive, available, and tied to metabolic risk. The barrier is outrage, which companies usually treat as a launch phase.' },
      { score: 74, keywords: ['social','lonely','friend','relationship','isolation','text','mental health','therapy','chatbot','ai usage'], reason: 'Digital behavior can signal stress, isolation, and care-seeking. By 2038, platforms may summarize patterns without reading diaries. Your copay may know you vented to a chatbot.' },
      { score: 59, keywords: ['exercise','steps','gym','walking','fitness','workout'], reason: 'Real signal, less new. Steps and workouts are already tracked. To score higher, add recovery, stress response, or whether your watch thinks you’re lying.' }
    ]
  },

  { type: 'roundTitle', round: 'Round 4: Predict the Future', title: 'Round 4:', subtitle: 'Predict the Future', body: 'One player left, competing for the big prize. The winner gives five predictions. Then the AI scores them one by one.', bg: true },
  { type: 'aiAwake', round: 'Round 4: Predict the Future', title: 'AI CORE ONLINE', body: 'The winning player now faces the future alone.' },
  { type: 'finalCollect', round: 'Round 4: Predict the Future', finalIdx: 0, question: 'Which currently non-existent holiday will be celebrated globally by 2050?' },
  { type: 'finalCollect', round: 'Round 4: Predict the Future', finalIdx: 1, question: 'What new Olympic sport will debut in 2040?' },
  { type: 'finalCollect', round: 'Round 4: Predict the Future', finalIdx: 2, question: 'What fashion trend will make a huge comeback in 2038?' },
  { type: 'finalCollect', round: 'Round 4: Predict the Future', finalIdx: 3, question: 'What will people collect instead of physical books, records, or art by 2040?' },
  { type: 'finalCollect', round: 'Round 4: Predict the Future', finalIdx: 4, question: 'What city will be the first to ban private cars entirely?' },
  {
    type: 'finalReview', round: 'Round 4: Predict the Future', title: 'AI Final Review', body: 'The predictions are locked. Reveal them one by one. Each AI predictability percentage is multiplied by $100 and added to the grand prize bank.', multiplier: 100,
    forecasts: [
      { defaultScore: 74, defaultReason: 'WHY: New holidays spread when institutions can sell behavior as virtue. LIKELIHOOD: Global adoption needs a ritual people can actually repeat. FUTURE: By 2050, wellness and climate holidays have the cleanest path. BURN: The future gives us a day off for needing days off.', rules: [
        { score: 88, keywords: ['digital detox','detox','unplug','phone free','screen free'], reason: 'WHY: Digital Detox Day has a simple ritual everyone understands. LIKELIHOOD: Phones are so central that unplugging becomes a shared ritual. FUTURE: By 2050, attention becomes a public-health issue. BURN: Everyone celebrates by posting that they are offline.' },
        { score: 86, keywords: ['climate restoration','climate','restoration','rewild','earth'], reason: 'WHY: Climate Restoration Day turns anxiety into visible action. LIKELIHOOD: Restoration gives people visible progress, not just climate dread. FUTURE: By 2050, repair beats awareness as the holiday story. BURN: Earth Day gets a sequel with better landscaping.' },
        { score: 76, keywords: ['robot appreciation','robot','ai appreciation','machine'], reason: 'WHY: Robots become coworkers, caregivers, and household background characters. LIKELIHOOD: Household robots become familiar enough to earn affectionate rituals. FUTURE: By 2050, machine gratitude may be half joke, half HR policy. BURN: Finally, a holiday where the toaster feels seen.' },
        { score: 61, keywords: ['space migration','space','mars','moon','migration'], reason: 'WHY: Space anniversaries are romantic and brandable. LIKELIHOOD: Space migration becomes symbolic before it becomes common. FUTURE: It starts niche before becoming global mythology. BURN: Hard to celebrate migration when everyone forgot the oxygen adapter.' }
      ]},
      { defaultScore: 70, defaultReason: 'Possible, but the Olympic case is thinner: the sport needs global participation, easy scoring, broadcast appeal, youth relevance, and a low chance of making the IOC look like it lost a bet.', rules: [
        { score: 89, keywords: ['drone','drones','racing','drone racing'], reason: 'Strong signal. Drone racing has existing competition infrastructure, broadcastable speed, tech sponsorship, and a clean Olympic pitch: tiny machines going dangerously fast so humans can pretend this is athletic.' },
        { score: 58, keywords: ['esport','e-sport','esports','gaming','video game','speed typing','typing'], reason: 'WHY: Digital competition has audiences, but this answer is too broad. LIKELIHOOD: A specific arena format could turn gaming culture into Olympic spectacle. FUTURE: By 2040, mixed-reality racing could work; plain esports still fights politics and rights. BURN: The IOC will not award gold for updating your controller.' },
        { score: 79, keywords: ['parkour','freerunning'], reason: 'Possible. Parkour has global reach and physicality, but judging and injury optics are friction. Every parent watching will say, “Absolutely not.”' }
      ]},
      { defaultScore: 71, defaultReason: 'Fashion comeback is plausible, but the model wants a stronger cycle signal: nostalgia timing, celebrity adoption, visual distinctiveness, and whether teenagers can make their parents feel suddenly ancient.', rules: [
        { score: 88, keywords: ['y2k','2000','low rise','low-rise','nostalgia','high waisted','high-waisted','jeans'], reason: 'Strong cyclical-fashion signal. Nostalgia runs on a 20-to-30-year loop, silhouettes are easy to revive, and denim always returns to the scene of the crime. By 2038, high-waisted jeans can be sold as retro-futurist structure, which is fashion’s way of saying “we found the pants again.”' },
        { score: 82, keywords: ['formal','suit','tailoring','dress up','dressed up'], reason: 'Good forecast. After years of casualization, the pendulum can swing back toward polish and status dressing. Humans eventually get tired of looking like they are always waiting for laundry.' },
        { score: 76, keywords: ['neon','cyber','futuristic','metallic'], reason: 'Possible. Tech nostalgia could revive synthetic futurism. People love dressing like the future while complaining it arrived wrong.' }
      ]},
      { defaultScore: 73, defaultReason: 'Decent collectible, but the AI wants sharper status proof. Future collecting is still bragging rights, just with better metadata.', rules: [
        { score: 89, keywords: ['memory','memories','experience','experiences','digital memory','conversation','conversations','real conversation'], reason: 'Strong signal. Collecting shifts from objects to proof of experience: captured memories, verified moments, rare human interactions, sensory recordings, and digital archives. In a world of synthetic everything, a real conversation may become a prestige object, which is both touching and incredibly depressing.' },
        { score: 83, keywords: ['nft','digital','avatar','skin','skins','virtual'], reason: 'Possible despite NFT hangover. The acronym may die; the impulse to flex a virtual jacket absolutely will not.' },
        { score: 77, keywords: ['data','personal data','biometrics','dna'], reason: 'Interesting and plausible. Personal data as collectible identity has a real signal, though it may feel less like collecting and more like accidentally donating your soul to a terms-of-service agreement.' }
      ]},
      { defaultScore: 70, defaultReason: 'Possible city, but the AI wants density, transit coverage, air-quality politics, legal authority, and enough civic patience to survive the first week of angry honking.', rules: [
        { score: 92, keywords: ['paris'], reason: 'Top-tier answer. Paris combines dense transit, car-reduction policy, climate politics, and a proven willingness to annoy drivers in defense of public space. Very French. Very effective.' },
        { score: 88, keywords: ['amsterdam','amsterdamn'], reason: 'Very strong. Amsterdam already has the behavior and infrastructure, though it may not need a dramatic ban because culture did half the work decades ago.' },
        { score: 84, keywords: ['oslo'], reason: 'Strong. Oslo has climate policy, car-light momentum, and a credible city-center pathway. Less flashy, more likely than people think.' },
        { score: 81, keywords: ['san francisco','sf'], reason: 'San Francisco has density, transit, climate politics, and a long history of street fights. By the target year, car-free districts can expand citywide; every driver will insist burrito pickup is constitutionally protected.' },
        { score: 77, keywords: ['london'], reason: 'Possible. London has pricing and transit scale, but a total ban needs heroic levels of British queue management.' },
        { score: 72, keywords: ['new york','nyc'], reason: 'Possible but politically brutal. New York has the density, but banning private cars entirely would become a five-borough cage match with parking permits.' }
      ]}
    ]
  },
  { type: 'finalTotal', round: 'Round 4: Predict the Future', title: 'Grand Prize Forecast', body: 'The AI has scored the future.' }
];
