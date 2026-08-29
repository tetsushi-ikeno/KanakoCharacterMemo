const DB_NAME='character-memo-db';
const STORE_NAME='characters';
const DB_VERSION=1;
const DEMO_SEED_KEY='character-demo-seeded-v1';
const DEMO_CHARACTERS=[
  {id:'demo-001',name:'ネイビーさん',series:'ふしぎな住人',features:'静かでマイペース。どこか不思議な雰囲気をもつ。',imagePath:'assets/demo/character-001.png'},
  {id:'demo-002',name:'ミント',series:'ふしぎな住人',features:'身軽で好奇心旺盛。気になるものを見つけるとすぐ近づく。',imagePath:'assets/demo/character-002.png'},
  {id:'demo-003',name:'ルージュ',series:'ちいさな仲間',features:'元気いっぱい。小さいけれど存在感がある。',imagePath:'assets/demo/character-003.png'},
  {id:'demo-004',name:'ピンクル',series:'ちいさな仲間',features:'のんびり屋でやさしい性格。',imagePath:'assets/demo/character-004.png'},
  {id:'demo-005',name:'ライム',series:'森のなかま',features:'自然が好き。緑の場所にいると落ち着く。',imagePath:'assets/demo/character-005.png'}
];

let db;
let characters=[];
let editingId=null;
let viewingId=null;
let pendingImageBlob=null;
let removeExistingImage=false;
let objectUrls=[];

const $=id=>document.getElementById(id);
const cardGrid=$('cardGrid');
const emptyState=$('emptyState');
const noResults=$('noResults');
const countLabel=$('countLabel');
const searchInput=$('searchInput');
const detailDialog=$('detailDialog');
const editorDialog=$('editorDialog');
const form=$('editorForm');
const dialogTitle=$('dialogTitle');
const nameInput=$('nameInput');
const featuresInput=$('featuresInput');
const imageInput=$('imageInput');
const imagePreview=$('imagePreview');
const imagePlaceholder=$('imagePlaceholder');
const removeImageBtn=$('removeImageBtn');

function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const d=req.result;
      if(!d.objectStoreNames.contains(STORE_NAME)){
        d.createObjectStore(STORE_NAME,{keyPath:'id'});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
function store(mode='readonly'){return db.transaction(STORE_NAME,mode).objectStore(STORE_NAME)}
function getAll(){return new Promise((resolve,reject)=>{const req=store().getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)})}
function put(item){return new Promise((resolve,reject)=>{const req=store('readwrite').put(item);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error)})}
function remove(id){return new Promise((resolve,reject)=>{const req=store('readwrite').delete(id);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error)})}

async function seedDemoCharacters(){
  if(localStorage.getItem(DEMO_SEED_KEY)) return;
  const existing=await getAll();
  const existingIds=new Set(existing.map(c=>c.id));
  const baseTime=Date.now()-DEMO_CHARACTERS.length*1000;
  for(let i=0;i<DEMO_CHARACTERS.length;i++){
    const d=DEMO_CHARACTERS[i];
    if(existingIds.has(d.id)) continue;
    try{
      const res=await fetch(d.imagePath);
      if(!res.ok) throw new Error('demo image load failed');
      const imageBlob=await res.blob();
      await put({id:d.id,name:d.name,series:d.series,features:d.features,imageBlob,createdAt:baseTime+i,updatedAt:baseTime+i});
    }catch(err){
      console.warn('Demo character could not be loaded',d.id,err);
    }
  }
  localStorage.setItem(DEMO_SEED_KEY,'1');
}

