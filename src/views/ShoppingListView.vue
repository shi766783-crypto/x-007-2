<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useShoppingListStore } from '@/stores/shoppingList'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseEmpty from '@/components/common/BaseEmpty.vue'
import { fmtPrice, fmtQty, priceLevel, PRICE_LEVEL_COLORS } from '@/utils/price'

const shopping = useShoppingListStore()
const router = useRouter()

const selected = ref(new Set())
const expanded = ref(new Set())

const active = computed(() => shopping.activeItems)
const purchased = computed(() => shopping.purchasedItems)

// 食材名+单位 -> 历史价格档案
const profileMap = computed(() => {
  const map = {}
  shopping.priceProfiles.forEach((p) => (map[p.key] = p))
  return map
})

function rowSubtotal(i) {
  const qty = Number(i.quantity) > 0 ? Number(i.quantity) : Number(i.gap) || 0
  return Number(i.unitPrice || 0) * qty
}

const selectedSubtotal = computed(() =>
  active.value.filter((i) => selected.value.has(i.id)).reduce((s, i) => s + rowSubtotal(i), 0),
)

const allSubtotal = computed(() => active.value.reduce((s, i) => s + rowSubtotal(i), 0))

function levelOf(i) {
  return priceLevel(i.unitPrice, profileMap.value[`${i.name}|${i.unit}`])
}
function levelStyle(i) {
  return PRICE_LEVEL_COLORS[levelOf(i).level] || PRICE_LEVEL_COLORS.unknown
}

