/**
 * Gemini SDK Mock
 *
 * Provides mock factories for @google/generative-ai module.
 */

/** Default mock token metadata */
const defaultUsageMetadata = {
  promptTokenCount: 100,
  candidatesTokenCount: 50,
  totalTokenCount: 150,
};

/**
 * Create a mock generative model that returns configurable responses.
 */
export function createMockGenerativeModel(responseText = 'Mock generated response') {
  const mockResponse = {
    text: () => responseText,
    usageMetadata: { ...defaultUsageMetadata },
  };

  const mockStreamChunk = {
    text: () => responseText,
  };

  return {
    generateContent: vi.fn(async () => ({
      response: mockResponse,
    })),

    generateContentStream: vi.fn(async () => ({
      stream: (async function* () {
        yield mockStreamChunk;
      })(),
      response: Promise.resolve(mockResponse),
    })),
  };
}

/**
 * Create a mock GoogleGenerativeAI class instance.
 */
export function createMockGoogleGenerativeAI() {
  const mockModel = createMockGenerativeModel();

  return {
    getGenerativeModel: vi.fn(() => mockModel),
    _mockModel: mockModel,
  };
}

/**
 * Setup vi.mock for @google/generative-ai.
 * Call this at module scope in test files that need the mock.
 */
export function setupGeminiMock() {
  const mockInstance = createMockGoogleGenerativeAI();

  vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: vi.fn(() => mockInstance),
  }));

  return mockInstance;
}
