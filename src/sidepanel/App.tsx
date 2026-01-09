import { useState, useEffect, useRef } from 'react';
import { TweetData, CommentTone, CommentLength, CommentStance, MessagePayload, TokenUsage, TokenCost, PersonaData } from '../types';
import { storage } from '../utils/storage';
import { generateComment } from '../utils/gemini';
import { analyzeWritings, savePersona, loadPersona, saveRawWritings, clearPersona } from '../utils/persona';

const TONE_LABELS: Record<CommentTone, string> = {
  friendly: 'Friendly',
  professional: 'Professional',
  empathetic: 'Empathetic',
  humorous: 'Humorous'
};

const LENGTH_LABELS: Record<CommentLength, string> = {
  short: 'Short',
  medium: 'Medium',
  long: 'Long'
};

const STANCE_LABELS: Record<CommentStance, string> = {
  agree: 'Agree',
  disagree: 'Disagree',
  question: 'Question',
  neutral: 'Neutral'
};

function App() {
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedTone, setSelectedTone] = useState<CommentTone>('friendly');
  const [selectedLength, setSelectedLength] = useState<CommentLength>('medium');
  const [selectedStance, setSelectedStance] = useState<CommentStance>('neutral');
  const [userIntent, setUserIntent] = useState('');
  const [tweetData, setTweetData] = useState<TweetData | null>(null);
  const [generatedComment, setGeneratedComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [tokenCost, setTokenCost] = useState<TokenCost | null>(null);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [persona, setPersona] = useState<PersonaData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showPersonaDetails, setShowPersonaDetails] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load API key, preferences, and persona on mount
  useEffect(() => {
    const loadSettings = async () => {
      const savedApiKey = await storage.get('apiKey');
      const savedTone = await storage.get('preferredTone');
      const savedLength = await storage.get('preferredLength');
      const savedStance = await storage.get('preferredStance');
      const savedPersona = await loadPersona();

      if (savedApiKey) {
        setApiKey(savedApiKey);
      }
      if (savedTone) {
        setSelectedTone(savedTone);
      }
      if (savedLength) {
        setSelectedLength(savedLength);
      }
      if (savedStance) {
        setSelectedStance(savedStance);
      }
      if (savedPersona) {
        setPersona(savedPersona);
      }
    };

    loadSettings();

    // Request cached tweet data from background script
    // This handles the case when sidepanel opens after tweet data was already sent
    console.log('🔄 Sidepanel: Requesting cached tweet data from background');
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_TWEET' })
      .then((response) => {
        console.log('📨 Sidepanel: Received cached data response:', response);
        if (response?.data) {
          setTweetData(response.data as TweetData);
          console.log('✅ Sidepanel: Loaded cached tweet data');
        }
      })
      .catch((err) => {
        console.log('ℹ️ Sidepanel: No cached data available:', err);
      });
  }, []);

  // Listen for messages from content script
  useEffect(() => {
    console.log('🎧 Sidepanel: Setting up message listener');

    const messageListener = (
      message: MessagePayload,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      console.log('📨 Sidepanel received message:', message, 'from', sender);

      if (message.type === 'TWEET_CLICKED' && message.data) {
        console.log('✅ Processing TWEET_CLICKED message with data:', message.data);
        setTweetData(message.data as TweetData);
        setGeneratedComment('');
        setError('');
        setSuccess('');
        sendResponse({ received: true });
      }

      return true; // Keep channel open for async response
    };

    chrome.runtime.onMessage.addListener(messageListener);

    console.log('✅ Sidepanel: Message listener registered');

    return () => {
      console.log('🔌 Sidepanel: Removing message listener');
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) {
      setError('Please enter your API key.');
      return;
    }

    try {
      await storage.set('apiKey', apiKeyInput.trim());
      setApiKey(apiKeyInput.trim());
      setApiKeyInput('');
      setSuccess('API key saved successfully.');
      setError('');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to save API key.');
    }
  };

  const handleGenerateComment = async () => {
    if (!apiKey) {
      setError('Please set up your API key first.');
      return;
    }

    if (!tweetData) {
      setError('No tweet data. Please click a tweet on X.');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await generateComment(tweetData, selectedTone, apiKey, persona, selectedLength, selectedStance, userIntent || undefined);
      setGeneratedComment(result.comment);
      setTokenUsage(result.usage);
      setTokenCost(result.cost);
      setCurrentModel(result.model);

      // Save preferences
      await storage.set('preferredTone', selectedTone);
      await storage.set('preferredLength', selectedLength);
      await storage.set('preferredStance', selectedStance);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to generate comment.');
      }
      setGeneratedComment('');
      setTokenUsage(null);
      setTokenCost(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyComment = async () => {
    if (!generatedComment) return;

    try {
      await navigator.clipboard.writeText(generatedComment);
      setSuccess('Comment copied to clipboard!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to copy.');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!apiKey) {
      setError('Please set up your API key first.');
      return;
    }

    setIsAnalyzing(true);
    setError('');

    try {
      const writings: string[] = [];

      for (const file of Array.from(files)) {
        const text = await file.text();
        writings.push(text);
      }

      // Save raw writings for potential re-analysis
      await saveRawWritings(writings);

      // Analyze writings with Gemini
      const analyzedPersona = await analyzeWritings(writings, apiKey);

      // Save and update state
      await savePersona(analyzedPersona);
      setPersona(analyzedPersona);
      setSuccess(`${files.length} document(s) analyzed successfully!`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to analyze documents.');
      }
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClearPersona = async () => {
    await clearPersona();
    setPersona(null);
    setSuccess('Persona has been reset.');
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <div className="app">
      <div className="header">
        <div className="header-main">
          <img src="/icons/icon.png" alt="Xcho" className="header-logo" />
          <button
            className="header-settings-btn"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            {(apiKey || persona) && (
              <div className="header-status-indicators">
                {apiKey && <span className="status-dot status-dot--success" title="API Configured" />}
                {persona && <span className="status-dot status-dot--persona" title="Persona Active" />}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Tweet Display Section */}
      {tweetData ? (
        <div className="section">
          <h2>Selected Tweet</h2>
          {tweetData.author && (
            <div className="tweet-author">{tweetData.author}</div>
          )}
          <div className="tweet-content">{tweetData.text}</div>

          {/* Tone Selection */}
          <div className="input-group">
            <label>Select Tone</label>
            <div className="tone-selector">
              {(Object.keys(TONE_LABELS) as CommentTone[]).map((tone) => (
                <div
                  key={tone}
                  className={`tone-option ${selectedTone === tone ? 'selected' : ''}`}
                  onClick={() => setSelectedTone(tone)}
                >
                  {TONE_LABELS[tone]}
                </div>
              ))}
            </div>
          </div>

          {/* Stance Selection */}
          <div className="input-group">
            <label>Select Stance</label>
            <div className="tone-selector">
              {(Object.keys(STANCE_LABELS) as CommentStance[]).map((stance) => (
                <div
                  key={stance}
                  className={`tone-option ${selectedStance === stance ? 'selected' : ''}`}
                  onClick={() => setSelectedStance(stance)}
                >
                  {STANCE_LABELS[stance]}
                </div>
              ))}
            </div>
          </div>

          {/* Length Selection */}
          <div className="input-group">
            <label>Select Length</label>
            <div className="tone-selector">
              {(Object.keys(LENGTH_LABELS) as CommentLength[]).map((length) => (
                <div
                  key={length}
                  className={`tone-option ${selectedLength === length ? 'selected' : ''}`}
                  onClick={() => setSelectedLength(length)}
                >
                  {LENGTH_LABELS[length]}
                </div>
              ))}
            </div>
          </div>

          {/* User Intent Input */}
          <div className="input-group">
            <label>Your Intent (Optional)</label>
            <textarea
              className="intent-input"
              value={userIntent}
              onChange={(e) => setUserIntent(e.target.value)}
              placeholder="예: 이 주장에 반박하고 싶어 / 공감하면서 내 경험 공유 / 유머러스하게 질문하기"
              rows={2}
            />
            <span className="input-hint">
              Write in Korean or English how you want your reply to feel
            </span>
          </div>

          <div className="generate-action">
            <button
              className="button button-primary"
              onClick={handleGenerateComment}
              disabled={isLoading || !apiKey}
            >
              {isLoading ? 'Generating...' : 'Generate Comment'}
            </button>
          </div>
        </div>
      ) : (
        <div className="section">
          <div className="empty-state">
            <h3>Select a Tweet</h3>
            <p>Click on a tweet you want to reply to on X (Twitter)<br />and the content will appear here automatically.</p>
          </div>
        </div>
      )}

      {/* Error/Success Messages */}
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* Generated Comment Section */}
      {generatedComment && (
        <div className="section">
          <h2>Generated Comment</h2>
          <div className="input-group">
            <textarea
              value={generatedComment}
              onChange={(e) => setGeneratedComment(e.target.value)}
              placeholder="Your comment will appear here"
            />
          </div>
          <div className="button-group">
            <button className="button button-primary" onClick={handleCopyComment}>
              Copy
            </button>
            <button
              className="button button-secondary"
              onClick={() => {
                setGeneratedComment('');
                setTokenUsage(null);
                setTokenCost(null);
              }}
            >
              Reset
            </button>
          </div>

          {/* Token Usage & Cost Display */}
          {tokenUsage && tokenCost && (
            <div className="token-info">
              <div className="token-header">
                <span className="model-badge">{currentModel}</span>
              </div>
              <div className="token-row">
                <span>Input</span>
                <span>{tokenUsage.promptTokens.toLocaleString()} tokens</span>
                <span className="cost">${tokenCost.inputCost.toFixed(6)}</span>
              </div>
              <div className="token-row">
                <span>Output</span>
                <span>{tokenUsage.completionTokens.toLocaleString()} tokens</span>
                <span className="cost">${tokenCost.outputCost.toFixed(6)}</span>
              </div>
              <div className="token-row total">
                <span>Total</span>
                <span>{tokenUsage.totalTokens.toLocaleString()} tokens</span>
                <span className="cost">${tokenCost.totalCost.toFixed(6)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Persona Details Modal */}
      {showPersonaDetails && persona && (
        <div className="modal-overlay" onClick={() => setShowPersonaDetails(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Persona Analysis Details</h3>
              <button onClick={() => setShowPersonaDetails(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-section">
                <h4>Writing Style</h4>
                <ul>
                  <li><strong>Sentence Length:</strong> {persona.writingStyle.sentenceLength}</li>
                  <li><strong>Formality:</strong> {persona.writingStyle.formality}</li>
                  <li><strong>Humor:</strong> {persona.writingStyle.humor ? 'Yes' : 'No'}</li>
                  <li><strong>Directness:</strong> {persona.writingStyle.directness}</li>
                </ul>
              </div>
              {persona.commonPhrases.length > 0 && (
                <div className="detail-section">
                  <h4>Common Phrases</h4>
                  <div className="tag-list">
                    {persona.commonPhrases.map((phrase, i) => (
                      <span key={i} className="tag">{phrase}</span>
                    ))}
                  </div>
                </div>
              )}
              {persona.topics.length > 0 && (
                <div className="detail-section">
                  <h4>Topics of Interest</h4>
                  <div className="tag-list">
                    {persona.topics.map((topic, i) => (
                      <span key={i} className="tag">{topic}</span>
                    ))}
                  </div>
                </div>
              )}
              {persona.exampleResponses.length > 0 && (
                <div className="detail-section">
                  <h4>Example Responses</h4>
                  {persona.exampleResponses.map((ex, i) => (
                    <p key={i} className="example-response">"{ex}"</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Settings</h3>
              <button onClick={() => setShowSettings(false)}>×</button>
            </div>
            <div className="modal-body">
              {/* API Configuration Section */}
              <div className="settings-section">
                <div className="settings-section-header">
                  <h4>API Configuration</h4>
                  <span className={`settings-status-badge ${apiKey ? 'settings-status-badge--configured' : ''}`}>
                    {apiKey ? 'Configured' : 'Not Set'}
                  </span>
                </div>
                <div className="settings-section-content">
                  {!apiKey ? (
                    <div className="input-group">
                      <label>API Key</label>
                      <input
                        type="password"
                        placeholder="Enter your Gemini API key"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                      />
                      <button
                        className="button button-primary"
                        onClick={handleSaveApiKey}
                        style={{ marginTop: '8px' }}
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="info">
                      API key is configured
                      <button
                        className="button button-secondary"
                        onClick={() => {
                          setApiKey('');
                          storage.remove('apiKey');
                        }}
                        style={{ marginLeft: '8px', padding: '6px 12px', fontSize: '12px' }}
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Personalization Section */}
              <div className="settings-section">
                <div className="settings-section-header">
                  <h4>Personalization</h4>
                  <span className={`settings-status-badge ${persona ? 'settings-status-badge--configured' : ''}`}>
                    {persona ? 'Active' : 'Not Set'}
                  </span>
                </div>
                <div className="settings-section-content">
                  {persona ? (
                    <div className="persona-info">
                      <div className="persona-status">
                        <span className="persona-badge">Analyzed</span>
                        <span className="persona-date">
                          {new Date(persona.lastAnalyzed).toLocaleDateString('en-US')}
                        </span>
                      </div>
                      <div className="persona-details">
                        <div className="persona-row">
                          <span className="label">Style:</span>
                          <span>{persona.writingStyle.formality}, {persona.writingStyle.directness}</span>
                        </div>
                        {persona.topics.length > 0 && (
                          <div className="persona-row">
                            <span className="label">Interests:</span>
                            <span>{persona.topics.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                      </div>
                      <div className="button-group" style={{ marginTop: '12px' }}>
                        <button
                          className="button button-secondary"
                          onClick={() => {
                            setShowSettings(false);
                            setShowPersonaDetails(true);
                          }}
                        >
                          See Details
                        </button>
                        <label className="button button-secondary file-label">
                          Re-analyze
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".md,.txt"
                            multiple
                            onChange={handleFileUpload}
                            style={{ display: 'none' }}
                            disabled={isAnalyzing}
                          />
                        </label>
                        <button
                          className="button button-secondary"
                          onClick={handleClearPersona}
                          disabled={isAnalyzing}
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="persona-empty">
                      <p>Upload your writings to generate personalized replies.</p>
                      <label className="button button-primary file-label">
                        {isAnalyzing ? 'Analyzing...' : 'Upload Documents (.md, .txt)'}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".md,.txt"
                          multiple
                          onChange={handleFileUpload}
                          style={{ display: 'none' }}
                          disabled={isAnalyzing || !apiKey}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
