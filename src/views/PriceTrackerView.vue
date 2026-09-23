<script setup>
import { ref, computed } from 'vue'
import { useShoppingListStore } from '@/stores/shoppingList'
import SimpleChart from '@/components/common/SimpleChart.vue'
import BaseEmpty from '@/components/common/BaseEmpty.vue'
import { fmtPrice, fmtQty } from '@/utils/price'

const shopping = useShoppingListStore()

const selectedKey = ref('')

const profiles = computed(() => shopping.priceProfiles)

// 默认选中最近采购的食材
const activeKey = computed(
  () => selectedKey.value || profiles.value[0]?.key || '',
)

const activeProfile = computed(() =>
  profiles.value.find((p) => p.key === activeKey.value),
)

// 选中食材的逐次采购价格（时间正序）
const trend = computed(() => {
  if (!activeProfile.value) return { labels: [], data: [], records: [] }
  const records = shopping.priceEntries
    .filter((e) => `${e.name}|${e.unit}` === activeKey.value && e.unitPrice > 0)
  return {
    records,
    labels: records.map((r) => {
      const d = new Date(r.date)
      return `${d.getMonth() + 1}/${d.getDate()}`
    }),
    data: records.map((r) => Number(r.unitPrice.toFixed(2))),
  }
})

const savingsVsAvg = computed(() => {
  const p = activeProfile.value
  if (!p || !p.latest || p.count < 2) return null
  return p.latest - p.avg
})

