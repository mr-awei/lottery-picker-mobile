<template>
  <div>
    <div class="card-title">设置</div>

    <div class="set-card">
      <div class="set-group-title">基本设置</div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">外观主题</div>
          <div class="set-desc">浅色 / 深色界面切换，选择后即时生效并自动记忆</div>
        </div>
        <el-switch
          :model-value="theme === 'dark'"
          active-text="深色"
          inactive-text="浅色"
          @change="onThemeChange"
        />
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">自动刷新数据</div>
          <div class="set-desc">临近开奖时间（前 30 分钟）每分钟刷新，其余时间每 30 分钟刷新一次</div>
        </div>
        <el-switch
          :model-value="autoRefresh"
          @change="onAutoRefreshChange"
        />
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">当前彩种</div>
          <div class="set-desc">顶栏切换双色球 / 大乐透，各自数据独立缓存</div>
        </div>
        <div class="dim">{{ cfg.name }} · 开奖 {{ drawDaysText }}</div>
      </div>
    </div>

    <div class="set-card">
      <div class="set-group-title">AI 选号</div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">AI 一直选上限次数</div>
          <div class="set-desc">AI 一直选最大尝试次数（1000 ~ 100 万）。达到该次数仍未达预期分时，取最高分组合</div>
        </div>
        <el-input-number v-model="maxAttempts" :min="1000" :max="1000000" :step="1000" size="small" style="width: 160px" @change="onMaxAttemptsChange" />
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">暴力模式</div>
          <div class="set-desc">开启后 AI 一直选即使达到预期分也不停止，一直跑到设定次数，并统计多次出现的号码</div>
        </div>
        <el-switch v-model="violentMode" @change="onViolentModeChange" />
      </div>
      <div v-if="violentMode" class="set-row">
        <div class="set-info">
          <div class="set-label">暴力模式次数</div>
          <div class="set-desc">建议 10 万 / 100 万，次数越多耗时越长，期间可随时切走或关闭</div>
        </div>
        <el-input-number v-model="violentAttempts" :min="10000" :max="1000000" :step="10000" size="small" style="width: 160px" @change="onViolentAttemptsChange" />
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">多线程加速</div>
          <div class="set-desc">将 AI 一直选 / 暴力模式的大量小运算拆分到后台多线程（Web Worker）并行计算，主线程（界面、动画）完全不阻塞，按设备核数自适应 2–4 核并行。默认关闭，AI 一直选 / 暴力模式推荐开启。</div>
        </div>
        <el-switch v-model="gpuAccel" @change="onGpuAccelChange" />
      </div>
      <div v-if="gpuAccel" class="set-row">
        <div class="set-info">
          <div class="set-label">当前加速后端</div>
          <div class="set-desc">{{ accelBackendNote }}</div>
        </div>
        <span class="accel-badge" :class="accelBadgeClass">{{ accelBackendLabel }}</span>
      </div>
    </div>

    <div class="set-card">
      <div class="set-group-title">更新公告</div>
      <div v-if="changelogLoading" class="changelog-list dim">更新公告加载中…</div>
      <div v-else-if="changelogError" class="changelog-list changelog-err">{{ changelogError }}</div>
      <div v-else class="changelog-list">
        <div v-for="ver in changelog" :key="ver.version" class="changelog-item">
          <div class="changelog-head">
            <span class="changelog-version">v{{ ver.version }}</span>
            <span class="changelog-date dim">{{ ver.date }} · {{ ver.title }}</span>
          </div>
          <ul class="changelog-items">
            <li v-for="(item, i) in ver.items" :key="i">{{ item }}</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="set-card">
      <div class="set-group-title">崩溃日志</div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">查看 / 导出崩溃日志</div>
          <div class="set-desc">本地捕获的前端错误（window.onerror / 未处理 Promise 拒绝），最多保留 50 条，仅存本机、不上传</div>
        </div>
        <div class="crash-actions">
          <el-button size="small" round @click="openCrashDialog">查看</el-button>
          <el-button size="small" round @click="onExportCrashLogs">导出</el-button>
          <el-button size="small" round type="danger" plain @click="onClearCrashLogs">清空</el-button>
        </div>
      </div>
    </div>

    <div class="set-card">
      <div class="set-group-title">关于软件</div>
      <div class="about-box">
        <div class="about-name">彩票选号器</div>
        <div class="about-sub">LOTTERY PICKER v{{ APP_VERSION }}</div>
        <el-divider style="margin: 14px 0" />
        <div class="about-line">本软件完全<b style="color: var(--success)">免费</b>，仅供个人娱乐与学习参考使用。</div>
        <div class="about-line">严禁任何个人或组织对本软件进行<b>倒卖、转售、收费代安装</b>等盈利行为；严禁将软件内置的选号引擎、统计方法用于商业用途。</div>
        <div class="about-line">软件不含任何内购、广告与付费功能，若您通过付费渠道获得本软件，请立即联系平台举报。</div>
        <el-divider style="margin: 14px 0" />
        <div class="about-line dim">理性购彩提示：彩票开奖为独立随机事件，本软件提供的所有统计、评分、推荐均不提高中奖概率，仅供组合参考。未成年人不得购彩，请量力而行。</div>
        <div class="about-line dim">数据来源：中国福利彩票发行管理中心（双色球）与中国体育彩票官方公开接口。数据可能存在延迟或异常，请以官方公告为准。</div>
        <el-divider style="margin: 14px 0" />
        <div class="about-actions">
          <el-button size="small" round @click="licenseVisible = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;margin-right:4px;vertical-align:-2px">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            开源协议
          </el-button>
          <el-button size="small" round @click="copyEmail">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;margin-right:4px;vertical-align:-2px">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            联系邮箱：{{ CONTACT_EMAIL }}
          </el-button>
        </div>
      </div>
    </div>

    <!-- 开源协议弹窗 -->
    <el-dialog
      v-model="licenseVisible"
      title="彩票选号器手机版 双授权协议 v1.0"
      width="92%"
      class="license-dialog"
      align-center
    >
      <div class="license-body">
        <pre class="license-text">{{ LICENSE_FULL_TEXT }}</pre>
      </div>
      <template #footer>
        <div class="license-footer">
          <span class="license-contact">商业授权联系：{{ CONTACT_EMAIL }}</span>
          <el-button size="small" @click="copyEmail">复制邮箱</el-button>
          <el-button size="small" type="primary" @click="licenseVisible = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 崩溃日志查看弹窗 -->
    <el-dialog
      v-model="crashDialogVisible"
      title="崩溃日志（最近 50 条）"
      width="92%"
      class="crash-dialog"
      align-center
    >
      <div class="crash-body">
        <div v-if="crashLogs.length === 0" class="crash-empty dim">暂无崩溃记录</div>
        <div v-else class="crash-list">
          <div v-for="(log, i) in crashLogs" :key="i" class="crash-item">
            <div class="crash-head">
              <span class="crash-type">{{ log.type }}</span>
              <span class="crash-time dim">{{ log.timestamp }}</span>
            </div>
            <div v-if="log.message" class="crash-line">{{ log.message }}</div>
            <div v-if="log.source" class="crash-line dim">来源：{{ log.source }}:{{ log.lineno }}:{{ log.colno }}</div>
            <div v-if="log.reason" class="crash-line">拒绝原因：{{ log.reason }}</div>
            <pre v-if="log.stack" class="crash-stack">{{ log.stack }}</pre>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button size="small" @click="onExportCrashLogs">导出</el-button>
        <el-button size="small" type="danger" plain @click="onClearCrashLogs">清空</el-button>
        <el-button size="small" type="primary" @click="crashDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { GAME_CONFIG } from '../utils/game-config'
