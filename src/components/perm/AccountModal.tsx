import { useState } from 'react'
import { usePerm } from '@/store/usePerm'
import type { Account } from '@/data/permissions'
import { AccountPill, Field, INPUT, ModalShell, Panel, ReadOnly } from '@/components/perm/PermUi'

/**
 * 申請帳號（Figma 3892:27082）—— 帳號／用戶名稱／電子郵件／設定密碼／再次輸入密碼。
 * demo 不做真正的密碼規則檢核，只擋必填。
 */
export function NewAccountModal({ onClose }: { onClose: () => void }) {
  const addAccount = usePerm((s) => s.addAccount)
  const roles = usePerm((s) => s.roles)
  const [f, setF] = useState({ account: '', userName: '', email: '', pw: '', pw2: '' })
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f, v: string) => setF((o) => ({ ...o, [k]: v }))

  const submit = () => {
    if (!f.account.trim() || !f.userName.trim() || !f.email.trim()) return setErr('帳號、用戶名稱、電子郵件為必填')
    if (!f.pw || f.pw !== f.pw2) return setErr('兩次輸入的密碼不一致')
    addAccount({
      account: f.account.trim(),
      userName: f.userName.trim(),
      email: f.email.trim(),
      role: roles[0]?.name ?? '',
      state: 'active',
      emailVerifiedAt: '-',
      lastLoginAt: '-',
      failCount: 0,
      lockedAt: '-',
      unlockAt: '-',
    })
    onClose()
  }

  return (
    <ModalShell title="申請帳號" onClose={onClose} onSubmit={submit}>
      <div className="flex gap-4">
        <Field label="帳號" required>
          <input className={INPUT} value={f.account} onChange={(e) => set('account', e.target.value)} placeholder="請輸入" />
        </Field>
        <Field label="用戶名稱" required>
          <input className={INPUT} value={f.userName} onChange={(e) => set('userName', e.target.value)} placeholder="請輸入" />
        </Field>
      </div>
      <Field label="電子郵件" required>
        <input className={INPUT} value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="abc@gmail.com" />
      </Field>
      <div className="flex gap-4">
        <Field label="設定密碼" required>
          <input type="password" className={INPUT} value={f.pw} onChange={(e) => set('pw', e.target.value)} placeholder="輸入" />
        </Field>
        <Field label="再次輸入密碼" required>
          <input type="password" className={INPUT} value={f.pw2} onChange={(e) => set('pw2', e.target.value)} placeholder="輸入" />
        </Field>
      </div>
      {err && <p className="text-[12.5px] text-brand">{err}</p>}
    </ModalShell>
  )
}

/**
 * 編輯帳號（Figma 3898:24977 / 3892:28708 / 3892:28940 三個展開狀態合成一支）：
 *   · 可編輯：用戶名稱、角色、電子郵件
 *   · 唯讀：電子郵件驗證時間／最後登入時間／登入失敗次數／鎖定時間／解鎖時間
 *   · 帳號狀態：設為失效（需填失效原因）／恢復使用中
 *   · 強制重設密碼（展開後填兩次新密碼）、解鎖帳號
 */
