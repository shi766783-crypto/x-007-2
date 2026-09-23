<script setup>
import { ref, computed } from 'vue'
import { useShoppingListStore } from '@/stores/shoppingList'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseEmpty from '@/components/common/BaseEmpty.vue'
import { fmtPrice } from '@/utils/format'

const shopping = useShoppingListStore()

const selected = ref(new Set())
const expanded = ref(new Set())

const active = computed(() => shopping.activeItems)
const purchased = computed(() => shopping.purchasedItems)

// 勾选食材的预计花费
const selectedTotal = computed(() =>
  active.value
    .filter((i) => selected.value.has(i.id))
    .reduce((s, i) => s + Number(i.unitPrice || 0) * Number(i.gap || 0), 0),
)
const activeTotal = computed(() =>
  active.value.reduce((s, i) => s + Number(i.unitPrice || 0) * Number(i.gap || 0), 0),
)

function toggle(id) {
  const s = new Set(selected.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selected.value = s
}

function toggleHist(id) {
  const s = new Set(expanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expanded.value = s
}

function generate() {
  const count = shopping.generate()
  selected.value = new Set()
  if (!count.length) alert('本周食材库存充足，无需采购！')
}

function markSelected() {
  const total = selectedTotal.value
  const n = shopping.markPurchased([...selected.value])
  if (n) {
    alert(`已入库 ${n} 种食材，合计 ¥${total.toFixed(1)} ✅`)
    selected.value = new Set()
  }
}

function markAll() {
  const total = activeTotal.value
  const n = shopping.markAllPurchased()
  if (n) {
    alert(`已采购并入库全部 ${n} 种食材，合计 ¥${total.toFixed(1)} ✅`)
    selected.value = new Set()
  }
}

// 当前输入单价与历史价格对比
function priceHint(item) {
  if (!(Number(item.unitPrice) > 0)) return null
  const stats = shopping.priceStatsFor(item.name, item.unit)
  if (!stats) {
    return { cls: 'muted', text: '首次记录价格' }
  }
  if (item.unitPrice < stats.min) {
    return { cls: 'good', text: `🎉 比历史最低还低（最低 ¥${fmtPrice(stats.min)}）` }
  }
  if (stats.count === 1 || item.unitPrice === stats.min) {
    return { cls: 'good', text: `🎉 历史最低价（均价 ¥${fmtPrice(stats.avg)}）` }
  }
  const diff = ((item.unitPrice - stats.avg) / stats.avg) * 100
  if (Math.abs(diff) < 1) {
    return { cls: 'flat', text: `与均价持平（¥${fmtPrice(stats.avg)}）` }
  }
  return diff < 0
    ? { cls: 'good', text: `低于均价 ${Math.abs(diff).toFixed(0)}%（均价 ¥${fmtPrice(stats.avg)}）` }
    : { cls: 'bad', text: `高于均价 ${diff.toFixed(0)}%（均价 ¥${fmtPrice(stats.avg)}）` }
}

function fmtDate(iso) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2>🛒 采购清单</h2>
      <div class="head-actions">
        <BaseButton variant="ghost" size="sm" @click="$router.push('/prices')">💹 价格走势</BaseButton>
        <BaseButton @click="generate">根据本周食谱生成清单</BaseButton>
      </div>
    </div>

    <p class="muted hint">系统会对比本周食谱所需食材总量与当前库存，自动计算缺口数量；采购时填写单价，系统会留存每样食材的价格。</p>

    <div v-if="active.length" class="toolbar card">
      <BaseButton size="sm" @click="markSelected" :disabled="!selected.size">
        标记已采购（{{ selected.size }}）
      </BaseButton>
      <BaseButton size="sm" variant="ghost" @click="markAll">全部标记已采购并入库</BaseButton>
      <span v-if="selected.size" class="toolbar-total">勾选合计 <b>¥{{ selectedTotal.toFixed(1) }}</b></span>
    </div>

    <BaseEmpty v-if="!active.length && !purchased.length" emoji="🛒" text="暂无采购清单，点击上方按钮生成" />

    <div v-if="active.length" class="card">
      <div class="section-title">
        待采购
        <span class="muted small">缺口 {{ active.reduce((s, i) => s + Number(i.gap || 0), 0) }} 件 · 预计 ¥{{ activeTotal.toFixed(1) }}</span>
      </div>
      <div class="list">
        <div v-for="i in active" :key="i.id" class="shop-row">
          <input type="checkbox" :checked="selected.has(i.id)" @change="toggle(i.id)" />
          <div class="info">
            <div class="name">{{ i.name }}</div>
            <div class="muted small">需 {{ i.required }}{{ i.unit }} · 库存 {{ i.inStock }}{{ i.unit }}</div>
            <div v-if="priceHint(i)" class="price-hint" :class="priceHint(i).cls">{{ priceHint(i).text }}</div>
          </div>
          <div class="price">
            <input v-model.number="i.gap" type="number" min="0" step="0.1" class="qty-input" />
            <span class="muted small">{{ i.unit }}</span>
            <span class="muted small">×</span>
            <span class="muted small">¥</span>
            <input v-model.number="i.unitPrice" type="number" min="0" step="0.1" class="price-input" />
            <span class="muted small unit-suffix">/{{ i.unit }}</span>
            <div class="subtotal">¥{{ (Number(i.unitPrice || 0) * Number(i.gap || 0)).toFixed(1) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="purchased.length" class="card">
      <div class="section-title">已采购 <BaseButton size="sm" variant="text" @click="shopping.clearCompleted">清除</BaseButton></div>
      <div class="muted small">
        {{ purchased.map((i) => `${i.name} ${i.gap}${i.unit}`).join('、') }}
      </div>
    </div>

    <div v-if="shopping.history.length" class="card">
      <div class="section-title">
        采购记录
        <router-link to="/prices" class="link small">按食材看价格曲线 →</router-link>
      </div>
      <div class="history">
        <div v-for="h in shopping.history" :key="h.id" class="hist-block">
          <div class="hist-row" @click="toggleHist(h.id)">
            <span class="muted">{{ fmtDate(h.date) }}</span>
            <span class="items">{{ h.items.map((i) => i.name).join('、') }}</span>
            <span class="total">¥{{ (h.total || 0).toFixed(1) }}</span>
            <span class="chev muted small">{{ expanded.has(h.id) ? '收起 ▲' : '明细 ▼' }}</span>
          </div>
          <div v-if="expanded.has(h.id)" class="hist-detail">
            <div v-for="(it, idx) in h.items" :key="idx" class="hist-item">
              <span class="hi-name">{{ it.name }}</span>
              <span class="muted small">
                {{ it.quantity }}{{ it.unit }} × ¥{{ fmtPrice(it.unitPrice) }}/{{ it.unit }}
              </span>
              <span class="hi-total">¥{{ (Number(it.price || 0)).toFixed(1) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.page-head h2 {
  margin: 0;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hint {
  margin-bottom: 16px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.toolbar-total {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-2);
}
.toolbar-total b {
  color: var(--primary-dark);
}
.small {
  font-size: 12px;
}
.link {
  margin-left: auto;
}
.list {
  display: flex;
  flex-direction: column;
}
.shop-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.shop-row:last-child {
  border-bottom: none;
}
.info {
  flex: 1;
  min-width: 0;
}
.name {
  font-weight: 600;
}
.price-hint {
  margin-top: 2px;
  font-size: 12px;
}
.price-hint.good {
  color: #2e7d32;
}
.price-hint.bad {
  color: #c62828;
}
.price-hint.flat {
  color: var(--text-2);
}
.price {
  display: flex;
  align-items: center;
  gap: 4px;
}
.price-input,
.qty-input {
  width: 64px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  text-align: right;
}
.unit-suffix {
  width: 24px;
}
.subtotal {
  margin-left: 8px;
  min-width: 56px;
  text-align: right;
  font-weight: 600;
  color: var(--primary-dark);
}
.history {
  display: flex;
  flex-direction: column;
}
.hist-block {
  border-bottom: 1px solid var(--border);
}
.hist-block:last-child {
  border-bottom: none;
}
.hist-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
  font-size: 13px;
  cursor: pointer;
}
.hist-row .items {
  flex: 1;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hist-row .chev {
  white-space: nowrap;
}
.total {
  font-weight: 600;
  color: var(--primary-dark);
}
.hist-detail {
  padding: 4px 0 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hist-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  padding: 4px 12px;
  background: var(--surface-2);
  border-radius: 6px;
}
.hi-name {
  font-weight: 500;
}
.hi-total {
  margin-left: auto;
  font-weight: 600;
}
@media (max-width: 640px) {
  .shop-row {
    flex-wrap: wrap;
  }
  .shop-row .info {
    flex: 1 1 auto;
  }
  .shop-row .price {
    width: 100%;
    flex-wrap: wrap;
    padding-left: 26px;
  }
  .shop-row .subtotal {
    margin-left: auto;
  }
}
</style>