import { theme, applyTheme } from '../utils/ui-state'
import { APP_VERSION } from '../utils/version'
import { isAccelEnabled, setAccelEnabled, getBackendLabel } from '../utils/gpu-accel'
import { getCrashLogs, clearCrashLogs, exportCrashLogs } from '../utils/crash-report'

const props = defineProps({
  game: { type: String, required: true }
})

// 开源协议
const CONTACT_EMAIL = 'new_mr_awei@163.com'
const licenseVisible = ref(false)

const LICENSE_FULL_TEXT = `彩票选号器手机版 双授权协议 v1.0
Lottery Picker Mobile Dual License v1.0
版权所有 © 2026 彩票选号器手机版（new_mr_awei@163.com）
Copyright © 2026 Lottery Picker Mobile (new_mr_awei@163.com)
================================================================================
中文版本
================================================================================
本软件采用双授权模式，根据使用场景适用不同授权条款：
一、非商业免费使用授权
在遵守以下条款的前提下，个人用户、非盈利组织、教育机构可免费使用、复制、修改、分发本软件：
1. 保留原版权声明和本协议文本；
2. 不得将本软件用于任何商业收费产品或付费服务；
3. 基于本软件修改的衍生作品，同样适用本协议条款。
二、恶意程序禁止条款（免费授权版和商业授权版均必须遵守）
1. 严禁在本软件、本软件的克隆体或变体中，直接或间接植入、集成、嵌入任何恶意代码、间谍软件、病毒、木马、勒索软件、挖矿程序、广告插件或其他任何形式的有害程序，防止本软件被篡改或注入恶意代码；
2. 严禁将本软件、本软件的克隆体或变体，直接或间接植入、集成、嵌入到任何恶意软件、间谍软件、病毒、木马、勒索软件、挖矿程序、广告插件或其他任何形式的有害程序中；
3. 严禁将本软件、本软件的克隆体或变体，用于任何恶意程序，或与任何带有恶意程序的软件、服务、系统结合使用；
4. 本条款同时适用于免费授权版和商业授权版，无论是否获得商业授权，均不得违反本条款；
5. 违反本条款的，作者将保留追究法律责任、提起诉讼的权利，并有权要求侵权方承担全部经济损失和法律后果。
三、商业使用授权
任何将本软件用于商业用途的行为，包括但不限于：
1. 将本软件集成到收费产品或付费服务中；
2. 使用本软件提供商业咨询、开发、运维等收费服务；
3. 将本软件用于企业内部商业项目并获得商业利益；
均必须事先联系作者（new_mr_awei@163.com）购买商业授权，签订书面授权协议后方可使用。
四、权利保留
1. 作者保留本软件的全部著作权及其他知识产权；
2. 发现任何违反本协议的商业使用或恶意使用，作者保留追究法律责任、提起诉讼的权利；
3. 作者有权随时更新本协议条款，更新后的协议自发布之日起生效。
五、免责声明
本软件按"原样"提供，不提供任何明示或暗示的保证，包括但不限于对适销性、特定用途适用性和非侵权性的保证。在任何情况下，作者均不对因使用本软件产生的任何直接或间接损失承担责任。
商业授权联系：new_mr_awei@163.com
================================================================================
English Version
================================================================================
This software is licensed under a dual licensing model. Different license terms apply depending on the use case:
1. Non-Commercial Free Use License
Individual users, non-profit organizations, and educational institutions may freely use, copy, modify, and distribute this software, provided that the following terms are met:
1. Retain the original copyright notice and this license text;
2. Do not use this software in any commercial paid products or paid services;
3. Derivative works based on this software are also subject to the terms of this license.
2. Malware Prohibition Clause (Both Free and Commercial Licenses Must Comply)
1. It is strictly prohibited to directly or indirectly implant, integrate, or embed any malicious code, spyware, virus, trojan, ransomware, mining programs, adware, or any other form of harmful programs into this software, its clones, or variants, to prevent this software from being tampered with or injected with malicious code;
2. It is strictly prohibited to directly or indirectly implant, integrate, or embed this software, its clones, or variants into any malware, spyware, virus, trojan, ransomware, mining programs, adware, or any other form of harmful programs;
3. It is strictly prohibited to use this software, its clones, or variants in any malicious programs, or in combination with any software, services, or systems that contain malicious programs;
4. This clause applies to both the free license and the commercial license. Regardless of whether commercial authorization has been obtained, this clause must not be violated;
5. In case of violation of this clause, the author reserves the right to pursue legal liability, file lawsuits, and demand that the infringing party bear all economic losses and legal consequences.
3. Commercial Use License
Any commercial use of this software, including but not limited to:
1. Integrating this software into paid products or paid services;
2. Using this software to provide paid services such as commercial consulting, development, or operations;
3. Using this software in internal commercial projects and obtaining commercial benefits;
Must contact the author (new_mr_awei@163.com) in advance to purchase a commercial license and sign a written authorization agreement before use.
4. Rights Reserved
1. The author reserves all copyrights and other intellectual property rights of this software;
2. Upon discovering any commercial use or malicious use that violates this agreement, the author reserves the right to pursue legal liability and file lawsuits;
3. The author reserves the right to update the terms of this agreement at any time, and the updated agreement shall take effect from the date of publication.
5. Disclaimer
This software is provided "AS IS" without any express or implied warranties, including but not limited to warranties of merchantability, fitness for a particular purpose, and non-infringement. In no event shall the author be liable for any direct or indirect damages arising from the use of this software.
Commercial License Contact: new_mr_awei@163.com`

