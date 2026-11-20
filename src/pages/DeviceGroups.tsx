import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Search, Trash2 } from 'lucide-react'
import { DCU_LIST_ROWS, METER_LIST_ROWS } from '@/data/dcuListPage'
import { Th, SortHead, InfiniteFooter, useInfiniteRows, type SortDir } from '@/components/table/tableBits'
import { SimpleModal, BTN_GHOST, BTN_PRIMARY } from '@/components/shared/SimpleModal'
import { PageTitle } from '@/components/shared/PageTitle'
import { useDeviceGroups, GROUP_KINDS, kindOf, type GroupKind } from '@/store/useDeviceGroups'

/**
 * 裝置管理 · 裝置群組（Figma 3977:31162 DCU／4304:31797 電表；2026-10-22 業主新版設計稿
 * 「裝置群組-1／-2／-刪除／-編輯」）。
 *
 * 左：群組列表＝樹狀（DCU群組 (n)／電表群組 (n) 可收合），搜尋、建立群組；滑過群組出現編輯、刪除圖示。
 * 右：該群組的裝置表（勾選、排序、無限捲動）；標題旁寫裝置數與建立人員。勾選後右上換成「取消／刪除裝置」。
 * 刪除群組要二次確認（「該行動無法復原」）；編輯群組只改名稱。
 * 舊版的 DCU／電表頁籤拿掉了 —— 樹狀列表已同時列出兩種群組，點哪個群組就決定看哪種裝置。
 * 設計稿 DCU 表有兩欄都叫「DCU編號」，判斷是複製貼上的筆誤，這裡仍用 設備序號／DCU編號／用電地址。
 * 「建立群組」彈窗設計稿沒給，沿用名稱欄位並加上群組類型。資料全為 mock。
 * 2026-11-19 業主意見：順序改 電表群組 → DCU群組；兩種要明顯區別 —— 分類標題放大加粗並用各自的識別色
 *   （電表藍、DCU紫，定義在 store 的 GROUP_KINDS），群組項目前加同色標籤，右側標題也帶類型標籤；
 *   「新增裝置」改成「新增電表」／「新增DCU」，輸入框預設文字改成「請輸入表號」／「請輸入序號」。
 */
