export type Category = 
  | 'divorce' 
  | 'alimony' 
  | 'child_residence' 
  | 'child_contact' 
  | 'property_division' 
  | 'marriage_contract' 
  | 'paternity' 
  | 'urgent_safety' 
  | 'other';

export interface RouteInfo {
  category: Category;
  urgency: 'normal' | 'high' | 'urgent';
  need_more_facts: boolean;
  handoff_required: boolean;
  handoff_reason: string | null;
  confidence: number;
}

export interface UserFacts {
  marriage_registered: boolean | null;
  marriage_ended: boolean | null;
  children_present: boolean | null;
  children_count: number | null;
  children_ages: string | null;
  property_dispute: boolean | null;
  contract_present: boolean | null;
  court_in_progress: boolean | null;
  violence_risk: boolean | null;
  foreign_element: boolean | null;
  user_goal: string | null;
}

export interface LegalChunk {
  chunk_id: string;
  source_name: string;
  document_title: string;
  section?: string | null;
  chapter?: string | null;
  article_number?: string | null;
  article_title?: string | null;
  article: string;
  part?: string | null;
  topics: string[];
  keywords: string[];
  text: string;
  normalized_text?: string;
  source_pages?: number[];
  source_pdf?: string;
  hash?: string;
  quality_flags?: string[];
}

export interface LegalBasisItem {
  article: string;
  text: string;
  summary: string;
}

export interface LegalAnswer {
  category: Category;
  summary: string;
  facts_used: string[];
  missing_facts: string[];
  legal_basis: LegalBasisItem[];
  possible_actions: string[];
  documents_needed: string[];
  risk_flags: string[];
  urgency: 'normal' | 'high' | 'urgent';
  handoff_required: boolean;
  handoff_reason: string | null;
  disclaimer: string;
  retrieval_debug?: RetrievalDebug;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  answer?: LegalAnswer;
  timestamp: number;
}

export interface RetrievalDebugItem {
  article: string;
  score: number;
}

export interface RetrievalDebug {
  items: RetrievalDebugItem[];
}