function toggle(id) {
  const s = new Set(selected.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selected.value = s
}

function toggleExpand(id) {
  const s = new Set(expanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expanded.value = s
}

// 数量/单价失焦时纠正非法值并持久化
function sanitize(i) {
  const patch = {}
  const qty = Number(i.quantity)
  patch.quantity = isFinite(qty) && qty > 0 ? qty : Number(i.gap) || 0
  const price = Number(i.unitPrice)
  patch.unitPrice = isFinite(price) && price >= 0 ? price : 0
  shopping.updateItem(i.id, patch)
}

function generate() {
  const count = shopping.generate()
  selected.value = new Set()
  if (!count.length) alert('本周食材库存充足，无需采购！')
}

function markSelected() {
  const n = shopping.markPurchased([...selected.value])
  if (n) {
    selected.value = new Set()
    alert(`已入库 ${n} 种食材 ✅`)
  }
}

function markAll() {
  const n = shopping.markAllPurchased()
  selected.value = new Set()
  if (n) alert(`已采购并入库全部 ${n} 种食材 ✅`)
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
      <BaseButton @click="generate">根据本周食谱生成清单</BaseButton>
    </div>

    <p class="muted hint">
      系统会对比本周食谱所需食材总量与当前库存，自动计算缺口数量。采购时填写每样食材的
      <b>单价</b>与<b>数量</b>，完成后自动留存，可在「价格走势」中回看历史曲线。
    </p>

    <div v-if="active.length" class="toolbar card">
      <BaseButton size="sm" @click="markSelected" :disabled="!selected.size">
        标记已采购（{{ selected.size }}）
      </BaseButton>
      <BaseButton size="sm" variant="ghost" @click="markAll">全部标记已采购并入库</BaseButton>
      <span class="toolbar-sum muted small">
        已选 ¥{{ fmtPrice(selectedSubtotal) }} · 合计 ¥{{ fmtPrice(allSubtotal) }}
      </span>
      <router-link to="/prices" class="price-link">📈 价格走势分析 →</router-link>
    </div>

    <BaseEmpty v-if="!active.length && !purchased.length" emoji="🛒" text="暂无采购清单，点击上方按钮生成" />

    <div v-if="active.length" class="card">
      <div class="section-title">待采购 <span class="muted small">缺口 {{ active.reduce((s, i) => s + i.gap, 0) }} 件</span></div>
      <div class="list">
        <div v-for="i in active" :key="i.id" class="shop-row">
          <input type="checkbox" :checked="selected.has(i.id)" @change="toggle(i.id)" />
          <div class="info">
            <div class="name">{{ i.name }}</div>
            <div class="muted small">需 {{ i.required }}{{ i.unit }} · 库存 {{ i.inStock }}{{ i.unit }} · 缺 {{ i.gap }}{{ i.unit }}</div>
          </div>
          <div class="num-field">
            <input
              v-model.number="i.quantity"
              type="number"
              min="0"
              step="0.1"
              @blur="sanitize(i)"
            />
            <span class="unit">{{ i.unit }}</span>
          </div>
          <div class="num-field price-field">
            <span class="muted small">¥</span>
            <input
              v-model.number="i.unitPrice"
              type="number"
              min="0"
              step="0.1"
              placeholder="单价"
              @blur="sanitize(i)"
            />
            <span class="unit">/{{ i.unit }}</span>
          </div>
          <div class="subtotal">
            <div class="st-val">¥{{ fmtPrice(rowSubtotal(i)) }}</div>
            <span
              v-if="levelOf(i).level !== 'unknown'"
              class="level-tag"
              :style="{ color: levelStyle(i).color, background: levelStyle(i).bg }"
            >
              {{ levelOf(i).text }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="purchased.length" class="card">
      <div class="section-title">已采购 <BaseButton size="sm" variant="text" @click="shopping.clearCompleted">清除</BaseButton></div>
      <div class="muted small">
        {{ purchased.map((i) => `${i.name} ${i.quantity ?? i.gap}${i.unit}`).join('、') }}
      </div>
    </div>

    <div v-if="shopping.history.length" class="card">
      <div class="section-title">
        <span>采购记录</span>
        <router-link to="/prices" class="link">价格走势分析 →</router-link>
      </div>
      <div class="history">
        <div v-for="h in shopping.history" :key="h.id" class="hist-row" @click="toggleExpand(h.id)">
          <span class="caret muted">{{ expanded.has(h.id) ? '▾' : '▸' }}</span>
          <span class="muted date">{{ fmtDate(h.date) }}</span>
          <span class="items">{{ h.items.map((i) => i.name).join('、') }}</span>
          <span class="total">¥{{ fmtPrice(h.total) }}</span>
        </div>
        <div v-if="expanded.size" class="hist-detail">
          <template v-for="h in shopping.history.filter((x) => expanded.has(x.id))" :key="h.id">
            <div v-for="(it, idx) in h.items" :key="h.id + idx" class="detail-row">
              <span class="d-name">{{ it.name }}</span>
              <span class="muted small">{{ fmtQty(it.quantity) }}{{ it.unit }} × ¥{{ fmtPrice(it.unitPrice) }}/{{ it.unit }}</span>
              <span class="d-total">¥{{ fmtPrice(it.total) }}</span>
            </div>
          </template>
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
.hint {
  margin-bottom: 16px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.toolbar-sum {
  margin-left: auto;
  white-space: nowrap;
}
.price-link {
  font-size: 13px;
  white-space: nowrap;
}
.small {
  font-size: 12px;
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
.num-field {
  display: flex;
  align-items: center;
  gap: 4px;
}
.num-field input {
  width: 72px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  text-align: right;
}
.unit {
  font-size: 12px;
  color: var(--text-2);
}
.price-field input {
  width: 80px;
}
.subtotal {
  width: 130px;
  text-align: right;
}
.st-val {
  font-weight: 600;
  color: var(--primary-dark);
}
.level-tag {
  display: inline-block;
  margin-top: 2px;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 8px;
  white-space: nowrap;
}
.history {
  display: flex;
  flex-direction: column;
}
.hist-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  cursor: pointer;
}
.hist-row .date {
  white-space: nowrap;
}
.hist-row .items {
  flex: 1;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.total {
  font-weight: 600;
  color: var(--primary-dark);
}
.caret {
  font-size: 11px;
  width: 12px;
}
.hist-detail {
  background: var(--surface-2);
  border-radius: 8px;
  padding: 6px 12px;
  margin-bottom: 6px;
}
.detail-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px dashed var(--border);
}
.detail-row:last-child {
  border-bottom: none;
}
.detail-row .d-name {
  flex: 1;
  font-weight: 500;
}
.detail-row .d-total {
  font-weight: 600;
  color: var(--primary-dark);
}
@media (max-width: 768px) {
  .shop-row {
    flex-wrap: wrap;
  }
  .info {
    flex-basis: calc(100% - 40px);
  }
  .subtotal {
    text-align: right;
    margin-left: auto;
  }
  .toolbar {
    flex-wrap: wrap;
  }
  .toolbar-sum {
    margin-left: 0;
  }
}
</style>