function fmtDate(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

// 入手建议
function advice(p) {
  if (!p || p.count < 2) return '再记录一两次价格后，就能给出入手建议'
  if (p.latest <= p.min + 1e-9) return '当前正是历史低价，建议按需多囤'
  if (p.latest < p.avg) return '低于历史均价，是合适的入手时机'
  if (Math.abs(p.latest - p.avg) / p.avg <= 0.02) return '与历史均价持平，刚需可买'
  return '高于历史均价，不急需可以再等等'
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2>📈 价格走势分析</h2>
    </div>
    <p class="muted hint">每次采购时记录的单价会自动归档，按食材查看历史价格曲线与最低均价，判断什么价格下手合适。</p>

    <BaseEmpty
      v-if="!profiles.length"
      emoji="💰"
      text="还没有价格记录，去采购清单完成一次采购并填写单价吧"
    />

    <template v-else>
      <div class="layout">
        <div class="card ingredient-card">
          <div class="section-title">食材</div>
          <div class="ing-list">
            <button
              v-for="p in profiles"
              :key="p.key"
              class="ing-item"
              :class="{ on: p.key === activeKey }"
              @click="selectedKey = p.key"
            >
              <div class="ing-head">
                <span class="ing-name">{{ p.name }}</span>
                <span class="ing-price">¥{{ fmtPrice(p.latest) }}<small>/{{ p.unit }}</small></span>
              </div>
              <div class="ing-meta muted small">
                最低 ¥{{ fmtPrice(p.min) }} · 均价 ¥{{ fmtPrice(p.avg) }} · {{ p.count }} 次
              </div>
            </button>
          </div>
        </div>

        <div class="detail-col" v-if="activeProfile">
          <div class="card">
            <div class="section-title">
              <span>{{ activeProfile.name }} · 单价走势（元/{{ activeProfile.unit }}）</span>
              <span class="muted small">{{ fmtDate(activeProfile.latestDate) }} 最新</span>
            </div>
            <SimpleChart
              v-if="trend.data.length"
              type="line"
              :labels="trend.labels"
              :data="trend.data"
              color="#ff9800"
              :height="220"
            />
          </div>

          <div class="grid grid-4 stat-grid">
            <div class="card stat-box">
              <div class="v good">¥{{ fmtPrice(activeProfile.min) }}</div>
              <div class="l">历史最低单价</div>
            </div>
            <div class="card stat-box">
              <div class="v">¥{{ fmtPrice(activeProfile.avg) }}</div>
              <div class="l">加权平均单价</div>
            </div>
            <div class="card stat-box">
              <div class="v">¥{{ fmtPrice(activeProfile.max) }}</div>
              <div class="l">历史最高单价</div>
            </div>
            <div class="card stat-box">
              <div class="v" :class="{ good: savingsVsAvg !== null && savingsVsAvg < 0, bad: savingsVsAvg !== null && savingsVsAvg > 0 }">
                <template v-if="savingsVsAvg === null">—</template>
                <template v-else>{{ savingsVsAvg > 0 ? '+' : '' }}{{ fmtPrice(savingsVsAvg) }}</template>
              </div>
              <div class="l">最新价较均价（元）</div>
            </div>
          </div>

          <div class="card advice-card">
            <div class="advice-title">🧺 入手建议</div>
            <p class="advice-text">{{ advice(activeProfile) }}</p>
            <p class="muted small">
              累计采购 {{ fmtQty(activeProfile.totalQty) }}{{ activeProfile.unit }}，
              共花费 ¥{{ fmtPrice(activeProfile.totalSpend) }}；
              若一直以最低价购入可省
              <b class="good">¥{{ fmtPrice(activeProfile.totalSpend - activeProfile.min * activeProfile.totalQty) }}</b>
            </p>
          </div>

          <div class="card">
            <div class="section-title">采购明细</div>
            <div class="rec-list">
              <div v-for="(r, idx) in [...trend.records].reverse()" :key="r.purchaseId + idx" class="rec-row">
                <span class="muted date">{{ fmtDate(r.date) }}</span>
                <span class="muted small">{{ fmtQty(r.quantity) }}{{ r.unit }}</span>
                <span class="unit-price">
                  ¥{{ fmtPrice(r.unitPrice) }}/{{ r.unit }}
                  <em v-if="r.unitPrice <= activeProfile.min + 1e-9" class="tag-low">最低</em>
                </span>
                <span class="rec-total">¥{{ fmtPrice(r.total) }}</span>
              </div>
            </div>
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
.hint {
  margin-bottom: 16px;
}
.small {
  font-size: 12px;
}
.layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.ingredient-card {
  width: 240px;
  flex-shrink: 0;
}
.detail-col {
  flex: 1;
  min-width: 0;
}
.ing-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 560px;
  overflow-y: auto;
}
.ing-item {
  text-align: left;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.ing-item:hover {
  background: var(--surface-2);
}
.ing-item.on {
  border-color: var(--primary);
  background: var(--primary-light);
}
.ing-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.ing-name {
  font-weight: 600;
  font-size: 14px;
}
.ing-price {
  font-weight: 700;
  color: var(--primary-dark);
}
.ing-price small {
  font-weight: 400;
  color: var(--text-2);
  font-size: 11px;
}
.ing-meta {
  margin-top: 2px;
}
.stat-grid {
  margin-top: 16px;
}
.stat-box {
  text-align: center;
  padding: 12px;
}
.stat-box .v {
  font-size: 20px;
  font-weight: 700;
}
.stat-box .v.good {
  color: var(--primary-dark);
}
.stat-box .v.bad {
  color: var(--danger);
}
.stat-box .l {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 2px;
}
.advice-card {
  margin-top: 16px;
}
.advice-title {
  font-weight: 600;
  margin-bottom: 6px;
}
.advice-text {
  margin: 0 0 6px;
}
.good {
  color: var(--primary-dark);
}
.rec-list {
  display: flex;
  flex-direction: column;
}
.rec-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.rec-row:last-child {
  border-bottom: none;
}
.rec-row .date {
  width: 92px;
}
.unit-price {
  flex: 1;
  font-weight: 600;
}
.rec-total {
  font-weight: 600;
  color: var(--primary-dark);
}
.tag-low {
  font-style: normal;
  font-size: 11px;
  color: #fff;
  background: var(--primary);
  border-radius: 8px;
  padding: 0 6px;
  margin-left: 4px;
}
@media (max-width: 768px) {
  .layout {
    flex-direction: column;
  }
  .ingredient-card {
    width: 100%;
  }
  .ing-list {
    flex-direction: row;
    overflow-x: auto;
    max-height: none;
  }
  .ing-item {
    min-width: 160px;
  }
}
</style>
