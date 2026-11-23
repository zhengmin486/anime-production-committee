# 员工排班模拟器 V0.1

## 数据源
读取 `scripts/fixtures/staff_templates.json`，该文件为本轮上传的 `staff_templates.json` 原样快照（schema `apc.staff_templates/0.1`），当前 15 人：12 名核心、3 名临时。员工属性原样读取；`meta.specialty` 仅作为排班所需专业字段。人物卡仍属内容提案，数值未冻结。

## 策略
`solo_specialist`、`all_staff`、`pair_specialist`、`trio_specialist`、`dynamic_pair`、`dynamic_trio`、`all_staff_deadline`、`dynamic_pair_deadline`。动态策略每周根据能力、专业适配、士气和疲劳重新选人。

## 规则与边界
速度、专业适配、士气/疲劳修正、疲劳变化、士气变化、质量继承系数取自 `packages/game-core/include/game_rules.hpp`。五阶段工作量默认各 30、工期 14 周是实验输入，不是正式平衡值。

不模拟阶段并行、事件、成长、特性效果、临时员工费用现金流、招聘/外包或正式违约结算。加班变体使用 deadline policy 的速度/士气参数，不额外虚构产能倍率。

## 运行
`python scripts/staff_scheduling_simulator.py --staff-file scripts/fixtures/staff_templates.json --deadline 14`

`python -m unittest scripts.tests.test_staff_scheduling_simulator -v`
