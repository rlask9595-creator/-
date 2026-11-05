// Image preparation is local and happens before any model request.
window.ChartScope=(()=>{
 let source=null,bitmap=null,cutoff=1,masks=[],drag=null;
 const q=s=>document.querySelector(s),canvas=()=>q('#scope-canvas');
 function paint(){if(!bitmap)return;const c=canvas();c.width=bitmap.naturalWidth;c.height=bitmap.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);ctx.fillStyle='#fff';for(const r of masks)ctx.fillRect(r.x,r.y,r.w,r.h);ctx.fillStyle='rgba(100,80,60,.6)';ctx.fillRect(Math.floor(c.width*cutoff),0,c.width,c.height);}
 async function reset(data){source=data;cutoff=1;masks=[];q('#scope-cutoff').value=100;q('#scope-percent').textContent='100%';q('#scope-confirmed').checked=false;if(!data){bitmap=null;return;}bitmap=new Image();bitmap.src=data;await bitmap.decode();paint();}
 q('#edit-scope').addEventListener('click',()=>{if(!bitmap)return;paint();q('#scope-dialog').showModal();});
 q('#scope-cutoff').addEventListener('input',e=>{cutoff=Number(e.target.value)/100;q('#scope-percent').textContent=e.target.value+'%';q('#scope-confirmed').checked=false;paint();});
 const point=e=>{const r=canvas().getBoundingClientRect();return{x:Math.max(0,Math.min(canvas().width,(e.clientX-r.left)*canvas().width/r.width)),y:Math.max(0,Math.min(canvas().height,(e.clientY-r.top)*canvas().height/r.height))};};
 canvas().addEventListener('pointerdown',e=>{drag=point(e);canvas().setPointerCapture(e.pointerId);});
 canvas().addEventListener('pointerup',e=>{if(!drag)return;const p=point(e);if(masks.length<100 && Math.abs(p.x-drag.x)>2 && Math.abs(p.y-drag.y)>2)masks.push({x:Math.min(p.x,drag.x),y:Math.min(p.y,drag.y),w:Math.abs(p.x-drag.x),h:Math.abs(p.y-drag.y)});drag=null;paint();});
 q('#scope-undo').addEventListener('click',()=>{masks.pop();paint();});
 q('#scope-reset').addEventListener('click',()=>reset(source));
 q('#scope-apply').addEventListener('click',async()=>{try{const p=await prepare();q('#chart-preview').src=p.image;q('#scope-dialog').close();document.dispatchEvent(new Event('chart-scope-change'));}catch(e){q('#scope-dialog').close();q('#error').textContent=e.message;q('#error').hidden=false;}});
 async function prepare(){
  if(!bitmap)throw new Error('이미지를 먼저 업로드해 주세요.');
  if(!bitmap.complete || !bitmap.naturalWidth)await bitmap.decode();
  const w=Math.floor(bitmap.naturalWidth*cutoff),h=bitmap.naturalHeight;
  if(w<100)throw new Error('선택한 범위가 너무 좁습니다. 최소 100px 이상으로 선택하세요.');
  let image=source;
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);ctx.fillStyle='#fff';for(const r of masks)ctx.fillRect(r.x,r.y,r.w,r.h);
  if(cutoff<1 || masks.length)image=c.toDataURL('image/png');
  const z=document.createElement('canvas'),left=Math.floor(w*.55),zw=w-left,scale=Math.min(2,2400/Math.max(zw,h));z.width=Math.round(zw*scale);z.height=Math.round(h*scale);z.getContext('2d').drawImage(c,left,0,zw,h,0,0,z.width,z.height);
  const zoomImage=z.toDataURL('image/png');
  if(image.length>8*1024*1024*4/3 || zoomImage.length>8*1024*1024*4/3)throw new Error('편집 이미지가 8MB를 넘습니다. 더 작은 범위로 선택해 주세요.');
  return{image,zoomImage,imageScope:{cutoff,maskCount:masks.length,originalWidth:bitmap.naturalWidth,originalHeight:bitmap.naturalHeight,sentWidth:w,sentHeight:h,zoomLeft:.55,zoomScale:scale}};
 }
 return{reset,prepare};
})();
