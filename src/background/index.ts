import { MessagePayload, TweetData } from '../types';

// Cache tweet data per tab to handle timing issues
const tweetDataCache = new Map<number, TweetData>();

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

    // Cache the tweet data for this tab
    if (sender.tab?.id && message.data) {
      tweetDataCache.set(sender.tab.id, message.data as TweetData);
      console.log('Cached tweet data for tab:', sender.tab.id);
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
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        const cachedData = tweetDataCache.get(tabId);
        console.log('Returning cached data for tab:', tabId, cachedData);
        sendResponse({ data: cachedData || null });
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
  if (tweetDataCache.has(tabId)) {
    tweetDataCache.delete(tabId);
    console.log('Cleaned up cache for closed tab:', tabId);
  }
});

console.log('X Comment Helper background service worker loaded');
