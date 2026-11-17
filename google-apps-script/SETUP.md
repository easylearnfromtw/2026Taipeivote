# 2026Taipeivote：Google 登入與試算表設定

此專案的網頁和 Apps Script 需要分別部署。完成設定前，網站不會收票。請先使用測試資料驗證，再讓真實使用者填寫。

## 功能與時程

- 參與者點選候選人後，先以 Google 帳號登入，再填寫名稱、年齡、性別、最高學歷及學校，確認後送出。
- 每個 Google 帳號限送出一次；這不保證每個自然人只能投一次，也不驗證臺北市選舉資格。
- 伺服器於 **2026-11-27 12:00（臺灣時間）**停止收票。**2026-11-28 16:00**起才提供公開統計；截止前伺服器不提供統計結果。
- 公開圖表依年齡層、最高學歷層級與性別呈現。學校名稱另存於參與者資料，不製作逐校投票圖表。
- 分組總數少於 30 人，或任一非零候選人數少於 5 人，整個分組不公布；若同一維度有無法顯示的分組，該維度整體隱藏，以降低從總數倒推的風險。
- 帳號去重碼與填寫資料存於 `Voters`，候選人計數存於 `Counts`。這只能降低直接連結，**不能保證匿名**：有權限的管理者仍可能根據存取與變更紀錄推測個人的選擇。
- 這是自願參與的網路調查，非隨機抽樣，不能代表全體選民。

## 一、建立 Google Cloud 專案與登入憑證

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)，建立或選擇你要使用的專案，啟用 **Google Sheets API**。
2. 在 Google Auth Platform 設定 OAuth 同意畫面，填寫應用程式名稱、支援電子郵件及聯絡資訊。依 Google 畫面完成受眾設定；測試模式只允許已加入的測試帳號，正式開放前要確認發布狀態和 Google 的要求。
3. 建立「OAuth 用戶端 ID」，類型選 **網頁應用程式**。在「已授權的 JavaScript 來源」加入：

   `https://easylearnfromtw.github.io`

   在「已授權的重新導向 URI」也加入同一個來源：

   `https://easylearnfromtw.github.io`

4. 保存產生的 **用戶端 ID** 與 **用戶端密鑰**。密鑰只能放在 Apps Script 的指令碼屬性中，**不要上傳 GitHub，也不要傳給別人**。

## 二、建立試算表與程式

1. 建立一份新的 Google 試算表。不要設成「知道連結的任何人可檢視」，只讓可信任的管理人員存取。
2. 在試算表選「擴充功能 → Apps Script」。將專案中的 `Code.gs` 完整內容貼到 Apps Script 的 `Code.gs`。
3. 新增一個 HTML 檔，名稱輸入 `Bridge`，貼上 `Bridge.html` 的完整內容。
4. 在專案設定啟用「在編輯器中顯示 appsscript.json 資訊清單」，再用本資料夾 `appsscript.json` 的內容取代該資訊清單。這會加入 Sheets 進階服務與必要權限。
5. 若 Apps Script 已連結**標準 Google Cloud 專案**，請確認該專案已啟用 Google Sheets API；可使用第一節建立的專案，並在 Apps Script 專案設定中連結。Google Cloud 專案號碼不是 OAuth 用戶端 ID。

## 三、設定私密屬性並初始化

在 Apps Script「專案設定 → 指令碼屬性」新增：

| 屬性名稱 | 值 |
| --- | --- |
| `GOOGLE_CLIENT_ID` | 第一節建立的 OAuth 用戶端 ID |
| `GOOGLE_CLIENT_SECRET` | 對應的 OAuth 用戶端密鑰，保密 |
| `PRIVACY_CONTROLLER` | 你的姓名或組織名稱，會顯示給參與者 |
| `PRIVACY_CONTACT` | 供參與者查詢、更正或刪除資料的聯絡方式，會公開顯示 |
| `RETENTION_POLICY` | 你實際採用的保存期限，例如「至 2026 年 12 月 31 日」；會公開顯示 |

接著回到編輯器，從函式選單選 `setup`，按「執行」並依畫面授權。程式會建立 `Voters`、`Counts` 工作表和 `SHEET_ID`、`HASH_KEY` 兩個指令碼屬性。不要修改或刪除 `HASH_KEY`：它用來辨識是否已投票，變更後會破壞去重。

**保存期限不會自動刪除資料**，請由管理者在所告知的期限執行刪除與備份清理；不要公開或共用試算表、Apps Script 的編輯權限，或 Google Cloud 密鑰。選擇符合你實際作業的聯絡方式與期限。

## 四、部署並連接網站

1. 按「部署 → 新增部署作業」，類型選「網頁應用程式」。執行身分選 **我**，具有存取權的使用者選 **所有人**；這是讓網站呼叫程式，並不代表應公開試算表。
2. 完成部署後，複製以 `https://script.google.com/macros/s/` 開頭、`/exec` 結尾的網址。
3. 開啟 GitHub 專案中的 `poll-config.js`，只填入兩個公開值：

   ```js
   window.POLL_CONFIG = Object.freeze({
     googleClientId: '1234567890-example.apps.googleusercontent.com',
     bridgeUrl: 'https://script.google.com/macros/s/EXAMPLE/exec'
   });
   ```

   **不要**把用戶端密鑰、`HASH_KEY` 或試算表資料放在此檔案。
4. 將變更提交到 `main`，等 GitHub Pages 部署完成。若瀏覽器仍顯示舊設定，稍等快取更新後重新整理。
5. 檢查 Apps Script 版本是否是最新部署版本。修改程式後，須在「管理部署作業」將網頁應用程式更新為新版本；只有按儲存不會更新已部署的程式。

## 五、上線前測試

使用**自己的測試帳號與測試資料**：

1. 開啟網站，點選候選人，確認 Google 登入視窗與各欄位可正常操作。送出後確認 `Voters` 和 `Counts` 都有紀錄。
2. 同一 Google 帳號重新登入，應顯示已投票；另一測試帳號應可填答。確認試算表沒有公開分享。
3. 使用不同尺寸手機與電腦測試。尤其 Google 的登入彈窗、第三方 Cookie／內嵌瀏覽器限制可能依裝置而異。
4. 網路中斷或送出逾時後，先重新登入確認是否已投票；不要直接假設失敗。Apps Script、Google OAuth 和 Sheets 有各自的配額與流量限制，不適合未經壓力測試就用於大量正式蒐集。
5. 如果登入視窗無法開啟，請在 Safari 或 Chrome 直接開啟網站，並核對 OAuth 來源、發布狀態及測試帳號；如果一直顯示無法連線，確認 `/exec` 網址、部署權限、指令碼屬性和 Apps Script 執行紀錄。

## 公開報告的時間

依[中選會對 2026 地方選舉的說明](https://web.cec.gov.tw/central/article/65794)，自 11 月 18 日零時至 11 月 28 日下午 4 時前，不得發布選舉民調或具民調外觀的資料。這份設定保留 11 月 27 日中午停止收票，但把真實統計公開時間設於 11 月 28 日下午 4 時。請在實際公開前再次核對最新規定與自身個資告知義務。
