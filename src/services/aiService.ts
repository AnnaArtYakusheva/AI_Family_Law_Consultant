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

Твоя задача — дать КРАТКИЙ и ЧЕТКИЙ ответ, как юрист объясняет коллеге.

СТИЛЬ:
- короткие предложения;
- без канцелярита;
- без вводных фраз;
- только суть;
- не более 3–4 предложений.

ФОРМАТ ОТВЕТА:
Каждое предложение = "условие — действие".

Пиши 2–4 строки.
Каждая строка начинается с условия.

Примеры:
В браке — ...
Вне брака — ...
Оспаривание — ...

ОГРАНИЧЕНИЯ:
- используй ТОЛЬКО нормы из контекста;
- не придумывай нормы;
- если норм нет — скажи, что нужно уточнение.

ВАЖНО ДЛЯ missing_facts:
- не возвращай технические названия полей;
- missing_facts должен быть массивом понятных вопросов на русском языке, а не массивом названий полей;
- не пиши marriage_registered, children_present, children_count и т.п.;
- формулируй как вопросы на русском языке для юриста.

Примеры:
Вместо "marriage_registered" → "Состоит ли пользователь в зарегистрированном браке?"
Вместо "children_present" → "Есть ли общие несовершеннолетние дети?"
Вместо "property_dispute" → "Есть ли спор о разделе имущества?"

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
    legal_basis: legalBasisFromRetrieval,
    retrieval_debug: retrievalDebug,
  };
}
