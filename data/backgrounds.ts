/**
 * SRD 5.1 character backgrounds and alignment data.
 *
 * Trait-table text is reproduced from the System Reference Document 5.1
 * (released by Wizards of the Coast under Creative Commons Attribution 4.0).
 * Backgrounds here are NARRATIVE-ONLY — they carry no mechanical benefits
 * (no skill/tool proficiencies, equipment, or active features). The `feature`
 * is surfaced as read-only roleplay flavor.
 *
 * Each background ships with the canonical d8/d6 tables:
 *   - personalityTraits: d8 table (SRD suggests picking or rolling two)
 *   - ideals:            d6 table (each entry carries an alignment tag)
 *   - bonds:             d6 table
 *   - flaws:             d6 table
 */

export interface IdealEntry {
  /** SRD alignment tag for the ideal, e.g. 'good', 'lawful', 'neutral', 'evil', 'chaotic', or '' for any. */
  alignment: string;
  text: string;
}

export interface BackgroundDefinition {
  id: string;
  name: string;
  description: string;
  /** Roleplay feature (flavor only — no mechanical effect). */
  feature: { name: string; description: string };
  personalityTraits: string[];
  ideals: IdealEntry[];
  bonds: string[];
  flaws: string[];
  /** Font Awesome icon for the background. */
  icon?: string;
}

export interface AlignmentDefinition {
  /** Short id, e.g. 'lg'. */
  id: string;
  name: string;
  /** Two/three-letter abbreviation, e.g. 'LG', 'TN'. */
  short: string;
  description: string;
}

/** The nine canonical D&D alignments, ordered as a 3x3 grid
 *  (columns: Good / Neutral / Evil, rows: Lawful / Neutral / Chaotic). */
export const ALIGNMENTS: AlignmentDefinition[] = [
  {
    id: 'lg',
    name: 'Lawful Good',
    short: 'LG',
    description: 'Acts as a good person is expected or required to act. Combines honor and compassion.',
  },
  {
    id: 'ng',
    name: 'Neutral Good',
    short: 'NG',
    description: 'Does the best that a good person can do, without bias for or against order.',
  },
  {
    id: 'cg',
    name: 'Chaotic Good',
    short: 'CG',
    description: 'Follows their own conscience, with little regard for the expectations of others.',
  },
  {
    id: 'ln',
    name: 'Lawful Neutral',
    short: 'LN',
    description: 'Acts in accordance with law, tradition, or personal codes, free of moral bias.',
  },
  {
    id: 'tn',
    name: 'True Neutral',
    short: 'TN',
    description: 'Acts naturally, without prejudice or compulsion toward any alignment extreme.',
  },
  {
    id: 'cn',
    name: 'Chaotic Neutral',
    short: 'CN',
    description: 'Follows whims, valuing personal freedom above all else, neither good nor evil.',
  },
  {
    id: 'le',
    name: 'Lawful Evil',
    short: 'LE',
    description: 'Methodically takes what they want within a code of tradition, loyalty, or order.',
  },
  {
    id: 'ne',
    name: 'Neutral Evil',
    short: 'NE',
    description: 'Does whatever they can get away with, without compassion or scruples.',
  },
  {
    id: 'ce',
    name: 'Chaotic Evil',
    short: 'CE',
    description: 'Acts with arbitrary violence, spurred by greed, hatred, or sheer bloodlust.',
  },
];

