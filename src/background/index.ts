import { MessagePayload, TweetData } from '../types';

// Allow sidepanel (untrusted context) to access session storage
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

// Helper to get/set tweet cache in session storage
async function getCachedTweet(tabId: number): Promise<TweetData | null> {
  const result = await chrome.storage.session.get('tweetCache');
  const cache = (result.tweetCache || {}) as Record<string, TweetData>;
  return cache[String(tabId)] || null;
}

async function setCachedTweet(tabId: number, data: TweetData): Promise<void> {
  const result = await chrome.storage.session.get('tweetCache');
  const cache = (result.tweetCache || {}) as Record<string, TweetData>;
  cache[String(tabId)] = data;
  await chrome.storage.session.set({ tweetCache: cache });
}

async function removeCachedTweet(tabId: number): Promise<void> {
  const result = await chrome.storage.session.get('tweetCache');
  const cache = (result.tweetCache || {}) as Record<string, TweetData>;
  delete cache[String(tabId)];
  await chrome.storage.session.set({ tweetCache: cache });
}

// Listen for extension icon click
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Listen for messages from content script or sidepanel
chrome.runtime.onMessage.addListener((message: MessagePayload, sender, sendResponse) => {
  console.log('Background received message:', message.type, 'from', sender);

  if (message.type === 'TWEET_CLICKED') {
    console.log('Tweet clicked, caching data and opening sidepanel');

    // Cache the tweet data for this tab in session storage
    if (sender.tab?.id && message.data) {
      setCachedTweet(sender.tab.id, message.data as TweetData)
        .then(() => console.log('Cached tweet data for tab:', sender.tab!.id))
        .catch(err => console.error('Failed to cache tweet data:', err));
    }

    // Open sidepanel if not already open
    if (sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => console.log('Sidepanel opened successfully'))
        .catch(err => console.error('Failed to open sidepanel:', err));
    }
  }

  // Handle request for cached tweet data from sidepanel
  if (message.type === 'GET_CURRENT_TWEET') {
    console.log('Sidepanel requesting current tweet data');

    // Get the active tab to find cached data
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        const cachedData = await getCachedTweet(tabId);
        console.log('Returning cached data for tab:', tabId, cachedData);
        sendResponse({ data: cachedData });
      } else {
        sendResponse({ data: null });
      }
    });

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  return true;
});

// Clean up cache when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  removeCachedTweet(tabId)
    .then(() => console.log('Cleaned up cache for closed tab:', tabId))
    .catch(() => {});
});

console.log('X Comment Helper background service worker loaded');
