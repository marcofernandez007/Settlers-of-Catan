
import { GoogleGenAI } from "@google/genai";
import { GameState } from "../types";

export const getStrategicAdvice = async (gameState: GameState): Promise<string> => {
  // Initialize AI with apiKey from process.env.API_KEY as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const player = gameState.players[gameState.currentPlayerIndex];
  const stateSummary = {
    player: player.name,
    resources: player.resources,
    phase: gameState.phase,
    victoryPoints: player.victoryPoints,
    opponents: gameState.players.filter(p => p.id !== player.id).map(p => ({
      name: p.name,
      victoryPoints: p.victoryPoints
    }))
  };

  try {
    // Generate content using gemini-3-flash-preview for general text tasks
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze the current game state and provide 3-4 concise strategic bullet points for the current player.
      
      Current Game State: ${JSON.stringify(stateSummary)}
      
      Focus on:
      1. Resource shortages and what to target.
      2. Expansion opportunities.
      3. Threat assessment of opponents.
      4. Advice on whether to save or spend.
      
      Keep it brief, tactical, and helpful.`,
      config: {
        systemInstruction: "You are a professional Settlers of Catan grandmaster.",
        temperature: 0.7,
      }
    });

    // Access .text property directly (not as a function)
    return response.text || "I'm contemplating the optimal move... Try again in a moment.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "The winds of Catan are silent right now. Focus on your longest road!";
  }
};
