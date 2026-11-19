const {validId}=require('./client.cjs');
const fields=require('../src/admin-fields.js');
const text=(value,max=256)=>{if(typeof value!=='string'||value.length>max)throw Error('입력한 값을 확인해 주세요.');return value;};
const page=value=>{if(value===undefined)return 0;if(!Number.isInteger(value)||value<0||value>10000)throw Error('페이지를 확인해 주세요.');return value;};
const safeUser=user=>Object.fromEntries(['id','username','nickname','first_name','last_name','email','position','roles','delete_at','create_at','auth_service','last_picture_update'].filter(key=>Object.hasOwn(user,key)).map(key=>[key,user[key]]));
class AdminService{
 constructor(client){this.client=client;}
 async access(){if(!this.client.me)return {available:false,roles:[]};const epoch=this.client.mediaKey,user=(await this.client.request('/users/me')).data;if(epoch!==this.client.mediaKey||user.id!==this.client.me?.id)throw Error('계정이 변경되었습니다.');const roles=String(user.roles||'').split(/\s+/);return {available:roles.includes('system_admin'),roles};}
 async run(action,params={}){
  const epoch=this.client.mediaKey;if(!(await this.access()).available)throw Error('서버 전체 관리는 시스템 관리자만 사용할 수 있습니다.');
  if(!params||typeof params!=='object'||Array.isArray(params))throw Error('관리 요청을 확인해 주세요.');
  const request=async(route,options)=>{if(epoch!==this.client.mediaKey)throw Error('계정이 변경되었습니다.');const result=(await this.client.request(route,options)).data;if(epoch!==this.client.mediaKey)throw Error('계정이 변경되었습니다.');return result;};
  const id=()=>validId(params.id),userId=()=>validId(params.userId);
  const write=(route,body,method='PUT')=>request(route,{method,...(body!==undefined?{body}:{})});
  switch(action){
   case 'users':{const term=text(params.term||'',128),number=page(params.page);const users=term?await write('/users/search',{term,allow_inactive:true,limit:100},'POST'):await request('/users?page='+number+'&per_page=50&sort=username'+(params.status==='active'?'&active=true':params.status==='inactive'?'&inactive=true':''));return {items:users.filter(user=>!term||(params.status==='active'?!user.delete_at:params.status==='inactive'?!!user.delete_at:true)).map(safeUser),more:!term&&users.length===50};}
   case 'user':return safeUser(await request('/users/'+id()));
   case 'userRoles':{const roles=text(params.roles),allowed=['system_user','system_user system_admin'];if(!allowed.includes(roles))throw Error('부여할 역할을 확인해 주세요.');const target=await request('/users/'+id());if(id()===this.client.me.id&&!roles.includes('system_admin'))throw Error('현재 로그인한 관리자의 권한은 이 화면에서 해제할 수 없습니다.');if(String(target.roles||'').split(/\s+/).some(role=>!['system_user','system_admin'].includes(role)))throw Error('게스트·위임 역할 계정은 서버의 전환 정책을 먼저 확인해 주세요.');return write('/users/'+id()+'/roles',{roles});}
   case 'userActive':if(typeof params.active!=='boolean')throw Error('활성화 상태를 확인해 주세요.');if(id()===this.client.me.id)throw Error('현재 로그인한 계정은 비활성화할 수 없습니다.');return write('/users/'+id()+'/active',{active:params.active});
   case 'userEmail':return write('/users/'+id()+'/patch',{email:this.email(params.email)});
   case 'userPassword':if(!params.password)throw Error('새 비밀번호를 입력해 주세요.');if(id()===this.client.me.id)throw Error('본인의 비밀번호는 내 계정 설정에서 변경해 주세요.');return write('/users/'+id()+'/password',{new_password:text(params.password,1024)});
   case 'userSessions':return (await request('/users/'+id()+'/sessions')).map(item=>({id:item.id,create_at:item.create_at,last_activity_at:item.last_activity_at,expires_at:item.expires_at,device_id:item.device_id}));
   case 'revokeSessions':if(id()===this.client.me.id)throw Error('본인의 세션은 이 화면에서 종료할 수 없습니다.');return write('/users/'+id()+'/sessions/revoke/all',{},'POST');
   case 'userTeams':return request('/users/'+id()+'/teams');
   case 'userTokens':return (await request('/users/'+id()+'/tokens?page='+page(params.page)+'&per_page=50')).map(item=>({id:item.id,description:item.description,is_active:item.is_active,user_id:item.user_id}));
   case 'revokeToken':return write('/users/tokens/revoke',{token_id:id()},'POST');
   case 'teams':return request('/teams?page='+page(params.page)+'&per_page=100&include_total_count=true').then(data=>({items:Array.isArray(data)?data:data.teams||[],more:(data.teams||data).length===100}));
   case 'channels':{const data=await write('/channels/search',{term:text(params.term||'',128),page:page(params.page),per_page:50,include_deleted:true},'POST');return {items:Array.isArray(data)?data:data.channels||[],more:Array.isArray(data)?data.length===50:(page(params.page)+1)*50<data.total_count};}
   case 'channel':return request('/channels/'+id());
   case 'channelSave':{const changes={};for(const key of ['display_name','name','header','purpose'])if(Object.hasOwn(params,key))changes[key]=text(params[key],key==='header'||key==='purpose'?1024:64);if(!Object.keys(changes).length)throw Error('변경할 항목을 확인해 주세요.');return write('/channels/'+id()+'/patch',changes);}
   case 'channelPrivacy':if(!['O','P'].includes(params.privacy))throw Error('채널 유형을 확인해 주세요.');return write('/channels/'+id()+'/privacy',{privacy:params.privacy});
   case 'channelArchive':return write('/channels/'+id(),undefined,'DELETE');
   case 'channelRestore':return write('/channels/'+id()+'/restore',{},'POST');
   case 'members':{const kind=this.kind(params.kind),members=await request('/'+kind+'/'+id()+'/members?page='+page(params.page)+'&per_page=50');const users=members.length?await write('/users/ids',members.map(item=>item.user_id),'POST'):[];return {items:members.map(member=>({...member,user:safeUser(users.find(user=>user.id===member.user_id)||{id:member.user_id})})),more:members.length===50};}
   case 'memberAdd':{const kind=this.kind(params.kind);return write('/'+kind+'/'+id()+'/members',{[kind==='teams'?'team_id':'channel_id']:id(),user_id:userId()},'POST');}
   case 'memberRemove':return write('/'+this.kind(params.kind)+'/'+id()+'/members/'+userId(),undefined,'DELETE');
   case 'memberRoles':{const kind=this.kind(params.kind),prefix=kind==='teams'?'team':'channel';if(![prefix+'_user',prefix+'_user '+prefix+'_admin'].includes(params.roles))throw Error('멤버 역할을 확인해 주세요.');return write('/'+kind+'/'+id()+'/members/'+userId()+'/roles',{roles:params.roles});}
   case 'teamSave':return write('/teams/'+id()+'/patch',{display_name:text(params.display_name,64),description:text(params.description||'',255)});
   case 'config':return this.config(request,params.section);
   case 'configSave':{const spec=this.spec(params.section),patch=this.patch(spec,params.values),environment=await request('/config/environment');for(const key of Object.keys(patch))if(environment[spec.group]?.[key])throw Error(key+' 항목은 서버 환경 변수로 고정되어 있습니다.');const result=await write('/config/patch',{[spec.group]:patch});return this.selectConfig(spec,result,environment);}
   case 'testEmail':await write('/email/test',{},'POST');return {message:'현재 서버 설정으로 테스트 메일을 보냈습니다. 관리자 계정의 수신함을 확인해 주세요.'};
   case 'testStorage':{const config=await request('/config');if(config.FileSettings?.DriverName==='local'){const result=await request('/system/ping?get_server_status=true');if(result.filestore_status!=='OK')throw Error('서버 로컬 저장소 검사에 실패했습니다. 저장 경로와 쓰기 권한을 확인해 주세요.');}else await write('/file/s3_test',{},'POST');return {message:'현재 서버 설정으로 저장소 연결을 확인했습니다.'};}
   case 'logs':return request('/logs?page='+page(params.page)+'&per_page=100');
   case 'roles':return write('/roles/names',['system_admin','system_user','system_guest','team_admin','team_user','channel_admin','channel_user'],'POST');
   case 'license':return request('/license/client?format=old');
   default:throw Error('지원하지 않는 관리 작업입니다.');
  }
 }
 kind(value){if(!['channels','teams'].includes(value))throw Error('관리 대상을 확인해 주세요.');return value;}
 email(value){value=text(value,254).trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error('이메일을 확인해 주세요.');return value;}
 spec(section){if(!Object.hasOwn(fields,section))throw Error('설정 항목을 확인해 주세요.');return fields[section];}
 async config(request,section){const spec=this.spec(section),[config,environment]=await Promise.all([request('/config'),request('/config/environment')]);return this.selectConfig(spec,config,environment);}
 selectConfig(spec,config,environment){const values={},configured={},locked={},supported=[];for(const field of spec.fields){if(!Object.hasOwn(config[spec.group]||{},field.key))continue;supported.push(field.key);if(field.type==='password')configured[field.key]=!!config[spec.group][field.key];else values[field.key]=config[spec.group][field.key];locked[field.key]=!!environment[spec.group]?.[field.key];}return {values,configured,locked,supported};}
 patch(spec,values){if(!values||typeof values!=='object'||Array.isArray(values))throw Error('저장할 값을 확인해 주세요.');const patch={};for(const [key,value]of Object.entries(values)){const field=spec.fields.find(item=>item.key===key);if(!field)throw Error('허용되지 않은 설정 항목입니다.');if(field.type==='boolean'){if(typeof value!=='boolean')throw Error(field.label+' 값을 확인해 주세요.');}else if(field.type==='number'){if(!Number.isSafeInteger(value)||value<(field.min||0)*(field.scale||1)||value>(field.max||2147483647)*(field.scale||1))throw Error(field.label+' 범위를 확인해 주세요.');}else{text(value,field.type==='password'?4096:2048);if(field.type==='password'&&!value)continue;if(field.type==='port'&&(!/^\d+$/.test(value)||Number(value)<1||Number(value)>65535))throw Error('포트는 1~65535 사이여야 합니다.');if(field.type==='select'&&!field.options.some(option=>option[0]===value))throw Error(field.label+' 값을 확인해 주세요.');if(field.type==='url'&&value){const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('사이트 주소를 확인해 주세요.');}}patch[key]=value;}if(!Object.keys(patch).length)throw Error('변경된 항목이 없습니다.');return patch;}
}
module.exports={AdminService};
