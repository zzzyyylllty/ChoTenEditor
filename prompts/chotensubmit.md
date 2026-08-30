# ChoTenTech — ChoTenSubmit 物品提交目标类型

> ⚠️ **警告：这是一个第三方插件提示词。**
> 本提示词描述的是 **ChoTenTech** 插件的 `choten submit` 目标类型。
> **如果你没有在服务器上安装 ChoTenTech 插件，请勿使用此目标类型。**
> 否则生成的任务将无法正常工作。

## objective: choten submit

玩家通过与指定 NPC 对话来提交物品。

```yaml
objective: choten submit
condition:
  item: sertraline:item_id     # 物品 ID（取决于服务器的物品插件）
  consume: true                # 是否消耗物品
  amount: 30                   # 需要提交的数量
  npc: NPCName                 # 提交给的 NPC 名称
goal:
  amount: 1                    # 完成次数（通常为1）
```

### 字段说明

| 字段 | 说明 |
|------|------|
| `item` | 物品 ID，取决于服务器的物品插件（如 sertraline、ItemsAdder、Oraxen 等） |
| `consume` | `true` 表示从玩家背包中移除提交的物品 |
| `amount` | 需要提交的数量 |
| `npc` | 限制只能在此 NPC 处提交。NPC 名称会显示在对话选项中 |

### 数量写法的区别

- `amount` 在 `condition` 下：一次性检查提交数量（全交或全不交）
- `amount` 在 `goal` 下：检查提交次数（可以分多次提交）

### 完整示例

```yaml
QuestID:
  meta:
    name: "材料收集"
    type: L1
  task:
    1:
      meta:
        name: "提交 10 个木材"
      objective: choten submit
      condition:
        item: sertraline:wood
        consume: true
        amount: 10
        npc: NPCName
      goal:
        amount: 1
  addon:
    track:
      scoreboard: false
    chotenui:
      icon: OAK_LOG
      index: |-
        NPCName 需要一些木材。
      description: |-
        NPCName 正在收集建筑材料，需要你帮忙带一些木材过来。
        在基地内和 NPCName 对话即可提交物品。
      reward: |-
        积分奖励
  agent:
    completed @ all: |-
      command papi "money give %player_name% 金额" as console
      profile data affection_NPC add 好感度
```

### 多物品提交任务（每个条目一种物品）

```yaml
QuestID:
  meta:
    name: "物资收集"
    type: L1
  task:
    1:
      meta:
        name: "提交 10 个木材"
      objective: choten submit
      condition:
        item: sertraline:wood
        consume: true
        amount: 10
        npc: NPCName
      goal:
        amount: 1
    2:
      meta:
        name: "提交 5 个铁锭"
      objective: choten submit
      condition:
        item: sertraline:iron_ingot
        consume: true
        amount: 5
        npc: NPCName
      goal:
        amount: 1
    3:
      meta:
        name: "向 NPCName 汇报"
      objective: player data
      goal:
        key: ReportToNPC
        value: 1
        amount: 1
  agent:
    completed @ all: |-
      command papi "money give %player_name% 金额" as console
      profile data affection_NPC add 好感度
```
