// ==========================================
// 生产经营数据系统 - Vue 3 前端应用
// ==========================================

// ===== 部门配置 =====
const DEPT_CONFIG = {
  beer: {
    key: 'beer',
    name: '啤机部',
    workshops: ['兴信A', '兴信B', '华登', '邵阳'],
    uniqueFields: []
  },
  print: {
    key: 'print',
    name: '印喷部',
    workshops: ['兴信A', '华登', '邵阳'],
    uniqueFields: []
  },
  assembly: {
    key: 'assembly',
    name: '装配部',
    workshops: ['兴信A', '兴信B', '华登', '邵阳'],
    uniqueFields: []
  }
};

// ===== 共享字段配置 =====
const SHARED_COLUMNS = [
  { field: 'supervisor_count', label: '管工人数', editable: true, type: 'integer' },
  { field: 'worker_count', label: '员工人数', editable: true, type: 'integer' },
  { field: 'daily_output', label: '总产值/天', editable: true, type: 'number' },
  { field: 'worker_wage', label: '员工工资/天', editable: true, type: 'number' },
  { field: 'supervisor_wage', label: '管工工资/天', editable: true, type: 'number' },
  { field: 'rent', label: '房租', editable: true, type: 'number' },
  { field: 'utility_fee', label: '水电费', editable: true, type: 'number' },
  { field: 'tool_investment', label: '工具投资', editable: true, type: 'number' },
  { field: 'equipment', label: '设备', editable: true, type: 'number' },
  { field: 'renovation', label: '装修', editable: true, type: 'number' },
  { field: 'misc_fee', label: '杂费', editable: true, type: 'number' },
  { field: 'shipping_fee', label: '运费', editable: true, type: 'number' },
  { field: 'social_insurance', label: '社保', editable: true, type: 'number' },
  { field: 'tax', label: '税收', editable: true, type: 'number' },
  { field: 'balance', label: '结余金额', editable: false, type: 'number', calculated: true },
  { field: 'balance_ratio', label: '结余%', editable: false, type: 'ratio', calculated: true }
];

const REMARK_COLUMN = { field: 'remark', label: '备注', editable: true, type: 'text' };

// 区域分组
const REGIONS = {
  '清溪': ['兴信A', '兴信B', '华登'],
  '邵阳': ['邵阳']
};

// ===== 工具函数 =====
function formatAmount(num) {
  if (num === null || num === undefined || num === '') return '';
  const n = Number(num);
  if (isNaN(n)) return '';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRatio(ratio) {
  if (ratio === null || ratio === undefined || ratio === '') return '';
  const n = Number(ratio);
  if (isNaN(n)) return '';
  return (n * 100).toFixed(2) + '%';
}

function formatInteger(num) {
  if (num === null || num === undefined || num === '') return '';
  return String(Math.round(Number(num)));
}

function formatCellValue(value, type) {
  if (type === 'integer') return formatInteger(value);
  if (type === 'ratio') return formatRatio(value);
  if (type === 'number') return formatAmount(value);
  return value || '';
}

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  return [formatDate(start), formatDate(end)];
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getMonthRange(offset = 0) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + offset;
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  return [formatDate(start), formatDate(end)];
}

function getDeptColumns(dept) {
  const config = DEPT_CONFIG[dept];
  const cols = [...SHARED_COLUMNS];
  if (config && config.uniqueFields) {
    const balanceIdx = cols.findIndex(c => c.field === 'balance');
    for (const uf of config.uniqueFields) {
      cols.splice(balanceIdx, 0, uf);
    }
  }
  cols.push(REMARK_COLUMN);
  return cols;
}

function getRoleName(role) {
  const map = { stats: '统计员', entry: '录入员', dept_manager: '部门经理', executive: '高管' };
  return map[role] || role;
}

// ===== 登录页组件 =====
const LoginPage = {
  template: `
    <div class="login-page">
      <div class="login-card">
        <h2>生产经营数据系统</h2>
        <p class="subtitle">Production Operations Data System</p>
        <el-form :model="form" @submit.prevent="handleLogin" label-width="0">
          <el-form-item>
            <el-input v-model="form.username" placeholder="用户名" prefix-icon="User" size="large" />
          </el-form-item>
          <el-form-item>
            <el-input v-model="form.password" type="password" placeholder="密码" prefix-icon="Lock" size="large" show-password @keyup.enter="handleLogin" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" style="width:100%" size="large" :loading="loading" @click="handleLogin">
              登 录
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>
  `,
  data() {
    return {
      form: { username: '', password: '' },
      loading: false
    };
  },
  methods: {
    async handleLogin() {
      if (!this.form.username || !this.form.password) {
        ElementPlus.ElMessage.warning('请输入用户名和密码');
        return;
      }
      this.loading = true;
      try {
        const res = await API.post('/auth/login', this.form);
        API.setToken(res.token);
        localStorage.setItem('user', JSON.stringify(res.user));
        this.$root.user = res.user;
        this.$root.currentRoute = '/beer';
        window.location.hash = '#/beer';
        ElementPlus.ElMessage.success('登录成功');
      } catch (err) {
        ElementPlus.ElMessage.error(err.message || '登录失败');
      } finally {
        this.loading = false;
      }
    }
  }
};

