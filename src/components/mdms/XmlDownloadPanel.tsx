import { useEffect, useMemo, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { Field, GroupSelect, RangeInput } from '@/components/shared/QueryFields'
import { TargetSearchMulti, parseTargets, TARGET_MODES, FIELD_BOX, type TargetMode } from '@/components/shared/TargetSearch'
import { status as statusTok } from '@/tokens'
import { MDMS_TYPES, buckets, fmtStamp, parseLocal, type MdmsKey } from '@/data/mdmsUpload'

/**
 * MDMS上拋 · 右側「下載XML」板塊。
 *
 * 與「上拋操作」內容完全一致，但標題為「下載XML」、主按鈕為「下載」。
 * 點擊「下載」會依照設定條件（對象、資料類型、起訖時間）產生 XML 檔案並下載至本機。
 */
export function XmlDownloadPanel({ typeKey, from: from0, to: to0 }: { typeKey: MdmsKey; from: string; to: string }) {
  const [type, setType] = useState<MdmsKey>(typeKey)
  const [mode, setMode] = useState<TargetMode>('meterNo')
  const [text, setText] = useState('')
  const [group, setGroup] = useState('')
  const [range, setRange] = useState({ from: from0, to: to0 })
  const [done, setDone] = useState('')

  // 左側切頁籤 → 資料類型跟著換；左側重新搜尋 → 區間跟著換
  useEffect(() => { setType(typeKey) }, [typeKey])
  useEffect(() => { setRange({ from: from0, to: to0 }) }, [from0, to0])

  const typeDef = useMemo(() => MDMS_TYPES.find((t) => t.key === type)!, [type])
  const touched = () => { setDone('') }

  const clear = () => {
    setMode('meterNo'); setText(''); setGroup(''); setType(typeKey); setRange({ from: from0, to: to0 }); touched()
  }

  const download = () => {
    const a = parseLocal(range.from) ?? 0
    const b = parseLocal(range.to) ?? 0
    const [f, t] = a <= b ? [a, b] : [b, a]
    const list = mode === 'group' ? (group ? [group] : []) : parseTargets(text)
    const scale = list.length ? `${mode}:${list.join(',')}` : ''
    const rows = buckets(typeDef, f, t, scale)

    const now = new Date().toISOString()
    const targetLabel = mode === 'group' ? (group || '全部') : (list.length ? list.join(',') : '全部')
    const modeLabel = TARGET_MODES.find((m) => m.key === mode)!.label
    const count = mode === 'group' ? (group ? group.split(':')[1] : '全部') : (list.length ? `${list.length} 個` : '全部')
    const who = !list.length && mode !== 'group' ? '全部電表' : mode === 'group' ? `群組「${group.split(':')[1] ?? group}」` : `${list.length} 個${modeLabel}`

    const escapeXml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    xml += `<MeterReadingsXmlExport xmlns="http://www.taipower.com.tw/hes/mdms/v1" generatedAt="${now}">\n`
    xml += `  <Header>\n`
    xml += `    <Source>OpenHES</Source>\n`
    xml += `    <DataType key="${typeDef.key}">${escapeXml(typeDef.label)}</DataType>\n`
    xml += `    <TargetMode>${modeLabel}</TargetMode>\n`
    xml += `    <Target>${escapeXml(targetLabel)}</Target>\n`
    xml += `    <TargetSummary>${escapeXml(who)}</TargetSummary>\n`
    xml += `    <DataStartTime>${range.from.replace('T', ' ')}:00</DataStartTime>\n`
    xml += `    <DataEndTime>${range.to.replace('T', ' ')}:00</DataEndTime>\n`
    xml += `    <TotalSlots>${rows.length}</TotalSlots>\n`
    xml += `  </Header>\n`
    xml += `  <Records>\n`
    for (const r of rows) {
      xml += `    <Record time="${fmtStamp(r.ts)}" total="${r.total}" uploaded="${r.uploaded}" uploadRate="${r.pct.toFixed(2)}%" inProgress="${r.inProgress ? 'true' : 'false'}" />\n`
    }
    xml += `  </Records>\n`
    xml += `</MeterReadingsXmlExport>\n`

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mdms-export-${typeDef.key}-${range.from.replace(/[:T]/g, '')}_${range.to.replace(/[:T]/g, '')}.xml`
    link.click()
    URL.revokeObjectURL(url)

    setDone(`已成功下載 XML 檔案：${typeDef.label}・${who}（共 ${rows.length} 個時段資料）`)
  }

  return (
    <section className="flex flex-1 min-h-0 flex-col justify-between rounded-card border border-border bg-surface p-5 shadow-card">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="h-4 w-[3px] rounded-full bg-danger" />
          <h2 className="text-[16px] font-semibold text-ink">下載XML</h2>
        </div>

        <TargetSearchMulti
          mode={mode}
          text={text}
          onMode={(m) => { setMode(m); touched() }}
          onText={(v) => { setText(v); touched() }}
          groupInput={<GroupSelect value={group} onChange={(v) => { setGroup(v); touched() }} className="w-full" />}
          textareaClassName="h-20 w-full min-w-0 flex-1"
        />
        {mode !== 'group' && <p className="-mt-1.5 text-[12px] text-ink-mut">留空＝全部電表</p>}

        <Field label="選擇資料類型">
          <select value={type} onChange={(e) => { setType(e.target.value as MdmsKey); touched() }} className={`${FIELD_BOX} h-9 w-full py-0`}>
            {MDMS_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </Field>

        <Field label="上拋電表資料時間" hint="以整點為單位，單次上限 1 個月">
          <RangeInput
            from={range.from}
            to={range.to}
            maxMonths={1}
            stepMin={60}
            className="w-full justify-center"
            onChange={(from, to) => { setRange({ from, to }); touched() }}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <div className="flex gap-2">
          <button onClick={clear} className="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] font-semibold text-ink-sub hover:border-brand hover:text-brand">
            清除條件
          </button>
          <button
            onClick={download}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-ink text-[13px] font-semibold text-white hover:opacity-90 cursor-pointer"
          >
            下載
          </button>
        </div>

        {done && (
          <div className="flex gap-1.5 text-[12.5px] font-semibold leading-relaxed" style={{ color: statusTok.normal.fg }}>
            <CircleCheck size={16} className="mt-0.5 shrink-0" />{done}
          </div>
        )}
      </div>
    </section>
  )
}
