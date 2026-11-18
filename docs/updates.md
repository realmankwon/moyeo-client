# 새 버전 알림과 수동 다운로드

0.14.6은 Windows NSIS 설치형과 Mac Apple Silicon·Intel PKG/DMG/ZIP을 제공합니다. 두 운영체제 모두 새 버전을 알려주고 다운로드 페이지를 여는 방식입니다. 자동으로 앱 파일을 내려받거나 교체·설치·재시작하지 않습니다. 포터블 배포는 중단했습니다.

## 사용자 흐름

앱 실행 약 2초 뒤와 1분마다 GitHub의 최신 정식 릴리스를 확인합니다. 설정의 **새 버전 안내 → 새 버전 확인**에서도 요청할 수 있습니다. 현재보다 높은 버전이고 해당 운영체제·CPU용 설치 파일이 업로드된 경우 로그인 화면과 채팅 화면 상단에 알림을 표시합니다.

**다운로드 페이지 열기**를 누르면 기본 브라우저에서 해당 GitHub 릴리스 페이지를 엽니다. Windows는 설치 EXE, Mac은 자신의 CPU용 PKG(권장), DMG 또는 ZIP을 선택해 내려받고 직접 설치하세요. PKG는 설치 과정에서 실행 중인 앱의 종료를 확인합니다. DMG·ZIP으로 복사할 때는 트레이/메뉴 막대에서 앱을 완전히 종료합니다. 앱 안에서는 설치 명령을 실행하거나 재시작을 요청하지 않습니다. 작성 중인 메시지도 알림 때문에 사라지지 않습니다.

## GitHub 저장소 설정

기본 조회 대상은 `package.json`의 `releaseRepository` 값인 `realmankwon/moyeo-client`입니다. 다른 공개 릴리스 저장소를 사용할 때만 빌드 환경 변수로 변경합니다.

```sh
export MOYEO_UPDATE_REPOSITORY=OWNER/PUBLIC_RELEASE_REPOSITORY
npm run release:all
```

조회 주소는 `https://api.github.com/repos/OWNER/REPO/releases/latest`입니다. 공개 리소스만 요청하므로 GitHub 토큰이 필요하지 않습니다. 앱에 토큰을 넣지 않습니다. Mattermost 서버 주소·로그인 정보·대화도 이 요청에 포함하지 않습니다. 기본 브라우저로 여는 주소는 설정된 저장소와 검증한 버전 태그로 직접 구성하며, 릴리스 응답의 임의 URL은 사용하지 않습니다.

저장소가 비공개이거나 공개된 정식 릴리스가 없으면 설정에 조회 불가 안내를 표시합니다. 초안·사전 릴리스·현재와 같은 버전·구버전은 새 버전으로 알리지 않습니다. 해당 OS/CPU용 파일이 없으면 준비 중으로 표시합니다. 일시적인 네트워크 오류나 API 요청 제한이 있어도 채팅은 계속 사용할 수 있습니다.

이 문서와 빌드 명령은 저장소의 공개 전환·GitHub 릴리스 게시를 수행하지 않습니다. 배포 파일에서도 Electron 앱 코드는 추출할 수 있으므로 소스에 회사 고유 정보나 키를 추가했다면 공개 전에 검토해야 합니다. 사용자 설정·암호화 토큰·캐시·실제 대화 파일은 패키지에 넣지 않습니다.

## 자동 확인과 알림

0.14.5부터 실행 약 2초 뒤와 1분마다 확인합니다. 메인 창의 focus/show/restore, 앱 activate, 시스템 resume 때도 확인하며, 30초 안의 연속 이벤트는 중복 요청하지 않습니다. 이전 버전의 4시간 조회 주기는 기존 실행 파일에 남아 있으므로 이 개선은 0.14.5를 한 번 설치해야 적용됩니다.

