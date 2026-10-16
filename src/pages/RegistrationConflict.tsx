import { useMemo, useState } from 'react'
import { Pagination } from '@/components/table/tableBits'
import { status as statusTok } from '@/tokens'

/**
 * 裝置管理 · 註冊衝突（Figma 3971:30755，內層 Content 3971:30761）。
 *
 * 一筆回報佔兩列：「資料」列是 OpenHES 內的資料（沒匯入時全為 N/A），「回報」列是模組實際回報的
 * 電號／MAC·IMEI／模組型號，兩者對不上就是衝突，錯誤原因欄整塊標紅。
 * 表頭兩層（錯誤原因底下分電號／MAC/IMEI／模組型號）。資料全為 mock。
 */
interface Conflict {
  reportNo: string // 回報表號
  reported: { elecNo: string; mac: string; model: string }
  reason: string // 錯誤說明
  dcu: string // DCU編號
  address: string
  at: string
}

const REASONS = ['尚未匯入電表資料', '電號與回報不符', 'MAC/IMEI 與回報不符']
const MODELS = ['SGCM-W15-TFB', 'SGCM-W61-TFB', 'SGCM-N71-NBF']
const ROWS: Conflict[] = Array.from({ length: 35 }, (_, i) => {
  const n = i + 1
  const hasDcu = i % 3 !== 0
  return {
    reportNo: `AB-TR-${String(n).padStart(3, '0')}`,
    reported: {
      elecNo: `08-${88407303 + n * 11}`,
      mac: String(35534545436 + n * 97),
      model: MODELS[i % MODELS.length],
    },
    reason: REASONS[i % REASONS.length],
    dcu: hasDcu ? `04997BC0900-${1 + (i % 3)}` : '--',
    address: '新北市新店區寶元路一段84巷3號',
    at: '2025-01-01 10:30:00',
  }
})

const RED = statusTok.danger.fg
const RED_BG = statusTok.danger.bg

/** 兩層表頭都要釘住：第一層 top-0，第二層接在第一層下方（兩層高度固定 40px） */
const H1 = 'sticky top-0 z-20 h-10 bg-inset px-3 text-center font-medium text-ink-sub border-b border-border'
const H2 = 'sticky top-10 z-20 h-10 bg-inset px-3 text-center font-medium text-ink-sub border-b border-border'

export function RegistrationConflict() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const totalPages = Math.max(1, Math.ceil(ROWS.length / pageSize))
  const safe = Math.min(page, totalPages)
  const pageRows = useMemo(() => ROWS.slice((safe - 1) * pageSize, safe * pageSize), [safe, pageSize])

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <div className="rounded-card bg-surface border border-border shadow-card pb-3">
        <div className="max-h-[calc(100vh-250px)] overflow-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th rowSpan={2} className={H1}>回報表號</th>
                <th colSpan={4} className={H1}>錯誤原因</th>
                <th rowSpan={2} className={H1}>錯誤說明</th>
                <th rowSpan={2} className={H1}>DCU編號</th>
                <th rowSpan={2} className={H1}>用電地址</th>
                <th rowSpan={2} className={H1}>回報時間</th>
              </tr>
              <tr>
                <th className={H2} />
                <th className={H2}>電號</th>
                <th className={H2}>MAC/IMEI</th>
                <th className={H2}>模組型號</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <ConflictRows key={r.reportNo} r={r} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4">
          <Pagination
            page={safe}
            totalPages={totalPages}
            onPage={setPage}
            pageSize={pageSize}
            onPageSize={(s) => { setPageSize(s); setPage(1) }}
          />
        </div>
      </div>
    </div>
  )
}

function ConflictRows({ r }: { r: Conflict }) {
  const merged = 'px-3 py-2 text-center text-ink border-b border-divider align-middle'
  const na = 'px-3 py-1.5 text-center'
  return (
    <>
      <tr>
        <td rowSpan={2} className={`${merged} whitespace-nowrap`}>{r.reportNo}</td>
        <td className={`${na} text-ink-sub`} style={{ background: RED_BG }}>資料</td>
        <td className={na} style={{ background: RED_BG, color: RED }}>N/A</td>
        <td className={na} style={{ background: RED_BG, color: RED }}>N/A</td>
        <td className={na} style={{ background: RED_BG, color: RED }}>N/A</td>
        <td rowSpan={2} className={merged}>{r.reason}</td>
        <td rowSpan={2} className={`${merged} font-mono`}>{r.dcu}</td>
        <td rowSpan={2} className={`${merged} whitespace-nowrap`}>{r.address}</td>
        <td rowSpan={2} className={`${merged} tabular-nums whitespace-nowrap`}>{r.at}</td>
      </tr>
      <tr className="border-b border-divider">
        <td className={`${na} text-ink-sub`} style={{ background: RED_BG }}>回報</td>
        <td className={`${na} tabular-nums`} style={{ background: RED_BG, color: RED }}>{r.reported.elecNo}</td>
        <td className={`${na} tabular-nums`} style={{ background: RED_BG, color: RED }}>{r.reported.mac}</td>
        <td className={na} style={{ background: RED_BG, color: RED }}>{r.reported.model}</td>
      </tr>
    </>
  )
}
