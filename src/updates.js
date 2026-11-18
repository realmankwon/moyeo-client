const appUpdates = (() => {
  if (isFloating) return { mount() {} };
  let current = { enabled: false, phase: 'disabled', version: '', nextVersion: '', platformLabel: '' };
  const messages = {
    disabled: '이 빌드는 새 버전 확인이 비활성화되어 있습니다.', idle: '새 버전을 확인할 수 있습니다.',
    checking: '새 버전을 확인하고 있습니다…', current: '최신 버전입니다.',
    unpublished: '공개된 릴리스를 찾을 수 없습니다. 배포 저장소에 정식 버전이 게시되면 확인할 수 있습니다.',
    pending: '새 버전의 이 운영체제용 설치 파일을 준비 중입니다.', error: '새 버전을 확인하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.'
  };
  function mount(dialog) {
    if (!api?.getUpdateState || $('#update-settings', dialog)) return;
    $('.dialog-footer', dialog).insertAdjacentHTML('beforebegin', '<section class="settings-section" id="update-settings"><p class="section-label">새 버전 안내</p><p id="update-status" role="status"></p><div class="update-actions"><button type="button" class="secondary" id="update-action"></button><button type="button" class="secondary" id="update-quit" hidden>설치를 위해 완전히 종료</button></div></section>');
    paint();
  }
  async function act() {
    try {
      if (current.phase === 'available') await api.openUpdateDownload();
      else await api.checkForUpdates();
    } catch { toast('다운로드 안내를 열지 못했습니다. 다시 시도해 주세요.'); }
  }
  async function quit() {
    try { await api.quitForUpdateInstall(); }
    catch { toast('메뉴 막대 또는 트레이 아이콘에서 완전히 종료한 뒤 설치해 주세요.'); }
  }
  function paint() {
    const label = current.phase === 'available' ? '다운로드 페이지 열기' : '새 버전 확인';
    const status = $('#update-status'), action = $('#update-action');
    const isMac = current.platformLabel.startsWith('Mac');
    const available = isMac ? 'PKG 설치 파일을 먼저 받으세요. 설치 프로그램이 앱 종료를 확인한 뒤 교체합니다. DMG·ZIP은 앱을 완전히 종료한 뒤 교체하세요.' : '설치 파일을 먼저 받으세요. 설치 전에 모여를 완전히 종료하면 기존 앱을 교체할 수 있습니다.';
    if (status) status.textContent = `현재 버전 ${current.version} · ${current.phase === 'available' ? available : messages[current.phase] || ''}`;
    if (action) { action.textContent = label; action.disabled = !current.enabled || current.phase === 'checking'; action.onclick = act; }
    const quitButton = $('#update-quit');
    if (quitButton) { quitButton.hidden = current.phase !== 'available'; quitButton.onclick = quit; }
    const banner = $('#update-banner');
    banner.hidden = current.phase !== 'available';
    $('#update-banner-text').textContent = `새 버전 ${current.nextVersion} · ${current.platformLabel}. ${isMac ? 'PKG 설치 파일을 실행하면 앱 종료를 확인한 뒤 교체합니다.' : '설치 파일을 받은 뒤 모여를 완전히 종료하고 설치하세요.'}`;
    const button = $('#update-banner-action');button.textContent = label;button.onclick = act;
    $('#update-banner-quit').onclick = quit;
  }
  const banner = document.createElement('aside');banner.id = 'update-banner';banner.hidden = true;banner.setAttribute('aria-label', '앱 업데이트');
  banner.innerHTML = '<span id="update-banner-text" role="status"></span><div class="update-actions"><button type="button" id="update-banner-action"></button><button type="button" id="update-banner-quit">설치를 위해 완전히 종료</button></div>';
  document.body.prepend(banner);
  new ResizeObserver(() => document.documentElement.style.setProperty('--update-height', banner.hidden ? '0px' : `${banner.getBoundingClientRect().height}px`)).observe(banner);
  api?.onUpdateState(value => { current = value;paint(); });
  api?.getUpdateState().then(value => { current = value;paint(); }).catch(() => {});
  return { mount };
})();
