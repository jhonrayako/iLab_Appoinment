const STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'have',
  'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'the', 'to', 'what',
  'your', 'you',
  'ilab', 'guiguinto', 'bulacan',
]);

const INTENT_GROUPS = {
  hours: ['hour', 'hours', 'open', 'opening', 'close', 'closing', 'time', 'schedule'],
  where: ['where'],
  location: ['located', 'location'],
  address: ['address', 'map', 'direction', 'directions'],
  contact: ['contact', 'phone', 'telephone', 'call', 'email', 'message'],
  visit: ['visit', 'tour', 'letter', 'intent', 'come', 'request', 'book', 'booking', 'appointment'],
  services: ['service', 'services', 'program', 'tissue', 'culture', 'ornamental', 'agriculture', 'research'],
  audience: ['who', 'student', 'students', 'teacher', 'teachers', 'grower', 'growers', 'farmer', 'farmers', 'community', 'public'],
  about: ['about', 'mission', 'facility', 'dost'],
};

const TOKEN_INTENTS = new Map(
  Object.entries(INTENT_GROUPS).flatMap(([intent, words]) => words.map((word) => [word, intent]))
);

const getFallbackReply = (question) => {
  const normalizedQuestion = normalize(question)
    .replace(/\bilab( guiguinto)?\b/g, '')
    .trim();

  if (/^(hi|hello|hey|good morning|good afternoon|good evening)[!.? ]*$/.test(normalizedQuestion)) {
    return 'Hello! I am the iLAB Guiguinto chatbot. I can help with our services, hours, location, contact details, and visit appointments.';
  }

  if (/^(thanks|thank you|many thanks)[!.? ]*$/.test(normalizedQuestion)) {
    return 'You are welcome! I am here if you have another question about iLAB Guiguinto.';
  }

  if (/(what can (i|you) ask|what can you help|what do you help|what questions can|what topics can)/.test(normalizedQuestion)) {
    return 'I can help with questions about iLAB Guiguinto services and programs, hours and location, contact details, who can use our services, and how to request a visit or appointment.';
  }

  return 'Sorry, this chatbot focuses on iLAB Guiguinto, so I cannot reliably answer that question. I can help with our services and programs, hours, location, contact details, and visit appointments. For other iLAB questions, call 0955 593 4054 or email ilabguiguinto@gmail.com.';
};

const normalize = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/i\s*-\s*lab/g, 'ilab');

const tokenize = (value) => (normalize(value).match(/\p{L}+/gu) || [])
  .filter((token) => !STOP_WORDS.has(token));

const tokensFor = (value) => new Set(tokenize(value));
const scoreOverlap = (queryTokens, targetTokens, targetIntents, tokenWeight, intentWeight) => {
  return [...queryTokens].reduce((score, token) => {
    if (targetTokens.has(token)) return score + tokenWeight;
    if (TOKEN_INTENTS.has(token) && targetIntents.has(TOKEN_INTENTS.get(token))) return score + intentWeight;
    return score;
  }, 0);
};

const scoreFAQ = (question, faq) => {
  const queryTokens = tokensFor(question);
  if (!queryTokens.size) return 0;

  const faqQuestion = tokensFor(faq.question);
  const faqKeywords = tokensFor(Array.isArray(faq.keywords) ? faq.keywords.join(' ') : '');
  const questionIntents = new Set([...faqQuestion].map((token) => TOKEN_INTENTS.get(token)).filter(Boolean));
  const keywordIntents = new Set([...faqKeywords].map((token) => TOKEN_INTENTS.get(token)).filter(Boolean));
  const normalizedQuery = normalize(question).trim();

  const standardScore = scoreOverlap(queryTokens, faqQuestion, questionIntents, 2, 1.5)
    + scoreOverlap(queryTokens, faqKeywords, keywordIntents, 3, 2.5);
  const phrases = Array.isArray(faq.training_phrases) ? faq.training_phrases : [];
  const trainingScore = phrases.reduce((bestScore, phrase) => {
    const phraseTokens = tokensFor(phrase);
    const phraseIntents = new Set([...phraseTokens].map((token) => TOKEN_INTENTS.get(token)).filter(Boolean));
    const phraseScore = scoreOverlap(queryTokens, phraseTokens, phraseIntents, 4, 2.5);
    const normalizedPhrase = normalize(phrase).trim();
    const exactPhraseBonus = normalizedPhrase && normalizedPhrase === normalizedQuery ? 8 : 0;
    return Math.max(bestScore, phraseScore + exactPhraseBonus);
  }, 0);
  const normalizedFAQQuestion = normalize(faq.question).trim();
  const exactQuestionBonus = normalizedFAQQuestion === normalizedQuery ? 12 : 0;

  return Math.max(standardScore, trainingScore) + exactQuestionBonus;
};

const matchFAQ = (question, faqs) => {
  const queryTokens = tokensFor(question);
  if (!queryTokens.size) return null;

  let bestMatch = null;
  let bestScore = 0;
  let isTied = false;

  for (const faq of faqs) {
    const score = scoreFAQ(question, faq);
    if (score > bestScore) {
      bestMatch = faq;
      bestScore = score;
      isTied = false;
    } else if (score > 0 && score === bestScore) {
      isTied = true;
    }
  }

  if (bestScore < 2.5 || isTied) return null;
  return bestMatch;
};

module.exports = { getFallbackReply, matchFAQ, normalize, scoreFAQ };
