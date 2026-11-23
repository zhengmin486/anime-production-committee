# 员工排班模拟器 V0.2

## 数据源
读取 \`scripts/fixtures/staff_templates.json\`，为用户上传的 \`staff_templates.json\` 原样快照（schema \`apc.staff_templates/0.1\`），共 15 人：12 名核心、3 名临时。员工属性不修改；\`meta.specialty\` 仅作为当前 C++ 排班计算所需的专业字段。人物卡仍属内容提案，数值未冻结。

## 策略
\`solo_specialist\`、\`all_staff\`、\`pair_specialist\`、\`trio_specialist\`、\`dynamic_pair\`、\`dynamic_trio\`、\`all_staff_deadline\`、\`dynamic_pair_deadline\`。固定策略在阶段开始时锁定人员；动态策略每周按当前产能重新选人。输出逐周人员分配和阶段内换人次数。

## 规则与边界
生产速度的整数缩放顺序、专业适配、士气/疲劳修正、疲劳变化、士气变化、阶段质量累计、质量继承与最终质量权重按 \`game_rules.hpp\` 和 \`game_core.cpp\`。Deadline policy 使用 speed=1300、quality=800、morale=-4；启用 overtime 时额外扣除 overtime_morale=6。

不模拟阶段并行、事件、成长、特性效果、临时员工费用现金流、招聘/外包或正式违约结算。所有 15 人都在本轮可选人员池中，包括临时员工；临时费用不计入成本，因此结果只比较排班生产侧，不代表完整经济决策。

## 运行
\`python scripts/staff_scheduling_simulator.py --staff-file scripts/fixtures/staff_templates.json --deadline 14 --workloads 30,60,90,120\`

\`python -m unittest scripts.tests.test_staff_scheduling_simulator -v\`

详细结果见 \`docs/STAFF_SCHEDULING_SIMULATION_REPORT_V0.2.md\`。
