const DB_NAME = 'character-memo-db';
const STORE_NAME = 'characters';
const DB_VERSION = 1;

let db;
let characters = [];
let editingId = null;
let pendingImageBlob = null;
let removeExistingImage = false;
let objectUrls = [];

const $ = (id) => document.getElementById(id);
const cardGrid = $('cardGrid');
const emptyState = $('emptyState');
const countLabel = $('countLabel');
const searchInput = $('searchInput');
const dialog = $('editorDialog');
const form = $('editorForm');
const dialogTitle = $('dialogTitle');
const nameInput = $('nameInput');
const featuresInput = $('featuresInput');
const imageInput = $('imageInput');
const imagePreview = $('imagePreview');
const imagePlaceholder = $('imagePlaceholder');
const removeImageBtn = $('removeImageBtn');
const deleteBtn = $('deleteBtn');

function openDb(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE_NAME)) {
        d.createObjectStore(STORE_NAME, { keyPath:'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function store(mode='readonly'){
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function getAll(){
  return new Promise((resolve,reject)=>{
    const req = store().getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function put(item){
  return new Promise((resolve,reject)=>{
    const req = store('readwrite').put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function remove(id){
  return new Promise((resolve,reject)=>{
    const req = store('readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function clearObjectUrls(){
  objectUrls.forEach(URL.revokeObjectURL);
  objectUrls = [];
}

function imageUrl(blob){
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
}

function escapeHtml(value=''){
  return value.replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[ch]));
}

function filteredCharacters(){
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return characters;
  return characters.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.features || '').toLowerCase().includes(q)
  );
}

function render(){
  clearObjectUrls();
  const list = filteredCharacters()
    .slice()
    .sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));

  cardGrid.innerHTML = list.map(c => {
    const url = imageUrl(c.imageBlob);
    return `
      <button class="character-card" data-id="${c.id}" aria-label="${escapeHtml(c.name)}を開く">
        <div class="card-image">
          ${url ? `<img src="${url}" alt="">` : '<div class="no-image">✎</div>'}
        </div>
        <div class="card-body">
          <h3 class="card-name">${escapeHtml(c.name || '名前なし')}</h3>
          <p class="card-features">${escapeHtml(c.features || 'まだ特徴メモはありません')}</p>
        </div>
      </button>
    `;
  }).join('');

  emptyState.classList.toggle('is-visible', characters.length === 0);
  cardGrid.hidden = characters.length === 0;
  countLabel.textContent = `${characters.length}キャラ`;

  cardGrid.querySelectorAll('.character-card').forEach(card => {
    card.addEventListener('click', () => openEditor(card.dataset.id));
  });
}

function resetPreview(){
  imagePreview.hidden = true;
  imagePreview.removeAttribute('src');
  imagePlaceholder.hidden = false;
  removeImageBtn.hidden = true;
}

function showPreview(blob){
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  imagePreview.src = url;
  imagePreview.hidden = false;
  imagePlaceholder.hidden = true;
  removeImageBtn.hidden = false;
}

function openEditor(id=null){
  editingId = id;
  pendingImageBlob = null;
  removeExistingImage = false;
  imageInput.value = '';
  resetPreview();

  if (id) {
    const c = characters.find(x => x.id === id);
    if (!c) return;
    dialogTitle.textContent = 'キャラを編集';
    nameInput.value = c.name || '';
    featuresInput.value = c.features || '';
    deleteBtn.hidden = false;
    if (c.imageBlob) showPreview(c.imageBlob);
  } else {
    dialogTitle.textContent = 'キャラを追加';
    nameInput.value = '';
    featuresInput.value = '';
    deleteBtn.hidden = true;
  }

  dialog.showModal();
  setTimeout(() => nameInput.focus(), 50);
}

function closeEditor(){
  dialog.close();
  editingId = null;
  pendingImageBlob = null;
  removeExistingImage = false;
  imageInput.value = '';
}

async function refresh(){
  characters = await getAll();
  render();
}

$('addBtn').addEventListener('click', () => openEditor());
$('emptyAddBtn').addEventListener('click', () => openEditor());
$('closeBtn').addEventListener('click', closeEditor);
$('cancelBtn').addEventListener('click', closeEditor);
searchInput.addEventListener('input', render);

imageInput.addEventListener('change', () => {
  const file = imageInput.files && imageInput.files[0];
  if (!file) return;
  pendingImageBlob = file;
  removeExistingImage = false;
  showPreview(file);
});

removeImageBtn.addEventListener('click', () => {
  pendingImageBlob = null;
  removeExistingImage = true;
  imageInput.value = '';
  resetPreview();
});

deleteBtn.addEventListener('click', async () => {
  if (!editingId) return;
  if (!confirm('このキャラを削除しますか？')) return;
  await remove(editingId);
  closeEditor();
  await refresh();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }

  const now = Date.now();
  const current = editingId ? characters.find(x => x.id === editingId) : null;

  let imageBlob = current?.imageBlob || null;
  if (removeExistingImage) imageBlob = null;
  if (pendingImageBlob) imageBlob = pendingImageBlob;

  const item = {
    id: editingId || crypto.randomUUID(),
    name,
    features: featuresInput.value.trim(),
    imageBlob,
    createdAt: current?.createdAt || now,
    updatedAt: now
  };

  await put(item);
  closeEditor();
  await refresh();
});

dialog.addEventListener('click', (e) => {
  if (e.target === dialog) closeEditor();
});

window.addEventListener('beforeunload', clearObjectUrls);

(async function init(){
  try{
    db = await openDb();
    await refresh();
  }catch(err){
    console.error(err);
    alert('保存領域を開けませんでした。ブラウザの設定をご確認ください。');
  }
})();