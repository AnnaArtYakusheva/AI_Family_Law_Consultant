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

const GENERIC_SCORING_TERMS = new Set([
  "право","права","прав","имею","имеет","имеющие","будет","можно","нужно",
  "еще","также","какой","какая","какие","что","как","только","была","были",
  "будут","могу","может","вправе"
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
    "место жительства детей",
    "с кем будет жить ребенок",
    "с кем останется ребенок",
    "проживание ребенка",
    "родительские права",
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
  ребенка: ["ребенок", "дети", "несовершеннолетний"],
  имущество: ["собственность", "квартира", "ипотека", "машина"],
  общение: ["видеться", "контакт", "встречи"],
  отцовство: ["отец ребенка", "запись об отце"],
  брачный: ["брачный договор", "брачный контракт"],
  усыновителем: ["усыновители", "усыновителями", "усыновление", "усыновить"],
  усыновитель: ["усыновители", "усыновителями", "усыновление", "усыновить"],
  усыновление: ["усыновители", "усыновителями", "усыновить"],
};

const INCOMPATIBLE_TOPICS: Record<Category, string[]> = {
  divorce: ["child_protection"],
  alimony: [
    "property_division",
    "marriage_contract",
    "paternity",
    "child_contact",
    "child_residence",
    "child_protection",
  ],
  child_residence: [
    "property_division",
    "marriage_contract",
    "alimony",
    "paternity",
    "child_protection",
  ],
  child_contact: [
    "property_division",
    "marriage_contract",
    "alimony",
    "paternity",
    "child_protection",
  ],
  property_division: [
    "alimony",
    "child_residence",
    "child_contact",
    "paternity",
    "child_protection",
  ],
  marriage_contract: [
    "alimony",
    "child_residence",
    "child_contact",
    "paternity",
    "child_protection",
  ],
  paternity: [
    "property_division",
    "marriage_contract",
    "alimony",
    "child_contact",
    "child_residence",
    "child_protection",
  ],
  urgent_safety: [],
  other: [],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function tokenize(text: string): string[] {
  const words = normalize(text).match(/[а-яa-z0-9-]{3,}/g) ?? [];
  return words.filter((w) => !STOPWORDS.has(w));
}

function scoringTokens(text: string): string[] {
  return tokenize(text).filter((w) => !GENERIC_SCORING_TERMS.has(w));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function hasSuspiciousFlag(chunk: LegalChunk): boolean {
  return (chunk.quality_flags ?? []).includes("suspicious_truncation");
}

function hasFalseBoundaryFlag(chunk: LegalChunk): boolean {
  return (chunk.quality_flags ?? []).includes("false_article_boundary");
}

function hasMalformedArticleBoundary(chunk: LegalChunk): boolean {
  const article = normalize(chunk.article ?? "");
  const articleTitle = normalize(chunk.article_title ?? "");

  return (
    /^статья\s+\d+(?:\.\d+)?\.\s+настоящего кодекса[),.]?/.test(article) ||
    /^настоящего кодекса[),.]?/.test(articleTitle)
  );
}

function buildExpandedTerms(query: string, category: Category): string[] {
  const queryNorm = normalize(query);
  const tokens = scoringTokens(queryNorm);

  const expanded: string[] = [...tokens, ...(CATEGORY_HINTS[category] ?? [])];

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

  if (queryNorm.includes("усынов")) {
    expanded.push(
      "лица имеющие право быть усыновителями",
      "усыновители",
      "усыновителями",
      "усыновление ребенка"
    );
  }

  return unique(
    expanded
      .map(normalize)
      .filter(Boolean)
      .filter((term) => {
        const tokens = scoringTokens(term);
        return tokens.length > 1 || (tokens.length === 1 && tokens[0] === term);
      })
  );
}

function containsTokenPhrase(fieldTokens: string[], termTokens: string[]): boolean {
  if (termTokens.length === 0 || fieldTokens.length < termTokens.length) return false;

  for (let i = 0; i <= fieldTokens.length - termTokens.length; i += 1) {
    if (termTokens.every((token, index) => fieldTokens[i + index] === token)) {
      return true;
    }
  }

  return false;
}

function scoreFieldTokens(
  fieldValue: string,
  term: string,
  phraseWeight: number,
  tokenWeight: number,
  partialPhraseWeight: number = 1
): number {
  const fieldTokens = scoringTokens(fieldValue);
  const termTokens = scoringTokens(term);

  if (fieldTokens.length === 0 || termTokens.length === 0) return 0;

  if (termTokens.length > 1) {
    if (containsTokenPhrase(fieldTokens, termTokens)) return phraseWeight;

    const fieldSet = new Set(fieldTokens);
    const overlap = termTokens.filter((token) => fieldSet.has(token)).length;

    return overlap >= 2 ? Math.min(overlap * partialPhraseWeight, phraseWeight - 1) : 0;
  }

  return new Set(fieldTokens).has(termTokens[0]) ? tokenWeight : 0;
}

function scoreTerm(chunk: LegalChunk, term: string): { score: number; reason: string | null } {
  const keywords = new Set((chunk.keywords ?? []).map(normalize));
  const topics = new Set((chunk.topics ?? []).map(normalize));

  const candidates: { score: number; reason: string }[] = [
    {
      score: scoreFieldTokens(chunk.article_title ?? "", term, 12, 3, 2),
      reason: `title:${term}`,
    },
    {
      score: scoreFieldTokens(chunk.article ?? "", term, 10, 2, 2),
      reason: `article:${term}`,
    },
    {
      score: scoreFieldTokens(chunk.text ?? "", term, 7, 1, 1),
      reason: `text:${term}`,
    },
  ];

  if (keywords.has(term)) {
    candidates.push({ score: 6, reason: `keyword:${term}` });
  }

  if (topics.has(term)) {
    candidates.push({ score: 5, reason: `topic_term:${term}` });
  }

  const best = candidates.sort((a, b) => b.score - a.score)[0];

  return best && best.score > 0 ? best : { score: 0, reason: null };
}

function hasIncompatibleTopic(topics: string[], category: Category): boolean {
  if (topics.length === 0) return false;

  const incompatible = new Set(INCOMPATIBLE_TOPICS[category] ?? []);
  return topics.some((topic) => incompatible.has(topic));
}

function scoreChunk(chunk: LegalChunk, terms: string[], category: Category): RankedChunk {
  let score = 0;
  const reasons: string[] = [];
  const topics = (chunk.topics ?? []).map(normalize);

  if (hasFalseBoundaryFlag(chunk) || hasMalformedArticleBoundary(chunk)) {
    return {
      chunk,
      score: 0,
      reasons: ["excluded:false_article_boundary"],
    };
  }

  if (topics.includes(category)) {
    score += 24;
    reasons.push(`topic:${category}`);
  } else if (hasIncompatibleTopic(topics, category)) {
    score -= 10;
    reasons.push(`penalty:topic_mismatch:${category}`);
  }

  for (const term of terms) {
    const termScore = scoreTerm(chunk, term);
    if (termScore.score > 0 && termScore.reason) {
      score += termScore.score;
      reasons.push(termScore.reason);
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

  const ranked = chunks
    .map((chunk) => scoreChunk(chunk, terms, category))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      const aNum = Number(a.chunk.article_number ?? "999999");
      const bNum = Number(b.chunk.article_number ?? "999999");

      return aNum - bNum;
    });

  const deduped: RankedChunk[] = [];
  const seenArticleNumbers = new Set<string>();

  for (const item of ranked) {
    const articleNumber = item.chunk.article_number;
    const dedupeKey = articleNumber || item.chunk.chunk_id;

    if (seenArticleNumbers.has(dedupeKey)) continue;

    seenArticleNumbers.add(dedupeKey);
    deduped.push(item);

    if (deduped.length >= limit) break;
  }

  return deduped;
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
