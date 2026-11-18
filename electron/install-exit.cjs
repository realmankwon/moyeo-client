// Exit only after an explicit installation request and a native confirmation.
async function quitForInstall({ app, dialog, win }) {
  const result = await dialog.showMessageBox(win, {
    type: 'question', title: '새 버전 설치 준비',
    message: '설치를 위해 모여를 완전히 종료할까요?',
    detail: '설치 파일을 먼저 다운로드하세요. 전송 중인 메시지를 확인한 뒤 종료해 주세요. 기존 설정과 로그인 정보는 유지됩니다.',
    buttons: ['취소', '완전히 종료'], defaultId: 0, cancelId: 0, noLink: true
  });
  if (result.response !== 1) return false;
  setImmediate(() => app.quit());
  return true;
}
module.exports = { quitForInstall };
