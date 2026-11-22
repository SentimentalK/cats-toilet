# 5 个猫叫的真实录音源

`assets/audio/` 里的 5 个猫叫全部由本目录的原始录音截取，原始文件按下载时的字节原样保存，不参与页面播放。`bgm.mp3` 仍由 `tools/make_audio.py` 在仓库内合成，与本目录无关。

`tools/make_audio.py` 从这些文件重新生成 `assets/audio/<id>.mp3`；任何一个源缺失都会打印原因并非 0 退出，不会回退到合成音。

## 源文件

| 输出 | 源文件 | 原始文件 | 作者 | 授权 | 来源 | 源时长 | 源规格 | sha1 / 字节 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `purr.mp3` | `purring-cat-mysid.oga` | `Purring_cat.oga` | Mysid | Public Domain（作者声明 worldwide public domain） | https://commons.wikimedia.org/wiki/File:Purring_cat.oga | 9.794 s | Ogg Vorbis 22.05 kHz 立体声 | `f0b31dbfaf55e3a2b09404e0da23b5b19d952b5f` / 106,560 B |
| `meow.mp3` | `meow-short-tsester.flac` | `2015-11-24.νιαούρισμα.Νιάου.noise_reduced.flac` | Tsester | CC0（Public Domain Dedication） | https://commons.wikimedia.org/wiki/File:2015-11-24.%CE%BD%CE%B9%CE%B1%CE%BF%CF%8D%CF%81%CE%B9%CF%83%CE%BC%CE%B1.%CE%9D%CE%B9%CE%AC%CE%BF%CF%85.noise_reduced.flac | 1.155 s | FLAC 48 kHz 单声道 | `388c9382d4bc4a704ed9223eece8e0add3e232b1` / 31,346 B |
| `happy.mp3` | `meow-happy-miquilena.ogg` | `Maullido_de_gata_hembra_joven.ogg` | George Miquilena | CC0（Public Domain Dedication） | https://commons.wikimedia.org/wiki/File:Maullido_de_gata_hembra_joven.ogg | 1.174 s | Ogg Vorbis 44.1 kHz 立体声 | `ada9a9fefb1a46690e5cc3413eebfc0f9be9fc82` / 26,917 B |
| `meow-long.mp3` | `meow-long-heismark.oga` | `Meow_of_a_pleading_cat.oga` | Heismark | Public domain | https://commons.wikimedia.org/wiki/File:Meow_of_a_pleading_cat.oga | 11.884 s | Ogg Vorbis 8 kHz 单声道 | `337a0fc263567775dcf5e9d65a0e80f9e115712b` / 33,297 B |
| `trill.mp3` | `trill-jsbarrett.mp3` | Freesound 200336 `Cat trilling`（HQ preview） | jsbarrett | CC0 | https://freesound.org/people/jsbarrett/sounds/200336/ | 14.174 s | MP3 44.1 kHz 单声道 | `25fe2c2c52e0afd1dbf865a668026e4dbae3e058` / 307,170 B |

- 下载日期：2026-11-22。
- CC0 / Public Domain 仍在此署名，便于追溯；这些授权不要求署名，但不影响记录作者与出处。
- `meow` 的有声段是 0.212–0.875 s；`meow-long` 取 9.40–11.37 s（长喵）；`trill` 取 3.48–4.18 s（颤音）；`happy` 用整段（1.174 s）；`purr` 取 0.5–3.5 s。

## 处理命令

每个源都用同一条命令：先截取，再下混单声道并 `loudnorm` 到统一响度（`I=-18:TP=-6:LRA=7`），最后转 44.1 kHz 单声道 64 kbps MP3。先下混再归一化，避免 loudnorm 按立体声限峰、下混后峰值又抬高。

```sh
ffmpeg -hide_banner -loglevel error -y -ss <start> -t <dur> -i assets/audio/source/<file> \
  -af "aformat=sample_rates=44100:channel_layouts=mono,loudnorm=I=-18:TP=-6:LRA=7" \
  -ac 1 -ar 44100 -codec:a libmp3lame -b:a 64k -fflags +bitexact -flags:a +bitexact \
  -map_metadata -1 -id3v2_version 0 assets/audio/<id>.mp3
```

各文件的截取参数：

| 输出 | `-ss` | `-t` |
| --- | --- | --- |
| `purr.mp3` | 0.5 | 3.0 |
| `meow.mp3` | 0.212 | 0.663 |
| `happy.mp3` | 0 | 1.174 |
| `meow-long.mp3` | 9.40 | 1.97 |
| `trill.mp3` | 3.48 | 0.70 |

## 成品实测

`ffprobe` + `ebur128`（2026-11-22，本机 ffmpeg）：

| 文件 | 时长 | 字节 | 集成响度 |
| --- | --- | --- | --- |
| `purr.mp3` | 3.000 s | 24,449 | -23.4 LUFS |
| `meow.mp3` | 0.663 s | 5,850 | -18.4 LUFS |
| `happy.mp3` | 1.152 s | 9,821 | -18.4 LUFS |
| `meow-long.mp3` | 1.970 s | 16,299 | -19.2 LUFS |
| `trill.mp3` | 0.700 s | 6,059 | -19.8 LUFS |

5 个猫叫合计 62,478 B（≤100 KiB）；加 `bgm.mp3` 256,416 B 共 318,894 B（≤500 KiB）。

`purr` 是持续底噪、波峰因数高，`TP=-6` 的约束下单遍 loudnorm 到不了 -18，因此停在 -23.4 LUFS，比 4 个一次性猫叫轻 4–6 LU；这是有意的混音差（呼噜垫底、喵叫突出）。
