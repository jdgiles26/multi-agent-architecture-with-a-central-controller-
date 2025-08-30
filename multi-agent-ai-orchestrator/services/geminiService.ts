
import { GoogleGenAI, Type } from "@google/genai";
import type { AutomationStep } from '../types';
import { StepAction } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const automationPlanSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      step: {
        type: Type.STRING,
        description: "A human-readable description of the action.",
      },
      action: {
        type: Type.STRING,
        enum: [StepAction.TYPE, StepAction.CLICK],
        description: "The type of browser action to perform.",
      },
      selector: {
        type: Type.STRING,
        description: "The CSS selector for the target element (e.g., '#username', '.btn-login').",
      },
      value: {
        type: Type.STRING,
        description: "The text value to type into an input field. Only for 'type' actions.",
      },
    },
    required: ["step", "action", "selector"],
  },
};

export async function generateAutomationPlan(goal: string): Promise<AutomationStep[]> {
  try {
    const prompt = `
      Based on the following user goal, generate a step-by-step browser automation plan in JSON format.
      The actions should be limited to 'type' and 'click'.
      The selectors must be valid CSS selectors.
      For a login form, use '#username' for the username field, '#password' for the password field, and '.btn-login' for the login button.

      Goal: "${goal}"
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: automationPlanSchema,
      },
    });

    const jsonText = response.text.trim();
    const plan = JSON.parse(jsonText) as AutomationStep[];
    return plan;
  } catch (error) {
    console.error("Error generating automation plan:", error);
    throw new Error("Failed to generate a valid automation plan from the AI. Please try a different goal.");
  }
}
