import { LegalChunk, Category } from "../types";

export interface RankedChunk {
  chunk: LegalChunk;
  score: number;
  reasons: string[];
}

const STOPWORDS = new Set([
  "и","в","во","на","с","со","к","по","о","об","от","до","за","при","или","а","но",
  "что","как","для","не","из","у","же","то","это","их","его","ее","бы","быть",
  "также","может","могут","если","ли","над","под","про","мне","мой","моя","мои",
  "мое","хочу","нужно","надо","есть","нет","где","когда","после","перед","между",
  "один","одна","этот","эта","эти","того","том","такая","такой","такие","сейчас",
  "бывший","бывшая","муж","жена"
]);

const CATEGORY_HINTS: Record<Category, string[]> = {
  divorce: [
    "расторжение брака",
    "развод",
    "прекращение брака",
    "развестись",
    "развести",
    "расторгнуть брак",
    "супруг",
    "супруги"
  ],
  alimony: [
    "алименты",
    "взыскание алиментов",
    "содержание ребенка",
    "содержание детей",
    "деньги на ребенка",
    "выплаты на ребенка",
    "платить на ребенка"
  ],
  child_residence: [
    "место жительства ребенка",
    "с кем будет жить ребенок",
    "с кем останется ребенок",
    "проживание ребенка",
    "определить место жительства"
  ],
  child_contact: [
    "порядок общения с ребенком",
    "общение с ребенком",
    "не дают видеться с ребенком",
    "видеться с ребенком",
    "запрещают общение",
    "родитель проживающий отдельно"
  ],
  property_division: [
    "раздел имущества",
    "имущество супругов",
    "совместная собственность",
    "делить квартиру",
    "делить имущество",
    "ипотека",
    "квартира",
    "машина"
  ],
  marriage_contract: [
    "брачный договор",
    "брачный контракт",
    "условия брачного договора",
    "оспорить брачный договор"
  ],
  paternity: [
    "установление отцовства",
    "оспаривание отцовства",
    "отцовство",
    "запись родителей",
    "кто отец ребенка",
    "оспорить запись об отце"
  ],
  urgent_safety: [
    "насилие",
    "угроза ребенку",
    "угроза",
    "безопасность",
    "забрал ребенка",
    "боюсь за ребенка",
    "давление",
    "защита ребенка"
  ],
  other: []
};

const LEXICAL_EQUIVALENTS: Record<string, string[]> = {
  развод: ["расторжение брака", "прекращение брака", "развестись"],
  алименты: ["содержание ребенка", "деньги на ребенка", "выплаты на ребенка"],
  ребенок: ["дети", "несовершеннолетний", "дочь", "сын"],
  имущество: ["собственность", "квартира", "ипотека", "машина"],
  общение: ["видеться", "контакт", "встречи"],
  отцовство: ["отец ребенка", "запись об отце"],
  брачный: ["брачный договор", "брачный контракт"],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function tokenize(text: string): string[] {
  const words = normalize(text).match(/[а-яa-z0-9-]{3,}/g) ?? [];
  return words.filter((w) => !STOPWORDS.has(w));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function hasSuspiciousFlag(chunk: LegalChunk): boolean {
  return (chunk.quality_flags ?? []).includes("suspicious_truncation");
}

function buildExpandedTerms(query: string, category: Category): string[] {
  const queryNorm = normalize(query);
  const tokens = tokenize(queryNorm);

  const expanded: string[] = [queryNorm, ...tokens, ...(CATEGORY_HINTS[category] ?? [])];

  for (const token of tokens) {
    if (LEXICAL_EQUIVALENTS[token]) {
      expanded.push(...LEXICAL_EQUIVALENTS[token]);
    }
  }

  if (queryNorm.includes("деньги") && queryNorm.includes("реб")) {
    expanded.push("алименты", "содержание ребенка", "взыскание алиментов");
  }

  if (
    queryNorm.includes("не дают") &&
    (queryNorm.includes("ребен") || queryNorm.includes("доч") || queryNorm.includes("сын"))
  ) {
    expanded.push("порядок общения с ребенком", "общение с ребенком");
  }

  if (
    queryNorm.includes("с кем") &&
    (queryNorm.includes("ребен") || queryNorm.includes("доч") || queryNorm.includes("сын"))
  ) {
    expanded.push("место жительства ребенка", "с кем будет жить ребенок");
  }

  if (
    queryNorm.includes("делить") &&
    (queryNorm.includes("квартир") || queryNorm.includes("имуществ"))
  ) {
    expanded.push("раздел имущества", "имущество супругов", "совместная собственность");
  }

  return unique(expanded.map(normalize).filter(Boolean));
}

function scoreFieldContains(
  fieldValue: string,
  term: string,
  exactWeight: number,
  partialWeight: number
): number {
  const field = normalize(fieldValue);
  if (!field || !term) return 0;
  if (field.includes(term)) return exactWeight;

  const termTokens = tokenize(term);
  const fieldTokens = new Set(tokenize(field));
  let overlap = 0;

  for (const token of termTokens) {
    if (fieldTokens.has(token)) overlap += 1;
  }

  if (overlap > 0) {
    return Math.min(overlap * partialWeight, exactWeight - 1);
  }

  return 0;
}

function scoreChunk(chunk: LegalChunk, terms: string[], category: Category): RankedChunk {
  let score = 0;
  const reasons: string[] = [];

  const article = chunk.article ?? "";
  const articleTitle = chunk.article_title ?? "";
  const text = chunk.text ?? "";
  const keywords = (chunk.keywords ?? []).map(normalize);
  const topics = (chunk.topics ?? []).map(normalize);

  if (topics.includes(category)) {
    score += 10;
    reasons.push(`topic:${category}`);
  }

  for (const term of terms) {
    const titleScore = scoreFieldContains(articleTitle, term, 12, 2);
    if (titleScore > 0) {
      score += titleScore;
      reasons.push(`title:${term}`);
    }

    const articleScore = scoreFieldContains(article, term, 10, 2);
    if (articleScore > 0) {
      score += articleScore;
      reasons.push(`article:${term}`);
    }

    if (keywords.includes(term)) {
      score += 8;
      reasons.push(`keyword:${term}`);
    }

    if (topics.includes(term)) {
      score += 7;
      reasons.push(`topic_term:${term}`);
    }

    const textScore = scoreFieldContains(text, term, 6, 1);
    if (textScore > 0) {
      score += textScore;
      reasons.push(`text:${term}`);
    }
  }

  if (chunk.article_number) score += 1;
  if (chunk.article_title) score += 1;

  if (hasSuspiciousFlag(chunk)) {
    score -= 20;
    reasons.push("penalty:suspicious_truncation");
  }

  return {
    chunk,
    score,
    reasons: unique(reasons),
  };
}

export function retrieveRelevantChunks(
  chunks: LegalChunk[],
  query: string,
  category: Category,
  limit: number = 5
): RankedChunk[] {
  const terms = buildExpandedTerms(query, category);

  return chunks
    .map((chunk) => scoreChunk(chunk, terms, category))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      const aNum = Number(a.chunk.article_number ?? "999999");
      const bNum = Number(b.chunk.article_number ?? "999999");

      return aNum - bNum;
    })
    .slice(0, limit);
}

export function buildLegalContext(ranked: RankedChunk[]): string {
  return ranked
    .map((r) => {
      const c = r.chunk;
      const part = c.part ? `, ${c.part}` : "";
      return `[${c.article}${part}]\n${c.text}`;
    })
    .join("\n\n");
}