/**
 * Shared Type Definitions for Contact Manager
 */

export type ContactCategory = 'Family' | 'Friends' | 'Work' | 'Business' | 'Other';

export interface Contact {
  id: string;
  userId: string;
  fullName: string;
  mobileNumber: string;
  emailAddress: string;
  profilePhoto?: string; // base64 encoded or placeholder image URL
  companyName?: string;
  address?: string;
  notes?: string;
  category: ContactCategory;
  isFavorite: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface DashboardStats {
  totalContacts: number;
  favoriteContacts: number;
  recentContacts: Contact[];
  categoryDistribution: Record<ContactCategory, number>;
  monthlyGrowth: { month: string; count: number }[];
  tagCloud: { text: string; value: number }[];
}

export interface DuplicateSuggestion {
  contactA: Contact;
  contactB: Contact;
  score: number; // 0 to 100 percentage match
  reason: string; // e.g. "Names match exactly, emails are similar"
  fieldsMatched: string[]; // e.g. ["fullName", "emailAddress"]
}

export interface SmartCategorizationResponse {
  suggestedCategory: ContactCategory;
  confidence: number; // 0 to 1
  reasoning: string;
}

export interface NaturalSearchResponse {
  hasFilters: boolean;
  searchFilter: {
    query?: string;
    category?: ContactCategory | 'all';
    isFavorite?: boolean;
    companyName?: string;
    tags?: string[];
  };
  explanation: string;
}