// ===== 部门数据页组件 =====
const DeptRecordsPage = {
  props: ['dept'],
  template: `
    <div class="dept-records-page">
      <!-- 拖拽上传区 -->
      <div class="drag-upload" :class="{ dragging: isDragging }"
           @dragover.prevent="isDragging = true"
           @dragleave.prevent="isDragging = false"
           @drop.prevent="handleDrop"
           @click="triggerFileInput">
        <div class="upload-icon">📁</div>
        <div class="upload-text">拖入 Excel 文件导入数据，或点击上传</div>
        <input type="file" ref="fileInput" style="display:none" accept=".xlsx,.xls" @change="handleFileSelect" />
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <el-date-picker v-model="dateRange" type="daterange" range-separator="至"
          start-placeholder="开始日期" end-placeholder="结束日期" size="default"
          value-format="YYYY-MM-DD" @change="loadData" style="width:280px" />
        <div class="quick-btns">
          <button :class="{ active: quickRange === '7d' }" @click="setQuickRange('7d')">近7天</button>
          <button :class="{ active: quickRange === 'month' }" @click="setQuickRange('month')">本月</button>
          <button :class="{ active: quickRange === 'lastMonth' }" @click="setQuickRange('lastMonth')">上月</button>
        </div>
        <el-select v-model="workshopFilter" placeholder="全部车间" clearable size="default" style="width:140px" @change="loadData">
          <el-option v-for="w in workshops" :key="w" :label="w" :value="w" />
        </el-select>
        <el-input v-model="searchText" placeholder="搜索..." clearable size="default" style="width:160px" @input="loadData" prefix-icon="Search" />
        <div class="toolbar-right">
          <el-button type="primary" size="default" @click="showAddDialog">新增</el-button>
          <el-button type="danger" size="default" :disabled="selectedRows.length === 0" @click="handleBatchDelete">删除</el-button>
          <el-button type="success" size="default" @click="handleExport">导出</el-button>
        </div>
      </div>

      <!-- 数据表格 -->
      <div class="data-table-wrapper">
        <el-table :data="tableData" border stripe height="500" style="width:100%"
                  @selection-change="handleSelectionChange" :row-key="row => row.id"
                  v-loading="loading" ref="dataTable">
          <el-table-column type="selection" width="40" fixed="left" />
          <el-table-column type="index" label="#" width="45" fixed="left" />
          <el-table-column prop="record_date" label="日期" width="110" fixed="left" sortable>
            <template #default="{ row }">{{ row.record_date ? row.record_date.substring(0, 10) : '' }}</template>
          </el-table-column>
          <el-table-column prop="workshop" label="车间" width="80" fixed="left" />
          <el-table-column v-for="col in columns" :key="col.field" :prop="col.field" :label="col.label"
                           :width="getColumnWidth(col)" :min-width="getColumnWidth(col)"
                           :class-name="getColumnClass(col)">
            <template #default="{ row }">
              <div v-if="isEditing(row.id, col.field) && col.editable" style="padding:0">
                <input :value="row[col.field]" @blur="saveCell(row, col.field, $event)"
                       @keyup.enter="$event.target.blur()" autofocus
                       :type="col.type === 'text' ? 'text' : 'number'"
                       :step="col.type === 'integer' ? '1' : '0.01'" />
              </div>
              <div v-else @click="startEdit(row, col)"
                   :class="getCellClasses(row, col)"
                   :style="{ cursor: col.editable ? 'text' : 'default', padding: '0 4px' }">
                <template v-if="col.field === 'balance'">
                  <span :class="{ 'amount-positive': Number(row.balance) >= 0, 'amount-negative': Number(row.balance) < 0 }">
                    {{ formatCellValue(row[col.field], col.type) }}
                  </span>
                </template>
                <template v-else>
                  {{ formatCellValue(row[col.field], col.type) }}
                </template>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <!-- 底部合计区 -->
        <div class="summary-footer" v-if="summaryData">
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <tr class="summary-header-row">
              <td style="width:40px"></td>
              <td style="width:45px"></td>
              <td style="width:110px">合计</td>
              <td style="width:80px">车间</td>
              <td v-for="col in columns" :key="'sh-'+col.field" :style="{ width: getColumnWidth(col) + 'px', textAlign: 'right' }">
                {{ col.label }}
              </td>
            </tr>
            <template v-for="(wsData, wsName) in summaryData.workshops" :key="'ws-'+wsName">
              <tr class="workshop-row">
                <td></td><td></td><td></td>
                <td>{{ wsName }}</td>
                <td v-for="col in columns" :key="'wd-'+wsName+'-'+col.field" style="text-align:right; padding:4px 8px;">
                  {{ formatSummaryCell(wsData, col) }}
                </td>
              </tr>
            </template>
            <tr class="region-row" v-if="summaryData.regions">
              <td></td><td></td><td></td>
              <td>清溪合计</td>
              <td v-for="col in columns" :key="'qx-'+col.field" style="text-align:right; padding:4px 8px;">
                {{ formatSummaryCell(summaryData.regions['清溪'], col) }}
              </td>
            </tr>
            <tr class="workshop-row" v-if="summaryData.regions && summaryData.regions['邵阳']">
              <td></td><td></td><td></td>
              <td>邵阳合计</td>
              <td v-for="col in columns" :key="'sy-'+col.field" style="text-align:right; padding:4px 8px;">
                {{ formatSummaryCell(summaryData.regions['邵阳'], col) }}
              </td>
            </tr>
            <tr class="total-row">
              <td></td><td></td><td></td>
              <td>总合计</td>
              <td v-for="col in columns" :key="'tt-'+col.field" style="text-align:right; padding:6px 8px;">
                {{ formatSummaryCell(summaryData.total, col) }}
              </td>
            </tr>
          </table>
        </div>
      </div>

      <!-- 新增对话框 -->
      <el-dialog v-model="addDialogVisible" title="新增记录" width="600px" destroy-on-close>
        <el-form :model="addForm" label-width="110px" size="default">
          <el-form-item label="日期" required>
            <el-date-picker v-model="addForm.record_date" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" style="width:100%" />
          </el-form-item>
          <el-form-item label="车间" required>
            <el-select v-model="addForm.workshop" placeholder="选择车间" style="width:100%">
              <el-option v-for="w in workshops" :key="w" :label="w" :value="w" />
            </el-select>
          </el-form-item>
          <el-form-item v-for="col in editableColumns" :key="'add-'+col.field" :label="col.label">
            <el-input v-model="addForm[col.field]" :type="col.type === 'text' ? 'text' : 'text'"
                       :placeholder="'输入' + col.label" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="addDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleAdd" :loading="saving">保存</el-button>
        </template>
      </el-dialog>
    </div>
  `,
  data() {
    return {
      tableData: [],
      loading: false,
      saving: false,
      dateRange: getDefaultDateRange(),
      quickRange: '7d',
      workshopFilter: '',
      searchText: '',
      selectedRows: [],
      editingCell: { rowId: null, field: null },
      isDragging: false,
      addDialogVisible: false,
      addForm: {},
      summaryData: null
    };
  },
  computed: {
    workshops() {
      return DEPT_CONFIG[this.dept]?.workshops || [];
    },
    columns() {
      return getDeptColumns(this.dept);
    },
    editableColumns() {
      return this.columns.filter(c => c.editable);
    }
  },
  watch: {
    dept: {
      handler() {
        this.resetState();
        this.loadData();
      },
      immediate: true
    }
  },
  methods: {
    formatCellValue,
    resetState() {
      this.tableData = [];
      this.selectedRows = [];
      this.editingCell = { rowId: null, field: null };
      this.dateRange = getDefaultDateRange();
      this.quickRange = '7d';
      this.workshopFilter = '';
      this.searchText = '';
      this.summaryData = null;
    },
    async loadData() {
      this.loading = true;
      try {
        const params = {};
        if (this.dateRange && this.dateRange[0]) {
          params.start_date = this.dateRange[0];
          params.end_date = this.dateRange[1];
        }
        if (this.workshopFilter) params.workshop = this.workshopFilter;
        if (this.searchText) params.search = this.searchText;

        const [recordsRes, summaryRes] = await Promise.all([
          API.get(`/${this.dept}/records`, params),
          API.get(`/${this.dept}/summary`, params)
        ]);

        this.tableData = recordsRes.data || recordsRes || [];
        this.summaryData = summaryRes.data || summaryRes || null;
      } catch (err) {
        ElementPlus.ElMessage.error('加载数据失败: ' + (err.message || '未知错误'));
      } finally {
        this.loading = false;
      }
    },
    setQuickRange(type) {
      this.quickRange = type;
      if (type === '7d') {
        this.dateRange = getDefaultDateRange();
      } else if (type === 'month') {
        this.dateRange = getMonthRange(0);
      } else if (type === 'lastMonth') {
        this.dateRange = getMonthRange(-1);
      }
      this.loadData();
    },
    handleSelectionChange(rows) {
      this.selectedRows = rows;
    },
    isEditing(rowId, field) {
      return this.editingCell.rowId === rowId && this.editingCell.field === field;
    },
    startEdit(row, col) {
      if (!col.editable) return;
      this.editingCell = { rowId: row.id, field: col.field };
    },
    async saveCell(row, field, event) {
      const value = event.target.value;
      this.editingCell = { rowId: null, field: null };
      if (String(row[field]) === String(value)) return;

      const oldValue = row[field];
      row[field] = value;
      try {
        await API.put(`/${this.dept}/records/${row.id}`, { [field]: value });
        await this.loadData();
      } catch (err) {
        row[field] = oldValue;
        ElementPlus.ElMessage.error('保存失败: ' + (err.message || '未知错误'));
      }
    },
    getColumnWidth(col) {
      if (col.field === 'remark') return 120;
      if (col.type === 'ratio') return 80;
      if (col.type === 'integer') return 85;
      return 110;
    },
    getColumnClass(col) {
      if (col.calculated) return 'cell-calculated';
      if (col.editable) return 'cell-editable';
      return '';
    },
    getCellClasses(row, col) {
      const classes = [];
      if (col.field === 'balance') {
        classes.push('cell-balance');
        if (Number(row.balance) >= 0) classes.push('positive');
        else classes.push('negative');
      }
      return classes;
    },
    formatSummaryCell(data, col) {
      if (!data) return '';
      const val = data[col.field];
      if (col.type === 'ratio') return formatRatio(val);
      if (col.type === 'integer') return formatInteger(val);
      if (col.type === 'number') return formatAmount(val);
      return val || '';
    },
    showAddDialog() {
      this.addForm = { record_date: formatDate(new Date()), workshop: '' };
      this.editableColumns.forEach(c => {
        if (!(c.field in this.addForm)) this.addForm[c.field] = '';
      });
      this.addDialogVisible = true;
    },
    async handleAdd() {
      if (!this.addForm.record_date || !this.addForm.workshop) {
        ElementPlus.ElMessage.warning('请填写日期和车间');
        return;
      }
      this.saving = true;
      try {
        await API.post(`/${this.dept}/records`, this.addForm);
        this.addDialogVisible = false;
        ElementPlus.ElMessage.success('新增成功');
        await this.loadData();
      } catch (err) {
        ElementPlus.ElMessage.error('新增失败: ' + (err.message || '未知错误'));
      } finally {
        this.saving = false;
      }
    },
    async handleBatchDelete() {
      if (this.selectedRows.length === 0) return;
      try {
        await ElementPlus.ElMessageBox.confirm(
          `确定要删除选中的 ${this.selectedRows.length} 条记录吗？`, '确认删除',
          { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' }
        );
        const ids = this.selectedRows.map(r => r.id);
        await API.del(`/${this.dept}/records/batch`, { ids });
        ElementPlus.ElMessage.success('删除成功');
        this.selectedRows = [];
        await this.loadData();
      } catch (err) {
        if (err !== 'cancel' && err !== 'close') {
          ElementPlus.ElMessage.error('删除失败: ' + (err.message || '未知错误'));
        }
      }
    },
    async handleExport() {
      try {
        const params = {};
        if (this.dateRange && this.dateRange[0]) {
          params.start_date = this.dateRange[0];
          params.end_date = this.dateRange[1];
        }
        if (this.workshopFilter) params.workshop = this.workshopFilter;
        const deptName = DEPT_CONFIG[this.dept]?.name || this.dept;
        const filename = `${deptName}_${this.dateRange?.[0] || ''}_${this.dateRange?.[1] || ''}.xlsx`;
        await API.download(`/${this.dept}/export`, params, filename);
        ElementPlus.ElMessage.success('导出成功');
      } catch (err) {
        ElementPlus.ElMessage.error('导出失败: ' + (err.message || '未知错误'));
      }
    },
    handleDrop(e) {
      this.isDragging = false;
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        this.uploadFile(files[0]);
      }
    },
    triggerFileInput() {
      this.$refs.fileInput?.click();
    },
    handleFileSelect(e) {
      const file = e.target.files?.[0];
      if (file) {
        this.uploadFile(file);
        e.target.value = '';
      }
    },
    async uploadFile(file) {
      if (!file.name.match(/\.xlsx?$/i)) {
        ElementPlus.ElMessage.warning('请选择 Excel 文件（.xlsx 或 .xls）');
        return;
      }
      this.loading = true;
      try {
        const res = await API.upload(`/${this.dept}/import`, file);
        const msg = res.message || `导入成功，共 ${res.count || 0} 条`;
        ElementPlus.ElMessage.success(msg);
        await this.loadData();
      } catch (err) {
        ElementPlus.ElMessage.error('导入失败: ' + (err.message || '未知错误'));
      } finally {
        this.loading = false;
      }
    }
  }
};

