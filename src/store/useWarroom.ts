import { create } from 'zustand'
import { DEFAULT_CITY, dcuById, meterById } from '@/data/dcuFleet'

export type WarTab = 'fault' | 'relation'
export type WarLevel = 'taiwan' | 'city' // 全台選縣市 / 縣市選行政區
/**
 * 右側清單的檢視／篩選；'online' ＝ 連線（正常＋停用，即非斷線），
 * 'mis' ＝ 切換成「歸屬錯誤電表清單」（不是 DCU 篩選，是換一張清單）。供 KPI 方塊點擊帶入。
 */
export type DcuListFilter = 'all' | 'online' | 'active' | 'offline' | 'disabled' | 'mis'
/**
 * 電表歸屬地圖的「觀察中 DCU」上限。
 * 2026-09-23 依業主意見（效能）：正常電表預設不載入，改成**點選 DCU 加入觀察**，
 * 只畫觀察中 DCU 的電表與相關歸屬錯誤電表；最多 3 台，滿了再點第 4 台會擋下並提示。
 */
export const MAX_WATCH = 3
const FULL_NOTICE = `最多同時觀察 ${MAX_WATCH} 台 DCU，請先在地圖左上「觀察中」移除一台`

interface WarroomState {
  level: WarLevel
  city: string
  district: string
  tab: WarTab
  selectedDcuId: string | null
  selectedMeterId: string | null
  /** 列表 hover 的 DCU（A3：列表 ↔ 地圖高亮連動） */
  hoverDcuId: string | null
  /** DCU 列表的狀態篩選（KPI 卡點擊可直接帶入） */
  listFilter: DcuListFilter
  /**
   * 這次選取是否來自地圖 —— 來自地圖時，右側列表把該列排到最上方，方便對照；
   * 直接點列表列時不重排（否則列會在游標底下跳走）。
   */
  pinSelected: boolean
  /** 全台層級右側是否改顯示 DCU 列表（預設為縣市故障分布） */
  dcuListOpen: boolean
  /**
   * 觀察中的 DCU（電表歸屬地圖，最多 MAX_WATCH 台，依加入順序；順序決定外環色）。
   * 沿用原本的「釘選」欄位名；選取中的 DCU（selectedDcuId）一定在這裡面。
   */
  pinnedDcuIds: string[]
  /** 觀察已滿等提示；at 用來讓同一句提示重複出現時也會重新顯示 */
  watchNotice: { text: string; at: number } | null
  resetNonce: number
  refitNonce: number
  updatedAt: string

  enterTaiwan: () => void
  setCity: (c: string) => void
  setDistrict: (d: string) => void
  setTab: (t: WarTab) => void
  /** 由地圖選取 DCU（會把列表該列置頂） */
  selectDcu: (id: string | null) => void
  /** 點同一台＝收合（比照裝置列表：再次點擊縮回電表列表）；來自列表，不置頂 */
  toggleDcu: (id: string) => void
  /** opts.pin 預設 true（來自地圖）；列表列點擊要傳 { pin: false } */
  selectMeter: (id: string | null, opts?: { pin?: boolean }) => void
  /** 歸屬錯誤電表清單 → 跳到該電表在 L3 的點位 */
  focusMisMeter: (meterId: string) => void
  setHoverDcuId: (id: string | null) => void
  /** 設定列表篩選；一併清除選取並開啟 DCU 列表，讓篩選結果直接可見 */
  setListFilter: (f: DcuListFilter) => void
  /** 全台層級：關閉 DCU 列表，回到縣市故障分布 */
  closeDcuList: () => void
  togglePin: (id: string) => void
  /** 從觀察中移除；若是選取中的那台一併取消選取 */
  unwatchDcu: (id: string) => void
  /** 清空觀察（選取一併清掉） */
  clearWatch: () => void
  dismissWatchNotice: () => void
  clearSelection: () => void
  resetView: () => void
  refitDistrict: () => void
  handoffToRelation: (dcuId: string) => void
}

/**
 * 選到某台 DCU 時要落在哪張圖、哪個層級。
 *
 * 斷線地圖只畫斷線 DCU，選到「正常／停用」的那幾台會整片空白，因此非斷線一律切到
 * 電表歸屬地圖 —— 那是唯一畫得出單台 DCU 與其電表的圖。
 *
 * 光切頁籤還不夠：關係地圖在 L1／L2 是區域選取模式、不畫任何裝置點，所以要**一併
 * 帶到該 DCU 所在的行政區（L3）**，否則切過去仍然什麼都看不到。
 * （2026-09-03 切頁籤、2026-09-04 補上跳層級；與 selectMeter 同一條路徑。）
 *
 * 斷線 DCU 維持在斷線地圖、不換層級 —— 那張圖本來就畫得出它，
 * 由地圖自己的「選取 → 拉近」處理鏡頭即可。
 */
