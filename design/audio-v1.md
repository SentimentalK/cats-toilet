# 猫猫房间：音频 v1

本文定义 `js/audio.js` 的 Web Audio 引擎、`js/rich.js` 之外的音频资源约定，以及 `tools/make_audio.py` 的生成口径。BGM 仍由仓库内脚本合成；5 个猫叫全部是真实录音（CC0 / Public Domain），源文件与授权说明在 `assets/audio/source/`。

## 架构与自动播放

`createEngine({ AudioContext, fetch, baseUrl })` 不读 `window`，Node 里可以直接 require。浏览器侧由 `js/game.js` 传入真实的 `AudioContext` 构造函数、`fetch` 和页面目录 URL：

- 页面首次 `pointerdown` / `keydown` / `click`（capture，once）调用 `engine.unlock()`。没有 `AudioContext` 时它立即 resolve，不影响游戏。
- `unlock()` 幂等：重复调用返回同一个 promise。它创建 `AudioContext`、`resume()`，然后并行拉取并解码 6 个 mp3：`assets/audio/<id>.mp3` 共 5 个音效，加 `assets/audio/bgm.mp3`。
- 每个文件单独 catch，失败的 id 记入 `failed`，整体不 reject。任一文件失败只影响该声部。
- 解码完成后，若 `settings.musicOn` 且 `bgm` 解码成功，BGM 从 0 线性升到 `musicVol`（0.4 s）后循环播放。

自动播放策略下，页面加载时 `AudioContext` 处于 `suspended`。没有用户手势时 `playCat()` 因 `ctx.state !== 'running'` 返回 `null`，不抛错；手势解锁后一切正常。`unlock()` 前所有接口都是安全的空操作。

## 6 个 id 与语义

| id | 语义 | 时长 | 来源 |
| --- | --- | --- | --- |
| bgm | 背景音乐 | 32.0 s | 合成：120 BPM，C–G–Am–F，正弦/三角波旋律 + 低音 + 琶音 |
| purr | 打呼噜 | 3.0 s | 真实录音：Mysid，Public Domain（Wikimedia Commons `Purring_cat.oga`），截 0.5–3.5 s + loudnorm |
| meow | 短喵 | 0.663 s | 真实录音：Tsester，CC0（Wikimedia Commons），截 0.212–0.875 s + loudnorm |
| meow-long | 长喵 | 1.970 s | 真实录音：Heismark，Public domain（Wikimedia Commons），截 9.40–11.37 s + loudnorm |
| trill | 颤音 | 0.700 s | 真实录音：jsbarrett，CC0（Freesound 200336），截 3.48–4.18 s + loudnorm |
| happy | 开心喵 | 1.152 s | 真实录音：George Miquilena，CC0（Wikimedia Commons），整段 1.174 s + loudnorm |

`SOUND_IDS = ['purr','meow','meow-long','trill','happy']`（打呼噜、短喵、长喵、颤音、开心喵），`BGM_ID = 'bgm'`。

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

`tools/make_audio.py` 只用 Python 标准库（`wave`、`math`、`struct`、`subprocess`、`argparse`、`pathlib`）。只有 BGM 由脚本合成 44100 Hz、单声道、16-bit WAV，峰值归一化到约 −6 dBFS（0.5 幅度），首尾各 10 ms 线性 fade，再转码；合成猫叫的 `render_*` 函数与 `add_glide` 已删除。

```
ffmpeg -hide_banner -loglevel error -y -i <wav> \
  -codec:a libmp3lame -b:a 64k -ar 44100 -ac 1 \
  -fflags +bitexact -flags:a +bitexact -map_metadata -1 -id3v2_version 0 <out>.mp3
```

5 个猫叫都从 `assets/audio/source/` 的原始录音截取（`REAL_SOUNDS` 表里是每个 id 的源文件、`-ss`、`-t`）。统一命令：

```
ffmpeg -hide_banner -loglevel error -y -ss <start> -t <dur> \
  -i assets/audio/source/<file> \
  -af "aformat=sample_rates=44100:channel_layouts=mono,loudnorm=I=-18:TP=-6:LRA=7" \
  -ac 1 -ar 44100 -codec:a libmp3lame -b:a 64k \
  -fflags +bitexact -flags:a +bitexact -map_metadata -1 -id3v2_version 0 \
  assets/audio/<id>.mp3
```

