import { TweetData } from '../types';

// Check if current page is a tweet detail page
export function isOnTweetDetailPage(): boolean {
  return /\/status\/\d+/.test(window.location.pathname);
}

// Extract tweet data from the main tweet on detail page (no article wrapper)
export function extractMainTweetData(): TweetData | null {
  console.log('🔍 Extracting main tweet data from detail page');

  const tweetTextElement = document.querySelector('[data-testid="tweetText"]');
  if (!tweetTextElement) {
    console.warn('⚠️ No tweetText element found on detail page');
    return null;
  }

  const text = tweetTextElement.textContent || '';
  console.log('📝 Main tweet text:', text);

  const userNameElement = document.querySelector('[data-testid="User-Name"]');
  const author = userNameElement?.textContent || undefined;
  console.log('👤 Author:', author);

  return {
    text: text.trim(),
    author,
    url: window.location.href
  };
}

// Extract tweet text from a tweet element (timeline view with article)
export function extractTweetData(element: Element): TweetData | null {
  console.log('🔍 Extracting tweet data from element:', element);

  const tweetTextElement = element.querySelector('[data-testid="tweetText"]');
  if (!tweetTextElement) {
    console.warn('⚠️ No tweetText element found');
    return null;
  }

  const text = tweetTextElement.textContent || '';
  console.log('📝 Tweet text:', text);

  const authorElement =
    element.querySelector('[data-testid="User-Name"]') ||
    element.querySelector('[data-testid="User-Names"]') ||
    element.querySelector('[data-testid="UserName"]');

  const author = authorElement?.textContent || undefined;
  console.log('👤 Author:', author);

  return {
    text: text.trim(),
    author,
    url: window.location.href
  };
}
