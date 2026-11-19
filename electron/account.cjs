const {validId}=require('./client.cjs');
const editable={nickname:64,first_name:64,last_name:64,position:128,email:254};
class AccountService {
 constructor(client){this.client=client;}
 async current(){if(!this.client.me)throw Error('먼저 로그인해 주세요.');const epoch=this.client.mediaKey,id=this.client.me.id,user=(await this.client.request('/users/me')).data;this.assert(epoch,id);if(user.id!==id)throw Error('현재 계정을 확인할 수 없습니다.');return {user,epoch,id};}
 assert(epoch,id){if(epoch!==this.client.mediaKey||id!==this.client.me?.id)throw Error('계정이 변경되었습니다. 다시 시도해 주세요.');}
 public(user){const value={};for(const key of ['id','username','nickname','first_name','last_name','position','email','locale','auth_service','last_picture_update'])value[key]=user[key]??'';return this.client.withAvatar(value);}
 async profile(){const {user}=await this.current();return this.public(user);}
 async save(values){if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(key=>!Object.hasOwn(editable,key)))throw Error('수정할 프로필 항목을 확인해 주세요.');const patch={};for(const [key,value]of Object.entries(values)){if(typeof value!=='string'||value.length>editable[key])throw Error('프로필 입력 길이를 확인해 주세요.');patch[key]=value.trim();}if(patch.email!==undefined&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email))throw Error('이메일 주소를 확인해 주세요.');const {epoch,id}=await this.current();validId(id);const result=(await this.client.request('/users/'+id+'/patch',{method:'PUT',body:patch})).data;this.assert(epoch,id);if(result.id!==id)throw Error('프로필 저장 결과를 확인할 수 없습니다.');this.client.me={...this.client.me,...result};return this.public(result);}
 async password(currentPassword,newPassword){if(typeof currentPassword!=='string'||!currentPassword||currentPassword.length>1024||typeof newPassword!=='string'||!newPassword||newPassword.length>1024)throw Error('현재 비밀번호와 새 비밀번호를 확인해 주세요.');const {user,epoch,id}=await this.current();if(user.auth_service)throw Error('외부 인증 계정의 비밀번호는 해당 인증 서비스에서 변경해 주세요.');await this.client.request('/users/'+validId(id)+'/password',{method:'PUT',body:{current_password:currentPassword,new_password:newPassword}});this.assert(epoch,id);return true;}
}
module.exports={AccountService};
