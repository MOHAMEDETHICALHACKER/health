
import { GoogleGenAI, Type } from "@google/genai";
import { HealthRecord, MedicalProblem, GovernmentScheme, Reminder } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeHealthRecord = async (record: HealthRecord, query: string): Promise<string> => {
  const systemInstruction = `
    You are Shield AI, a professional medical records analyst and healthcare navigator. 
    Analyze the provided health history: ${JSON.stringify(record)}.
    
    CRITICAL MISSION:
    Identify and suggest specific Indian Government Health Schemes (like Ayushman Bharat - PM-JAY, RSBY, state-specific schemes like CMCHIS in TN or Aarogyasri in Telangana) that the user might be eligible for.
    
    Guidelines:
    1. DISCLAIMER: "I am Shield AI, a guidance assistant. I am not a substitute for professional medical advice or official government eligibility verification."
    2. Check for drug-drug interactions if medication data is present.
    3. Use the severity and status of conditions to prioritize advice. Severe/Present conditions need immediate scheme mapping.
    4. Mask sensitive IDs in your response.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: query,
      config: {
        systemInstruction,
        temperature: 0.6,
        thinkingConfig: { thinkingBudget: 4000 }
      },
    });

    return response.text || "I'm sorry, I couldn't process your request.";
  } catch (error) {
    console.error("Gemini AI error:", error);
    return "I encountered an error while analyzing your health data.";
  }
};

export const findApplicableSchemes = async (problem: MedicalProblem | null, userAge: number): Promise<GovernmentScheme[]> => {
  const searchPrompt = problem 
    ? `Find specific Central and State-specific Indian Government health schemes (e.g. PM-JAY, Swasthya Sathi, CMCHIS) applicable to:
       Condition: "${problem.condition}"
       Severity: "${problem.severity}"
       Status: "${problem.status}"
       Patient Age: ${userAge}`
    : `Find a comprehensive list of major general Indian Government Health Schemes (e.g., Ayushman Bharat PM-JAY, National Health Mission, Jan Aushadhi, Rashtriya Swasthya Bima Yojana) available to citizens of all ages.`;

  try {
    const searchResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: searchPrompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const infoText = searchResponse.text;
    const groundingChunks = searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = groundingChunks
      ? groundingChunks
          .filter((chunk: any) => chunk.web)
          .map((chunk: any) => ({
            title: chunk.web.title,
            uri: chunk.web.uri
          }))
      : [];

    const parsePrompt = `
      Convert the following information into a JSON array of GovernmentScheme objects.
      Information: ${infoText}
      
      Required schema for each object:
      {
        "id": "unique-id",
        "name": "Scheme Name",
        "benefits": "Description of coverage (cashless, insurance, medicines, etc.)",
        "coverageAmount": "e.g., ₹5 Lakhs per family",
        "eligibility": "Clear criteria (income, age, occupation)",
        "matchReason": "Why this is relevant to the user",
        "applicationSteps": ["Step 1", "Step 2"],
        "requiredDocuments": ["Doc 1", "Doc 2"]
      }
    `;

    const parseResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: parsePrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              benefits: { type: Type.STRING },
              coverageAmount: { type: Type.STRING },
              eligibility: { type: Type.STRING },
              matchReason: { type: Type.STRING },
              applicationSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
              requiredDocuments: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["id", "name", "benefits", "eligibility", "coverageAmount", "matchReason"]
          }
        }
      }
    });

    const schemes: any[] = JSON.parse(parseResponse.text || "[]");
    return schemes.map(s => ({
      ...s,
      officialSources: sources.slice(0, 3)
    }));
  } catch (error) {
    console.error("Scheme identification failed:", error);
    return [];
  }
};
