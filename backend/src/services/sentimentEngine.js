/**
 * Pluggable sentiment classification engine
 * Supports: lexicon (default), vader, huggingface
 * Contract: classifySentiment(text) -> Promise<{ label, score }>
 */

const ENGINE = process.env.SENTIMENT_ENGINE || 'lexicon';

/**
 * Lexicon-based sentiment classifier (default)
 * Simple rule-based engine with negation handling
 */
const lexiconClassifier = async (text) => {
  const lowerText = text.toLowerCase();

  // Positivity indicators
  const positiveWords = [
    'excellent', 'great', 'wonderful', 'amazing', 'fantastic', 'love',
    'helpful', 'friendly', 'clean', 'good', 'happy', 'beautiful',
    'professional', 'efficient', 'impressed', 'satisfied', 'best',
  ];

  // Negativity indicators
  const negativeWords = [
    'terrible', 'awful', 'horrible', 'bad', 'hate', 'useless',
    'rude', 'dirty', 'slow', 'frustrating', 'disappointed', 'worst',
    'unprofessional', 'broken', 'wasted', 'angry', 'disgusted',
  ];

  // Negation words that flip sentiment
  const negationWords = ['not', 'no', 'never', 'neither', "isn't", "wasn't", "don't"];

  // Count sentiment words
  let positiveCount = 0;
  let negativeCount = 0;

  // Simple tokenization
  const words = lowerText.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[.,!?;:]/g, '');
    const hasPreviousNegation = i > 0 && negationWords.some(neg => words[i - 1].includes(neg));

    if (positiveWords.includes(word)) {
      positiveCount += hasPreviousNegation ? -1 : 1;
    } else if (negativeWords.includes(word)) {
      negativeCount += hasPreviousNegation ? -1 : 1;
    }
  }

  // Determine label
  let label = 'Neutral';
  let score = 0.5;

  if (positiveCount > negativeCount) {
    label = 'Positive';
    score = Math.min(0.99, 0.5 + (positiveCount / words.length));
  } else if (negativeCount > positiveCount) {
    label = 'Negative';
    score = Math.max(0.01, 0.5 - (negativeCount / words.length));
  } else if (positiveCount > 0 || negativeCount > 0) {
    label = 'Neutral'; // Mixed signals
    score = 0.5;
  }

  return { label, score };
};

/**
 * VADER sentiment analyzer (stub - would require vader-sentiment package)
 */
const vaderClassifier = async (text) => {
  // TODO: Implement VADER classifier
  // const SentimentIntensityAnalyzer = require('vader-sentiment');
  // const analyzer = new SentimentIntensityAnalyzer();
  // const scores = analyzer.polarity_scores(text);

  console.warn('VADER classifier not yet implemented, using lexicon fallback');
  return lexiconClassifier(text);
};

/**
 * HuggingFace model classifier (stub - requires API call)
 */
const huggingfaceClassifier = async (text) => {
  // TODO: Implement HuggingFace API call
  // const response = await fetch('https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english', {
  //   headers: { Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}` },
  //   method: 'POST',
  //   body: JSON.stringify({ inputs: text }),
  // });
  // const result = await response.json();

  console.warn('HuggingFace classifier not yet implemented, using lexicon fallback');
  return lexiconClassifier(text);
};

/**
 * Main classifier function: dispatches to appropriate engine
 * Contract: input text, output { label: 'Positive'|'Neutral'|'Negative', score: 0-1 }
 */
const classifySentiment = async (text) => {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  if (text.length > 5000) {
    throw new Error('Text too long (max 5000 characters)');
  }

  try {
    switch (ENGINE) {
      case 'lexicon':
        return await lexiconClassifier(text);
      case 'vader':
        return await vaderClassifier(text);
      case 'huggingface':
        return await huggingfaceClassifier(text);
      default:
        console.warn(`Unknown sentiment engine: ${ENGINE}, using lexicon`);
        return await lexiconClassifier(text);
    }
  } catch (error) {
    console.error('Error in sentiment classification:', error);
    // Fallback to neutral on error
    return { label: 'Neutral', score: 0.5 };
  }
};

module.exports = {
  classifySentiment,
};
