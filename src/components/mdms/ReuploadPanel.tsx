import { useEffect, useMemo, useState } from 'react'
import { CircleCheck, UploadCloud } from 'lucide-react'
import { DateTime15, Field, GroupSelect, addMonths } from '@/components/shared/QueryFields'
import { TargetSearchMulti, parseTargets, TARGET_MODES, FIELD_BOX, type TargetMode } from '@/components/shared/TargetSearch'
import { status as statusTok } from '@/tokens'
import { hashStr } from '@/data/readTasks'
import { MDMS_TYPES, buckets, parseLocal, type MdmsKey } from '@/data/mdmsUpload'

/**
 * MDMS上拋 · 右側「上拋操作」板塊（2026-11-19 業主意見，取代 11/11 的單行 ReuploadBar）。
 *
 * 參考圖 1119更新參考/MDMS上拋 (4).png：表號／電號／**群組**（新增）→ 資料類型 → 上拋電表資料時間（整點）→ 清除條件／執行上拋。
 *   · 對象留空＝全部電表；表號／電號可多筆（換行分隔）；群組＝裝置群組頁的群組
 *   · 資料類型預設跟著左側折線圖的頁籤（ALL 時預設 LP），也可以自己改；可選事件
 *   · 資料時間預設跟著左側 dashboard 的搜尋區間
 *   · 執行要二次確認：按「執行上拋」先算出未上拋筆數並變成「確認上拋 N 筆」，再按才送出
 * 資料全為 mock：未上拋筆數＝區間內各已完成時段 總數－已上拋 的合計；送出只顯示結果訊息。
 * TODO: 接後端重新上拋 API。
 */
const fmtN = (n: number) => n.toLocaleString('en-US')

/** 改起點動終點、改終點動起點：不讓起訖顛倒，也不超過 1 個月 */
function clampRange(r: { from: string; to: string }, side: 'from' | 'to', v: string) {
  if (side === 'from') {
    let to = r.to
    if (v && to && to < v) to = v
    if (v && to && to > addMonths(v, 1)) to = addMonths(v, 1)
    return { from: v, to }
  }
  let from = r.from
  if (from && v && from > v) from = v
  if (from && v && from < addMonths(v, -1)) from = addMonths(v, -1)
  return { from, to: v }
}

interface Found { slots: number; pending: number; who: string }

