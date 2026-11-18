import struct,hashlib,plistlib,pathlib

def digest(kind,data):
    if kind==1:return hashlib.sha1(data).digest()
    if kind in (2,3):return hashlib.sha256(data).digest()[:20 if kind==3 else 32]
    if kind==4:return hashlib.sha384(data).digest()
    raise ValueError('Unsupported code hash type')

def verify_slice(data):
    assert data[:4]==b'\xcf\xfa\xed\xfe','Unsupported Mach-O'
    commands=struct.unpack_from('<I',data,16)[0];cursor=32;signature=None
    for _ in range(commands):
        cmd,size=struct.unpack_from('<II',data,cursor)
        if cmd==0x1d:offset,length=struct.unpack_from('<II',data,cursor+8);signature=data[offset:offset+length]
        cursor+=size
    assert signature is not None,'Missing Mach-O signature'
    magic,length,count=struct.unpack_from('>III',signature);assert magic==0xfade0cc0
    blobs={}
    for index in range(count):
        kind,offset=struct.unpack_from('>II',signature,12+index*8);size=struct.unpack_from('>I',signature,offset+4)[0];blobs[kind]=signature[offset:offset+size]
    cd=blobs[0];_,_,version,flags,hash_offset,_,special_slots,code_slots,limit=struct.unpack_from('>9I',cd)
    hash_size,hash_type,_,page=struct.unpack_from('4B',cd,36)
    assert flags&2,'Expected ad-hoc signature'
    for index in range(code_slots):
        page_bytes=data[index*(1<<page):min(limit,(index+1)*(1<<page))]
        assert digest(hash_type,page_bytes)[:hash_size]==cd[hash_offset+index*hash_size:hash_offset+(index+1)*hash_size],f'Code page {index} mismatch'
    for slot in (2,5,7):
        if slot in blobs and slot<=special_slots:assert digest(hash_type,blobs[slot])[:hash_size]==cd[hash_offset-slot*hash_size:hash_offset-(slot-1)*hash_size],f'Special slot {slot} mismatch'
    return {'slots':special_slots,'offset':hash_offset,'size':hash_size,'type':hash_type,'directory':cd,'entitlements':blobs.get(5,b'')}

def verify_macho(file):
    data=pathlib.Path(file).read_bytes()
    if data[:4]==b'\xca\xfe\xba\xbe':
        count=struct.unpack_from('>I',data,4)[0]
        for index in range(count):
            offset,size=struct.unpack_from('>II',data,8+index*20+8);verify_slice(data[offset:offset+size])
    else:verify_slice(data)

def verify_bundle_seal(seal):
    base=seal.parent.parent;value=plistlib.loads(seal.read_bytes())
    for name,record in value.get('files2',{}).items():
        file=base/name
        if 'symlink' in record:assert file.is_symlink() and file.readlink().as_posix()==record['symlink'],name
        elif 'hash2' in record:assert hashlib.sha256(file.read_bytes()).digest()==record['hash2'],name
        elif 'hash' in record:assert hashlib.sha1(file.read_bytes()).digest()==record['hash'],name
