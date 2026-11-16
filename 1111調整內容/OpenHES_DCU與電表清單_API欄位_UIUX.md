# OpenHES「DCU 清單／電表清單」API 欄位整理（UI/UX 版）

> 對象：UI/UX 設計人員  
> 頁面：裝置管理 → DCU 清單、裝置管理 → 電表清單  
> 整理基準：目前前端 `develop`／`v0.3.5` 實際使用的頁面、Service 與資料轉換邏輯  
> 更新日期：2026-11-11

## 1. 閱讀方式

- **API 欄位**：後端傳入或前端送出的原始名稱。
- **畫面名稱**：使用者實際看到的文案。
- **衍生欄位**：不是後端直接提供顯示文字，而是前端由一個或多個欄位組合／判斷。
- 空字串、`null` 或無法判讀的值，UI 應視為「無資料」，不要誤顯示成 `0`、離線或停用。
- 清單排序與分頁目前由前端資料表處理，不是 API 分頁。

---

## 2. 兩頁共用的區域選擇

頁首的區域選擇會影響 DCU 清單與電表清單的查詢範圍。

### API

`GET /dropdowns/area-codes`

| API 欄位 | 畫面用途 | UI/UX 說明 |
|---|---|---|
| `tpcAreaCode` | 選項值、查詢參數 | 選定後傳給清單 API；選「全區域」時不傳。 |
| `areaName` | 區域選項名稱 | 顯示在頁首下拉選單。 |
| `description` | 補充描述 | 目前未直接顯示，可保留作 tooltip 或說明文字。 |

### 互動

- 區域變更後，兩頁都會自動重新查詢。
- 「全區域」代表 `tpcAreaCode` 不帶值，不是傳入 `ALL`。

---

## 3. DCU 清單

### 3.1 主要清單 API

`GET /dcus/summary`

### 3.2 查詢／篩選欄位

| UI 控制項 | API query | 值與規則 |
|---|---|---|
| 頁首區域 | `tpcAreaCode` | 區域代碼；全區域時省略。 |
| 營業區 | `tpcBuCode` | 限 2 碼數字。 |
| 選擇 DCU | `commModel` | DCU 型號；「所有型號」時省略。 |
| 狀態 | `enabled` | 啟用=`1`、停用=`0`、全部時省略。 |
| 通訊方式 | `commType` | 目前 UI 選項：LTE、ADSL、4G-R、SATCOM；全部時省略。 |
| 頻道組別 | `channelType` | 選擇「全部」時省略。 |
| DCU 群組 | `groupId` | 傳群組 ID，不是群組名稱。 |
| 搜尋：DCU 序號 | `dcuId` | 搜尋類型選「DCU序號」時使用。 |
| 搜尋：DCU 編號 | `districtId` | 搜尋類型選「DCU編號」時使用。 |

> 篩選器改值後不立即查詢；按「搜尋」才送出。只有頁首區域變更會自動查詢。

### 3.3 回傳欄位與畫面對應

| API 欄位 | 型別／缺值 | 畫面名稱或用途 | 顯示邏輯 |
|---|---|---|---|
| `dcuId` | `string`，必要 | DCU序號 | 清單識別值；也用於開啟詳細資料與 Topology。 |
| `districtId` | `string?` | DCU編號 | 缺值顯示空白／無資料。 |
| `tpcAreaCode` | `string?` | 區處及營業區 | 與 `areaName`、`tpcBuCode` 組合。 |
| `areaName` | `string?` | 區處及營業區 | 顯示名稱。 |
| `tpcBuCode` | `string?` | 區處及營業區 | 組合結果範例：`07-台中 86`；全部缺值時顯示 `-`。 |
| `online` | `boolean/null` | 連線狀態 | `true`→在線、`false`→離線、無法判讀→`-`；搭配狀態色點。 |
| `enabled` | `boolean/0/1/string/null` | 狀態 | 啟用、停用或 `-`。目前不直接使用 API 的 `status` 文案。 |
| `meterCount` | `number/null` | 電表數 | 缺值應保留為無資料，不應當成 0。 |
| `onlineMeterCount` | `number/null` | 已連接電表／白名單電表連線數 | 當 `whiteList=true` 時作為「白名單電表連線數」；也用於匯出與詳細頁上下文。 |
| `channelType` | `string?` | 頻道組別 | 文字欄位。 |
| `commType` | `string?` | 通訊方式 | 文字欄位。 |
| `customerAddress` | `string?` | 地址 | 長文字需截斷並提供完整內容查看方式。 |
| `ipAddress` | `string?` | IP | 文字欄位。 |
| `commScenario` | `string?` | 模式 | 目前直接顯示後端值。 |
| `whiteList` | `boolean/null` | 白名單 | `true`→已加入、`false`→未加入、缺值→無資料。 |
| `eventCount` | `number/null` | 詳細資料圖示 badge | 大於 0 才顯示數字 badge；0 或缺值不顯示。 |

