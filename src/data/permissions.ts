/*
 * 權限管理三頁的 mock 資料（Figma 3892:24129 「權限管理」整段）：
 *   帳號管理     3892:24609
 *   功能項目管理 3901:30807
 *   角色權限管理 3901:35929
 *
 * 全部 deterministic（同一組資料每次載入一致）；新增／編輯／刪除由 usePerm store
 * 在記憶體裡操作，重新整理即還原。TODO: 上線改接 API。
 */

/* ------------------------------------------------------------ 角色 */

export interface Role {
  /** 角色代碼（唯一鍵） */
  code: string
  name: string
  /**
   * 資料範圍（2026-10-16 業主意見：角色要能依案別、區處區分權限，預設全選、可調成部分）。
   * 存的是「可看的」案別 id（見 useCaseFilter 的 CASES）與區處代碼（見下方 REGIONS）。
   */
  caseIds: string[]
  regions: string[]
}

/** 台電區處（代碼＝電號前兩碼；與 dcuFleet 的縣市→區處對照一致） */
export const REGIONS: { code: string; name: string }[] = [
  { code: '01', name: '北市區處' }, { code: '02', name: '北縣區處' }, { code: '03', name: '基隆區處' },
  { code: '04', name: '宜蘭區處' }, { code: '05', name: '中市區處' }, { code: '06', name: '桃園區處' },
  { code: '07', name: '新桃區處' }, { code: '08', name: '高市區處' }, { code: '09', name: '苗栗區處' },
  { code: '10', name: '彰化區處' }, { code: '11', name: '南投區處' }, { code: '12', name: '雲林區處' },
  { code: '13', name: '嘉義區處' }, { code: '14', name: '台南區處' }, { code: '15', name: '屏東區處' },
  { code: '16', name: '花蓮區處' }, { code: '17', name: '台東區處' }, { code: '18', name: '澎湖區處' },
  { code: '19', name: '金門區處' }, { code: '20', name: '馬祖區處' },
]
export const ALL_CASE_IDS = ['case1', 'case2', 'case3', 'case4', 'case5']
export const ALL_REGION_CODES = REGIONS.map((r) => r.code)

const ALL_SCOPE = { caseIds: ALL_CASE_IDS, regions: ALL_REGION_CODES }

export const SEED_ROLES: Role[] = [
  { code: 'SYSADMIN', name: '系統管理者', ...ALL_SCOPE },
  { code: 'AMIADMIN', name: 'AMI管理者', ...ALL_SCOPE },
  { code: 'ENGMGR', name: '工程管理人員', caseIds: ['case2', 'case3'], regions: ALL_REGION_CODES },
  { code: 'ENGINEER', name: '工程師', caseIds: ['case2'], regions: ['01', '02', '03', '06', '07'] },
  { code: 'AUDITOR', name: '稽核人員', ...ALL_SCOPE },
]

/* ------------------------------------------------------------ 帳號 */

export type AccountState = 'active' | 'disabled'

