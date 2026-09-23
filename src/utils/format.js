// 通用数值格式化

// 单价统一保留两位小数（如 ¥3.50/斤），便于历史价格对比
export function fmtPrice(p) {
  return Number(p || 0).toFixed(2)
}
