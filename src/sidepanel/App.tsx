import { useState, useEffect, useRef } from 'react';
import { TweetData, CommentTone, CommentLength, CommentStance, MessagePayload, TokenUsage, TokenCost, PersonaData, GeminiModel, TranslationCacheEntry, CommentExplanation, SidePanelState, TweetResults } from '../types';
import { storage, sessionStorage } from '../utils/storage';
import { generateCommentStream, DEFAULT_MODEL, AVAILABLE_MODELS, isKoreanText, translateTweet, generateCommentExplanation } from '../utils/gemini';
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
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(DEFAULT_MODEL);
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

  // Translation-related state
  const [translation, setTranslation] = useState<string | null>(null);
  const [translationSourceLang, setTranslationSourceLang] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string>('');
  const [isTranslationExpanded, setIsTranslationExpanded] = useState(true);
  const [expandedOption, setExpandedOption] = useState<'tone' | 'stance' | 'length' | null>(null);
  const [translationTokenUsage, setTranslationTokenUsage] = useState<TokenUsage | null>(null);
  const [translationTokenCost, setTranslationTokenCost] = useState<TokenCost | null>(null);
  const translationCacheRef = useRef<Map<string, TranslationCacheEntry>>(new Map());

  // Explanation-related state
  const [commentExplanation, setCommentExplanation] = useState<CommentExplanation | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explanationError, setExplanationError] = useState<string>('');
  const [explanationTokenUsage, setExplanationTokenUsage] = useState<TokenUsage | null>(null);
  const [explanationTokenCost, setExplanationTokenCost] = useState<TokenCost | null>(null);

  // Tweet text expansion
  const [isTweetExpanded, setIsTweetExpanded] = useState(false);

  // Helper: cache key from tweet text (first 200 chars)
  const getTweetKey = (tweet: TweetData) => tweet.text.slice(0, 200);

  // Save current results to per-tweet cache
  const saveTweetResults = async (tweet: TweetData, overrides?: Partial<TweetResults>) => {
    const key = getTweetKey(tweet);
    const results: TweetResults = {
      generatedComment,
      tokenUsage,
      tokenCost,
      currentModel,
      commentExplanation,
      lastUpdated: Date.now(),
      ...overrides,
    };
    // Only cache if there's something worth saving
    if (!results.generatedComment) return;
    try {
      const existing = await sessionStorage.get('tweetResultsCache') || {};
      const keys = Object.keys(existing);
      // Limit cache to 10 entries, remove oldest
      if (keys.length >= 10 && !existing[key]) {
        let oldestKey = keys[0];
        let oldestTime = existing[keys[0]].lastUpdated;
        for (const k of keys) {
          if (existing[k].lastUpdated < oldestTime) {
            oldestKey = k;
            oldestTime = existing[k].lastUpdated;
          }
        }
        delete existing[oldestKey];
      }
      existing[key] = results;
      await sessionStorage.set('tweetResultsCache', existing);
    } catch {
      // Silently fail
    }
  };

  // Load cached results for a tweet
  const loadTweetResults = async (tweet: TweetData): Promise<TweetResults | null> => {
    try {
      const cache = await sessionStorage.get('tweetResultsCache');
      if (!cache) return null;
      return cache[getTweetKey(tweet)] || null;
    } catch {
      return null;
    }
  };

  // Apply cached results to state
  const restoreTweetResults = (results: TweetResults) => {
    setGeneratedComment(results.generatedComment);
    setTokenUsage(results.tokenUsage);
    setTokenCost(results.tokenCost);
    setCurrentModel(results.currentModel);
    setCommentExplanation(results.commentExplanation);
  };

  // Clear generated state
  const clearGeneratedState = () => {
    setGeneratedComment('');
    setTokenUsage(null);
    setTokenCost(null);
    setCommentExplanation(null);
    setExplanationError('');
    setExplanationTokenUsage(null);
    setExplanationTokenCost(null);
  };

  // Save sidepanel state to session storage
  const saveSidePanelState = async (overrides?: Partial<SidePanelState>) => {
    const state: SidePanelState = {
      tweetData,
      generatedComment,
      tokenUsage,
      tokenCost,
      currentModel,
      commentExplanation,
      lastUpdated: Date.now(),
      ...overrides,
    };
    try {
      await sessionStorage.set('sidePanelState', state);
    } catch {
      // Silently fail - session storage not critical
    }
  };

  // Load API key, preferences, persona, and restore session state on mount
  useEffect(() => {
    const loadSettings = async () => {
      const savedApiKey = await storage.get('apiKey');
      const savedTone = await storage.get('preferredTone');
      const savedLength = await storage.get('preferredLength');
      const savedStance = await storage.get('preferredStance');
      const savedModel = await storage.get('selectedModel');
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
      if (savedModel) {
        setSelectedModel(savedModel);
      }
      if (savedPersona) {
        setPersona(savedPersona);
      }

      // Restore session state
      try {
        const savedState = await sessionStorage.get('sidePanelState');
        if (savedState) {
          console.log('🔄 Restoring sidepanel state from session storage');
          if (savedState.tweetData) setTweetData(savedState.tweetData);
          if (savedState.generatedComment) setGeneratedComment(savedState.generatedComment);
          if (savedState.tokenUsage) setTokenUsage(savedState.tokenUsage);
          if (savedState.tokenCost) setTokenCost(savedState.tokenCost);
          if (savedState.currentModel) setCurrentModel(savedState.currentModel);
          if (savedState.commentExplanation) setCommentExplanation(savedState.commentExplanation);
        }
      } catch {
        console.log('ℹ️ No session state to restore');
      }
    };

    loadSettings();

    // Request cached tweet data from background script
    // This handles the case when sidepanel opens after tweet data was already sent
    console.log('🔄 Sidepanel: Requesting cached tweet data from background');
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_TWEET' })
      .then(async (response) => {
        console.log('📨 Sidepanel: Received cached data response:', response);
        if (response?.data) {
          const newTweet = response.data as TweetData;
          setTweetData(newTweet);

          // Check per-tweet cache for previously generated results
          try {
            const cache = await sessionStorage.get('tweetResultsCache');
            const key = newTweet.text.slice(0, 200);
            const cachedResults = cache?.[key];
            if (cachedResults?.generatedComment) {
              console.log('🔄 Restoring cached results for current tweet');
              setGeneratedComment(cachedResults.generatedComment);
              setTokenUsage(cachedResults.tokenUsage);
              setTokenCost(cachedResults.tokenCost);
              setCurrentModel(cachedResults.currentModel);
              setCommentExplanation(cachedResults.commentExplanation);
              return;
            }
          } catch {
            // Fall through
          }

          // Fall back to sidePanelState
          try {
            const savedState = await sessionStorage.get('sidePanelState');
            if (savedState?.tweetData?.text === newTweet.text && savedState.generatedComment) {
              console.log('✅ Same tweet detected, preserving generated results');
              return;
            }
          } catch {
            // No state to restore
          }

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
        const newTweet = message.data as TweetData;
        console.log('✅ Processing TWEET_CLICKED message with data:', newTweet);

        // Save current results to cache before switching
        // (uses refs to avoid stale closure - we read from session storage)
        (async () => {
          try {
            const savedState = await sessionStorage.get('sidePanelState');
            if (savedState?.tweetData && savedState.generatedComment) {
              await saveTweetResults(savedState.tweetData, {
                generatedComment: savedState.generatedComment,
                tokenUsage: savedState.tokenUsage,
                tokenCost: savedState.tokenCost,
                currentModel: savedState.currentModel,
                commentExplanation: savedState.commentExplanation,
                lastUpdated: Date.now(),
              });
            }
          } catch {
            // Silently fail
          }

          // Check if the new tweet has cached results
          const cachedResults = await loadTweetResults(newTweet);
          if (cachedResults) {
            console.log('🔄 Restoring cached results for tweet');
            restoreTweetResults(cachedResults);
          } else {
            clearGeneratedState();
          }
        })();

        setTweetData(newTweet);
        setIsTweetExpanded(false);
        setError('');
        setSuccess('');
        // Clear translation state for new tweet
        setTranslation(null);
        setTranslationSourceLang('');
        setTranslationError('');
        setTranslationTokenUsage(null);
        setTranslationTokenCost(null);
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

  // Manual translate handler
  const handleTranslate = async () => {
    if (!tweetData?.text || !apiKey) return;

    // Generate cache key from tweet text
    const cacheKey = tweetData.text.slice(0, 100);

    // Check cache first
    const cached = translationCacheRef.current.get(cacheKey);
    if (cached) {
      console.log('📦 Using cached translation');
      setTranslation(cached.translatedText);
      setTranslationSourceLang(cached.sourceLanguage);
      return;
    }

    // Perform translation
    setIsTranslating(true);
    setTranslationError('');

    try {
      const result = await translateTweet(tweetData.text, apiKey, selectedModel);
      setTranslation(result.translatedText);
      setTranslationSourceLang(result.sourceLanguage);
      setTranslationTokenUsage(result.usage);
      setTranslationTokenCost(result.cost);

      // Cache the result
      translationCacheRef.current.set(cacheKey, {
        translatedText: result.translatedText,
        sourceLanguage: result.sourceLanguage,
        timestamp: Date.now()
      });
      console.log('✅ Translation completed and cached');
    } catch (err) {
      console.error('❌ Translation failed:', err);
      setTranslationError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setIsTranslating(false);
    }
  };

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

  // Generate explanation after comment is generated
  const handleExplanation = async (tweet: TweetData, comment: string) => {
    if (!apiKey || !comment) return;

    setIsExplaining(true);
    setExplanationError('');

    try {
      const result = await generateCommentExplanation(
        tweet.text,
        comment,
        apiKey,
        selectedModel
      );
      setCommentExplanation(result.explanation);
      setExplanationTokenUsage(result.usage);
      setExplanationTokenCost(result.cost);

      // Save state with explanation
      await saveSidePanelState({
        commentExplanation: result.explanation,
      });

      // Update per-tweet cache with explanation
      if (tweet) {
        await saveTweetResults(tweet, {
          generatedComment: generatedComment || '',
          tokenUsage,
          tokenCost,
          currentModel,
          commentExplanation: result.explanation,
          lastUpdated: Date.now(),
        });
      }
    } catch (err) {
      console.error('❌ Explanation failed:', err);
      setExplanationError(err instanceof Error ? err.message : 'Explanation failed');
    } finally {
      setIsExplaining(false);
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
    setGeneratedComment('');
    setTokenUsage(null);
    setTokenCost(null);
    setCommentExplanation(null);
    setExplanationError('');

    try {
      const result = await generateCommentStream(
        tweetData,
        selectedTone,
        apiKey,
        (text) => setGeneratedComment(text),
        persona,
        selectedLength,
        selectedStance,
        userIntent || undefined,
        selectedModel
      );
      setGeneratedComment(result.comment);
      setTokenUsage(result.usage);
      setTokenCost(result.cost);
      setCurrentModel(result.model);

      // Save preferences
      await storage.set('preferredTone', selectedTone);
      await storage.set('preferredLength', selectedLength);
      await storage.set('preferredStance', selectedStance);

      // Save state to session storage
      await saveSidePanelState({
        tweetData,
        generatedComment: result.comment,
        tokenUsage: result.usage,
        tokenCost: result.cost,
        currentModel: result.model,
      });

      // Save to per-tweet cache
      await saveTweetResults(tweetData, {
        generatedComment: result.comment,
        tokenUsage: result.usage,
        tokenCost: result.cost,
        currentModel: result.model,
        commentExplanation: null,
        lastUpdated: Date.now(),
      });

      // Auto-generate explanation
      handleExplanation(tweetData, result.comment);
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
          <div
            className={`tweet-content ${!isTweetExpanded ? 'tweet-content--truncated' : ''}`}
            onClick={() => setIsTweetExpanded(!isTweetExpanded)}
            title={isTweetExpanded ? 'Click to collapse' : 'Click to expand'}
          >
            {tweetData.text}
          </div>

          {/* Translate Button - only show for non-Korean tweets */}
          {!isKoreanText(tweetData.text) && !translation && !isTranslating && !translationError && (
            <button
              className="translate-btn"
              onClick={handleTranslate}
              disabled={!apiKey}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                <path d="m5 8 6 6"/>
                <path d="m4 14 6-6 2-3"/>
                <path d="M2 5h12"/>
                <path d="M7 2h1"/>
                <path d="m22 22-5-10-5 10"/>
                <path d="M14 18h6"/>
              </svg>
              Translate
            </button>
          )}

          {/* Korean Translation Section */}
          {(translation || isTranslating || translationError) && (
            <div className={`translation-section ${isTranslating ? 'translation-loading' : ''} ${translationError ? 'translation-error' : ''}`}>
              <button
                className="translation-header"
                onClick={() => setIsTranslationExpanded(!isTranslationExpanded)}
                aria-expanded={isTranslationExpanded}
                disabled={isTranslating}
              >
                <div className="translation-header-left">
                  <span className={`translation-icon ${isTranslating ? 'spinning' : ''}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                      <path d="m5 8 6 6"/>
                      <path d="m4 14 6-6 2-3"/>
                      <path d="M2 5h12"/>
                      <path d="M7 2h1"/>
                      <path d="m22 22-5-10-5 10"/>
                      <path d="M14 18h6"/>
                    </svg>
                  </span>
                  <span className="translation-label">
                    {isTranslating ? 'Translating...' : translationError ? 'Translation failed' : 'Korean Translation'}
                  </span>
                  {translationSourceLang && !isTranslating && !translationError && (
                    <span className="translation-lang-badge">{translationSourceLang.toUpperCase()}</span>
                  )}
                </div>
                {!isTranslating && !translationError && (
                  <span className={`translation-chevron ${isTranslationExpanded ? 'expanded' : ''}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </span>
                )}
                {translationError && (
                  <button
                    className="translation-retry"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTranslationError('');
                      setTranslation(null);
                    }}
                  >
                    Retry
                  </button>
                )}
              </button>

              {isTranslationExpanded && translation && !translationError && (
                <div className="translation-body">
                  <div className="translation-text">{translation}</div>
                  {translationTokenUsage && translationTokenCost && (
                    <div className="translation-cost">
                      <span>{translationTokenUsage.totalTokens.toLocaleString()} tokens</span>
                      <span className="cost">${translationTokenCost.totalCost.toFixed(6)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Options Accordion */}
          <div className="options-accordion">
            {/* Tone Selection */}
            <div className={`accordion-item ${expandedOption === 'tone' ? 'accordion-item--expanded' : ''}`}>
              <button
                className="accordion-header"
                onClick={() => setExpandedOption(expandedOption === 'tone' ? null : 'tone')}
              >
                <span className="accordion-label">Tone</span>
                <div className="accordion-header-right">
                  <span className="accordion-value">{TONE_LABELS[selectedTone]}</span>
                  <span className={`accordion-chevron ${expandedOption === 'tone' ? 'expanded' : ''}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </span>
                </div>
              </button>
              {expandedOption === 'tone' && (
                <div className="accordion-body">
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
              )}
            </div>

            {/* Stance Selection */}
            <div className={`accordion-item ${expandedOption === 'stance' ? 'accordion-item--expanded' : ''}`}>
              <button
                className="accordion-header"
                onClick={() => setExpandedOption(expandedOption === 'stance' ? null : 'stance')}
              >
                <span className="accordion-label">Stance</span>
                <div className="accordion-header-right">
                  <span className="accordion-value">{STANCE_LABELS[selectedStance]}</span>
                  <span className={`accordion-chevron ${expandedOption === 'stance' ? 'expanded' : ''}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </span>
                </div>
              </button>
              {expandedOption === 'stance' && (
                <div className="accordion-body">
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
              )}
            </div>

            {/* Length Selection */}
            <div className={`accordion-item ${expandedOption === 'length' ? 'accordion-item--expanded' : ''}`}>
              <button
                className="accordion-header"
                onClick={() => setExpandedOption(expandedOption === 'length' ? null : 'length')}
              >
                <span className="accordion-label">Length</span>
                <div className="accordion-header-right">
                  <span className="accordion-value">{LENGTH_LABELS[selectedLength]}</span>
                  <span className={`accordion-chevron ${expandedOption === 'length' ? 'expanded' : ''}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </span>
                </div>
              </button>
              {expandedOption === 'length' && (
                <div className="accordion-body">
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
              )}
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
                setCommentExplanation(null);
                setExplanationError('');
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

          {/* Comment Explanation Section */}
          {(commentExplanation || isExplaining || explanationError) && (
            <div className={`explanation-section ${isExplaining ? 'explanation-loading' : ''} ${explanationError ? 'explanation-error' : ''}`}>
              <div className="explanation-header">
                <span className={`explanation-icon ${isExplaining ? 'spinning' : ''}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 16v-4"/>
                    <path d="M12 8h.01"/>
                  </svg>
                </span>
                <span className="explanation-label">
                  {isExplaining ? 'Analyzing...' : explanationError ? 'Analysis failed' : 'Comment Analysis'}
                </span>
                {explanationError && (
                  <button
                    className="explanation-retry"
                    onClick={() => {
                      setExplanationError('');
                      if (tweetData && generatedComment) {
                        handleExplanation(tweetData, generatedComment);
                      }
                    }}
                  >
                    Retry
                  </button>
                )}
              </div>

              {commentExplanation && !explanationError && (
                <div className="explanation-body">
                  <div className="explanation-card">
                    <div className="explanation-card-label">Korean Translation</div>
                    <div className="explanation-card-text">{commentExplanation.koreanTranslation}</div>
                  </div>
                  <div className="explanation-card">
                    <div className="explanation-card-label">Why This Works</div>
                    <div className="explanation-card-text">{commentExplanation.relevanceReason}</div>
                  </div>
                  {explanationTokenUsage && explanationTokenCost && (
                    <div className="explanation-cost">
                      <span>{explanationTokenUsage.totalTokens.toLocaleString()} tokens</span>
                      <span className="cost">${explanationTokenCost.totalCost.toFixed(6)}</span>
                    </div>
                  )}
                </div>
              )}
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

              {/* Model Selection Section */}
              <div className="settings-section">
                <div className="settings-section-header">
                  <h4>Model</h4>
                </div>
                <div className="settings-section-content">
                  <select
                    className="model-select"
                    value={selectedModel}
                    onChange={(e) => {
                      const model = e.target.value as GeminiModel;
                      setSelectedModel(model);
                      storage.set('selectedModel', model);
                    }}
                  >
                    {AVAILABLE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} - {m.description}
                      </option>
                    ))}
                  </select>
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
