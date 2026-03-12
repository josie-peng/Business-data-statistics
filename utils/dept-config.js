// 共有字段（输入型）
const SHARED_INPUT_FIELDS = [
  'supervisor_count', 'worker_count', 'daily_output',
  'worker_wage', 'supervisor_wage', 'rent', 'utility_fee',
  'tool_investment', 'equipment', 'renovation', 'misc_fee',
  'shipping_fee', 'social_insurance', 'tax'
];

// 共有字段（计算型）
const SHARED_CALC_FIELDS = ['balance', 'balance_ratio'];

// 共有费用字段（参与结余计算的扣减项）
const SHARED_EXPENSE_FIELDS = [
  'worker_wage', 'supervisor_wage', 'rent', 'utility_fee',
  'tool_investment', 'equipment', 'renovation', 'misc_fee',
  'shipping_fee', 'social_insurance', 'tax'
];

// 部门配置
const DEPT_CONFIG = {
  beer: {
    tableName: 'beer_records',
    label: '啤机部',
    workshops: ['兴信A', '兴信B', '华登', '邵阳'],
    uniqueInputFields: [
      'total_machines', 'running_machines', 'misc_workers', 'gate_workers',
      'run_hours', 'output_tax_incl', 'misc_worker_wage',
      'machine_repair', 'mold_repair', 'gate_processing_fee',
      'assembly_gate_parts_fee', 'recoverable_gate_fee', 'material_supplement'
    ],
    uniqueCalcFields: [
      'machine_rate', 'avg_output_per_machine', 'wage_ratio',
      'mold_cost_ratio', 'gate_cost_ratio', 'avg_balance_per_machine'
    ],
    uniqueExpenseFields: [
      'misc_worker_wage', 'machine_repair', 'mold_repair',
      'gate_processing_fee', 'assembly_gate_parts_fee',
      'recoverable_gate_fee', 'material_supplement'
    ]
  },
  print: {
    tableName: 'print_records',
    label: '印喷部',
    workshops: ['兴信A', '华登', '邵阳'],
    uniqueInputFields: [
      'pad_total_machines', 'pad_running_machines',
      'spray_total_machines', 'spray_running_machines',
      'misc_workers', 'work_hours', 'total_hours', 'output_tax_incl',
      'subsidy', 'materials', 'repair_fee', 'oil_water_amount',
      'no_output_wage', 'recoverable_wage', 'recoverable_indonesia_wage',
      'non_recoverable_tool_fee', 'recoverable_tool_fee',
      'recoverable_paint', 'dept_recoverable_wage',
      'assembly_wage_paid', 'office_wage',
      'auto_mold_fee', 'hunan_mold_fee', 'indonesia_mold_fee'
    ],
    uniqueCalcFields: [
      'pad_machine_rate', 'spray_machine_rate', 'avg_output_per_worker',
      'wage_ratio', 'office_wage_ratio', 'mold_fee_ratio', 'total_ratio'
    ],
    uniqueExpenseFields: [
      'subsidy', 'materials', 'repair_fee', 'oil_water_amount',
      'no_output_wage', 'non_recoverable_tool_fee',
      'assembly_wage_paid', 'office_wage',
      'auto_mold_fee', 'hunan_mold_fee', 'indonesia_mold_fee'
    ]
  },
  assembly: {
    tableName: 'assembly_records',
    label: '装配部',
    workshops: ['兴信A', '兴信B', '华登', '邵阳'],
    uniqueInputFields: [
      'planned_wage_tax', 'actual_wage',
      'workshop_repair', 'electrical_repair', 'workshop_materials',
      'stretch_film', 'supplement', 'housing_subsidy',
      'recoverable_electricity', 'tape', 'borrowed_worker_wage'
    ],
    uniqueCalcFields: [
      'avg_output_per_worker', 'balance_minus_tape',
      'balance_tape_ratio', 'tool_invest_ratio', 'borrowed_wage_ratio'
    ],
    uniqueExpenseFields: [
      'actual_wage', 'workshop_repair', 'electrical_repair',
      'workshop_materials', 'stretch_film', 'supplement',
      'housing_subsidy', 'tape', 'borrowed_worker_wage'
    ]
  }
};

// 获取部门所有可写字段
function getAllInputFields(dept) {
  return [...SHARED_INPUT_FIELDS, ...DEPT_CONFIG[dept].uniqueInputFields, 'remark'];
}

// 获取部门所有字段（含计算字段）
function getAllFields(dept) {
  return [
    ...SHARED_INPUT_FIELDS, ...SHARED_CALC_FIELDS,
    ...DEPT_CONFIG[dept].uniqueInputFields,
    ...DEPT_CONFIG[dept].uniqueCalcFields,
    'remark'
  ];
}

// 获取所有费用字段（参与结余扣减）
function getExpenseFields(dept) {
  return [...SHARED_EXPENSE_FIELDS, ...DEPT_CONFIG[dept].uniqueExpenseFields];
}

module.exports = {
  DEPT_CONFIG, SHARED_INPUT_FIELDS, SHARED_CALC_FIELDS, SHARED_EXPENSE_FIELDS,
  getAllInputFields, getAllFields, getExpenseFields
};
