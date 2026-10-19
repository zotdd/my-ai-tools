(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('preview'), ctx = canvas.getContext('2d', {alpha:false}), video=$('videoSource');
const state = {file:null, url:null, duration:0, clips:[], ratio:'9:16',fit:'blur', zoom:100,focus:50,title:'',fontSize:48,color:'#ffffff', position:'top', busy:false, rendering:false, exportUrl:null, recorder:null,audioCtx:null,audioSource:null,audioOut:null,audioGain:null, recorderMime:'',exportAbort:false};
const f = n => Number.isFinite(n)?Math.max(0,n):0;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const fmt=s=>{s=Math.max(0,Math.floor(f(s)));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const status=(message,error=false)=>{const el=$('exportStatus');el.textContent=message;el.className='status'+(error?' error':'')};
const ratioSize=()=>state.ratio==='9:16'?[540,960]:state.ratio==='1:1'?[720,720]:[960,540];
function canvasSize(){const [w,h]=ratioSize();canvas.width=w;canvas.height=h;$('canvasSize').textContent=w+' × '+h;draw()}
function draw(){
 const w=canvas.width,h=canvas.height;ctx.save();ctx.fillStyle='#0b1315';ctx.fillRect(0,0,w,h);
 if(video.readyState>=2 && video.videoWidth>0){
  const vw=video.videoWidth,vh=video.videoHeight,focus=(state.focus-50)/50;
  const img=(mode,doZoom,blur=false)=>{
   const s=(mode==='fill'?Math.max(w/vw,h/vh):Math.min(w/vw,h/vh))*(doZoom?state.zoom/100:1);
   const dw=vw*s,dh=vh*s;
   const x=clamp((w-dw)/2-focus*Math.max(0,dw-w)/2,Math.min(0,w-dw),Math.max(0,w-dw));
   const y=(h-dh)/2;
   ctx.save(); if(blur){ctx.filter='blur(35px) brightness(0.45)';}
   ctx.drawImage(video,x,y,dw,dh);ctx.restore();
  };
  try {if(state.fit==='blur')img('fill',false,true);img(state.fit==='fill'?'fill':'fit',true,false)}catch(_){/* non-ready frame */}
 }
 if(state.title.trim()){
   const raw=state.title.trim().replace(/\s+/g,' ');
   const scale=canvas.width/540, size=state.fontSize*scale;
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${size}px system-ui, sans-serif`;
   const max=w*.84,words=raw.split(' '),lines=[];let line='';
   for(const word of words){const trial=line?line+' '+word:word;if(ctx.measureText(trial).width>max&&line){lines.push(line);line=word}else line=trial;} if(line)lines.push(line);
   const sliced=lines.slice(0,4), lineH=size*1.22,total=lineH*sliced.length;
   let y=state.position==='top'?Math.max(58*scale,total*.55+20*scale):state.position==='bottom'?h-Math.max(72*scale,total*.55+25*scale):h/2;
   ctx.shadowColor='rgba(0,0,0,.92)';ctx.shadowBlur=size*.31;ctx.lineWidth=size*.13;ctx.strokeStyle='rgba(4,13,16,.85)';ctx.fillStyle=state.color;
   sliced.forEach((txt,i)=>{let ty=y+(i-(sliced.length-1)/2)*lineH;ctx.strokeText(txt,w/2,ty,max);ctx.fillText(txt,w/2,ty,max)});
 }
 ctx.restore();
}
let rafId=0;function animate(){draw();if(state.file&&!state.rendering){$('currentTime').textContent=fmt(video.currentTime);if(document.activeElement!==$('seek'))$('seek').value=String(video.currentTime||0);$('playPause').textContent=video.paused?'▶':'❚❚';}rafId=requestAnimationFrame(animate)}animate();
function updateRangeFields(){ $('clipStart').max=String(state.duration);$('clipEnd').max=String(state.duration);}
function clearExport(){if(state.exportUrl){URL.revokeObjectURL(state.exportUrl);state.exportUrl=null}$('downloadLink').classList.add('hidden');status('');$('progressTrack').classList.add('hidden');$('progressBar').style.width='0%'}
function totalLength(){return state.clips.reduce((a,c)=>a+c.end-c.start,0)}
function updateExportState(){const total=totalLength();$('clipCount').textContent=state.clips.length+' clip'+(state.clips.length===1?'':'s')+' · '+fmt(total);$('exportSummary').textContent=state.file?(state.clips.length?`${state.clips.length} clip(s), ${fmt(total)} total. Rendered locally in real time.`:'Choose at least one clip to export.'):'Add a video and choose at least one clip.';$('exportBtn').disabled=!state.file||!state.clips.length||state.busy;}
function renderClips(){const el=$('clipList');el.replaceChildren();if(!state.clips.length){let msg=document.createElement('p');msg.className='fine-print';msg.textContent='Add a clip above to build your sequence. You can combine multiple moments from the same video.';el.append(msg)}
 state.clips.forEach((clip,index)=>{let item=document.createElement('div');item.className='clip-item';const left=document.createElement('div');const bold=document.createElement('strong');bold.textContent=`Clip ${index+1} · ${fmt(clip.end-clip.start)}`;bold.style.fontSize='13px';const sm=document.createElement('small');sm.textContent=` ${fmt(clip.start)} → ${fmt(clip.end)}`;left.append(bold,sm);const ctrl=document.createElement('div');ctrl.className='clip-controls';[['↑','Move up',()=>move(index,-1)],['↓','Move down',()=>move(index,1)],['×','Remove',()=>remove(index)]].forEach(([txt,lbl,fn])=>{const b=document.createElement('button');b.type='button';b.className='mini-btn';b.textContent=txt;b.setAttribute('aria-label',lbl+' clip '+(index+1));b.addEventListener('click',fn);ctrl.append(b)});const jump=document.createElement('button');jump.type='button';jump.className='mini-btn';jump.textContent='View';jump.addEventListener('click',()=>{video.pause();video.currentTime=clip.start;$('clipStart').value=clip.start.toFixed(1);$('clipEnd').value=clip.end.toFixed(1)});ctrl.prepend(jump);item.append(left,ctrl);el.append(item)});updateExportState();}
function move(i,dir){const j=i+dir;if(j<0||j>=state.clips.length||state.busy)return;[state.clips[i],state.clips[j]]=[state.clips[j],state.clips[i]];clearExport();renderClips();}
function remove(i){if(state.busy)return;state.clips.splice(i,1);clearExport();renderClips();}
async function loadFile(file){if(state.busy)return;if(!file||(!file.type.startsWith('video/')&&!/\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name||''))){status('Choose a video file (MP4, MOV, WebM, etc.).',true);return}video.pause();if(state.url)URL.revokeObjectURL(state.url);state.url=URL.createObjectURL(file);state.file=file;state.clips=[];clearExport();video.src=state.url;video.load();$('fileDetails').textContent='Loading '+file.name+'…';$('previewShell').classList.remove('ready');$('emptyWork').classList.remove('hidden');$('sourceRow').classList.add('hidden');updateExportState();}
video.addEventListener('loadedmetadata',()=>{if(!state.file||!Number.isFinite(video.duration)||video.duration<=0){status('Could not determine video duration. The source may not be browser-compatible.',true);return}state.duration=video.duration;$('emptyWork').classList.add('hidden');$('previewShell').classList.add('ready');$('sourceRow').classList.remove('hidden');$('seek').max=String(state.duration);$('duration').textContent=fmt(state.duration);$('clipStart').value='0';$('clipEnd').value=Math.min(15,state.duration).toFixed(1);updateRangeFields();$('fileDetails').textContent=`${state.file.name} · ${(state.file.size/1024/1024).toFixed(1)} MB · ${video.videoWidth}×${video.videoHeight} · ${fmt(state.duration)}`;video.currentTime=0;renderClips();});
video.addEventListener('error',()=>{status('The browser could not decode this video. Try MP4/H.264 or WebM.',true)});
$('chooseFile').onclick=()=> $('fileInput').click();$('chooseAnother').onclick=()=> $('fileInput').click();$('fileInput').addEventListener('change',e=>{if(e.target.files[0])loadFile(e.target.files[0]);e.target.value=''});
$('demoBtn').onclick=async()=>{try{const res=await fetch('assets/demo/clipforge-demo.mp4');if(!res.ok)throw Error('Sample missing');let blob=await res.blob();await loadFile(new File([blob],'ClipForge_Sample.mp4',{type:'video/mp4'}));}catch(e){status('The sample video could not be loaded. Please use your own file.',true)}};
let dragCount=0;const root=$('studioRoot');root.addEventListener('dragenter',e=>{e.preventDefault();dragCount++;root.classList.add('dragover')});root.addEventListener('dragover',e=>e.preventDefault());root.addEventListener('dragleave',e=>{e.preventDefault();dragCount=Math.max(0,dragCount-1);if(!dragCount)root.classList.remove('dragover')});root.addEventListener('drop',e=>{e.preventDefault();dragCount=0;root.classList.remove('dragover');if(e.dataTransfer.files.length)loadFile(e.dataTransfer.files[0])});
$('playPause').addEventListener('click',async()=>{if(!state.file||state.busy)return;if(video.paused){try{if(state.audioGain)state.audioGain.gain.value=1;await video.play()}catch(e){status('Unable to play this video.',true)}}else video.pause()});
$('seek').addEventListener('input',e=>{if(state.file&&!state.busy){video.currentTime=Number(e.target.value);$('currentTime').textContent=fmt(video.currentTime)}});
$('setIn').onclick=()=>{$('clipStart').value=Math.min(video.currentTime,Number($('clipEnd').value)-.1).toFixed(1)};
$('setOut').onclick=()=>{$('clipEnd').value=Math.max(video.currentTime,Number($('clipStart').value)+.1).toFixed(1)};
$('addClip').onclick=()=>{const a=Number($('clipStart').value),b=Number($('clipEnd').value);if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b>state.duration+.02||b-a<.2){status('Invalid IN/OUT points. Clip must be at least 0.2 seconds and within the video.',true);return}if(totalLength()+b-a>120){status('Free browser beta is limited to 120 seconds total per export.',true);return}state.clips.push({start:a,end:b});clearExport();renderClips();status('Clip added. You can add more moments from the same video.')};
function setupGroup(id,key,attr){document.querySelectorAll('#'+id+' button').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('#'+id+' button').forEach(b=>b.classList.remove('selected'));button.classList.add('selected');state[key]=button.dataset[attr];if(key==='ratio')canvasSize();draw();clearExport();}));}
setupGroup('ratioControl','ratio','ratio');setupGroup('fitControl','fit','fit');
[['zoom','zoom',v=>v+'%','zoomValue'],['focus','focus',v=>v===50?'Center':v<50?'Left '+(50-v):'Right '+(v-50),'focusValue'],['fontSize','fontSize',v=>v+' px','fontSizeValue']].forEach(([id,key,display,out])=>{$(id).addEventListener('input',e=>{state[key]=Number(e.target.value);$(out).textContent=display(state[key]);draw();clearExport()})});
[['titleText','title'],['titlePosition','position'],['titleColor','color']].forEach(([id,key])=>{$(id).addEventListener('input',e=>{state[key]=e.target.value;draw();clearExport()})});
$('includeAudio').addEventListener('change',clearExport);
function pickMime(){const types=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4;codecs="avc1.42E01E"','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];return types.find(t=>MediaRecorder.isTypeSupported(t))||'';}
async function ensureAudio(){if(state.audioCtx)return state.audioOut;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;state.audioCtx=new AC();state.audioSource=state.audioCtx.createMediaElementSource(video);state.audioOut=state.audioCtx.createMediaStreamDestination();state.audioGain=state.audioCtx.createGain();state.audioSource.connect(state.audioGain);state.audioGain.connect(state.audioCtx.destination);state.audioSource.connect(state.audioOut);return state.audioOut;}
async function seekVideo(time){return new Promise((resolve,reject)=>{if(Math.abs(video.currentTime-time)<.045&&video.readyState>=2){resolve();return}let resolved=false;const stop=()=>{if(resolved)return;resolved=true;video.removeEventListener('seeked',onseek);clearTimeout(timer)};const onseek=()=>{stop();resolve()};video.addEventListener('seeked',onseek,{once:true});const timer=setTimeout(()=>{stop();if(video.readyState>=2)resolve();else reject(Error('Unable to seek to '+time))},5000);try{video.currentTime=time}catch(e){stop();reject(e)}})}
const pauseVideo=()=>new Promise(res=>{video.pause();res()});
async function playSegments(){for(let i=0;i<state.clips.length;i++){
  const seg=state.clips[i];await pauseVideo();await seekVideo(seg.start);draw();await video.play();
  await new Promise((resolve,reject)=>{let finished=false;const finish=(err)=>{if(finished)return;finished=true;video.removeEventListener('ended',onend);clearInterval(interval);if(err)reject(err);else resolve()};const onend=()=>finish();video.addEventListener('ended',onend,{once:true});const interval=setInterval(()=>{if(state.exportAbort){finish(Error('Export canceled'));return}if(video.currentTime>=seg.end-.035){finish();return}if(video.error){finish(Error('Video decoder failed'));}},30);});
  video.pause();draw();
}}
function setBusy(flag){state.busy=flag;$('exportBtn').disabled=flag||!state.clips.length;$('chooseAnother').disabled=flag;$('addClip').disabled=flag;$('playPause').disabled=flag;for(const el of document.querySelectorAll('#ratioControl button,#fitControl button,#zoom,#focus,#fontSize,#titleText,#titlePosition,#titleColor,#includeAudio,#setIn,#setOut,#clipStart,#clipEnd,#seek,.clip-controls button')){el.disabled=flag;}}
$('exportBtn').addEventListener('click',async()=>{
 if(!state.file||!state.clips.length||state.busy)return;
 const total=totalLength();if(total<=0||total>120){status('Select between 0.2 and 120 seconds of video.',true);return}
 if(!canvas.captureStream||!window.MediaRecorder){status('Your browser does not support canvas recording. Try an updated desktop browser.',true);return}
 const mime=pickMime();if(!mime){status('No supported recording format. Try desktop Chrome, Edge or Firefox.',true);return}
 clearExport();setBusy(true);state.rendering=true;state.exportAbort=false;
 $('progressTrack').classList.remove('hidden');status('Preparing your clip… Keep this tab open.');video.pause();let rec=null,ticker=null,stream=null,stopped=false;
 try{
  if($('includeAudio').checked){try{await ensureAudio();if(state.audioCtx)await state.audioCtx.resume()}catch(err){console.warn('Audio capture unavailable, exporting silent video',err)}}if(state.audioGain)state.audioGain.gain.value=0;
  const imageStream=canvas.captureStream(30);let tracks=[...imageStream.getVideoTracks()];if($('includeAudio').checked&&state.audioOut)tracks.push(...state.audioOut.stream.getAudioTracks());stream=new MediaStream(tracks);
  let options={mimeType:mime,videoBitsPerSecond:5500000,audioBitsPerSecond:128000};rec=new MediaRecorder(stream,options);state.recorder=rec;state.recorderMime=mime;
  const chunks=[];const done=new Promise((resolve,reject)=>{rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};rec.onerror=e=>reject(e.error||Error('Recording error'));rec.onstop=()=>resolve()});
  const startWall=performance.now();rec.start(700);status('Rendering locally. Keep this tab visible.');
  ticker=setInterval(()=>{$('progressBar').style.width=(Math.min(95,(performance.now()-startWall)/(total*1000)*95)).toFixed(1)+'%'},200);
  await playSegments();if(rec.state!=='inactive')rec.stop();await done;stopped=true;
  if(!chunks.length)throw Error('The browser produced an empty recording.');
  const mp4=mime.startsWith('video/mp4');const blob=new Blob(chunks,{type:mp4?'video/mp4':'video/webm'});
  if(blob.size<2000)throw Error('The exported recording was too small to be valid.');
  state.exportUrl=URL.createObjectURL(blob);const link=$('downloadLink');link.href=state.exportUrl;link.download='ClipForge_Short_'+new Date().toISOString().slice(0,10)+(mp4?'.mp4':'.webm');link.textContent='Download '+(mp4?'MP4':'WebM')+' · '+(blob.size/1048576).toFixed(1)+' MB ↓';link.classList.remove('hidden');$('progressBar').style.width='100%';status('Export finished! Check your finished video before publishing.');$('exportStatus').className='status ok';
 }catch(err){status('Export failed: '+(err?.message||String(err))+'. Try fewer/shorter clips or another browser.',true);if(rec&&rec.state!=='inactive'){try{rec.stop()}catch(_){}}}
 finally{if(ticker)clearInterval(ticker);if(stream)stream.getTracks().forEach(t=>t.stop());if(state.audioGain)state.audioGain.gain.value=1;state.rendering=false;state.recorder=null;setBusy(false);video.pause();}
});
window.addEventListener('beforeunload',()=>{if(state.url)URL.revokeObjectURL(state.url);if(state.exportUrl)URL.revokeObjectURL(state.exportUrl);cancelAnimationFrame(rafId)});
canvasSize();updateExportState();
})();
