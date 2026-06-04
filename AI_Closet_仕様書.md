# AI Closet 仕様書 / プロジェクト引き継ぎドキュメント

> このドキュメントは、AIコーディングエージェント（Antigravity 等）にプロジェクト全体を理解させ、
> **途中まで作られた状態から開発を引き継ぐ**ことを目的とした仕様書です。
> 作者: 鮭ひろき / 最終更新: 2026-06-04

---

## 1. アプリ概要

**AI Closet** は、手持ちの服を活かして毎日のコーディネートをAIが提案するスマホ向けWebアプリ。

- **ターゲット**: 「服はあるのに着る服がない」「毎朝の服選びに時間がかかる」「TPOや天気に合った服装が分からない」という悩みを持つ人
- **提供価値**:
  - 手持ちの服だけで新しいコーデを提案（無駄な購入を減らす）
  - 天気・気温・予定（カレンダー）に連動した最適コーデ
  - AIスタイリストにチャットで相談
  - 着用履歴からマンネリを回避
- **公開URL**: https://sake0hito.github.io/ai-closet-app/

---

## 2. 技術スタック

| 区分 | 採用技術 |
|---|---|
| フロントエンド | 素のJavaScript（ES Modules）/ HTML / CSS（フレームワーク不使用） |
| UIライブラリ | Lucide Icons、Chart.js 4.4 |
| 認証・DB | Firebase v10.11（Auth / Firestore / Storage） |
| AI | Google Gemini（Cloudflare Worker 経由でプロキシ） |
| ホスティング | GitHub Pages（リポジトリ: `sake0hito/ai-closet-app`、ブランチ `master`） |
| 外部API | Open-Meteo（天気）、Nominatim（逆ジオコーディング）、Google Calendar API（読み取り専用） |

---

## 3. システム構成

```
[ブラウザ / GitHub Pages のアプリ]
   ├─ Firebase Auth / Firestore / Storage … ユーザー認証・服データ・画像保存
   ├─ Cloudflare Worker (ai-closet-proxy) ─→ Google Gemini API … AI提案・画像解析
   ├─ Open-Meteo API … 天気・気温
   ├─ Nominatim … 現在地の地名取得
   └─ Google Calendar API … 今後7日間の予定取得（予定連動コーデ）
```

### Cloudflare Worker を挟む理由
Gemini の APIキーをブラウザに露出させないため。ブラウザ → Worker → Gemini と中継し、
キーは Worker のシークレット（`GEMINI_API_KEY`）として保持する。
Worker は Gemini の応答を **OpenAI互換フォーマット**（`{choices:[{message:{content}}]}`）に変換して返す
（フロント側 `callGemini()` がこの形を前提にしているため）。

- Worker URL: `https://ai-closet-proxy.liyuandagui80.workers.dev`
- モデルは無料枠が使えるものを順に試す: `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-1.5-flash`
- CORS 許可オリジン: `https://sake0hito.github.io`

---

## 4. ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | 画面の骨格（認証オーバーレイ、ヘッダー、ボトムナビ、モーダル領域） |
| `app.js` | アプリ本体（約2,200行）。状態管理・ルーティング・全機能 |
| `style.css` | デザイン（グラスモーフィズム、3テーマ: 朝/夕焼け/ダーク） |
| `cloudflare_worker.js` | AI中継プログラム（Cloudflare Worker にデプロイ） |
| `deploy_to_github.py` | GitHubへの自動デプロイ（環境変数 `GITHUB_TOKEN` を使用） |
| `qr.html` / `ai_closet_qr.png` | アプリURLのQRコード |

---

## 5. データモデル（Firestore）

### コレクション `closetItems`（クローゼットの服）
```jsonc
{
  "id": "<docId>",
  "userId": "<Firebase Auth uid>",
  "image": "<Storage の画像URL or dataURL>",
  "category": "トップス・アウター | ボトムス | 帽子 | 靴 | ワンピース | ドレス | スーツ",
  "subCategory": "Tシャツ / デニム / キャップ など",
  "colors": ["黒", "白"],
  "styles": ["カジュアル系", "きれいめ（シンプル）系", ...],
  "seasons": ["春", "夏", "秋", "冬", "オールシーズン"],
  "lightness": "明るめ / 暗め / 指定なし",
  "createdAt": 1730000000000
}
```

