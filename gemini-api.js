class GoogleGenerativeAI {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  getGenerativeModel({ model, systemInstruction }) {
    return {
      startChat: ({ generationConfig, history }) => {
        return {
          sendMessage: async (message) => {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${this.apiKey}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  contents: [{
                    parts: [{
                      text: systemInstruction + "\n\nAnalyze this code:\n" + message
                    }]
                  }],
                  generationConfig: {
                    temperature: generationConfig.temperature,
                    topP: generationConfig.topP,
                    topK: generationConfig.topK,
                    maxOutputTokens: generationConfig.maxOutputTokens,
                  }
                })
              }
            );

            if (!response.ok) {
              throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            return {
              response: {
                text: () => result.candidates[0].content.parts[0].text
              }
            };
          }
        };
      }
    };
  }
} 