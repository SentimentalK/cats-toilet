(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CatRich = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var BREAKS = '。！？；!?;';

  var KEYWORDS = [
    { cls: 'kw-scoop', words: ['铲便便', '铲屎', '便便', '铲'] },
    { cls: 'kw-points', words: ['新手礼', '积分'] },
    { cls: 'kw-water', words: ['水盆', '加水', '水'] },
    { cls: 'kw-food', words: ['猫粮', '食物', '饭盆', '吃饭', '饭'] },
    { cls: 'kw-mood', words: ['心情', '开心'] },
    { cls: 'kw-shop', words: ['商店', '升级', '买'] },
  ];

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function splitSentences(line) {
    var out = [];
    var start = 0;
    for (var i = 0; i < line.length; i++) {
      if (BREAKS.indexOf(line.charAt(i)) < 0) continue;
      var piece = line.slice(start, i + 1);
      if (piece.trim() !== '') out.push(piece);
      start = i + 1;
    }
    var tail = line.slice(start);
    if (tail.trim() !== '') out.push(tail);
    return out;
  }

  function matchAt(text, i) {
    var best = null;
    for (var k = 0; k < KEYWORDS.length; k++) {
      var words = KEYWORDS[k].words;
      for (var w = 0; w < words.length; w++) {
        var word = words[w];
        if (text.substr(i, word.length) !== word) continue;
        if (!best || word.length > best.word.length) best = { cls: KEYWORDS[k].cls, word: word };
      }
    }
    return best;
  }

  function highlight(text) {
    var parts = [];
    var plain = '';
    var i = 0;
    while (i < text.length) {
      var hit = matchAt(text, i);
      if (!hit) {
        plain += text.charAt(i);
        i++;
        continue;
      }
      if (plain) {
        parts.push({ text: plain, cls: null });
        plain = '';
      }
      parts.push({ text: hit.word, cls: hit.cls });
      i += hit.word.length;
    }
    if (plain) parts.push({ text: plain, cls: null });
    if (!parts.length) parts.push({ text: '', cls: null });
    return parts;
  }

  function toLines(text) {
    var lines = String(text).split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var segments = splitSentences(lines[i]);
      for (var s = 0; s < segments.length; s++) {
        out.push({ text: segments[s], parts: highlight(segments[s]) });
      }
    }
    return out;
  }

  function toHtml(text) {
    var lines = toLines(text);
    var html = '';
    for (var i = 0; i < lines.length; i++) {
      html += '<span class="seg">';
      var parts = lines[i].parts;
      for (var p = 0; p < parts.length; p++) {
        if (parts[p].cls) html += '<span class="kw ' + parts[p].cls + '">' + escapeHtml(parts[p].text) + '</span>';
        else html += escapeHtml(parts[p].text);
      }
      html += '</span>';
    }
    return html;
  }

  function toText(text) {
    return String(text).split('\n').map(function (line) {
      return splitSentences(line).join('');
    }).join('\n');
  }

  return {
    escapeHtml: escapeHtml,
    KEYWORDS: KEYWORDS,
    toLines: toLines,
    toHtml: toHtml,
    toText: toText,
  };
});
