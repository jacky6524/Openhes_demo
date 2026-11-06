import { useState } from 'react'
import { SimpleModal, BTN_GHOST, BTN_PRIMARY } from '@/components/shared/SimpleModal'
import { FIELD_BOX } from '@/components/shared/TargetSearch'

/**
 * 頂欄「帳號」→ 個人資料維護（2026-11-06 業主設計稿 Frame 1321315265）。
 * 上半部唯讀帳號資訊，下半部可改用戶名稱／電子郵件與重設密碼。資料為 mock，送出只關閉視窗。
 */
const INFO: Array<[string, React.ReactNode]> = [
  ['用戶編號', 'testuser'],
  ['角色', '系統管理者'],
  ['最後登入時間', '2026/11/04 14:20:16'],
  ['登入失敗次數', '0'],
  ['鎖定時間', '--'],
  ['解鎖時間', '--'],
  [
    '帳號狀態',
    <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F6EC] px-2 py-0.5 text-[12px] font-semibold text-[#2F8A4B]">
      <span className="size-1.5 rounded-full bg-current" />使用中
    </span>,
  ],
  ['上次變更密碼時間', '2026/11/04 14:20:16'],
]

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('陳小美')
  const [email, setEmail] = useState('abc123@gmail.com')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const mismatch = pw !== '' && pw2 !== '' && pw !== pw2

  return (
    <SimpleModal
      title="個人資料維護"
      onClose={onClose}
      width={880}
      actions={
        <>
          <button onClick={onClose} className={BTN_GHOST}>取消</button>
          <button onClick={onClose} disabled={mismatch || !name.trim()} className={BTN_PRIMARY}>送出</button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 overflow-hidden rounded-lg">
          {INFO.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 px-2 py-2 text-[13px] [&:nth-child(4n+1)]:bg-inset [&:nth-child(4n+2)]:bg-inset">
              <span className="flex w-[130px] shrink-0 items-center gap-2 text-ink-sub">
                <span className="size-1.5 rounded-full" style={{ background: '#2B7FFF' }} />{k}
              </span>
              <span className="min-w-0 truncate tabular-nums text-ink">{v}</span>
            </div>
          ))}
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="h-4 w-[3px] rounded-full bg-danger" />
            <h3 className="text-[15px] font-semibold text-ink">變更個人資料</h3>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Input label="用戶名稱" value={name} onChange={setName} />
            <Input label="電子郵件" value={email} onChange={setEmail} type="email" />
            <Input label="重設密碼" value={pw} onChange={setPw} type="password" placeholder="不變更請留空" />
            <Input label="再次輸入新密碼" value={pw2} onChange={setPw2} type="password" error={mismatch ? '兩次輸入的密碼不一致' : undefined} />
          </div>
        </section>
      </div>
    </SimpleModal>
  )
}

function Input({ label, value, onChange, type = 'text', placeholder, error }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; error?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="px-2 text-[12px] text-ink-sub">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${FIELD_BOX} w-full`} />
      {error && <span className="px-2 text-[12px] text-danger">{error}</span>}
    </label>
  )
}
