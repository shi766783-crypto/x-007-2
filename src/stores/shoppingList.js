import { defineStore } from 'pinia'
import { read, write } from '@/utils/storage'
import { uid } from '@/utils/id'
import { useInventoryStore } from './inventory'
import { useMealPlanStore } from './mealPlan'

const LIST_KEY = 'shopping-list'
const HISTORY_KEY = 'shopping-history'

// 旧版清单只有 price（被当作总价），迁移为单价 + 数量
function normalizeListItem(raw) {
  const quantity = Number(raw.quantity) > 0 ? Number(raw.quantity) : Number(raw.gap) || 0
  // 旧记录没有 unitPrice：若有 price 则按数量反推单价
  let unitPrice = Number(raw.unitPrice)
  if (!isFinite(unitPrice) || unitPrice < 0) {
    unitPrice = quantity > 0 ? Number(raw.price || 0) / quantity : Number(raw.price || 0)
  }
  return { ...raw, quantity, unitPrice }
}

// 旧版采购明细只有 price（即该食材总花费），补齐 unitPrice/quantity/total
function normalizeHistoryItem(raw) {
  const quantity = Number(raw.quantity)
  const hasQty = isFinite(quantity) && quantity > 0
  const qty = hasQty ? quantity : 1
  let unitPrice = Number(raw.unitPrice)
  if (!isFinite(unitPrice) || unitPrice < 0) {
    unitPrice = hasQty ? Number(raw.price || 0) / quantity : Number(raw.price || 0)
  }
  const total = Number(raw.total) > 0 ? Number(raw.total) : unitPrice * qty
  return {
    name: raw.name,
    unit: raw.unit,
    quantity: qty,
    unitPrice,
    total,
  }
}

export const useShoppingListStore = defineStore('shoppingList', {
  state: () => ({
    items: read(LIST_KEY, []).map(normalizeListItem),
    // 采购记录 [{ id, date, items: [{ name, unit, quantity, unitPrice, total }], total }]
    history: read(HISTORY_KEY, []).map((h) => ({
      ...h,
      items: (h.items || []).map(normalizeHistoryItem),
    })),
  }),

  getters: {
    activeItems: (state) => state.items.filter((i) => !i.purchased),
    purchasedItems: (state) => state.items.filter((i) => i.purchased),
    // 本轮采购轮次（完成次数）
    purchaseRounds: (state) => state.history.length,
    // 总花费
    totalSpend: (state) =>
      state.history.reduce((s, h) => s + Number(h.total || 0), 0),
    weeklySpend() {
      const now = new Date()
      const start = new Date(now)
      const day = now.getDay()
      start.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
      start.setHours(0, 0, 0, 0)
      return this.history
        .filter((h) => new Date(h.date) >= start)
        .reduce((s, h) => s + Number(h.total || 0), 0)
    },
    // 缺口总额（未采购项，按单价×数量估算）
    totalGap: (state) =>
      state.items
        .filter((i) => !i.purchased)
        .reduce((s, i) => s + Number(i.unitPrice || 0) * Number(i.quantity || i.gap || 0), 0),

    // 全部采购单价明细，按时间正序（用于画价格曲线）
    // [{ date, purchaseId, name, unit, quantity, unitPrice, total }]
    priceEntries(state) {
      const entries = []
      ;[...state.history].reverse().forEach((h) => {
        h.items.forEach((it) => {
          entries.push({
            date: h.date,
            purchaseId: h.id,
            name: it.name,
            unit: it.unit,
            quantity: Number(it.quantity || 0),
            unitPrice: Number(it.unitPrice || 0),
            total: Number(it.total || 0),
          })
        })
      })
      return entries
    },

    // 按 食材+单位 聚合的价格档案
    // [{ key, name, unit, count, latest, latestDate, min, minDate, max, avg(数量加权), totalQty, totalSpend }]
    priceProfiles() {
      const map = {}
      this.priceEntries.forEach((e) => {
        if (!e.unitPrice || e.unitPrice <= 0) return
        const key = `${e.name}|${e.unit}`
        if (!map[key]) {
          map[key] = {
            key,
            name: e.name,
            unit: e.unit,
            count: 0,
            min: Infinity,
            max: 0,
            totalQty: 0,
            totalSpend: 0,
          }
        }
        const p = map[key]
        p.count += 1
        p.totalQty += e.quantity
        p.totalSpend += e.unitPrice * e.quantity
        if (e.unitPrice < p.min) {
          p.min = e.unitPrice
          p.minDate = e.date
        }
        if (e.unitPrice > p.max) p.max = e.unitPrice
        // entries 已按时间正序，后写入的即最新
        p.latest = e.unitPrice
        p.latestDate = e.date
      })
      return Object.values(map)
        .map((p) => ({
          ...p,
          avg: p.totalQty > 0 ? p.totalSpend / p.totalQty : p.latest,
        }))
        .sort((a, b) => b.latestDate.localeCompare(a.latestDate))
    },
  },

  actions: {
    persist() {
      write(LIST_KEY, this.items)
      write(HISTORY_KEY, this.history)
    },

    // 单个清单条目更新（单价/数量实时保存）
    updateItem(id, patch) {
      const idx = this.items.findIndex((i) => i.id === id)
      if (idx === -1) return
      this.items[idx] = { ...this.items[idx], ...patch }
      this.persist()
    },

    // 根据本周食谱计划与库存生成采购清单
    generate() {
      const mealPlan = useMealPlanStore()
      const inventory = useInventoryStore()
      const requirements = mealPlan.weeklyRequirements

      this.items = requirements
        .map((req) => {
          const inStock = inventory.findByRef(req)
          const available = inStock ? Number(inStock.quantity || 0) : 0
          const gap = Math.max(0, req.required - available)
          return {
            id: uid('shop'),
            name: req.name,
            unit: req.unit,
            ingredientId: req.ingredientId,
            required: req.required,
            inStock: available,
            gap,
            quantity: gap, // 实际采购数量，默认等于缺口
            unitPrice: 0, // 每单位单价（元/单位）
            purchased: false,
            createdAt: new Date().toISOString(),
          }
        })
        .filter((i) => i.gap > 0)

      this.persist()
      return this.items
    },

    // 标记已采购并自动入库
    markPurchased(ids) {
      const inventory = useInventoryStore()
      const targets = this.items.filter((i) => ids.includes(i.id) && !i.purchased)

      const records = []
      targets.forEach((i) => {
        const quantity = Number(i.quantity) > 0 ? Number(i.quantity) : Number(i.gap) || 0
        const unitPrice = Number(i.unitPrice) > 0 ? Number(i.unitPrice) : 0
        inventory.restock({
          name: i.name,
          unit: i.unit,
          quantity,
          category: i.category || '其他',
        })
        i.purchased = true
        records.push({
          name: i.name,
          unit: i.unit,
          quantity,
          unitPrice,
          total: +(unitPrice * quantity).toFixed(2),
        })
      })

      if (records.length) {
        const total = records.reduce((s, r) => s + r.total, 0)
        this.history.unshift({
          id: uid('purchase'),
          date: new Date().toISOString(),
          items: records,
          total: +total.toFixed(2),
        })
      }
      this.persist()
      return targets.length
    },

    // 全部标记已采购
    markAllPurchased() {
      const ids = this.activeItems.map((i) => i.id)
      return this.markPurchased(ids)
    },

    clearCompleted() {
      this.items = this.items.filter((i) => !i.purchased)
      this.persist()
    },

    resetList() {
      this.items = []
      this.persist()
    },
  },
})
