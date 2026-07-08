const agentNamePresets = [
  "Alex", "Jordan", "Taylor", "Morgan", "Casey",
  "Riley", "Jamie", "Avery", "Cameron", "Quinn",
  "Sam", "Charlie", "Drew", "Reese", "Parker",
  "Bailey", "Hayden", "Rowan", "Emerson", "Finley",

  "Emma", "Olivia", "Ava", "Sophia", "Mia",
  "Amelia", "Harper", "Evelyn", "Abigail", "Ella",
  "Grace", "Chloe", "Nora", "Lily", "Hannah",
  "Leah", "Zoe", "Maya", "Natalie", "Claire",

  "Liam", "Noah", "Oliver", "Elijah", "James",
  "William", "Benjamin", "Lucas", "Henry", "Theodore",
  "Jack", "Daniel", "Matthew", "David", "Joseph",
  "Michael", "Ethan", "Logan", "Mason", "Caleb",

  "Sofia", "Isabella", "Victoria", "Camila", "Valentina",
  "Elena", "Lucia", "Mateo", "Diego", "Leo",
  "Gabriel", "Adrian", "Julian", "Nicolas", "Marco",
  "Ana", "Maria", "Iris", "Naomi", "Eva",

  "Priya", "Anika", "Aisha", "Mina", "Layla",
  "Nadia", "Sara", "Fatima", "Yara", "Noor",
  "Omar", "Amir", "Ali", "Hassan", "Karim",
  "Arjun", "Dev", "Rohan", "Kiran", "Nikhil",
] as const;

/** A curated palette of agent colors — picked so the chip dot, ring, and
    pulse animation stay legible on every theme background. Avoids the
    pure user-blue and agent-amber so the random color stays visually
    distinct from the chrome tints. */
export const AGENT_COLORS: ReadonlyArray<string> = [
  "#e85a72", // rose
  "#f97b56", // coral
  "#f4a93b", // amber
  "#d9c64a", // mustard
  "#a3c45d", // olive
  "#58c98c", // mint
  "#5dccc8", // teal
  "#5bb1ff", // sky
  "#8b85ff", // indigo
  "#b67aff", // violet
  "#e15eff", // magenta
  "#ff7cb5", // pink
];

function pickFrom<T>(arr: ReadonlyArray<T>): T {
  const i = Math.floor(Math.random() * arr.length);
  return arr[i]!;
}

export function randomAgentName(): string {
  return pickFrom(agentNamePresets);
}

export function randomAgentColor(): string {
  return pickFrom(AGENT_COLORS);
}
