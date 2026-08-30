# Kether 脚本语言参考

Kether 是 Chemdah 插件使用的脚本语言，类似 JavaScript，用于任务逻辑、对话分支和游戏内交互。

## 基本语法

### 变量和数据类型
Kether 使用动态类型，支持数字、字符串、布尔值和列表。

### 玩家变量系统 (profile data)
操作玩家的持久化数据容器。

```kether
# 获取变量 key 的值
profile data key

# 获取变量 key，如果不存在返回默认值 10
profile data key default 10

# 设置变量 key 为 10
profile data key to 10

# 变量 key 增加 1（智能类型转换）
profile data key add 1

# 变量 key 增加 1，如果不存在则在默认值 10 的基础上加 1
profile data key add 1 default 10

# 获取玩家的所有变量键列表
profile data keys

# 立即将数据推送到数据库
profile save
```

### 全局变量系统 (var)
操作服务器级别的全局变量（所有玩家共享）。

```kether
# 读取变量
var key

# 设置变量
var key to value

# 累加变量
var key add value

# 返回所有 key 列表
var keys
```

## 条件判断

### 基本条件检查
```kether
# 检查玩家变量 FirstTalk_BoFeng 是否为 0（不存在时默认 0）
check profile data FirstTalk_BoFeng default 0 == 0

# 检查占位符 %player_name% 是否为 "test"
check papi %player_name% == "test"
```

### if 语句
```kether
# 基本 if 语句
if check papi %player_name% == "test" then { profile data key to 10 } else { profile data key to 5 }

# 简化形式（单语句可省略大括号）
if check papi %player_name% == "test" then profile data key to 10 else profile data key to 5

# 只有 then 分支
if condition then action
```

### 逻辑运算符
```kether
# 所有条件都通过
all [ { condition1 } { condition2 } { condition3 } ]

# 至少一个条件通过
any [ { condition1 } { condition2 } { condition3 } ]

# 反转结果
not condition
```

**重要**：`all` 和 `any` 中的每个条件用大括号包裹，因为不能有 UNIT 返回的动作。例如：
```kether
# 正确
all [ { quest select FoodSender quest completed } { quest select DinnerTime quest completed } ]

# 错误（会导致 Unit true Unit true）
all [ quest select FoodSender quest completed quest select DinnerTime quest completed ]
```

当然，一些情况下是可以省略的，如果没有返回 Unit 的动作：

```kether
# 可以省略，动作均返回布尔值
any [ quest accepted quest completed check profile data xxx == 1 ]

# 不能省略，quest select xxx返回 Unit
any [ quest select xxx quest accepted quest completed ] # 导致错误

# 应替换为
any [ { quest select xxx quest accepted } { quest select xxx quest completed } ]

# 或者：
quest select xxx any [ quest accepted quest completed ]
```


## 任务操作

### 任务选择和管理
```kether
# 选中任务，后续操作均作用于该任务
quest select <任务ID>

# 返回玩家是否正在进行该任务
quest accepted

# 返回任务是否已完成
quest completed

# 使玩家接受任务，返回接受结果
quest accept

# 检查接受条件，不实际接受
quest accept-check

# 完成任务
quest complete

# 完成任务中的某个条目
quest complete-task <task编号或名称>

# 关闭任务中的某个条目
quest close-task <task>

# 使任务失败
quest fail

# 重置任务
quest reset

# 放弃任务
quest stop

# 追踪任务
quest track

# 取消追踪
quest track cancel

# 返回玩家进行中的任务数量
quest count

# 返回当前任务的所有条目名列表
quest tasks

# 读取任务数据
quest data <key>

# 设置任务数据
quest data <key> to <value>

# 累加任务数据
quest data <key> add <value>
```

### 任务进度查询
```kether
# 获取任务所有task的进度值总和（注意：是已完成task的value总和，不是完成数量）
quest select BlackFans quest progress value

# 获取任务所有task的目标值总和
quest select BlackFans quest progress target

# 任务进度百分比（0~1），基于完成条目数量，不是 value/target
quest select BlackFans quest progress percent

# 任务进度百分比（0~100）
quest select BlackFans quest progress percent100

# 查询特定task的进度
quest select BlackFans quest progress value task 1
quest select BlackFans quest progress percent task 2
```

### 获取玩家所有任务
```kether
# 返回玩家当前所有进行中任务的 id 列表
quests
# 使用示例：
set list to quests
```

## 物品操作

### 物品检查
```kether
# 检查背包中是否有特定物品
inventory check 物品格式

# 检查背包中是否有足够数量的物品
inventory check 物品格式 amount 数量

# 获取玩家背包中的特定物品数量
inventory count 物品格式

# 检查某位置是否是特定物品
inventory slot 0 is 物品格式
inventory slot 1 is 物品格式 amount 1

# 检查玩家背包中是否含有特定物品并移除
inventory take 物品格式
inventory take 物品格式 amount 1
```

