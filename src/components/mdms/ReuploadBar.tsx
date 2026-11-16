import { useEffect, useMemo, useState } from 'react'
import { CircleCheck, Search, UploadCloud } from 'lucide-react'
import { RangeInput } from '@/components/shared/QueryFields'
import { parseTargets } from '@/components/shared/TargetSearch'
import { status as statusTok } from '@/tokens'
import { MDMS_TYPES, buckets, parseLocal, type MdmsKey } from '@/data/mdmsUpload'

/**
 * MDMS上拋 · 重新上拋列（2026-11-11 業主意見）。
 *
 * 放在「達成率卡片」與「趨勢分析」之間的一行：上面的搜尋列是看上拋狀況（dashboard），
 * 這一行是**重新上拋**——挑資料類型、對象、資料時間 → 查詢有多少筆未上拋 → 執行上拋。
 *   · 資料類型預設跟著下方趨勢分析目前的頁籤（切頁籤會跟著換），也可以自己改
 *   · 對象留空＝全部電表；表號／電號可多筆（逗號、空白或換行分隔）
 *   · 執行要二次確認（按一次變「確認上拋 N 筆」，再按才送出）
 * 資料全為 mock：未上拋筆數＝該區間各時段 總數－已上拋 的合計（同上方卡片的算法）；送出只顯示結果訊息。
 * TODO: 接後端重新上拋 API。
 */
type Target = 'meterNo' | 'elecNo'
const TARGETS: { key: Target; label: string }[] = [
  { key: 'meterNo', label: '表號' },
  { key: 'elecNo', label: '電號' },
]

const CTL = 'h-9 rounded-md border border-border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'
const fmtN = (n: number) => n.toLocaleString('en-US')

interface Found { type: MdmsKey; slots: number; pending: number; targetCount: number }

export function ReuploadBar({ typeKey, from: from0, to: to0 }: { typeKey: MdmsKey; from: string; to: string }) {
  const [type, setType] = useState<MdmsKey>(typeKey)
  const [target, setTarget] = useState<Target>('meterNo')
  const [text, setText] = useState('')
  const [range, setRange] = useState({ from: from0, to: to0 })
  const [found, setFound] = useState<Found | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState('')

  // 下方趨勢切頁籤 → 資料類型跟著換；上方重新搜尋 → 區間跟著換
  useEffect(() => { setType(typeKey); setFound(null); setConfirming(false) }, [typeKey])
  useEffect(() => { setRange({ from: from0, to: to0 }); setFound(null); setConfirming(false) }, [from0, to0])

  const typeDef = useMemo(() => MDMS_TYPES.find((t) => t.key === type)!, [type])
  const touched = () => { setFound(null); setConfirming(false); setDone('') }

  const search = () => {
    const a = parseLocal(range.from) ?? 0
    const b = parseLocal(range.to) ?? 0
    const [f, t] = a <= b ? [a, b] : [b, a]
    const list = parseTargets(text)
    const scale = list.length ? `${target}:${list.join(',')}` : ''
    const rows = buckets(typeDef, f, t, scale).filter((r) => !r.inProgress)
    // 全部電表：各時段 總數－已上拋 合計（同上方卡片）。
    // 指定對象（mock）：每個對象每個時段一筆，未上拋比例取各時段平均的未達成率
    const missing = rows.reduce((s, r) => s + (r.total - r.uploaded), 0)
    const missRate = rows.length ? rows.reduce((s, r) => s + (1 - r.uploaded / r.total), 0) / rows.length : 0
    const pending = list.length ? Math.round(list.length * rows.length * missRate) : missing
    setFound({ type, slots: rows.length, pending, targetCount: list.length })
    setConfirming(false)
    setDone('')
  }

  const run = () => {
    if (!found || !found.pending) return
    if (!confirming) { setConfirming(true); return }
    setConfirming(false)
    setDone(`已送出重新上拋：${typeDef.label}，${fmtN(found.pending)} 筆。上拋完成後，上方卡片與趨勢會更新。`)
    setFound(null)
  }

  return (
    <div className="shrink-0 rounded-card border border-border bg-surface px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-2 flex h-9 items-center gap-2 self-end">
          <span className="h-4 w-[3px] rounded-full bg-danger" />
          <h2 className="whitespace-nowrap text-[15px] font-semibold text-ink">重新上拋</h2>
        </div>

        <Labeled label="資料類型">
          <select value={type} onChange={(e) => { setType(e.target.value as MdmsKey); touched() }} className={`${CTL} w-[170px]`}>
            {MDMS_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </Labeled>

        <Labeled label="對象" hint="留空＝全部電表">
          <div className="flex items-center gap-1.5">
            <select value={target} onChange={(e) => { setTarget(e.target.value as Target); touched() }} className={`${CTL} w-[84px]`}>
              {TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <input
              value={text}
              onChange={(e) => { setText(e.target.value); touched() }}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder={`輸入${TARGETS.find((t) => t.key === target)!.label}，多筆以逗號分隔`}
              className={`${CTL} w-[190px]`}
            />
          </div>
        </Labeled>

        <Labeled label="上拋電表資料時間" hint="單次上限 1 個月">
          <RangeInput from={range.from} to={range.to} maxMonths={1} onChange={(from, to) => { setRange({ from, to }); touched() }} />
        </Labeled>

        <button onClick={search} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-semibold text-ink-sub hover:border-brand hover:text-brand">
          <Search size={14} />查詢
        </button>
        <button
          onClick={run}
          disabled={!found || !found.pending}
          title={!found ? '請先查詢未上拋筆數' : !found.pending ? '這個區間沒有未上拋的資料' : undefined}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-white disabled:opacity-40 ${confirming ? 'bg-danger hover:opacity-90' : 'bg-brand hover:bg-brand-deep'}`}
        >
          <UploadCloud size={14} />
          {confirming && found ? `確認上拋 ${fmtN(found.pending)} 筆` : '執行上拋'}
        </button>
        {confirming && (
          <button onClick={() => setConfirming(false)} className="h-9 rounded-lg px-2 text-[13px] text-ink-sub hover:text-ink">取消</button>
        )}
      </div>

      {/* 結果列：查詢後顯示筆數；送出後顯示結果 */}
      {(found || done) && (
        <div className="mt-2 text-[13px]">
          {found && (
            <span className="text-ink-sub">
              {typeDef.label} · {found.targetCount ? `指定 ${found.targetCount} 個${TARGETS.find((t) => t.key === target)!.label}` : '全部電表'}
              {found.slots > 0 && ` · 共 ${found.slots} 個已完成時段`}，
              {found.slots === 0
                ? <b className="text-ink">這個區間沒有已完成的時段，請調整資料時間</b>
                : found.pending
                ? <>未上拋 <b className="tabular-nums" style={{ color: statusTok.danger.fg }}>{fmtN(found.pending)}</b> 筆{confirming && '，再按一次確認送出'}</>
                : <b style={{ color: statusTok.normal.fg }}>全部已上拋，不需重新上拋</b>}
            </span>
          )}
          {done && (
            <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: statusTok.normal.fg }}>
              <CircleCheck size={15} />{done}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="px-1 text-[12px] text-ink-sub">
        {label}{hint && <span className="ml-2 text-ink-mut">{hint}</span>}
      </span>
      {children}
    </label>
  )
}