function dcuTarget(id: string | null, s: WarroomState): Partial<WarroomState> {
  if (!id) return {}
  const d = dcuById.get(id)
  if (!d || d.state === 'offline') return {}
  return { tab: 'relation', level: 'city', city: d.city, district: d.district }
}

/**
 * 把 DCU 加入觀察清單。換了縣市就從空清單開始（觀察只在同一個縣市內延續）。
 * 放不下的不加，dropped=true 讓呼叫端決定要擋下還是只提示。
 */
function addWatch(s: WarroomState, ids: (string | null | undefined)[], city: string) {
  const list = city !== s.city ? [] : [...s.pinnedDcuIds]
  let dropped = false
  for (const id of ids) {
    if (!id || list.includes(id)) continue
    if (list.length >= MAX_WATCH) { dropped = true; continue }
    list.push(id)
  }
  return { list, dropped }
}
const notice = (text: string) => ({ watchNotice: { text, at: Date.now() } })
const PARTIAL_NOTICE = `觀察已滿 ${MAX_WATCH} 台，部分相關 DCU 的電表未顯示`

export const useWarroom = create<WarroomState>((set) => ({
  // 首頁＝全台縣市故障分布；進入縣市預設顯示所有行政區（district=''）
  level: 'taiwan',
  city: DEFAULT_CITY,
  district: '',
  tab: 'fault',
  selectedDcuId: null,
  selectedMeterId: null,
  hoverDcuId: null,
  listFilter: 'all',
  pinSelected: false,
  dcuListOpen: false,
  pinnedDcuIds: [],
  watchNotice: null,
  resetNonce: 0,
  refitNonce: 0,
  updatedAt: '前一小時',

  // 回到全台層級（選縣市）；兩張地圖都支援全台，保留目前頁籤，並清掉行政區篩選
  enterTaiwan: () => set({ level: 'taiwan', district: '', dcuListOpen: false, listFilter: 'all', selectedDcuId: null, selectedMeterId: null, pinnedDcuIds: [] }),
  // 選縣市 → 進入縣市層級，預設 district=''（所有行政區放滿畫面）
  // 換縣市才清空觀察；同縣市內換行政區保留（L3 載入的是整個縣市，鄰區的 DCU 本來就看得到）
  setCity: (city) =>
    set((s) => ({ level: 'city', city, district: '', selectedDcuId: null, selectedMeterId: null, pinnedDcuIds: city === s.city ? s.pinnedDcuIds : [] })),
  setDistrict: (district) => set({ district, selectedDcuId: null, selectedMeterId: null }),
  /**
   * 切換地圖頁籤。原則上不改變層級／行政區，兩張圖各自照當前範圍撐滿畫面。
   *
   * 例外（2026-09-07 依業主意見）：從 L3 的**電表歸屬地圖**切到**DCU 斷線地圖**時，
   * 退回 L2 並重置視角。歸屬地圖的 L3 是街道級的裝置視圖，斷線地圖在同一個行政區
   * 只會剩零星幾顆斷線 DCU，沿用同一個鏡頭等於切過去看到一片空白；退回縣市層級才
   * 是斷線地圖有意義的起點。選取一併清掉 —— 行政區的脈絡已經不在了。
   */
  setTab: (tab) =>
    set((s) => {
      if (tab === 'fault' && s.tab === 'relation' && s.level === 'city' && s.district) {
        return {
          tab, district: '',
          selectedDcuId: null, selectedMeterId: null,
          resetNonce: s.resetNonce + 1,
        }
      }
      return { tab }
    }),
  // 從地圖選 DCU：右側一併切到 DCU 列表（全台層級本來顯示的是縣市分布），
  // 否則點了地圖右邊沒有任何反應
  //
  // 落在電表歸屬地圖時，選取＝加入觀察；觀察已滿（且不是已在觀察中的那台）就擋下並提示。
  selectDcu: (selectedDcuId) =>
    set((s) => {
      if (!selectedDcuId) return { selectedDcuId: null, selectedMeterId: null, pinSelected: true }
      const target = dcuTarget(selectedDcuId, s)
      const base = { selectedDcuId, selectedMeterId: null, pinSelected: true, dcuListOpen: true, listFilter: 'all' as DcuListFilter }
      if ((target.tab ?? s.tab) !== 'relation') return { ...target, ...base }
      const { list, dropped } = addWatch(s, [selectedDcuId], target.city ?? s.city)
      if (dropped) return notice(FULL_NOTICE)
      return { ...target, ...base, pinnedDcuIds: list }
    }),
  toggleDcu: (id) =>
    set((s) => {
      // 再點一次＝收合電表列表；觀察保留（要移除請用觀察面板的 ✕）
      if (s.selectedDcuId === id) return { selectedDcuId: null, selectedMeterId: null, pinSelected: false }
      const target = dcuTarget(id, s)
      const base = { selectedDcuId: id, selectedMeterId: null, pinSelected: false }
      if ((target.tab ?? s.tab) !== 'relation') return { ...target, ...base }
      const { list, dropped } = addWatch(s, [id], target.city ?? s.city)
      if (dropped) return notice(FULL_NOTICE)
      return { ...target, ...base, pinnedDcuIds: list }
    }),
  // 直接點電表時，一併帶出其收容 DCU，讓右側電表列表展開並定位到該列。
  // 故障地圖不畫電表，因此選電表一律切到關係地圖，才看得到目標與其歸屬。
  selectMeter: (selectedMeterId, opts) =>
    set((s) => {
      const pinSelected = opts?.pin ?? true
      if (!selectedMeterId) return { selectedMeterId: null, pinSelected }
      const m = meterById.get(selectedMeterId)
      const dcuId = m?.dcuId ?? s.selectedDcuId
      /**
       * 2026-09-03 依業主意見：在 L1／L2 選電表時要**直接跳到該電表所在的 L3**。
       * 原本只切頁籤不換層級，但關係地圖在 L1／L2 是區域選取模式、不畫任何裝置點，
       * 等於選了電表卻什麼都看不到。行政區是唯一畫得出單顆電表與其歸屬的層級。
       */
      const scope = m ? { level: 'city' as WarLevel, city: m.city, district: m.district } : {}
      // 電表的收容 DCU 與白名單應屬 DCU 都加入觀察；放不下的只提示、不擋電表選取
      const { list, dropped } = addWatch(s, [m?.dcuId, m?.expectedDcuId], m?.city ?? s.city)
      return {
        ...scope, selectedMeterId, selectedDcuId: dcuId, tab: 'relation' as WarTab, pinSelected, dcuListOpen: true,
        pinnedDcuIds: list, ...(dropped ? notice(PARTIAL_NOTICE) : {}),
      }
    }),
  /**
   * 從歸屬錯誤電表清單跳到該電表的點位：直接落在 L3（行政區）的關係地圖，
   * 那是唯一畫得出「實際收容 ↔ 白名單應屬」兩條線的層級。
   */
  focusMisMeter: (meterId) => {
    const m = meterById.get(meterId)
    if (!m) return
    set((s) => {
      const { list, dropped } = addWatch(s, [m.dcuId, m.expectedDcuId], m.city)
      return {
        level: 'city', city: m.city, district: m.district, tab: 'relation',
        selectedMeterId: meterId, selectedDcuId: m.dcuId, pinSelected: true,
        dcuListOpen: true, listFilter: 'all', pinnedDcuIds: list,
        ...(dropped ? notice(PARTIAL_NOTICE) : {}),
      }
    })
  },
  setHoverDcuId: (hoverDcuId) => set({ hoverDcuId }),
  setListFilter: (listFilter) => set({ listFilter, dcuListOpen: true, selectedDcuId: null, selectedMeterId: null }),
  /**
   * 返回 DCU 斷線分佈 —— 斷線分佈只存在於全台層級，所以一併回到全台視角，
   * 否則按了返回卻停在縣市層級，右側依然不是斷線分佈（2026-09-03 業主意見）。
   */
  closeDcuList: () =>
    set((s) => ({
      level: 'taiwan', district: '', dcuListOpen: false, listFilter: 'all',
      selectedDcuId: null, selectedMeterId: null, pinnedDcuIds: [],
      resetNonce: s.resetNonce + 1,
    })),
  togglePin: (id) =>
    set((s) => {
      if (s.pinnedDcuIds.includes(id)) return { pinnedDcuIds: s.pinnedDcuIds.filter((x) => x !== id) }
      return s.pinnedDcuIds.length >= MAX_WATCH ? notice(FULL_NOTICE) : { pinnedDcuIds: [...s.pinnedDcuIds, id] }
    }),
  unwatchDcu: (id) =>
    set((s) => ({
      pinnedDcuIds: s.pinnedDcuIds.filter((x) => x !== id),
      ...(s.selectedDcuId === id ? { selectedDcuId: null, selectedMeterId: null } : {}),
    })),
  clearWatch: () => set({ pinnedDcuIds: [], selectedDcuId: null, selectedMeterId: null }),
  dismissWatchNotice: () => set({ watchNotice: null }),
  clearSelection: () => set({ selectedDcuId: null, selectedMeterId: null }),
  resetView: () => set((s) => ({ resetNonce: s.resetNonce + 1 })),
  refitDistrict: () => set((s) => ({ refitNonce: s.refitNonce + 1 })),
  handoffToRelation: (dcuId) => {
    const dcu = dcuById.get(dcuId)
    set((s) => {
      const { list, dropped } = addWatch(s, [dcuId], dcu?.city ?? s.city)
      if (dropped) return notice(FULL_NOTICE)
      return { level: 'city', tab: 'relation', city: dcu?.city ?? s.city, district: dcu?.district ?? s.district, selectedDcuId: dcuId, selectedMeterId: null, pinnedDcuIds: list }
    })
  },
}))
