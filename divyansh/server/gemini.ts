import { GoogleGenAI, Type } from "@google/genai";
import { Contact, ContactCategory, DuplicateSuggestion, SmartCategorizationResponse, NaturalSearchResponse } from '../src/types';

// Safe lazy check for API Key before initializing
const getGeminiClient = (): GoogleGenAI | null => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not defined in environment variables. AI features will fallback to deterministic rules.");
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

const ai = getGeminiClient();

/**
 * 1. Smart Category Suggestion using Gemini
 */
export async function suggestCategorization(
  contact: Partial<Omit<Contact, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
): Promise<SmartCategorizationResponse> {
  const fallback: SmartCategorizationResponse = {
    suggestedCategory: 'Other',
    confidence: 0.5,
    reasoning: 'Fallback default category assigned because AI service is currently unavailable.'
  };

  if (!ai) return fallback;

  try {
    const prompt = `Analyze this contact profile and recommend the most suitable group category ('Family', 'Friends', 'Work', 'Business', 'Other').
    Name: ${contact.fullName || ''}
    Phone: ${contact.mobileNumber || ''}
    Email: ${contact.emailAddress || ''}
    Company: ${contact.companyName || ''}
    Address: ${contact.address || ''}
    Notes/Context: ${contact.notes || ''}
    Tags: ${(contact.tags || []).join(', ')}

    Examine clues like standard domain names (e.g., .gov, commercial domains), familiar names, company designations, or keywords in notes like "mom", "brother", "colleague", "partner", "manager".`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an intelligent contact assistant. Categorize contacts with extreme precision based on inputs.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedCategory: {
              type: Type.STRING,
              description: "Must be exactly one of: 'Family', 'Friends', 'Work', 'Business', 'Other'"
            },
            confidence: {
              type: Type.NUMBER,
              description: "Confidence level of suggested category between 0.0 and 1.0"
            },
            reasoning: {
              type: Type.STRING,
              description: "Brief clear explanation of why this category was chosen"
            }
          },
          required: ["suggestedCategory", "confidence", "reasoning"]
        }
      }
    });

    const text = response.text?.trim() || "";
    const result = JSON.parse(text) as SmartCategorizationResponse;
    
    // Ensure suggestedCategory matches valid category enum type
    const validCategories: ContactCategory[] = ['Family', 'Friends', 'Work', 'Business', 'Other'];
    if (!validCategories.includes(result.suggestedCategory)) {
      result.suggestedCategory = 'Other';
    }

    return result;
  } catch (err) {
    console.error("AI Categorization Suggestion error:", err);
    return fallback;
  }
}

/**
 * 2. AI-Powered Duplicate Contact Suggestions
 */
