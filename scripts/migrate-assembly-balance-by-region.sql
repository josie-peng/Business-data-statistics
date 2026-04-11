-- 装配部结余公式按区域分开
-- 当前 formula_parser 不支持按 region 条件分支
-- hardcoded fallback (calc.js) 已处理区域逻辑
-- 此脚本将装配部公式标记为禁用，确保走 hardcoded fallback

-- 禁用装配部的 DB balance 公式，强制走 hardcoded fallback
UPDATE formula_configs
SET enabled = false
WHERE module = 'balance'
  AND department = 'assembly'
  AND field_key = 'balance';

-- 同时禁用 balance_ratio（因为它依赖 balance）
UPDATE formula_configs
SET enabled = false
WHERE module = 'balance'
  AND department = 'assembly'
  AND field_key = 'balance_ratio';
