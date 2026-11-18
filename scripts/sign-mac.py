import sys, os, stat, tarfile, tempfile, pathlib, subprocess, zipfile, plistlib, json, hashlib
import importlib.util
spec=importlib.util.spec_from_file_location('signature_check',pathlib.Path(__file__).with_name('verify-mac-signature.py'))
check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check)
source, destination = map(pathlib.Path, sys.argv[1:3])
native = sys.argv[3] == '--native'
if native and sys.platform != 'darwin': raise RuntimeError('Native signing requires macOS')
with tempfile.TemporaryDirectory(prefix='moyeo-mac-sign-') as temporary:
    work=pathlib.Path(temporary); tree=work/'bundle';tree.mkdir()
    if not native:
        with tarfile.open(sys.argv[3]) as archive:
            member=next(item for item in archive if item.isfile() and item.name.split('/')[-1]=='rcodesign')
            signer=work/'rcodesign';signer.write_bytes(archive.extractfile(member).read());signer.chmod(0o755)
    links=[]
    with zipfile.ZipFile(source) as archive:
        for info in archive.infolist():
            relative=pathlib.PurePosixPath(info.filename)
            if relative.is_absolute() or '..' in relative.parts: raise ValueError('Unsafe ZIP path')
            target=tree.joinpath(*relative.parts);mode=info.external_attr>>16
            if stat.S_ISLNK(mode): links.append((target,archive.read(info).decode()));continue
            if info.is_dir(): target.mkdir(parents=True,exist_ok=True)
            else:
                target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(info));target.chmod(stat.S_IMODE(mode) or 0o644)
    for target, value in links:
        resolved=pathlib.Path(os.path.abspath(target.parent/value))
        if os.path.commonpath([str(tree),str(resolved)])!=str(tree): raise ValueError('Unsafe symlink')
        target.parent.mkdir(parents=True,exist_ok=True);target.symlink_to(value)
    entitlements=work/'entitlements.plist'
    entitlements.write_bytes(plistlib.dumps({'com.apple.security.cs.allow-jit':True,'com.apple.security.cs.allow-unsigned-executable-memory':True,'com.apple.security.cs.disable-library-validation':True}))
    app=tree/'Moyeo.app'
    def run(arguments):
        result=subprocess.run([str(signer),*arguments],capture_output=True,text=True)
        if result.returncode: raise RuntimeError(result.stdout[-4000:]+result.stderr[-4000:])
        return result.stdout
    signing=['sign','--entitlements-xml-file',str(entitlements),'--timestamp-url','none']
    for directory, dirs, files in os.walk(app,followlinks=False):
        for name in files:
            file=pathlib.Path(directory)/name
            if file.is_symlink():continue
            with file.open('rb') as stream:magic=stream.read(4)
            if magic in [b'\xcf\xfa\xed\xfe',b'\xca\xfe\xba\xbe']:
                signing.extend(['--entitlements-xml-file',file.relative_to(app).as_posix()+':'+str(entitlements)])
    if native:
        def native_sign(file, executable=False):
            arguments=['/usr/bin/codesign','--force','--sign','-','--timestamp=none']
            if executable: arguments.extend(['--entitlements',str(entitlements)])
            result=subprocess.run([*arguments,str(file)],capture_output=True,text=True)
            if result.returncode: raise RuntimeError(result.stdout[-4000:]+result.stderr[-4000:])
        bundles=[app];machos=[]
        for directory, dirs, files in os.walk(app,followlinks=False):
            base=pathlib.Path(directory)
            if base != app and not base.is_symlink() and base.suffix in ('.app','.framework','.xpc'):
                bundles.append(base)
            for name in files:
                file=base/name
                if file.is_symlink(): continue
                with file.open('rb') as stream: magic=stream.read(4)
                if magic in [b'\xcf\xfa\xed\xfe',b'\xca\xfe\xba\xbe']:
                    machos.append(file)
        # Sign bundle executables through their bundles, after their nested code.
        bundle_executables=set()
        for bundle in bundles:
            info=bundle/('Resources/Info.plist' if bundle.suffix=='.framework' else 'Contents/Info.plist')
            executable=plistlib.loads(info.read_bytes()).get('CFBundleExecutable',bundle.stem)
            file=bundle/executable if bundle.suffix=='.framework' else bundle/'Contents/MacOS'/executable
            bundle_executables.add(file.resolve())
        for file in machos:
            if file.resolve() not in bundle_executables: native_sign(file,file.parent.name=='MacOS')
        for bundle in sorted(bundles,key=lambda file:len(file.parts),reverse=True):
            native_sign(bundle,bundle.suffix in ('.app','.xpc'))
        subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict','--verbose=2',str(app)],check=True)
    else:
        run([*signing,str(app)])
    # Verify Mach-O code page hashes with an independent check in verify-mac.cjs too.
    binaries=[]
    for directory, dirs, files in os.walk(app,followlinks=False):
        for name in files:
            file=pathlib.Path(directory)/name
            if file.is_symlink():continue
            with file.open('rb') as stream: magic=stream.read(4)
            if magic in [b'\xcf\xfa\xed\xfe', b'\xca\xfe\xba\xbe', b'\xfe\xed\xfa\xcf']:
                check.verify_macho(file)
                if file.parent.name=='MacOS':
                    signature=check.verify_slice(file.read_bytes());permissions=plistlib.loads(signature['entitlements'][8:])
                    assert permissions.get('com.apple.security.cs.allow-jit') and permissions.get('com.apple.security.cs.disable-library-validation'),'Missing Electron entitlements'
                binaries.append(file.relative_to(tree).as_posix())
    if not (app/'Contents/_CodeSignature/CodeResources').is_file():raise RuntimeError('Missing bundle resource seal')
    for directory, dirs, files in os.walk(app,followlinks=False):
        if pathlib.Path(directory).name=='_CodeSignature' and 'CodeResources' in files:check.verify_bundle_seal(pathlib.Path(directory)/'CodeResources')
    (tree/'SIGNING-INFO.json').write_text(json.dumps({'kind':'ad-hoc','tool':'Apple codesign' if native else 'rcodesign 0.29.0','nativeVerification':native,'notarized':False,'verifiedMachO':binaries},indent=2)+'\n')
    destination.parent.mkdir(parents=True,exist_ok=True)
    pending=destination.with_suffix('.zip.partial')
    with zipfile.ZipFile(pending,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for directory, dirs, files in os.walk(tree,followlinks=False):
            for name in sorted(dirs+files):
                file=pathlib.Path(directory)/name;relative=file.relative_to(tree).as_posix();mode=file.lstat().st_mode
                if file.is_symlink():
                    info=zipfile.ZipInfo(relative);info.create_system=3;info.external_attr=mode<<16;archive.writestr(info,os.readlink(file).encode())
                else:archive.write(file,relative+('/' if file.is_dir() else ''))
    pending.replace(destination)
    print(f'PASS: pre-signed bundle, {len(binaries)} Mach-O signatures verified: {destination.name}')
