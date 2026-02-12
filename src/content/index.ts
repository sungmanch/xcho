import { TweetData, MessagePayload } from '../types';
import { isOnTweetDetailPage, extractMainTweetData, extractTweetData } from './extractors';

console.log('🚀 X Comment Helper content script loaded');
console.log('📍 Current URL:', window.location.href);

// Send tweet data to extension
function sendTweetData(tweetData: TweetData) {
  console.log('✉️ Sending tweet data to extension:', tweetData);

  const message: MessagePayload = {
    type: 'TWEET_CLICKED',
    data: tweetData
  };

  chrome.runtime.sendMessage(message)
    .then(() => console.log('✅ Message sent successfully'))
    .catch(err => console.error('❌ Failed to send message:', err));
}

// Auto-detect and send tweet data on detail page
function autoDetectTweetOnDetailPage() {
  if (!isOnTweetDetailPage()) {
    console.log('ℹ️ Not on tweet detail page, skipping auto-detect');
    return;
  }

  console.log('📄 On tweet detail page, auto-detecting tweet...');

  // Wait for DOM to be ready with tweet content
  const tryExtract = (attempts = 0) => {
    const tweetData = extractMainTweetData();

    if (tweetData && tweetData.text) {
      sendTweetData(tweetData);
    } else if (attempts < 5) {
      // Retry up to 5 times with 500ms delay (for dynamic content)
      console.log(`⏳ Tweet not found yet, retrying... (${attempts + 1}/5)`);
      setTimeout(() => tryExtract(attempts + 1), 500);
    } else {
      console.warn('⚠️ Could not extract tweet data after 5 attempts');
    }
  };

  tryExtract();
}

// Track URL changes for SPA navigation
let lastUrl = window.location.href;

function handleUrlChange() {
  if (window.location.href !== lastUrl) {
    console.log('🔄 URL changed:', lastUrl, '→', window.location.href);
    lastUrl = window.location.href;

    // When navigating to a tweet detail page, auto-detect the tweet
    setTimeout(autoDetectTweetOnDetailPage, 500);
  }
}

// Wait for page to be ready
function initContentScript() {
  console.log('⏳ Initializing content script...');

  // Check if tweets are present
  const checkTweets = () => {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    console.log(`📊 Found ${tweets.length} tweets on page`);

    if (tweets.length === 0 && isOnTweetDetailPage()) {
      console.log('📄 On tweet detail page (no article elements expected)');
    } else if (tweets.length === 0) {
      console.log('⚠️ No tweets found yet, they may load dynamically');
    }
  };

  // Initial check
  checkTweets();

  // Check again after a delay (for dynamic content)
  setTimeout(checkTweets, 2000);

  // Auto-detect tweet on detail page (initial load)
  autoDetectTweetOnDetailPage();

  // Watch for URL changes (SPA navigation)
  const observer = new MutationObserver(handleUrlChange);
  observer.observe(document.body, { childList: true, subtree: true });

  // Listen for clicks on tweet articles (for timeline view)
  document.addEventListener('click', (event) => {
    console.log('👆 Click detected');
    const target = event.target as Element;

    // Try to find article with tweet data-testid
    let article = target.closest('article[data-testid="tweet"]');

    // Fallback: try to find any article element
    if (!article) {
      article = target.closest('article');
      if (article) {
        console.log('⚠️ Found article without data-testid="tweet"');
      }
    }

    if (article) {
      console.log('✅ Article element found:', article);
      const tweetData = extractTweetData(article);

      if (tweetData && tweetData.text) {
        sendTweetData(tweetData);
      } else {
        console.warn('⚠️ No valid tweet data extracted');
      }
    } else {
      // On detail page, clicking anywhere might mean interacting with the main tweet
      if (isOnTweetDetailPage()) {
        console.log('ℹ️ Click on detail page, checking for main tweet');
        const tweetData = extractMainTweetData();
        if (tweetData && tweetData.text) {
          sendTweetData(tweetData);
        }
      } else {
        console.log('ℹ️ Click was not on a tweet');
      }
    }
  }, true); // Use capture phase to catch clicks early

  console.log('✅ Content script initialized successfully');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContentScript);
} else {
  initContentScript();
}
