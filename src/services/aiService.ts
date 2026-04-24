import { GoogleGenAI, Type } from "@google/genai";
import { Category, LegalAnswer, RouteInfo, UserFacts, LegalChunk } from "../types";
import legalChunksData from "../lib/chunks_clean.json";
import { retrieveRelevantChunks, buildLegalContext, type RankedChunk } from "../lib/retrieval_v0";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please set it in the Secrets panel.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

const modelName = "gemini-3-flash-preview";
const legalChunks: LegalChunk[] = legalChunksData as LegalChunk[];

export async function routeMessage(message: string): Promise<RouteInfo> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        parts: [
          {
            text: `Определи категорию и срочность запроса по семейному праву РФ: "${message}"`
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          category: {
            type: Type.STRING,
            enum: [
              "divorce",
              "alimony",
              "child_residence",
              "child_contact",
              "property_division",
              "marriage_contract",
              "paternity",
              "urgent_safety",
              "other"
            ]
          },
          urgency: {
            type: Type.STRING,
            enum: ["normal", "high", "urgent"]
          },
          need_more_facts: { type: Type.BOOLEAN },
          handoff_required: { type: Type.BOOLEAN },
          handoff_reason: { type: Type.STRING, nullable: true },
          confidence: { type: Type.NUMBER }
        },
        required: [
          "category",
          "urgency",
          "need_more_facts",
          "handoff_required",
          "confidence"
        ]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function extractFacts(message: string): Promise<UserFacts> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        parts: [
          {
            text: `Извлеки юридически значимые факты из сообщения: "${message}"`
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          marriage_registered: { type: Type.BOOLEAN, nullable: true },
          marriage_ended: { type: Type.BOOLEAN, nullable: true },
          children_present: { type: Type.BOOLEAN, nullable: true },
          children_count: { type: Type.INTEGER, nullable: true },
          children_ages: { type: Type.STRING, nullable: true },
          property_dispute: { type: Type.BOOLEAN, nullable: true },
          contract_present: { type: Type.BOOLEAN, nullable: true },
          court_in_progress: { type: Type.BOOLEAN, nullable: true },
          violence_risk: { type: Type.BOOLEAN, nullable: true },
          foreign_element: { type: Type.BOOLEAN, nullable: true },
          user_goal: { type: Type.STRING, nullable: true }
        }
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

async function summarizeLegalBasis(
  ranked: RankedChunk[]
): Promise<{ article: string; text: string; summary: string }[]> {
  if (ranked.length === 0) return [];

  const sourceItems = ranked.slice(0, 4).map((r) => ({
    article: r.chunk.article,
    text: r.chunk.text
  }));

  const prompt = `
Ты помогаешь упростить юридические нормы для интерфейса AI-консультанта по семейному праву РФ.

Ниже даны статьи закона. Для каждой статьи:
- не меняй смысл;
- не придумывай ничего сверх текста;
- сформулируй краткое объяснение простым русским языком;
- максимум 1-2 предложения на статью;
- не давай советов, только кратко объясни смысл нормы.

Верни JSON-массив объектов:
[
  {
    "article": "Статья ...",
    "summary": "Короткое понятное объяснение"
  }
]

Статьи:
${JSON.stringify(sourceItems, null, 2)}
`;
  const ai = getAI();

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            article: { type: Type.STRING },
            summary: { type: Type.STRING }
          },
          required: ["article", "summary"]
        }
      }
    }
  });

  const parsed = JSON.parse(response.text || "[]") as {
    article: string;
    summary: string;
  }[];

  return sourceItems.map((item) => {
    const found = parsed.find((p) => p.article === item.article);

    return {
      article: item.article,
      text: item.text,
      summary: found?.summary || item.text.slice(0, 220)
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
    score: r.score
  }))
};

  console.log(
  "RAG DEBUG:",
  ranked.map(r => ({
    article: r.chunk.article,
    score: r.score,
    reasons: r.reasons
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
- короткие предложения
- без канцелярита (не писать "осуществляется", "допускается", "в соответствии")
- без вводных фраз
- только суть
- не более 3–4 предложений

ФОРМАТ ОТВЕТА:
Каждое предложение = "условие — действие".

Пиши 2–4 строки.
Каждая строка начинается с условия.

Примеры:
В браке — ...
Вне брака — ...
Оспаривание — ...

ОГРАНИЧЕНИЯ:
- используй ТОЛЬКО нормы из контекста
- не придумывай нормы
- если норм нет — скажи, что нужно уточнение

КОНТЕКСТ ЗАКОНА:
${legalContext}

ЗАПРОС ПОЛЬЗОВАТЕЛЯ:
"${message}"

ФАКТЫ:
${JSON.stringify(facts, null, 2)}

Сформируй ответ и верни JSON.
`;

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          summary: { type: Type.STRING, description: "Краткий ответ 2-4 предложения без канцелярита"},
          facts_used: { type: Type.ARRAY, items: { type: Type.STRING } },
          missing_facts: { type: Type.ARRAY, items: { type: Type.STRING } },
          legal_basis: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                article: { type: Type.STRING },
                text: { type: Type.STRING }
              }
            }
          },
          possible_actions: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          documents_needed: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          risk_flags: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          urgency: { type: Type.STRING },
          handoff_required: { type: Type.BOOLEAN },
          handoff_reason: { type: Type.STRING, nullable: true },
          disclaimer: { type: Type.STRING }
        },
        required: [
          "category",
          "summary",
          "possible_actions",
          "disclaimer"
        ]
      }
    }
  });

  const parsed = JSON.parse(response.text || "{}");

  return {
    ...parsed,
    legal_basis: legalBasisFromRetrieval,
    retrieval_debug: retrievalDebug
  };
}