先下混单声道再归一化，避免 loudnorm 按立体声限峰、下混后峰值又抬高。任一源文件缺失时脚本打印 id、缺失路径与授权并要求复原，非 0 退出，不回退合成。

固定输出 6 个文件：`bgm.mp3`、`purr.mp3`、`meow.mp3`、`meow-long.mp3`、`trill.mp3`、`happy.mp3`。实测（`ffprobe` / `ebur128`，2026-11-22）：

| 文件 | 时长 | 集成响度 | 实测字节 | 上限 |
| --- | --- | --- | --- | --- |
| bgm.mp3 | 32.000 s | −16.6 LUFS | 256416 | 358400（350 KiB） |
| purr.mp3 | 3.000 s | −23.4 LUFS | 24449 | 40960（40 KiB） |
| meow.mp3 | 0.663 s | −18.4 LUFS | 5850 | 20480 |
| meow-long.mp3 | 1.970 s | −19.2 LUFS | 16299 | 20480 |
| trill.mp3 | 0.700 s | −19.8 LUFS | 6059 | 20480 |
| happy.mp3 | 1.152 s | −18.4 LUFS | 9821 | 20480 |
| 猫叫合计 | 7.485 s | — | 62478 | 102400（100 KiB） |
| 合计 | — | — | 318894 | 512000（500 KiB） |

`purr` 是持续底噪、波峰因数高，`TP=-6` 下单遍 loudnorm 到不了 −18，停在 −23.4 LUFS，比 4 个一次性猫叫轻 4–6 LU；混音上有意让呼噜垫底、喵叫突出。

`purr` 的 40 KiB 上限是既有例外：它是 2026-11-22 用户认可的录音，字节保持不变（24,449 B），「每个 ≤20 KiB」只约束本次新增的 4 个。脚本生成后打印每个文件字节数，超限、猫叫合计超 100 KiB、总计超 500 KiB、找不到 ffmpeg 或任一源文件时非 0 退出。`--out <dir>` 可改输出目录，默认 `assets/audio/`，仍会重生成 6 个文件。

## 失败降级

- 没有 `AudioContext`、构造失败、解码失败：只记录 `failed`，游戏照常运行，只是无声。
- `status()` 返回 `{ ctx: 'none'|'suspended'|'running'|'closed', decoded, failed, bgmPlaying, lastSfx, sfxCount, settings }`，是快照副本，不暴露内部对象。
- 所有方法内部 try/catch，任何 Web Audio 错误都不会冒泡到游戏循环。

## 来源声明

5 个猫叫都是真实录音，原始文件原样保存在 `assets/audio/source/`，作者/URL/授权/截取区间的完整表在 `assets/audio/source/README.md`：

| id | 作者 | 授权 | 来源 |
| --- | --- | --- | --- |
| purr | Mysid | Public Domain | https://commons.wikimedia.org/wiki/File:Purring_cat.oga |
| meow | Tsester | CC0 | https://commons.wikimedia.org/wiki/File:2015-11-24.%CE%BD%CE%B9%CE%B1%CE%BF%CF%8D%CF%81%CE%B9%CF%83%CE%BC%CE%B1.%CE%9D%CE%B9%CE%AC%CE%BF%CF%85.noise_reduced.flac |
| happy | George Miquilena | CC0 | https://commons.wikimedia.org/wiki/File:Maullido_de_gata_hembra_joven.ogg |
| meow-long | Heismark | Public domain | https://commons.wikimedia.org/wiki/File:Meow_of_a_pleading_cat.oga |
| trill | jsbarrett | CC0 | https://freesound.org/people/jsbarrett/sounds/200336/ |

`bgm.mp3` 唯一由 `tools/make_audio.py` 合成，无外部素材。

## 重跑与校验

```sh
python3 tools/make_audio.py
python3 tools/make_audio.py --out /home/sentimentalk/codes/temp/cat-004/audio-recheck
sha256sum assets/audio/*.mp3 /home/sentimentalk/codes/temp/cat-004/audio-recheck/*.mp3
for f in bgm purr meow meow-long trill happy; do
  ffprobe -v error -show_entries stream=codec_name,sample_rate,channels \
    -show_entries format=duration,size -of compact assets/audio/$f.mp3
done
```

headless 测试以 `window.__audio.status()` 为准：`decoded.length === 6`、`ctx === 'running'`、`bgmPlaying` 与设置项同步，不以实际出声为准。截图用例见 `test/e2e/cat-004.test.mjs`。
