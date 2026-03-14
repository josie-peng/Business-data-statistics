// tests/modules.test.js
// 兼容性测试：验证 modules/ 推导出的接口与旧 utils/dept-config.js 一致

const oldConfig = require('../utils/dept-config');
const newConfig = require('../modules');

describe('modules/ 兼容层', () => {

  describe('SHARED 常量', () => {
    test('SHARED_INPUT_FIELDS 与旧配置一致', () => {
      expect(newConfig.SHARED_INPUT_FIELDS).toEqual(oldConfig.SHARED_INPUT_FIELDS);
    });

    test('SHARED_EXPENSE_FIELDS 与旧配置一致', () => {
      expect(newConfig.SHARED_EXPENSE_FIELDS).toEqual(oldConfig.SHARED_EXPENSE_FIELDS);
    });

    test('SHARED_CALC_FIELDS 与旧配置一致', () => {
      expect(newConfig.SHARED_CALC_FIELDS).toEqual(oldConfig.SHARED_CALC_FIELDS);
    });
  });

  describe('DEPT_CONFIG 结构', () => {
    const depts = ['beer', 'print', 'assembly'];

    test.each(depts)('%s: tableName 和 label 一致', (dept) => {
      expect(newConfig.DEPT_CONFIG[dept].tableName).toBe(oldConfig.DEPT_CONFIG[dept].tableName);
      expect(newConfig.DEPT_CONFIG[dept].label).toBe(oldConfig.DEPT_CONFIG[dept].label);
    });

    test.each(depts)('%s: workshops 一致', (dept) => {
      expect(newConfig.DEPT_CONFIG[dept].workshops).toEqual(oldConfig.DEPT_CONFIG[dept].workshops);
    });

    test.each(depts)('%s: uniqueInputFields 一致', (dept) => {
      expect(newConfig.DEPT_CONFIG[dept].uniqueInputFields).toEqual(oldConfig.DEPT_CONFIG[dept].uniqueInputFields);
    });

    test.each(depts)('%s: uniqueCalcFields 一致', (dept) => {
      expect(newConfig.DEPT_CONFIG[dept].uniqueCalcFields).toEqual(oldConfig.DEPT_CONFIG[dept].uniqueCalcFields);
    });

    test.each(depts)('%s: uniqueExpenseFields 一致', (dept) => {
      expect(newConfig.DEPT_CONFIG[dept].uniqueExpenseFields).toEqual(oldConfig.DEPT_CONFIG[dept].uniqueExpenseFields);
    });
  });

  describe('函数接口', () => {
    const depts = ['beer', 'print', 'assembly'];

    test.each(depts)('getAllInputFields(%s) 一致', (dept) => {
      expect(newConfig.getAllInputFields(dept)).toEqual(oldConfig.getAllInputFields(dept));
    });

    test.each(depts)('getAllFields(%s) 一致', (dept) => {
      expect(newConfig.getAllFields(dept)).toEqual(oldConfig.getAllFields(dept));
    });

    test.each(depts)('getExpenseFields(%s) 一致', (dept) => {
      expect(newConfig.getExpenseFields(dept)).toEqual(oldConfig.getExpenseFields(dept));
    });
  });

  describe('validateConfig', () => {
    test('校验通过不抛错', () => {
      expect(() => newConfig.validateConfig()).not.toThrow();
    });
  });

  describe('getColumnMap', () => {
    test('生成的 COLUMN_MAP 是旧 COLUMN_MAP 的超集', () => {
      const newMap = newConfig.getColumnMap('balance');

      const criticalMappings = {
        '日期': 'record_date',
        '车间': 'workshop_name',
        '车间名称': 'workshop_name',
        '备注': 'remark',
        '备 注': 'remark',
        '管工人数': 'supervisor_count',
        '员工人数': 'worker_count',
        '员工人数(不包杂工)': 'worker_count',
        '总产值/天': 'daily_output',
        '产值': 'daily_output',
        '员工工资/天': 'worker_wage',
        '员工工资': 'worker_wage',
        '管工工资/天': 'supervisor_wage',
        '生产管工工资': 'supervisor_wage',
        '社保': 'social_insurance',
        '湖南社保': 'social_insurance',
        '税收': 'tax',
        '湖南税收': 'tax',
        '结余金额': '_skip_calc',
        '结余%': '_skip_calc',
        '总台数': 'total_machines',
        '不含税产值（含税产值/1.13）': 'output_tax_incl',
        '批水口加工费（全包）': 'gate_processing_fee',
        '装配帮啤机批水口加工配件费用': 'assembly_gate_parts_fee',
        '可回收外厂批水口加工费': 'recoverable_gate_fee',
        '开机率': '_skip_calc',
        '平均每台结余': '_skip_calc',
        '移印机总台数': 'pad_total_machines',
        '工具': 'tool_investment',
        '运费_1': 'shipping_fee',
        '物料（原子灰、胶头、油墨、喷码溶剂）': 'materials',
        '员工人均产值': '_skip_calc',
        '人均产值': 'avg_output_per_worker',
        '夹具部工具投资': 'tool_investment',
        '车间工具投资': 'workshop_tool_investment',
        '结余减胶纸': '_skip_calc',
      };

      for (const [cn, en] of Object.entries(criticalMappings)) {
        expect(newMap[cn]).toBe(en);
      }
    });
  });
});