export const BACKGROUNDS_CATALOG: BackgroundDefinition[] = [
  {
    id: 'acolyte',
  icon: 'fa-hands-praying',
    name: 'Acolyte',
    description: 'You have spent your life in the service of a temple, learning ancient rites and tradition.',
    feature: {
      name: 'Shelter of the Faithful',
      description:
        'You command the respect of those who share your faith, and you can perform the religious rituals of your deity. You and your companions can expect to receive free healing and care at a temple, shrine, or other established presence of your faith, though you must provide any material components needed for spells.',
    },
    personalityTraits: [
      'I idolize a particular hero of my faith, and constantly refer to that person\'s deeds and example.',
      'I can find common ground between the fiercest enemies, empathizing with them and always working toward peace.',
      'I see omens in every event and action. The gods try to speak to us, we just need to listen.',
      'Nothing can shake my optimistic attitude.',
      'I quote (or misquote) sacred texts and proverbs in almost every situation.',
      'I am tolerant (or intolerant) of other faiths and respect the worship of other gods.',
      'I\'ve enjoyed fine food, drink, and high society among my temple\'s elite. Rough living grates on me.',
      'I\'ve spent so long in the temple that I have little practical experience dealing with people in the outside world.',
    ],
    ideals: [
      { alignment: 'lawful', text: 'Tradition. The ancient traditions of worship and sacrifice must be preserved and upheld.' },
      { alignment: 'good', text: 'Charity. I always try to help those in need, no matter what the personal cost.' },
      { alignment: 'lawful', text: 'Faith. I trust that my deity will guide my actions. I have faith that if I work hard, things will go well.' },
      { alignment: 'neutral', text: 'Modesty. The deeds of the just don\'t need to be broadcast; the gods see all.' },
      { alignment: 'any', text: 'Devotion. My life is dedicated to fulfilling the will of my gods, whatever that may be.' },
      { alignment: 'any', text: 'Knowledge. Through study and reflection, I grow closer to the divine truth.' },
    ],
    bonds: [
      'I would die to recover an ancient relic of my faith that was lost long ago.',
      'I will someday get revenge on the corrupt hierarchy who branded me a heretic.',
      'I owe my life to the priest who took me in when my parents died.',
      'Everything I do is for the common people.',
      'I will do anything to protect the temple where I served.',
      'I seek to preserve a sacred text that my enemies consider heretical and seek to destroy.',
    ],
    flaws: [
      'I judge others harshly, and myself even more severely.',
      'I put too much trust in those who wield power within my temple\'s hierarchy.',
      'My piety sometimes leads me to blindly trust those that profess faith in my god.',
      'I am inflexible in my thinking.',
      'I am suspicious of strangers and expect the worst of them.',
      'Once I pick a goal, I become obsessed with it to the detriment of everything else in my life.',
    ],
  },
  {
    id: 'charlatan',
  icon: 'fa-masks-theater',
    name: 'Charlatan',
    description: 'You have always had a way with people, using your charm and wit to swindle and deceive.',
    feature: {
      name: 'False Identity',
      description:
        'You have created a second identity that includes documentation, established acquaintances, and disguises that allow you to assume that persona. You can forge documents and signatures, provided you have seen an example of the kind of document or the handwriting you are trying to copy.',
    },
    personalityTraits: [
      'I fall in and out of love easily, and am always pursuing someone.',
      'I have a joke for every occasion, especially occasions where humor is inappropriate.',
      'Flattery is my preferred trick for getting what I want.',
      'I\'m a born gambler who can\'t resist taking a risk for a potential payoff.',
      'I lie about almost everything, even when there\'s no good reason to.',
      'Sarcasm and insults are my weapons of choice.',
      'I keep multiple holy symbols on me and invoke whatever deity might come in useful at any given moment.',
      'I pocket anything that looks valuable.',
    ],
    ideals: [
      { alignment: 'any', text: 'Independence. I am a free spirit—no one tells me what to do.' },
      { alignment: 'good', text: 'Generosity. I distribute the money I acquire to the people who really need it.' },
      { alignment: 'chaotic', text: 'Creativity. I never run the same con twice.' },
      { alignment: 'evil', text: 'Greed. I will do whatever it takes to become wealthy.' },
      { alignment: 'neutral', text: 'People. I\'m committed to the people I care about, not to ideals.' },
      { alignment: 'any', text: 'Fun. I do whatever keeps the smiles on my face and the coin in my pocket.' },
    ],
    bonds: [
      'I fleeced the wrong person and must work to ensure that this individual never crosses paths with me again.',
      'I owe everything to my mentor—a horrible person who\'s probably rotting in jail somewhere.',
      'I\'m convinced that no one could ever fool me the way I fool others.',
      'I have a sibling who is as dishonest and cunning as I am, and who I haven\'t seen in years.',
      'I swindled and ruined a person who didn\'t deserve it, and I seek to atone for my deeds.',
      'I owe a significant debt to a cruel crime boss.',
    ],
    flaws: [
      'I can\'t resist a pretty face.',
      'I\'m always in debt. I spend my ill-gotten gains on decadent luxuries faster than I bring them in.',
      'I\'m convinced that no one could ever fool me the way I fool others.',
      'I\'m prone to wild mood swings, sometimes losing my temper over minor slights.',
      'I enjoy humiliating those in power and laughing at their expense.',
      'I have a "tell" that reveals when I\'m lying.',
    ],
  },
  {
    id: 'criminal',
  icon: 'fa-user-secret',
    name: 'Criminal',
    description: 'You are an experienced criminal with a history of breaking the law and surviving by your wits.',
    feature: {
      name: 'Criminal Contact',
      description:
        'You have a reliable and trustworthy contact who acts as your liaison to a network of other criminals. You know how to get messages to and from your contact, even over great distances; you know the local messengers, corrupt caravan masters, and seedy sailors who can deliver your message for a price.',
    },
    personalityTraits: [
      'I always have a plan for what to do when things go wrong.',
      'I am always calm, no matter what the situation. I never raise my voice or let my emotions control me.',
      'The first thing I do in a new place is note the locations of everything valuable—or where such things could be hidden.',
      'I would rather make a new friend than a new enemy.',
      'I am incredibly slow to trust. Those who seem the fairest often have the most to hide.',
      'I don\'t pay attention to the risks in a situation. Never tell me the odds.',
      'The best way to get me to do something is to tell me I can\'t do it.',
      'I blow up at the slightest insult.',
    ],
    ideals: [
      { alignment: 'any', text: 'Honor. I don\'t steal from others in the trade.' },
      { alignment: 'evil', text: 'Greed. I will do whatever it takes to become wealthy.' },
      { alignment: 'neutral', text: 'People. I\'m committed to my crew, not to ideals.' },
      { alignment: 'chaotic', text: 'Freedom. Chains are meant to be broken, as are those who forge them.' },
      { alignment: 'any', text: 'Skill. Whatever I do, I do it with excellence.' },
      { alignment: 'any', text: 'Independence. I take care of myself, and I don\'t bow to anyone.' },
    ],
    bonds: [
      'I\'m loyal to my old crew, even when they\'ve moved on or turned on me.',
      'I would never betray a fellow thief or con artist, even one who wronged me.',
      'I\'m driven to avenge a friend\'s murder.',
      'The person I love was taken from me, and I will do anything to find them.',
      'I owe a debt I can never repay to the person who took me in when I had nothing.',
      'I have a child or family I send my earnings to in secret.',
    ],
    flaws: [
      'When I see something valuable, I can\'t help but try to take it.',
      'I always choose the most expedient option, even if it\'s dishonorable.',
      'I have a notorious and feared rival who seeks my downfall.',
      'I can\'t resist a mystery or a locked door.',
      'I have a habit of trusting the wrong people.',
      'My old habits of lying and theft resurface when I\'m under pressure.',
    ],
  },
  {
    id: 'entertainer',
  icon: 'fa-masks-theater',
    name: 'Entertainer',
    description: 'You thrive in front of an audience, knowing how to entrance, amuse, and move them.',
    feature: {
      name: 'By Popular Demand',
      description:
        'You can find a place to perform in any place that features combat for entertainment or a club in need of entertainment. In such an area, you can receive free modest food and lodging, and the locals perform minor favors for you.',
    },
    personalityTraits: [
      'I know a story relevant to almost every situation.',
      'Whenever I come to a new place, I collect local rumors and spread gossip.',
      'I\'m a hopeless romantic, always searching for that "special someone."',
      'Nobody stays angry at me or around me for long, since I can defuse any situation.',
      'I love a good insult, even one directed at me.',
      'I get bitter if I\'m not the center of attention.',
      'I settle conflicts with a well-timed jest or an inspiring song.',
      'I only feel truly alive when the spotlight is on me.',
    ],
    ideals: [
      { alignment: 'any', text: 'Beauty. When I perform, I bring the world to life in motion and song.' },
      { alignment: 'good', text: 'Generosity. My talents were given to me so that I could use them to benefit the world.' },
      { alignment: 'any', text: 'Tradition. The stories, legends, and songs of the past must never be forgotten.' },
      { alignment: 'chaotic', text: 'Creativity. The world is in need of new ideas and bold action.' },
      { alignment: 'any', text: 'Independence. I must be free—no one should tell me how to live my life.' },
      { alignment: 'neutral', text: 'People. I like seeing the smiles on people\'s faces when I perform. That\'s what matters.' },
    ],
    bonds: [
      'My instrument is my most treasured possession, a reminder of my old mentor.',
      'I want to be famous, whatever it takes.',
      'I owe my life to the mentor who took me in and taught me my craft.',
      'I would do anything to protect the venue or troupe I consider home.',
      'I will never forget the audience that first believed in me.',
      'I have a rival who is always trying to upstage me.',
    ],
    flaws: [
      'I\'ll do anything to win fame and renown.',
      'I attract trouble, even when I\'m trying to avoid it.',
      'I\'m a sucker for a pretty face.',
      'I often forget that not everyone shares my love of the spotlight.',
      'I spend money extravagantly and rarely save anything.',
      'I can be vain and overly proud of my talents.',
    ],
  },
  {
    id: 'folk-hero',
  icon: 'fa-crown',
    name: 'Folk Hero',
    description: 'You come from a humble background, but you are destined for greater things.',
    feature: {
      name: 'Rustic Hospitality',
      description:
        'Since you come from the ranks of the common folk, you fit in among them with ease. You can find shelter, aid, and protection among the commoners, provided you have done nothing to harm them.',
    },
    personalityTraits: [
      'I judge people by their actions, not their words.',
      'If someone is in trouble, I\'m always ready to lend help.',
      'When I set my mind to something, I follow through no matter what gets in the way.',
      'I have a strong sense of fair play and always try to find the most equitable solution.',
      'I am confident in my own abilities and do what I can to instill confidence in others.',
      'Thinking is for other people. I prefer action.',
      'I misuse long words in an attempt to sound smarter.',
      'I can be slow to trust those who seem better than me.',
    ],
    ideals: [
      { alignment: 'good', text: 'Respect. People deserve to be treated with dignity and respect.' },
      { alignment: 'good', text: 'Fairness. No one should get preferential treatment before the law, and no one is above the law.' },
      { alignment: 'good', text: 'Freedom. Tyrants and oppressors should be overthrown.' },
      { alignment: 'chaotic', text: 'Might. If I become strong, I can take what I want and do what I want.' },
      { alignment: 'any', text: 'Sincerity. There\'s no good in pretending to be something I\'m not.' },
      { alignment: 'any', text: 'Destiny. Nothing and no one can steer me away from my higher calling.' },
    ],
    bonds: [
      'I have a family, but I have no idea where they are. I will find them someday.',
      'I protect those who cannot protect themselves.',
      'I work the land and love the people who depend on it. I will do anything to protect them.',
      'I idolize a hero of the old tales and measure my deeds against that person\'s reputation.',
      'I will do anything to protect the place I grew up in.',
      'I wish I could visit the people I grew up with and show them how far I\'ve come.',
    ],
    flaws: [
      'The tyrant who rules my people will stop at nothing to see me destroyed.',
      'I\'m convinced of the significance of my destiny, and blind to my shortcomings.',
      'The people who knew me when I was young know my shameful secret, and I will do anything to keep it hidden.',
      'I have a weakness for the vices of the city.',
      'I sometimes solve problems with violence when subtlety would serve better.',
      'I\'m suspicious of strangers and expect the worst of them.',
    ],
  },
  {
    id: 'guild-artisan',
  icon: 'fa-hammer',
    name: 'Guild Artisan',
    description: 'You are a member of an artisan\'s guild, skilled in a specialized field and well-connected.',
    feature: {
      name: 'Guild Membership',
      description:
        'As an established and respected member of your guild, you can rely on certain benefits that membership provides. Your fellow guild members will provide shelter for you if need be, and you can gain assistance from the guild in legal trouble.',
    },
    personalityTraits: [
      'I believe that anything worth doing is worth doing right. I can\'t help it—I\'m a perfectionist.',
      'I\'m a snob who looks down on those who can\'t appreciate fine art.',
      'I always want to know how things work and what makes people tick.',
      'I\'m full of witty aphorisms and have a proverb for every occasion.',
      'I\'m rude to people who lack my commitment to hard work.',
      'I like to talk at length about my profession.',
      'I don\'t part with my money easily and will haggle tirelessly to get the best deal.',
      'I\'m well known for my work, and I want to make sure everyone appreciates it.',
    ],
    ideals: [
      { alignment: 'any', text: 'Community. It is the duty of all civilized people to strengthen the bonds of community.' },
      { alignment: 'good', text: 'Generosity. My talents were given to me so that I could use them to benefit the world.' },
      { alignment: 'any', text: 'Tradition. The ancient traditions of my craft must be preserved and upheld.' },
      { alignment: 'lawful', text: 'Excellence. My work is proof of my worth, and I will accept nothing less than perfection.' },
      { alignment: 'any', text: 'Mastery. I am driven to perfect my skill in every way I can.' },
      { alignment: 'neutral', text: 'People. I\'m committed to my guild and its members, not to ideals.' },
    ],
    bonds: [
      'The workshop where I learned my trade is the most important place in the world to me.',
      'I created a great work for someone, and then found them unworthy to receive it. I\'m still looking for someone worthy.',
      'I owe my guild a great debt for elevating me from poverty.',
      'I will do anything to preserve and expand the reputation of my guild.',
      'I pursue wealth to secure someone\'s love.',
      'One day I will return to my guild and prove that I am the greatest artisan of them all.',
    ],
    flaws: [
      'I\'m never satisfied with what I have; I always want more.',
      'I would kill to acquire a noble title or a place in the aristocracy.',
      'I\'m hiding a scandalous secret that could ruin me forever.',
      'I incessantly evaluate everything as a potential business venture.',
      'I\'m quick to assume that someone is trying to cheat me.',
      'I hold a grudge against a rival guild and will do anything to see it fail.',
    ],
  },
  {
    id: 'hermit',
  icon: 'fa-person-hiking',
    name: 'Hermit',
    description: 'You lived in seclusion for a formative part of your life, seeking enlightenment and truth.',
    feature: {
      name: 'Discovery',
      description:
        'During your quiet sojourn in the wild, you made a significant discovery. The exact nature of this discovery depends on the nature of your seclusion. It could be a great truth about the cosmos, the deities, or the forces of nature.',
    },
    personalityTraits: [
      'I\'ve been isolated for so long that I rarely speak, preferring gestures and the occasional grunt.',
      'I feel tremendous empathy for all who suffer.',
      'I\'m oblivious to etiquette and social expectations.',
      'I connect everything that happens to me to a grand, cosmic plan.',
      'I often get lost in my own thoughts and contemplation, becoming oblivious to my surroundings.',
      'I am ever-planning for the worst, taking meticulous notes on all dangers I observe.',
      'I am extremely frank; I say what I think with no filter.',
      'I am calm, patient, and almost impossible to anger.',
    ],
    ideals: [
      { alignment: 'any', text: 'Greater Good. My gifts are meant to be shared with all, not used for my own benefit.' },
      { alignment: 'lawful', text: 'Logic. Emotions must not cloud our sense of what is right and true.' },
      { alignment: 'good', text: 'Free Thinking. Inquiry and curiosity are the pillars of progress.' },
      { alignment: 'chaotic', text: 'Power. Solitude gave me a strength I now wield for my own ends.' },
      { alignment: 'any', text: 'Live and Let Live. Meddling in the affairs of others only brings trouble.' },
      { alignment: 'any', text: 'Nature. The natural order of the world is more important than the constructs of civilization.' },
    ],
    bonds: [
      'Nothing is more important than the other members of my hermitage, order, or association.',
      'I entered seclusion to hide from the ones who might still be hunting me. I must someday confront them.',
      'I\'m still seeking the enlightenment I pursued in my seclusion, and it still eludes me.',
      'I entered seclusion because I loved someone I could not have.',
      'Should my discovery come to light, it could bring ruin to the world.',
      'My isolation gave me great insight into a great evil that only I can stop.',
    ],
    flaws: [
      'Now that I\'ve returned to the world, I enjoy its delights a little too much.',
      'I harbor dark, bloodthirsty thoughts that I am ashamed to discuss.',
      'I am dogmatic in my beliefs and refuse to entertain any opposing viewpoint.',
      'I let my need to win arguments overshadow friendships and harmony.',
      'I\'d risk too much to uncover a lost secret or rediscover an ancient truth.',
      'I have a paralyzing fear of crowds and the bustle of civilization.',
    ],
  },
  {
    id: 'noble',
  icon: 'fa-crown',
    name: 'Noble',
    description: 'You understand wealth, power, and privilege, carrying the weight of a noble title.',
    feature: {
      name: 'Position of Privilege',
      description:
        'Thanks to your noble birth, people are inclined to think the best of you. You are welcome in high society, and people assume you have the right to be wherever you are. The common folk and merchants extend you every courtesy, and you can secure an audience with local nobles when you need it.',
    },
    personalityTraits: [
      'My favor, once lost, is lost forever.',
      'I am remarkably, hopelessly honest.',
      'I am proud of my ancestry and royal or noble blood.',
      'By my blood and honor, I will see justice done.',
      'I have an iron will and an unshakeable sense of purpose.',
      'I am confident in my own abilities and do not fear challenges.',
      'I am polite, refined, and charming in social situations.',
      'I look down on those I view as beneath me, and never miss a chance to show my superiority.',
    ],
    ideals: [
      { alignment: 'good', text: 'Honor. If I dishonor myself, I dishonor my whole clan.' },
      { alignment: 'good', text: 'Respect. Respect is due to me because of my position, but I must earn it by my actions.' },
      { alignment: 'any', text: 'Noblesse Oblige. My privileges come with the duty to protect those less fortunate.' },
      { alignment: 'any', text: 'Tradition. The ancient ways and the old oaths must be upheld.' },
      { alignment: 'lawful', text: 'Responsibility. It is my duty to respect the authority of those above me, as I would expect respect from those below.' },
      { alignment: 'evil', text: 'Power. My bloodline entitles me to rule, and I will take what is mine.' },
    ],
    bonds: [
      'I will face any challenge to win the approval of my family.',
      'My house\'s alliance must be maintained at all costs.',
      'Nothing is more important than my honor and the honor of my house.',
      'I am in love with the heir of a house that my family despises.',
      'My loyalty to my sovereign is unwavering.',
      'My house was destroyed and disgraced; I will restore its name at any cost.',
    ],
    flaws: [
      'My authority and position make me blind to the suffering of commoners.',
      'I am inflexible in my thinking and rooted in outdated tradition.',
      'I can\'t resist an opportunity to show off my wealth and status.',
      'I am quick to assume that I am owed respect and deference.',
      'I have a haughty disdain for those I consider beneath me.',
      'I am obsessed with recovering a family heirloom that was stolen from us.',
    ],
  },
  {
    id: 'outlander',
  icon: 'fa-compass',
    name: 'Outlander',
    description: 'You grew up in the wilds, far from civilization and the comforts of the city.',
    feature: {
      name: 'Wanderer',
      description:
        'You have an excellent memory for maps and geography, and you can always recall the general layout of terrain, settlements, and other features around you. In addition, you can find food and fresh water for yourself and up to five other people each day, provided that the land offers such things.',
    },
    personalityTraits: [
      'I feel far more comfortable around animals than people.',
      'I was, in fact, raised by wolves (or another beast).',
      'I have an almost instinctive sense of direction.',
      'I\'m a perfectionist when it comes to my chosen craft.',
      'I place no stock in wealthy or well-dressed people who look down on those who work for a living.',
      'I\'m always picking things up, absently fiddling with them, and sometimes breaking them.',
      'I feel more comfortable in the wild than I ever do in the city.',
      'I\'m observant and quick to notice any change in my surroundings.',
    ],
    ideals: [
      { alignment: 'good', text: 'Change. Life is like the seasons, in constant change, and we must change with it.' },
      { alignment: 'neutral', text: 'Nature. The natural order of the world is more important than all the constructs of civilization.' },
      { alignment: 'any', text: 'Emotion. Emotion is the truest expression of the self, and must be honored.' },
      { alignment: 'chaotic', text: 'Might. The strongest are meant to rule, and I will prove my strength.' },
      { alignment: 'any', text: 'Adaptability. The most important lesson of nature is that we must adapt to survive.' },
      { alignment: 'good', text: 'Respect. All living things deserve respect, from the smallest beast to the greatest.' },
    ],
    bonds: [
      'My family, clan, or tribe is the most important thing in my life, even when they are far from me.',
      'An injury is to the body; an insult is to the soul. I will have my vengeance.',
      'I will do anything to protect the sacred places of my people.',
      'I suffer awful nightmares of a disaster that befell my people. I cannot sleep well because of them.',
      'I would wander the world forever, if I could, but something keeps calling me home.',
      'I am the last of my people, and it is up to me to ensure their legends are not forgotten.',
    ],
    flaws: [
      'I am too enamored of ale, wine, and other intoxicants.',
      'There\'s no code of honor among my people that I will not break if it suits me.',
      'I remember every insult I\'ve received, and I nurse a grudge for each one.',
      'I am slow to trust members of other races, tribes, or societies.',
      'Violence is my answer to almost any challenge.',
      'Don\'t expect me to save those who can\'t save themselves. It is nature\'s way that the strong thrive and the weak perish.',
    ],
  },
  {
    id: 'sage',
  icon: 'fa-book',
    name: 'Sage',
    description: 'You spent years learning the lore of the multiverse, devoted to study and research.',
    feature: {
      name: 'Researcher',
      description:
        'When you attempt to learn or recall a piece of knowledge, if you do not know that information, you often know where and from whom you can obtain it. Usually, this information comes from a library, scriptorium, university, or a sage or other learned person or creature.',
    },
    personalityTraits: [
      'I use polysyllabic words that convey the impression of great erudition.',
      'I\'ve read every book in the world\'s greatest libraries—or I like to boast that I have.',
      'I\'m used to helping out those who aren\'t as smart as I am, and I patiently explain anything and everything to others.',
      'There\'s nothing I like more than a good mystery.',
      'I\'m willing to listen to every side of an argument before making my own decision.',
      'I... speak... slowly... when talking to idiots, which is almost everyone.',
      'I am horrified by the depths of my own ignorance, and always seek to learn more.',
      'I believe that direct experience is the best teacher, even when it hurts.',
    ],
    ideals: [
      { alignment: 'any', text: 'Knowledge. The path to power and self-improvement is through knowledge.' },
      { alignment: 'neutral', text: 'Beauty. What is beautiful points us beyond itself toward what is true.' },
      { alignment: 'lawful', text: 'Logic. Emotions must not cloud our logical thinking.' },
      { alignment: 'good', text: 'Knowledge. By understanding the world, I can use my gifts to ease suffering and uplift others.' },
      { alignment: 'any', text: 'Power. Knowledge is the path to power and control over the unwary.' },
      { alignment: 'chaotic', text: 'No Limits. Nothing should fetter the infinite possibility inherent in all existence.' },
    ],
    bonds: [
      'It is my duty to protect my students and the students of my master.',
      'I\'ve been searching my whole life for the answer to a single question.',
      'I\'ve sold my soul for knowledge. I hope to win it back someday.',
      'Everything I do is for the common people. They are the reason I study.',
      'I will stop at nothing to recover an ancient text that holds the secret I seek.',
      'I owe my life to the master who took me in and refused to give up on me.',
    ],
    flaws: [
      'I am easily distracted by the promise of information.',
      'Most people scream and run when they see a demon. I stop and take notes on its anatomy.',
      'Unlocking an ancient mystery is worth the price of a civilization.',
      'I overlook obvious solutions in favor of complicated ones.',
      'I speak without thinking and casually insult those around me.',
      'I am dismissive of the uneducated and impatient with the slow-minded.',
    ],
  },
  {
    id: 'sailor',
  icon: 'fa-anchor',
    name: 'Sailor',
    description: 'You sailed on a seagoing vessel for years, learning to survive on the rolling waves.',
    feature: {
      name: 'Ship\'s Passage',
      description:
        'When you need to, you can secure free passage on a sailing ship for yourself and your companions. In return for your free passage, you are expected to assist the crew in the daily workings of the ship.',
    },
    personalityTraits: [
      'My friends know they can rely on me, no matter what.',
      'I work hard so that I can play hard when the work is done.',
      'I enjoy sailing into new ports and making new friends over a flagon of ale.',
      'I stretch the truth for the sake of a good story.',
      'To me, a tavern brawl is a nice way to get to know a new city.',
      'I never pass up a friendly wager.',
      'My language is as foul as an otyugh nest.',
      'I like to squeeze into places where I\'m not supposed to be.',
    ],
    ideals: [
      { alignment: 'any', text: 'Respect. The thing that keeps a ship together is mutual respect between captain and crew.' },
      { alignment: 'good', text: 'Fairness. We all do the work, so we all share in the rewards.' },
      { alignment: 'any', text: 'Freedom. The sea is freedom—the freedom to go anywhere and do anything.' },
      { alignment: 'chaotic', text: 'Mastery. I\'m a predator, and the other ships on the sea are my prey.' },
      { alignment: 'any', text: 'People. I\'m committed to my crewmates, not to ideals.' },
      { alignment: 'evil', text: 'Aspiration. Someday, I\'ll own my own ship and chart my own course.' },
    ],
    bonds: [
      'I\'m loyal to my captain first, everything else second.',
      'The ship is my home—where I\'m most comfortable.',
      'A terrible monster or storm sank my ship and drowned my crew. I will have my revenge.',
      'I owe my life to the captain who pulled me from the sea.',
      'I\'m secretly in love with the first mate of my former ship.',
      'I always bring back a souvenir from every port we visit.',
    ],
    flaws: [
      'I follow orders, even if I think they\'re wrong, and I expect others to do the same.',
      'I\'ll say anything to avoid having to do extra work.',
      'I can\'t help but pocket small trinkets that catch my eye.',
      'I drink to excess when I\'m ashore and cause trouble.',
      'My pride will be the death of me.',
      'I become sullen and irritable when the sea is calm for too long.',
    ],
  },
  {
    id: 'soldier',
  icon: 'fa-khanda',
    name: 'Soldier',
    description: 'War has been your life for as long as you can recall, training you for the battlefield.',
    feature: {
      name: 'Military Rank',
      description:
        'You have a military rank from your career as a soldier. Soldiers loyal to your former military organization still recognize your authority and influence, and they defer to you if they are of a lower rank. You can invoke your rank to exert influence over other soldiers and requisition simple equipment or horses for temporary use.',
    },
    personalityTraits: [
      'I\'m always polite and respectful.',
      'I\'m haunted by memories of war. I can\'t get the images of violence out of my mind.',
      'I have lost too many friends to warfare. I slow down or stop to honor the fallen whenever I can.',
      'I\'d rather kill someone in their sleep than fight fair.',
      'It isn\'t murder if the enemy deserved to die.',
      'I have a crude sense of humor.',
      'I face problems head-on. A simple, direct solution is the best path to success.',
      'I quickly become impatient with anyone who chooses a slow, careful approach.',
    ],
    ideals: [
      { alignment: 'good', text: 'Greater Good. Our lot is to lay down our lives in defense of others.' },
      { alignment: 'lawful', text: 'Responsibility. I do my duty and obey the rules of war, whatever they are.' },
      { alignment: 'good', text: 'Integrity. I will never break my word, even to an enemy.' },
      { alignment: 'any', text: 'Might. The strongest are meant to rule, and I will prove my strength on the battlefield.' },
      { alignment: 'any', text: 'Live and Let Live. Ideals aren\'t worth killing over or forcing on others.' },
      { alignment: 'any', text: 'Glory. My deeds on the battlefield will be remembered for ages to come.' },
    ],
    bonds: [
      'I would lay down my life for the people I served with.',
      'Someone saved my life on the battlefield. To this day, I will never leave a friend behind.',
      'My honor is my life.',
      'I\'ll never forget the crushing defeat my company suffered or the enemies who dealt it.',
      'Those who fight beside me are worth dying for.',
      'I will one day take revenge on the officers who abandoned my unit to die.',
    ],
    flaws: [
      'The monstrous enemy we faced in battle still leaves me quivering with fear.',
      'I have a prejudice against those of a different race or nation.',
      'I made a terrible mistake in battle that cost many lives—and I hide it from everyone.',
      'I\'m horribly, painfully blunt in conversation.',
      'I suspect everyone of plotting against me.',
      'I have a powerful addiction that I hide from everyone.',
    ],
  },
  {
    id: 'urchin',
  icon: 'fa-person-walking',
    name: 'Urchin',
    description: 'You grew up on the streets, alone and orphaned, surviving by your wits.',
    feature: {
      name: 'City Secrets',
      description:
        'You know the secret patterns and flow to cities, and can find passages through the urban sprawl that others would miss. When you are not in combat, you and your companions can travel between any two locations in the city twice as fast as your speed would normally allow.',
    },
    personalityTraits: [
      'I hide scraps of food and trinkets away in my pockets, against a time when I might need them.',
      'I ask a lot of questions.',
      'I like to squeeze into places where I\'m not supposed to be, just to prove I can.',
      'I prefer to enter a place quietly and unnoticed, rather than making a grand entrance.',
      'The first thing I do in a new settlement is case the place for easy escape routes.',
      'I sleep with one eye open and a weapon close at hand.',
      'It\'s better to be thought a fool than to open your mouth and remove all doubt.',
      'I am nobody\'s fool. I lived on the streets, and that taught me everything I need to know.',
    ],
    ideals: [
      { alignment: 'any', text: 'Respect. All people, rich or poor, deserve respect.' },
      { alignment: 'good', text: 'Community. We have to take care of each other, because no one else will.' },
      { alignment: 'chaotic', text: 'Change. Life is like the seasons, in constant change, and we must change with it.' },
      { alignment: 'any', text: 'Cunning. Sleep with one eye open and a weapon close at hand.' },
      { alignment: 'any', text: 'Freedom. Chains are meant to be broken, as are those who forge them.' },
      { alignment: 'neutral', text: 'People. I\'m committed to those who shared the streets with me, not to ideals.' },
    ],
    bonds: [
      'My town or city is my home, and I\'ll fight to defend it.',
      'I sponsor an orphanage to keep other children off the streets where I had to live.',
      'I owe my survival to another urchin, who taught me how to live on the streets.',
      'I will do anything to protect the few people I love.',
      'I will return to the streets someday to free the children forced to live there.',
      'I will never forget the cruel noble who had my family killed.',
    ],
    flaws: [
      'I will lie, cheat, and steal to get what I need.',
      'I\'d rather kill someone in their sleep than fight fair.',
      'It isn\'t murder if the enemy deserved to die.',
      'I tend to assess the value of everything I see, looking for an easy score.',
      'I trust no one, and I expect everyone to betray me.',
      'I am secretly ashamed of my humble origins and pretend to be more than I am.',
    ],
  },
];

/** Lookup map keyed by background id. */
export const BACKGROUNDS_BY_ID: Record<string, BackgroundDefinition> = Object.fromEntries(
  BACKGROUNDS_CATALOG.map(bg => [bg.id, bg]),
);

/** Lookup map keyed by alignment id. */
export const ALIGNMENTS_BY_ID: Record<string, AlignmentDefinition> = Object.fromEntries(
  ALIGNMENTS.map(a => [a.id, a]),
);
