import { useEffect, useMemo, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { Field, GroupSelect, MultiSelect, RangeInput } from '@/components/shared/QueryFields'
import { TargetSearchMulti, parseTargets, TARGET_MODES, type TargetMode } from '@/components/shared/TargetSearch'
import { status as statusTok } from '@/tokens'
import { MDMS_TYPES, buckets, fmtStamp, parseLocal, type MdmsKey } from '@/data/mdmsUpload'

/**
 * MDMS上拋 · 右側「下載XML」板塊。
 *
 * 與「上拋操作」內容完全一致，但標題為「下載XML」、主按鈕為「下載」。
 * 點擊「下載」會依照設定條件（對象、資料類型、起訖時間）產生 XML 檔案並下載至本機。
 */
export function XmlDownloadPanel({ typeKey, from: from0, to: to0 }: { typeKey: MdmsKey | 'ALL'; from: string; to: string }) {
  const initTypes = typeKey === 'ALL' ? (['LP', 'MN', 'ALT'] as MdmsKey[]) : [typeKey]
  const [types, setTypes] = useState<MdmsKey[]>(initTypes)
  const [mode, setMode] = useState<TargetMode>('meterNo')
  const [text, setText] = useState('')
  const [group, setGroup] = useState('')
  const [range, setRange] = useState({ from: from0, to: to0 })
  const [done, setDone] = useState('')

  // 左側切頁籤 → 資料類型跟著換；左側重新搜尋 → 區間跟著換
  useEffect(() => { setTypes(typeKey === 'ALL' ? ['LP', 'MN', 'ALT'] : [typeKey]) }, [typeKey])
  useEffect(() => { setRange({ from: from0, to: to0 }) }, [from0, to0])

  const selectedDefs = useMemo(() => MDMS_TYPES.filter((t) => types.includes(t.key)), [types])
  const touched = () => { setDone('') }

  const clear = () => {
    setMode('meterNo')
    setText('')
    setGroup('')
    setTypes(typeKey === 'ALL' ? ['LP', 'MN', 'ALT'] : [typeKey])
    setRange({ from: from0, to: to0 })
    touched()
  }

  const download = () => {
    if (types.length === 0) return
    const a = parseLocal(range.from) ?? 0
    const b = parseLocal(range.to) ?? 0
    const [f, t] = a <= b ? [a, b] : [b, a]
    const list = mode === 'group' ? (group ? [group] : []) : parseTargets(text)
    const scale = list.length ? `${mode}:${list.join(',')}` : ''

    const now = new Date().toISOString()
    const targetLabel = mode === 'group' ? (group || '全部') : (list.length ? list.join(',') : '全部')
    const modeLabel = TARGET_MODES.find((m) => m.key === mode)!.label
    const who = !list.length && mode !== 'group' ? '全部電表' : mode === 'group' ? `群組「${group.split(':')[1] ?? group}」` : `${list.length} 個${modeLabel}`
    const typesLabel = selectedDefs.map((t) => t.label).join('、')

    const escapeXml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

    let totalSlots = 0
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    xml += `<MeterReadingsXmlExport xmlns="http://www.taipower.com.tw/hes/mdms/v1" generatedAt="${now}">\n`
    xml += `  <Header>\n`
    xml += `    <Source>OpenHES</Source>\n`
    xml += `    <DataTypes>\n`
    for (const td of selectedDefs) {
      xml += `      <DataType key="${td.key}">${escapeXml(td.label)}</DataType>\n`
    }
    xml += `    </DataTypes>\n`
    xml += `    <TargetMode>${modeLabel}</TargetMode>\n`
    xml += `    <Target>${escapeXml(targetLabel)}</Target>\n`
    xml += `    <TargetSummary>${escapeXml(who)}</TargetSummary>\n`
    xml += `    <DataStartTime>${range.from.replace('T', ' ')}:00</DataStartTime>\n`
    xml += `    <DataEndTime>${range.to.replace('T', ' ')}:00</DataEndTime>\n`
    xml += `  </Header>\n`
    xml += `  <Records>\n`
    for (const td of selectedDefs) {
      const rows = buckets(td, f, t, scale)
      totalSlots += rows.length
      xml += `    <DataTypeGroup key="${td.key}" label="${escapeXml(td.label)}" count="${rows.length}">\n`
      for (const r of rows) {
        xml += `      <Record time="${fmtStamp(r.ts)}" total="${r.total}" uploaded="${r.uploaded}" uploadRate="${r.pct.toFixed(2)}%" inProgress="${r.inProgress ? 'true' : 'false'}" />\n`
      }
      xml += `    </DataTypeGroup>\n`
    }
    xml += `  </Records>\n`
    xml += `</MeterReadingsXmlExport>\n`

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mdms-export-${selectedDefs.map((t) => t.key).join('-')}-${range.from.replace(/[:T]/g, '')}_${range.to.replace(/[:T]/g, '')}.xml`
    link.click()
    URL.revokeObjectURL(url)

    setDone(`已成功下載 XML 檔案：${typesLabel}・${who}（共 ${totalSlots} 個時段資料）`)
  }

  return (
    <section className="flex flex-1 min-h-fit flex-col justify-between rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-col gap-2.5">
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
          textareaClassName="h-16 w-full min-w-0 flex-1"
        />
        {mode !== 'group' && <p className="-mt-1.5 text-[12px] text-ink-mut">留空＝全部電表</p>}

        <Field label="選擇資料類型" hint="可複選">
          <MultiSelect
            options={MDMS_TYPES.map((t) => ({ value: t.key, label: t.label }))}
            value={types}
            onChange={(v) => { setTypes(v); touched() }}
            placeholder="請選擇資料類型"
            className="w-full"
          />
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
            disabled={types.length === 0}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-ink text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            下載
          </button>
        </div>

        {done && (
          <div className="flex items-start gap-1.5 rounded-lg bg-success-soft/60 px-2.5 py-1.5 text-[12px] font-medium leading-relaxed break-words" style={{ color: statusTok.normal.fg }}>
            <CircleCheck size={15} className="mt-0.5 shrink-0" />
            <span className="flex-1">{done}</span>
          </div>
        )}
      </div>
    </section>
  )
}
