// admin.js
// CONFIGURE AQUI o seu FIREBASE CLIENT CONFIG (mesmo do site)
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCh98WjSryhLJAcX_-COZoIUxIbhP6C8aI",
  authDomain: "loja-vr-sul.firebaseapp.com",
  projectId: "loja-vr-sul",
  storageBucket: "loja-vr-sul.firebasestorage.app",
  messagingSenderId: "485806314481",
  appId: "1:485806314481:web:c9285cb38ba9d623b3aa50"
};

// senha simples (troque para algo seu). NÃO é segura para produção.
const ADMIN_SECRET = "123";

if(typeof firebase === 'undefined') {
  alert('Firebase SDK não carregado. Verifique a conexão.');
}
try{ firebase.initializeApp(FIREBASE_CONFIG); }catch(e){ /* ignora se já inicializado */ }
const db = firebase.firestore();
const storage = firebase.storage();

const productsGrid = document.getElementById('productsGrid');
const btnLogin = document.getElementById('btnLogin');
const adminPass = document.getElementById('adminPass');
const loginMsg = document.getElementById('loginMsg');
const main = document.getElementById('main');

const uploaderModal = document.getElementById('uploaderModal');
const fileInput = document.getElementById('fileInput');
const previewWrap = document.getElementById('previewWrap');
const btnUpload = document.getElementById('btnUpload');
const btnCancel = document.getElementById('btnCancel');
const uploadStatus = document.getElementById('uploadStatus');

let editing = { productId: null, slotIndex: 0, existingImages: [] };

// Lista local (se quiser carregar de Firestore em vez daqui, veja nota abaixo)
const PRODUCTS = [
  {id:'p1', title:'Tênis Casual Branco'},
  {id:'p2', title:'Calça Jeans Slim'},
  {id:'p3', title:'Blusa Feminina Cropped'},
  {id:'p4', title:'Camisa Polo Masculina'},
  {id:'p5', title:'Shorts Verão Praia'},
  {id:'p6', title:'Jaqueta Inverno Puffer'},
  {id:'p7', title:'Tênis Esportivo Preto'},
  {id:'p8', title:'Calça Moletom Confort'},
  {id:'p9', title:'Camisa Social Slim Fit'},
  {id:'p10', title:'Blusa Moletom Oversize'},
];

btnLogin.addEventListener('click', ()=> {
  const v = adminPass.value.trim();
  if(!v){ loginMsg.textContent = 'Informe a senha'; return; }
  if(v !== ADMIN_SECRET){ loginMsg.textContent = 'Senha incorreta'; return; }
  loginMsg.textContent = 'Autenticado';
  adminPass.value = '';
  showAdminUI();
});

function showAdminUI(){
  main.classList.remove('hidden');
  document.querySelector('.login').classList.add('hidden');
  renderProducts();
}

async function renderProducts(){
  productsGrid.innerHTML = '';
  for(const p of PRODUCTS){
    // tenta carregar doc do Firestore para pegar imagens salvo no admin
    let images = [];
    try {
      const doc = await db.collection('products').doc(p.id).get();
      if(doc.exists && doc.data().images) images = doc.data().images;
    } catch(e){ console.warn('err read product', e); }

    // se não houver imagens em Firestore, mostra slots vazios
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="prod-title">${p.title}</div>
      <div class="images-row">
        ${[0,1,2,3].map(i => `
          <div class="img-slot" data-slot="${i}" data-id="${p.id}">
            ${images[i] ? `<img src="${images[i]}" alt="${p.title}">` : `<div class="muted">Sem imagem</div>`}
            <button class="pencil" title="Editar imagem">✎</button>
          </div>`).join('')}
      </div>
      <div class="small">ID: ${p.id}</div>
    `;
    productsGrid.appendChild(card);

    // attach pencil listeners
    card.querySelectorAll('.pencil').forEach(btn => {
      btn.addEventListener('click', (ev)=> {
        const slotEl = ev.target.closest('.img-slot');
        openUploader(p.id, Number(slotEl.dataset.slot), images);
      });
    });
  }
}

function openUploader(productId, slotIndex, existingImages){
  editing.productId = productId;
  editing.slotIndex = slotIndex;
  editing.existingImages = existingImages || [];
  previewWrap.innerHTML = '';
  fileInput.value = '';
  uploadStatus.textContent = '';
  uploaderModal.classList.remove('hidden');
  // se já existe imagem nesse slot, mostra preview
  const url = editing.existingImages[slotIndex];
  if(url){
    const img = document.createElement('img'); img.src = url;
    previewWrap.appendChild(img);
  } else {
    previewWrap.innerHTML = '<div class="muted">Escolha um arquivo para fazer upload</div>';
  }
}

btnCancel.addEventListener('click', ()=> {
  uploaderModal.classList.add('hidden');
});

fileInput.addEventListener('change', (ev)=> {
  const f = ev.target.files[0];
  if(!f) return;
  const img = document.createElement('img');
  img.src = URL.createObjectURL(f);
  previewWrap.innerHTML = '';
  previewWrap.appendChild(img);
});

btnUpload.addEventListener('click', async ()=> {
  const f = fileInput.files[0];
  if(!f){ uploadStatus.textContent = 'Escolha um arquivo primeiro'; return; }
  uploadStatus.textContent = 'Enviando...';
  try {
    const pid = editing.productId;
    const slot = editing.slotIndex;
    const filename = Date.now() + '_' + f.name.replace(/\s+/g,'_');
    const path = `products/${pid}/${filename}`;

    const uploadTask = storage.ref(path).put(f);
    uploadTask.on('state_changed',
      snapshot => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        uploadStatus.textContent = `Enviando ${progress}%`;
      },
      err => { uploadStatus.textContent = 'Erro upload: ' + err.message; },
      async () => {
        const url = await storage.ref(path).getDownloadURL();

        // atualiza array de imagens no Firestore
        const docRef = db.collection('products').doc(pid);
        // obtém existente
        const doc = await docRef.get();
        const arr = doc.exists && doc.data().images ? doc.data().images.slice() : [];
        // garante tamanho 4
        while(arr.length < 4) arr.push(null);
        arr[slot] = url;
        await docRef.set({ images: arr, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });

        uploadStatus.textContent = 'Salvo com sucesso!';
        setTimeout(()=> { uploaderModal.classList.add('hidden'); renderProducts(); }, 900);
      }
    );

  } catch(e){
    console.error(e);
    uploadStatus.textContent = 'Erro ao salvar: ' + e.message;
  }
});