function copyEmail() {
  const text = CONTACT_EMAIL
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      ElMessage.success('邮箱已复制：' + text)
    }).catch(() => {
      fallbackCopy(text)
    })
  } else {
    fallbackCopy(text)
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    document.execCommand('copy')
    ElMessage.success('邮箱已复制：' + text)
  } catch (e) {
    ElMessage.warning('复制失败，请手动复制：' + text)
  }
  document.body.removeChild(ta)
}

const AUTO_REFRESH_KEY = 'lp-auto-refresh'
const autoRefresh = ref(localStorage.getItem(AUTO_REFRESH_KEY) !== 'off')

// AI 选号设置：上限次数 / 暴力模式开关与次数（AiPicker 读取同一 localStorage key）
const MAX_ATTEMPTS_KEY = 'lp-ai-max-attempts'
const VIOLENT_KEY = 'lp-ai-violent'
const VIOLENT_ATTEMPTS_KEY = 'lp-ai-violent-attempts'
const maxAttempts = ref(Number(localStorage.getItem(MAX_ATTEMPTS_KEY)) || 20000)
const violentMode = ref(localStorage.getItem(VIOLENT_KEY) === 'on')
const violentAttempts = ref(Number(localStorage.getItem(VIOLENT_ATTEMPTS_KEY)) || 100000)