### コレクション `history`（着用履歴）
```jsonc
{
  "id": "<docId>",
  "userId": "<uid>",
  "dateStr": "6月4日 着用",
  "isoDate": "2026-06-04",
  "occasion": "デート など（任意）",
  "items": [
    { "image": "url", "category": "トップス・アウター", "subCategory": "", "title": "..." }
  ],
  "memo": "",
  "createdAt": 1730000000000
}
```

---

## 6. 画面構成（ルーティング）

`app.js` 内の `routes` オブジェクトで4画面を切り替え（SPA）。

- **home（ホーム）**: 時計・天気、1週間のコーデ予測カルーセル、コーデ検証ルーム、AIスタイリストチャット
- **closet（クローゼット）**: 服の一覧（2列グリッド）、フィルター、選択削除、ファッション傾向の円グラフ
- **history（着用履歴）**: リスト表示／カレンダー表示の切替、手動記録
- **settings（設定）**: テーマ、位置情報・天気、Googleカレンダー連携、AI接続テスト、ログアウト

モーダル: 服の追加（カメラ/ファイル＋AI解析）、フィルター、コーデ詳細など。

---

## 7. 実装済み機能

- ✅ Firebase認証（Googleログイン / メール+パスワード）
- ✅ クローゼット管理（写真で服を登録、カテゴリ・色・スタイル・季節タグ）
- ✅ **AI画像解析**：服の写真を Gemini が解析してタグを自動提案
- ✅ 1週間のコーデ予測（所持服優先・前日被り防止・着用履歴反映）
- ✅ コーデ検証ルーム（手持ち服を組み合わせて AI が評価）
- ✅ **AIスタイリストチャット**（クローゼット傾向・天気を文脈に含めて回答）
- ✅ 天気連動（位置情報 or 東京デフォルト → Open-Meteo）
- ✅ **Googleカレンダー連携**：今後7日間の予定を取得し、予定内容でコーデのスタイルを変える
  - 予定キーワード→スタイル対応（デート→きれいめ/フェミニン、仕事→フォーマル 等）
  - ホームに予定バッジ表示、設定に「予定を更新」「連携を解除」ボタン
- ✅ 着用履歴（手動記録＋カレンダー表示）
- ✅ ファッション傾向分析（Chart.js 円グラフ）
- ✅ 帽子レコメンド（季節・気温・天候の複合判定）
- ✅ 3テーマ切替・プライバシー配慮（位置情報は localStorage のみ）

---

## 8. 外部設定・シークレット（重要）

| 項目 | 場所 | 備考 |
|---|---|---|
| Firebase config | `app.js` 内（公開情報） | apiKey 等。クライアント公開前提なので問題なし |
| Google OAuth Client ID | `app.js` 内 | `129220662304-...apps.googleusercontent.com` |
| `GEMINI_API_KEY` | Cloudflare Worker のシークレット | **ブラウザに出さない。コードに直書き禁止** |
| `GITHUB_TOKEN` | デプロイ実行時の環境変数 | 過去に直書きで流出→無効化済み。必ず環境変数で |

### Google Cloud 側の設定（カレンダー連携）
- OAuth同意画面: **「テスト中（Testing）」モード**（審査不要・最大100ユーザー）
- テストユーザー: 利用するGoogleアカウントを登録済み
- 承認済みJavaScript生成元: `https://sake0hito.github.io`
- Google Calendar API: **有効化済み**
- ⚠️ 「アプリを公開」を押すと審査が必要になるので押さない（一般公開する場合のみ審査）

---

## 9. デプロイ手順

### アプリ（フロント）
1. `index.html` / `app.js` / `style.css` を編集
2. GitHubリポジトリ `sake0hito/ai-closet-app` の `master` に反映
   - 手段A: GitHub Web の「Upload files」でドラッグ＆ドロップ（単一ファイル向け）
   - 手段B: `deploy_to_github.py`（`$env:GITHUB_TOKEN` を設定して実行）
3. GitHub Pages が自動公開（反映に1〜2分）

### AI中継（Cloudflare Worker）
1. `cloudflare_worker.js` の内容を Worker `ai-closet-proxy` に貼り付け
2. シークレット `GEMINI_API_KEY` を設定 → デプロイ

---

