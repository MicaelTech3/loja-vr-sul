document.addEventListener("DOMContentLoaded", () => {
  // ======== FIREBASE CONFIG ========
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCh98WjSryhLJAcX_-COZoIUxIbhP6C8aI",
    authDomain: "loja-vr-sul.firebaseapp.com",
    projectId: "loja-vr-sul",
    storageBucket: "loja-vr-sul.firebasestorage.app",
    messagingSenderId: "485806314481",
    appId: "1:485806314481:web:c9285cb38ba9d623b3aa50"
  };

  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK não encontrado. Verifique as tags <script> no HTML.');
  } else {
    try { firebase.initializeApp(FIREBASE_CONFIG); } catch(e) {}
  }

  const auth = (typeof firebase !== 'undefined') ? firebase.auth() : null;
  const db = (typeof firebase !== 'undefined') ? firebase.firestore() : null;
  if (auth) auth.signInAnonymously().catch(err => console.error('Erro signin anon:', err));

  // ======== Utils ========
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const el = sel => document.querySelector(sel);
  const els = sel => [...document.querySelectorAll(sel)];
  const setText = (sel, v) => { const e = el(sel); if(e) e.textContent = v; };
  function toast(msg){
    const t = el('#toast');
    if(!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'), 2200);
  }

  // ======== Data ========
  const CATEGORIES = ['Tudo', 'Tênis', 'Calças', 'Blusas', 'Camisas', 'Verão', 'Inverno'];
  const PRODUCTS = [
    {id:'p1', title:'Tênis Casual Branco', price:199.90, cat:'Tênis'},
    {id:'p2', title:'Calça Jeans Slim', price:159.90, cat:'Calças'},
    {id:'p3', title:'Blusa Feminina Cropped', price:89.90, cat:'Blusas'},
    {id:'p4', title:'Camisa Polo Masculina', price:119.90, cat:'Camisas'},
    {id:'p5', title:'Shorts Verão Praia', price:69.90, cat:'Verão'},
    {id:'p6', title:'Jaqueta Inverno Puffer', price:279.90, cat:'Inverno'},
    {id:'p7', title:'Tênis Esportivo Preto', price:229.90, cat:'Tênis'},
    {id:'p8', title:'Calça Moletom Confort', price:139.90, cat:'Calças'},
    {id:'p9', title:'Camisa Social Slim Fit', price:149.90, cat:'Camisas'},
    {id:'p10', title:'Blusa Moletom Oversize', price:169.90, cat:'Inverno'},
  ];
  PRODUCTS.forEach(p=>{
    p.images = [
      `https://picsum.photos/seed/${p.id}-1/1200/1200`,
      `https://picsum.photos/seed/${p.id}-2/1200/1200`,
      `https://picsum.photos/seed/${p.id}-3/1200/1200`,
      `https://picsum.photos/seed/${p.id}-4/1200/1200`
    ];
  });

  // ======== Wishlist ========
  const WISH_KEY = 'loja_virtual_wishlist_v1';
  function getWishlist(){ try{ return JSON.parse(localStorage.getItem(WISH_KEY) || '[]'); }catch(e){ return []; } }
  function saveWishlist(arr){ localStorage.setItem(WISH_KEY, JSON.stringify(arr)); }
  function isInWishlist(id){ return getWishlist().includes(id); }
  function toggleWishlist(id){
    const list = getWishlist();
    const idx = list.indexOf(id);
    if(idx === -1){ list.push(id); saveWishlist(list); toast('Adicionado aos desejos ❤️'); }
    else { list.splice(idx,1); saveWishlist(list); toast('Removido dos desejos'); }
    renderWishlistBadges();
  }
  function renderWishlistBadges(){
    document.querySelectorAll('[data-act="fav"]').forEach(h=>{
      const card = h.closest('.card');
      if(!card) return;
      const id = card.dataset.id;
      if(isInWishlist(id)) h.classList.add('wished');
      else h.classList.remove('wished');
    });
  }

  // ======== Categories ========
  const catsWrap = el('#cats');
  let activeCat = 'Tudo';
  function renderCats(){
    if(!catsWrap) return;
    const catsToShow = [...CATEGORIES, 'Desejo'];
    catsWrap.innerHTML = catsToShow.map(c=>`<button class="cat ${c===activeCat?'active':''}" data-cat="${c}">${c}</button>`).join('');
  }

  // ======== Product grid ========
  const grid = el('#grid');
  function productCard(p){
    return `<article class="card" data-id="${p.id}">
      <div class="thumb"><img src="${p.images[0]}" alt="${p.title}"></div>
      <div class="card-body">
        <div class="title">${p.title}</div>
        <div class="price"><strong>${BRL.format(p.price)}</strong><small class="chip pix">PIX</small></div>
        <div class="actions">
          <button class="btn" data-act="fav">❤</button>
          <button class="btn primary" data-act="add">Adicionar</button>
        </div>
      </div>
    </article>`;
  }
  function renderProducts(){
    if(!grid) return;
    const term = (el('#searchInput')?.value || '').trim().toLowerCase();
    if(activeCat === 'Desejo'){
      const wish = getWishlist();
      const list = PRODUCTS.filter(p => wish.includes(p.id) && p.title.toLowerCase().includes(term));
      grid.innerHTML = list.length ? list.map(productCard).join('') : '<div style="opacity:.7; padding:12px">Nenhum item nos desejos.</div>';
    } else {
      const list = PRODUCTS.filter(p => (activeCat==='Tudo' || p.cat===activeCat) && p.title.toLowerCase().includes(term));
      grid.innerHTML = list.map(productCard).join('');
    }
    renderWishlistBadges();
  }

  // ======== Cart ========
  const CART_KEY = 'loja_virtual_cart_v1';
  let cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
  function saveCart(){ localStorage.setItem(CART_KEY, JSON.stringify(cart)); updateBadge(); }
  function cartItems(){ return Object.entries(cart).map(([id,qty]) => ({...PRODUCTS.find(p=>p.id===id), qty})).filter(Boolean); }
  function subtotal(){ return cartItems().reduce((s,it)=> s + (it.price||0)*it.qty, 0); }
  function total(){ return subtotal(); }
  function updateBadge(){ const b = el('#cartBadge'); if(!b) return; b.textContent = cartItems().reduce((s,i)=>s+i.qty,0); }
  function addToCart(id){ cart[id] = (cart[id]||0) + 1; saveCart(); renderCart(); toast('Adicionado ao carrinho'); }
  function removeFromCart(id){ delete cart[id]; saveCart(); renderCart(); }
  function setQty(id, qty){ cart[id] = Math.max(1, Math.min(99, Number(qty) || 1)); saveCart(); renderCart(); }

  const drawer = el('#cartDrawer');
  const lines = el('#cartLines');
  function renderCart(){
    const items = cartItems();
    if(!lines) return;
    lines.innerHTML = items.length ? items.map(it => `
      <div class="line" data-id="${it.id}">
        <div style="width:52px; height:52px; border-radius:10px; overflow:hidden;">
          <img src="${it.images?.[0]||''}" style="width:100%; height:100%; object-fit:cover;">
        </div>
        <div style="flex:1">
          <div style="font-weight:600">${it.title}</div>
          <div style="opacity:.75">${BRL.format(it.price)}</div>
        </div>
        <div class="q">
          <div class="qty">
            <span class="icon" data-minus="${it.id}">−</span>
            <span>${it.qty}</span>
            <span class="icon" data-plus="${it.id}">＋</span>
          </div>
          <button class="icon remove" data-rm="${it.id}">✕</button>
        </div>
      </div>`).join('') : '<div style="opacity:.7; padding:12px">Seu carrinho está vazio.</div>';
    setText('#sumItems', items.reduce((s,i)=>s+i.qty,0));
    setText('#sumTotal', BRL.format(total()));
  }
  function openDrawer(){ if(drawer) drawer.classList.add('open'); }
  function closeDrawer(){ if(drawer) drawer.classList.remove('open'); }

  // ======== Checkout - abre somente o Mercado Pago ========
  async function checkoutFlowCreateOrder() {
    try {
      const items = cartItems();
      if (!items.length) return toast("Carrinho vazio");

      const email = "cliente@teste.com";
      const payload = {
        orderId: "LV-" + Date.now(),
        items: items.map(i => ({
          id: i.id,
          title: i.title,
          price: i.price,
          qty: i.qty || 1
        })),
        payer: { email },
        back_urls: {
          success: window.location.origin + "?mp_result=success",
          failure: window.location.origin + "?mp_result=failure",
          pending: window.location.origin + "?mp_result=pending",
        },
      };

      const resp = await fetch("/api/createPreference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro ao criar preferência");

// 🔄 Redireciona direto na mesma aba (ideal para celular)
      window.location.href = data.init_point;

    } catch (err) {
      console.error(err);
      toast("Erro ao abrir pagamento Mercado Pago");
    }
  }


  // ======== Lightbox / Galeria ========
  function getLbModal(){ return el('#lightboxModal'); }
  function getLbThumbs(){ return el('#lbThumbs'); }
  function getLbIndicator(){ return el('#lbIndicator'); }
  function getLbCounter(){ return el('#lbCounter'); }

  const blurTargets = [...document.querySelectorAll('.container, .topbar')];
  let currentGallery = null;

  // abre a galeria com as 4 imagens
  function openLightbox(productId){
    const p = PRODUCTS.find(x => x.id === productId);
    if(!p) return;
    currentGallery = p;
    renderLightboxImages(p.images);
    const modal = getLbModal();
    if(!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    blurTargets.forEach(t => t.classList.add('blurred'));
    getLbThumbs()?.focus();
  }

  function closeLightbox(){
    const modal = getLbModal();
    if(!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    blurTargets.forEach(t => t.classList.remove('blurred'));
    currentGallery = null;
  }

  // --- Lightbox hint + close-on-outside-click ---
// (cole esse bloco ao lado das outras funções do lightbox)

function createLbHint() {
  const hint = document.createElement('div');
  hint.className = 'lb-hint';
  hint.id = 'lbHint';
  hint.textContent = 'Aperte em qualquer lugar para sair';
  return hint;
}

(function setupLightboxHintAndOutsideClick(){
  const modal = getLbModal();
  if(!modal) return;

  // quando abrir lightbox (observe mutation ou use openLightbox para inserir hint)
  // vamos interceptar a abertura colocando um observer simples:
  const observer = new MutationObserver((mut) => {
    for (const m of mut) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        const isOpen = modal.classList.contains('open');
        const existing = document.getElementById('lbHint');

        if (isOpen && !existing) {
          // cria e anexa hint
          const hint = createLbHint();
          const content = getLbModal().querySelector('.lb-content') || getLbModal();
          if (content) content.appendChild(hint);

          // remove automaticamente depois de 3.5s
          setTimeout(()=> {
            const h = document.getElementById('lbHint');
            if (h) h.classList.add('hidden');
            setTimeout(()=> { if(h && h.parentNode) h.parentNode.removeChild(h); }, 950);
          }, 11500);
        }

        if (!isOpen && existing) {
          // remove imediatamente quando modal fechar
          existing.classList.add('hidden');
          setTimeout(()=> { if(existing && existing.parentNode) existing.parentNode.removeChild(existing); }, 300);
        }
      }
    }
  });

  observer.observe(modal, { attributes: true });

  // fecha ao clicar em overlay que NÃO seja imagem (.lb-slide img)
  modal.addEventListener('click', (e) => {
    // se clicou em uma imagem -> não fecha
    if (e.target.closest('.lb-slide img')) return;
    // se clicou em algum elemento dentro da lb-content que não seja imagem (thumbs, indicadores)
    // também consideramos que ele fecha
    closeLightbox();
  });

  // ESC já fecha (se já tiver implementado, mantém)
  document.addEventListener('keydown', (e)=> {
    const modalEl = getLbModal();
    if(!modalEl || !modalEl.classList.contains('open')) return;
    if(e.key === 'Escape') closeLightbox();
  });

})();


  function renderLightboxImages(images){
    const thumbs = getLbThumbs();
    const indicator = getLbIndicator();
    if(!thumbs || !indicator) return;

    const imgSlides = images.map((src, idx) => `
      <div class="lb-slide" data-idx="${idx}">
        <img src="${src}" alt="Imagem ${idx+1}">
      </div>
    `).join('');

    thumbs.innerHTML = imgSlides;
    indicator.innerHTML = images.map((_,i)=>`<div class="lb-dot" data-idx="${i}"></div>`).join('') + `<div id="lbCounter" class="lb-counter"></div>`;

    enableDragScroll(thumbs);
    requestAnimationFrame(()=>{ thumbs.scrollLeft = 0; updateIndicator(); });
  }

  function updateIndicator(){
    const thumbs = getLbThumbs();
    const indicator = getLbIndicator();
    const counterEl = getLbCounter();
    if(!thumbs || !indicator) return;
    const slides = [...thumbs.querySelectorAll('.lb-slide')];
    if(!slides.length) return;

    const containerRect = thumbs.getBoundingClientRect();
    const containerCenter = containerRect.left + containerRect.width/2;
    let bestIdx = -1;
    let bestDist = Infinity;
    slides.forEach(s=>{
      const r = s.getBoundingClientRect();
      const center = r.left + r.width/2;
      const d = Math.abs(center - containerCenter);
      if(d < bestDist){ bestDist = d; bestIdx = Number(s.dataset.idx ?? -1); }
    });

    const dots = [...indicator.querySelectorAll('.lb-dot')];
    dots.forEach(d => {
      const didx = Number(d.dataset.idx);
      d.classList.toggle('active', didx === bestIdx);
    });

    if(!counterEl) return;
    const total = slides.length;
    const index = bestIdx >= 0 ? bestIdx : 0;
    counterEl.textContent = `${index + 1} / ${total}`;
  }

  function enableDragScroll(container){
    if(!container) return;
    let isDown=false, startX=0, scrollLeft=0;
    container.onpointerdown = (e)=>{
      isDown=true;
      try{ container.setPointerCapture(e.pointerId); }catch(err){}
      startX = e.clientX;
      scrollLeft = container.scrollLeft;
      container.classList.add('dragging');
    };
    container.onpointermove = (e)=>{
      if(!isDown) return;
      const x = e.clientX;
      const walk = (startX - x);
      container.scrollLeft = scrollLeft + walk;
      updateIndicator();
    };
    const up = (e)=>{
      if(!isDown) return;
      isDown=false;
      try{ container.releasePointerCapture(e.pointerId); }catch(err){}
      container.classList.remove('dragging');
      snapToClosest(container);
    };
    container.onpointerup = up;
    container.onpointercancel = up;
    container.onpointerleave = e=>{ if(isDown) up(e); };
    container.onscroll = throttle(updateIndicator, 60);
  }

  function snapToClosest(container){
    const slides = [...container.querySelectorAll('.lb-slide')];
    if(!slides.length) return;
    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.left + containerRect.width/2;
    let best = slides[0];
    let bestD = Infinity;
    slides.forEach(s=>{
      const r = s.getBoundingClientRect();
      const center = r.left + r.width/2;
      const d = Math.abs(center - containerCenter);
      if(d < bestD){ bestD = d; best = s; }
    });
    const targetLeft = best.offsetLeft - (container.clientWidth - best.clientWidth)/2;
    container.scrollTo({ left: targetLeft, behavior:'smooth' });
  }

  function throttle(fn, wait){
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if(now - last > wait){ last = now; fn(...args); }
    };
  }

  document.addEventListener('click', (ev)=>{
    const d = ev.target.closest('.lb-dot');
    if(!d) return;
    const idx = Number(d.dataset.idx);
    const thumbs = getLbThumbs();
    if(!thumbs) return;
    const slide = thumbs.querySelector(`.lb-slide[data-idx="${idx}"]`);
    if(!slide) return;
    const targetLeft = slide.offsetLeft - (thumbs.clientWidth - slide.clientWidth)/2;
    thumbs.scrollTo({ left: targetLeft, behavior:'smooth' });
  });

  document.addEventListener('keydown', (e)=>{
    const modal = getLbModal();
    if(!modal || !modal.classList.contains('open')) return;
    const thumbs = getLbThumbs();
    const indicator = getLbIndicator();
    if(e.key === 'Escape') { closeLightbox(); return; }
    if(e.key === 'ArrowRight'){
      const cur = Number(indicator.querySelector('.lb-dot.active')?.dataset.idx || 0);
      const slides = thumbs.querySelectorAll('.lb-slide');
      const next = Math.min(slides.length-1, cur+1);
      const slide = thumbs.querySelector(`.lb-slide[data-idx="${next}"]`);
      if(slide) thumbs.scrollTo({ left: slide.offsetLeft - (thumbs.clientWidth - slide.clientWidth)/2, behavior:'smooth' });
    }
    if(e.key === 'ArrowLeft'){
      const cur = Number(indicator.querySelector('.lb-dot.active')?.dataset.idx || 0);
      const prev = Math.max(0, cur-1);
      const slide = thumbs.querySelector(`.lb-slide[data-idx="${prev}"]`);
      if(slide) thumbs.scrollTo({ left: slide.offsetLeft - (thumbs.clientWidth - slide.clientWidth)/2, behavior:'smooth' });
    }
  });

  document.addEventListener('click', (ev)=>{
    if(ev.target.id === 'lightboxModal') closeLightbox();
    if(ev.target.id === 'lbClose') closeLightbox();
  });

