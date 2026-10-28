/* =========================================================================
   CENTRAL DA QUALIDADE — LAYOUT PADRÃO (shell compartilhado)
   Módulo ES importado por todas as páginas (index.html e web/modulos/*.html).
   Cuida de: guarda de login, sidebar de navegação, topbar com título/ISO,
   badge de usuário e logout. Cada página só cuida do próprio conteúdo.
   ========================================================================= */

import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, query, orderBy, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const LOGO_URL = "https://mirindosul.com.br/wp-content/themes/estrutura-basica/assets/images/logo.png";

/* Ícones por slug — ajuste/adicione conforme forem surgindo novos módulos.
   Qualquer slug sem entrada aqui cai no ícone padrão (bi-folder2). */
const ICONES_MODULO = {
  'acoes': 'bi-clipboard2-check-fill',
  'competencias': 'bi-mortarboard-fill',
  'indicadores': 'bi-bar-chart-line-fill',
  'rg21': 'bi-search',
  'rg29': 'bi-people-fill',
  'aprovacao-documentos': 'bi-file-earmark-check-fill',
  'documentos': 'bi-folder2-open',
};

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function iconeDoModulo(slug) {
  return ICONES_MODULO[slug] || 'bi-folder2';
}

/**
 * Injeta no <body> o esqueleto de HTML do shell (sidebar + topbar + wrapper
 * de conteúdo), caso a página ainda não tenha os containers esperados.
 * A página chamadora só precisa ter <div id="qc-page-content"></div> com o
 * conteúdo específico do módulo; o resto é montado aqui.
 */
