const { DEPT_CONFIG, SHARED_EXPENSE_FIELDS } = require('./dept-config');

// 计算结余及所有计算字段
function calculateRecord(dept, record) {
  const config = DEPT_CONFIG[dept];
  const r = { ...record };

  // 共有费用 + 独有费用 = 总扣减
  const allExpenses = [...SHARED_EXPENSE_FIELDS, ...config.uniqueExpenseFields];
  const totalExpense = allExpenses.reduce((sum, f) => sum + (parseFloat(r[f]) || 0), 0);

  // 结余金额
  r.balance = parseFloat(r.daily_output || 0) - totalExpense;

  // 结余%
  r.balance_ratio = r.daily_output > 0 ? r.balance / r.daily_output : 0;

  // 部门独有计算字段
  if (dept === 'beer') {
    r.machine_rate = r.total_machines > 0 ? r.running_machines / r.total_machines : 0;
    r.avg_output_per_machine = r.running_machines > 0 ? r.daily_output / r.running_machines : 0;
    const totalWage = (parseFloat(r.worker_wage) || 0) + (parseFloat(r.supervisor_wage) || 0) + (parseFloat(r.misc_worker_wage) || 0);
    r.wage_ratio = r.daily_output > 0 ? totalWage / r.daily_output : 0;
    r.mold_cost_ratio = r.daily_output > 0 ? (parseFloat(r.mold_repair) || 0) / r.daily_output : 0;
    r.gate_cost_ratio = r.daily_output > 0 ? (parseFloat(r.gate_processing_fee) || 0) / r.daily_output : 0;
    r.avg_balance_per_machine = r.running_machines > 0 ? r.balance / r.running_machines : 0;
  }

  if (dept === 'print') {
    r.pad_machine_rate = r.pad_total_machines > 0 ? r.pad_running_machines / r.pad_total_machines : 0;
    r.spray_machine_rate = r.spray_total_machines > 0 ? r.spray_running_machines / r.spray_total_machines : 0;
    r.avg_output_per_worker = r.worker_count > 0 ? r.daily_output / r.worker_count : 0;
    const totalWage = (parseFloat(r.worker_wage) || 0) + (parseFloat(r.supervisor_wage) || 0);
    r.wage_ratio = r.daily_output > 0 ? totalWage / r.daily_output : 0;
    r.office_wage_ratio = r.daily_output > 0 ? (parseFloat(r.office_wage) || 0) / r.daily_output : 0;
    r.mold_fee_ratio = r.daily_output > 0 ? (parseFloat(r.auto_mold_fee) || 0) / r.daily_output : 0;
    r.total_ratio = r.balance_ratio;
  }

  if (dept === 'assembly') {
    r.avg_output_per_worker = r.worker_count > 0 ? r.daily_output / r.worker_count : 0;
    r.balance_minus_tape = r.balance - (parseFloat(r.tape) || 0);
    r.balance_tape_ratio = r.planned_wage_tax > 0 ? r.balance_minus_tape / r.planned_wage_tax : 0;
    r.tool_invest_ratio = r.planned_wage_tax > 0 ? (parseFloat(r.tool_investment) || 0) / r.planned_wage_tax : 0;
    r.borrowed_wage_ratio = r.planned_wage_tax > 0 ? (parseFloat(r.borrowed_worker_wage) || 0) / r.planned_wage_tax : 0;
  }

  return r;
}

module.exports = { calculateRecord };