// 多线程加速开关（持久化在 gpu-accel.js 内部，含旧 key 兼容）
const gpuAccel = ref(isAccelEnabled())
const accelBackendLabel = ref('—')
const accelBadgeClass = ref('badge-off')
const accelBackendNote = ref('')

// 崩溃日志查看/清空/导出（纯本地，不联网）
const crashLogs = ref([])
const crashDialogVisible = ref(false)

function refreshCrashLogs() {
  crashLogs.value = getCrashLogs()
}

function openCrashDialog() {
  refreshCrashLogs()
  crashDialogVisible.value = true
}

async function onClearCrashLogs() {
  try {
    await ElMessageBox.confirm('确定清空全部崩溃日志？此操作不可恢复。', '清空崩溃日志', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning'
    })
    clearCrashLogs()
    refreshCrashLogs()
    ElMessage.success('崩溃日志已清空')
  } catch (e) {
    /* 用户取消 */
  }
}

function onExportCrashLogs() {
  const n = exportCrashLogs()
  ElMessage.success('已导出 ' + n + ' 条崩溃日志')
}

async function refreshAccelBackend() {
  if (!gpuAccel.value) {
    accelBackendLabel.value = '已关闭'
    accelBadgeClass.value = 'badge-off'
    accelBackendNote.value = '开启后，AI 选号与暴力模式的大量小运算将拆分到后台多线程并行计算，界面不再卡顿'
    return
  }
  const label = await getBackendLabel()
  accelBackendLabel.value = label
  const isGpu = label.indexOf('GPU 计算') === 0
  const isMt = label.indexOf('多线程加速') === 0
  accelBadgeClass.value = isGpu ? 'badge-gpu' : (isMt ? 'badge-worker' : 'badge-off')
  accelBackendNote.value = isGpu
    ? '当前设备支持 WebGPU：选号生成与评分在 GPU 上并行执行'
    : (isMt
      ? '当前设备通过后台多线程并行计算（Capacitor 以本地文件加载时 WebGPU 不可用，多线程是真加速主路径）'
      : '本设备暂不支持硬件/多线程加速，开启亦无效')
}

// 更新公告：CHANGELOG 已外置为 public/changelog.json（~38KB），进入设置页时 fetch 懒加载，不进主 bundle
const changelog = ref([])
const changelogLoading = ref(true)
const changelogError = ref('')

async function loadChangelog() {
  changelogLoading.value = true
  changelogError.value = ''
  try {
    const res = await fetch('./changelog.json')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    changelog.value = await res.json()
  } catch (e) {
    console.warn('changelog.json 加载失败', e)
    changelogError.value = '更新公告加载失败，请检查网络后重试'
  } finally {
    changelogLoading.value = false
  }
}

onMounted(() => {
  refreshAccelBackend()
  loadChangelog()
})

function onGpuAccelChange(val) {
  setAccelEnabled(val)
  window.dispatchEvent(new CustomEvent('lp-accel-change', { detail: { on: val } }))
  refreshAccelBackend()
}