배포의 `moyeo-release.json`을 GitHub 공개 다운로드 경로에서 읽습니다. 이 파일은 버전 태그와 설치 파일 이름만 포함하며 바이너리 다운로드가 아닙니다. [GitHub REST의 비인증 IP별 요청 제한](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)을 피하기 위해 정상 조회에는 REST API를 사용하지 않습니다. 메타데이터가 없는 이전 배포는 REST API로 호환 조회하며 자동 대체 조회는 30분 간격과 서버의 제한 해제 시각을 따릅니다.

앱이 뒤에 있으면 새 버전별로 한 번 OS 알림을 요청합니다. 알림을 클릭하면 메신저가 열립니다. OS가 알림을 허용하지 않아도 메인 창 상단 배너로 확인할 수 있습니다. 이미 발견한 새 버전은 조회가 일시적으로 실패해도 다운로드 안내를 유지합니다.

## 빌드와 검증

Node.js 22.12 이상이 필요합니다. Mac 패키지는 macOS에서 서명·검증합니다.

```sh
npm ci
npm run check
npm test
npm run test:updates
npm run release:all
npm run verify:release
```

각 플랫폼만 만들 때는 `npm run dist:win`, `npm run dist:mac`을 사용합니다. 출력은 `dist/release`입니다.

- `Moyeo-VERSION-Setup-x64.exe`
- `Moyeo-VERSION-mac-arm64.pkg` (권장), `.dmg`, `.zip`
- `Moyeo-VERSION-mac-x64.pkg` (권장), `.dmg`, `.zip`

`npm run release:preview`는 `dist/preview`에 새 버전 확인을 비활성화한 테스트 패키지를 생성합니다. 검증할 때는 `npm run verify:release -- --preview`를 사용합니다.

Mac은 기본적으로 앱과 중첩 코드를 ad-hoc 서명합니다. **새 버전 알림과 다운로드 안내에 Developer ID 인증서는 필요하지 않습니다.** ad-hoc 서명은 Developer ID 신뢰나 Apple 공증을 제공하지 않으므로 최초 실행이 차단되면 macOS의 개인정보 보호 및 보안에서 실행을 허용해야 할 수 있습니다. 실제 Mac 실행이나 Apple 공증을 수행했다고 검증 없이 표현하지 않습니다.

추후 정식 서명을 원한다면 `MOYEO_MAC_SIGNED=1`과 Developer ID 인증서(`CSC_LINK`/`CSC_KEY_PASSWORD` 또는 키체인의 `CSC_NAME`), 공증 자격 증명(`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` 또는 App Store Connect API 키)을 별도로 준비합니다. 비밀키·암호를 저장소에 커밋하지 않습니다. Windows Authenticode 서명도 `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`로 선택적으로 설정할 수 있습니다.

## GitHub Releases 게시

1. 버전을 올리고 Windows와 두 Mac 패키지를 같은 소스로 빌드·검증합니다.
2. 조회 대상 저장소에 `vVERSION` 태그의 Draft release를 만듭니다.
3. 위의 설치 파일과 `moyeo-release.json`을 모두 업로드합니다. 통합 빌드가 이 메타데이터를 생성합니다. OS별 빌드를 합친 경우 `node scripts/release-manifest.cjs`로 전체 파일을 확인한 후 생성하세요. `latest.yml`, `latest-mac.yml`, blockmap은 이 알림 방식에 필요하지 않습니다. 인증서·사용자 데이터·테스트 결과·unpacked 폴더·빌드 로그는 올리지 않습니다.
4. 전체 파일을 확인한 뒤 정식 릴리스로 게시합니다. 파일 이름의 버전은 태그 버전과 일치해야 합니다.
5. 이전 설치 앱에서 알림과 다운로드 페이지가 열리는지 Windows와 두 Mac 아키텍처에서 확인합니다.

`.github/workflows/release-build.yml`은 수동 실행으로 Windows·Mac 빌드 및 검증 후 Actions artifacts에 파일을 보관합니다. `production`은 버전 조회를 활성화하고 `preview`는 비활성화합니다. 저장소 변수 `MOYEO_UPDATE_REPOSITORY`가 비어 있으면 위 기본 저장소를 사용합니다. Mac 서명 인증서와 공증은 기본 빌드에 요구하지 않습니다. Windows·Mac 빌드가 모두 성공하면 `release-metadata` 작업이 전체 설치 파일을 합쳐 `moyeo-release.json`을 생성합니다. 게시할 때 이 메타데이터 artifact도 함께 사용하세요. 이 워크플로는 공개 게시를 하지 않습니다.