// ===== 三工汇总页组件 =====
const SummaryPage = {
  template: `
    <div class="summary-page">
      <div class="toolbar">
        <el-date-picker v-model="dateRange" type="daterange" range-separator="至"
          start-placeholder="开始日期" end-placeholder="结束日期" size="default"
          value-format="YYYY-MM-DD" @change="loadData" style="width:280px" />
        <div class="quick-btns">
          <button :class="{ active: quickRange === '7d' }" @click="setQuickRange('7d')">近7天</button>
          <button :class="{ active: quickRange === 'month' }" @click="setQuickRange('month')">本月</button>
          <button :class="{ active: quickRange === 'lastMonth' }" @click="setQuickRange('lastMonth')">上月</button>
        </div>
        <div class="toolbar-right">
          <el-button type="success" size="default" @click="handleExport">导出</el-button>
        </div>
      </div>

      <div class="data-table-wrapper">
        <el-table :data="tableData" border stripe style="width:100%" v-loading="loading">
          <el-table-column prop="dept_name" label="部门" width="120" fixed="left" />
          <el-table-column prop="daily_output" label="总产值" width="140" align="right">
            <template #default="{ row }">{{ formatAmount(row.daily_output) }}</template>
          </el-table-column>
          <el-table-column prop="total_wage" label="工资总额" width="140" align="right">
            <template #default="{ row }">{{ formatAmount(row.total_wage) }}</template>
          </el-table-column>
          <el-table-column prop="total_expense" label="费用总额" width="140" align="right">
            <template #default="{ row }">{{ formatAmount(row.total_expense) }}</template>
          </el-table-column>
          <el-table-column prop="balance" label="结余金额" width="140" align="right">
            <template #default="{ row }">
              <span :class="{ 'amount-positive': Number(row.balance) >= 0, 'amount-negative': Number(row.balance) < 0 }">
                {{ formatAmount(row.balance) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="balance_ratio" label="结余%" width="100" align="right">
            <template #default="{ row }">{{ formatRatio(row.balance_ratio) }}</template>
          </el-table-column>
          <el-table-column prop="supervisor_count" label="管工人数" width="100" align="right" />
          <el-table-column prop="worker_count" label="员工人数" width="100" align="right" />
          <el-table-column prop="rent" label="房租" width="120" align="right">
            <template #default="{ row }">{{ formatAmount(row.rent) }}</template>
          </el-table-column>
          <el-table-column prop="utility_fee" label="水电费" width="120" align="right">
            <template #default="{ row }">{{ formatAmount(row.utility_fee) }}</template>
          </el-table-column>
          <el-table-column prop="social_insurance" label="社保" width="120" align="right">
            <template #default="{ row }">{{ formatAmount(row.social_insurance) }}</template>
          </el-table-column>
          <el-table-column prop="tax" label="税收" width="120" align="right">
            <template #default="{ row }">{{ formatAmount(row.tax) }}</template>
          </el-table-column>
        </el-table>

        <!-- 总合计行 -->
        <div v-if="totalRow" style="background:var(--primary); color:#fff; font-weight:700; font-size:14px; display:flex; padding:8px 0;">
          <div style="width:120px; padding:0 12px;">总合计</div>
          <div style="width:140px; text-align:right; padding:0 12px;">{{ formatAmount(totalRow.daily_output) }}</div>
          <div style="width:140px; text-align:right; padding:0 12px;">{{ formatAmount(totalRow.total_wage) }}</div>
          <div style="width:140px; text-align:right; padding:0 12px;">{{ formatAmount(totalRow.total_expense) }}</div>
          <div style="width:140px; text-align:right; padding:0 12px;">{{ formatAmount(totalRow.balance) }}</div>
          <div style="width:100px; text-align:right; padding:0 12px;">{{ formatRatio(totalRow.balance_ratio) }}</div>
          <div style="width:100px; text-align:right; padding:0 12px;">{{ totalRow.supervisor_count }}</div>
          <div style="width:100px; text-align:right; padding:0 12px;">{{ totalRow.worker_count }}</div>
          <div style="width:120px; text-align:right; padding:0 12px;">{{ formatAmount(totalRow.rent) }}</div>
          <div style="width:120px; text-align:right; padding:0 12px;">{{ formatAmount(totalRow.utility_fee) }}</div>
          <div style="width:120px; text-align:right; padding:0 12px;">{{ formatAmount(totalRow.social_insurance) }}</div>
          <div style="width:120px; text-align:right; padding:0 12px;">{{ formatAmount(totalRow.tax) }}</div>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      tableData: [],
      totalRow: null,
      loading: false,
      dateRange: getDefaultDateRange(),
      quickRange: '7d'
    };
  },
  created() {
    this.loadData();
  },
  methods: {
    formatAmount,
    formatRatio,
    async loadData() {
      this.loading = true;
      try {
        const params = {};
        if (this.dateRange && this.dateRange[0]) {
          params.start_date = this.dateRange[0];
          params.end_date = this.dateRange[1];
        }
        const res = await API.get('/summary/overview', params);
        const data = res.data || res;
        if (Array.isArray(data)) {
          this.tableData = data.filter(d => d.dept_name !== '总合计');
          this.totalRow = data.find(d => d.dept_name === '总合计') || this.computeTotal(this.tableData);
        } else if (data.departments) {
          this.tableData = data.departments;
          this.totalRow = data.total || this.computeTotal(this.tableData);
        } else {
          this.tableData = [];
          this.totalRow = null;
        }
      } catch (err) {
        ElementPlus.ElMessage.error('加载汇总数据失败: ' + (err.message || '未知错误'));
      } finally {
        this.loading = false;
      }
    },
    computeTotal(rows) {
      if (!rows || rows.length === 0) return null;
      const sumFields = ['daily_output', 'total_wage', 'total_expense', 'balance', 'supervisor_count', 'worker_count', 'rent', 'utility_fee', 'social_insurance', 'tax'];
      const total = { dept_name: '总合计' };
      sumFields.forEach(f => {
        total[f] = rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);
      });
      total.balance_ratio = total.daily_output ? total.balance / total.daily_output : 0;
      return total;
    },
    setQuickRange(type) {
      this.quickRange = type;
      if (type === '7d') this.dateRange = getDefaultDateRange();
      else if (type === 'month') this.dateRange = getMonthRange(0);
      else if (type === 'lastMonth') this.dateRange = getMonthRange(-1);
      this.loadData();
    },
    async handleExport() {
      try {
        const params = {};
        if (this.dateRange && this.dateRange[0]) {
          params.start_date = this.dateRange[0];
          params.end_date = this.dateRange[1];
        }
        // Build client-side export using XLSX
        const exportData = this.tableData.map(r => ({
          '部门': r.dept_name,
          '总产值': r.daily_output,
          '工资总额': r.total_wage,
          '费用总额': r.total_expense,
          '结余金额': r.balance,
          '结余%': r.balance_ratio ? (r.balance_ratio * 100).toFixed(2) + '%' : '',
          '管工人数': r.supervisor_count,
          '员工人数': r.worker_count,
          '房租': r.rent,
          '水电费': r.utility_fee,
          '社保': r.social_insurance,
          '税收': r.tax
        }));
        if (this.totalRow) {
          exportData.push({
            '部门': '总合计',
            '总产值': this.totalRow.daily_output,
            '工资总额': this.totalRow.total_wage,
            '费用总额': this.totalRow.total_expense,
            '结余金额': this.totalRow.balance,
            '结余%': this.totalRow.balance_ratio ? (this.totalRow.balance_ratio * 100).toFixed(2) + '%' : '',
            '管工人数': this.totalRow.supervisor_count,
            '员工人数': this.totalRow.worker_count,
            '房租': this.totalRow.rent,
            '水电费': this.totalRow.utility_fee,
            '社保': this.totalRow.social_insurance,
            '税收': this.totalRow.tax
          });
        }
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '三工汇总');
        XLSX.writeFile(wb, `三工汇总_${this.dateRange?.[0] || ''}_${this.dateRange?.[1] || ''}.xlsx`);
        ElementPlus.ElMessage.success('导出成功');
      } catch (err) {
        ElementPlus.ElMessage.error('导出失败: ' + (err.message || '未知错误'));
      }
    }
  }
};

// ===== 用户管理页组件 =====
const UserManagementPage = {
  template: `
    <div class="user-management-page">
      <div class="card">
        <div class="card-header">
          <h3>用户管理</h3>
          <el-button type="primary" size="default" @click="showAddUserDialog">新增用户</el-button>
        </div>
        <el-table :data="users" border stripe style="width:100%" v-loading="loading" class="user-table">
          <el-table-column prop="username" label="用户名" width="120" />
          <el-table-column prop="name" label="姓名" width="120" />
          <el-table-column prop="role" label="角色" width="100">
            <template #default="{ row }">
              <span :class="'role-' + row.role">{{ getRoleName(row.role) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="department" label="部门" width="100" />
          <el-table-column prop="status" label="状态" width="80">
            <template #default="{ row }">
              <span :class="row.status === 'active' ? 'status-active' : 'status-disabled'">
                {{ row.status === 'active' ? '启用' : '禁用' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="batch_permission" label="批量权限" width="90">
            <template #default="{ row }">
              {{ row.batch_permission ? '是' : '否' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="320" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="showEditUserDialog(row)">编辑</el-button>
              <el-button size="small" type="warning" @click="showResetPasswordDialog(row)">重置密码</el-button>
              <el-button size="small" :type="row.status === 'active' ? 'danger' : 'success'"
                         @click="toggleUserStatus(row)">
                {{ row.status === 'active' ? '禁用' : '启用' }}
              </el-button>
              <el-button size="small" type="primary" @click="showModuleDialog(row)">模块授权</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 新增用户对话框 -->
      <el-dialog v-model="addUserVisible" title="新增用户" width="480px" destroy-on-close>
        <el-form :model="userForm" label-width="90px" size="default">
          <el-form-item label="用户名" required>
            <el-input v-model="userForm.username" placeholder="请输入用户名" />
          </el-form-item>
          <el-form-item label="姓名" required>
            <el-input v-model="userForm.name" placeholder="请输入姓名" />
          </el-form-item>
          <el-form-item label="密码" required>
            <el-input v-model="userForm.password" type="password" placeholder="请输入密码" show-password />
          </el-form-item>
          <el-form-item label="角色" required>
            <el-select v-model="userForm.role" style="width:100%">
              <el-option label="统计员" value="stats" />
              <el-option label="录入员" value="entry" />
              <el-option label="部门经理" value="dept_manager" />
              <el-option label="高管" value="executive" />
            </el-select>
          </el-form-item>
          <el-form-item label="部门">
            <el-select v-model="userForm.department" clearable style="width:100%">
              <el-option label="啤机部" value="beer" />
              <el-option label="印喷部" value="print" />
              <el-option label="装配部" value="assembly" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="addUserVisible = false">取消</el-button>
          <el-button type="primary" @click="handleAddUser" :loading="saving">保存</el-button>
        </template>
      </el-dialog>

      <!-- 编辑用户对话框 -->
      <el-dialog v-model="editUserVisible" title="编辑用户" width="480px" destroy-on-close>
        <el-form :model="editForm" label-width="90px" size="default">
          <el-form-item label="用户名">
            <el-input v-model="editForm.username" disabled />
          </el-form-item>
          <el-form-item label="姓名" required>
            <el-input v-model="editForm.name" placeholder="请输入姓名" />
          </el-form-item>
          <el-form-item label="角色" required>
            <el-select v-model="editForm.role" style="width:100%">
              <el-option label="统计员" value="stats" />
              <el-option label="录入员" value="entry" />
              <el-option label="部门经理" value="dept_manager" />
              <el-option label="高管" value="executive" />
            </el-select>
          </el-form-item>
          <el-form-item label="部门">
            <el-select v-model="editForm.department" clearable style="width:100%">
              <el-option label="啤机部" value="beer" />
              <el-option label="印喷部" value="print" />
              <el-option label="装配部" value="assembly" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="editUserVisible = false">取消</el-button>
          <el-button type="primary" @click="handleEditUser" :loading="saving">保存</el-button>
        </template>
      </el-dialog>

      <!-- 重置密码对话框 -->
      <el-dialog v-model="resetPwdVisible" title="重置密码" width="400px" destroy-on-close>
        <el-form :model="resetPwdForm" label-width="80px" size="default">
          <el-form-item label="用户">
            <el-input :model-value="resetPwdForm.username" disabled />
          </el-form-item>
          <el-form-item label="新密码" required>
            <el-input v-model="resetPwdForm.password" type="password" placeholder="请输入新密码" show-password />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="resetPwdVisible = false">取消</el-button>
          <el-button type="primary" @click="handleResetPassword" :loading="saving">确认重置</el-button>
        </template>
      </el-dialog>

      <!-- 模块授权对话框 -->
      <el-dialog v-model="moduleDialogVisible" title="模块授权" width="400px" destroy-on-close>
        <p style="margin-bottom:16px; color:var(--text-secondary);">为 <strong>{{ moduleForm.name }}</strong> 分配可访问的模块：</p>
        <el-checkbox-group v-model="moduleForm.modules">
          <div style="display:flex; flex-direction:column; gap:10px;">
            <el-checkbox label="beer">啤机部</el-checkbox>
            <el-checkbox label="print">印喷部</el-checkbox>
            <el-checkbox label="assembly">装配部</el-checkbox>
            <el-checkbox label="summary">三工汇总</el-checkbox>
          </div>
        </el-checkbox-group>
        <template #footer>
          <el-button @click="moduleDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSaveModules" :loading="saving">保存</el-button>
        </template>
      </el-dialog>
    </div>
  `,
  data() {
    return {
      users: [],
      loading: false,
      saving: false,
      addUserVisible: false,
      editUserVisible: false,
      resetPwdVisible: false,
      moduleDialogVisible: false,
      userForm: { username: '', name: '', password: '', role: 'entry', department: '' },
      editForm: { id: null, username: '', name: '', role: '', department: '' },
      resetPwdForm: { id: null, username: '', password: '' },
      moduleForm: { id: null, name: '', modules: [] }
    };
  },
  created() {
    this.loadUsers();
  },
  methods: {
    getRoleName,
    async loadUsers() {
      this.loading = true;
      try {
        const res = await API.get('/users');
        this.users = res.data || res || [];
      } catch (err) {
        ElementPlus.ElMessage.error('加载用户列表失败');
      } finally {
        this.loading = false;
      }
    },
    showAddUserDialog() {
      this.userForm = { username: '', name: '', password: '', role: 'entry', department: '' };
      this.addUserVisible = true;
    },
    async handleAddUser() {
      if (!this.userForm.username || !this.userForm.name || !this.userForm.password) {
        ElementPlus.ElMessage.warning('请填写必填项');
        return;
      }
      this.saving = true;
      try {
        await API.post('/users', this.userForm);
        this.addUserVisible = false;
        ElementPlus.ElMessage.success('新增成功');
        await this.loadUsers();
      } catch (err) {
        ElementPlus.ElMessage.error('新增失败: ' + (err.message || '未知错误'));
      } finally {
        this.saving = false;
      }
    },
    showEditUserDialog(row) {
      this.editForm = { id: row.id, username: row.username, name: row.name, role: row.role, department: row.department || '' };
      this.editUserVisible = true;
    },
    async handleEditUser() {
      if (!this.editForm.name) {
        ElementPlus.ElMessage.warning('请填写姓名');
        return;
      }
      this.saving = true;
      try {
        await API.put(`/users/${this.editForm.id}`, {
          name: this.editForm.name,
          role: this.editForm.role,
          department: this.editForm.department
        });
        this.editUserVisible = false;
        ElementPlus.ElMessage.success('编辑成功');
        await this.loadUsers();
      } catch (err) {
        ElementPlus.ElMessage.error('编辑失败: ' + (err.message || '未知错误'));
      } finally {
        this.saving = false;
      }
    },
    showResetPasswordDialog(row) {
      this.resetPwdForm = { id: row.id, username: row.username, password: '' };
      this.resetPwdVisible = true;
    },
    async handleResetPassword() {
      if (!this.resetPwdForm.password) {
        ElementPlus.ElMessage.warning('请输入新密码');
        return;
      }
      this.saving = true;
      try {
        await API.put(`/users/${this.resetPwdForm.id}/password`, { password: this.resetPwdForm.password });
        this.resetPwdVisible = false;
        ElementPlus.ElMessage.success('密码重置成功');
      } catch (err) {
        ElementPlus.ElMessage.error('重置密码失败: ' + (err.message || '未知错误'));
      } finally {
        this.saving = false;
      }
    },
    async toggleUserStatus(row) {
      const newStatus = row.status === 'active' ? 'disabled' : 'active';
      try {
        await API.put(`/users/${row.id}/status`, { status: newStatus });
        ElementPlus.ElMessage.success(newStatus === 'active' ? '已启用' : '已禁用');
        await this.loadUsers();
      } catch (err) {
        ElementPlus.ElMessage.error('操作失败: ' + (err.message || '未知错误'));
      }
    },
    showModuleDialog(row) {
      this.moduleForm = { id: row.id, name: row.name, modules: row.modules ? [...row.modules] : [] };
      this.moduleDialogVisible = true;
    },
    async handleSaveModules() {
      this.saving = true;
      try {
        await API.put(`/users/${this.moduleForm.id}/modules`, { modules: this.moduleForm.modules });
        this.moduleDialogVisible = false;
        ElementPlus.ElMessage.success('模块授权保存成功');
        await this.loadUsers();
      } catch (err) {
        ElementPlus.ElMessage.error('保存失败: ' + (err.message || '未知错误'));
      } finally {
        this.saving = false;
      }
    }
  }
};

// ===== 设置页组件 =====
const SettingsPage = {
  template: `
    <div class="settings-page">
      <el-tabs v-model="activeTab" type="border-card">
        <el-tab-pane label="车间管理" name="workshops">
          <workshop-settings />
        </el-tab-pane>
        <el-tab-pane label="数据锁定" name="locks">
          <data-locks />
        </el-tab-pane>
        <el-tab-pane label="操作日志" name="logs">
          <audit-logs />
        </el-tab-pane>
        <el-tab-pane label="数据备份" name="backup">
          <backup-page />
        </el-tab-pane>
      </el-tabs>
    </div>
  `,
  data() {
    return { activeTab: 'workshops' };
  }
};

// ===== 车间管理子组件 =====
const WorkshopSettings = {
  template: `
    <div>
      <div class="card-header" style="border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
        <h3 style="font-size:16px;">车间列表</h3>
        <el-button type="primary" size="default" @click="showAddDialog">新增车间</el-button>
      </div>
      <el-table :data="workshops" border stripe style="width:100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="车间名称" width="160" />
        <el-table-column prop="region" label="区域" width="100" />
        <el-table-column prop="dept" label="所属部门" width="120">
          <template #default="{ row }">
            {{ row.dept ? (DEPT_CONFIG[row.dept]?.name || row.dept) : '全部' }}
          </template>
        </el-table-column>
        <el-table-column prop="sort_order" label="排序" width="80" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" @click="showEditDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑车间' : '新增车间'" width="420px" destroy-on-close>
        <el-form :model="form" label-width="90px" size="default">
          <el-form-item label="车间名称" required>
            <el-input v-model="form.name" placeholder="车间名称" />
          </el-form-item>
          <el-form-item label="区域">
            <el-select v-model="form.region" style="width:100%" clearable>
              <el-option label="清溪" value="清溪" />
              <el-option label="邵阳" value="邵阳" />
            </el-select>
          </el-form-item>
          <el-form-item label="所属部门">
            <el-select v-model="form.dept" style="width:100%" clearable placeholder="全部">
              <el-option label="啤机部" value="beer" />
              <el-option label="印喷部" value="print" />
              <el-option label="装配部" value="assembly" />
            </el-select>
          </el-form-item>
          <el-form-item label="排序">
            <el-input v-model.number="form.sort_order" type="number" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
        </template>
      </el-dialog>
    </div>
  `,
  data() {
    return {
      workshops: [],
      loading: false,
      saving: false,
      dialogVisible: false,
      isEdit: false,
      form: { name: '', region: '', dept: '', sort_order: 0 },
      DEPT_CONFIG
    };
  },
  created() {
    this.loadWorkshops();
  },
  methods: {
    async loadWorkshops() {
      this.loading = true;
      try {
        const res = await API.get('/workshops');
        this.workshops = res.data || res || [];
      } catch (err) {
        ElementPlus.ElMessage.error('加载车间列表失败');
      } finally {
        this.loading = false;
      }
    },
    showAddDialog() {
      this.isEdit = false;
      this.form = { name: '', region: '', dept: '', sort_order: 0 };
      this.dialogVisible = true;
    },
    showEditDialog(row) {
      this.isEdit = true;
      this.form = { id: row.id, name: row.name, region: row.region || '', dept: row.dept || '', sort_order: row.sort_order || 0 };
      this.dialogVisible = true;
    },
    async handleSave() {
      if (!this.form.name) {
        ElementPlus.ElMessage.warning('请填写车间名称');
        return;
      }
      this.saving = true;
      try {
        if (this.isEdit) {
          await API.put(`/workshops/${this.form.id}`, this.form);
        } else {
          await API.post('/workshops', this.form);
        }
        this.dialogVisible = false;
        ElementPlus.ElMessage.success('保存成功');
        await this.loadWorkshops();
      } catch (err) {
        ElementPlus.ElMessage.error('保存失败: ' + (err.message || '未知错误'));
      } finally {
        this.saving = false;
      }
    },
    async handleDelete(row) {
      try {
        await ElementPlus.ElMessageBox.confirm(`确定要删除车间 "${row.name}" 吗？`, '确认删除', {
          type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消'
        });
        await API.del(`/workshops/${row.id}`);
        ElementPlus.ElMessage.success('删除成功');
        await this.loadWorkshops();
      } catch (err) {
        if (err !== 'cancel' && err !== 'close') {
          ElementPlus.ElMessage.error('删除失败: ' + (err.message || '未知错误'));
        }
      }
    }
  }
};

// ===== 数据锁定子组件 =====
const DataLocks = {
  template: `
    <div>
      <div class="card-header" style="border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
        <h3 style="font-size:16px;">数据锁定管理</h3>
        <el-button type="primary" size="default" @click="showLockDialog">锁定月份</el-button>
      </div>
      <el-table :data="locks" border stripe style="width:100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="lock_month" label="锁定月份" width="140" />
        <el-table-column prop="dept" label="部门" width="120">
          <template #default="{ row }">
            {{ row.dept ? (DEPT_CONFIG[row.dept]?.name || row.dept) : '全部' }}
          </template>
        </el-table-column>
        <el-table-column prop="locked_by" label="锁定人" width="120" />
        <el-table-column prop="locked_at" label="锁定时间" width="180">
          <template #default="{ row }">{{ row.locked_at ? row.locked_at.substring(0, 19).replace('T', ' ') : '' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="handleUnlock(row)">解锁</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-dialog v-model="lockDialogVisible" title="锁定月份" width="400px" destroy-on-close>
        <el-form :model="lockForm" label-width="80px" size="default">
          <el-form-item label="月份" required>
            <el-date-picker v-model="lockForm.lock_month" type="month" placeholder="选择月份" value-format="YYYY-MM" style="width:100%" />
          </el-form-item>
          <el-form-item label="部门">
            <el-select v-model="lockForm.dept" clearable placeholder="全部部门" style="width:100%">
              <el-option label="啤机部" value="beer" />
              <el-option label="印喷部" value="print" />
              <el-option label="装配部" value="assembly" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="lockDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleLock" :loading="saving">锁定</el-button>
        </template>
      </el-dialog>
    </div>
  `,
  data() {
    return {
      locks: [],
      loading: false,
      saving: false,
      lockDialogVisible: false,
      lockForm: { lock_month: '', dept: '' },
      DEPT_CONFIG
    };
  },
  created() {
    this.loadLocks();
  },
  methods: {
    async loadLocks() {
      this.loading = true;
      try {
        const res = await API.get('/settings/data-locks');
        this.locks = res.data || res || [];
      } catch (err) {
        ElementPlus.ElMessage.error('加载锁定列表失败');
      } finally {
        this.loading = false;
      }
    },
    showLockDialog() {
      this.lockForm = { lock_month: '', dept: '' };
      this.lockDialogVisible = true;
    },
    async handleLock() {
      if (!this.lockForm.lock_month) {
        ElementPlus.ElMessage.warning('请选择月份');
        return;
      }
      this.saving = true;
      try {
        await API.post('/settings/data-locks', this.lockForm);
        this.lockDialogVisible = false;
        ElementPlus.ElMessage.success('锁定成功');
        await this.loadLocks();
      } catch (err) {
        ElementPlus.ElMessage.error('锁定失败: ' + (err.message || '未知错误'));
      } finally {
        this.saving = false;
      }
    },
    async handleUnlock(row) {
      try {
        await ElementPlus.ElMessageBox.confirm(`确定要解锁 ${row.lock_month} 的数据吗？`, '确认解锁', {
          type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消'
        });
        await API.del(`/settings/data-locks/${row.id}`);
        ElementPlus.ElMessage.success('解锁成功');
        await this.loadLocks();
      } catch (err) {
        if (err !== 'cancel' && err !== 'close') {
          ElementPlus.ElMessage.error('解锁失败: ' + (err.message || '未知错误'));
        }
      }
    }
  }
};

// ===== 操作日志子组件 =====
const AuditLogs = {
  template: `
    <div>
      <div style="display:flex; gap:12px; align-items:center; margin-bottom:16px; flex-wrap:wrap;">
        <el-date-picker v-model="dateRange" type="daterange" range-separator="至"
          start-placeholder="开始日期" end-placeholder="结束日期" size="default"
          value-format="YYYY-MM-DD" @change="loadLogs" style="width:280px" />
        <el-input v-model="userFilter" placeholder="按用户筛选" clearable size="default" style="width:160px" @input="loadLogs" />
        <el-select v-model="actionFilter" placeholder="操作类型" clearable size="default" style="width:140px" @change="loadLogs">
          <el-option label="全部" value="" />
          <el-option label="登录" value="login" />
          <el-option label="新增" value="create" />
          <el-option label="修改" value="update" />
          <el-option label="删除" value="delete" />
          <el-option label="导入" value="import" />
          <el-option label="导出" value="export" />
          <el-option label="锁定" value="lock" />
          <el-option label="备份" value="backup" />
          <el-option label="恢复" value="restore" />
        </el-select>
      </div>
      <el-table :data="logs" border stripe style="width:100%" v-loading="loading" height="500">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="created_at" label="时间" width="180">
          <template #default="{ row }">{{ row.created_at ? row.created_at.substring(0, 19).replace('T', ' ') : '' }}</template>
        </el-table-column>
        <el-table-column prop="username" label="用户" width="120" />
        <el-table-column prop="action" label="操作" width="100" />
        <el-table-column prop="module" label="模块" width="100" />
        <el-table-column prop="detail" label="详情" min-width="300">
          <template #default="{ row }">
            <span style="font-size:12px; color:var(--text-secondary);">{{ typeof row.detail === 'object' ? JSON.stringify(row.detail) : row.detail }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="140" />
      </el-table>
    </div>
  `,
  data() {
    return {
      logs: [],
      loading: false,
      dateRange: getDefaultDateRange(),
      userFilter: '',
      actionFilter: ''
    };
  },
  created() {
    this.loadLogs();
  },
  methods: {
    async loadLogs() {
      this.loading = true;
      try {
        const params = {};
        if (this.dateRange && this.dateRange[0]) {
          params.start_date = this.dateRange[0];
          params.end_date = this.dateRange[1];
        }
        if (this.userFilter) params.username = this.userFilter;
        if (this.actionFilter) params.action = this.actionFilter;
        const res = await API.get('/audit-logs', params);
        this.logs = res.data || res || [];
      } catch (err) {
        ElementPlus.ElMessage.error('加载日志失败');
      } finally {
        this.loading = false;
      }
    }
  }
};

// ===== 数据备份子组件 =====
const BackupPage = {
  template: `
    <div>
      <div class="card-header" style="border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
        <h3 style="font-size:16px;">数据备份</h3>
        <el-button type="primary" size="default" @click="handleBackup" :loading="backing">创建备份</el-button>
      </div>
      <el-table :data="backups" border stripe style="width:100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="filename" label="文件名" min-width="250" />
        <el-table-column prop="size" label="大小" width="120">
          <template #default="{ row }">{{ formatSize(row.size) }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">{{ row.created_at ? row.created_at.substring(0, 19).replace('T', ' ') : '' }}</template>
        </el-table-column>
        <el-table-column prop="created_by" label="创建人" width="120" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" type="warning" @click="handleRestore(row)">恢复</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  `,
  data() {
    return {
      backups: [],
      loading: false,
      backing: false
    };
  },
  created() {
    this.loadBackups();
  },
  methods: {
    formatSize(bytes) {
      if (!bytes) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      let idx = 0;
      let size = Number(bytes);
      while (size >= 1024 && idx < units.length - 1) { size /= 1024; idx++; }
      return size.toFixed(1) + ' ' + units[idx];
    },
    async loadBackups() {
      this.loading = true;
      try {
        const res = await API.get('/backup/list');
        this.backups = res.data || res || [];
      } catch (err) {
        ElementPlus.ElMessage.error('加载备份列表失败');
      } finally {
        this.loading = false;
      }
    },
    async handleBackup() {
      try {
        await ElementPlus.ElMessageBox.confirm('确定要创建数据备份吗？', '确认备份', {
          type: 'info', confirmButtonText: '确定', cancelButtonText: '取消'
        });
        this.backing = true;
        await API.post('/backup');
        ElementPlus.ElMessage.success('备份创建成功');
        await this.loadBackups();
      } catch (err) {
        if (err !== 'cancel' && err !== 'close') {
          ElementPlus.ElMessage.error('备份失败: ' + (err.message || '未知错误'));
        }
      } finally {
        this.backing = false;
      }
    },
    async handleRestore(row) {
      try {
        await ElementPlus.ElMessageBox.confirm(
          `确定要恢复到备份 "${row.filename}" 吗？当前数据将被覆盖！`,
          '确认恢复',
          { type: 'error', confirmButtonText: '确定恢复', cancelButtonText: '取消' }
        );
        this.loading = true;
        await API.post('/backup/restore', { id: row.id, filename: row.filename });
        ElementPlus.ElMessage.success('数据恢复成功');
        await this.loadBackups();
      } catch (err) {
        if (err !== 'cancel' && err !== 'close') {
          ElementPlus.ElMessage.error('恢复失败: ' + (err.message || '未知错误'));
        }
      } finally {
        this.loading = false;
      }
    }
  }
};

// ===== 面包屑映射 =====
const BREADCRUMB_MAP = {
  '/beer': '三工结余 / 啤机部',
  '/print': '三工结余 / 印喷部',
  '/assembly': '三工结余 / 装配部',
  '/summary': '三工结余 / 三工汇总',
  '/users': '用户管理',
  '/settings': '系统设置'
};

// ===== 主应用 =====
const app = Vue.createApp({
  template: `
    <template v-if="currentRoute === '/login' || !user">
      <login-page />
    </template>
    <template v-else>
      <div class="app-container">
        <!-- 侧边栏 -->
        <div class="sidebar" :class="{ collapsed: sidebarCollapsed }">
          <div class="sidebar-header">
            <button class="sidebar-toggle" @click="sidebarCollapsed = !sidebarCollapsed">
              {{ sidebarCollapsed ? '☰' : '✕' }}
            </button>
            <h1 v-show="!sidebarCollapsed">生产经营数据系统</h1>
          </div>
          <div class="sidebar-menu">
            <!-- 三工结余 组 -->
            <div class="menu-group-title" v-show="!sidebarCollapsed">三工结余</div>
            <a class="menu-item" :class="{ active: currentRoute === '/beer' }" @click="navigate('/beer')">
              <span class="icon">📊</span>
              <span v-show="!sidebarCollapsed">啤机部</span>
            </a>
            <a class="menu-item" :class="{ active: currentRoute === '/print' }" @click="navigate('/print')">
              <span class="icon">🖨️</span>
              <span v-show="!sidebarCollapsed">印喷部</span>
            </a>
            <a class="menu-item" :class="{ active: currentRoute === '/assembly' }" @click="navigate('/assembly')">
              <span class="icon">🔧</span>
              <span v-show="!sidebarCollapsed">装配部</span>
            </a>
            <a class="menu-item" :class="{ active: currentRoute === '/summary' }" @click="navigate('/summary')">
              <span class="icon">📋</span>
              <span v-show="!sidebarCollapsed">三工汇总</span>
            </a>

            <!-- 用户管理 (stats only) -->
            <template v-if="user && user.role === 'stats'">
              <div class="menu-group-title" v-show="!sidebarCollapsed">管理</div>
              <a class="menu-item" :class="{ active: currentRoute === '/users' }" @click="navigate('/users')">
                <span class="icon">👥</span>
                <span v-show="!sidebarCollapsed">用户管理</span>
              </a>
              <a class="menu-item" :class="{ active: currentRoute === '/settings' }" @click="navigate('/settings')">
                <span class="icon">⚙️</span>
                <span v-show="!sidebarCollapsed">系统设置</span>
              </a>
            </template>

            <!-- 未来模块 -->
            <div class="menu-group-title" v-show="!sidebarCollapsed">更多模块</div>
            <a class="menu-item disabled" v-show="!sidebarCollapsed">
              <span class="icon">📈</span>
              <span>预计产值</span>
            </a>
            <a class="menu-item disabled" v-show="!sidebarCollapsed">
              <span class="icon">📉</span>
              <span>实际产值</span>
            </a>
          </div>
        </div>

        <!-- 主内容 -->
        <div class="main-content" :class="{ expanded: sidebarCollapsed }">
          <div class="top-nav">
            <div class="breadcrumb">{{ breadcrumb }}</div>
            <div class="user-info">
              <span>{{ user?.name || user?.username }}</span>
              <el-tag size="small" type="info" effect="dark" style="border:none;">{{ getRoleName(user?.role) }}</el-tag>
              <button class="logout-btn" @click="handleLogout">退出</button>
            </div>
          </div>
          <div class="page-content">
            <dept-records-page v-if="isDeptPage" :dept="currentDept" :key="currentDept" />
            <summary-page v-else-if="currentRoute === '/summary'" />
            <user-management-page v-else-if="currentRoute === '/users' && user?.role === 'stats'" />
            <settings-page v-else-if="currentRoute === '/settings' && user?.role === 'stats'" />
            <div v-else style="text-align:center; padding:60px; color:var(--text-secondary);">
              <h2>页面未找到</h2>
              <p>请从左侧菜单选择一个页面</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  `,
  data() {
    return {
      currentRoute: '/login',
      user: null,
      sidebarCollapsed: false
    };
  },
  computed: {
    isDeptPage() {
      return ['/beer', '/print', '/assembly'].includes(this.currentRoute);
    },
    currentDept() {
      if (this.currentRoute === '/beer') return 'beer';
      if (this.currentRoute === '/print') return 'print';
      if (this.currentRoute === '/assembly') return 'assembly';
      return '';
    },
    breadcrumb() {
      return BREADCRUMB_MAP[this.currentRoute] || '';
    }
  },
  created() {
    // Restore user from localStorage
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (savedUser && token) {
      try {
        this.user = JSON.parse(savedUser);
        API.setToken(token);
      } catch (e) {
        this.user = null;
      }
    }

    // Init route from hash
    this.handleRouteChange();

    // Listen for hash changes
    window.addEventListener('hashchange', () => {
      this.handleRouteChange();
    });

    // Verify token on load
    if (this.user) {
      this.verifyAuth();
    }
  },
  methods: {
    getRoleName,
    handleRouteChange() {
      const hash = window.location.hash.replace('#', '') || '/login';
      if (!this.user && hash !== '/login') {
        window.location.hash = '#/login';
        this.currentRoute = '/login';
        return;
      }
      this.currentRoute = hash;
    },
    navigate(path) {
      window.location.hash = '#' + path;
    },
    async verifyAuth() {
      try {
        const res = await API.get('/auth/me');
        const userData = res.data || res.user || res;
        if (userData && userData.username) {
          this.user = userData;
          localStorage.setItem('user', JSON.stringify(userData));
        }
        // If currently on login, redirect to default
        if (this.currentRoute === '/login') {
          this.navigate('/beer');
        }
      } catch (err) {
        // Token invalid
        this.user = null;
        API.setToken(null);
        localStorage.removeItem('user');
        this.navigate('/login');
      }
    },
    handleLogout() {
      this.user = null;
      API.setToken(null);
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      this.navigate('/login');
      ElementPlus.ElMessage.success('已退出登录');
    }
  }
});

// Register components
app.component('login-page', LoginPage);
app.component('dept-records-page', DeptRecordsPage);
app.component('summary-page', SummaryPage);
app.component('user-management-page', UserManagementPage);
app.component('settings-page', SettingsPage);
app.component('workshop-settings', WorkshopSettings);
app.component('data-locks', DataLocks);
app.component('audit-logs', AuditLogs);
app.component('backup-page', BackupPage);

// Use Element Plus and mount
app.use(ElementPlus);
app.mount('#app');
