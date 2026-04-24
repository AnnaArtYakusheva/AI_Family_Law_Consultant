import React, { useState } from 'react';
import { LegalAnswer } from '../types';
import {
  AlertTriangle,
  FileText,
  HelpCircle,
  Scale,
  CheckCircle2,
  PhoneCall
} from 'lucide-react';

interface LegalAnswerRendererProps {
  answer: LegalAnswer;
}

export const LegalAnswerRenderer: React.FC<LegalAnswerRendererProps> = ({ answer }) => {
  const [showDebug, setShowDebug] = useState(false);
  const [expandedArticles, setExpandedArticles] = useState<Record<number, boolean>>({});
  const isDev = import.meta.env.DEV;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Legal Basis */}
      <section className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-2 mb-3 text-slate-500">
          <Scale size={18} />
          <h3 className="text-xs font-bold uppercase tracking-wider">Что говорит закон</h3>
        </div>

        <div className="space-y-3">
          {answer.legal_basis.map((item, idx) => {
            const expanded = !!expandedArticles[idx];

            return (
              <div
                key={idx}
                className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm"
              >
                <span className="text-xs font-bold text-indigo-600 block mb-2">
                  {item.article}
                </span>

                <p className="text-sm text-slate-700 leading-relaxed">
                  {item.summary}
                </p>

                {item.text && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedArticles((prev) => ({
                          ...prev,
                          [idx]: !prev[idx]
                        }))
                      }
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      {expanded ? 'Скрыть полный текст' : 'Показать полный текст'}
                    </button>

                    {expanded && (
                      <p className="mt-2 text-sm text-slate-600 italic leading-relaxed">
                        "{item.text}"
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Missing Facts */}
      {answer.missing_facts.length > 0 && (
        <section className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
          <div className="flex items-center gap-2 mb-2 text-amber-600">
            <HelpCircle size={18} />
            <h3 className="text-xs font-bold uppercase tracking-wider">Важно уточнить</h3>
          </div>
          <ul className="list-disc list-inside text-sm text-amber-800 space-y-1">
            {answer.missing_facts.map((fact, idx) => (
              <li key={idx}>{fact}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Documents */}
      {answer.documents_needed.length > 0 && (
        <section className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
          <div className="flex items-center gap-2 mb-2 text-indigo-600">
            <FileText size={18} />
            <h3 className="text-xs font-bold uppercase tracking-wider">Какие документы понадобятся</h3>
          </div>
          <ul className="list-disc list-inside text-sm text-indigo-800 space-y-1">
            {answer.documents_needed.map((doc, idx) => (
              <li key={idx}>{doc}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Actions */}
      <section className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
        <div className="flex items-center gap-2 mb-2 text-emerald-600">
          <CheckCircle2 size={18} />
          <h3 className="text-xs font-bold uppercase tracking-wider">Возможные действия</h3>
        </div>
        <ul className="list-disc list-inside text-sm text-emerald-800 space-y-1">
          {answer.possible_actions.map((action, idx) => (
            <li key={idx}>{action}</li>
          ))}
        </ul>
      </section>

      {/* Risks */}
      {answer.risk_flags.length > 0 && (
        <section className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
          <div className="flex items-center gap-2 mb-2 text-rose-600">
            <AlertTriangle size={18} />
            <h3 className="text-xs font-bold uppercase tracking-wider">Риски</h3>
          </div>
          <ul className="list-disc list-inside text-sm text-rose-800 space-y-1">
            {answer.risk_flags.map((risk, idx) => (
              <li key={idx}>{risk}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Handoff */}
      {answer.handoff_required && (
        <div className="pt-4">
          <button
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]"
            onClick={() => window.alert('Передаем ваш запрос юристу...')}
          >
            <PhoneCall size={20} />
            Связаться с юристом
          </button>
          <p className="text-[10px] text-center text-slate-400 mt-2 uppercase tracking-widest">
            {answer.handoff_reason || 'Требуется экспертная оценка'}
          </p>
        </div>
      )}

      {/* Debug toggle */}
      {isDev && answer.retrieval_debug?.items?.length ? (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowDebug((v) => !v)}
            className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
          >
            {showDebug ? 'Скрыть журнал' : 'Показать релевантные статьи'}
          </button>
        </div>
      ) : null}

      {/* Debug panel */}
      {isDev && showDebug && answer.retrieval_debug?.items?.length ? (
        <section className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-2 mb-3 text-slate-300">
            <Scale size={18} />
            <h3 className="text-xs font-bold uppercase tracking-wider">Debug RAG</h3>
          </div>

          <div className="space-y-2">
            {answer.retrieval_debug.items.map((item, idx) => (
              <div
                key={`${item.article}-${idx}`}
                className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-3"
              >
                <div className="text-sm font-semibold text-slate-100">
                  {item.article}
                </div>
                <div className="text-xs text-slate-400 whitespace-nowrap">
                  score: {item.score}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Disclaimer */}
      <div className="text-[10px] text-slate-400 italic text-center px-4">
        {answer.disclaimer}
      </div>
    </div>
  );
};