function clearObjectUrls(){objectUrls.forEach(URL.revokeObjectURL);objectUrls=[]}
function imageUrl(blob){
  if(!blob)return null;
  const url=URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
}
function escapeHtml(value=''){
  return value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
}
function filteredCharacters(){
  const q=searchInput.value.trim().toLowerCase();
  if(!q)return characters;
  return characters.filter(c=>(c.name||'').toLowerCase().includes(q)||(c.series||'').toLowerCase().includes(q)||(c.features||'').toLowerCase().includes(q));
}
function render(){
  clearObjectUrls();
  const list=filteredCharacters().slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  cardGrid.innerHTML=list.map(c=>{
    const url=imageUrl(c.imageBlob);
    return `
      <button class="character-card" data-id="${c.id}" aria-label="${escapeHtml(c.name)}を開く">
        <div class="card-image">
          ${url?`<img src="${url}" alt="">`:'<div class="no-image">✎</div>'}
        </div>
        <div class="card-body">
          ${c.series?`<span class="card-series">${escapeHtml(c.series)}</span>`:''}
          <h3 class="card-name">${escapeHtml(c.name||'名前なし')}</h3>
          <p class="card-features">${escapeHtml(c.features||'まだ特徴メモはありません')}</p>
        </div>
      </button>`;
  }).join('');

  const hasCharacters=characters.length>0;
  const hasResults=list.length>0;
  emptyState.classList.toggle('is-visible',!hasCharacters);
  cardGrid.hidden=!hasCharacters||!hasResults;
  noResults.hidden=!hasCharacters||hasResults;
  countLabel.textContent=searchInput.value.trim()? `${list.length} / ${characters.length}キャラ` : `${characters.length}キャラ`;

  cardGrid.querySelectorAll('.character-card').forEach(card=>{
    card.addEventListener('click',()=>openDetail(card.dataset.id));
  });
}
function resetPreview(){
  imagePreview.hidden=true;
  imagePreview.removeAttribute('src');
  imagePlaceholder.hidden=false;
  removeImageBtn.hidden=true;
}
function showPreview(blob){
  const url=URL.createObjectURL(blob);
  objectUrls.push(url);
  imagePreview.src=url;
  imagePreview.hidden=false;
  imagePlaceholder.hidden=true;
  removeImageBtn.hidden=false;
}
function openDetail(id){
  const c=characters.find(x=>x.id===id);
  if(!c)return;
  viewingId=id;
  $('detailName').textContent=c.name||'名前なし';
  const seriesEl=$('detailSeries');
  seriesEl.textContent=c.series||'';
  seriesEl.hidden=!c.series;
  $('detailFeatures').textContent=c.features||'まだ特徴メモはありません。';
  const img=$('detailImage');
  const noImg=$('detailNoImage');
  if(c.imageBlob){
    const url=imageUrl(c.imageBlob);
    img.src=url;
    img.hidden=false;
    noImg.hidden=true;
  }else{
    img.hidden=true;
    img.removeAttribute('src');
    noImg.hidden=false;
  }
  detailDialog.showModal();
}
function closeDetail(){
  detailDialog.close();
  viewingId=null;
}
function openEditor(id=null){
  editingId=id;
  pendingImageBlob=null;
  removeExistingImage=false;
  imageInput.value='';
  resetPreview();

  if(id){
    const c=characters.find(x=>x.id===id);
    if(!c)return;
    dialogTitle.textContent='キャラを編集';
    nameInput.value=c.name||'';
    featuresInput.value=c.features||'';
    if(c.imageBlob)showPreview(c.imageBlob);
  }else{
    dialogTitle.textContent='キャラを追加';
    nameInput.value='';
    featuresInput.value='';
  }
  editorDialog.showModal();
  setTimeout(()=>nameInput.focus(),50);
}
function closeEditor(){
  editorDialog.close();
  editingId=null;
  pendingImageBlob=null;
  removeExistingImage=false;
  imageInput.value='';
}
async function refresh(){
  characters=await getAll();
  render();
}

$('addBtn').addEventListener('click',()=>openEditor());
$('emptyAddBtn').addEventListener('click',()=>openEditor());
$('closeBtn').addEventListener('click',closeEditor);
$('cancelBtn').addEventListener('click',closeEditor);
$('detailCloseBtn').addEventListener('click',closeDetail);
searchInput.addEventListener('input',render);

$('editBtn').addEventListener('click',()=>{
  const id=viewingId;
  closeDetail();
  openEditor(id);
});
$('detailDeleteBtn').addEventListener('click',async()=>{
  if(!viewingId)return;
  const c=characters.find(x=>x.id===viewingId);
  if(!confirm(`「${c?.name||'このキャラ'}」を削除しますか？`))return;
  const id=viewingId;
  closeDetail();
  await remove(id);
  await refresh();
});

imageInput.addEventListener('change',()=>{
  const file=imageInput.files&&imageInput.files[0];
  if(!file)return;
  pendingImageBlob=file;
  removeExistingImage=false;
  showPreview(file);
});
removeImageBtn.addEventListener('click',()=>{
  pendingImageBlob=null;
  removeExistingImage=true;
  imageInput.value='';
  resetPreview();
});

form.addEventListener('submit',async e=>{
  e.preventDefault();
  const name=nameInput.value.trim();
  if(!name){nameInput.focus();return}

  const now=Date.now();
  const current=editingId?characters.find(x=>x.id===editingId):null;
  let imageBlob=current?.imageBlob||null;
  if(removeExistingImage)imageBlob=null;
  if(pendingImageBlob)imageBlob=pendingImageBlob;

  const item={
    id:editingId||crypto.randomUUID(),
    name,
    features:featuresInput.value.trim(),
    series:current?.series||'',
    imageBlob,
    createdAt:current?.createdAt||now,
    updatedAt:now
  };
  await put(item);
  const savedId=item.id;
  closeEditor();
  await refresh();
  openDetail(savedId);
});

detailDialog.addEventListener('click',e=>{if(e.target===detailDialog)closeDetail()});
editorDialog.addEventListener('click',e=>{if(e.target===editorDialog)closeEditor()});
window.addEventListener('beforeunload',clearObjectUrls);

(async function init(){
  try{
    db=await openDb();
    await seedDemoCharacters();
    await refresh();
  }catch(err){
    console.error(err);
    alert('保存領域を開けませんでした。ブラウザの設定をご確認ください。');
  }
})();