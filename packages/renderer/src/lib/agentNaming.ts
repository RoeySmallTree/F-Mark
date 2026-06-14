const alienNames = [
  "zod", "zarn", "zaru", "zarek", "zhex",
  "zhul", "zorin", "zovak", "zeln", "zelra",
  "zath", "zyrn", "zynox", "zhor", "zhaen",
  "zhova", "zorek", "zulix", "zulra", "zanik",
  "zavor", "zorith", "zexal", "zovrin", "zelkath",

  "xarn", "xarok", "xarin", "xel", "xelar",
  "xevu", "xevra", "xith", "xorin", "xolun",
  "xulka", "xendra", "xyrn", "xyro", "xavor",
  "xazek", "xenra", "xirok", "xirath", "xorven",
  "xuln", "xuldar", "xalith", "xekor", "xavar",

  "vexu", "vexor", "vekra", "veln", "velra",
  "vorin", "vornak", "voryx", "vaxel", "vaxor",
  "vilar", "vithra", "vulon", "vulra", "vyrn",
  "vyros", "vael", "vaerix", "volek", "volth",
  "veshar", "vrenok", "vrath", "vezik", "vornia",

  "qorin", "qel", "qelar", "qevik", "qirax",
  "qiro", "qolan", "qovek", "qarn", "qarnu",
  "qazir", "qorth", "qelra", "qenix", "qirn",
  "qutra", "qavon", "qozar", "qenth", "qyrex",
  "qadra", "qivor", "qomir", "qezul", "qalth",

  "krel", "karn", "karok", "kavon", "kazri",
  "kelth", "kethra", "kirax", "kivra", "korlu",
  "korath", "koryn", "kulvek", "karnex", "krax",
  "kriva", "kromar", "kalth", "kezor", "kelnor",
  "kozun", "kivar", "krathen", "kurel", "kalthor",

  "tharn", "tharnu", "threx", "thoral", "thazek",
  "thulek", "thren", "threnix", "tholun", "thavok",
  "tharix", "thulra", "thovar", "thirn", "thox",
  "tharak", "thilox", "thurven", "thazra", "thelrik",
  "tharnox", "thovaen", "thyrak", "thozu", "thalk",

  "naxu", "naxar", "navor", "nexor", "nexal",
  "nerix", "nithra", "nyrvek", "nyxal", "nokra",
  "norvex", "nulkar", "nizok", "nevrin", "navok",
  "nethul", "nyrak", "nolar", "nulith", "nathor",
  "nexu", "nithok", "nazril", "navoru", "narnok",

  "raxor", "raxel", "ruvak", "rynix", "rynor",
  "ralth", "ravor", "rexul", "rekth", "ralak",
  "rithar", "rixu", "rorvek", "ruvex", "rathun",
  "rathok", "relkor", "rynvek", "ruxal", "roven",
  "razhul", "ralthor", "raqen", "ruzik", "rathix",

  "morvok", "marnu", "mekra", "melnar", "mavok",
  "morth", "mulox", "murven", "mivra", "mazul",
  "mexor", "monrax", "malkor", "morlan", "mezu",
  "mirak", "mixra", "murlen", "mazik", "mokra",
  "marvex", "morthul", "mevrix", "moxan", "malvek",

  "draxen", "dravax", "druxel", "drunok", "drath",
  "drexor", "drelka", "dravor", "drith", "drovan",
  "duxar", "dezik", "dalzor", "darvek", "dexun",
  "dorith", "divok", "dulkarn", "drazhul", "dromek",
  "drelth", "dornix", "davrek", "draxul", "dazrin",

  "ernia", "ezhul", "ekthar", "elzun", "eknor",
  "ezrox", "evrak", "evrix", "evarn", "elexu",
  "orvex", "orvun", "orzak", "oskra", "ozren",
  "ozrak", "ozirn", "yexal", "yroth", "yulven",
  "yrix", "yrvek", "ynzor", "elkor", "ethrax",

  "azrok", "akril", "arnok", "avrix", "avrox",
  "aizul", "azenk", "athor", "arvek", "azhul",
  "ulzar", "ulvek", "ulnax", "urnex", "uthra",
  "ulron", "urvex", "ixor", "ithrox", "ithrek",
  "ikarn", "ilvek", "iskar", "irzul", "oxarn",
];

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
  return pickFrom(alienNames);
}

export function randomAgentColor(): string {
  return pickFrom(AGENT_COLORS);
}
