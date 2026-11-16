# 猫猫房间：时间制照料循环 v1

本文定义 `js/sim.js` 里的纯模拟层：只吃传入的 `atMs`，不读 `Date.now()`，不用 `Math.random()`。同输入必得同输出，浏览器与 Node 共用同一份代码。

## 基础速率与时间压缩

真实成年猫每天排 4–6 团，即每 4.8–6 小时一团。按下界 4.8 小时 = 288 分钟算，288 / 25 ≈ 11.5，所以把游戏里一团压到 25 分钟，相当于约 10–15 倍的时间压缩。写票时曾把这个倍数估高到数十倍，那是把"每 4.8 小时一团"误算了一步，本设计以 288 / 25 为准，取 25 分钟一团，落在用户选定的 20–30 分钟区间里。

中性心情下 1 小时产出 2.4 团；一个 0 级盆容量 3 坨，三个盆合计 9 坨，离线 24 小时就会封顶在总容量上。

## 常数的取值与理由

| 常数 | 值 | 依据 |
| --- | --- | --- |
| TICK_MS | 1000 | 模拟按 1 秒网格步进，逐秒推进与一次补算结果一致 |
| BASE_INTERVAL_MS | 1500000 | 中性心情 25 分钟一团 |
| MOOD_MIN | 0.6 | 心情最差时速率降到基准的 60% |
| MOOD_MAX | 1.4 | 心情最好时速率升到基准的 140% |
| MOOD_BASE | 50 | 无互动时心情基础分 50，系数正好 1.0 |
| THIRSTY_MOOD | 20 | 水盆空了扣 20 分 |
| HUNGRY_MOOD | 20 | 饭盆空了扣 20 分 |
| FULL_MOOD | 15 | 所有盆都满了扣 15 分 |
| PET_MOOD | 30 | 摸头一次加 30 分，约 20 分钟回落到基础值 |
| PET_MOOD_MS | 1200000 | 摸头加成 20 分钟线性衰减到 0 |
| PLAY_MOOD | 40 | 玩耍加成按 40 分留顶，逗猫棒 20 分、小老鼠 35 分 |
| PLAY_MOOD_MS | 1800000 | 玩耍加成默认 30 分钟衰减，玩具可覆盖 |
| TREAT_MOOD_MS | 900000 | 零食加成 15 分钟衰减 |
| WATER_LIFE_MS | 28800000 | 一盆水 8 小时见底 |
| WATER_LIFE_PRO_MS | 43200000 | 升级水盆后一盆水 12 小时见底 |
| FOOD_LIFE_MS | 10800000 | 一份猫粮 3 小时吃完 |
| FOOD_LIFE_PRO_MS | 16200000 | 升级饭盆后一份猫粮 4.5 小时吃完 |
| EMPTY_FACTOR | 0.4 | 水或粮见底时该系数降到 0.4，但不归零，猫仍能缓慢产出 |
| WATER_LOW | 0.15 | 水量低于 15% 时开始线性衰减 |
| FOOD_LOW | 0.2 | 饭量低于 20% 时开始线性衰减 |
| SQUAT_LEAD_MS | 45000 | 离下一坨 45 秒以内视为正在蹲坑 |
| SQUAT_TAIL_MS | 4000 | 刚拉完 4 秒内仍算蹲坑动作 |
| MAX_BOXES | 3 | 一个房间最多三个盆 |
| FRESHENER_BONUS | 5 | 有除臭机时每坨多 5 分 |
| FOOD_CAP | 3 | 饭盆一次最多装 3 份 |

两个需要单独解释的取值：

- **EMPTY_FACTOR 取 0.4 而不是 0**：水粮见底是惩罚，不该让进度彻底停摆。水粮见底且盆满 → 心情 0 → 系数 0.6 × 0.4 × 0.4 = 0.096，约 260 分钟一团；只水粮见底不盆满 → 心情 10 → 系数 0.4 × 0.4 × 0.68 = 0.1088，约 230 分钟一团。两者都是变慢不停产，玩家回来补一次水粮就能恢复。若取 0，离线一夜就完全零产出，惩罚过重且没有补救的层次感。
- **心情上下限 0.6 / 1.4**：心情让速率在基准的 60%–140% 之间浮动。渴 + 饿 + 盆满三项惩罚同时成立时得分 0，系数正好落到 0.6；刚摸头 + 刚玩 + 吃了加心情的食物时得分封顶 100，系数正好 1.4。照料有回报，但不至于把"何时回来"变成唯一变量。
- **网格 1 秒**：1 小时 3600 步，30 天离线才 259 万步，必要时还能在"无空盆且水和粮都见底"的静止区间整段跳过。固定网格让"一次补算 6 小时"和"每 60 秒补算一次各 360 次"得到逐字节相同的结果。

## 心情的合成

