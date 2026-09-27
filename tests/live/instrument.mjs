// Test instrumentation injected before any app code runs. Measures Web Audio
// output and realtime channel churn without changing app behaviour.
export function instrument(cfg) {
  const { label, sublabel, accent } = cfg;
  const state = { samples: [], oscStarts: [], resubscribes: 0, subscribed: 0, audioStartedAt: null };
  window.__probe = state;

  const origLog = console.log;
  console.log = function (...args) {
    const text = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
    if (text.includes('Cleaning up realtime subscription')) state.resubscribes += 1;
    if (text.includes('Successfully subscribed to realtime updates')) state.subscribed += 1;
    return origLog.apply(this, args);
  };

  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const result = origConnect.call(this, dest, ...rest);
    try {
      const ctx = this.context;
      if (ctx && dest === ctx.destination) {
        if (!ctx.__tapAnalyser) {
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          ctx.__tapAnalyser = analyser;
          const buf = new Float32Array(analyser.fftSize);
          setInterval(() => {
            if (ctx.state !== 'running') return;
            analyser.getFloatTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
            state.samples.push({ t: Date.now(), rms: Math.sqrt(sum / buf.length) });
          }, 25);
        }
        origConnect.call(this, ctx.__tapAnalyser);
      }
    } catch {
      /* instrumentation must never break the app under test */
    }
    return result;
  };

  const origOscStart = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (...args) {
    state.oscStarts.push(Date.now());
    return origOscStart.apply(this, args);
  };

  window.__markAudioStarted = () => {
    state.audioStartedAt = Date.now();
  };

  const paint = () => {
    let hud = document.getElementById('probe-hud');
    if (!hud) {
      if (!document.body) {
        requestAnimationFrame(paint);
        return;
      }
      hud = document.createElement('div');
      hud.id = 'probe-hud';
      hud.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'right:0',
        'z-index:2147483647',
        'font:600 15px ui-monospace,SFMono-Regular,Menlo,monospace',
        'color:#fff',
        'background:rgba(0,0,0,0.93)',
        `border-bottom:3px solid ${accent}`,
        'padding:9px 14px',
        'pointer-events:none',
      ].join(';');
      hud.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px">' +
        `<span style="color:${accent};font-size:17px">${label}</span>` +
        `<span style="opacity:.75;font-size:13px">${sublabel}</span>` +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:8px">' +
        '<span style="width:118px;opacity:.75">AUDIO OUT</span>' +
        '<div style="flex:1;height:17px;background:#1b1b1b;border:1px solid #333;border-radius:3px;overflow:hidden">' +
        `<div id="probe-meter" style="height:100%;width:0%;background:${accent}"></div></div>` +
        '<span id="probe-notes" style="width:120px;text-align:right"></span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:6px">' +
        '<span style="width:118px;opacity:.75">REALTIME</span>' +
        '<span id="probe-rt" style="flex:1"></span>' +
        '</div>';
      document.body.appendChild(hud);
      document.body.style.paddingTop = '104px';
    }

    const now = Date.now();
    const rms = state.samples.filter((s) => now - s.t < 130).reduce((m, s) => Math.max(m, s.rms), 0);
    const meter = document.getElementById('probe-meter');
    if (meter) meter.style.width = `${Math.min(100, rms * 320).toFixed(1)}%`;

    const notes = state.audioStartedAt
      ? state.oscStarts.filter((t) => t > state.audioStartedAt + 1500).length
      : 0;
    const notesEl = document.getElementById('probe-notes');
    if (notesEl) notesEl.textContent = `${notes} note starts`;

    const rt = document.getElementById('probe-rt');
    if (rt) {
      const bad = state.resubscribes > 1;
      rt.innerHTML =
        `<span style="color:${bad ? '#ff5f56' : '#35d07f'}">` +
        `channel joins: ${state.subscribed} &nbsp;·&nbsp; teardowns: ${state.resubscribes}` +
        '</span>';
    }
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
}
