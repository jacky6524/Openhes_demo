export const fmtInt = (n: number) => n.toLocaleString('en-US')
export const fmtPct = (n: number, d = 2) => `${n.toFixed(d)}%`

/**
 * 日期顯示格式（2026-11-04 業主意見：全站統一 YYYY/MM/DD，含時間為 YYYY/MM/DD HH:mm[:ss]，同正式版）。
 * 把開頭的 YYYY-MM-DD／YYYY.MM.DD 換成斜線；已經是斜線或不是日期的字串原樣回傳（可重複套用）。
 * 用在「資料字串必須維持 - 」的地方：例如即時讀表的時間要和 <input type="date"> 的值比大小，
 * 來源保持 YYYY-MM-DD，只在畫面上轉。其他資料來源已直接產生斜線格式。
 */
export const fmtDate = (s: string) => s.replace(/^(\d{4})[-.](\d{2})[-.](\d{2})/, '$1/$2/$3')