export function EditAccountModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const roles = usePerm((s) => s.roles)
  const updateAccount = usePerm((s) => s.updateAccount)

  const [userName, setUserName] = useState(account.userName)
  const [role, setRole] = useState(account.role)
  const [email, setEmail] = useState(account.email)
  const [state, setState] = useState(account.state)
  const [reason, setReason] = useState(account.disabledReason ?? '')

  /** 展開中的子動作：設為失效 / 強制重設密碼 */
  const [expand, setExpand] = useState<null | 'disable' | 'reset'>(null)
  const [pw, setPw] = useState({ a: '', b: '' })
  /** 子動作完成後的提示（demo 不真的送出） */
  const [done, setDone] = useState('')

  const submit = () => {
    updateAccount(account.id, { userName, role, email, state, disabledReason: state === 'disabled' ? reason : undefined })
    onClose()
  }

  return (
    <ModalShell title="編輯帳號" onClose={onClose} onSubmit={submit}>
      {/* 帳號本身不可改 */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] text-ink-mut">帳號</span>
        <span className="text-[19px] font-bold text-ink">{account.account}</span>
      </div>

      <div className="flex gap-4">
        <Field label="用戶名稱">
          <input className={INPUT} value={userName} onChange={(e) => setUserName(e.target.value)} />
        </Field>
        <Field label="角色">
          <select className={INPUT} value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r.code} value={r.name}>{r.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="電子郵件">
        <input className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>

      <Panel className="flex flex-col gap-3">
        <div className="flex gap-4">
          <ReadOnly label="電子郵件驗證時間" value={account.emailVerifiedAt} />
          <ReadOnly label="最後登入時間" value={account.lastLoginAt} />
        </div>
        <div className="flex gap-4">
          <ReadOnly label="登入失敗次數" value={String(account.failCount)} />
          <ReadOnly label="鎖定時間" value={account.lockedAt} />
        </div>
        <ReadOnly label="解鎖時間" value={account.unlockAt} />
      </Panel>

      {/* 帳號狀態 */}
      <Panel className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-ink-mut">帳號狀態</span>
            <AccountPill active={state === 'active'} />
          </div>
          <span className="flex-1" />
          {state === 'active' ? (
            <button
              onClick={() => setExpand(expand === 'disable' ? null : 'disable')}
              className="rounded-lg border border-brand/30 bg-brand-soft px-4 py-1.5 text-[13px] font-medium text-brand hover:bg-brand-soft/70"
            >
              設為失效
            </button>
          ) : (
            <button
              onClick={() => { setState('active'); setReason(''); setDone('已恢復為使用中，按右上「送出」生效') }}
              className="rounded-lg border border-border bg-surface px-4 py-1.5 text-[13px] text-ink-sub hover:bg-inset"
            >
              恢復使用中
            </button>
          )}
        </div>

        {expand === 'disable' && (
          <div className="flex flex-col gap-2 border-t border-divider pt-3">
            <input className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="請輸入失效原因" />
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setExpand(null)} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] text-ink-sub hover:bg-inset">
                取消
              </button>
              <button
                onClick={() => { setState('disabled'); setExpand(null); setDone('已標記為失效，按右上「送出」生效') }}
                disabled={!reason.trim()}
                className="rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                確認失效
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-3 border-t border-divider pt-3">
          <button
            onClick={() => setExpand(expand === 'reset' ? null : 'reset')}
            className={[
              'flex-1 rounded-lg border px-4 py-1.5 text-[13px]',
              expand === 'reset' ? 'border-brand/30 bg-brand-soft font-medium text-brand' : 'border-border bg-surface text-ink-sub hover:bg-inset',
            ].join(' ')}
          >
            強制重設密碼
          </button>
          <button
            onClick={() => setDone('已送出解鎖要求')}
            className="flex-1 rounded-lg border border-border bg-surface px-4 py-1.5 text-[13px] text-ink-sub hover:bg-inset"
          >
            解鎖帳號
          </button>
        </div>

        {expand === 'reset' && (
          <div className="flex flex-col gap-2 border-t border-divider pt-3">
            <div className="flex gap-4">
              <Field label="重設密碼">
                <input type="password" className={INPUT} value={pw.a} onChange={(e) => setPw((o) => ({ ...o, a: e.target.value }))} placeholder="輸入" />
              </Field>
              <Field label="再次輸入新密碼">
                <input type="password" className={INPUT} value={pw.b} onChange={(e) => setPw((o) => ({ ...o, b: e.target.value }))} placeholder="輸入" />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setExpand(null)} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] text-ink-sub hover:bg-inset">
                取消
              </button>
              <button
                onClick={() => { setExpand(null); setPw({ a: '', b: '' }); setDone('已送出密碼重設') }}
                disabled={!pw.a || pw.a !== pw.b}
                className="rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                確認重設
              </button>
            </div>
          </div>
        )}

        {done && <p className="text-[12.5px] text-ink-mut">{done}</p>}
      </Panel>
    </ModalShell>
  )
}
