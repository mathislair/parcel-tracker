// Scheduled driver events — fired by elapsed time, not progress stages
// Each event has a `at` field = seconds after simulation start

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const greetings = [
  "Bonjour ! J'ai bien récupéré votre colis, je suis en route 🚛",
  "Bonjour, c'est Karim votre livreur. J'arrive dans quelques minutes !",
  "Hello ! Votre colis est avec moi, j'arrive bientôt !",
];

const midMessages = [
  { type: 'delay', text: "Petit ralentissement à cause du trafic, j'ai ~2 min de retard. Désolé !", delayAdded: 40 },
  { type: 'delay', text: "Il y a des travaux sur mon trajet, je fais un détour. Quelques minutes de plus !", delayAdded: 35 },
  { type: 'delay', text: "Embouteillage imprévu... Je fais au plus vite ! 🚗", delayAdded: 30 },
];

const callReasons = [
  "Le livreur souhaite confirmer votre adresse",
  "Le livreur a une question sur l'accès",
  "Le livreur n'arrive pas à trouver l'entrée",
];

const lateMessages = [
  "Je suis presque arrivé ! Vous pouvez préparer le code de la porte ?",
  "J'arrive dans votre rue, je cherche une place pour me garer.",
  "Plus que quelques mètres, j'arrive ! 🏃",
];

const arrivingMessages = [
  "Je suis en bas de chez vous ! 🏠",
  "Je suis devant la porte, je sonne !",
  "Arrivé ! Je dépose le colis maintenant.",
];

export function buildSchedule(totalDuration) {
  const events = [];

  // 1) Greeting message — always, at ~15% (guaranteed)
  events.push({
    at: Math.round(totalDuration * 0.12) + Math.round(Math.random() * 5),
    type: 'message',
    text: pick(greetings),
  });

  // 2) Delay event — always, at ~35%
  const delay = pick(midMessages);
  const delayAt = Math.round(totalDuration * 0.32) + Math.round(Math.random() * 10);
  events.push({
    at: delayAt,
    type: 'delay',
    text: delay.text,
    delayAdded: delay.delayAdded,
    progress: delayAt / totalDuration,
  });

  // 3) Call — always, at ~55%
  events.push({
    at: Math.round(totalDuration * 0.52) + Math.round(Math.random() * 8),
    type: 'call',
    reason: pick(callReasons),
  });

  // 4) Late message — always, at ~75%
  events.push({
    at: Math.round(totalDuration * 0.72) + Math.round(Math.random() * 8),
    type: 'message',
    text: pick(lateMessages),
  });

  // 5) Arriving message — always, at ~90%
  events.push({
    at: Math.round(totalDuration * 0.88) + Math.round(Math.random() * 5),
    type: 'message',
    text: pick(arrivingMessages),
  });

  // Sort by time and mark unfired
  return events
    .sort((a, b) => a.at - b.at)
    .map((e, i) => ({ ...e, id: i, fired: false }));
}

export const quickReplies = [
  "OK merci !",
  "J'arrive !",
  "Le code est 4829A",
  "3ème étage droite",
  "Je descends",
  "Laissez chez le voisin svp",
  "Sonnez 2 fois svp",
];

export const driverAutoReplies = [
  { match: /merci|super|ok|parfait|cool/i, reply: "Pas de souci ! 👍" },
  { match: /code|porte|digicode/i, reply: "Noté, merci !" },
  { match: /étage|escalier|ascenseur/i, reply: "Compris, je monte dès que j'arrive !" },
  { match: /voisin|gardien|loge/i, reply: "D'accord, je ferai comme ça." },
  { match: /descend|j'arrive|sors/i, reply: "Parfait, je vous attends en bas !" },
  { match: /sonn|interphone/i, reply: "OK je sonnerai en arrivant 👍" },
  { match: /retard|long|quand/i, reply: "Je fais au plus vite, plus que quelques minutes !" },
  { match: /./, reply: "Bien reçu !" },
];
