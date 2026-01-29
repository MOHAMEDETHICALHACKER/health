
import { GoogleGenAI } from "@google/genai";
import { HealthRecord } from "../types";

export const analyzeHealthRecord = async (record: HealthRecord, query: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    You are Shield AI, a professional medical records analyst and healthcare navigator. 
    Analyze the provided health history: ${JSON.stringify(record)}.
    
    CRITICAL MISSION:
    Identify and suggest specific Indian Government Health Schemes (like Ayushman Bharat - PM-JAY, RSBY, state-specific schemes like CMCHIS in TN or Aarogyasri in Telangana) that the user might be eligible for based on their:
    - Age (${record.profile.age})
    - Diagnosed conditions (${record.problems.map(p => p.condition).join(', ')})
    - Surgical history
    
    Guidelines:
    1. DISCLAIMER: "I am Shield AI, a guidance assistant. I am not a substitute for professional medical advice or official government eligibility verification. Always consult with a designated health official."
    2. Suggest schemes for high-cost treatments or chronic conditions.
    3. Explain the basic benefits (e.g., "Provides cover up to ₹5 Lakhs per family per year").
    4. Provide actionable next steps (e.g., "Visit the nearest PM-JAY kiosk with your Aadhaar card").
    5. Check for drug-drug interactions between ${record.medications.map(m => m.name).join(', ')}.
    6. Mask sensitive IDs (like Aadhaar) in your response if you mention them.
    
    Context:
    Patient: ${record.profile.name}
    Health ID: ${record.profile.healthId}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: query,
      config: {
        systemInstruction,
        temperature: 0.6,
        thinkingConfig: { thinkingBudget: 8000 }
      },
    });

    return response.text || "I'm sorry, I couldn't process your request.";
  } catch (error) {
    console.error("Gemini AI error:", error);
    return "I encountered an error while analyzing your health data. Please try again later.";
  }
};