### 3.4 表格欄位順序

1. DCU序號（固定左欄，可排序）
2. DCU編號
3. 連線狀態
4. 狀態（可排序）
5. 電表數（可排序）
6. 地址（可排序）
7. 區處及營業區（可排序）
8. 白名單電表連線數（可排序）
9. 頻道組別（可排序）
10. 通訊方式（可排序）
11. IP（可排序）
12. 模式（可排序）
13. 白名單
14. 操作（固定右欄）

### 3.5 篩選選項 API

| 用途 | API | 回傳重點 |
|---|---|---|
| DCU 型號 | `GET /dropdowns/dcu-comm-models` | `string[]`；UI 前置加入「所有型號」。 |
| 頻道組別 | `GET /dropdowns/dcu-channel-types` | `string[]`；UI 前置加入「全部」。 |
| DCU 群組 | `GET /dcu-groups` | `id`、`groupName`、`groupDcuCount`／`memberCount`；清單顯示名稱、查詢傳 ID。 |

### 3.6 操作與匯出

- **DCU 詳細資料**：使用 `dcuId` 開啟；`eventCount` 可顯示 badge。
- **Topology**：使用 `dcuId` 開啟。
- **裝置設定**：以右側面板開啟。
- **CSV 匯出**：DCU序號、DCU編號、區域、地址、IP位址、電表數量、已連接電表、連線狀態、狀態。

---

## 4. 電表清單

### 4.1 主要清單 API

`GET /meters/summary`

### 4.2 查詢／篩選欄位

| UI 控制項 | API query | 值與規則 |
|---|---|---|
| 頁首區域 | `tpcAreaCode` | 區域代碼；全區域時省略。 |
| 營業區 | `tpcBuCode` | 限 2 碼數字。 |
| 電表分類 | `meterClass` | 目前 UI 選項 A、B；ALL 時省略。 |
| 選擇模組 | `commModel` | 模組型號；「所有型號」時省略。 |
| 狀態 | `enabled` | 啟用=`true`、停用=`false`、全部時省略。 |
| 電表群組 | `meterGroupId` | 傳群組 ID；ALL 時省略。 |
| DCU：DCU 編號 | `districtId` | DCU 搜尋類型為「DCU編號」時使用。 |
| DCU：DCU 序號 | `dcuId` | DCU 搜尋類型為「DCU序號」時使用。 |
| 搜尋：表號 | `meterId` | 依搜尋類型擇一傳送。 |
| 搜尋：電號 | `originCustomerId` | 前端會移除 `-` 後送出。 |
| 搜尋：FAN MAC | `commId` | 依搜尋類型擇一傳送。 |
| 搜尋：FAN IMSI | `imsi` | 依搜尋類型擇一傳送。 |
| 搜尋：模組序號 | `commSerial` | 依搜尋類型擇一傳送。 |

> 電表清單至少要有一個有效篩選條件才查詢。全部條件為空時顯示提示：「請先選擇區處、輸入營業區、DCU 序號或表號，再按搜尋」。

### 4.3 回傳欄位與畫面對應

| API 欄位 | 型別／缺值 | 畫面名稱或用途 | 顯示邏輯 |
|---|---|---|---|
| `meterId` | `string`，必要 | 表號 | 主要識別值；用於開啟電表詳細資料。 |
| `originCustomerId` | `string?` | 電號 | 前端格式化後顯示。 |
| `tpcAreaCode` | `string?` | 區處及營業區 | 與 `areaName`、`tpcBuCode` 組合。 |
| `areaName` | `string?` | 區處及營業區 | 顯示名稱。 |
| `tpcBuCode` | `string?` | 區處及營業區 | 組合結果範例：`07-台中 86`；全部缺值時顯示 `-`。 |
| `online` | `boolean?` | 連線狀態 | `true`→在線、`false`→離線、缺值→`-`；搭配狀態色點。 |
| `enabled` | `boolean?` | 啟用狀態／詳細頁上下文 | 目前清單沒有獨立「狀態」欄，但詳細流程仍保留此狀態。 |
| `customerAddress` | `string?` | 地址 | 長文字需截斷並提供完整內容查看方式。 |
| `commModel`（備援 `moduleModel`） | `string?` | 模組型號 | 優先使用 `commModel`。 |
| `districtId`（備援 `dcuNumber`） | `string?` | DCU編號 | 文字欄位。 |
| `dcuId`（備援 `dcuSerial`） | `string?` | DCU序號 | 文字欄位。 |
| `commId`（備援 `fanMac`） | `string?` | FAN MAC | 文字欄位。 |
| `commSerial`（備援 `moduleSerial`） | `string?` | 模組序號 | 文字欄位。 |
| `ipAddress` | `string?` | IP | 文字欄位。 |
| `latestLP` | ISO 時間字串? | 最後LP時間 | 格式化為 `YYYY/MM/DD HH:mm`；缺值顯示 `--`。 |
| `latestMn` | ISO 時間字串? | 最後MN時間 | 格式化為 `YYYY/MM/DD HH:mm`；缺值顯示 `--`。 |
| `eventCount` | `number?` | 詳細資料圖示 badge | 大於 0 才顯示數字 badge；缺值按 0 處理。 |

