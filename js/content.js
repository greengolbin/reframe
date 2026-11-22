// All the words on the site live in this file, so the team can edit copy
// without touching the app logic. Keep British spelling and the campaign tone:
// lowercase headlines, casual, non-judgemental.

export const site = {
  campaign: 'This Is Random But…',
  tagline: "Let's pick up where we left off.",
  tool: 're:frame',
  // TODO(team): confirm the campaign hashtag before launch.
  hashtag: '#ThisIsRandomBut',
  // TODO(team): confirm the Instagram account people should tag.
  igHandle: '', // the account handle once the team confirms the account; leave empty to hide
  // TODO(team): confirm with Ms Angie; the purge job uses this date.
  retention: '31 January 2027',
  disclaimer:
    'Student project prototype for the MSF Youth and Relationships brief (Ngee Ann Polytechnic, IMP capstone). Not an official MSF service.',
};

// Survey of 124 youths aged 17 to 25 (convenience sample).
export const stats = { pleased: 73, thinkSame: 23, n: 124 };

export const gapOptions = [
  { id: 'months', label: 'a few months ago' },
  { id: 'year', label: 'about a year ago' },
  { id: 'years', label: '2+ years ago' },
];

export const placeOptions = [
  { id: 'secondary school', label: 'secondary school' },
  { id: 'primary school', label: 'primary school' },
  { id: 'a CCA', label: 'a CCA' },
  { id: 'poly or JC', label: 'poly or JC' },
  { id: 'somewhere else', label: 'somewhere else' },
];

// Openers are personalised with the friend's name and where you got close.
export function openers({ friendName, gap, place }) {
  const where = place && place !== 'somewhere else' ? place : 'back then';
  const long = gap === 'years' ? 'it has been forever, but ' : '';
  return [
    {
      tag: 'Something reminded me',
      text: `this is random but… walked past our old bubble tea place and thought of you. how’ve you been?`,
    },
    {
      tag: 'Honest and light',
      text: `okay random, but ${long}I miss our ${where === 'back then' ? 'old' : where} chats. up for a little throwback?`,
    },
    {
      tag: 'Lead with a memory',
      text: `found an old photo of us from ${where}. made us a photostrip, your turn ${friendName}!`,
    },
  ];
}

export const stages = {
  now: {
    n: 1,
    label: 'now',
    title: 'start where you are',
    question: "what's taking up most of your time these days?",
    placeholder: 'school, work, a new hobby, a show you can’t stop watching…',
    askBack: 'what about you? still doing the same things?',
    note: 'Starting with the present keeps it light. No need to bring up the past yet.',
  },
  then: {
    n: 2,
    label: 'then',
    title: 'remember when…?',
    question: 'add something that takes you back to when you were close',
    placeholder: 'a photo, the canteen stall, an inside joke, a song…',
    askBack: 'what do you remember about that?',
    note: 'Photos, places, objects, inside jokes and songs all count.',
  },
  next: {
    n: 3,
    label: 'next',
    title: 'make a new memory',
  },
};

export const formats = [
  { id: 'text', label: 'Text', hint: 'Type a few words' },
  { id: 'photo', label: 'Photo', hint: 'Add a photo from your phone' },
  { id: 'place', label: 'Place', hint: 'Name a place, e.g. the canteen chicken rice stall' },
  { id: 'song', label: 'Song', hint: 'A song that takes you back' },
];

// Activity ideas for stage 3. "match" words are looked for in what both of
// you wrote; matching ideas are shown first.
export const ideas = [
  { id: 'sport', tag: 'In person', title: 'badminton, then supper', why: 'Easy to chat between rounds', match: ['badminton', 'sport', 'gym', 'run', 'bouldering', 'climb', 'futsal', 'basketball'] },
  { id: 'cafe', tag: 'In person', title: 'a café catch-up', why: 'Low effort, easy to say yes to', match: ['coffee', 'kopi', 'cafe', 'café', 'bubble tea', 'boba', 'food', 'eat'] },
  { id: 'old-school', tag: 'In person', title: 'old school walk + bubble tea', why: 'Built on your stage 2 memory', match: ['school', 'canteen', 'class', 'cca', 'recess'] },
  { id: 'hawker', tag: 'In person', title: 'hawker centre supper', why: 'Cheap, casual, no planning needed', match: ['hawker', 'supper', 'chicken rice', 'prata'] },
  { id: 'online', tag: 'Online', title: 'game night on a call', why: 'Good if your timetables keep clashing', match: ['game', 'valorant', 'minecraft', 'overseas', 'busy'] },
];