### 给予物品

```
command papi "si give ITEMNAME %player_name%" as console
```

```
command papi "si give ITEMNAME %player_name% 3" as console
```

### 物品格式示例
不同插件的物品格式：
```kether
# craftengine 插件
"*[nbt.craftengine:id=default:topaz]"  # 必须有引号

# sertraline 插件
sertraline:物品ID

# MMOItems 插件
"*[nbt.MMOITEMS_ITEM_ID=xxx]"  # 必须有引号
"*[nbt.MMOITEMS_ITEM_ID=xxx,nbt.MMOITEMS_ITEM_TYPE=xxx]"  # 涉及种类
```

示例：检测玩家是否有 sertraline 物品 `sertraline:doc_blackhands`
```kether
inventory check sertraline:doc_blackhands
```

## 对话操作

对话相关动作仅在对话上下文（命名空间 chemdah-conversation）中有效。

```kether
# 打开另一段对话
open <对话ID>

# 跳转到另一段对话（保留当前会话）
goto <对话ID>

# 关闭当前对话
close

# NPC 以对话形式发言
talk "消息内容"
```

示例：对话条件分支
```kether
if &choice == "yes" {
  goto "quest_accept_conv"
} else {
  close
}
```

## 脚本执行和流程控制

### 命令执行
```kether
# 执行命令（解析占位符）
command papi "say hello, %player_name%" as console

# 执行命令（不解析占位符）
command "say hello" as console

# 内联脚本+指令（注意这里面指令字符串没有papi，不会解析占位符）
command inline "say hello, {{ math + [ 1 2 ] }}" as console

# 内联脚本+指令+解析占位符（先内联再解析占位符）
command papi inline "say hello, %player_name%{{ math + [ 1 2 ] }}" as console
```

### 消息发送
```kether
# 发送消息给玩家
tell "hello"

# 发送消息（解析占位符）
tell papi "hello %player_name%"
```

### 数学运算
```kether
# 基本运算 + - * /
math + [ 1 2 ]  # 返回 3
math - [ 5 2 ]  # 返回 3
math * [ 3 4 ]  # 返回 12
math / [ 10 2 ] # 返回 5
```

### 内联脚本
```kether
# 内联脚本，支持在字符串中嵌入表达式
inline "hello, {{ math + [ 1 2 ] }}"  # 返回 "hello, 3"

# 对话的回复和聊天内容均支持内联，但是不直接支持papi
# 示例对话：你好，{{ sender }} 会转换为 你好, [玩家名称]
# 使用占位符：你好, {{ papi %player_name% }}
```

### 循环和控制流
```kether
# 重复执行
repeat 10 print "Hello World!"

# 堵塞线程（暂停执行）
sleep 0.1s  # 支持单位：t(ticks), s(seconds), m(minutes), h(hours)

# while 循环
while player sneaking then {{ tell sneaking sleep 1s }}
```

### 触发器
```kether
# 手动触发 trigger 类型的任务条目
trigger "player_crafted"

# 批量触发
trigger in [ "step_a" "step_b" "step_c" ]
```

## 脚本互调

在脚本内部可以调用其他脚本文件。

```kether
# 运行脚本（全局唯一实例）
script run <脚本名称>

# 运行脚本（每个玩家独立实例）
script run <脚本名称> @self

# 运行脚本并传参
script run <脚本名称> using [ <参数0> <参数1> ]

# 停止脚本
script stop <脚本名称>
```

脚本内通过 `&arg0`、`&arg1` 依次获取传入的参数。

## 实用示例

### 示例1：接受并追踪任务
```kether
quest select "main_quest_01"
quest accept
quest track
```

### 示例2：判断条件后完成任务
```kether
quest select "daily_task"
if quest accepted {
  quest complete
}
```

### 示例3：记录玩家杀敌数
```kether
profile data "kill_count" add 1
```

### 示例4：全服计数器
```kether
var "server_kill_total" add 1
```

### 示例5：检查两个任务是否都完成
```kether
quest select BlackFans
all [
  { quest progress percent task 1 >= 1 }
  { quest progress percent task 2 >= 1 }
]
```

## 注意事项

1. **大括号使用**：单个语句可以省略大括号，多个语句必须使用大括号包裹。
2. **单位返回值**：避免在 `all`/`any` 中使用返回 UNIT 的动作，用大括号包裹使其返回布尔值。
3. **占位符解析**：`papi` 前缀用于解析 PlaceholderAPI 占位符，如 `%player_name%`。
4. **内联脚本**：`{{ ... }}` 用于嵌入表达式，在对话和消息中可用。
5. **类型转换**：`add` 操作会自动进行类型转换，字符串数字会被转换为数字。

## 调试技巧

- 使用 `tell "调试信息"` 输出中间结果
- 使用 `profile data key` 检查变量值
- 分步测试复杂条件语句