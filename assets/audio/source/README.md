# purr.mp3 的源录音

| 项 | 值 |
| --- | --- |
| 仓库内文件 | `assets/audio/source/purring-cat-mysid.oga`（原样保存，未改字节） |
| 原始文件 | `Purring_cat.oga` |
| 作者 | Mysid |
| 来源 | https://commons.wikimedia.org/wiki/File:Purring_cat.oga |
| 授权 | Public Domain（作者声明 worldwide public domain，任何用途、无条件） |
| 录制/上传 | 2007-07-31 |
| 下载日期 | 2026-11-22 |
| 源规格 | Ogg Vorbis，9.794 s，22.05 kHz，立体声 |

`tools/make_audio.py` 从本文件生成 `assets/audio/purr.mp3`，不参与页面播放，也不进 Service Worker 预缓存。其余 4 个猫叫与 `bgm.mp3` 仍由脚本合成。

## 处理命令

截取源文件 0.5–3.5 s，先下混单声道，再用 loudnorm 归一化（受峰值约束未达 -18 LUFS），转 44.1 kHz 64 kbps MP3：

```sh
ffmpeg -hide_banner -loglevel error -y \
  -ss 0.5 -t 3.0 -i assets/audio/source/purring-cat-mysid.oga \
  -af "aformat=sample_rates=44100:channel_layouts=mono,loudnorm=I=-18:TP=-6:LRA=7" \
  -ac 1 -ar 44100 -codec:a libmp3lame -b:a 64k \
  -fflags +bitexact -flags:a +bitexact -map_metadata -1 -id3v2_version 0 \
  assets/audio/purr.mp3
```

结果：3.000 s，24,449 B，单声道 44.1 kHz，`ffprobe` 显示 MPEG audio；成品实测 -23.4 LUFS、峰值 -6.1 dBFS。loudnorm 的目标是 I=-18/TP=-6，这段录音峰值很高，单遍动态归一化在 TP=-6 的约束下达不到 -18 LUFS。
