import React from 'react';
import { Category } from '../types';
import { Heart, Users, Home, FileSignature, ShieldAlert, Baby, Gavel } from 'lucide-react';

interface QuickActionsProps {
  onAction: (text: string) => void;
}

const actions = [
  { label: 'Развод', icon: Heart, text: 'Как оформить развод?' },
  { label: 'Алименты', icon: Users, text: 'Как подать на алименты?' },
  { label: 'Дети', icon: Baby, text: 'С кем останутся дети после развода?' },
  { label: 'Имущество', icon: Home, text: 'Как делится имущество при разводе?' },
  { label: 'Брачный договор', icon: FileSignature, text: 'Зачем нужен брачный договор?' },
  { label: 'Отцовство', icon: Gavel, text: 'Как установить или оспорить отцовство?' },
  { label: 'Срочно', icon: ShieldAlert, text: 'Срочная ситуация, угроза безопасности', color: 'text-rose-500' },
];

export const QuickActions: React.FC<QuickActionsProps> = ({ onAction }) => {
  return (
    <div className="flex flex-wrap gap-2 p-4 overflow-x-auto no-scrollbar">
      {actions.map((action, idx) => (
        <button
          key={idx}
          onClick={() => onAction(action.text)}
          className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-full text-sm font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 transition-all whitespace-nowrap shadow-sm active:scale-95"
        >
          <action.icon size={16} className={action.color || 'text-indigo-500'} />
          {action.label}
        </button>
      ))}
    </div>
  );
};