export interface Account {
  id: string
  account: string
  userName: string
  email: string
  /** 角色名稱（對應 Role.name） */
  role: string
  state: AccountState
  /** 以下為編輯帳號彈窗的唯讀資訊 */
  emailVerifiedAt: string
  lastLoginAt: string
  failCount: number
  lockedAt: string
  unlockAt: string
  /** 失效原因（設為失效時填寫） */
  disabledReason?: string
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** 由種子導出的時間字串 YYYY/MM/DD HH:mm:ss */
function stampOf(seed: number, baseDay = 1) {
  const d = baseDay + (seed % 28)
  return `2025/${pad(1 + ((seed >> 3) % 11))}/${pad(d)} ${pad(seed % 24)}:${pad((seed >> 2) % 60)}:${pad((seed >> 5) % 60)}`
}

const NAMES = ['sgc-dev', 'sgc-qa', 'sgc-ops', 'tp-eng', 'ntp-eng', 'tch-eng', 'khh-eng', 'audit01', 'ami-ops', 'hes-admin']

export const SEED_ACCOUNTS: Account[] = Array.from({ length: 42 }, (_, i) => {
  const base = i < NAMES.length ? NAMES[i] : `user${pad(i + 1, 3)}`
  const h = hash(base)
  const role = SEED_ROLES[h % SEED_ROLES.length].name
  // 少數帳號為停用；停用者帶失效原因
  const disabled = h % 9 === 0
  const locked = !disabled && h % 13 === 0
  return {
    id: `ACC-${pad(i + 1, 3)}`,
    account: base,
    userName: base,
    email: `${base}@gmail.com`,
    role,
    state: disabled ? 'disabled' : 'active',
    emailVerifiedAt: stampOf(h),
    lastLoginAt: stampOf(h >> 4, 2),
    failCount: locked ? 5 : h % 3,
    lockedAt: locked ? stampOf(h >> 6, 3) : '-',
    unlockAt: locked ? stampOf(h >> 7, 3) : '-',
    disabledReason: disabled ? '離職，依資安規定停用' : undefined,
  }
})

/* -------------------------------------------------------- 功能項目 */

export interface FuncItem {
  id: string
  /** 頁面名稱 */
  page: string
  /** 該頁面可執行的功能（可勾選的集合） */
  actions: string[]
  updatedAt: string
}

/**
 * 可執行功能的候選清單 —— 編輯彈窗列出全部、勾選的才是該頁面開放的功能。
 * 這份清單同時是「新增可執行功能」會加入的池子。
 */
export const SEED_ACTION_POOL = [
  '新增', '編輯', '刪除', '匯出', '下載', '清單下載', '清單匯出', '修改模式', '轉移電表', '遠端設定', '線上操作',
  '新增角色', '編輯角色', '新增帳號', '編輯帳號', '刪除帳號',
]

/**
 * 各頁面**實際支援**的功能（2026-10-16 業主意見：編輯功能項目時，預設只列該頁面做得出來的功能，
 * 不要把整個系統的功能全列出來）。左右拖拉的「可選功能」就是從這裡來；
 * 新增功能時也是加到指定頁面的這份清單。
 */
export const SEED_PAGE_SUPPORTED: Record<string, string[]> = {
  系統總覽: ['匯出'],
  DCU總覽: ['匯出', '編輯'],
  裝置列表: ['新增', '編輯', '刪除', '匯出'],
  DCU清單: ['清單下載', '清單匯出', '修改模式', '遠端設定', '線上操作'],
  電表清單: ['清單下載', '清單匯出', '修改模式', '線上操作'],
  DCU詳細資料: ['轉移電表', '遠端設定', '線上操作'],
  帳號管理: ['新增帳號', '編輯帳號', '刪除帳號'],
  功能項目管理: ['新增', '編輯'],
  角色權限管理: ['新增角色', '編輯角色'],
}

/**
 * 頁面 → 開放的功能（頁面名稱與側欄一致）。
 * 2026-09-23 依 Figma 3901:35929 / 3901:39601 更新：帳號管理、DCU清單、電表清單、
 * 角色權限管理四組的功能名稱改成設計稿上的寫法（新增帳號／清單下載／清單匯出／編輯角色…；2026-10-16 起「申請帳號」改稱「新增帳號」）。
 */
export const SEED_FUNC_ITEMS: FuncItem[] = [
  { id: 'FN-009', page: '角色權限管理', actions: ['新增角色', '編輯角色'] },
  { id: 'FN-007', page: '帳號管理', actions: ['新增帳號', '刪除帳號', '編輯帳號'] },
  { id: 'FN-004', page: 'DCU清單', actions: ['清單下載', '修改模式', '清單匯出'] },
  { id: 'FN-005', page: '電表清單', actions: ['清單下載', '修改模式', '清單匯出'] },
  { id: 'FN-001', page: '系統總覽', actions: ['匯出'] },
  { id: 'FN-002', page: 'DCU總覽', actions: ['匯出', '編輯'] },
  { id: 'FN-003', page: '裝置列表', actions: ['新增', '編輯', '刪除', '匯出'] },
  { id: 'FN-006', page: 'DCU詳細資料', actions: ['轉移電表', '遠端設定', '線上操作'] },
  { id: 'FN-008', page: '功能項目管理', actions: ['新增', '編輯'] },
].map((f) => ({ ...f, updatedAt: '2025/01/01 00:00:00' }))

/* ------------------------------------------------------ 角色權限 */

/**
 * 權限區塊 —— 一個頁面一組，項目就是該頁面的可執行功能，
 * 因此**直接由功能項目管理那份清單推導**（業主的兩頁本來就是同一份資料）。
 * 2026-09-23 新版設計稿沒有原本的「Header」組（其功能已歸到「角色權限管理」頁），一併移除。
 */
export interface PermGroup {
  key: string
  label: string
  actions: string[]
}

export function permGroups(items: FuncItem[]): PermGroup[] {
  return items.map((f) => ({ key: f.id, label: f.page, actions: [...f.actions] }))
}

/* ------------------------------------------------------ 權限範本 */

/**
 * 角色權限範本（2026-09-23 新版設計稿新增）—— 把一組勾選好的權限存成範本，
 * 之後新增角色時「套用範本」一次勾好，不必逐項點。範本存的是權限鍵（permKey）。
 */
export interface PermTemplate {
  id: string
  name: string
  perms: string[]
}

export function seedTemplates(items: FuncItem[]): PermTemplate[] {
  const all = permGroups(items).flatMap((g) => g.actions.map((a) => permKey(g.key, a)))
  const pick = (pages: string[], actions?: string[]) =>
    permGroups(items)
      .filter((g) => pages.includes(g.label))
      .flatMap((g) => g.actions.filter((a) => !actions || actions.includes(a)).map((a) => permKey(g.key, a)))
  return [
    { id: 'TPL-001', name: '管理員', perms: all },
    { id: 'TPL-002', name: '工程人員', perms: pick(['系統總覽', 'DCU總覽', '裝置列表', 'DCU清單', '電表清單', 'DCU詳細資料']) },
    { id: 'TPL-003', name: '唯讀（僅匯出）', perms: pick(['系統總覽', 'DCU總覽', 'DCU清單', '電表清單'], ['匯出', '清單匯出', '清單下載']) },
  ]
}

/** 一條權限的鍵：<群組鍵>::<功能名稱> */
export const permKey = (groupKey: string, action: string) => `${groupKey}::${action}`

/**
 * 各角色的預設權限（mock）：
 *   系統管理者 全開；其餘依 hash 給一部分，看得出差異即可。
 */
export function seedPerms(roles: Role[], items: FuncItem[]): Record<string, string[]> {
  const groups = permGroups(items)
  const out: Record<string, string[]> = {}
  roles.forEach((r) => {
    const on: string[] = []
    groups.forEach((g) =>
      g.actions.forEach((a) => {
        if (r.code === 'SYSADMIN' || hash(r.code + g.key + a) % 3 !== 0) on.push(permKey(g.key, a))
      }),
    )
    out[r.code] = on
  })
  return out
}
