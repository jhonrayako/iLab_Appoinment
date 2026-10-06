const { getFallbackReply, matchFAQ } = require('../src/services/chatbotNlp');

const faqs = [
  {
    question: 'What are your opening hours?',
    answer: 'The public support desk is available Monday to Saturday, 7:00 AM to 6:00 PM.',
    keywords: ['hours', 'open', 'time', 'close', 'schedule'],
    training_phrases: ['What time does the office close?', 'Are you open on Sundays?'],
    category: 'general',
  },
  {
    question: 'Where are you located?',
    answer: 'iLAB Guiguinto is located in Guiguinto, Bulacan, Philippines.',
    keywords: ['location', 'where', 'address', 'map'],
    training_phrases: ['Where are you located?', 'Is iLAB in Guiguinto?'],
    category: 'general',
  },
  {
    question: 'What is the facility address?',
    answer: 'The iLAB Guiguinto facility is at RVQ7+938, Spur Road, Guiguinto, Bulacan.',
    keywords: ['address', 'location', 'spur', 'road', 'direction'],
    training_phrases: ['Please share the exact iLAB address.', 'What is the iLAB plus code?'],
    category: 'contact',
  },
  {
    question: 'What services do you offer?',
    answer: 'iLAB Guiguinto supports tissue culture, ornamental plant development, and sustainable agriculture.',
    keywords: ['service', 'program', 'tissue', 'plant', 'agriculture', 'research'],
    training_phrases: [
      'Do you offer plant training?',
      'Do you provide agriculture technical assistance?',
      'What services and programs does iLAB have?',
    ],
    category: 'general',
  },
  {
    question: 'How can I request a visit?',
    answer: 'Log in and ask the iLAB chatbot to create a visit request.',
    keywords: ['book', 'appointment', 'schedule', 'visit', 'letter'],
    training_phrases: ['How do I schedule a visit?', 'Can I make an appointment online?'],
    category: 'visit-letter',
  },
  {
    question: 'How can I contact iLAB Guiguinto?',
    answer: 'Call 0955 593 4054 or email ilabguiguinto@gmail.com.',
    keywords: ['contact', 'phone', 'telephone', 'email', 'call'],
    training_phrases: ['What is the office phone number?', 'Does iLAB Guiguinto have an email address?'],
    category: 'contact',
  },
  {
    question: 'Who can use iLAB services?',
    answer: 'iLAB provides public learning, technical assistance, and agriculture support to relevant stakeholders.',
    keywords: ['public', 'student', 'teacher', 'grower', 'farmer', 'community', 'who'],
    training_phrases: ['Can students use iLAB services?', 'Do you accept school groups?'],
    category: 'general',
  },
  {
    question: 'What is iLAB Guiguinto?',
    answer: 'iLAB Guiguinto is a facility supporting tissue culture and agriculture-related innovation.',
    keywords: ['about', 'dost', 'facility', 'mission', 'research'],
    training_phrases: ['What does the name iLAB mean?', 'What kind of laboratory is iLAB?'],
    category: 'general',
  },
  {
    question: 'What programs do you offer?',
    answer: 'iLAB provides community agriculture programs.',
    keywords: ['programs'],
    training_phrases: ['Do you offer training for farmers?'],
    category: 'general',
  },
  {
    question: 'What can I ask the iLAB chatbot?',
    answer: 'I can answer questions about iLAB Guiguinto.',
    keywords: ['chatbot topics', 'supported topics', 'chatbot capabilities'],
    training_phrases: [
      'What can I ask the iLAB chatbot?',
      'What topics can you answer?',
      'What questions can you answer?',
      'What topics are within your scope?',
    ],
    category: 'general',
  },
];

describe('iLAB chatbot NLP matching', () => {
  it.each([
    ['What are your opening hours?', 'What are your opening hours?'],
    ['What time is iLAB open?', 'What are your opening hours?'],
    ['Where is iLAB Guiguinto?', 'Where are you located?'],
    ['What is the iLAB address?', 'What is the facility address?'],
    ['What services and programs does iLAB have?', 'What services do you offer?'],
    ['Tell me about tissue culture research', 'What services do you offer?'],
    ['I want to schedule an iLAB appointment', 'How can I request a visit?'],
    ['How can I contact iLAB?', 'How can I contact iLAB Guiguinto?'],
    ['Do you offer training for farmers?', 'What programs do you offer?'],
    ['Are you open on Sundays?', 'What are your opening hours?'],
    ['Where are you located?', 'Where are you located?'],
    ['What is the iLAB plus code?', 'What is the facility address?'],
    ['Does iLAB Guiguinto have an email address?', 'How can I contact iLAB Guiguinto?'],
    ['How do I schedule a visit?', 'How can I request a visit?'],
    ['Can students use iLAB services?', 'Who can use iLAB services?'],
    ['What does the name iLAB mean?', 'What is iLAB Guiguinto?'],
  ])('matches "%s" to an iLAB FAQ', (question, expectedQuestion) => {
    expect(matchFAQ(question, faqs)?.question).toBe(expectedQuestion);
  });

  it('does not match unrelated questions from one accidental keyword', () => {
    expect(matchFAQ('How do I renew my passport?', faqs)).toBeNull();
  });

  it('does not choose arbitrarily when equally relevant FAQ answers conflict', () => {
    const ambiguousFAQs = [
      { question: 'Custom topic alpha', keywords: ['location'] },
      { question: 'Custom topic beta', keywords: ['location'] },
    ];

    expect(matchFAQ('location', ambiguousFAQs)).toBeNull();
  });

  it.each([
    ['Hello', 'Hello!'],
    ['Hi iLAB', 'Hello!'],
    ['Good morning', 'Hello!'],
    ['Thank you!', 'You are welcome!'],
    ['What can you help me with?', 'I can help with questions'],
    ['What questions can I ask?', 'I can help with questions'],
    ['What is the weather forecast?', 'this chatbot focuses on iLAB Guiguinto'],
    ['How do I renew my passport?', 'this chatbot focuses on iLAB Guiguinto'],
  ])('responds to "%s" with an appropriate scope reply', (question, expectedText) => {
    expect(getFallbackReply(question)).toContain(expectedText);
  });
});
