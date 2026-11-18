const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),target=path.join(root,'src/vendor');await fs.mkdir(target,{recursive:true});
 for(const name of ['pdf.mjs','pdf.worker.mjs']){await fs.mkdir(path.join(target,'pdfjs'),{recursive:true});await fs.copyFile(path.join(root,'node_modules/pdfjs-dist/build',name),path.join(target,'pdfjs',name));}
 for(const name of ['cmaps','standard_fonts','wasm'])await fs.cp(path.join(root,'node_modules/pdfjs-dist',name),path.join(target,'pdfjs',name),{recursive:true});
 await fs.copyFile(path.join(root,'node_modules/pdfjs-dist/LICENSE'),path.join(target,'pdfjs/LICENSE'));
 await fs.copyFile(path.join(root,'node_modules/fflate/umd/index.js'),path.join(target,'fflate.js'));
 await fs.copyFile(path.join(root,'node_modules/fflate/LICENSE'),path.join(target,'fflate-LICENSE.txt'));
 console.log('Local PDF and Office preview assets prepared.');
})().catch(error=>{console.error(error);process.exitCode=1;});