export async function detectDuplicates(contacts: Contact[]): Promise<DuplicateSuggestion[]> {
  if (contacts.length < 2) return [];

  // Deterministic local pre-checking or AI check.
  // To avoid token issues, we map contacts to a smaller dataset
  const targetData = contacts.map(c => ({
    id: c.id,
    fullName: c.fullName,
    mobileNumber: c.mobileNumber,
    emailAddress: c.emailAddress,
    companyName: c.companyName || ''
  }));

  if (!ai) {
    // Basic deterministic duplicate suggestions when Gemini is not available
    const suggestions: DuplicateSuggestion[] = [];
    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const cA = contacts[i];
        const cB = contacts[j];
        const nameMatch = cA.fullName.trim().toLowerCase() === cB.fullName.trim().toLowerCase();
        const emailMatch = cA.emailAddress && cB.emailAddress && cA.emailAddress.trim().toLowerCase() === cB.emailAddress.trim().toLowerCase();
        const phoneMatch = cA.mobileNumber && cB.mobileNumber && cA.mobileNumber.replace(/[^\d+]/g, '') === cB.mobileNumber.replace(/[^\d+]/g, '');

        if (nameMatch || emailMatch || phoneMatch) {
          const matchedFields: string[] = [];
          if (nameMatch) matchedFields.push('fullName');
          if (emailMatch) matchedFields.push('emailAddress');
          if (phoneMatch) matchedFields.push('mobileNumber');

          suggestions.push({
            contactA: cA,
            contactB: cB,
            score: matchedFields.length === 3 ? 95 : matchedFields.length === 2 ? 80 : 60,
            reason: `Local rule matched duplicate fields: ${matchedFields.join(', ')}`,
            fieldsMatched: matchedFields
          });
        }
      }
    }
    return suggestions.slice(0, 10); // cap at 10 items
  }

  try {
    const prompt = `Identify duplicate contacts from this list. A duplicate is when two entries are highly likely to represent the same individual, either due to identical names, spelling variations, identical emails, or identical phone numbers.
    Contacts list:
    ${JSON.stringify(targetData, null, 2)}
    
    Analyze and output a list of pairings with match scores (60-100), logical reasons, and fields matched.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are a data deduplication agent. Detect duplicate items of the same actual contact.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              idA: { type: Type.STRING },
              idB: { type: Type.STRING },
              score: { type: Type.INTEGER, description: "Confidence match score out of 100" },
              reason: { type: Type.STRING, description: "Brief clear reason explaining why they match" },
              fieldsMatched: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of fields matching, e.g. ['fullName', 'emailAddress', 'mobileNumber']"
              }
            },
            required: ["idA", "idB", "score", "reason", "fieldsMatched"]
          }
        }
      }
    });

    const parsedResults = JSON.parse(response.text?.trim() || "[]") as Array<{
      idA: string;
      idB: string;
      score: number;
      reason: string;
      fieldsMatched: string[];
    }>;

    const duplicates: DuplicateSuggestion[] = [];
    
    for (const raw of parsedResults) {
      const cA = contacts.find(c => c.id === raw.idA);
      const cB = contacts.find(c => c.id === raw.idB);
      if (cA && cB) {
        duplicates.push({
          contactA: cA,
          contactB: cB,
          score: raw.score,
          reason: raw.reason,
          fieldsMatched: raw.fieldsMatched
        });
      }
    }

    return duplicates;
  } catch (err) {
    console.error("AI Duplicate Detection error:", err);
    return [];
  }
}

/**
 * 3. AI-Powered Natural Language Search Query Parsing
 */
export async function parseNaturalSearch(phrase: string): Promise<NaturalSearchResponse> {
  const fallback: NaturalSearchResponse = {
    hasFilters: false,
    searchFilter: {},
    explanation: "Default fallback: Phrase search performed literally because AI parser service is currently offline."
  };

  if (!ai) {
    // basic offline regex parser
    const lower = phrase.toLowerCase();
    const filter: Record<string, any> = {};

    let matchedCategory: ContactCategory | undefined;
    if (lower.includes('work') || lower.includes('job') || lower.includes('colleague')) matchedCategory = 'Work';
    else if (lower.includes('family') || lower.includes('relative') || lower.includes('home')) matchedCategory = 'Family';
    else if (lower.includes('friend') || lower.includes('buddy') || lower.includes('social')) matchedCategory = 'Friends';
    else if (lower.includes('business') || lower.includes('client') || lower.includes('vendor')) matchedCategory = 'Business';
    else if (lower.includes('other')) matchedCategory = 'Other';

    if (matchedCategory) {
      filter.category = matchedCategory;
    }

    if (lower.includes('favorite') || lower.includes('starred') || lower.includes('liked')) {
      filter.isFavorite = true;
    }

    // search keyword extractor (anything after 'find', 'search for', 'show')
    let queryVal = '';
    const queryMatch = phrase.match(/(?:find|search for|show|named|about)\s+([a-zA-Z0-9_\-\s.]+)/i);
    if (queryMatch && queryMatch[1]) {
      queryVal = queryMatch[1].trim();
      // clean up some common filter flags from query Val
      queryVal = queryVal.replace(/(?:contacts|work|family|friend|favorites|business|other)/gi, '').trim();
    } else {
      queryVal = phrase; // search whole phrase
    }

    if (queryVal) {
      filter.query = queryVal;
    }

    return {
      hasFilters: Object.keys(filter).length > 0,
      searchFilter: filter,
      explanation: `Deterministic parsing matched parameters: ${JSON.stringify(filter)}`
    };
  }

  try {
    const prompt = `Parse this user natural search prompt and transform it into a structured filter pattern for contacts.
    Prompt: "${phrase}"`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: `You are an expert search parsing engine. Extract filter values from a string phrase.
        Possible filter fields:
        - query: literal search keyword for name/phone/email
        - category: exact match string ('Family', 'Friends', 'Work', 'Business', 'Other', 'all')
        - isFavorite: boolean (true if user mentioned favorite/favorites)
        - companyName: string of company if mentioned, search for 'from <company>' or '<company> company'
        - tags: array of strings if specific labels/tags are referenced (e.g., 'vip', 'tech', 'relative')`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hasFilters: { type: Type.BOOLEAN },
            searchFilter: {
              type: Type.OBJECT,
              properties: {
                query: { type: Type.STRING },
                category: {
                  type: Type.STRING,
                  description: "Must be exactly: 'Family', 'Friends', 'Work', 'Business', 'Other' or 'all'"
                },
                isFavorite: { type: Type.BOOLEAN },
                companyName: { type: Type.STRING },
                tags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              }
            },
            explanation: {
              type: Type.STRING,
              description: "Friendly description of what filter parameters were found (e.g., 'Searching for contacts in the Work category from Apple company')"
            }
          },
          required: ["hasFilters", "searchFilter", "explanation"]
        }
      }
    });

    const text = response.text?.trim() || "";
    return JSON.parse(text) as NaturalSearchResponse;
  } catch (err) {
    console.error("AI Natural Search parser error:", err);
    return fallback;
  }
}
