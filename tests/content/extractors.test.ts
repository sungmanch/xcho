import { describe, it, expect } from 'vitest';
import { isOnTweetDetailPage, extractMainTweetData, extractTweetData } from '../../src/content/extractors';

// Helper to set window.location.pathname for jsdom
function setPathname(pathname: string) {
  Object.defineProperty(window, 'location', {
    value: { pathname, href: `https://x.com${pathname}` },
    writable: true,
    configurable: true,
  });
}

// Helper to create a DOM element with tweet structure
function createTweetElement(text: string, author?: string): HTMLElement {
  const article = document.createElement('article');

  const tweetText = document.createElement('div');
  tweetText.setAttribute('data-testid', 'tweetText');
  tweetText.textContent = text;
  article.appendChild(tweetText);

  if (author) {
    const userName = document.createElement('div');
    userName.setAttribute('data-testid', 'User-Name');
    userName.textContent = author;
    article.appendChild(userName);
  }

  return article;
}

// ─── isOnTweetDetailPage ──────────────────────────────────────────────────────

describe('isOnTweetDetailPage', () => {
  it('returns true for /status/:id paths', () => {
    setPathname('/user/status/1234567890');
    expect(isOnTweetDetailPage()).toBe(true);
  });

  it('returns false for timeline paths', () => {
    setPathname('/home');
    expect(isOnTweetDetailPage()).toBe(false);
  });

  it('returns false for profile paths', () => {
    setPathname('/elonmusk');
    expect(isOnTweetDetailPage()).toBe(false);
  });

  it('returns true for paths with extra segments after status id', () => {
    setPathname('/user/status/123456/photo/1');
    expect(isOnTweetDetailPage()).toBe(true);
  });
});

// ─── extractMainTweetData ─────────────────────────────────────────────────────

describe('extractMainTweetData', () => {
  it('extracts text and author from detail page DOM', () => {
    setPathname('/user/status/123');

    const tweetText = document.createElement('div');
    tweetText.setAttribute('data-testid', 'tweetText');
    tweetText.textContent = 'Hello world';

    const userName = document.createElement('div');
    userName.setAttribute('data-testid', 'User-Name');
    userName.textContent = '@testuser';

    document.body.appendChild(tweetText);
    document.body.appendChild(userName);

    const result = extractMainTweetData();
    expect(result).toEqual({
      text: 'Hello world',
      author: '@testuser',
      url: 'https://x.com/user/status/123',
    });

    document.body.innerHTML = '';
  });

  it('returns null when no tweetText element exists', () => {
    document.body.innerHTML = '';
    const result = extractMainTweetData();
    expect(result).toBeNull();
  });

  it('trims whitespace from tweet text', () => {
    const tweetText = document.createElement('div');
    tweetText.setAttribute('data-testid', 'tweetText');
    tweetText.textContent = '  spaced out text  ';
    document.body.appendChild(tweetText);

    const result = extractMainTweetData();
    expect(result?.text).toBe('spaced out text');

    document.body.innerHTML = '';
  });

  it('returns undefined author when User-Name is missing', () => {
    const tweetText = document.createElement('div');
    tweetText.setAttribute('data-testid', 'tweetText');
    tweetText.textContent = 'orphan tweet';
    document.body.appendChild(tweetText);

    const result = extractMainTweetData();
    expect(result?.author).toBeUndefined();

    document.body.innerHTML = '';
  });
});

// ─── extractTweetData ─────────────────────────────────────────────────────────

describe('extractTweetData', () => {
  it('extracts text and author from article element', () => {
    setPathname('/home');
    const article = createTweetElement('Great tweet', '@author');

    const result = extractTweetData(article);
    expect(result).toEqual({
      text: 'Great tweet',
      author: '@author',
      url: 'https://x.com/home',
    });
  });

  it('returns null when tweetText is not found in element', () => {
    const empty = document.createElement('div');
    const result = extractTweetData(empty);
    expect(result).toBeNull();
  });

  it('returns undefined author when no author element exists', () => {
    const article = createTweetElement('no author tweet');
    const result = extractTweetData(article);
    expect(result?.author).toBeUndefined();
  });

  it('trims whitespace from extracted text', () => {
    const article = createTweetElement('  padded text  ', '@user');
    const result = extractTweetData(article);
    expect(result?.text).toBe('padded text');
  });

  it('falls back to User-Names testid', () => {
    const article = document.createElement('article');

    const tweetText = document.createElement('div');
    tweetText.setAttribute('data-testid', 'tweetText');
    tweetText.textContent = 'fallback test';
    article.appendChild(tweetText);

    const userName = document.createElement('div');
    userName.setAttribute('data-testid', 'User-Names');
    userName.textContent = '@fallback';
    article.appendChild(userName);

    const result = extractTweetData(article);
    expect(result?.author).toBe('@fallback');
  });
});
