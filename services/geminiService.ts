import { GoogleGenAI } from "@google/genai";
import { GameStats } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateMissionDebrief = async (stats: GameStats): Promise<string> => {
  try {
    const prompt = `
      You are Commander "Iron Hawk", a grizzled veteran pilot giving a post-mission debrief to a rookie pilot.
      The pilot just finished a sortie in the "Garuda Strike" simulation.
      
      Mission Stats:
      - Score: ${stats.score}
      - Enemies Destroyed: ${stats.enemiesDestroyed}
      - Wave Reached: ${stats.wave}
      
      If the score is low (< 1000), be harsh and sarcastic. Tell them to go back to flight school.
      If the score is medium (1000-5000), be encouraging but point out they need to focus.
      If the score is high (> 5000), be impressed but warn them not to get cocky.
      
      Keep the response short (max 2 sentences). Use military sci-fi jargon.
      Output the response in Indonesian language (Bahasa Indonesia) to match the pilot's nationality.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "Commander is offline. Static detected.";
  } catch (error) {
    console.error("Gemini Mission Report Error:", error);
    return "Sistem komunikasi rusak. Kembali ke pangkalan segera.";
  }
};