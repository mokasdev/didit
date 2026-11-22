<p align="center"><img src="didit-mark.svg" alt="didit" width="152" /></p>
<h1 align="center">didit</h1>
<p align="center"><strong>AI コーディングのための検証レシート</strong><br />マージする前に、何が実際に通ったかを確認。</p>
<p align="center"><a href="../README.md">English</a> · <a href="../docs/README.ko.md">한국어</a> · <strong>日本語</strong></p>
<p align="center"><a href="#quickstart">クイックスタート</a> · <a href="#why">なぜ didit？</a> · <a href="#how">仕組み</a> · <a href="#ci">CI とレポート</a> · <a href="#faq">よくある質問</a></p>

> **プレビュー · アカウント、API キー、実行時依存なし**

---

<a id="why"></a>
## なぜ didit？

AI が「テストは通りました」と答えても、現在のコードで実行したのか、CI や本番でも確認したのかは別の話です。**didit** はチェックを実行し、終了コードを Git スナップショットに紐付けます。レシートを PR に貼れば、合格した項目、古くなった結果、未確認の項目を区別できます。

**PR に貼り付けるレシートの例**

| Check | Status |
| --- | --- |
| Local command | Not checked |
| CircleCI | Not checked |
| Production deployment | Not checked |
| Live smoke test | Not checked |
| test | Passed (exit 0) · 1842 ms |

<a id="quickstart"></a>
## クイックスタート

**Node.js 22 以降**と **Git** が必要です。npm でグローバルにインストールするか、`npx` で一度だけ実行できます。

```sh
npm install -g @mokasdev/didit
npx @mokasdev/didit --help
```

インストール後、検証対象の Git リポジトリに移動します。ソースで開発する場合はグローバルインストールの代わりに `npm link` を使えます。

```sh
didit init
didit check
didit report --profile default
```

`init` は既存の設定を上書きせず、初期設定を作成します。既定では Node のテストランナーを使うので、プロジェクトに合わせて変更してください。

`didit.config.json` でチェックを定義し、`quick`、`default`、`release` などのプロファイルにまとめられます。コマンドは Git リポジトリのルートで実行されます。初めて扱うリポジトリでは、実行前に設定を確認してください。 [設定例](../examples/didit.config.json)

```sh
didit check --profile quick --dry-run
didit check --profile quick --fail-fast
didit report --profile quick
```

`--only syntax,test` で対象を指定し、`--dry-run` で実行予定を確認し、`--fail-fast` で最初の失敗時に停止できます。Windows で npm を起動する場合は、設定例のように `cmd.exe` を明示してください。

<a id="how"></a>
## 仕組み

1. **実行。** 設定したコマンドを実行し、終了コードと実行時間を記録します。
2. **紐付け。** 実行前後の Git HEAD、インデックス、追跡済みファイルと無視されていないファイルの内容を比較します。
3. **確認。** 実行中の変更は `Unverified`、実行後の変更は `Stale` と表示されます。プロファイルは現在の設定で実行した有効な合格記録だけを認めます。

<a id="ci"></a>
## CI とレポート

PR には **Markdown**、自動化スクリプトには **JSON**、CircleCI などのテスト結果収集には **JUnit XML** を使えます。レポートはリポジトリの外、または Git の無視対象に保存してください。プロファイルの検証に失敗した場合もレポートを出力し、終了コード `1` を返します。

```sh
didit report --profile default --format json
didit report --profile default --format junit
```

CircleCI、デプロイ、本番スモークテストの結果は手動で記録できます。手動記録であることが表示され、必須チェックの合格にはなりません。didit は参照先を取得せず、独自の検証も行いません。

```sh
didit record circleci passed --ref build-42
didit report
```

<a id="faq"></a>
## よくある質問

### AI エージェントやホスティングサービスですか？

いいえ。ローカル、または既存の CI で設定したコマンドを実行します。LLM は呼び出しません。

### レシートで確認できないものは？

無視対象のファイル、依存関係、環境変数、スナップショット間だけに存在した変更は対象外です。レシートは署名付き証明ではなく、コマンドの引数や出力も保存しません。

### 設定なしで一つのチェックだけ実行できますか？

はい。`didit run --check test -- node --test` を実行し、`didit report --require test` で確認します。

## コントリビュート

変更を提出する前に `npm test` を実行してください。不具合の報告には、OS、Node と Git のバージョン、再現に必要な最小限のコマンドや設定を添えてください。

[MIT](../LICENSE)
