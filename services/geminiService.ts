
import { GoogleGenAI } from "@google/genai";
import { HealthRecord } from "../types";

export const analyzeHealthRecord = async (record: HealthRecord, query: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    You are August AI, a professional medical records assistant. 
    Analyze the provided health history for this user: ${JSON.stringify(record)}.
    
    Guidelines:
    1. Always include a disclaimer: "I am August AI, a guidance assistant. I am not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician."
    2. Deeply analyze the user's Blood Group (${record.profile.bloodGroup}), Allergies, and current Medications.
    3. Look for potential drug-drug interactions or conflicts between their conditions (e.g., "Severe" hypertension vs specific medications).
    4. Provide specific lifestyle advice (diet, exercise, sleep) tailored to their Age (${record.profile.age}) and Blood Group.
    5. Mention emergency readiness: Notice if they have an emergency contact (${record.profile.emergencyContact.name}).
    6. Be professional and empathetic. Mask sensitive IDs (Aadhaar).
    
    Context:
    Name: ${record.profile.name}
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