```
moodScore = clamp(0, 100,
    MOOD_BASE
  + PET_MOOD  * decay(petAt,  PET_MOOD_MS)
  + min(playBoost, PLAY_MOOD) * decay(playAt, playMs || PLAY_MOOD_MS)
  + treatBoost * decay(treatAt, TREAT_MOOD_MS)
  - (water <= 0 ? THIRSTY_MOOD : 0)
  - (food  <= 0 ? HUNGRY_MOOD  : 0)
  - (hasSpace(state) ? 0 : FULL_MOOD))

decay(t0, T) = t0 === 0 ? 0 : t0 >= now ? 1 : max(0, 1 - (now - t0) / T)

factors.mood = MOOD_MIN + (MOOD_MAX - MOOD_MIN) * moodScore / 100
```

摸头免费，写 `mood.petAt`。玩耍要求先拥有玩具，写 `mood.playAt / playBoost / playMs`，单次玩耍加分封顶 `PLAY_MOOD = 40`。带心情加成的食物写 `mood.treatAt / treatBoost`，只有 `mood > 0` 的食物才写（初级猫粮不加心情）。水盆空扣 20 分、饭盆空扣 20 分、所有盆都满扣 15 分，三项同时成立时 50 分被扣到 0，心情系数落到 `MOOD_MIN = 0.6`；水粮充足且有空盆、又没有互动时得分 50，系数正好 1.0。

## 水与粮的消耗

每个 tick 从水量和饭量里各扣固定比例：

```
water -= TICK_MS / (owned.waterPro ? WATER_LIFE_PRO_MS : WATER_LIFE_MS)
food  -= TICK_MS / (owned.bowlPro  ? FOOD_LIFE_PRO_MS  : FOOD_LIFE_MS)
```

两者都夹到 0 以上。水盆免费补满（`addWater`）。一份猫粮 3 小时，升级饭盆后 4.5 小时；水盆 8 小时，升级后 12 小时。

```
factors.water = water <= 0 ? EMPTY_FACTOR : water >= WATER_LOW ? 1
              : EMPTY_FACTOR + (1 - EMPTY_FACTOR) * water / WATER_LOW
factors.food  = food  <= 0 ? EMPTY_FACTOR : food  >= FOOD_LOW  ? 1
              : EMPTY_FACTOR + (1 - EMPTY_FACTOR) * food  / FOOD_LOW
```

## 多盆与选址

盆的容量是 `3 + floor(level / 2)`，铲出价值是 `10 + 5 × level`。房间最多 `MAX_BOXES = 3` 个盆。新便便永远落在**下标最小且未满**的盆里（`nextBox`）；三盆全满时不再累积 `fill`，`fill` 原值保留，直到玩家铲出一坨才有位置。

## 积分公式

```
每坨积分 = BOX_LEVELS[该盆等级].value + (owned.freshener ? 5 : 0)
         = 10 + 5 × 该盆等级 + 除臭机 5
总积分   = 铲出的坨数 × 每坨积分
```

积分按铲出时该盆的等级结算，升级盆只影响之后铲出的坨。除臭机是全局加成，每坨多 5 分。

## 开局状态

新玩家：积分 0、水满（1）、饭盆满（1 份，即一份初级猫粮）、心情中性（50）、一个 0 级盆、没有猫。

这个开局够自给：一份猫粮 3 小时吃完，0 级单盆容量 3，3 小时内最多 3 坨（容量封顶）= 30 分，够买 3 份初级猫粮（每份 10 分）。单盆时靠容量而不是产量说话，新玩家在粮见底前回来铲一次，就能覆盖猫粮开销，不会陷入"没粮 → 不产出 → 没分买粮"的死锁。水是免费的，补一次就满。

## 一次购买得到什么

每种食物买一次只加 `FOODS[id].servings` 份：

| 食物 | 份数 | 心情 | 解锁所需铲出数 |
| --- | --- | --- | --- |
| 初级猫粮 | 1 | 0 | 0 |
| 猫条 | 0.5 | 15 | 5 |
| 罐头 | 2 | 10 | 12 |
| 小零食 | 0.3 | 25 | 20 |

饭盆容量 `FOOD_CAP = 3` 份。买之前先算"当前份数 + 本次份数"，超过 3 就拒绝购买，`canBuyFood` 返回 `{ ok: false, why: 'full' }`，界面提示"饭盆装不下啦，等它吃完再买"。饭盆没空也能买，只要总数不超过 3 份即可。

## squatting 的定义

猫此刻"正要去 / 正在盆里拉"由 `isSquatting(state, at)` 一个布尔值表达：

```
isSquatting = hasSpace(state) && (nextPoopInMs(state, at) <= SQUAT_LEAD_MS
                                  || (lastPoopAt !== 0 && at - lastPoopAt < SQUAT_TAIL_MS))
```