### 4.4 表格欄位順序

1. 區處及營業區（固定左欄，可排序）
2. 連線狀態
3. 電號（可排序）
4. 表號（可排序）
5. 模組型號（可排序）
6. DCU編號
7. DCU序號
8. FAN MAC（可排序）
9. 模組序號
10. 地址（可排序）
11. IP
12. 最後LP時間
13. 最後MN時間
14. 操作（固定右欄）

### 4.5 篩選選項 API

| 用途 | API | 回傳重點 |
|---|---|---|
| 模組型號 | `GET /dropdowns/meter-comm-models` | `string[]`；UI 去除重複值並前置加入「所有型號」。 |
| 電表群組 | `GET /meter-groups` | `id`、`groupName`、`createdBy`、`groupMeterCount`／`memberCount`；選項目前顯示「建立者＋群組名稱＋成員數」，查詢傳 ID。 |

### 4.6 操作與匯出

- **電表詳細資料**：使用 `meterId` 開啟；`eventCount` 可顯示 badge。
- **裝置設定**：以右側面板開啟。
- **CSV 匯出**：區處及營業區、連線狀態、連線狀態值、表號、電號、裝置編號、地址、模組型號、DCU編號、DCU序號、FAN MAC、模組序號、IP、最後LP時間、最後MN時間、事件數。

---

## 5. UI/UX 狀態設計建議

兩頁至少需要明確區分下列狀態，避免都呈現成空表格：

| 狀態 | 建議畫面 |
|---|---|
| 初始、尚未輸入條件 | 顯示操作提示，不顯示「查無資料」。電表清單目前採此方式。 |
| 載入中 | 表格 skeleton 或一致的 loading 狀態，篩選器避免重複送出。 |
| 查詢成功但無結果 | 顯示「查無符合條件的資料」，並提供清除條件。 |
| API 失敗 | 顯示錯誤訊息與「重新載入」；不應偽裝成查無資料。 |
| 單一欄位缺值 | 顯示 `-` 或 `--`，不要把缺值轉成 0、離線或停用。 |
| 下拉選項 API 失敗 | 保留預設「全部／所有型號」，並在控制項呈現載入失敗提示。 |

### 狀態色語意

- 在線／啟用：成功色。
- 離線／停用：錯誤或警示色，需依產品語意統一。
- 無資料：中性色，不應套用錯誤色。
- badge 僅在 `eventCount > 0` 時出現，避免用 `0` 製造視覺噪音。

---

## 6. 設計時需特別注意的契約差異

1. DCU 的啟停查詢值是 `1`／`0`；電表是 `true`／`false`。
2. DCU 的「狀態」文字由 `enabled` 衍生，不直接採用 API 的 `status`。
3. 「區處及營業區」不是單一欄位，而是 `tpcAreaCode + areaName + tpcBuCode`。
4. 「白名單電表連線數」由 `whiteList` 與 `onlineMeterCount` 共同決定。
5. 電表的部分欄位接受新舊命名備援，例如 `commModel/moduleModel`、`dcuId/dcuSerial`；設計稿應以畫面名稱為準，不要露出技術欄位名。
6. 缺值與數字 0 的語意不同：0 是已知為零，缺值代表尚未提供／無法判讀。
7. 目前兩頁的分頁與排序是前端行為；如果未來改為大量資料的 server-side 分頁，需另補總筆數、頁碼、每頁筆數與排序參數契約。

---

## 7. UI/UX 可直接採用的畫面資料分組

### DCU 清單

- **識別**：DCU序號、DCU編號
- **狀態**：連線狀態、啟用狀態、白名單
- **設備量**：電表數、白名單電表連線數
- **位置**：區處及營業區、地址
- **通訊**：頻道組別、通訊方式、IP、模式
- **操作**：詳細資料、Topology、裝置設定

### 電表清單

- **識別**：表號、電號
- **狀態**：連線狀態
- **歸屬**：區處及營業區、DCU編號、DCU序號
- **通訊模組**：模組型號、FAN MAC、模組序號、IP
- **資料新鮮度**：最後LP時間、最後MN時間
- **位置**：地址
- **操作**：詳細資料、裝置設定

