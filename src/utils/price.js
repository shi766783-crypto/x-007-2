// 价格相关工具：金额格式化与价格水平判断

// 金额格式化：保留两位小数，去除多余的末尾零
export function fmtPrice(v) {
  const n = Number(v)
  if (!isFinite(n) || n <= 0) return '0'
  return n.toFixed(2).replace(/\.?0+$/, '')
}

// 数量格式化：整数不带小数点
export function fmtQty(v) {
  const n = Number(v)
  if (!isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

// 价格水平判断：当前单价相对历史最低/均价
// 返回 { level, text, pct }，level: low | good | flat | high | unknown
export function priceLevel(unitPrice, profile) {
  const up = Number(unitPrice)
  if (!isFinite(up) || up <= 0 || !profile || profile.count < 2) {
    return { level: 'unknown', text: '', pct: null }
  }

  const { min, avg, count } = profile
  // 达到历史最低
  if (up <= min + 1e-9) {
    return { level: 'low', text: `历史最低（均价 ${fmtPrice(avg)}）`, pct: 0 }
  }

  const diff = (up - avg) / avg
  const pct = Math.abs(diff) * 100
  if (Math.abs(diff) <= 0.02) {
    return { level: 'flat', text: `与均价持平 ${fmtPrice(avg)}`, pct }
  }
  if (diff < 0) {
    return { level: 'good', text: `低于均价 ${pct.toFixed(0)}%`, pct }
  }
  return { level: 'high', text: `高于均价 ${pct.toFixed(0)}%`, pct, count }
}

// 价格水平对应的标签配色
export const PRICE_LEVEL_COLORS = {
  low: { color: '#4caf50', bg: '#e8f5e9' },
  good: { color: '#43a047', bg: '#f1f8e9' },
  flat: { color: '#646a73', bg: '#f0f2f5' },
  high: { color: '#ef5350', bg: '#ffebee' },
  unknown: { color: '#646a73', bg: '#f0f2f5' },
}