const cfg = computed(() => GAME_CONFIG[props.game])
const drawDaysText = computed(() => cfg.value.drawDaysText || (props.game === 'ssq' ? '每周二、四、日 21:15' : '每周一、三、六 21:25'))

function onThemeChange(val) {
  applyTheme(val ? 'dark' : 'light')
}

function onAutoRefreshChange(val) {
  autoRefresh.value = val
  localStorage.setItem(AUTO_REFRESH_KEY, val ? 'on' : 'off')
  window.dispatchEvent(new CustomEvent('lp-auto-refresh-change', { detail: { on: val } }))
}

function onMaxAttemptsChange(val) {
  localStorage.setItem(MAX_ATTEMPTS_KEY, String(val || 20000))
  window.dispatchEvent(new CustomEvent('lp-ai-settings-change'))
}

function onViolentModeChange(val) {
  localStorage.setItem(VIOLENT_KEY, val ? 'on' : 'off')
  window.dispatchEvent(new CustomEvent('lp-ai-settings-change'))
}

function onViolentAttemptsChange(val) {
  localStorage.setItem(VIOLENT_ATTEMPTS_KEY, String(val || 100000))
  window.dispatchEvent(new CustomEvent('lp-ai-settings-change'))
}
</script>

<style scoped>
.set-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--card-bg);
  padding: 16px 18px;
  margin-bottom: 16px;
}

.set-group-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 10px;
}

.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-top: 1px solid var(--border-light);
}

.set-row:first-of-type {
  border-top: none;
}

.set-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.set-desc {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 3px;
  max-width: 520px;
}

/* 加速后端徽标（与 AiPicker 一致） */
.accel-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
  white-space: nowrap;
}
.accel-badge::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 6px currentColor;
}
.badge-gpu { color: #7b3ff2; background: rgba(123, 63, 242, 0.12); }
.badge-worker { color: #0a8f6b; background: rgba(10, 143, 107, 0.12); }
.badge-off { color: var(--text-muted); background: rgba(120, 130, 150, 0.12); }

.about-box {
  font-size: 13px;
  line-height: 2;
  color: var(--text-main);
}

.about-name {
  font-size: 20px;
  font-weight: 800;
}

.about-sub {
  font-size: 12px;
  color: var(--text-dim);
  letter-spacing: 1px;
}

.changelog-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.changelog-err {
  color: #ff8a80;
  font-size: 12px;
}

.changelog-item {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--card-inset);
  padding: 12px 14px;
}

.changelog-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.changelog-version {
  font-size: 14px;
  font-weight: 800;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid rgba(246, 196, 83, 0.35);
  border-radius: 999px;
  padding: 2px 12px;
}

.changelog-date {
  font-size: 12px;
}

.changelog-items {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--text-main);
}
@media (max-width: 768px) {
  .set-card { padding: 12px 14px; }
  .set-row { gap: 10px; }
}

.about-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}

/* 开源协议弹窗 */
.license-dialog {
  border-radius: var(--r-lg, 12px);
  overflow: hidden;
  border: 1px solid var(--border, rgba(120,130,150,0.2));
}
.license-dialog .el-dialog__header {
  border-bottom: 1px solid var(--border-light, rgba(120,130,150,0.15));
  padding-bottom: 12px;
}
.license-dialog .el-dialog__title {
  font-size: 15px;
  font-weight: 700;
}
.license-body {
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px 2px;
}
.license-text {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.8;
  color: var(--text-main, #333);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
.license-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.license-contact {
  font-size: 12px;
  color: var(--text-dim, #888);
  margin-right: auto;
}

/* 崩溃日志 */
.crash-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.crash-dialog {
  border-radius: var(--r-lg, 12px);
  overflow: hidden;
  border: 1px solid var(--border, rgba(120, 130, 150, 0.2));
}

.crash-body {
  max-height: 60vh;
  overflow-y: auto;
}

.crash-empty {
  font-size: 13px;
  text-align: center;
  padding: 24px 0;
}

.crash-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.crash-item {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--card-inset);
  padding: 10px 12px;
}

.crash-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.crash-type {
  font-size: 12px;
  font-weight: 700;
  color: #ff8a80;
  background: rgba(255, 138, 128, 0.12);
  border-radius: 999px;
  padding: 1px 8px;
}

.crash-time {
  font-size: 11px;
}

.crash-line {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-main);
  word-break: break-word;
}

.crash-stack {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-dim, #888);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 6px 0 0;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 6px;
}
</style>
