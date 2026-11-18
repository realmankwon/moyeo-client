(function (root) {
  const ext = file => String(file.extension || file.name?.split('.').pop() || '').toLowerCase().replace(/^\./, '');
  const inList = (value, list) => list.split(' ').includes(value);
  const isText = file => /^text\//.test(file.mime_type || '') || inList(ext(file), 'txt md csv tsv json xml log js ts jsx tsx css html htm py java c cpp h cs go rs sh ps1 sql yaml yml ini toml conf');
  function classify(file) {
    const e = ext(file), mime = file.mime_type || '';
    if (mime.startsWith('image/') || inList(e, 'jpg jpeg png gif webp avif bmp svg heic heif tif tiff')) return 'image';
    if (mime.startsWith('video/') || inList(e, 'mp4 webm mov mkv avi m4v wmv mpg mpeg')) return 'video';
    if (mime.startsWith('audio/') || inList(e, 'mp3 wav ogg m4a aac flac opus')) return 'audio';
    if (inList(e, 'xls xlsx xlsm ods csv tsv') || /spreadsheet|excel/.test(mime)) return 'sheet';
    if (inList(e, 'ppt pptx odp key') || /presentation|powerpoint/.test(mime)) return 'slide';
    if (inList(e, 'zip rar 7z tar gz bz2 xz tgz') || /zip|compressed|archive/.test(mime)) return 'archive';
    if (inList(e, 'pdf doc docx odt rtf hwp hwpx pages txt md') || /pdf|word|opendocument.text/.test(mime)) return 'document';
    if (isText(file)) return 'code';
    return 'other';
  }
  const labels = { image: '사진', video: '동영상', audio: '음악·음성', document: '문서·PDF', sheet: '스프레드시트', slide: '프레젠테이션', archive: '압축 파일', code: '코드·텍스트', other: '기타' };
  const previewType = file => ext(file)==='pdf'||file.mime_type==='application/pdf'?'pdf':inList(ext(file),'docx xlsx pptx hwpx')?ext(file):isText(file)?'text':null;
  const canOpen = file => inList(ext(file),'pdf doc docx odt rtf hwp hwpx pages txt md csv tsv xls xlsx xlsm ods ppt pptx odp key jpg jpeg png gif webp bmp tif tiff heic heif mp4 webm mov mkv m4v mp3 wav ogg m4a aac flac opus');
  const api = { ext, classify, isText, labels, previewType, canOpen };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FileTypes = api;
})(globalThis);
