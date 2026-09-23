<script setup>
import { ref, computed } from 'vue'
import { useShoppingListStore } from '@/stores/shoppingList'
import SimpleChart from '@/components/common/SimpleChart.vue'
import BaseEmpty from '@/components/common/BaseEmpty.vue'
import BaseTag from '@/components/common/BaseTag.vue'
import { fmtPrice } from '@/utils/format'

const shopping = useShoppingListStore()

const book = computed(() => shopping.priceBook)
const selectedKey = ref('')

// 默认展示记录最多的食材（priceBook 已按记录次数排序）
const current = computed(
  () => book.value.find((e) => e.key === selectedKey.value) || book.value[0] || null,
)

const chartLabels = computed(() =>
  current.value ? current.value.records.map((r) => fmtDate(r.date)) : [],
)
const chartData = computed(() =>
  current.value ? current.value.records.map((r) => r.unitPrice) : [],
)
// 明细按时间倒序展示
const descRecords = computed(() =>
  current.value ? [...current.value.records].reverse() : [],
)

// 依据当前价与历史最低/均价的关系给出入手建议
const advice = computed(() => {
  const c = current.value
  if (!c) return null
  if (c.last <= c.min) {
    return { cls: 'good', text: '当前是历史最低价，遇到好价，适合多囤一点 ✅' }
  }
  const diff = ((c.last - c.avg) / c.avg) * 100
  if (diff <= -5) {
    return { cls: 'good', text: `当前低于均价 ${Math.abs(diff).toFixed(0)}%，价格不错，可以入手 ✅` }
  }
  if (diff >= 5) {
    return { cls: 'bad', text: `当前高于均价 ${diff.toFixed(0)}%，价格偏高，不急的话可以再等等 ⏳` }
  }
  return { cls: 'flat', text: '当前价格与均价持平，按需购买即可' }
})

function fmtDate(iso) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
function fmtFull(iso) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
// 相对均价的涨跌幅（用于明细标签）
function diffAvg(price, avg) {
  const diff = ((price - avg) / avg) * 100
  if (Math.abs(diff) < 1) return { text: '持平均价', color: '#90a4ae' }
  return diff < 0
    ? { text: `低 ${Math.abs(diff).toFixed(0)}%`, color: '#4caf50' }
    : { text: `高 ${diff.toFixed(0)}%`, color: '#ef5350' }
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2>💹 食材价格走势</h2>
    </div>
    <p class="muted hint">每次采购时填写的单价都会留存，按食材回看价格曲线、历史最低价与平均价，帮你判断什么价位下手合适。</p>

    <BaseEmpty
      v-if="!book.length"
      emoji="💹"
      text="还没有价格数据，下次采购时填写食材单价，这里就会生成价格曲线"
    />

    <template v-else-if="current">
      <div class="chips">
        <button
          v-for="e in book"
          :key="e.key"
          class="chip"
          :class="{ active: e.key === current.key }"
          @click="selectedKey = e.key"
        >
          <span class="chip-name">{{ e.name }}</span>
          <span class="chip-price muted small">¥{{ fmtPrice(e.last) }}/{{ e.unit }}</span>
        </button>
      </div>

      <div class="card">
        <div class="section-title">
          {{ current.name }}
          <span class="muted small">按 {{ current.unit }} 计 · 共 {{ current.count }} 次采购记录</span>
        </div>

        <div class="grid grid-4 stat-grid">
          <div class="mini-stat">
            <div class="v">¥{{ fmtPrice(current.last) }}</div>
            <div class="l">最新单价（{{ fmtDate(current.lastDate) }}）</div>
          </div>
          <div class="mini-stat best">
            <div class="v">¥{{ fmtPrice(current.min) }}</div>
            <div class="l">历史最低（{{ fmtDate(current.minDate) }}）</div>
          </div>
          <div class="mini-stat">
            <div class="v">¥{{ fmtPrice(current.avg) }}</div>
            <div class="l">平均单价</div>
          </div>
          <div class="mini-stat">
            <div class="v">¥{{ fmtPrice(current.max) }}</div>
            <div class="l">历史最高</div>
          </div>
        </div>

        <div class="advice" :class="advice.cls">{{ advice.text }}</div>

        <SimpleChart
          type="line"
          :labels="chartLabels"
          :data="chartData"
          color="#ff9800"
          :height="220"
          :baseline-zero="false"
        />
      </div>

      <div class="card">
        <div class="section-title">历史采购明细</div>
        <div class="records">
          <div v-for="(r, idx) in descRecords" :key="idx" class="rec-row">
            <span class="rec-date muted">{{ fmtFull(r.date) }}</span>
            <span class="rec-qty muted small">买了 {{ r.quantity }}{{ current.unit }}</span>
            <span class="rec-price">¥{{ fmtPrice(r.unitPrice) }}/{{ current.unit }}</span>
            <BaseTag v-if="r.unitPrice === current.min" text="最低" color="#4caf50" />
            <BaseTag v-else :text="diffAvg(r.unitPrice, current.avg).text" :color="diffAvg(r.unitPrice, current.avg).color" />
            <span class="rec-total">小计 ¥{{ r.lineTotal.toFixed(1) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page-head {
  margin-bottom: 8px;
}
.page-head h2 {
  margin: 0;
}
.hint {
  margin-bottom: 16px;
}
.small {
  font-size: 12px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s;
}
.chip:hover {
  background: var(--surface-2);
}
.chip.active {
  background: var(--primary-light);
  border-color: var(--primary);
  color: var(--primary-dark);
  font-weight: 600;
}
.chip-name {
  font-size: 14px;
}
.stat-grid {
  margin: 12px 0;
}
.mini-stat {
  text-align: center;
  padding: 12px;
  background: var(--surface-2);
  border-radius: 10px;
}
.mini-stat.best {
  background: var(--primary-light);
}
.mini-stat .v {
  font-size: 20px;
  font-weight: 700;
  color: var(--primary-dark);
}
.mini-stat .l {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 2px;
}
.advice {
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}
.advice.good {
  background: #e8f5e9;
  color: #2e7d32;
}
.advice.bad {
  background: #ffebee;
  color: #c62828;
}
.advice.flat {
  background: var(--surface-2);
  color: var(--text-2);
}
.records {
  display: flex;
  flex-direction: column;
}
.rec-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.rec-row:last-child {
  border-bottom: none;
}
.rec-date {
  width: 80px;
  flex-shrink: 0;
}
.rec-qty {
  width: 120px;
  flex-shrink: 0;
}
.rec-price {
  font-weight: 600;
  color: var(--primary-dark);
}
.rec-total {
  margin-left: auto;
  color: var(--text-2);
}
@media (max-width: 640px) {
  .rec-row {
    flex-wrap: wrap;
    row-gap: 4px;
  }
  .rec-qty {
    width: auto;
  }
}
</style>
