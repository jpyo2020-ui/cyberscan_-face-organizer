
import { GoogleGenAI, Type } from "@google/genai";

// Refactored to initialize inside each function as per guidelines for reliability and up-to-date key usage
export const analyzeFaceProfile = async (base64Image: string): Promise<string> => {
  // Always use the named parameter and direct process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Image.split(',')[1] || base64Image } },
        { text: "Analyze the face in this image. Provide a highly detailed visual description of the person's facial features (eye shape, nose structure, jawline, hair color, distinctive marks) that can be used to identify them in other photos. Output only the description." }
      ]
    }
  });
  // Access .text property directly as a string
  return response.text || "No description generated.";
};

export const checkFaceMatch = async (profileDescription: string, candidateBase64: string): Promise<{ match: boolean; confidence: number }> => {
  // Always use the named parameter and direct process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: candidateBase64.split(',')[1] || candidateBase64 } },
        { text: `Target Person Description: ${profileDescription}\n\nTask: Determine if the person in the provided image is the SAME person as described. Return a JSON object with 'match' (boolean) and 'confidence' (number 0-1).` }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          match: { type: Type.BOOLEAN },
          confidence: { type: Type.NUMBER }
        },
        required: ["match", "confidence"]
      }
    }
  });

  try {
    // Access .text property directly as a string
    return JSON.parse(response.text || '{"match": false, "confidence": 0}');
  } catch (e) {
    return { match: false, confidence: 0 };
  }
};