即：有盆未满，且离下一坨 ≤ 45 秒，或刚拉完 4 秒内。`lastPoopAt === 0` 时后半段为假。`game.js` 只按这个布尔值发 `game:squat`，`POST /api/presence { squatting }` 的上报节奏不变，广场上"正在蹲坑 N 只"仍然有效。三盆全满时 `isSquatting` 恒为假。

## 状态结构与迁移

v2 状态：

```
{ v: 2, level, points, totalScooped, seq, cat, owned, walls, wall,
  boxes: [{ level, poops: [{ id, kind }] }],
  water, food,
  mood: { petAt, playAt, treatAt, treatBoost, playBoost?, playMs? },
  sim: { at, fill, lastPoopAt },
  tutorial: { done }, foodKind }
```

顶层 `level` 是各盆等级的最大值，由 `syncLevel` 维护；`buyBox`、`upgradeBox`、`migrate` 末尾都会重算。服务端 `GET /api/plaza` 和 `GET /api/rooms/:id` 直接读 `save.data.level`，广场卡片上的等级靠这个派生值，不写回顶层所有人都会显示 0 级。`owned`、`walls`、`wall` 同样在顶层。

旧存档迁移（`migrate`）：保留 `points / totalScooped / seq / cat / owned / walls / wall`；原 `raw.level` 先 clamp 到 0–10，作为唯一一个盆的等级，顶层 `level` 由各盆等级最大值派生，所以 v1 迁移后顶层 `level` 等于原 level；`raw.poops` 里合法的 `{ id, kind }` 截到该等级容量后放进这个盆；`water / food` 置 1，心情全 0，`sim` 从 `nowMs` 起算，`tutorial.done = true`（老玩家不弹入门说明，`tutorial` 只保留 `done`），`foodKind = 'kibble'`。v1 的 `owned.bowl`（陶瓷饭盆）映射为 `owned.bowlPro`，老玩家的饭盆升级在新模拟层继续生效。`raw.fedUntil`、`raw.totalSquatMs`、`raw.poops` 这几个旧字段被丢弃，不再出现在结果里；`raw.level` 只用于派生盆等级与顶层 `level`，不再作为独立字段保留。若 `raw.v === 2`，补齐缺失字段、同样做 `bowl → bowlPro` 映射与 `tutorial.step` 清理，并重算顶层 `level` 后原样返回。

## 价格表与攒钱时长

第 4 列换算：中性心情、每小时铲一次、0 级单盆，每小时产出 2.4 团 × 10 分 = 24 分/小时，分钟 = 价格 × 2.5，小时 = 分钟 / 60 保留一位小数。

第 5 列换算：休闲玩家每天来 4 次、每次铲空、盆全 0 级，日产 = 4 次 × 3 坨 × 10 分 × 盆数 = 120 × 盆数 分/天，天数 = 价格 / (120 × 盆数) 保留一位小数；除 box3 一行按已有 2 个盆（盆数取 2）计算外，其余行盆数取 1。

| 物品 | id | 价格 | 攒够时长（分钟 / 小时） | 休闲玩家（天） |
| --- | --- | --- | --- | --- |
| 第 2 个猫砂盆 | box2 | 600 | 1500 / 25.0 | 5.0 |
| 第 3 个猫砂盆 | box3 | 2000 | 5000 / 83.3 | 8.3 |
| 初级猫粮 | kibble | 10 | 25 / 0.4 | 0.1 |
| 猫条 | strip | 15 | 37.5 / 0.6 | 0.1 |
| 罐头 | can | 40 | 100 / 1.7 | 0.3 |
| 小零食 | treat | 25 | 62.5 / 1.0 | 0.2 |
| 逗猫棒 | wand | 60 | 150 / 2.5 | 0.5 |
| 小老鼠 | mouse | 90 | 225 / 3.8 | 0.8 |
| 升级饭盆 | bowlPro | 80 | 200 / 3.3 | 0.7 |
| 升级水盆 | waterPro | 120 | 300 / 5.0 | 1.0 |
| 除臭机 | freshener | 150 | 375 / 6.3 | 1.3 |
| 地毯 | rug | 120 | 300 / 5.0 | 1.0 |
| 猫窝 | bed | 200 | 500 / 8.3 | 1.7 |
| 猫爬架 | tree | 400 | 1000 / 16.7 | 3.3 |
| 台灯 | lamp | 160 | 400 / 6.7 | 1.3 |
| 挂画 | picture | 100 | 250 / 4.2 | 0.8 |
| 墙纸 | wall | 60 | 150 / 2.5 | 0.5 |

`PRICES` 里另有 `box1: 0`，第一个盆是开局自带的，不进入价格表。

攒钱时长的含义是按"每小时铲一次、盆不满级"的节奏慢慢攒；实际玩家多买几个盆、升几级，单坨价值就从 10 分涨到 60 分，攒钱会明显变快。
