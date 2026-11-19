const AdminFields = {
 storage: { title:'파일 저장소', group:'FileSettings', fields:[
  {key:'DriverName',label:'저장 방식',type:'select',options:[['local','서버 로컬 디스크'],['amazons3','Amazon S3 / 호환 저장소']]},
  {key:'Directory',label:'서버 저장 디렉터리',type:'text',help:'Mattermost 서버 또는 컨테이너 안의 경로입니다.'},
  {key:'MaxFileSize',label:'최대 첨부 크기 (MB)',type:'number',scale:1048576,min:1,max:1048576},
  {key:'EnableFileAttachments',label:'파일 첨부 허용',type:'boolean'},
  {key:'EnableMobileUpload',label:'모바일 업로드 허용',type:'boolean'},
  {key:'EnableMobileDownload',label:'모바일 다운로드 허용',type:'boolean'},
  {key:'ExtractContent',label:'문서 내용 검색',type:'boolean'},
  {key:'ArchiveRecursion',label:'ZIP 안의 문서 내용 검색',type:'boolean'},
  {key:'AmazonS3AccessKeyId',label:'S3 액세스 키 ID',type:'text',when:'amazons3'},
  {key:'AmazonS3SecretAccessKey',label:'S3 비밀 액세스 키',type:'password',when:'amazons3'},
  {key:'AmazonS3Bucket',label:'S3 버킷',type:'text',when:'amazons3'},
  {key:'AmazonS3Region',label:'S3 리전',type:'text',when:'amazons3'},
  {key:'AmazonS3Endpoint',label:'S3 엔드포인트',type:'text',when:'amazons3'},
  {key:'AmazonS3SSL',label:'S3 TLS 사용',type:'boolean',when:'amazons3'},
  {key:'AmazonS3SignV2',label:'S3 서명 V2 사용',type:'boolean',when:'amazons3'},
  {key:'AmazonS3PathPrefix',label:'S3 경로 접두사',type:'text',when:'amazons3'},
  {key:'AmazonS3SSE',label:'S3 서버 측 암호화',type:'boolean',when:'amazons3'}
 ]},
 smtp:{title:'SMTP 메일',group:'EmailSettings',fields:[
  {key:'SendEmailNotifications',label:'이메일 알림 사용',type:'boolean'},
  {key:'SMTPServer',label:'SMTP 서버',type:'text'},
  {key:'SMTPPort',label:'SMTP 포트',type:'port'},
  {key:'EnableSMTPAuth',label:'SMTP 인증 사용',type:'boolean'},
  {key:'SMTPUsername',label:'SMTP 사용자 이름',type:'text'},
  {key:'SMTPPassword',label:'SMTP 비밀번호',type:'password'},
  {key:'ConnectionSecurity',label:'연결 보안',type:'select',options:[['','사용 안 함'],['TLS','TLS'],['STARTTLS','STARTTLS']]},
  {key:'SkipServerCertificateVerification',label:'서버 인증서 검증 생략',type:'boolean'},
  {key:'FeedbackName',label:'보낸 사람 이름',type:'text'},
  {key:'FeedbackEmail',label:'보낸 사람 이메일',type:'email'},
  {key:'ReplyToAddress',label:'회신 이메일',type:'text'},
  {key:'EnableSecurityFixAlert',label:'보안 업데이트 이메일 알림',type:'boolean'},
  {key:'SMTPServerTimeout',label:'SMTP 연결 제한 시간 (초)',type:'number',min:1,max:600}
 ]},
 web:{title:'서버 일반',group:'ServiceSettings',fields:[
  {key:'SiteURL',label:'사이트 주소',type:'url'},
  {key:'ListenAddress',label:'서버 수신 주소',type:'text'},
  {key:'WebsocketURL',label:'WebSocket 주소',type:'text'},
  {key:'EnableUserAccessTokens',label:'개인 액세스 토큰 허용',type:'boolean'},
  {key:'EnableCustomEmoji',label:'사용자 이모지 허용',type:'boolean'},
  {key:'EnableLinkPreviews',label:'링크 미리보기',type:'boolean'},
  {key:'EnablePostUsernameOverride',label:'통합 메시지 사용자 이름 지정 허용',type:'boolean'},
  {key:'EnablePostIconOverride',label:'통합 메시지 아이콘 지정 허용',type:'boolean'}
 ]}
};
if(typeof module!=='undefined'&&module.exports)module.exports=AdminFields;
