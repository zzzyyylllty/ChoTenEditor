# LithiumCarbon — 箱子/容器物品获取目标类型

> ⚠️ **警告：这是一个第三方插件提示词。**
> 本提示词描述的是 **LithiumCarbon** 插件的 `lithium item grant` 目标类型。
> **如果你没有在服务器上安装 LithiumCarbon 插件，请勿使用此目标类型。**
> 否则生成的任务将无法正常工作。

## objective: lithium item grant

玩家从箱子/容器中获取指定物品来推进任务进度。

```yaml
objective: lithium item grant
condition:
  item: sertraline:item_id       # 物品 ID
goal:
  amount: 10                     # 需要获取的数量
```

### 字段说明

| 字段 | 说明 |
|------|------|
| `item` | 物品 ID，取决于服务器的物品插件 |
| `amount` | 需要从容器中获取的数量 |

### 说明

- 玩家从任何容器（箱子、桶、潜影盒等）中获取到指定数量的该物品时完成
- 适用于"在探索中找到特定物品"类型的任务
- 不消耗物品，只是检测玩家是否从容器中获取过
- 通常与 `choten submit` 或其他提交方式配合使用（找到物品 → 提交给 NPC）

### 完整示例

```yaml
QuestID:
  meta:
    name: "探索收集"
    type: L1
  task:
    1:
      meta:
        name: "在箱子里找到面包"
      objective: lithium item grant
      condition:
        item: sertraline:bread
      goal:
        amount: 10
    2:
      meta:
        name: "将面包交给 NPCName"
      objective: trigger
      condition:
        value: QuestSubmit
      goal:
        amount: 1
  addon:
    track:
      scoreboard: false
    chotenui:
      icon: BREAD
      index: |-
        在探索中寻找物资。
      description: |-
        探索周围的区域，在箱子中寻找面包。
        找到足够数量后交给 NPCName。
      reward: |-
       积分奖励
  agent:
    completed @ all: |-
      command papi "money give %player_name% 金额" as console
```

### 配合提交物品使用

`lithium item grant` 通常与 ChoTenSubmit 或其他提交方式配合：

```
任务流程：探索箱子找到物品（lithium item grant）→ 提交给 NPC（choten submit / trigger）
```
