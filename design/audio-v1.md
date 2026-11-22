# 猫猫房间：音频 v1

本文定义 `js/audio.js` 的 Web Audio 引擎、`js/rich.js` 之外的音频资源约定，以及 `tools/make_audio.py` 的合成口径。所有声源都由仓库内脚本合成，不含任何外部版权素材。

## 架构与自动播放

`createEngine({ AudioContext, fetch, baseUrl })` 不读 `window`，Node 里可以直接 require。浏览器侧由 `js/game.js` 传入真实的 `AudioContext` 构造函数、`fetch` 和页面目录 URL：

- 页面首次 `pointerdown` / `keydown` / `click`（capture，once）调用 `engine.unlock()`。没有 `AudioContext` 时它立即 resolve，不影响游戏。
- `unlock()` 幂等：重复调用返回同一个 promise。它创建 `AudioContext`、`resume()`，然后并行拉取并解码 6 个 mp3：`assets/audio/<id>.mp3` 共 5 个音效，加 `assets/audio/bgm.mp3`。
- 每个文件单独 catch，失败的 id 记入 `failed`，整体不 reject。任一文件失败只影响该声部。
- 解码完成后，若 `settings.musicOn` 且 `bgm` 解码成功，BGM 从 0 线性升到 `musicVol`（0.4 s）后循环播放。

自动播放策略下，页面加载时 `AudioContext` 处于 `suspended`。没有用户手势时 `playCat()` 因 `ctx.state !== 'running'` 返回 `null`，不抛错；手势解锁后一切正常。`unlock()` 前所有接口都是安全的空操作。

## 6 个 id 与语义

| id | 语义 | 时长 | 合成 |
| --- | --- | --- | --- |
| bgm | 背景音乐 | 32.0 s | 120 BPM，C–G–Am–F，正弦/三角波旋律 + 低音 + 琶音 |
| purr | 打呼噜 | 1.2 s | 72 Hz 载波 3 次谐波，25 Hz 调幅 |
| meow | 短喵 | 0.55 s | 700→450 Hz 滑音，3 个谐波 |
| meow-long | 长喵 | 1.2 s | 620→380→480 Hz 两段滑音 |
| trill | 颤音 | 0.7 s | 520 Hz 载波，18 Hz 颤音调幅 |
| happy | 开心喵 | 0.8 s | 600→760 Hz、700→900 Hz 两段上扬 |

`SOUND_IDS = ['purr','meow','meow-long','trill','happy']`，`BGM_ID = 'bgm'`，`SOUND_LABELS` 提供界面用中文名。

## 设置

存储 key：`cats-toilet-audio-v1`。

| 字段 | 默认 | 规则 |
| --- | --- | --- |
| musicOn | true | 只接受 boolean |
| sfxOn | true | 只接受 boolean |
| musicVol | 0.4 | 有限 number，clamp 到 0–1 |
| sfxVol | 0.7 | 有限 number，clamp 到 0–1 |

`normalizeSettings(raw)` 补全字段、忽略多余字段；`loadSettings(storage)` 的坏 JSON 回退默认；`saveSettings(storage, settings)` 在 `setItem` 抛错时静默返回 false。

`setSettings(partial)` 合并并归一化，立即把 `musicGain` / `sfxGain` 的 gain 设为新音量。`musicOn` 由 false 变 true 时启动 BGM（若已解码），由 true 变 false 时 0.3 s 线性 fade 到 0 后停止。BGM 结点 `loop = true`，fade 使用 `setValueAtTime` + `linearRampToValueAtTime`。

## 猫叫选择

`pickSound(prev, rand = Math.random)`：`prev` 在 `SOUND_IDS` 中时从其余 4 个里按 `floor(rand()*4)` 取，否则从 5 个里按 `floor(rand()*5)` 取；rand 结果先 clamp 到 `[0, 0.999999]`。相邻两次调用（把上一次结果作为 `prev`）必不相同。`playCat()` 只用已解码的 id，并记录 `lastSfx`、累加 `sfxCount`。

## BGM 乐句与合成参数

32.0 秒 = 120 BPM 下 64 拍 = 16 小节 4/4。和声进行每 4 小节循环一次：C–G–Am–F（根音 MIDI 36 / 43 / 45 / 41）。每小节 4 拍：

- 低音：第 1、3 拍各一个 0.9 s 的根音（正弦 + 二次谐波）。
- 琶音：8 个八分音符，按 `[0,1,2,1]` 循环取和弦音高八度，0.2 s 短音。
- 旋律：4 个四分音符，取和弦音高八度，偶数小节 `[0,2,1,2]`、奇数小节 `[2,1,2,0]`。

整小节结束，文件恰好 32.0 s，配合 10 ms 首尾 fade 循环无爆音。

## 编码与预算

`tools/make_audio.py` 只用 Python 标准库（`wave`、`math`、`struct`、`random`、`subprocess`、`argparse`、`pathlib`），固定随机种子，同参数重跑输出同字节。合成 44100 Hz、单声道、16-bit WAV，峰值归一化到约 −6 dBFS（0.5 幅度），首尾各 10 ms 线性 fade，再逐文件转码：

```
ffmpeg -hide_banner -loglevel error -y -i <wav> \
  -codec:a libmp3lame -b:a 64k -ar 44100 -ac 1 \
  -fflags +bitexact -flags:a +bitexact -map_metadata -1 -id3v2_version 0 <out>.mp3
```

固定输出 6 个文件：`bgm.mp3`、`purr.mp3`、`meow.mp3`、`meow-long.mp3`、`trill.mp3`、`happy.mp3`。字节预算：

| 文件 | 实测字节 | 上限 |
| --- | --- | --- |
| bgm.mp3 | 256416 | 358400（350 KiB） |
| purr.mp3 | 10030 | 20480（20 KiB） |
| meow.mp3 | 5014 | 20480 |
| meow-long.mp3 | 10030 | 20480 |
| trill.mp3 | 6059 | 20480 |
| happy.mp3 | 6895 | 20480 |
| 合计 | 294444 | 512000（500 KiB） |

脚本生成后打印每个文件字节数，超限非 0 退出；找不到 ffmpeg 时打印原因并非 0 退出。`--out <dir>` 可改输出目录，默认 `assets/audio/`。

## 失败降级

- 没有 `AudioContext`、构造失败、解码失败：只记录 `failed`，游戏照常运行，只是无声。
- `status()` 返回 `{ ctx: 'none'|'suspended'|'running'|'closed', decoded, failed, bgmPlaying, lastSfx, sfxCount, settings }`，是快照副本，不暴露内部对象。
- 所有方法内部 try/catch，任何 Web Audio 错误都不会冒泡到游戏循环。

## 来源声明

全部音频由 `tools/make_audio.py` 在仓库内合成，无外部音频素材，无版权素材下载。

## 重跑与校验

```sh
python3 tools/make_audio.py
python3 tools/make_audio.py --out /home/sentimentalk/codes/temp/cat-004/audio-recheck
sha256sum assets/audio/*.mp3 /home/sentimentalk/codes/temp/cat-004/audio-recheck/*.mp3
ffprobe -v error -show_entries stream=codec_name,sample_rate,channels \
  -show_entries format=duration,size -of json assets/audio/bgm.mp3
```

headless 测试以 `window.__audio.status()` 为准：`decoded.length === 6`、`ctx === 'running'`、`bgmPlaying` 与设置项同步，不以实际出声为准。截图用例见 `test/e2e/cat-004.test.mjs`。