export function garantirEsqueleto({ homeHref }) {
  if (document.getElementById('qc-app')) return;

  const pageContent = document.getElementById('qc-page-content');
  const conteudoHtml = pageContent ? pageContent.outerHTML : '<div id="qc-page-content"></div>';
  if (pageContent) pageContent.remove();

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="qc-loading">Carregando...</div>
    <button class="qc-sidebar-toggle" id="qc-sidebar-toggle" title="Menu"><i class="bi bi-list"></i></button>
    <div id="qc-app">
      <div class="qc-shell">
        <aside class="qc-sidebar" id="qc-sidebar">
          <div class="qc-sidebar-logo">
            <img src="${LOGO_URL}" alt="Viação Mirim">
            <span>Central da<br>Qualidade</span>
          </div>
          <nav class="qc-sidebar-nav" id="qc-sidebar-nav"></nav>
          <div class="qc-sidebar-footer">
            <span class="qc-usuario-badge" id="qc-usuario-badge">---</span>
            <button id="qc-btn-sair" type="button"><i class="bi bi-power"></i> Sair</button>
          </div>
        </aside>
        <main class="qc-main">
          <div class="qc-topbar" id="qc-topbar"></div>
          ${conteudoHtml}
        </main>
      </div>
    </div>
  `;
  document.body.prepend(...wrapper.childNodes);

  document.getElementById('qc-sidebar-toggle').addEventListener('click', () => {
    document.getElementById('qc-sidebar').classList.toggle('qc-aberta');
  });
}

function montarSidebarNav(modulos, activeSlug, souQualidade, homeHref) {
  const nav = document.getElementById('qc-sidebar-nav');
  if (!nav) return;

  let html = `
    <a class="qc-sidebar-link ${!activeSlug ? 'active' : ''}" href="${homeHref}">
      <i class="bi bi-house-door-fill"></i> Início
    </a>
    <div class="qc-sidebar-section-label">Módulos</div>
  `;

  html += modulos.map(m => `
    <a class="qc-sidebar-link ${m.slug === activeSlug ? 'active' : ''}" href="${escapeHtml(m.hrefOverride || ('modulos/' + m.slug + '.html'))}">
      <i class="bi ${iconeDoModulo(m.slug)}"></i> ${escapeHtml(m.nome)}
    </a>
  `).join('');

  if (souQualidade) {
    html += `
      <div class="qc-sidebar-section-label">Administração</div>
      <a class="qc-sidebar-link ${activeSlug === '__admin__' ? 'active' : ''}" href="${homeHref}#admin">
        <i class="bi bi-gear-fill"></i> Painel Admin
      </a>
    `;
  }

  nav.innerHTML = html;
}

function montarTopbar({ pageTitle, breadcrumb, isoDocId }) {
  const topbar = document.getElementById('qc-topbar');
  if (!topbar) return;

  topbar.innerHTML = `
    <div>
      ${breadcrumb ? `<div class="qc-topbar-breadcrumb">${escapeHtml(breadcrumb)}</div>` : ''}
      <h1 id="qc-page-title">${escapeHtml(pageTitle || '')}</h1>
    </div>
    ${isoDocId ? `
      <div class="qc-iso-card">
        <div class="qc-iso-field"><span>Elaboração</span><input type="text" id="qc-iso-elaboracao" placeholder="Data..." disabled></div>
        <div class="qc-iso-field"><span>Revisão</span><input type="text" id="qc-iso-revisao" placeholder="Data..." disabled></div>
        <div class="qc-iso-field"><span>Nº Rev.</span><input type="text" class="qc-rev" id="qc-iso-num-revisao" placeholder="00" disabled></div>
      </div>
    ` : ''}
  `;
}

let _pararEscutaISO = null;

/**
 * Liga a escuta em tempo real da ficha ISO. `isoCollection` existe porque o
 * sistema foi crescendo organicamente e nem todo módulo salva a ficha no
 * mesmo lugar: RG34/35 e a home usam a coleção "configuracoes" (doc por
 * isoDocId); o RG21 (e possivelmente outros) usa "modulo_config" (doc por
 * slug do módulo). Em vez de migrar dados existentes, cada módulo informa
 * onde a ficha dele já está salva.
 */
function escutarISO(db, isoDocId, isoCollection) {
  if (_pararEscutaISO) { _pararEscutaISO(); _pararEscutaISO = null; }
  if (!isoDocId) return;

  _pararEscutaISO = onSnapshot(doc(db, isoCollection, isoDocId), (snap) => {
    const d = snap.exists() ? snap.data() : {};
    const elab = document.getElementById('qc-iso-elaboracao');
    const rev = document.getElementById('qc-iso-revisao');
    const numRev = document.getElementById('qc-iso-num-revisao');
    if (elab) elab.value = d.elaboracao || '';
    if (rev) rev.value = d.revisao || '';
    if (numRev) numRev.value = d.numRevisao || '';
  });

  ['qc-iso-elaboracao', 'qc-iso-revisao', 'qc-iso-num-revisao'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.dataset.qcBound) return;
    el.dataset.qcBound = '1';
    el.addEventListener('change', () => {
      setDoc(doc(db, isoCollection, isoDocId), {
        elaboracao: document.getElementById('qc-iso-elaboracao').value,
        revisao: document.getElementById('qc-iso-revisao').value,
        numRevisao: document.getElementById('qc-iso-num-revisao').value
      }, { merge: true });
    });
  });
}

/**
 * Habilita (ou mantém bloqueados) os campos ISO, de acordo com a regra do
 * módulo: 'qualquer' (padrão, igual ao RG34 e à home — qualquer usuário
 * logado edita) ou 'qualidade' (só o Master edita, igual ao RG21 — os
 * demais veem os valores mas não conseguem alterar).
 */
export function habilitarEdicaoISO(podeEditar) {
  document.querySelectorAll('.qc-iso-field input').forEach(el => {
    if (podeEditar) el.removeAttribute('disabled');
    else el.setAttribute('disabled', 'disabled');
  });
}

/**
 * Troca o título/breadcrumb da topbar e reinicia a escuta ISO — útil em
 * páginas com abas internas (ex: RG34/RG35 na mesma tela).
 */
export function atualizarTopbar(db, { pageTitle, breadcrumb, isoDocId, isoCollection = 'configuracoes', podeEditarIso = true }) {
  const titleEl = document.getElementById('qc-page-title');
  if (titleEl && pageTitle !== undefined) titleEl.textContent = pageTitle;
  const bcEl = document.querySelector('.qc-topbar-breadcrumb');
  if (bcEl && breadcrumb !== undefined) bcEl.textContent = breadcrumb;
  if (isoDocId) {
    escutarISO(db, isoDocId, isoCollection);
    habilitarEdicaoISO(podeEditarIso);
  }
}

/**
 * Monta o shell (sidebar + topbar) e revela #qc-app, assumindo que o
 * chamador JÁ VALIDOU login/perfil. Usado diretamente pelo index.html
 * (que tem fluxo de login próprio) e internamente por initLayout().
 */
export function exibirShell({ db, perfil, modulos, activeSlug, pageTitle, breadcrumb, isoDocId, isoCollection = 'configuracoes', isoEditLevel = 'qualquer', homeHref }) {
  garantirEsqueleto({ homeHref });

  const souQualidade = perfil.papel === 'qualidade';
  const permitidos = modulos.filter(m => souQualidade || (perfil.modulosPermitidos || []).includes(m.slug));

  montarSidebarNav(permitidos, activeSlug, souQualidade, homeHref);
  montarTopbar({ pageTitle, breadcrumb, isoDocId });

  const badge = document.getElementById('qc-usuario-badge');
  if (badge) badge.textContent = perfil.unidade || '---';

  if (isoDocId) {
    const podeEditarIso = isoEditLevel !== 'qualidade' || souQualidade;
    escutarISO(db, isoDocId, isoCollection);
    habilitarEdicaoISO(podeEditarIso);
  }

  const loading = document.getElementById('qc-loading');
  const app = document.getElementById('qc-app');
  if (loading) loading.style.display = 'none';
  if (app) app.style.display = 'block';

  return { souQualidade, modulosPermitidos: permitidos };
}

/**
 * Função principal. Chamar no topo do módulo logo após importar auth/db:
 *
 *   initLayout({ auth, db, activeSlug: 'acoes', pageTitle: 'RG 34 - ...',
 *                 isoDocId: 'iso_rg34', homeHref: '../index.html' })
 *     .then(({ perfil, souQualidade }) => { ...liga os listeners do módulo... });
 *
 * Retorna uma Promise que resolve com { user, perfil, souQualidade, modulos }
 * assim que o shell estiver montado e visível. Para o index.html (que tem
 * fluxo de login próprio), use exibirShell() diretamente.
 */
export function initLayout({
  auth,
  db,
  activeSlug = null,
  pageTitle = '',
  breadcrumb = '',
  isoDocId = null,
  isoCollection = 'configuracoes',
  isoEditLevel = 'qualquer',
  homeHref = './index.html',
  papelExigido = null,
}) {
  garantirEsqueleto({ homeHref });

  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = homeHref;
        return;
      }

      try {
        const perfilSnap = await getDoc(doc(db, 'usuarios_perfil', user.uid));
        const perfil = perfilSnap.exists()
          ? perfilSnap.data()
          : { email: user.email, unidade: '---', papel: 'filial', modulosPermitidos: [] };

        const souQualidade = perfil.papel === 'qualidade';

        if (papelExigido && perfil.papel !== papelExigido && !souQualidade) {
          alert('Este módulo é exclusivo para a equipe da qualidade.');
          window.location.href = homeHref;
          return;
        }

        if (activeSlug && !souQualidade && !(perfil.modulosPermitidos || []).includes(activeSlug)) {
          alert('Você não tem acesso a este módulo. Contate a qualidade.');
          window.location.href = homeHref;
          return;
        }

        const modulosSnap = await getDocs(query(collection(db, 'modulos'), orderBy('ordem')));
        const modulos = modulosSnap.docs.map(d => ({ slug: d.id, ...d.data() }));

        const { modulosPermitidos } = exibirShell({ db, perfil, modulos, activeSlug, pageTitle, breadcrumb, isoDocId, isoCollection, isoEditLevel, homeHref });

        document.getElementById('qc-btn-sair')?.addEventListener('click', () => signOut(auth));

        resolve({ user, perfil, souQualidade, modulos, modulosPermitidos });
      } catch (err) {
        console.error('Erro ao montar layout:', err);
        reject(err);
      }
    });
  });
}
