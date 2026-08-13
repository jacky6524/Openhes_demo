export const fmtInt = (n: number) => n.toLocaleString('en-US')
export const fmtPct = (n: number, d = 2) => `${n.toFixed(d)}%`
