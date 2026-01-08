# 디버깅 가이드

트윗 클릭이 감지되지 않을 때 다음 단계를 따라 문제를 진단하세요.

## 1. 익스텐션 재로드

**가장 먼저 해야 할 일:**

1. Chrome 브라우저에서 `chrome://extensions/` 접속
2. "X Comment Helper" 찾기
3. 새로고침 버튼 (🔄) 클릭
4. X(Twitter) 페이지도 완전히 새로고침 (Ctrl+Shift+R 또는 Cmd+Shift+R)

## 2. Content Script 로딩 확인

**X.com 페이지에서:**

1. X(Twitter) 웹사이트 접속 (https://x.com)
2. F12 키를 눌러 개발자 도구 열기
3. Console 탭 선택
4. 다음 메시지가 보이는지 확인:
   ```
   🚀 X Comment Helper content script loaded
   📍 Current URL: https://x.com/...
   ⏳ Initializing content script...
   📊 Found X tweets on page
   ✅ Content script initialized successfully
   ```

**만약 위 메시지가 안 보인다면:**
- 익스텐션이 로드되지 않은 것입니다
- 익스텐션을 재로드하고 X 페이지를 새로고침하세요

## 3. 트윗 클릭 테스트

**X.com에서 트윗 클릭 시 Console에 다음이 표시되어야 합니다:**

```
👆 Click detected
✅ Article element found: <article...>
🔍 Extracting tweet data from element: <article...>
📝 Tweet text: [트윗 내용]
👤 Author: [작성자]
✉️ Sending tweet data to extension: {...}
✅ Message sent successfully
```

**만약 "Click detected"가 안 나온다면:**
- 클릭 이벤트 리스너가 등록되지 않은 것입니다
- 페이지를 새로고침하세요

**"Article element found"가 안 나온다면:**
- 트윗이 아닌 다른 곳을 클릭한 것입니다
- 트윗의 텍스트 영역을 직접 클릭해보세요

**"No tweetText element found" 경고가 나온다면:**
- X.com의 DOM 구조가 변경되었을 수 있습니다
- 이슈를 리포트해주세요

## 4. Background Service Worker 확인

1. `chrome://extensions/` 접속
2. "X Comment Helper" 찾기
3. "service worker" 링크 클릭 (파란색 링크)
4. 새 DevTools 창이 열립니다
5. Console에서 다음 메시지 확인:
   ```
   X Comment Helper background service worker loaded
   ```

**트윗 클릭 시 다음이 표시되어야 합니다:**
```
Background received message: TWEET_CLICKED from {...}
Tweet clicked, opening sidepanel
Sidepanel opened successfully
```

## 5. Side Panel 확인

1. Side Panel이 열려 있는지 확인
2. Side Panel 안에서 우클릭 → "검사" (Inspect)
3. DevTools Console에서 다음 메시지 확인:
   ```
   🎧 Sidepanel: Setting up message listener
   ✅ Sidepanel: Message listener registered
   ```

**트윗 클릭 시:**
```
📨 Sidepanel received message: {type: "TWEET_CLICKED", data: {...}}
✅ Processing TWEET_CLICKED message with data: {...}
```

## 6. 일반적인 문제 해결

### 문제: "Failed to send message" 에러

**원인:** Background service worker가 비활성화됨

**해결:**
1. `chrome://extensions/` 에서 익스텐션 재로드
2. X 페이지 새로고침

### 문제: 트윗 텍스트가 추출되지 않음

**원인:** X.com의 DOM 구조 변경

**임시 해결:**
1. Content script console에서 article 요소 확인
2. 다음 명령어로 수동 테스트:
   ```javascript
   document.querySelector('article[data-testid="tweet"]')
   ```
3. null이 나온다면 X.com의 구조가 변경된 것입니다

### 문제: Side Panel이 자동으로 열리지 않음

**해결:**
- 익스텐션 아이콘을 수동으로 클릭하여 열기
- 트윗을 다시 클릭

## 7. 전체 플로우 체크리스트

✅ 익스텐션이 `chrome://extensions/`에서 활성화되어 있음
✅ X.com 페이지를 새로고침함
✅ Content script 로딩 메시지가 Console에 표시됨
✅ 트윗 개수가 Console에 표시됨 (예: "Found 20 tweets")
✅ 트윗 클릭 시 "Click detected" 메시지 표시
✅ "Message sent successfully" 메시지 표시
✅ Background worker에 메시지 도착
✅ Side Panel이 열림
✅ Side Panel에서 트윗 내용이 표시됨

## 8. 여전히 작동하지 않는다면

다음 정보와 함께 이슈를 제출해주세요:

1. Chrome 버전
2. X.com Console의 전체 로그
3. Background worker Console의 전체 로그
4. Side Panel Console의 전체 로그
5. 스크린샷

## 추가 디버깅 팁

### 트윗 셀렉터 수동 테스트

X.com 페이지 Console에서:

```javascript
// 트윗 개수 확인
document.querySelectorAll('article[data-testid="tweet"]').length

// 첫 번째 트윗 요소
const article = document.querySelector('article[data-testid="tweet"]')

// 트윗 텍스트 요소 확인
article.querySelector('[data-testid="tweetText"]')?.textContent

// Author 요소 확인
article.querySelector('[data-testid="User-Name"]')?.textContent
```

### 메시지 수동 전송 테스트

Content script context에서:

```javascript
chrome.runtime.sendMessage({
  type: 'TWEET_CLICKED',
  data: {
    text: 'Test tweet',
    author: 'Test User',
    url: window.location.href
  }
})
```