// ======== Ação de clique nas imagens dos produtos ========
document.addEventListener("click", (ev) => {
  const thumb = ev.target.closest(".thumb img");
  if (thumb) {
    const card = thumb.closest(".card");
    if (card) openLightbox(card.dataset.id);
  }
});

  
  // ======== Eventos Globais ========
  document.addEventListener('click', (ev)=>{
    const target = ev.target;
    const addBtn = target.closest('[data-act="add"]');
    const favBtn = target.closest('[data-act="fav"]');
    const cartOpen = target.closest('#cartOpenBtn');
    const cartClose = target.closest('#cartCloseBtn');
    const plus = target.closest('[data-plus]');
    const minus = target.closest('[data-minus]');
    const rm = target.closest('[data-rm]');
    const checkoutBtn = target.closest('#checkoutBtn');

    if(favBtn){ const cardEl = favBtn.closest('.card'); if(!cardEl) return; toggleWishlist(cardEl.dataset.id); return; }
    if(addBtn){ addToCart(addBtn.closest('.card').dataset.id); return; }
    if(cartOpen){ openDrawer(); return; }
    if(cartClose){ closeDrawer(); return; }
    if(plus){ setQty(plus.dataset.plus, (cart[plus.dataset.plus]||1)+1); return; }
    if(minus){ setQty(minus.dataset.minus, (cart[minus.dataset.minus]||1)-1); return; }
    if(rm){ removeFromCart(rm.dataset.rm); return; }
    if(checkoutBtn){ closeDrawer(); checkoutFlowCreateOrder(); return; }
  });

  // ======== Search e Categorias ========
  el('#searchInput')?.addEventListener('input', renderProducts);
  catsWrap?.addEventListener('click', (e)=>{ const b=e.target.closest('.cat'); if(!b)return; activeCat=b.dataset.cat; renderCats(); renderProducts(); });

  el('#cartOpenBtn')?.addEventListener('click', openDrawer);
  el('#cartCloseBtn')?.addEventListener('click', closeDrawer);

  // ======== Init ========
  renderCats(); renderProducts(); renderCart(); updateBadge(); renderWishlistBadges();
});
