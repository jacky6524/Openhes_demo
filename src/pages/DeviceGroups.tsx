import { useMemo, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
import { DCU_LIST_ROWS, METER_LIST_ROWS } from '@/data/dcuListPage'
import { Th, Pagination } from '@/components/table/tableBits'
import { PillTabs } from '@/components/shared/PillTabs'
import { SimpleModal, BTN_GHOST, BTN_PRIMARY } from '@/components/shared/SimpleModal'
import { PageTitle } from '@/components/shared/PageTitle'

/**
 * 裝置管理 · 裝置群組（Figma 3977:31162 DCU 頁籤／4304:31797 電表頁籤、勾選狀態）。
 *
 * 左：群組列表（搜尋、建立群組、刪除群組）；右：該群組的裝置表（勾選、分頁）。
 * 勾選後右上換成「取消／刪除裝置」。DCU 與電表各自一組群組。
 * 「新增裝置」依業主參考圖（2026-10-16）；「建立群組／群組資訊」彈窗的設計稿（3808:24018、4304:32893）
 * 還沒讀，目前是依功能推測的簡易版，欄位待比對。資料全為 mock。
 */
type Kind = 'dcu' | 'meter'
const TABS = [
  { key: 'dcu', label: 'DCU' },
  { key: 'meter', label: '電表' },
] as const

interface Device { id: string; code: string; address: string }
interface Group { name: string; ids: string[] }

const CATALOG: Record<Kind, Device[]> = {
  dcu: DCU_LIST_ROWS.map((d) => ({ id: d.serial, code: d.code, address: d.address })),
  meter: METER_LIST_ROWS.map((m) => ({ id: m.meterNo, code: m.elecNo, address: m.address })),
}
const COLS: Record<Kind, [string, string, string]> = {
  dcu: ['設備序號', 'DCU編號', '用電地址'],
  meter: ['表號', '電號', '用電地址'],
}
const seedGroups = (k: Kind): Group[] => {
  const ids = CATALOG[k].map((d) => d.id)
  return [
    { name: '群組A', ids: ids.slice(0, 20) },
    { name: '群組B', ids: ids.slice(20, 32) },
    { name: '群組C', ids: ids.slice(32, 37) },
  ]
}

const BOX =
  'rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-mut focus:outline-none focus:border-brand'

export function DeviceGroups() {
  const [kind, setKind] = useState<Kind>('dcu')
  const [groups, setGroups] = useState<Record<Kind, Group[]>>({ dcu: seedGroups('dcu'), meter: seedGroups('meter') })
  const [selName, setSelName] = useState<Record<Kind, string>>({ dcu: '群組A', meter: '群組A' })
  const [q, setQ] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [modal, setModal] = useState<null | 'create' | 'info' | 'add'>(null)

  const list = groups[kind]
  const group = list.find((g) => g.name === selName[kind]) ?? list[0]
  const byId = useMemo(() => new Map(CATALOG[kind].map((d) => [d.id, d])), [kind])
  const devices = (group?.ids ?? []).map((id) => byId.get(id)).filter((d): d is Device => !!d)

  const totalPages = Math.max(1, Math.ceil(devices.length / pageSize))
  const safe = Math.min(page, totalPages)
  const pageRows = devices.slice((safe - 1) * pageSize, safe * pageSize)
  const pageAllChecked = pageRows.length > 0 && pageRows.every((d) => checked.has(d.id))
  const pageSomeChecked = pageRows.some((d) => checked.has(d.id))

  const patchGroups = (fn: (gs: Group[]) => Group[]) => setGroups((all) => ({ ...all, [kind]: fn(all[kind]) }))
  const switchKind = (k: Kind) => { setKind(k); setChecked(new Set()); setPage(1); setQ('') }
  const pick = (name: string) => { setSelName((s) => ({ ...s, [kind]: name })); setChecked(new Set()); setPage(1) }
  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const togglePage = () => setChecked((s) => {
    const n = new Set(s)
    pageRows.forEach((d) => (pageAllChecked ? n.delete(d.id) : n.add(d.id)))
    return n
  })
  const removeChecked = () => {
    patchGroups((gs) => gs.map((g) => (g.name === group.name ? { ...g, ids: g.ids.filter((id) => !checked.has(id)) } : g)))
    setChecked(new Set())
  }
  const removeGroup = (name: string) => {
    patchGroups((gs) => gs.filter((g) => g.name !== name))
    if (selName[kind] === name) pick(list.find((g) => g.name !== name)?.name ?? '')
  }

  const shown = list.filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase()))
  const [c1, c2, c3] = COLS[kind]

  return (
    <div className="flex flex-col gap-3 p-4 min-w-[1280px]">
      <PageTitle title="裝置群組" />
      <PillTabs tabs={TABS} value={kind} onChange={switchKind} />

      <div className="flex gap-3 items-stretch">
        {/* 左：群組列表 */}
        <aside className="flex w-[260px] shrink-0 flex-col rounded-card border border-border bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-divider px-4 py-3">
            <h3 className="text-[14px] font-semibold text-ink">群組列表</h3>
            <button onClick={() => setModal('create')} className="text-[13px] font-semibold text-danger hover:opacity-70">建立群組</button>
          </div>
          <div className="p-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mut" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋" className={`${BOX} w-full pl-8`} />
            </div>
          </div>
          <ul className="flex flex-col gap-1 px-3 pb-3">
            {shown.map((g) => {
              const active = g.name === group?.name
              return (
                <li key={g.name}>
                  <div
                    onClick={() => pick(g.name)}
                    className={[
                      'group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-[13px] font-semibold',
                      active ? 'bg-danger-bg text-ink' : 'text-ink hover:bg-inset',
                    ].join(' ')}
                  >
                    {g.name}
                    <button
                      title="刪除群組"
                      onClick={(e) => { e.stopPropagation(); removeGroup(g.name) }}
                      className="text-ink-mut opacity-0 hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              )
            })}
            {shown.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-ink-mut">沒有符合的群組</li>}
          </ul>
        </aside>

        {/* 右：裝置表 */}
        <section className="flex min-w-0 flex-1 flex-col rounded-card border border-border bg-surface shadow-card">
          {group ? (
            <>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-[15px] font-semibold text-ink">{group.name}</h3>
                  <span className="text-[12px] text-ink-sub">
                    {checked.size > 0 ? <>已勾選 <b className="text-ink">{checked.size}</b> / 共 <b className="text-ink">{devices.length}</b> 裝置</> : <>共 <b className="text-ink">{devices.length}</b> 裝置</>}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {checked.size > 0 ? (
                    <>
                      <button onClick={() => setChecked(new Set())} className={BTN_GHOST}>取消</button>
                      <button onClick={removeChecked} className="rounded-lg bg-danger px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90">刪除裝置</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setModal('info')} className={BTN_GHOST}>群組資訊</button>
                      <button onClick={() => setModal('add')} className="rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90">新增裝置</button>
                    </>
                  )}
                </div>
              </div>

              <div className="max-h-[calc(100vh-330px)] min-h-[200px] overflow-auto">
                <table className="w-full text-[13px] border-collapse">
                  <thead>
                    <tr className="text-ink-sub">
                      <Th className="sticky top-0 z-10 w-[44px] bg-inset">
                        <Check checked={pageAllChecked} indeterminate={!pageAllChecked && pageSomeChecked} onChange={togglePage} />
                      </Th>
                      <Th className="sticky top-0 z-10 bg-inset">{c1}</Th>
                      <Th className="sticky top-0 z-10 bg-inset">{c2}</Th>
                      <Th className="sticky top-0 z-10 bg-inset">{c3}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((d) => (
                      <tr key={d.id} className="border-b border-divider hover:bg-inset/40">
                        <td className="px-3 py-2.5"><Check checked={checked.has(d.id)} onChange={() => toggle(d.id)} /></td>
                        <td className="px-3 py-2.5 font-mono text-ink">{d.id}</td>
                        <td className="px-3 py-2.5 font-mono text-ink">{d.code}</td>
                        <td className="px-3 py-2.5 text-ink">{d.address}</td>
                      </tr>
                    ))}
                    {pageRows.length === 0 && (
                      <tr><td colSpan={4} className="px-3 py-10 text-center text-ink-mut">此群組還沒有裝置，按「新增裝置」加入</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-4 pb-3">
                <Pagination page={safe} totalPages={totalPages} onPage={setPage} pageSize={pageSize} onPageSize={(s) => { setPageSize(s); setPage(1) }} />
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center py-20 text-[13px] text-ink-mut">尚無群組，請先「建立群組」</div>
          )}
        </section>
      </div>

      {modal === 'create' && (
        <CreateGroupModal
          taken={list.map((g) => g.name)}
          onClose={() => setModal(null)}
          onCreate={(name) => { patchGroups((gs) => [...gs, { name, ids: [] }]); pick(name); setModal(null) }}
        />
      )}
      {modal === 'info' && group && (
        <SimpleModal title="群組資訊" onClose={() => setModal(null)} actions={<button onClick={() => setModal(null)} className={BTN_GHOST}>關閉</button>}>
          <dl className="grid grid-cols-[96px_1fr] gap-y-3 text-[13px]">
            <dt className="text-ink-sub">群組名稱</dt><dd className="text-ink">{group.name}</dd>
            <dt className="text-ink-sub">裝置類型</dt><dd className="text-ink">{kind === 'dcu' ? 'DCU' : '電表'}</dd>
            <dt className="text-ink-sub">裝置數</dt><dd className="text-ink">{group.ids.length}</dd>
          </dl>
        </SimpleModal>
      )}
      {modal === 'add' && group && (
        <AddDevicesModal
          kind={kind}
          catalog={CATALOG[kind]}
          existing={group.ids}
          onClose={() => setModal(null)}
          onAdd={(ids) => patchGroups((gs) => gs.map((g) => (g.name === group.name ? { ...g, ids: [...g.ids, ...ids] } : g)))}
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

function CreateGroupModal({ taken, onClose, onCreate }: { taken: string[]; onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('')
  const n = name.trim()
  const dup = taken.includes(n)
  return (
    <SimpleModal
      title="建立群組"
      onClose={onClose}
      actions={<>
        <button onClick={onClose} className={BTN_GHOST}>取消</button>
        <button disabled={!n || dup} onClick={() => onCreate(n)} className={BTN_PRIMARY}>建立</button>
      </>}
    >
      <label className="flex flex-col gap-1">
        <span className="px-1 text-[12px] text-ink-sub">群組名稱</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && n && !dup && onCreate(n)} placeholder="請輸入" className={BOX} />
        {dup && <span className="px-1 text-[12px] text-danger">群組名稱已存在</span>}
      </label>
    </SimpleModal>
  )
}

/**
 * 新增裝置（2026-10-16 業主參考圖）：一個多行輸入框，DCU 填序號、電表填表號，可一筆或貼上多筆（換行分隔）。
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
  const idLabel = kind === 'dcu' ? '序號' : '表號'

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
      title="新增裝置"
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
