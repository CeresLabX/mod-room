#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'node_modules', 'modplayer');
const files = [
  path.join(root, 'Protracker.ts'),
  path.join(root, 'cjs', 'Protracker.js'),
  path.join(root, 'ModWorkletProcessor.ts'),
  path.join(root, 'cjs', 'ModWorkletProcessor.js'),
];

function replaceOnce(file, from, to) {
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes(to)) return;
  if (!s.includes(from)) {
    throw new Error(`Patch anchor not found in ${file}: ${from.slice(0, 80)}`);
  }
  s = s.replace(from, to);
  fs.writeFileSync(file, s);
}

// Add a 16-slot channel mute mask. MODs can be 4/6/8/28 channel; this request
// needs 16 visible controls, so controls beyond the loaded channel count are
// harmless no-ops.
for (const file of [files[0], files[1]]) {
  if (!fs.existsSync(file)) continue;
  if (file.endsWith('Protracker.ts')) {
    replaceOnce(
      file,
      '  chvu: Float32Array = new Float32Array(0);',
      '  chvu: Float32Array = new Float32Array(0);\n  channelMute: boolean[] = new Array(16).fill(false);'
    );
  } else {
    replaceOnce(
      file,
      'this.chvu = new Float32Array(0);',
      'this.chvu = new Float32Array(0);\n        this.channelMute = new Array(16).fill(false);'
    );
  }
  replaceOnce(
    file,
    'outp[och] += f;',
    'if (!mod.channelMute || !mod.channelMute[ch]) outp[och] += f;'
  );
  replaceOnce(
    file,
    'mod.chvu[ch] = Math.max(mod.chvu[ch], Math.abs(f));',
    'mod.chvu[ch] = Math.max(mod.chvu[ch], (!mod.channelMute || !mod.channelMute[ch]) ? Math.abs(f) : 0);'
  );
}

for (const file of [files[2], files[3]]) {
  if (!fs.existsSync(file)) continue;
  if (file.endsWith('.ts')) {
    replaceOnce(
      file,
      '    } else {\n      throw new Error("Unable to parse buffer");\n    }\n  }',
      '    } else {\n      throw new Error("Unable to parse buffer");\n    }\n\n    this.port.onmessage = (event) => {\n      const data = event.data || {};\n      if (data.type === "set-channel-muted") {\n        const channel = Math.max(0, Math.min(15, Number(data.channel) || 0));\n        if (!this.player.channelMute) this.player.channelMute = new Array(16).fill(false);\n        this.player.channelMute[channel] = Boolean(data.muted);\n      }\n    };\n  }'
    );
  } else {
    replaceOnce(
      file,
      '        return _this;\n    }',
      '        _this.port.onmessage = function (event) {\n            var data = event.data || {};\n            if (data.type === "set-channel-muted") {\n                var channel = Math.max(0, Math.min(15, Number(data.channel) || 0));\n                if (!_this.player.channelMute)\n                    _this.player.channelMute = new Array(16).fill(false);\n                _this.player.channelMute[channel] = Boolean(data.muted);\n            }\n        };\n        return _this;\n    }'
    );
  }
}

console.log('modplayer channel-mute patch applied');
