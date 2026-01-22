/**
 * OpenRouter Service
 *
 * Simple wrapper for making LLM calls via OpenRouter or OpenAI.
 * Used by ComplianceSpecAIService for natural language command parsing.
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class OpenRouterService {
  private apiKey: string | undefined;
  private apiUrl: string;
  private defaultModel: string;
  private isOpenAI: boolean;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    this.isOpenAI = !!process.env.OPENAI_API_KEY;
    this.apiUrl = this.isOpenAI ? OPENAI_API_URL : OPENROUTER_API_URL;
    this.defaultModel = process.env.AGENT_MODEL || (this.isOpenAI ? 'gpt-4o' : 'openai/gpt-4o');
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Make a chat completion request
   */
  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.apiKey) {
      throw new Error('No API key configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY.');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };

    // OpenRouter-specific headers
    if (!this.isOpenAI) {
      headers['HTTP-Referer'] = process.env.APP_URL || 'http://localhost:3001';
      headers['X-Title'] = 'Dispotree Compliance AI';
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: request.model || this.defaultModel,
        messages: request.messages,
        temperature: request.temperature ?? 0.3,
        max_tokens: request.max_tokens ?? 2000,
        response_format: request.response_format,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Simple completion helper - returns just the text content
   */
  async complete(
    systemPrompt: string,
    userPrompt: string,
    options: { model?: string; temperature?: number; json?: boolean } = {}
  ): Promise<string> {
    const response = await this.chat({
      model: options.model || this.defaultModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options.temperature,
      response_format: options.json ? { type: 'json_object' } : undefined,
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * Parse JSON from an LLM response, with error handling
   */
  async completeJson<T = any>(
    systemPrompt: string,
    userPrompt: string,
    options: { model?: string; temperature?: number } = {}
  ): Promise<T> {
    const content = await this.complete(systemPrompt, userPrompt, { ...options, json: true });

    try {
      return JSON.parse(content);
    } catch (error) {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error(`Failed to parse JSON from LLM response: ${content.substring(0, 200)}`);
    }
  }
}

export const openRouterService = new OpenRouterService();
