# Chemdah 对话系统参考

## 文件结构

对话文件位于 `Chemdah/core/conversation/` 目录下，每个 NPC 一个文件夹，每个
对话场景一个 YAML 文件。支持子目录归类（如按阵营/等级分组）。

## 基本结构

```yaml
__option__:
  theme: 'chat'              # 对话主题样式
  title: '{name}'            # 标题格式，{name} 会被替换为玩家名

NPCID_main:
  npc id: 'adyeshach NPCID'  # 绑定的 NPC ID
  when:                       # 入口条件，从上到下匹配第一个满足的
    - if: true
      open: NPCID_Greet

NPCID_Greet:
  npc: |-                     # NPC 台词（支持 {{ sender }} 内联）
    你好 {{ sender }}，有什么事吗？
  format: generic             # 对话格式类型
  player:                     # 玩家选项列表
    - if: condition           #   可选条件，满足才显示
      reply: '选项文本'
      then: |                 #   选择后执行的 Kether 脚本
        goto NPCID_Somewhere
    - reply: '没事。'
      then: |                 # 无条件选项始终显示
        close
```

## 各字段详解

### __option__ （文件级配置）

| 字段 | 类型 | 说明 |
|------|------|------|
| `theme` | string | 对话主题：`chat` 聊天框、`inventory` 清单式等 |
| `title` | string | 对话标题，支持 `{name}` 玩家名占位符 |

### NPC 节点

每个节点是一个独立的对话状态。

| 字段 | 类型 | 说明 |
|------|------|------|
| `npc id` | string | 绑定的 Adyeshach NPC ID |
| `when` | list | 入口条件列表，顺序匹配 |
| `npc` | string | NPC 台词，支持 `|-` (保留换行) 或 `|-` 块 |
| `format` | string | 对话格式，通常为 `generic` |
| `player` | list | 玩家可选的回复列表 |

### when 条件

```yaml
when:
  - if: true           # 兜底条件，所有条件都不满足时使用
    open: NPCID_Greet
```

`if` 写 Kether 条件表达式，返回布尔值。`open` 指定满足时跳转的节点。

多个条件时从上到下匹配第一个满足的：
```yaml
when:
  - if: quest select SampleQuest quest accepted
    open: NPCID_Progress
  - if: quest select SampleQuest quest completed
    open: NPCID_Done
  - if: true
    open: NPCID_Greet
```

### player 选项

| 字段 | 类型 | 说明 |
|------|------|------|
| `- if` | string | 可选，Kether 条件，满足才显示该选项 |
| `reply` | string | 选项文本，支持 `{{ sender }}` 内联 |
| `then` | string | 选择后执行的 Kether 脚本 |

支持多个无 `if` 的默认选项（兜底用）。

## NPC 台词写法

### 普通文本
```yaml
npc: |-
  第一行台词
  第二行台词
```

### 使用内联获取玩家名
```yaml
npc: |-
  你好，{{ sender }}，欢迎来到基地。
```

### 多段台词（自动渐进显示）
```yaml
npc:
  - 第一段台词
  - 第二段台词
  - 第三段台词
```

## 玩家选项中的条件分支

```yaml
player:
  - if: all [ { quest select SampleQuest quest accepted } check profile data QuestStep == 1 ]
    reply: '我完成了第一步。'
    then: |
      profile data QuestStep to 2
      goto NPCID_Step2
  - if: quest select SampleQuest quest completed
    reply: '我已经完成了任务。'
    then: |
      goto NPCID_Congrats
  - reply: '我就看看。'
    then: |
      close
```

### 常用条件模式

| 模式 | Kether 条件 |
|------|------------|
| 任务未开始 | `quest select QuestID not any [ quest accepted quest completed ]` |
| 任务进行中 | `quest select QuestID quest accepted` |
| 任务已完成 | `quest select QuestID quest completed` |
| 变量等于某值 | `check profile data Key == 1` |
| 变量不存在时默认 | `check profile data Key default 0 == 0` |
| 任务进度检测 | `check quest progress value task 1 < 1` |
| 组合条件 | `all [ { condition1 } { condition2 } ]` |
| 任一条件 | `any [ { condition1 } { condition2 } ]` |

