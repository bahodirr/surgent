// Claude Code SDK Message Types
export type SDKMessage =
  // An assistant message
  | {
      type: "assistant";
      message: {
        id: string;
        type: "message";
        role: "assistant";
        content: Array<{
          type: "text";
          text: string;
        }>;
        model: string;
        stop_reason: string | null;
        stop_sequence: string | null;
        usage: {
          input_tokens: number;
          output_tokens: number;
        };
      };
      session_id: string;
    }
  // A user message
  | {
      type: "user";
      message: {
        role: "user";
        content: string;
      };
      session_id: string;
    }
  // Success result message
  | {
      type: "result";
      subtype: "success";
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      num_turns: number;
      result: string;
      session_id: string;
      total_cost_usd: number;
    }
  // Error result message
  | {
      type: "result";
      subtype: "error_max_turns" | "error_during_execution";
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      num_turns: number;
      session_id: string;
      total_cost_usd: number;
    }
  // System init message
  | {
      type: "system";
      subtype: "init";
      apiKeySource: string;
      cwd: string;
      session_id: string;
      tools: string[];
      mcp_servers: Array<{
        name: string;
        status: string;
      }>;
      model: string;
      permissionMode: "default" | "acceptEdits" | "bypassPermissions" | "plan";
    };

export interface ClaudeClientOptions {
  baseUrl?: string;
}

export interface ClaudePromptOptions {
  sessionId?: string;
  flags?: {
    json?: boolean;
    maxTokens?: number;
    temperature?: number;
    model?: string;
  };
}

export interface ClaudeResponse {
  success: boolean;
  response?: string;
  error?: string;
  sessionId?: string;
}

export interface StreamCallbacks {
  onMessage?: (message: SDKMessage) => void;
  onAssistant?: (content: string, message: SDKMessage & { type: "assistant" }) => void;
  onUser?: (message: SDKMessage & { type: "user" }) => void;
  onInit?: (message: SDKMessage & { type: "system" }) => void;
  onResult?: (message: SDKMessage & { type: "result" }) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

export class ClaudeClient {
  private baseUrl: string;
  
  constructor(options: ClaudeClientOptions = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:4000';
  }
  
  streamPrompt(
    prompt: string,
    callbacks: StreamCallbacks,
    options?: ClaudePromptOptions
  ): EventSource {
    const params = new URLSearchParams({ prompt });
    
    if (options?.sessionId) {
      params.append('sessionId', options.sessionId);
    }
    
    if (options?.flags?.json) {
      params.append('json', 'true');
    }
    
    if (options?.flags?.maxTokens) {
      params.append('maxTokens', options.flags.maxTokens.toString());
    }
    
    if (options?.flags?.temperature) {
      params.append('temperature', options.flags.temperature.toString());
    }
    
    if (options?.flags?.model) {
      params.append('model', options.flags.model);
    }
    
    // Use Daytona endpoint
    const eventSource = new EventSource(
      `${this.baseUrl}/api/claude/daytona-stream?${params}`
    );
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle raw data from backend
        if (data.type === 'raw') {
          try {
            // Parse the Claude SDK message
            const sdkMessage: SDKMessage = JSON.parse(data.data);
            
            // Call the general message callback
            callbacks.onMessage?.(sdkMessage);
            
            // Handle specific message types
            switch (sdkMessage.type) {
              case 'system':
                if (sdkMessage.subtype === 'init') {
                  callbacks.onInit?.(sdkMessage);
                }
                break;
                
              case 'assistant':
                // Extract text content from assistant message
                const textContent = sdkMessage.message.content
                  .filter(block => block.type === 'text')
                  .map(block => block.text)
                  .join('');
                callbacks.onAssistant?.(textContent, sdkMessage);
                break;
                
              case 'user':
                callbacks.onUser?.(sdkMessage);
                break;
                
              case 'result':
                callbacks.onResult?.(sdkMessage);
                // Close connection on result message
                if (sdkMessage.subtype === 'success' || sdkMessage.subtype?.startsWith('error')) {
                  callbacks.onComplete?.();
                  eventSource.close();
                }
                break;
            }
          } catch (parseError) {
            // If it's not valid JSON, it might be a plain text response
            console.warn('Failed to parse SDK message:', data.data);
          }
        } else if (data.type === 'error') {
          callbacks.onError?.(data.data);
        } else if (data.type === 'done') {
          callbacks.onComplete?.();
          eventSource.close();
        }
      } catch (error) {
        callbacks.onError?.(`Failed to parse event data: ${error}`);
      }
    };
    
    eventSource.onerror = (error) => {
      callbacks.onError?.('Connection error');
      eventSource.close();
    };
    
    return eventSource;
  }
  
  async sendPrompt(
    prompt: string, 
    options?: ClaudePromptOptions
  ): Promise<ClaudeResponse> {
    const response = await fetch(`${this.baseUrl}/api/claude/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        prompt, 
        sessionId: options?.sessionId,
        flags: options?.flags 
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${error}`);
    }
    
    return response.json();
  }
  
  async sendSimplePrompt(prompt: string): Promise<ClaudeResponse> {
    const response = await fetch(`${this.baseUrl}/api/claude/simple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${error}`);
    }
    
    return response.json();
  }
  
  async checkHealth(): Promise<{ status: string; service: string }> {
    const response = await fetch(`${this.baseUrl}/api/claude/health`);
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    
    return response.json();
  }
}