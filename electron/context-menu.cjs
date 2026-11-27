// Native edit menu for text fields: spelling suggestions plus cut/copy/paste.
// Message bubbles keep their own in-page menu because they cancel the event.
function attachContextMenu(electron, window) {
  const { Menu } = electron, contents = window.webContents;
  try {
    const available = contents.session.availableSpellCheckerLanguages || [];
    const wanted = ['ko', 'en-US'].filter(code => available.includes(code));
    if (wanted.length && process.platform !== 'darwin') contents.session.setSpellCheckerLanguages(wanted);
  } catch { /* Spell checking is optional. */ }
  contents.on('context-menu', (_event, params) => {
    const items = [];
    if (params.isEditable) {
      for (const word of (params.dictionarySuggestions || []).slice(0, 6)) items.push({ label: word, click: () => contents.replaceMisspelling(word) });
      if (params.misspelledWord) items.push({ label: '사전에 추가', click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }, { type: 'separator' });
      items.push({ label: '실행 취소', role: 'undo', enabled: params.editFlags.canUndo }, { label: '다시 실행', role: 'redo', enabled: params.editFlags.canRedo }, { type: 'separator' },
        { label: '잘라내기', role: 'cut', enabled: params.editFlags.canCut }, { label: '복사', role: 'copy', enabled: params.editFlags.canCopy },
        { label: '붙여넣기', role: 'paste', enabled: params.editFlags.canPaste }, { type: 'separator' }, { label: '전체 선택', role: 'selectAll', enabled: params.editFlags.canSelectAll });
    } else if (params.selectionText?.trim()) items.push({ label: '복사', role: 'copy' });
    if (items.length && !window.isDestroyed()) Menu.buildFromTemplate(items).popup({ window });
  });
}
module.exports = { attachContextMenu };
