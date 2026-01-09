# Gemini 3 Pro Prompting Best Practices

Xcho 댓글 생성 프롬프트 작성 시 참조하는 가이드입니다.

## Core Principles (핵심 원칙)

### 1. 직접성 우선 (Directness Over Politeness)
- "please", "kindly" 등 공손한 표현 제거
- 실행 가능한 명령으로 작성
- 목표를 명확하게 선언

```xml
<!-- Bad -->
<goal>Please write a reply that could be helpful.</goal>

<!-- Good -->
<goal>Write a single reply that sounds genuinely human and could spark engagement.</goal>
```

### 2. XML 구조화 (Structured Prompting)
Gemini 3는 XML 태그로 구분된 섹션을 정확히 이해합니다.

**권장 순서:**
```
<role> → <goal> → <context> → [선택적 섹션들] → <constraints> → <self-check>
```

### 3. Temperature = 1.0 유지
- Gemini 3 Pro는 temperature 1.0에서 최적화됨
- 낮은 값: 반복/루핑 현상 발생
- 높은 값: 일관성 저하

### 4. Self-Check 섹션 필수
생성 전 자가 검증을 요청하면 품질이 향상됩니다.

```xml
<self-check>
Before outputting, verify:
- Does this sound like a real person with opinions?
- Is the tone authentic to the requested style?
- Would this feel natural in a Twitter thread?
</self-check>
```

### 5. 예시 > 설명 (Examples Over Descriptions)
추상적 설명보다 Good/Bad 예시가 효과적입니다.

```xml
<reply-style>
Good replies feel like THIS:
- "Wait, this happened to me last week. The fix was simpler than I thought"
- "Counterpoint: what if the real issue is we're measuring the wrong thing?"

Bad replies feel like THIS:
- "Great point! Totally agree!" (generic validation)
- "This is so important for everyone to understand" (corporate speak)
</reply-style>
```

---

## Xcho 프롬프트 섹션 순서

| 순서 | 섹션 | 필수 | 설명 |
|-----|------|-----|------|
| 1 | `<role>` | O | 정체성과 관점 설정 |
| 2 | `<goal>` | O | 주요 목표 선언 |
| 3 | `<context>` | O | 트윗 내용 |
| 4 | `<persona-tone>` | X | 사용자 분석된 스타일 |
| 5 | `<user-intent>` | X | 사용자가 입력한 의도 |
| 6 | `<pronoun-guidance>` | O | 대명사 가이드라인 |
| 7 | `<stance>` | O | 동의/비동의/질문/중립 |
| 8 | `<reply-style>` | O | 톤 + 길이 + 예시 |
| 9 | `<constraints>` | O | 제약사항 목록 |
| 10 | `<self-check>` | O | 출력 전 검증 |

---

## 한글 입력 처리

Gemini 3 Pro는 한국어를 잘 이해합니다. 별도 번역 단계 없이 의미를 직접 파악합니다.

```xml
<user-intent>
The user wants this specific approach for their reply:
"이 주장에 반박하고 싶어"

Incorporate this intent naturally into the reply while maintaining the selected tone and stance.
If the intent is in Korean, understand the meaning and apply it to the English reply.
</user-intent>
```

**예시 한글 입력:**
- "이 주장에 반박하고 싶어" → 반박 의도 반영
- "공감하면서 내 경험 공유" → 공감 + 경험 공유
- "살짝 비꼬는 느낌으로" → 약간의 비꼼/아이러니
- "유머러스하게 질문하기" → 유머 + 질문

---

## 대명사 가이드라인

트윗 주체를 파악하여 적절한 대명사를 사용해야 합니다.

```xml
<pronoun-guidance>
Before replying, identify WHO the tweet is about:
- Tweet author's experience: use "you"
- Third party (person/company): use "they", "he", "she", or name
- Shared experience/community: use "we"

Examples:
- "Elon just announced new pricing" → "he" or "Elon"
- "I tried the new feature today" → "you"
- "Developers are frustrated" → "they"
</pronoun-guidance>
```

---

## 주의사항 (Common Pitfalls)

### 피해야 할 것
- ❌ 과도한 공손함 ("please", "kindly", "would you mind")
- ❌ 중복 지시 (같은 내용 반복)
- ❌ 모호한 표현 ("make it good", "be helpful")
- ❌ 광범위한 부정 지시 ("do not infer", "do not guess")

### 권장하는 것
- ✅ 구체적, 측정 가능한 기준
- ✅ 대조적 예시 (good vs bad)
- ✅ 명확한 제약사항 번호 매기기
- ✅ 출력 형식 명시 ("Output only the reply text")

---

## 프롬프트 테스트 체크리스트

프롬프트 수정 후 다음을 확인하세요:

1. **다양한 트윗 유형 테스트**
   - [ ] 개인 경험 공유 트윗
   - [ ] 뉴스/정보 공유 트윗
   - [ ] 질문형 트윗
   - [ ] 제3자 언급 트윗
   - [ ] 논쟁적 의견 트윗

2. **대명사 확인**
   - [ ] 작성자 경험 → "you" 사용
   - [ ] 제3자 언급 → "they/he/she" 사용
   - [ ] 그룹 언급 → "they" 사용

3. **사용자 의도 반영**
   - [ ] 한글 입력이 영어 댓글에 반영됨
   - [ ] 톤/입장/길이와 조화롭게 통합됨

4. **기존 기능 정상 동작**
   - [ ] 톤 선택 반영
   - [ ] 입장 선택 반영
   - [ ] 길이 선택 반영
   - [ ] 페르소나 적용 (있는 경우)

---

## 참고 자료

- [Google Gemini 3 Prompting Guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/gemini-3-prompting-guide)
- [Phil Schmid - Gemini 3 Best Practices](https://www.philschmid.de/gemini-3-prompt-practices)
- [Global Nerdy - Gemini 3 Pro Tips](https://www.globalnerdy.com/2025/11/26/notes-on-using-gemini-3-pro-part-3-every-prompting-tip-and-trick-i-know-so-far/)
