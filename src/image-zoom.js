const ImageZoom = (() => {
  const steps = [10, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500];
  function fit(width, height, availableWidth, availableHeight) {
    if (![width, height, availableWidth, availableHeight].every(value => Number.isFinite(value) && value > 0)) return 0;
    return Math.min(1, availableWidth / width, availableHeight / height);
  }
  function step(scale, direction) {
    const percent = scale * 100;
    const next = direction > 0 ? steps.find(value => value > percent + .01) : [...steps].reverse().find(value => value < percent - .01);
    return next === undefined ? scale : next / 100;
  }
  function controls() {
    return '<div class="viewer-zoom-controls" role="toolbar" aria-label="이미지 배율"><button type="button" class="secondary" id="viewer-zoom-out" aria-label="이미지 축소" title="축소 (-)">−</button><output id="viewer-zoom-level" aria-live="polite">화면 맞춤</output><button type="button" class="secondary" id="viewer-zoom-in" aria-label="이미지 확대" title="확대 (+)">+</button><button type="button" class="secondary" id="viewer-actual-size" aria-label="원본 크기 100%" title="원본 크기 (1)">100%</button><button type="button" class="secondary" id="viewer-fit" aria-pressed="true" title="화면에 맞춤 (0)">화면 맞춤</button><small>+ / − · Ctrl/⌘ + 휠</small></div>';
  }
  function mount(dialog) {
    const stage = dialog.querySelector('#viewer-stage'), image = stage?.querySelector('.viewer-image');
    if (!image) return () => {};
    const plane = document.createElement('div'); plane.className = 'viewer-image-plane';
    stage.classList.add('image-zoom-stage'); image.replaceWith(plane); plane.append(image);
    const minus = dialog.querySelector('#viewer-zoom-out'), plus = dialog.querySelector('#viewer-zoom-in');
    const original = dialog.querySelector('#viewer-actual-size'), fitButton = dialog.querySelector('#viewer-fit'), level = dialog.querySelector('#viewer-zoom-level');
    let scale = 1, fitted = true, disposed = false;
    function paint() {
      const ready = image.naturalWidth > 0 && image.naturalHeight > 0;
      level.textContent = ready ? (fitted ? '화면 맞춤 · ' : '') + Math.round(scale * 100) + '%' : '불러오는 중…';
      level.setAttribute('aria-label', ready ? '현재 배율 ' + Math.round(scale * 100) + '%' : '이미지 불러오는 중');
      minus.disabled = !ready || scale <= steps[0] / 100 + .0001;
      plus.disabled = !ready || scale >= steps.at(-1) / 100 - .0001;
      original.disabled = fitButton.disabled = !ready;
      fitButton.setAttribute('aria-pressed', String(fitted));
    }
    function layout() {
      if (disposed || !stage.isConnected || !image.naturalWidth || !image.naturalHeight) { paint(); return; }
      const area = stage.getBoundingClientRect(), previous = image.getBoundingClientRect();
      const x = previous.width ? Math.max(0, Math.min(1, (area.left + stage.clientWidth / 2 - previous.left) / previous.width)) : .5;
      const y = previous.height ? Math.max(0, Math.min(1, (area.top + stage.clientHeight / 2 - previous.top) / previous.height)) : .5;
      if (fitted) scale = fit(image.naturalWidth, image.naturalHeight, stage.clientWidth - 2, stage.clientHeight - 2);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      image.style.width = width + 'px'; image.style.height = height + 'px';
      plane.style.width = Math.max(stage.clientWidth, width) + 'px'; plane.style.height = Math.max(stage.clientHeight, height) + 'px';
      if (fitted) { stage.scrollLeft = 0; stage.scrollTop = 0; }
      else { stage.scrollLeft = image.offsetLeft + x * width - stage.clientWidth / 2; stage.scrollTop = image.offsetTop + y * height - stage.clientHeight / 2; }
      paint();
    }
    function change(direction) { if (!image.naturalWidth || (direction < 0 ? minus.disabled : plus.disabled)) return; scale = step(scale, direction); fitted = false; layout(); }
    minus.onclick = () => change(-1); plus.onclick = () => change(1);
    original.onclick = () => { scale = 1; fitted = false; layout(); };
    fitButton.onclick = () => { fitted = true; layout(); };
    const keydown = event => {
      if (event.altKey || event.target.closest('input,textarea,select,[contenteditable="true"],.document-preview-host')) return;
      if (['+', '='].includes(event.key)) { event.preventDefault(); change(1); }
      else if (['-', '_'].includes(event.key)) { event.preventDefault(); change(-1); }
      else if (event.key === '0') { event.preventDefault(); fitButton.click(); }
      else if (event.key === '1') { event.preventDefault(); original.click(); }
    };
    const wheel = event => { if (!(event.ctrlKey || event.metaKey) || !event.deltaY) return; event.preventDefault(); change(event.deltaY < 0 ? 1 : -1); };
    dialog.addEventListener('keydown', keydown); stage.addEventListener('wheel', wheel, {passive:false});
    image.addEventListener('load', layout);
    const observer = new ResizeObserver(layout); observer.observe(stage);
    paint(); if (image.complete) layout();
    return () => { disposed = true; observer.disconnect(); image.removeEventListener('load', layout); dialog.removeEventListener('keydown', keydown); stage.removeEventListener('wheel', wheel); };
  }
  return {fit, step, controls, mount};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ImageZoom;
