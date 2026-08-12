import { Category, LegalAnswer, RouteInfo, UserFacts, LegalChunk } from "../types";
import legalChunksData from "../lib/chunks_clean.json";
import { retrieveRelevantChunks, buildLegalContext, type RankedChunk } from "../lib/retrieval_v0";

const API_URL =
  import.meta.env.VITE_API_URL;

if (!API_URL) {
  throw new Error("VITE_API_URL is not set");
}
function apiPath(path: string) {
  return `${API_URL.replace(/\/$/, "")}${path}`;
}

const legalChunks: LegalChunk[] = legalChunksData as LegalChunk[];
const LEGAL_DISCLAIMER =
  "Ответ носит информационный характер и основан на предоставленных данных. Для оценки конкретной ситуации и документов рекомендуется консультация юриста.";

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function callBackendLLM<T>(prompt: string): Promise<T> {
  const response = await fetch(apiPath(`/api/llm`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      responseFormat: "json",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Backend LLM request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  const rawText = data.text;

  if (!rawText) {
    throw new Error("Backend LLM response does not contain text");
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error(`Failed to parse LLM JSON response: ${rawText}`);
  }
}

export async function routeMessage(message: string): Promise<RouteInfo> {
  const prompt = `
Определи категорию и срочность запроса по семейному праву РФ.

Верни только JSON без markdown.

Схема:
{
  "category": "divorce" | "alimony" | "child_residence" | "child_contact" | "property_division" | "marriage_contract" | "paternity" | "urgent_safety" | "other",
  "urgency": "normal" | "high" | "urgent",
  "need_more_facts": boolean,
  "handoff_required": boolean,
  "handoff_reason": string | null,
  "confidence": number
}

Запрос пользователя:
"${message}"
`;

  return callBackendLLM<RouteInfo>(prompt);
}

export async function extractFacts(message: string): Promise<UserFacts> {
  const prompt = `
Извлеки юридически значимые факты из сообщения по семейному праву РФ.

Верни только JSON без markdown.

Схема:
{
  "marriage_registered": boolean | null,
  "marriage_ended": boolean | null,
  "children_present": boolean | null,
  "children_count": number | null,
  "children_ages": string | null,
  "property_dispute": boolean | null,
  "contract_present": boolean | null,
  "court_in_progress": boolean | null,
  "violence_risk": boolean | null,
  "foreign_element": boolean | null,
  "user_goal": string | null
}

Сообщение:
"${message}"
`;

  return callBackendLLM<UserFacts>(prompt);
}

async function summarizeLegalBasis(
  ranked: RankedChunk[]
): Promise<{ article: string; text: string; summary: string }[]> {
  if (ranked.length === 0) return [];

  const sourceItems = ranked.slice(0, 4).map((r) => ({
    article: r.chunk.article,
    text: r.chunk.text,
  }));

  type LegalBasisSummaryItem = { article: string; summary: string };
  type LegalBasisSummaryResponse =
    | LegalBasisSummaryItem[]
    | { articles?: LegalBasisSummaryItem[] };

  const prompt = `
Ты помогаешь упростить юридические нормы для интерфейса AI-консультанта по семейному праву РФ.

Для каждой статьи:
- не меняй смысл;
- не придумывай ничего сверх текста;
- сформулируй краткое объяснение простым русским языком;
- максимум 1-2 предложения на статью;
- не давай советов, только кратко объясни смысл нормы.

Верни только JSON-объект без markdown.

Формат:
{
  "articles": [
    {
      "article": "Статья ...",
      "summary": "Короткое понятное объяснение"
    }
  ]
}

Статьи:
${JSON.stringify(sourceItems, null, 2)}
`;

  const parsed = await callBackendLLM<LegalBasisSummaryResponse>(prompt);
  const items = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.articles)
      ? parsed.articles
      : [];

  return sourceItems.map((item) => {
    const found = items.find((p) => p.article === item.article);

    return {
      article: item.article,
      text: item.text,
      summary: found?.summary || item.text.slice(0, 220),
    };
  });
}

export async function generateAnswer(
  message: string,
  facts: UserFacts,
  route: RouteInfo
): Promise<LegalAnswer> {
  const ranked: RankedChunk[] = retrieveRelevantChunks(
    legalChunks,
    message,
    route.category as Category,
    5
  );

  const retrievalDebug = {
    items: ranked.map((r) => ({
      article: r.chunk.article,
      score: r.score,
    })),
  };

  console.log(
    "RAG DEBUG:",
    ranked.map((r) => ({
      article: r.chunk.article,
      score: r.score,
      reasons: r.reasons,
    }))
  );

  const legalContext =
    ranked.length > 0
      ? buildLegalContext(ranked)
      : "Нет точных норм. Требуется уточнение фактов.";

  const legalBasisFromRetrieval = await summarizeLegalBasis(ranked);

  const prompt = `
Ты — AI-консультант по семейному праву РФ.

Твоя задача — дать краткий, понятный и юридически осторожный ответ.

СТИЛЬ:
- короткие предложения;
- без канцелярита;
- без вводных фраз;
- только суть;
- сохраняй необходимые условия и оговорки;
- юридическая корректность важнее предельной краткости.

ФОРМАТ ОТВЕТА:
Каждая ключевая строка = "условие — вывод/действие".
Пиши кратко, но ответь на все существенные части вопроса пользователя.

Примеры:
В браке — ...
Вне брака — ...
Оспаривание — ...

ЮРИДИЧЕСКАЯ НАДЕЖНОСТЬ:
- используй ТОЛЬКО нормы из контекста;
- не придумывай нормы;
- не делай юридический вывод, если он не следует из контекста;
- если вывод зависит от обстоятельств — пиши условно: "если", "при условии", "зависит от", "нужно установить";
- если часть вопроса не покрыта контекстом — прямо скажи, что для этой части недостаточно переданных правовых оснований, и добавь нужное уточнение в missing_facts;
- не считай обязательство общим, личным, делимым или распределяемым автоматически только потому, что оно возникло во время брака;
- если вопрос состоит из нескольких частей, выдели каждую существенную часть и не пропускай ни одну.

ВАЖНО ДЛЯ ОБЯЗАТЕЛЬСТВ И ДОЛГОВ:
- различай норму закона и квалификацию конкретного обязательства;
- можно написать норму из контекста: "по общим обязательствам взыскание может обращаться на общее имущество";
- нельзя без достаточных фактов писать: "этот долг является общим", "долг делится", "долг подлежит распределению";
- если контекст различает обязательство одного супруга и общее обязательство супругов, не выбирай один режим самостоятельно;
- сам факт брака, кредита, ипотеки или покупки имущества в браке не доказывает режим конкретного обязательства, если контекст не говорит, что этого достаточно;
- если статус обязательства не установлен, в summary и possible_actions используй условные формулировки и добавь в missing_facts только нужные для квалификации вопросы;
- не используй внутренние знания модели, чтобы заполнить пробел в retrieved context.

ВАЖНО ДЛЯ facts_used:
- включай только фактические обстоятельства из сообщения пользователя или из блока ФАКТЫ;
- не включай нормы закона, юридические выводы, предположения или рекомендации.

ВАЖНО ДЛЯ missing_facts:
- не возвращай технические названия полей;
- missing_facts должен быть массивом понятных вопросов на русском языке, а не массивом названий полей;
- не пиши marriage_registered, children_present, children_count и т.п.;
- формулируй как вопросы на русском языке для юриста.
- включай только обстоятельства, которые действительно могут изменить вывод или нужны для применения нормы;
- не превращай missing_facts в общий опросник.

Примеры:
Вместо "marriage_registered" → "Состоит ли пользователь в зарегистрированном браке?"
Вместо "children_present" → "Есть ли общие несовершеннолетние дети?"
Вместо "property_dispute" → "Есть ли спор о разделе имущества?"

ВАЖНО ДЛЯ possible_actions:
- каждое действие должно относиться к вопросу пользователя;
- каждое действие должно опираться на контекст закона или быть сформулировано условно;
- не выдавай спорный юридический результат как готовое действие;
- не предлагай безусловно требовать раздела или распределения долга, если режим обязательства не установлен.

ВАЖНО ДЛЯ documents_needed:
- перечисляй только документы, практически связанные с этой ситуацией, missing_facts или possible_actions;
- не создавай общий юридический checklist.

ВАЖНО ДЛЯ risk_flags:
- указывай только обстоятельства, которые могут существенно изменить правовой вывод, усложнить ситуацию или создать юридический риск;
- не повторяй обычные уточнения из missing_facts;
- поле может быть пустым.

ВАЖНО ДЛЯ legal_basis, category, urgency, handoff и disclaimer:
- legal_basis заполняется системой из найденных норм, не придумывай и не расширяй его;
- category, urgency, handoff_required, handoff_reason и disclaimer будут установлены системой;
- в JSON верни эти поля в совместимом виде, но не полагайся на них для юридического вывода.

Верни только JSON без markdown.

Схема:
{
  "category": string,
  "summary": string,
  "facts_used": string[],
  "missing_facts": string[],
  "legal_basis": [
    {
      "article": string,
      "text": string
    }
  ],
  "possible_actions": string[],
  "documents_needed": string[],
  "risk_flags": string[],
  "urgency": string,
  "handoff_required": boolean,
  "handoff_reason": string | null,
  "disclaimer": string
}

КОНТЕКСТ ЗАКОНА:
${legalContext}

ЗАПРОС ПОЛЬЗОВАТЕЛЯ:
"${message}"

ФАКТЫ:
${JSON.stringify(facts, null, 2)}
`;

  const parsed = await callBackendLLM<LegalAnswer>(prompt);

  return {
    ...parsed,
    category: route.category,
    urgency: route.urgency,
    handoff_required: route.handoff_required,
    handoff_reason: route.handoff_reason,
    facts_used: normalizeStringArray(parsed.facts_used),
    missing_facts: normalizeStringArray(parsed.missing_facts),
    legal_basis: legalBasisFromRetrieval,
    possible_actions: normalizeStringArray(parsed.possible_actions),
    documents_needed: normalizeStringArray(parsed.documents_needed),
    risk_flags: normalizeStringArray(parsed.risk_flags),
    disclaimer: LEGAL_DISCLAIMER,
    retrieval_debug: retrievalDebug,
  };
}
