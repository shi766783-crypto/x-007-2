import { defineStore } from 'pinia'
import { read, write } from '@/utils/storage'
import { uid } from '@/utils/id'
import { useInventoryStore } from './inventory'
import { useMealPlanStore } from './mealPlan'

const LIST_KEY = 'shopping-list'
const HISTORY_KEY = 'shopping-history'

// 旧版清单项只有该食材整项花费 price，按缺口数量反推单价
function normalizeListItem(item) {
  const { price, ...rest } = item
  if (rest.unitPrice != null) {
    rest.unitPrice = Number(rest.unitPrice) || 0
  } else {
    const gap = Number(rest.gap || 0)
    rest.unitPrice = gap > 0 ? Number(price || 0) / gap : 0
  }
  return rest
}

// 历史记录条目：补全 unitPrice（单价）与 price（该行小计）
function normalizeHistoryItem(item) {
  const quantity = Number(item.quantity || 0)
  const lineTotal = Number(item.price || 0)
  const unitPrice =
    item.unitPrice != null
      ? Number(item.unitPrice) || 0
      : quantity > 0
        ? lineTotal / quantity
        : 0
  return {
    ingredientId: item.ingredientId || null,
    name: item.name,
    unit: item.unit,
    quantity,
    unitPrice,
    price: item.price != null ? lineTotal : unitPrice * quantity,
  }
}

export const useShoppingListStore = defineStore('shoppingList', {
  state: () => ({
    // 清单条目含 unitPrice（单价，元/单位）
    items: read(LIST_KEY, []).map(normalizeListItem),
    // 采购记录 [{ id, date, items: [{ ingredientId, name, unit, quantity, unitPrice, price }], total }]
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
    totalSpend: (state) => state.history.reduce((s, h) => s + Number(h.total || 0), 0),
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
    // 缺口总额（未采购项）
    totalGap: (state) =>
      state.items.filter((i) => !i.purchased).reduce((s, i) => s + Number(i.gap || 0), 0),

    // 食材价格簿：按 名称+单位 聚合所有采购单价，按记录次数排序
    priceBook: (state) => {
      const book = {}
      state.history.forEach((h) => {
        ;(h.items || []).forEach((it) => {
          const unitPrice = Number(it.unitPrice || 0)
          if (!(unitPrice > 0)) return // 未填单价的记录不进入价格曲线
          const key = `${it.name}|${it.unit}`
          if (!book[key]) {
            book[key] = { key, name: it.name, unit: it.unit, records: [] }
          }
          book[key].records.push({
            date: h.date,
            unitPrice,
            quantity: Number(it.quantity || 0),
            lineTotal: unitPrice * Number(it.quantity || 0),
          })
        })
      })
      return Object.values(book)
        .map((entry) => {
          const records = entry.records.sort((a, b) => new Date(a.date) - new Date(b.date))
          const prices = records.map((r) => r.unitPrice)
          const sum = prices.reduce((s, p) => s + p, 0)
          const min = Math.min(...prices)
          const max = Math.max(...prices)
          const minIndex = prices.indexOf(min)
          const last = prices[prices.length - 1]
          return {
            ...entry,
            records,
            count: records.length,
            avg: sum / records.length,
            min,
            max,
            minDate: records[minIndex].date,
            last,
            lastDate: records[records.length - 1].date,
          }
        })
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'))
    },
  },

  actions: {
    persist() {
      write(LIST_KEY, this.items)
      write(HISTORY_KEY, this.history)
    },

    // 按名称+单位查询某食材的历史价格统计（无记录返回 null）
    priceStatsFor(name, unit) {
      return this.priceBook.find((e) => e.name === name && e.unit === unit) || null
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
            unitPrice: 0,
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
      const targets = this.items.filter(
        (i) => ids.includes(i.id) && !i.purchased && Number(i.gap) > 0,
      )

      targets.forEach((i) => {
        inventory.restock({
          name: i.name,
          unit: i.unit,
          quantity: i.gap,
          category: i.category || '其他',
        })
        i.purchased = true
      })

      if (targets.length) {
        const items = targets.map((t) => {
          const unitPrice = Number(t.unitPrice || 0)
          const quantity = Number(t.gap || 0)
          return {
            ingredientId: t.ingredientId || null,
            name: t.name,
            unit: t.unit,
            quantity,
            unitPrice,
            price: unitPrice * quantity,
          }
        })
        const total = items.reduce((s, it) => s + it.price, 0)
        this.history.unshift({
          id: uid('purchase'),
          date: new Date().toISOString(),
          items,
          total,
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