## 10. 現在の進捗（直近で完了した作業）

- ✅ 流出していた GitHub トークンを無効化＋コードから削除
- ✅ AIの基盤を **OpenAI → 無料の Google Gemini に移行**
- ✅ AI中継用に専用 Worker `ai-closet-proxy` を新設（旧 `ai-closet-gemini` は静的ファイル置き場で誤用されていた）
- ✅ モデル自動フォールバック（無料枠が使えるモデルを順に試す）実装
- ✅ Googleカレンダー連携を「テストモード＋テストユーザー」で動作するよう設定
- ✅ 予定連動コーデ（スタイル切替）・予定バッジ・予定更新/解除ボタンを実装

---

## 11. 未完了・今後やりたいこと（途中の作業 / TODO）

> ※ ここは作者（鮭ひろき）が今後実装したい主要機能。Antigravity に引き継いでほしい内容。
> 優先度の高い順に4つ。各項目に実装の着手ポイントを添える。

### A. 小物系アイテムの保存対応（優先）
バッグ・ベルト・アクセサリー・眼鏡（メガネ/サングラス）・時計・マフラー・手袋などを
クローゼットに登録できるようにする。
- **着手ポイント**: `app.js` の `CATEGORIES` 定数にカテゴリ追加（例: `"小物": ["バッグ","ベルト","アクセサリー","眼鏡","サングラス","時計","マフラー","手袋"]`）。
- データモデルは既存 `closetItems`（category / subCategory）をそのまま流用可能。
- コーデ提案・コーデ詳細・検証ルームに「小物」枠を追加。帽子レコメンド（`getHatRecommendation`）と同様に、
  小物のレコメンド枠を設けると統一感が出る。

### B. 提案ルールの細かい設定（条件付き提案）
天気・気温などの条件に応じて、提案の中身を制御できるようにする。
- **例**: 気温が一定以下／雨の日は「アウター必須」とし、シャツ＋アウターをセットで提案する。
- **着手ポイント**: `generateWeeklyOutfitsFromCloset()` に、気温・天候からアウターを必須化するロジックを追加
  （現状はトップス＋ボトムスが基本で、アウターは category 内に混在）。
- 設定画面（`routes.settings`）に「提案ルール」UIを追加し、ユーザーが条件を編集できるようにする。
- ルールは localStorage か Firestore に保存。

### C. トレンドを反映したコーデ提案
「今季のトレンド」を加味した提案を出す。
- **着手ポイント**: Gemini（`callGemini`）に season/年とクローゼット傾向を渡し、
  「今のトレンドを踏まえて手持ち服でどう着るか」を問い合わせる形が現実的。
- 将来的には外部トレンド情報源との連携も検討。

### D. 「持っていないおすすめアイテム」の紹介
手持ちにない服・靴で、買うと着回しが広がるアイテムを提案する。
- **着手ポイント**: 既存のスタイル傾向集計（`initStyleChart` の `styleCounts`）＋ Gemini を使い、
  「不足しているカテゴリ／色／スタイル」を分析して提案テキストを生成。
- まずはAIによる提案文から始め、将来的にECリンク等の連携も視野。

### その他の技術的TODO（小粒）
- [ ] 予定連動の高度化：現在はキーワード一致でスタイル選択。AIに予定文を渡して柔軟に判断させたい
- [ ] カレンダー予定の自動更新（現在は手動「予定を更新」ボタンのみ。起動時の自動再取得は未実装）
- [ ] 一般公開する場合は Google OAuth の審査対応（現在はテストモードで最大100人）
- [ ] 旧 Worker（`ai-closet-gemini` / `ai-closet-app`）の整理（未使用の静的アセット置き場）
- [ ] `app.js` の旧 `GEMINI_API_KEY` 参照やメッセージ文言の整合性チェック

---

## 12. 既知の注意点・ハマりどころ

- AIが動かない時は **設定→AI接続テスト** で原因を切り分け（Worker URL / シークレット / モデル）
- カレンダーの予定が0件の時は、予定が「今後7日以内」かつ「primaryカレンダー」に入っているか確認
- Worker のレスポンスは必ず OpenAI互換形に変換すること（フロントの `callGemini()` が依存）
- 位置情報・カレンダーはプライバシー配慮：位置は端末内のみ、カレンダーは読み取り専用