### 注意事项
1. `all` 和 `any` 中的条件如果包含返回 UNIT 的动作（如 `quest select`），需用 `{ }` 包裹
2. 纯布尔值返回的动作（如 `quest accepted`）可以省略 `{ }`
3. 字符条件要用引号包裹，数字条件可以不加

## then 中常用 Kether 脚本

| 用途 | 脚本 |
|------|------|
| 跳转节点 | `goto NodeID` |
| 关闭对话 | `close` |
| 打开另一段对话 | `open OtherNPCID_main` |
| 设置变量 | `profile data Key to 1` |
| 接受任务 | `quest select QuestID quest accept` |
| 完成任务 | `quest select QuestID quest complete` |
| 触发任务条目 | `trigger TriggerValue` |
| 执行命令 | `command papi "command" as console` |
| 发送消息 | `tell "消息"` / `tell papi "消息 %player_name%"` |
| 删除物品 | `inventory take 物品ID amount N` |

## 示例

### 简单的守门 NPC

```yaml
__option__:
  theme: 'chat'
  title: '{name}'

Guard_main:
  npc id: 'adyeshach Guard'
  when:
    - if: true
      open: Guard_1

Guard_1:
  npc: |-
    你好，{{ sender }}。我是这里的守卫。
    有什么需要帮忙的吗？
  format: generic
  player:
    - reply: '我要出去。'
      then: |
        tell 注意安全
        command papi "tp %player_name% x y z" as console
    - reply: '算了。'
      then: |
        close
```

### 带任务阶段分支的 NPC

```yaml
__option__:
  theme: 'chat'
  title: '{name}'

Merchant_main:
  npc id: 'adyeshach Merchant'
  when:
    - if: quest select SupplyQuest not any [ quest accepted quest completed ]
      open: Merchant_Offer
    - if: all [ { quest select SupplyQuest quest accepted } { check quest progress value task 1 < 1 } ]
      open: Merchant_Progress
    - if: quest select SupplyQuest quest completed
      open: Merchant_Done
    - if: true
      open: Merchant_Greet

Merchant_Greet:
  npc: |-
    欢迎光临，需要什么吗？
  format: generic
  player:
    - reply: '随便看看。'
      then: |
        close

Merchant_Offer:
  npc: |-
    你来得正好，我有一批货需要送到别处。
    愿意帮忙吗？
  format: generic
  player:
    - reply: '交给我吧。'
      then: |
        quest select SupplyQuest quest accept
        close
    - reply: '下次吧。'
      then: |
        close

Merchant_Progress:
  npc: |-
    货送到了吗？
  format: generic
  player:
    - reply: '送到了。'
      then: |
        trigger SupplySubmit
        goto Merchant_Confirm

Merchant_Done:
  npc: |-
    干得好，这是你的报酬。
  format: generic
  player:
    - reply: '谢谢！'
      then: |
        close
```

### 带首次对话的 NPC（首次见面用独立节点）

如果需要在玩家第一次对话时展示不同的问候内容，
可以用 `profile data` 标记首次对话：

```yaml
__option__:
  theme: 'chat'
  title: '{name}'

Trader_main:
  npc id: 'adyeshach Trader'
  when:
    - if: check profile data FirstTalk_Trader default 0 == 0
      open: Trader_FirstTalk
    - if: true
      open: Trader_Greet

Trader_FirstTalk:
  npc: |-
    新面孔啊，我是这里的商人，有好货。
  format: generic
  player:
    - reply: '好的，我看看。'
      then: |
        profile data FirstTalk_Trader to 1
        close

Trader_Greet:
  npc: |-
    又来光顾了？随便看。
  format: generic
  player:
    - reply: '嗯。'
      then: |
        close
```

## 对话设计规范

1. **节点命名**：统一用 `NPCID_节点名` 格式，避免不同 NPC 命名冲突
2. **条件顺序**：`when` 中具体条件在前，`true` 兜底在后
3. **NPC ID**：`npc id` 必须与 Adyeshach NPC 注册 ID 完全一致
4. **变量命名**：使用有意义的英文命名，蛇形或驼峰均可，保持统一
5. **任务关联**：用条件控制选项显示，避免玩家在错误阶段触发错误对话
6. **兜底回复**：始终提供至少一个无条件的默认选项（通常用于结束对话）
