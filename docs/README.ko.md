<p align="center"><img src="didit-mark.svg" alt="didit" width="152" /></p>
<h1 align="center">didit</h1>
<p align="center"><strong>AI 코딩 작업을 위한 검증 영수증</strong><br />머지하기 전에 무엇이 실제로 통과했는지 확인하세요.</p>
<p align="center"><a href="../README.md">English</a> · <strong>한국어</strong> · <a href="../docs/README.ja.md">日本語</a></p>
<p align="center"><a href="#quickstart">빠른 시작</a> · <a href="#why">왜 didit인가요?</a> · <a href="#how">작동 방식</a> · <a href="#ci">CI 및 보고서</a> · <a href="#faq">자주 묻는 질문</a></p>

> **프리뷰 · 계정, API 키, 런타임 의존성 없음**

---

<a id="why"></a>
## 왜 didit인가요?

AI가 “테스트가 통과했습니다”라고 말해도 지금 코드에서 실행했는지, 로컬 테스트인지 CI인지, 운영에서도 확인했는지는 별개입니다. **didit**은 명령을 실제로 실행하고 종료 코드를 Git 스냅샷에 연결합니다. 영수증을 PR에 붙이면 통과한 검사, 코드가 바뀌어 유효하지 않은 결과, 아직 하지 않은 검사를 구분할 수 있습니다.

**PR에 붙일 영수증 예시**

| Check | Status |
| --- | --- |
| Local command | Not checked |
| CircleCI | Not checked |
| Production deployment | Not checked |
| Live smoke test | Not checked |
| test | Passed (exit 0) · 1842 ms |

<a id="quickstart"></a>
## 빠른 시작

**Node.js 22 이상**과 **Git**이 필요합니다. npm으로 전역 설치하거나 `npx`로 설치 없이 실행할 수 있습니다.

```sh
npm install -g @mokasdev/didit
npx @mokasdev/didit --help
```

설치 후 검사할 Git 저장소로 이동하세요. 소스에서 개발 중이라면 전역 설치 대신 `npm link`를 사용할 수 있습니다.

```sh
didit init
didit check
didit report --profile default
```

`init`은 기존 파일을 덮어쓰지 않고 기본 설정을 만듭니다. 기본값은 Node 테스트 러너이므로 프로젝트에 맞는 검사 명령으로 바꿔 주세요.

`didit.config.json`에 검사 이름과 명령을 지정하고 `quick`, `default`, `release` 같은 프로필로 묶을 수 있습니다. 명령은 Git 저장소 루트에서 실행됩니다. 익숙하지 않은 저장소라면 먼저 설정의 명령을 확인하세요. [예제 설정](../examples/didit.config.json)

```sh
didit check --profile quick --dry-run
didit check --profile quick --fail-fast
didit report --profile quick
```

`--only syntax,test`로 일부 검사만 선택하고, `--dry-run`으로 실행 목록을 미리 보고, `--fail-fast`로 첫 실패에서 멈출 수 있습니다. Windows에서 npm을 실행할 때는 예제 설정처럼 `cmd.exe`를 명시하세요.

<a id="how"></a>
## 작동 방식

1. **실행.** 설정된 명령을 실행하고 종료 코드와 실행 시간을 기록합니다.
2. **연결.** 실행 전후의 Git HEAD, 인덱스, 추적 중인 파일과 ignore되지 않은 파일 내용을 비교합니다.
3. **확인.** 검사 도중 변경이 감지되면 `Unverified`, 검사 이후 코드가 바뀌면 `Stale`로 표시합니다. 프로필 검증은 현재 설정에 정의된 명령의 유효한 통과 기록만 인정합니다.

<a id="ci"></a>
## CI 및 보고서

PR에는 **Markdown**, 자동화 스크립트에는 **JSON**, CircleCI 같은 CI의 테스트 결과 수집에는 **JUnit XML**을 사용하세요. 보고서 자체가 스냅샷을 바꾸지 않도록 저장소 밖이나 Git에서 무시하는 경로에 저장하세요. 프로필 검증에 실패하면 보고서는 출력하되 종료 코드 `1`을 반환합니다.

```sh
didit report --profile default --format json
didit report --profile default --format junit
```

CircleCI, 배포, 실서비스 스모크 테스트는 수동으로 기록할 수도 있습니다. 수동으로 기록했음을 명시하며 필수 검사를 통과한 것으로 간주하지 않습니다. didit이 링크나 실행 ID를 직접 검증하지는 않습니다.

```sh
didit record circleci passed --ref build-42
didit report
```

<a id="faq"></a>
## 자주 묻는 질문

### AI 에이전트나 외부 서비스인가요?

아닙니다. 로컬이나 이미 사용 중인 CI에서 검사 명령을 실행합니다. LLM을 호출하지 않습니다.

### 영수증이 확인하지 않는 범위는 무엇인가요?

Git에서 무시하는 파일, 의존성, 환경 변수, 스냅샷 사이에 나타났다가 사라진 변경은 포함하지 않습니다. 영수증은 서명된 증명이 아니며 명령의 인수나 출력은 저장하지 않습니다.

### 설정 없이 검사 한 개만 실행할 수 있나요?

네. `didit run --check test -- node --test`를 실행하고 `didit report --require test`로 확인하세요.

## 기여하기

변경을 제출하기 전에 `npm test`를 실행해 주세요. 버그를 제보하실 때는 OS, Node와 Git 버전, 문제를 재현하는 최소 명령이나 설정을 함께 알려주세요.

[MIT](../LICENSE)