export const times = ['this weekend', 'next week', 'after exams'];

// Demo mode only: what the simulated friend "replies" with.
export const demoFriend = {
  now: (me) =>
    `honestly just surviving the semester. ${/badminton|sport|gym/i.test(me) ? 'and yes, still playing on weekends!' : 'picked up bouldering though, it’s so fun'}`,
  then: () => 'omg I still remember the canteen chicken rice queue. we were always late for class because of it',
  next: (idea, time) => `yes!! ${idea} ${time} sounds perfect. can’t wait`,
};

export const faq = [
  {
    id: 'a-year',
    cat: 'Awkward gaps',
    q: "we haven't talked in a year. how do I reach out?",
    a: 'Lead with a specific reason, not an apology. Mention what reminded you of them, then ask one easy question they can answer quickly.',
    try: 'walked past our old bubble tea place today. still obsessed with brown sugar milk?',
  },
  {
    id: 'introvert',
    cat: 'Starting',
    q: 'my friend is quite introverted. how do I start without it being awkward?',
    a: 'Keep the first message low pressure: something they can reply to in one line, with no need for a long catch-up. A shared interest or a recent post of theirs is an easy way in.',
    try: 'saw your post about the new album. is it as good as everyone says?',
  },
  {
    id: 'one-word',
    cat: 'Keeping it going',
    q: 'what if they reply with one word?',
    a: 'A short reply is not a rejection. People reply quickly when they are busy. Ask one more open question, or suggest something concrete so the chat has somewhere to go.',
    try: 'haha fair. free for supper sometime next week?',
  },
  {
    id: 'why-now',
    cat: 'Starting',
    q: 'won’t it be weird to message out of nowhere?',
    a: 'Most people are glad to hear from an old friend, even if they would not have messaged first. Giving a small reason ("this reminded me of you") answers the “why now?” before they wonder.',
    try: 'this is random but this song came on and I thought of our CCA bus rides',
  },
  {
    id: 'changed',
    cat: 'Awkward gaps',
    q: "what if they've changed a lot?",
    a: 'You both have. Start with what they are up to now instead of trying to pick up exactly where you left off, and be curious rather than comparing.',
    try: 'heard you’re doing design now?? that’s so cool, how did that happen',
  },
  {
    id: 'no-reply',
    cat: 'Keeping it going',
    q: 'they haven’t replied. should I text again?',
    a: 'Give it a few days. People get busy. One light follow-up is fine; after that, leave the door open without pushing.',
    try: 'no stress if you’re swamped! just wanted to say hi',
  },
  {
    id: 'make-plans',
    cat: 'Keeping it going',
    q: 'we chatted, but how do we actually meet up?',
    a: 'Suggest one specific thing and a rough time. “We should meet sometime” rarely happens; “bubble tea after your exams?” usually does.',
    try: 'bubble tea after your exams? my treat this time',
  },
  {
    id: 'group',
    cat: 'Starting',
    q: 'should I message them alone or in our old group chat?',
    a: 'A direct message feels more personal and is easier to reply to. Group chats are good once you have something to plan together.',
    try: 'not the group chat this time, just wanted to check in with you!',
  },
];

export const faqCats = ['Starting', 'Awkward gaps', 'Keeping it going'];

// Fake door: "Keep going together". Tapping it shows an honest "not built yet" note and this short form.
export const door = {
  button: 'Keep going together',
  hint: 'Turn this into something you two do now and then.',
  reveal: 'We haven’t built this yet. Tell us what you’d want and we’ll use it to decide what to make next.',
  options: [
    { id: 'weekly-prompt', label: 'A new prompt for us each week' },
    { id: 'shared-album', label: 'A shared album of our strips' },
    { id: 'nudges', label: 'Gentle reminders to keep chatting' },
    { id: 'other', label: 'Something else' },
  ],
  thanks: 'Thanks, that helps. Nothing else is needed from you.',
};
