import { TweetData } from '../types';

// Check if current page is a tweet detail page
export function isOnTweetDetailPage(): boolean {
  return /\/status\/\d+/.test(window.location.pathname);
}

// Extract tweet data from the main tweet on detail page (no article wrapper)
export function extractMainTweetData(): TweetData | null {
  try {
    console.log('🔍 Extracting main tweet data from detail page');

    // On tweet detail page, find the first tweetText (main tweet)
    const tweetTextElement = document.querySelector('[data-testid="tweetText"]');

    if (!tweetTextElement) {
      console.warn('⚠️ No tweetText element found on detail page');
      return null;
    }

    const text = tweetTextElement.textContent || '';
    console.log('📝 Main tweet text:', text);

    // Find User-Name - on detail page it's in a different structure
    const userNameElement = document.querySelector('[data-testid="User-Name"]');
    const author = userNameElement?.textContent || undefined;
    console.log('👤 Author:', author);

    return {
      text: text.trim(),
      author,
      url: window.location.href
    };
  } catch (error) {
    console.error('❌ Error extracting main tweet data:', error);
    return null;
  }
}

// Function to extract tweet text from a tweet element (timeline view with article)
export function extractTweetData(element: Element): TweetData | null {
  try {
    console.log('🔍 Extracting tweet data from element:', element);

    // X/Twitter uses data-testid="tweetText" for tweet content
    const tweetTextElement = element.querySelector('[data-testid="tweetText"]');

    if (!tweetTextElement) {
      console.warn('⚠️ No tweetText element found');
      return null;
    }

    const text = tweetTextElement.textContent || '';
    console.log('📝 Tweet text:', text);

    // Try to get author information with multiple selectors
    const authorElement =
      element.querySelector('[data-testid="User-Name"]') ||
      element.querySelector('[data-testid="User-Names"]') ||
      element.querySelector('[data-testid="UserName"]');

    const author = authorElement?.textContent || undefined;
    console.log('👤 Author:', author);

    // Get current URL
    const url = window.location.href;

    return {
      text: text.trim(),
      author,
      url
    };
  } catch (error) {
    console.error('❌ Error extracting tweet data:', error);
    return null;
  }
}
