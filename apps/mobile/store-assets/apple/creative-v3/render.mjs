import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {Chess} from 'chess.js';

const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'../../../../../');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const capture=await fs.readFile(path.join(dir,'source/ios-arrow-duel-capture.png'));
const plate=await fs.readFile(path.join(dir,'source/background.png'));
const headerPlate=await fs.readFile(path.join(dir,'source/header-background.png'));
const icon=await fs.readFile(path.join(root,'site/assets/app-icon-192.png'));
const fixture=JSON.parse(await fs.readFile(path.join(root,'fixtures/puzzles/android-arrow-duel.fixture.json'),'utf8'));
const metadata=await sharp(capture).metadata();
const uri=b=>`data:image/png;base64,${b.toString('base64')}`;
// Continuous-curvature handset corners; the inner screen is a matching inset.
function rounded(x,y,w,h,r){
 let d=`M ${x+r} ${y} L ${x+w-r} ${y}`;
 for(const [cx,cy,start] of [[x+w-r,y+r,-90],[x+w-r,y+h-r,0],[x+r,y+h-r,90],[x+r,y+r,180]]){
  for(let i=0;i<=24;i++){
   const a=(start+i*90/24)*Math.PI/180;
   const p=v=>Math.sign(v)*Math.abs(v)**(2/2.6);
   d+=` L ${cx+r*p(Math.cos(a))} ${cy+r*p(Math.sin(a))}`;
  }
 }
 return d+' Z';
}
function device({x,y,w}){
 const rim=w*0.016,sw=w-rim*2,sh=sw*metadata.height/metadata.width,h=sh+rim*2,r=w*.15;
 const outer=rounded(x,y,w,h,r),inner=rounded(x+rim,y+rim,sw,sh,r-rim);
 return {h,svg:`<defs><clipPath id="screen"><path d="${inner}"/></clipPath><filter id="shadow" x="-40%" y="-20%" width="180%" height="150%"><feDropShadow dx="0" dy="26" stdDeviation="24" flood-color="#183455" flood-opacity=".22"/></filter></defs>
 <path d="${outer}" fill="#111419" stroke="#6c737b" stroke-width="2" filter="url(#shadow)"/>
 <image href="${uri(capture)}" x="${x+rim}" y="${y+rim}" width="${sw}" height="${sh}" clip-path="url(#screen)"/>
 <rect x="${x+w/2-sw*.15}" y="${y+rim+sw*.020}" width="${sw*.30}" height="${sw*.075}" rx="${sw*.0375}" fill="#000"/>
 <path d="${outer}" fill="none" stroke="#c4c9cf" stroke-opacity=".45" stroke-width="1.5"/>`};
}
const release=JSON.parse(await fs.readFile(path.join(dir,'asc-delivery.json'),'utf8'));
const assets=[];
for(const spec of [
 {name:'header',h:1646,safe:[1097,493,2743,1154],phone:{x:2106,y:70,w:656},text:{x:1128,brandY:586,brandSize:58,headlineY:780,font:136,line:148,subY:1066,subSize:51,icon:78,iconOffset:.76,iconRounded:true,fontFamily:"'Helvetica Neue', Helvetica, Arial, sans-serif",letterSpacing:-2.5}},
 {name:'search-results',h:2560,safe:[836,765,3004,1795],phone:{x:2150,y:399,w:800},text:{x:890,brandY:900,brandSize:65,headlineY:1170,font:145,line:170,subY:1510,subSize:55,icon:88}}
]){
 const backgroundSource=spec.name==='header'?'source/header-background.png':'source/background.png';
 const bg=await sharp(spec.name==='header'?headerPlate:plate).resize(3840,spec.h,{fit:'cover'}).png().toBuffer();
 const t=spec.text,iy=t.brandY-t.icon*(t.iconOffset??.74),ip=t.iconRounded?rounded(t.x,iy,t.icon,t.icon,t.icon*.225):null;
 const iconSvg=ip?`<defs><clipPath id="app-icon"><path d="${ip}"/></clipPath><filter id="icon-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#183455" flood-opacity=".12"/></filter></defs>
 <path d="${ip}" fill="#fff" filter="url(#icon-shadow)"/>
 <image href="${uri(icon)}" x="${t.x}" y="${iy}" width="${t.icon}" height="${t.icon}" clip-path="url(#app-icon)"/>
 <path d="${ip}" fill="none" stroke="#101c38" stroke-opacity=".08" stroke-width="1.5"/>`:`<image href="${uri(icon)}" x="${t.x}" y="${iy}" width="${t.icon}" height="${t.icon}"/>`;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="${spec.h}" viewBox="0 0 3840 ${spec.h}">
 <image href="${uri(bg)}" width="3840" height="${spec.h}"/>
 ${device(spec.phone).svg}
 ${iconSvg}
 <g font-family="${t.fontFamily??'Arial, Helvetica, sans-serif'}" fill="#101c38">
 <text x="${t.x+t.icon+22}" y="${t.brandY}" font-size="${t.brandSize}" font-weight="700">Chessticize</text>
 <text x="${t.x}" y="${t.headlineY}" font-size="${t.font}" font-weight="700" letter-spacing="${t.letterSpacing??-3}">Build Tactical</text>
 <text x="${t.x}" y="${t.headlineY+t.line}" font-size="${t.font}" font-weight="700" letter-spacing="${t.letterSpacing??-3}">Intuition</text>
 <text x="${t.x}" y="${t.subY}" font-size="${t.subSize}" font-weight="700" fill="#0062CC">Practice. Review. Improve.</text>
 </g></svg>`;
 const file=`${spec.name}-3840x${spec.h}-v3.png`;
 await sharp(Buffer.from(svg)).flatten({background:'#fff'}).removeAlpha().toColourspace('srgb').png().toFile(path.join(dir,file));
 const [left,top,right,bottom]=spec.safe;
 await sharp(path.join(dir,file)).extract({left,top,width:right-left,height:bottom-top}).resize({width:1200}).jpeg({quality:94}).toFile(path.join(dir,`${spec.name}-safe-area.jpg`));
 await sharp(path.join(dir,file)).resize({width:1440}).jpeg({quality:92}).toFile(path.join(dir,`${spec.name}-preview.jpg`));
 const output=await fs.readFile(path.join(dir,file)),m=await sharp(output).metadata();
 if(m.width!==3840||m.height!==spec.h||m.channels!==3||m.hasAlpha)throw Error('Invalid export');
 assets.push({placement:spec.name,file,width:m.width,height:m.height,channels:m.channels,alpha:m.hasAlpha,sha256:hash(output),bytes:output.length,backgroundSource,safeArea:spec.safe,device:spec.phone});
}
for(const asset of assets){
 if(asset.sha256!==release.assets[asset.placement].sha256)throw Error('Final artwork hash changed; preserve accepted bytes before updating delivery records.');
 asset.ascAssetId=release.assets[asset.placement].ascAssetId;
}
const candidates=fixture.candidates.map(uci=>{const chess=new Chess(fixture.puzzle.initialFen);const move=chess.move({from:uci.slice(0,2),to:uci.slice(2,4)});return {uci,san:move.san,legal:true,role:uci===fixture.correctMove?'correct':'wrong'};});
await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({schemaVersion:1,campaign:'android-direction-apple-v3',createdDate:'2026-11-10',puzzle:{fixture:'fixtures/puzzles/android-arrow-duel.fixture.json',id:fixture.puzzle.id,fen:fixture.puzzle.initialFen,candidates,answerAuthority:'Existing approved Android fixture; chess.js verifies legality, not engine strength.'},sourceCapture:{file:'source/ios-arrow-duel-capture.png',sha256:hash(capture),dimensions:[metadata.width,metadata.height],platform:'native iOS Simulator',capturedDate:'2026-07-25',sourceCommit:null,note:'Retained deterministic iOS test capture of the same 03wH4 position and arrows; source commit not retained. Archival UI, not a new 1.6.0 capture or acceptance claim. No content retouching.'},background:{file:'source/background.png',sha256:hash(plate),model:'gpt-image-2.6-sunburst',mode:'bundled imagegen CLI edit',quality:'high',prompt:'source/background-prompt.txt',styleReference:'../../android/feature-graphic-1024x500.png',headerRefinement:{file:'source/header-background.png',sha256:hash(headerPlate),model:'gpt-image-2.6-sunburst',quality:'high',prompt:'source/header-background-prompt.txt'}},composition:'Deterministic SVG/Sharp typesetting, continuous handset/screen masks and Dynamic Island. Immutable native screenshot scaled and clipped only.',assets,designApproval:release.designApproval,delivery:release.delivery},null,2)+'\n');
console.log(JSON.stringify({assets,candidates},null,2));