function KindTag({ kind, size = 'sm' }: { kind: Kind; size?: 'sm' | 'md' }) {
  const k = kindOf(kind)
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded font-bold ${size === 'md' ? 'px-2 py-0.5 text-[12px]' : 'px-1.5 py-px text-[11px]'}`}
      style={{ color: k.color, background: k.soft }}
    >
      {k.short}
    </span>
  )
}
type Kind = GroupKind
const KINDS = GROUP_KINDS

interface Device { id: string; code: string; address: string }
interface Sel { kind: Kind; name: string }

const CATALOG: Record<Kind, Device[]> = {
  dcu: DCU_LIST_ROWS.map((d) => ({ id: d.serial, code: d.code, address: d.address })),
  meter: METER_LIST_ROWS.map((m) => ({ id: m.meterNo, code: m.elecNo, address: m.address })),
}
const COLS: Record<Kind, [string, string, string]> = {
  dcu: ['設備序號', 'DCU編號', '用電地址'],
  meter: ['表號', '電號', '用電地址'],
}
const BOX =
  'rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'

export function DeviceGroups() {
  const groups = useDeviceGroups((s) => s.groups)
  const patchGroups = useDeviceGroups((s) => s.patchGroups)
  const [sel, setSel] = useState<Sel | null>({ kind: 'meter', name: '群組A' })
  const [open, setOpen] = useState<Record<Kind, boolean>>({ dcu: true, meter: true })
  const [q, setQ] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<'id' | 'code' | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [modal, setModal] = useState<
    null | { type: 'create' } | { type: 'add' } | { type: 'edit'; kind: Kind; name: string } | { type: 'delete'; kind: Kind; name: string }
  >(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const kind = sel?.kind ?? 'meter'
  const group = sel ? groups[sel.kind].find((g) => g.name === sel.name) : undefined
  const byId = useMemo(() => new Map(CATALOG[kind].map((d) => [d.id, d])), [kind])
  const devices = useMemo(() => {
    const list = (group?.ids ?? []).map((id) => byId.get(id)).filter((d): d is Device => !!d)
    if (!sortKey) return list
    return [...list].sort((a, b) => (sortDir === 'asc' ? 1 : -1) * a[sortKey].localeCompare(b[sortKey]))
  }, [group, byId, sortKey, sortDir])
  const { visible, sentinelRef, hasMore } = useInfiniteRows(devices.length, [sel, devices.length, sortKey, sortDir], 10)

  const allChecked = devices.length > 0 && devices.every((d) => checked.has(d.id))
  const someChecked = devices.some((d) => checked.has(d.id))

  const pick = (k: Kind, name: string) => { setSel({ kind: k, name }); setChecked(new Set()) }
  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(devices.map((d) => d.id)))
  const toggleSort = (k: 'id' | 'code') => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }
  const removeChecked = () => {
    if (!sel) return
    patchGroups(sel.kind, (gs) => gs.map((g) => (g.name === sel.name ? { ...g, ids: g.ids.filter((id) => !checked.has(id)) } : g)))
    setChecked(new Set())
  }
  const removeGroup = (k: Kind, name: string) => {
    patchGroups(k, (gs) => gs.filter((g) => g.name !== name))
    if (sel?.kind === k && sel.name === name) {
      const next = groups[k].find((g) => g.name !== name)
      const fallback = next ? { kind: k, name: next.name } : KINDS.flatMap((x) => groups[x.key].filter((g) => !(x.key === k && g.name === name)).map((g) => ({ kind: x.key, name: g.name })))[0]
      setSel(fallback ?? null)
      setChecked(new Set())
    }
  }
  const renameGroup = (k: Kind, from: string, to: string) => {
    patchGroups(k, (gs) => gs.map((g) => (g.name === from ? { ...g, name: to } : g)))
    if (sel?.kind === k && sel.name === from) setSel({ kind: k, name: to })
  }

  const needle = q.trim().toLowerCase()
  const [c1, c2, c3] = COLS[kind]

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <PageTitle title="裝置群組" />

      <div className="flex gap-4 items-stretch">
        {/* 左：群組列表（樹狀） */}
        <aside className="flex h-[calc(100vh-170px)] min-h-[420px] w-[320px] shrink-0 flex-col rounded-card border border-border bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-divider px-4 py-3">
            <h3 className="text-[15px] font-semibold text-ink">群組列表</h3>
            <button onClick={() => setModal({ type: 'create' })} className="rounded-md bg-brand-soft-hover px-3 py-1.5 text-[13px] font-semibold text-danger hover:opacity-80">
              建立群組
            </button>
          </div>
          <div className="p-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mut" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="關鍵字搜尋" className={`${BOX} w-full border-transparent bg-inset pl-9`} />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
            {KINDS.map(({ key, label, color }, i) => {
              const shown = groups[key].filter((g) => g.name.toLowerCase().includes(needle))
              return (
                <div key={key} className={i > 0 ? 'mt-2 border-t border-divider pt-2' : ''}>
                  <button
                    onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[15px] font-bold hover:bg-inset"
                    style={{ color }}
                  >
                    {open[key] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {label}
                    <span className="text-[13px] font-semibold opacity-70">({groups[key].length})</span>
                  </button>
                  {open[key] && (
                    <ul className="flex flex-col gap-0.5">
                      {shown.map((g) => {
                        const active = sel?.kind === key && sel.name === g.name
                        return (
                          <li key={g.name}>
                            <div
                              onClick={() => pick(key, g.name)}
                              className={[
                                'group flex cursor-pointer items-center justify-between rounded-lg py-2 pl-8 pr-3 text-[13px] font-semibold',
                                active ? 'bg-brand-soft-hover text-ink' : 'text-ink-sub hover:bg-inset',
                              ].join(' ')}
                            >
                              <span className="flex items-center gap-2"><KindTag kind={key} />{g.name}</span>
                              <span className="flex items-center gap-2 text-ink-mut opacity-0 group-hover:opacity-100">
                                <button title="編輯群組" onClick={(e) => { e.stopPropagation(); setModal({ type: 'edit', kind: key, name: g.name }) }} className="hover:text-brand">
                                  <Pencil size={14} />
                                </button>
                                <button title="刪除群組" onClick={(e) => { e.stopPropagation(); setModal({ type: 'delete', kind: key, name: g.name }) }} className="hover:text-danger">
                                  <Trash2 size={14} />
                                </button>
                              </span>
                            </div>
                          </li>
                        )
                      })}
                      {shown.length === 0 && <li className="py-2 pl-10 text-[12px] text-ink-mut">沒有符合的群組</li>}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </aside>

        {/* 右：裝置表 */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card">
          {group ? (
            <>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><KindTag kind={kind} size="md" />{group.name}</h3>
                  <span className="text-[12px] text-ink-sub">
                    {checked.size > 0
                      ? <>已勾選 <b className="text-ink">{checked.size}</b> / 共 <b className="text-ink">{devices.length}</b> 個{kindOf(kind).short}</>
                      : <>共 <b className="text-ink">{devices.length}</b> 個{kindOf(kind).short}</>}
                  </span>
                  <span className="h-3 w-px bg-border" />
                  <span className="text-[12px] text-ink-sub">建立人員：{group.creator}</span>
                </div>
                <div className="flex items-center gap-2">
                  {checked.size > 0 ? (
                    <>
                      <button onClick={() => setChecked(new Set())} className={BTN_GHOST}>取消</button>
                      <button onClick={removeChecked} className="rounded-lg bg-danger px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90">刪除{kindOf(kind).short}</button>
                    </>
                  ) : (
                    <button onClick={() => setModal({ type: 'add' })} className="rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90">新增{kindOf(kind).short}</button>
                  )}
                </div>
              </div>

              <div ref={scrollRef} className="min-h-[200px] flex-1 overflow-auto">
                <table className="w-full text-[13px] border-collapse">
                  <thead>
                    <tr className="text-ink-sub">
                      <Th className="sticky top-0 z-10 w-[44px] bg-inset">
                        <Check checked={allChecked} indeterminate={!allChecked && someChecked} onChange={toggleAll} />
                      </Th>
                      <Th className="sticky top-0 z-10 bg-inset"><SortHead label={c1} active={sortKey === 'id'} dir={sortDir} onClick={() => toggleSort('id')} /></Th>
                      <Th className="sticky top-0 z-10 bg-inset"><SortHead label={c2} active={sortKey === 'code'} dir={sortDir} onClick={() => toggleSort('code')} /></Th>
                      <Th className="sticky top-0 z-10 bg-inset">{c3}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.slice(0, visible).map((d) => (
                      <tr key={d.id} className="border-b border-divider hover:bg-inset/40">
                        <td className="px-3 py-2.5"><Check checked={checked.has(d.id)} onChange={() => toggle(d.id)} /></td>
                        <td className="px-3 py-2.5 text-ink">{d.id}</td>
                        <td className="px-3 py-2.5 text-ink">{d.code}</td>
                        <td className="px-3 py-2.5 text-ink">{d.address}</td>
                      </tr>
                    ))}
                    {devices.length === 0 && (
                      <tr><td colSpan={4} className="px-3 py-10 text-center text-ink-mut">此群組還沒有{kindOf(kind).short}，按「新增{kindOf(kind).short}」加入</td></tr>
                    )}
                  </tbody>
                </table>
                <div ref={sentinelRef} />
              </div>
              <InfiniteFooter loaded={visible} total={devices.length} hasMore={hasMore} onTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
            </>
          ) : (
            <div className="grid flex-1 place-items-center py-20 text-[13px] text-ink-mut">尚無群組，請先「建立群組」</div>
          )}
        </section>
      </div>

      {modal?.type === 'create' && (
        <CreateGroupModal
          defaultKind={kind}
          taken={{ dcu: groups.dcu.map((g) => g.name), meter: groups.meter.map((g) => g.name) }}
          onClose={() => setModal(null)}
          onCreate={(k, name) => {
            patchGroups(k, (gs) => [...gs, { name, ids: [], creator: 'system' }])
            setOpen((o) => ({ ...o, [k]: true }))
            pick(k, name)
            setModal(null)
          }}
        />
      )}
      {modal?.type === 'edit' && (
        <EditGroupModal
          name={modal.name}
          taken={groups[modal.kind].map((g) => g.name).filter((n) => n !== modal.name)}
          onClose={() => setModal(null)}
          onSubmit={(to) => { renameGroup(modal.kind, modal.name, to); setModal(null) }}
        />
      )}
      {modal?.type === 'delete' && (
        <ConfirmDelete
          name={modal.name}
          onClose={() => setModal(null)}
          onConfirm={() => { removeGroup(modal.kind, modal.name); setModal(null) }}
        />
      )}
      {modal?.type === 'add' && group && sel && (
        <AddDevicesModal
          kind={sel.kind}
          catalog={CATALOG[sel.kind]}
          existing={group.ids}
          onClose={() => setModal(null)}
          onAdd={(ids) => patchGroups(sel.kind, (gs) => gs.map((g) => (g.name === group.name ? { ...g, ids: [...g.ids, ...ids] } : g)))}
        />
      )}
    </div>
  )
}

function Check({ checked, indeterminate, onChange }: { checked: boolean; indeterminate?: boolean; onChange: () => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => { if (el) el.indeterminate = !!indeterminate }}
      onChange={onChange}
      className="size-4 cursor-pointer accent-danger"
    />
  )
}

/** 編輯群組（設計稿「裝置群組-編輯」）：只改名稱，名稱不可空白、不可與同類型其他群組重複 */
function EditGroupModal({ name, taken, onClose, onSubmit }: { name: string; taken: string[]; onClose: () => void; onSubmit: (to: string) => void }) {
  const [text, setText] = useState(name)
  const n = text.trim()
  const dup = taken.includes(n)
  const ok = !!n && !dup
  return (
    <SimpleModal
      title="編輯群組"
      width={480}
      onClose={onClose}
      actions={<>
        <button onClick={onClose} className={BTN_GHOST}>取消</button>
        <button disabled={!ok} onClick={() => onSubmit(n)} className={BTN_PRIMARY}>送出</button>
      </>}
    >
      <label className="flex flex-col gap-1">
        <span className="px-2 text-[12px] text-ink-sub">群組名稱</span>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok && onSubmit(n)}
          className="w-full rounded-md border border-transparent bg-inset px-3 py-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
        />
        {dup && <span className="px-2 text-[12px] text-danger">群組名稱已存在</span>}
      </label>
    </SimpleModal>
  )
}

/** 刪除群組確認（設計稿「裝置群組-刪除」）：紅色驚嘆號＋「該行動無法復原！是否確定刪除？」 */
function ConfirmDelete({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-fade" onClick={onClose} />
      <div role="alertdialog" className="relative z-10 w-[360px] max-w-[94vw] rounded-2xl border border-border bg-surface p-6 shadow-drawer modal-pop">
        <div className="flex gap-3">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-bold leading-none text-white">!</span>
          <div className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold text-ink">刪除「{name}」</h2>
            <p className="text-[13px] text-ink-sub">該行動無法復原！是否確定刪除？</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-ink-sub hover:bg-inset">取消</button>
          <button onClick={onConfirm} className={BTN_PRIMARY}>刪除</button>
        </div>
      </div>
    </div>
  )
}

function CreateGroupModal({ defaultKind, taken, onClose, onCreate }: {
  defaultKind: Kind
  taken: Record<Kind, string[]>
  onClose: () => void
  onCreate: (kind: Kind, name: string) => void
}) {
  const [kind, setKind] = useState<Kind>(defaultKind)
  const [name, setName] = useState('')
  const n = name.trim()
  const dup = taken[kind].includes(n)
  return (
    <SimpleModal
      title="建立群組"
      width={480}
      onClose={onClose}
      actions={<>
        <button onClick={onClose} className={BTN_GHOST}>取消</button>
        <button disabled={!n || dup} onClick={() => onCreate(kind, n)} className={BTN_PRIMARY}>建立</button>
      </>}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="px-2 text-[12px] text-ink-sub">群組類型</span>
          <div className="flex items-center gap-4 px-2">
            {KINDS.map((k) => (
              <label key={k.key} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
                <input type="radio" name="group-kind" checked={kind === k.key} onChange={() => setKind(k.key)} className="size-4 cursor-pointer accent-danger" />
                {k.short}
              </label>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="px-2 text-[12px] text-ink-sub">群組名稱</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && n && !dup && onCreate(kind, n)}
            placeholder="請輸入"
            className="w-full rounded-md border border-transparent bg-inset px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-mut focus:border-brand focus:outline-none"
          />
          {dup && <span className="px-2 text-[12px] text-danger">群組名稱已存在</span>}
        </label>
      </div>
    </SimpleModal>
  )
}

/**
 * 新增電表／新增DCU（2026-10-16 業主參考圖；11/19 標題依類型）：一個多行輸入框，電表填表號、DCU 填序號，可一筆或貼上多筆（換行分隔）。
 * 送出時加入找得到且尚未在群組內的；查無的留在輸入框並提示，已在群組內的直接略過。
 */
function AddDevicesModal({ kind, catalog, existing, onClose, onAdd }: {
  kind: Kind
  catalog: Device[]
  existing: string[]
  onClose: () => void
  onAdd: (ids: string[]) => void
}) {
  const [text, setText] = useState('')
  const [missing, setMissing] = useState<string[]>([])
  const idLabel = kindOf(kind).idLabel

  const submit = () => {
    const entries = [...new Set(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))]
    const known = new Set(catalog.map((d) => d.id))
    const have = new Set(existing)
    const found = entries.filter((id) => known.has(id) && !have.has(id))
    const notFound = entries.filter((id) => !known.has(id))
    if (found.length) onAdd(found)
    if (notFound.length) { setText(notFound.join('\n')); setMissing(notFound) }
    else onClose()
  }

  return (
    <SimpleModal
      title={`新增${kindOf(kind).short}`}
      width={480}
      onClose={onClose}
      actions={<>
        <button onClick={onClose} className={BTN_GHOST}>取消</button>
        <button disabled={!text.trim()} onClick={submit} className={BTN_PRIMARY}>送出</button>
      </>}
    >
      <textarea
        autoFocus
        value={text}
        onChange={(e) => { setText(e.target.value); setMissing([]) }}
        placeholder={`請輸入${idLabel}`}
        rows={7}
        className="w-full resize-y rounded-md border border-transparent bg-inset px-3 py-2 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-ink-mut focus:border-brand focus:outline-none"
      />
      {missing.length > 0 ? (
        <p className="mt-1 px-2 text-[12px] text-danger">查無以下{idLabel}，請確認後再送出（其餘已加入）：{missing.join('、')}</p>
      ) : (
        <p className="mt-1 px-2 text-[12px] text-ink-mut">可輸入一筆或貼上多筆，以換行分隔。</p>
      )}
    </SimpleModal>
  )
}