## 설치 중 실행 중인 앱 처리

Mac은 `.pkg` 설치 파일을 권장합니다. Apple Installer의 [`must-close` 규칙](https://developer.apple.com/library/archive/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html)을 통해 `com.moyeo.mattermost` 종료를 확인한 뒤 `/Applications/Moyeo.app`을 교체합니다. 설치 후에는 앱을 직접 다시 실행합니다. PKG는 Developer ID Installer 서명과 공증이 없으므로 macOS 보안 승인이 필요할 수 있습니다.

DMG·ZIP을 사용하는 경우에는 앱을 완전히 종료한 뒤 복사하세요. 창을 닫는 동작은 앱을 숨기므로 교체 전에 메뉴 막대·트레이의 **완전히 종료** 또는 새 버전 안내의 **설치를 위해 완전히 종료**를 사용합니다. 종료 버튼은 확인 대화상자에 동의했을 때만 종료하며, 다운로드 페이지를 여는 동작만으로 앱을 종료하지 않습니다. Windows는 NSIS 설치 파일로 교체합니다.

## 데이터 유지와 이전 버전

Windows 데이터는 `%APPDATA%/moyeo-mattermost-client`, Mac 데이터는 `~/Library/Application Support/moyeo-mattermost-client`에 보관합니다. 설치 파일을 교체해도 이 경로를 유지하며 Windows 제거 프로그램은 사용자 데이터를 삭제하지 않도록 설정했습니다.

이전 포터블 사용자는 로그인 전 **화면 및 브랜드 설정 → 이전 포터블 데이터 가져오기**에서 기존 EXE 옆 `Data`를 선택합니다. 설정 JSON과 암호화된 `login.bin`만 가져오고 현재 파일은 덮어쓰지 않습니다. 로그인 정보는 같은 OS 사용자 계정에서만 복원할 수 있습니다. 캐시·실행 파일은 복사하지 않습니다. 로그인 기억 기능의 Keychain 사용은 버전 알림 기능과 별개입니다.

이전에 배포한 0.13.x와 테스트용 0.14.0에는 이 알림 기능이 없거나 꺼져 있으므로 0.14.6로 최초 한 번 수동 교체해야 합니다.

## 테스트 범위

- `npm test`: Windows/Mac CPU별 릴리스 선택, 의미상 버전 비교, 초안·사전 릴리스 제외, 오류 복구, 안전한 URL 구성, 데이터 이전과 기존 회귀.
- `npm run test:updates`: 로컬 실제 HTTP 응답으로 버전 조회·기본 브라우저 전달·오류 처리를 검증합니다. 바이너리 다운로드나 설치는 수행하지 않습니다.
- `MOYEO_EXECUTABLE=/path/to/Moyeo.app/Contents/MacOS/Moyeo node tests/updates-ui.cjs`: 실제 패키지의 조회 서비스와 IPC·알림·다운로드 안내·레이아웃·휠·방향키를 검증합니다. 네트워크 응답과 브라우저 열기만 테스트 대체 구현을 사용합니다.
- `npm run test:ui`: 메신저 기능 회귀입니다. 암호화 저장소와 활성 창 판정은 테스트 대체 구현이며 실제 Keychain·DPAPI·OS 포커스 검증을 대신하지 않습니다.
- `npm run verify:release`: 소스·알림 모드·사용자 데이터 제외·Windows 런타임 CPU·Mac ZIP 무결성·실행 권한·심볼릭 링크·CPU·네이티브 서명·DMG·PKG의 종료 대상과 설치 경로 및 페이로드를 검사합니다. Windows 실행과 Apple Silicon 실행을 검사 없이 수행했다고 주장하지 않습니다.
