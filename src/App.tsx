import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Scale,  Loader2, RotateCcw } from 'lucide-react';
import { ChatMessage, LegalAnswer } from './types';
import { routeMessage, extractFacts, generateAnswer } from './services/aiService';
import { LegalAnswerRenderer } from './components/LegalAnswerRenderer';
import { QuickActions } from './components/QuickActions';
import { cn } from './lib/utils';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleNewQuestion = () => {
    setMessages([]);
    setInput('');
    setIsLoading(false);
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return;
  
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Pipeline
      const route = await routeMessage(text);
      const facts = await extractFacts(text);
      const answer = await generateAnswer(text, facts, route);

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: answer.summary,
        answer,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      console.error('Pipeline error:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Извините, произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте еще раз.',
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Scale size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-800">AI-консультант</h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Семейное право РФ • v0.1</p>
          </div>
        </div>
        <button
        onClick={handleNewQuestion}
        className="px-4 py-2 text-sm font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:shadow-sm rounded-xl transition-all"
      >
        <RotateCcw size={16} />
        Новый вопрос
      </button>
      </header>

      {/* Chat Area */}
      <main 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6 max-w-md mx-auto animate-in fade-in zoom-in duration-700">
            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-2">
              <Bot size={40} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Разберем вашу ситуацию по семейному праву</h2>
            <p className="text-slate-500 leading-relaxed">
              Задайте вопрос или выберите тему ниже
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div 
            key={msg.id}
            className={cn(
              "flex flex-col max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300",
              msg.role === 'user' ? "items-end" : "items-start"
            )}
          >
            <div className={cn(
              "flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-widest",
              msg.role === 'user' ? "text-indigo-600" : "text-slate-400"
            )}>
              {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
              {msg.role === 'user' ? 'Вы' : 'Консультант'}
            </div>
            
            <div className={cn(
              "p-4 rounded-2xl shadow-sm leading-relaxed",
              msg.role === 'user' 
                ? "bg-indigo-600 text-white rounded-tr-none" 
                : "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
            )}>
              {msg.content}
            </div>

            {msg.answer && (
              <div className="mt-6 w-full">
                <LegalAnswerRenderer answer={msg.answer} />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col items-start max-w-3xl mx-auto animate-pulse">
            <div className="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <Bot size={12} />
              Анализирую ситуацию...
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-none flex items-center gap-3">
              <Loader2 size={18} className="animate-spin text-indigo-600" />
              <span className="text-sm text-slate-500">Ищу релевантные статьи закона...</span>
            </div>
          </div>
        )}
      </main>

      {/* Footer / Input */}
      <footer className="bg-white border-t border-slate-200 p-4 md:p-6 sticky bottom-0">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && <QuickActions onAction={handleSend} />}
          
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
            className="relative flex items-center"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Кратко опишите ситуацию (например: "развод с ребенком 5 лет")'
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-6 pr-16 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 placeholder:text-slate-400"
            />
            <button 
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all active:scale-90"
            >
              <Send size={20} />
            </button>
          </form>
          <p className="text-[10px] text-center text-slate-400 uppercase tracking-widest">
            ИИ может ошибаться. Всегда консультируйтесь с квалифицированным юристом.
          </p>
        </div>
      </footer>
    </div>
  );
}