export function ReuploadPanel({ typeKey, from: from0, to: to0 }: { typeKey: MdmsKey; from: string; to: string }) {
  const [type, setType] = useState<MdmsKey>(typeKey)
  const [mode, setMode] = useState<TargetMode>('meterNo')
  const [text, setText] = useState('')
  const [group, setGroup] = useState('')
  const [range, setRange] = useState({ from: from0, to: to0 })
  const [found, setFound] = useState<Found | null>(null)
  const [done, setDone] = useState('')

  // 左側切頁籤 → 資料類型跟著換；左側重新搜尋 → 區間跟著換
  useEffect(() => { setType(typeKey); setFound(null) }, [typeKey])
  useEffect(() => { setRange({ from: from0, to: to0 }); setFound(null) }, [from0, to0])

  const typeDef = useMemo(() => MDMS_TYPES.find((t) => t.key === type)!, [type])
  const touched = () => { setFound(null); setDone('') }

  const clear = () => {
    setMode('meterNo'); setText(''); setGroup(''); setType(typeKey); setRange({ from: from0, to: to0 }); touched()
  }

  /** 第一下：算未上拋筆數、進入確認；第二下：送出 */
  const run = () => {
    if (found) {
      if (!found.pending) return
      setDone(`已送出重新上拋：${typeDef.label}・${found.who}，${fmtN(found.pending)} 筆。上拋完成後，左側卡片與趨勢會更新。`)
      setFound(null)
      return
    }
    const a = parseLocal(range.from) ?? 0
    const b = parseLocal(range.to) ?? 0
    const [f, t] = a <= b ? [a, b] : [b, a]
    const list = mode === 'group' ? (group ? [group] : []) : parseTargets(text)
    const scale = list.length ? `${mode}:${list.join(',')}` : ''
    const rows = buckets(typeDef, f, t, scale).filter((r) => !r.inProgress)
    const missRate = rows.length ? rows.reduce((s, r) => s + (1 - r.uploaded / r.total), 0) / rows.length : 0
    // 對象數：表號／電號＝輸入筆數；群組（mock）＝依群組名給一個電表數
    const count = mode === 'group' ? (group ? 20 + (hashStr(group) % 180) : 0) : list.length
    const pending = count
      ? Math.round(count * rows.length * missRate)
      : rows.reduce((s, r) => s + (r.total - r.uploaded), 0)
    const modeLabel = TARGET_MODES.find((m) => m.key === mode)!.label
    const who = !count ? '全部電表' : mode === 'group' ? `群組「${group.split(':')[1]}」（${count} 顆電表）` : `${count} 個${modeLabel}`
    setFound({ slots: rows.length, pending, who })
    setDone('')
  }

  const confirming = !!found && found.pending > 0

  return (
    <section className="flex min-h-0 flex-col gap-4 overflow-y-auto overflow-x-hidden rounded-card border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center gap-2">
        <span className="h-4 w-[3px] rounded-full bg-danger" />
        <h2 className="text-[16px] font-semibold text-ink">上拋操作</h2>
      </div>

      <TargetSearchMulti
        mode={mode}
        text={text}
        onMode={(m) => { setMode(m); touched() }}
        onText={(v) => { setText(v); touched() }}
        groupInput={<GroupSelect value={group} onChange={(v) => { setGroup(v); touched() }} className="w-full" />}
        textareaClassName="h-32 w-full"
      />
      {mode !== 'group' && <p className="-mt-2 text-[12px] text-ink-mut">留空＝全部電表</p>}

      <Field label="選擇資料類型">
        <select value={type} onChange={(e) => { setType(e.target.value as MdmsKey); touched() }} className={`${FIELD_BOX} h-9 w-full py-0`}>
          {MDMS_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </Field>

      {/* 板塊窄，起訖分兩行（同 RangeInput 的規則：顛倒或超過 1 個月時拉回另一端） */}
      <Field label="上拋電表資料時間" hint="以整點為單位，單次上限 1 個月">
        <div className="flex flex-col gap-1.5">
          {(['from', 'to'] as const).map((side) => (
            <div key={side} className={`${FIELD_BOX} flex h-9 items-center gap-3 py-0`}>
              <span className="w-4 text-[12px] text-ink-mut">{side === 'from' ? '起' : '迄'}</span>
              <DateTime15 value={range[side]} stepMin={60} onChange={(v) => { setRange((r) => clampRange(r, side, v)); touched() }} />
            </div>
          ))}
        </div>
      </Field>

      <div className="flex gap-2">
        <button onClick={clear} className="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] font-semibold text-ink-sub hover:border-brand hover:text-brand">
          清除條件
        </button>
        <button
          onClick={run}
          disabled={!!found && !found.pending}
          className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold text-white disabled:opacity-40 ${confirming ? 'bg-danger hover:opacity-90' : 'bg-ink hover:opacity-90'}`}
        >
          <UploadCloud size={15} />
          {confirming ? `確認上拋 ${fmtN(found!.pending)} 筆` : '執行上拋'}
        </button>
      </div>

      {/* 結果：算完筆數（等確認）或送出後 */}
      {found && (
        <div className="rounded-lg bg-inset px-3 py-2.5 text-[13px] leading-relaxed text-ink-sub">
          {typeDef.label}・{found.who}
          {found.slots > 0 && `・共 ${found.slots} 個已完成時段`}
          <br />
          {found.slots === 0 ? (
            <b className="text-ink">這個區間沒有已完成的時段，請調整資料時間</b>
          ) : found.pending ? (
            <>未上拋 <b className="tabular-nums" style={{ color: statusTok.danger.fg }}>{fmtN(found.pending)}</b> 筆，再按一次確認送出。
              <button onClick={() => setFound(null)} className="ml-2 text-ink-mut underline hover:text-ink">取消</button></>
          ) : (
            <b style={{ color: statusTok.normal.fg }}>全部已上拋，不需重新上拋</b>
          )}
        </div>
      )}
      {done && (
        <div className="flex gap-1.5 text-[13px] font-semibold leading-relaxed" style={{ color: statusTok.normal.fg }}>
          <CircleCheck size={16} className="mt-0.5 shrink-0" />{done}
        </div>
      )}
    </section>
  )
}
