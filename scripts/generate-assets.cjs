const fs = require('node:fs');
const path = require('node:path');
const rate = 22050, samples = Math.floor(rate * .48), bytes = Buffer.alloc(44 + samples * 2);
bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length-8,4); bytes.write('WAVEfmt ',8); bytes.writeUInt32LE(16,16); bytes.writeUInt16LE(1,20); bytes.writeUInt16LE(1,22); bytes.writeUInt32LE(rate,24); bytes.writeUInt32LE(rate*2,28); bytes.writeUInt16LE(2,32); bytes.writeUInt16LE(16,34); bytes.write('data',36); bytes.writeUInt32LE(samples*2,40);
for (let i=0;i<samples;i++) { const t=i/rate, start=t<.20?0:.24, dt=t-start, frequency=start?1174.66:880; const envelope=dt>=0&&dt<.20?Math.sin(Math.PI*dt/.20)**2:0; const signal=(Math.sin(2*Math.PI*frequency*dt)+.25*Math.sin(4*Math.PI*frequency*dt))*envelope; bytes.writeInt16LE(Math.round(signal*6500),44+i*2); }
const dir = path.resolve(__dirname,'../src/assets'); fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,'message.wav'),bytes);
console.log('Created message notification sound.');
