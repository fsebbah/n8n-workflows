# Architecture Système Globale

**Date** : 2026-05-08
**Statut** : Documentation interne
**Concerne** : Toutes les équipes

---

## 1. Vue d'ensemble

Le système est composé de deux flux principaux :

### Flux 1 : Frontend → chat.api → Azy-MCP → N8N

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Frontend   │─────▶│   chat.api   │─────▶│   Azy-MCP    │─────▶│     N8N      │
│   (Web UI)   │      │              │      │ (MCP Server) │      │  (Webhooks)  │
└──────────────┘      └──────────────┘      └──────────────┘      └──────┬───────┘
                                                                         │
                                                                         ▼
                                                              ┌─────────────────────┐
                                                              │  Services Externes  │
                                                              │  Google, LLM, etc.  │
                                                              └─────────────────────┘
```

### Flux 2 : Plugin Discord → Chatbot-Core → Azy-MCP → N8N

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Discord    │─────▶│              │      │              │      │              │
│  (Gateway)   │      │  Chatbot-    │─────▶│   Azy-MCP    │─────▶│     N8N      │
├──────────────┤      │    Core      │      │ (MCP Server) │      │  (Webhooks)  │
│   Plugin     │─────▶│  (Framework) │      │              │      │              │
│  (Métier)    │      │              │      │              │      │              │
└──────────────┘      └──────────────┘      └──────────────┘      └──────┬───────┘
                                                                         │
                                                                         ▼
                                                              ┌─────────────────────┐
                                                              │  Services Externes  │
                                                              │  Google, LLM, etc.  │
                                                              └─────────────────────┘
```

### Schéma global unifié

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              POINTS D'ENTRÉE                                     │
│                                                                                  │
│        ┌──────────────┐              ┌──────────────────────────────────┐       │
│        │   Frontend   │              │      Plugin Discord              │       │
│        │   (Web UI)   │              │  (plugin-recipes, plugin-chess)  │       │
│        └──────┬───────┘              └──────────────┬───────────────────┘       │
│               │                                     │                           │
└───────────────│─────────────────────────────────────│───────────────────────────┘
                │                                     │
                ▼                                     ▼
┌──────────────────────────┐           ┌──────────────────────────┐
│      chat.api            │           │      Chatbot-Core        │
│  (Backend API)           │           │  (Framework Discord)     │
└────────────┬─────────────┘           └────────────┬─────────────┘
             │                                      │
             │  REST API                            │  MCP Protocol
             │                                      │
             └───────────────┬──────────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │        Azy-MCP           │
              │     (MCP Server)         │
              │  Wrappers outils Google  │
              │                          │
              │  Accès via:              │
              │  - MCP Protocol (stdio)  │
              │  - MCP Protocol (WS)     │
              │  - REST API              │
              └────────────┬─────────────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │          N8N             │
              │      (Webhooks)          │
              │  Workflows & Automations │
              └────────────┬─────────────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │   Services Externes      │
              │                          │
              │  - Google APIs           │
              │  - OpenAI / Anthropic    │
              │  - Bases de données      │
              │  - Services tiers        │
              └──────────────────────────┘
```

**Points clés :**
- **Frontend** passe TOUJOURS par `chat.api` → `Azy-MCP` → `N8N` pour les **data ops Google côté user** (Gmail/Calendar/Drive/Classroom). Cf. §2.4.5 pour les exceptions (OAuth, Stripe, OpenRouter, …).
- **Plugin Discord** = couche métier (recettes, échecs) au-dessus de Chatbot-Core
- **Chatbot-Core** = framework partagé (TenantResolver, Cogs, N8nClient)
- **N8N** est le SEUL à appeler **Google data APIs** (Gmail/Calendar/Drive/Classroom). chat.api appelle quand même : Google OAuth (login/callback uniquement), Stripe, OpenRouter, Qdrant — cf. §2.4.5.
- **Azy-MCP** est le point de passage obligé pour les outils Google côté **user data**
- **Azy-MCP** supporte 3 transports : stdio, WebSocket, REST API
- **chat.api est aussi appelé par les autres composants** (Azy-MCP, chatbot-core, n8n) en service-to-service via `X-Service-Token` pour résoudre tenant + tokens OAuth — cf. §2.4.4. Ce flux remontant est aussi important que la chaîne descendante.

---

## 2. Description des composants

### 2.1 Frontend (Web UI — `chat.vue`)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Interface utilisateur web pour chat conversationnel, settings user, dashboards owner/admin/superadmin |
| **Technologies** | **Vue 3 (Composition API, `<script setup>`)** + **Vuetify 3** + **TypeScript strict** + **Pinia** (setup-style stores) + **Vue Router 4** — **pas React** comme un précédent §2.1 le suggérait par erreur |
| **Repo** | `chat.vue` (anciennement `azy-front`) — sources dans `vue-app/src/` |
| **Build** | **Vite 4** — dev server `npm run dev` (port `VITE_DEV_SERVER_PORT`, fallback **3002**, pas 3000 ni 5173 default Vite), build `npm run build` → `vue-app/dist/` |
| **Communication** | (1) HTTPS REST vers chat.api via **axios** ; (2) **WebSocket MCP** pour le streaming chat ; **jamais** d'appel direct à Azy-MCP, n8n ou Google APIs |
| **Identité** | Firebase Auth Web SDK 11 (cf. §2.1.4) — le front est le SEUL composant à parler à Firebase pour le login |
| **Doc compagnon** | `docs/guides/INDEX-EXPERTS-PROGRAM-FLOW.md`, `docs/guides/frontend-reference-analyses.md`, `docs/guides/frontend-classroom-binding.md` (livrés par chat.api pour le périmètre RFC-080→084) |

#### 2.1.1 Stack technique détaillée

```
chat.vue (vue-app/)
├── Vue 3.3                 → Composition API, <script setup lang="ts">
├── Vuetify 3.8             → Component library (mdi-icons, theming)
├── Pinia 2.1               → State management (stores setup-style, pas options)
├── Vue Router 4.5          → Router avec guards beforeEach (auth + RBAC)
├── TypeScript 5.8 strict   → Pas de `any` toléré, on utilise `as unknown as Foo`
├── axios 1.6               → Client HTTP, interceptors request/response
├── firebase 11.6           → Auth Web SDK (login + JWT refresh + 2FA bridge)
├── ws 8.18                 → WebSocket client (MCP streaming chat)
├── marked 15 + dompurify 3 → Rendu Markdown sécurisé (`safeMarked()` helper)
├── highlight.js 11         → Coloration syntaxique code dans le chat
├── @vueuse/core 13         → Helpers réactifs (useStorage, useDebounce…)
├── lodash-es, date-fns, uuid, zod, vee-validate
├── vue-i18n 12 alpha       → I18n (FR par défaut, peu utilisé en V1)
└── @tanstack/vue-virtual + vue-virtual-scroller → Listes virtualisées (chat history)

Tests :
├── Vitest 1.6 + jsdom 24   → Tests unitaires composants/composables
├── @vue/test-utils 2.4     → mount() + stubs Vuetify (pas de plugin Vuetify dans les tests, voir §2.1.10)
├── @pinia/testing 0.1      → createTestingPinia()
└── Playwright 1.57         → E2E (uniquement off-Pi en CI, voir §2.1.10)
```

**Important pour les autres équipes** : pas de SSR, pas de Nuxt, pas de Pinia colada, pas de Composition store options-style. Si vous voyez `defineStore('x', () => { ... })` (factory function), c'est le pattern setup ; pas de `state/getters/actions` keys.

#### 2.1.2 Arborescence `vue-app/src/`

```
vue-app/src/
├── main.ts                  → Bootstrap : Vuetify, Pinia, Router, Firebase init
├── App.vue                  → Layout root (router-view + global toasts/dialogs)
│
├── views/                   → Pages (1 par route — ~80 vues)
│   ├── ModernChatView.vue   → Chat principal (page racine connectée)
│   ├── ChatStudioView.vue   → Variante chat avec panneaux étendus
│   ├── DashboardView.vue    → Dashboard user
│   ├── LoginView.vue / CreateAccountPage.vue / ForgotPasswordView.vue
│   ├── owner/               → Pages tenant-admin (whitelist LLM, expert personas, ...)
│   ├── admin/               → Pages superadmin (catalogue LLM, packages, audit)
│   ├── experts/             → Program Builder, sessions, dashboards
│   ├── google/              → Drive, Calendar, Gmail (consommés via chat.api)
│   └── settings/            → AiSettingsView (RFC-077), intégrations Google
│
├── components/              → Composants réutilisables
│   ├── modern-chat/         → Widgets chat (message bubbles, attachments, ...)
│   ├── experts/             → ExpertProgramBuilderView, MatiereProgramBuilder,
│   │                          ExpertProgramTargetPicker (Discord+Classroom)
│   ├── files/               → FileUploader, FileDropZone, FilePreview (RFC-014 client)
│   ├── google/drive,gmail/  → Cards Drive/Gmail
│   ├── llm/                 → AdminManagementModal (LLM packages), QualityPicker
│   ├── onboarding/          → ProfileForcingDialog (post-RFC-076 wipe)
│   ├── settings/            → AccountSettings, GoogleIntegrations
│   └── owner/               → Whitelist tenant, persona bindings
│
├── composables/             → Logique métier réactive (~80 composables)
│   ├── useAuth.ts           → Wrapper haut-niveau Firebase + tenant resolution
│   ├── useExpertChatRunner  → Runner LLM via WebSocket MCP (streaming)
│   ├── useReferenceAnalysis → RFC-084 — extraction structurée + persist
│   ├── useExpertProgramBuilder → RFC-080 — sub-flow par matière
│   ├── useExpertProgramDiscordBinding / useExpertProgramClassroomBinding
│   └── useToast, useCopyToClipboard, useFormValidation, ...
│
├── stores/                  → Pinia stores setup-style (~40 stores)
│   ├── user.ts              → Source de vérité user courant (uid, tenant, claims)
│   ├── modernChat (modules/)→ Sessions chat, messages, attachments
│   ├── llm.ts               → Catalogue LLM + tier/package effectif (RFC-076/077)
│   ├── userPreferences.ts   → Pref LLM + tenant_id local cache
│   ├── googleWorkspace.ts   → État Google connecté + scopes (RFC-070+083)
│   ├── promotions.ts        → RFC-061 promotions/matières (Discord)
│   ├── expertManagement.ts  → CRUD experts + quick-actions
│   └── conversation.ts, websocket.ts, notifications.ts, ...
│
├── services/                → Couche d'accès données (axios + Firebase + WS)
│   ├── api.ts               → Axios instance LEGACY (Bearer + X-Tenant-ID)
│   ├── apiService.ts        → Axios instance NEW (instance unique, mêmes headers)
│   ├── firebase.ts          → Init Firebase + export `firebaseAuth`
│   ├── authService.ts       → signIn/signUp/signOut + 2FA bridge RFC-075
│   ├── logoutService.ts     → Cleanup orchestré (FB + localStorage + stores)
│   ├── secureWebSocketService.ts → WS MCP avec attach JWT
│   ├── *Api.ts (~40)        → Wrappers REST par domaine
│   │                          (referenceAnalysisApi, expertResponsesApi,
│   │                           expertProgramsClassroomApi, llmServicesService, ...)
│   └── auth/, google/, providers/  → Sous-modules par domaine
│
├── router/index.ts          → Routes + guards (auth + 2FA + RBAC)
├── types/                   → Types TS partagés (calque des Pydantic back)
│   ├── referenceAnalysis.ts, expertResponses.ts, expertProgramBuilder.ts
│   ├── conversation.ts, message.ts, file.ts, llm/index.ts, ...
├── utils/
│   ├── apiErrors.ts         → mapBackendError() + BACKEND_ERROR_MESSAGES (cf. §2.1.6)
│   ├── sanitization.ts      → safeMarked() (marked + DOMPurify)
│   └── fileValidation.ts, ...
└── plugins/                 → Vuetify config + theme
```

**~80 vues / ~40 stores / ~80 composables / ~40 services *Api.ts** — la dette de surface est réelle, plusieurs vues sont legacy (`DashboardView` vs `DashboardViewRefactored`, `toolsStore` vs `toolsStoreHarmonized`). Le travail courant se fait sur **`ModernChatView`**, **`experts/*`** et **`settings/AiSettingsView`**.

#### 2.1.3 Patterns transverses

| Pattern | Convention | Exemple |
|---|---|---|
| **Stores Pinia** | Setup-style avec `defineStore('x', () => { ... })` retournant `{ state refs, computeds, actions }` | `stores/llm.ts`, `stores/userPreferences.ts` |
| **Composables** | `useFoo({ ...options })` retourne `{ refs, computeds, actions }` — testables isolément | `useReferenceAnalysis`, `useExpertProgramBuilder` |
| **Services API** | 1 fichier par domaine back, exporte `default { method1, method2 }`, types co-localisés | `services/expertResponsesApi.ts` |
| **Types** | Calque strict des schémas Pydantic back, **pas de `any`**. `as unknown as Foo` toléré pour cross-cast | `types/referenceAnalysis.ts:ExtractedData` ↔ back `ReferenceAnalysisRead` |
| **Erreurs back** | `mapBackendError(err, fallback)` lit `detail.error.code` typé → message FR via `BACKEND_ERROR_MESSAGES` | `utils/apiErrors.ts` (15 codes RFC-080/082/083/084) |
| **Markdown** | `safeMarked(md)` — marked + DOMPurify côté client, **jamais** `v-html` brut | `utils/sanitization.ts` |
| **Loading streams** | WebSocket MCP émet du `mcp_token` cumulatif (texte concaténé déjà) — **pas concaténer côté client** | `useExpertChatRunner.ts:run()` |

#### 2.1.4 Authentification — Firebase côté front (vue détaillée)

> Cette sous-section complète §2.4.3.A (Firebase JWT, vue chat.api). Côté chat.api la vérification se fait via firebase-admin SDK Python ; côté front c'est le **Firebase Auth Web SDK 11** qui pilote login + refresh + signOut.

##### A. SDK et bootstrap

`vue-app/src/services/firebase.ts` initialise l'app au démarrage :

```ts
import { initializeApp } from 'firebase/app'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,    // ex: authent-service.firebaseapp.com
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,      // authent-service
  storageBucket: ...,
  messagingSenderId: ...,
  appId: ...,
  measurementId: ...,
}

export const firebaseApp = initializeApp(firebaseConfig)
export const firebaseAuth = getAuth(firebaseApp)
await setPersistence(firebaseAuth, browserLocalPersistence)
```

**Persistance** : `browserLocalPersistence` (IndexedDB Firebase géré nativement). L'utilisateur reste loggé entre tabs et reloads tant que le refresh_token Firebase est valide (~30 jours).

**Important pour les autres équipes** : le `projectId` (`authent-service`) est **le même** que celui décrit côté chat.api §2.4.5.A. Un seul projet GCP partagé, une seule audience JWT, un seul OAuth client web.

##### B. Méthodes de signin supportées

| Méthode | Provider | Service | Notes |
|---|---|---|---|
| Email/password | Firebase native | `signInWithEmailAndPassword` | Login historique (LoginView) |
| Google OAuth | `GoogleAuthProvider` | `signInWithPopup` | Bouton « Continuer avec Google ». Attention : ce flow est **distinct** du flow OAuth scopes Google chat.api (§2.4.5.B). Ici on récupère juste l'identité, pas les scopes Gmail/Drive/Classroom. |
| Microsoft | `MicrosoftAuthProvider` (custom OAuth wrapper) | `microsoftAuthService` | Flow custom (pas Firebase natif), redirige vers `/api/auth/microsoft/...` côté back |
| ~Apple~ | non livré V1 | — | Bouton placeholder dans LoginView |

Code : `services/authService.ts` (~500 lignes), expose `signInWithEmailAndPassword`, `signInWithGoogle`, `signOut`, `getCurrentUser`.

##### C. Cycle de vie du JWT — attach automatique aux requêtes API

Toutes les requêtes vers chat.api passent par `services/api.ts` ou `services/apiService.ts` (deux instances axios coexistant — dette legacy). **Les deux** implémentent un interceptor request qui :

```ts
// services/api.ts:27-46 (extrait simplifié)
api.interceptors.request.use(async (config) => {
  if (firebaseAuth?.currentUser) {
    const token = await firebaseAuth.currentUser.getIdToken()  // refresh auto si expiré
    config.headers['Authorization'] = `Bearer ${token}`
  }
  // X-Tenant-ID : posé pour les routes /api/owner/*, /api/admin/*, /api/n8n/*
  // (sur /api/users/me/*, /api/conversations/*, etc., chat.api lit le tenant
  //  depuis le custom claim du JWT — le header est ignoré)
  if (tenantId) {
    config.headers['X-Tenant-ID'] = tenantId
  }
  return config
})
```

**Garanties** :
- `getIdToken()` (sans argument) **rafraîchit automatiquement** le token si `expires_in < 5 min`. Pas de gestion manuelle de l'expiration côté caller.
- `getIdToken(true)` force un refresh même si le token est encore valide — utilisé après une mise à jour de custom claims (changement de rôle, provisioning post-invitation) pour récupérer les nouvelles claims sans re-login.
- Si l'user n'est pas loggé → header `Authorization` absent → chat.api retourne 401 → l'intercepteur response (cf. ci-dessous) déclenche une redirection `/login`.

##### D. Custom claims lus côté front

Quand chat.api provisionne un user (ou met à jour son rôle), il pose ces claims via `firebase-admin.auth().setCustomUserClaims()`. Le front les lit après `getIdToken()` :

```ts
const tokenResult = await firebaseAuth.currentUser?.getIdTokenResult()
const claims = tokenResult?.claims as {
  tenant_id?: string         // posé après auto-tenant-provisioning
  roles?: string[]           // ex: ['owner', 'contributor']
  is_superadmin?: boolean
  email_verified?: boolean
}
```

`stores/user.ts` hydrate ces claims dans le store global au login + à chaque refresh, et expose `tenantId`, `roles`, `isSuperadmin` aux composants/guards.

**Implication** : le front ne demande **jamais** au back « quel est mon tenant ? ». Le tenant est dans le JWT, le front le lit, et le passe en `X-Tenant-ID` quand pertinent (cf. C). Si une claim est absente → user en cours de provisioning → le front affiche un loader « Configuration de ton compte… ».

##### E. 2FA email (RFC-075) — bridge front

Quand un superadmin (ou owner/admin via phase C) appelle un endpoint sensible (`/api/admin/*`), chat.api retourne `403 two_factor_required` avec un `verification_id`. Le front réagit :

```
1. Catch 403 two_factor_required (interceptor response axios)
2. Affiche TwoFactorVerificationDialog avec input 6 chiffres
3. POST /api/auth/2fa/verify { verification_id, code } → 200 + { session_token }
4. Stockage : localStorage['2fa_session'] = session_token (TTL 5 min côté back)
5. Le caller axios re-tente la requête avec un header X-2FA-Session: <session_token>
6. À chaque navigation, un guard de routeur ré-affiche le dialog si l'action requiert 2FA
   et que la session est expirée
```

Code : `services/auth/TokenManagementService.ts` + `components/auth/TwoFactorVerificationDialog.vue`.

**localStorage `2fa_session`** : c'est la SEULE info auth-sensible que le front stocke en clair (pas le JWT — Firebase gère ça en IndexedDB chiffré). À nettoyer par `logoutService.ts` au sign-out.

##### F. Logout — orchestration

`services/logoutService.ts:logoutCleanly()` :

```
1. firebaseAuth.signOut()                    → invalide le refresh_token côté Firebase
2. localStorage.removeItem('2fa_session')    → purge bridge 2FA
3. Pinia : reset de tous les stores via $reset() (boucle sur stores/index)
4. WebSocket MCP : close() explicite (sinon WS reste sur l'ancien JWT)
5. router.push('/login')                     → redirection
```

Si une étape échoue (ex: WS déjà closed), on log mais on continue — le but est que l'état suivant soit propre quoi qu'il arrive.

##### G. Login Sync Manager (cross-tab)

`services/loginSyncManager.ts` écoute `firebaseAuth.onAuthStateChanged` ET un `BroadcastChannel('auth-sync')`. Quand un utilisateur se logue dans un onglet, les autres onglets reçoivent l'event et hydratent leur user store sans relogin. Quand il se délogue, idem côté logout. **Pas d'API interne** — purement client-side.

##### H. Différence entre flow Firebase (identité) et flow OAuth Google chat.api (scopes data)

Confusion fréquente : il y a **deux flows OAuth Google distincts** côté front :

| Flow | But | Driver | Trigger UI |
|---|---|---|---|
| Firebase `signInWithPopup(GoogleAuthProvider)` | **Identité** (savoir qui est l'user) — récupère `email`, `displayName`, `photoURL` | Firebase Auth SDK | Bouton « Continuer avec Google » sur `LoginView` |
| chat.api `/api/auth/google/login?services=...` (cf. §2.4.5.B) | **Scopes data Google** (Gmail/Calendar/Drive/Classroom) — stocke access_token + refresh_token côté chat.api Redis | Redirection navigateur vers `accounts.google.com` puis callback chat.api | Boutons `GoogleIntegrations.vue` dans `Settings → Intégrations Google` |

Les deux peuvent être combinés (un user logué via Firebase Google peut ensuite consenter aux scopes Classroom via le 2e flow). Le front gère explicitement ces deux flows séparés — ne pas les confondre côté back / DevOps quand on debug une 401/403.

#### 2.1.5 WebSocket MCP — streaming chat

Le chat conversationnel n'utilise **pas** REST — il passe par WebSocket vers chat.api qui relaie vers Azy-MCP (transport WebSocket). Détails côté front :

```
User tape un message → ModernChatView
  ↓
useExpertChatRunner.run(prompt, { onChunk })
  ↓
secureWebSocketService.send({ type: 'mcp.execute', conversation_id, prompt, ... })
  ↓
chat.api WS endpoint /ws/mcp (Bearer JWT validé au handshake)
  ↓
chat.api → Azy-MCP (REST `/api/tools/{id}/execute`) ou MCP WS direct selon l'opération
  ↓
Stream remontant : événements WS de type `mcp_token` arrivent côté front
  ├── { type: 'mcp_token', cumulative_text: 'Bonjour', sequence: 1 }
  ├── { type: 'mcp_token', cumulative_text: 'Bonjour, je', sequence: 2 }
  ├── ... (incrémental)
  └── { type: 'mcp_done', final_text: '...', metadata: {...} }
```

**Sémantique cumulative** : chaque event `mcp_token` porte le **texte complet déjà accumulé**, pas un delta. Le front remplace simplement la ref `streamingText.value = event.cumulative_text` à chaque event — pas de concaténation. C'est un point clé que les autres équipes confondent parfois.

**Reconnexion** : `secureWebSocketService` a un retry exponentiel + heartbeat ping/pong toutes les 30s. Si le JWT expire pendant la connexion (rare car WS courts), le back ferme avec code 4401 → front refresh JWT + reconnect.

#### 2.1.6 Gestion d'erreurs — `apiErrors.ts`

Côté chat.api, RFC-080+083+084 ont introduit un format d'erreur typé :

```jsonc
{
  "detail": {
    "error": {
      "code": "classroom_requires_edu_domain",
      "message": "Workspace must be EDU",        // EN, debug only
      "details": { "domain": "company.com" }     // libre
    }
  }
}
```

Le front mappe ces codes en messages FR via `utils/apiErrors.ts:BACKEND_ERROR_MESSAGES` (15 codes connus actuellement) :

```ts
import { mapBackendError } from '@/utils/apiErrors'

try {
  await classroomApi.syncProgram(...)
} catch (err) {
  showError(mapBackendError(err, 'Sync impossible — réessaie.'))
}
```

Cascade : `code` typé → message FR mappé → fallback sur `error.message` EN brut → `detail.message` → `error.message` axios → fallback générique. Spécial : `details.orphan_codes` (RFC-084) enrichit le message (« matières concernées : … »).

**Pour les autres équipes** : si vous ajoutez un code `detail.error.code` côté chat.api, **prévenez le front** pour qu'on l'ajoute au catalogue, sinon l'utilisateur voit le message EN brut.

#### 2.1.7 Routing + guards

`router/index.ts` (~100 lignes — faible parce que les routes sont co-localisées avec leurs `views/`). Les guards `beforeEach` font, dans l'ordre :

1. **Init Firebase** : await `firebaseAuth.authStateReady()` (sinon `currentUser` peut être null au boot).
2. **Auth gate** : si la route a `meta.requiresAuth=true` et l'user n'est pas logué → redirect `/login?redirect=<from>`.
3. **2FA gate** : si la route a `meta.requires2FA=true` (ex: `/admin/*`) et localStorage `2fa_session` absent ou expiré → ouvre `TwoFactorVerificationDialog` au mount.
4. **RBAC** : si la route a `meta.roles=['owner']`, vérifie `userStore.roles.includes('owner')` → sinon redirect `/forbidden`.
5. **Tenant readiness** : si la route nécessite un tenant et `userStore.tenantId` est absent (user en cours de provisioning) → affiche un loader.

Pas de SSR, pas de hydration — purement client-side.

#### 2.1.8 Convention « 2 instances axios » (dette legacy)

Pour info historique : `services/api.ts` (legacy) et `services/apiService.ts` (refactor RFC-079) coexistent. Les deux attachent `Authorization: Bearer` + `X-Tenant-ID` mais via deux factories distinctes. Le code récent (RFC-080+) utilise `apiService.ts`. Tout le code legacy reste sur `api.ts`. Pas de migration en cours — c'est noté comme dette.

**Implication débug** : si une route ne reçoit pas le bon token, vérifier laquelle des deux instances l'a envoyée (les loggers diffèrent : `[ApiService][TENANT]` vs `[api]`).

#### 2.1.9 Variables d'environnement (front, build-time)

Toutes préfixées `VITE_` pour être inlinées par Vite dans le bundle :

| Variable | Description | Exemple dev |
|---|---|---|
| `VITE_SAVVY_WIZARD_API_URL` | URL chat.api (REST + WS) | `https://apidev.azy.solutions` |
| `VITE_FIREBASE_API_KEY` | Firebase Web API key | `AIza...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Domaine Auth | `authent-service.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Project GCP | `authent-service` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket | `authent-service.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM sender | (numérique) |
| `VITE_FIREBASE_APP_ID` | Web app ID | `1:...:web:...` |
| `VITE_FIREBASE_MEASUREMENT_ID` | GA4 measurement | `G-...` (optionnel) |
| `VITE_SAVVY_WIZARD_WS_URL` | URL WebSocket explicite (par défaut dérivée de `VITE_SAVVY_WIZARD_API_URL`) | `wss://apidev.azy.solutions/ws` |
| `VITE_DEV_SERVER_PORT` | Port du dev server Vite | `3002` (fallback) |

**Pas** de `VITE_MCP_SERVER_URL` côté front — le front ne parle JAMAIS à Azy-MCP directement. Donc la discrepancy port `8002`/`8765` (cf. §2.4.10) **n'impacte pas le front**.

#### 2.1.10 Tests — stratégie spécifique « pas de Chromium sur le Pi »

L'environnement de dev tourne sur Raspberry Pi (architecture ARM, pas de Chromium binary disponible). Conséquence :

| Type | Outil | Lieu d'exécution |
|---|---|---|
| **Unit** | Vitest 1.6 + jsdom + @vue/test-utils | Local (Pi) — `npx vitest run` |
| **Composants Vuetify** | mount avec `stubs` Vuetify (pattern dans `MatiereSelector.spec.ts`, `ReferenceUploadStep.spec.ts`) — **pas** `plugins: [vuetify]` (CSS import casse jsdom) | Local |
| **E2E Playwright** | Off-Pi en CI (GitHub Actions runner Linux x64) | CI uniquement |
| **Tests utilisateurs manuels** | Recette staging `dev.azy.solutions` | Avant chaque release |

Doc complète : `docs/guides/tests/automated-testing-strategy.md`.

**Pour les autres équipes** : si vous voulez un test cross-stack en local sur le Pi, prévoir Vitest ou pytest — pas Playwright. Pour Playwright on attend la CI.

#### 2.1.11 Domaines fonctionnels (vue front)

| Domaine | Vues principales | RFC | État |
|---|---|---|---|
| **Auth** | LoginView, CreateAccountPage, ForgotPasswordView, ConfirmInvitePage, GoogleCallbackView | RFC-075 (2FA) | ✅ |
| **Onboarding** | ProfileForcingDialog (post-RFC-076 wipe), `Settings → AI` setup | RFC-076/077 | ✅ |
| **Chat** | ModernChatView, ChatStudioView, ConversationView | RFC-014/074/078 | ✅ |
| **Experts** | ExpertsDemo, ExpertProgramBuilderView, MatiereProgramBuilder, ExpertProgramSessionsView, ExpertProgramTargetPicker | RFC-080/081/082/083/084 | ✅ |
| **Settings** | AiSettingsView, GoogleIntegrations, AccountSettings | RFC-077/083 | ✅ |
| **Owner** | LLMWhitelistView, ExpertPersonaBindingsView, DiscordSettingsView, PromotionsListView | RFC-059/061/079/081 | 🟡 (Promotions partial) |
| **Admin** | AdminAccountManagementView, AdminMonitoringView, LLMCatalogue (models/packages/tags) | RFC-075/076/077 | ✅ |
| **Google** | GoogleDriveView, GoogleCalendarView, EmailManagerView | RFC-014/070 | ✅ |
| **Documents** | DocumentsPage, DocumentDetailPage | RFC-014 | ✅ |
| **Invitations** | InvitationManagementView, InvitationSendView, InvitationHistoryView | — | ✅ |
| **Gamification** | (intégré dans dashboards) | RFC-067 | 🔄 |

#### 2.1.12 RFCs implémentés (vue front)

| RFC | Statut | Surface front |
|---|---|---|
| **RFC-014** | ✅ | FileUploader, FilePreview, DocumentsPage |
| **RFC-040** | ✅ | Trigger purge GDPR depuis AccountSettings, gating UI |
| **RFC-059** | ✅ | Quotas affichés dans AdminManagementModal et picker rôles Discord |
| **RFC-061** | 🟡 | PromotionsListView/DetailView non alignés avec les 18 endpoints back (gap connu) |
| **RFC-074** | ✅ | UI student corrections + moderation chat |
| **RFC-075** | ✅ | TwoFactorVerificationDialog + escape hatch logout depuis forcing dialog |
| **RFC-076** | ✅ | Catalogue LLM côté admin + filtrage user-facing (cf. §1.9 plan tests) |
| **RFC-077** | ✅ | Forcing dialog packages, AiSettingsView, QualityPicker |
| **RFC-079** | ✅ | LLM resolved depuis package via `/api/user/preferences/effective` |
| **RFC-080** | ✅ | useExpertProgramBuilder, persistance JSONB par parcours |
| **RFC-081** v3 | ✅ | ExpertPersonaBindings UI (3 personas distincts : bot/role/audience) |
| **RFC-082** | ✅ | ExpertProgramTargetPicker mode Discord (cascade guild/promo/sujet) |
| **RFC-083** V1 | ✅ | ExpertProgramTargetPicker mode Classroom (lazy load courses) — sync wiring V2 attend back PR #2356 |
| **RFC-084** | ✅ | ExpertProgramBuilderView 4 phases, ReferenceUploadStep, MatiereProgramTabs, MatiereProgramBuilder |

#### 2.1.13 Limites connues / dette technique front

- **2 instances axios** (`api.ts` legacy + `apiService.ts`) — pas de migration en cours, dette acceptée.
- **2 stores LLM tools** (`toolsStore.ts` legacy + `toolsStoreHarmonized.ts`) — idem.
- **2 dashboards** (`DashboardView` + `DashboardViewRefactored`) — idem.
- **Vue I18n alpha** — non utilisé en V1, FR hardcodé. Refonte i18n à prévoir si EN demandé.
- **Pas de Chromium sur Pi** → tests E2E Playwright uniquement en CI (cf. §2.1.10).
- **PromotionsListView/DetailView** non alignés avec les 18 endpoints back RFC-061 (migration UI à faire).
- **PDF/DOCX upload** dans Program Builder Phase 0 (RFC-084) descope V1 — V1 limité à `.txt/.md/.csv/.json/.html/.xml` (text-readable client-side via `FileReader`). Réintroduire `pdfjs-dist` + `mammoth` quand la priorité revient.

#### 2.1.14 Relations (front → autres équipes)

- **chat.api** : seul interlocuteur. REST pour CRUD/queries, WS pour streaming chat. Le front consomme **OpenAPI** (`/openapi.json`) en référence — pas de contrat séparé. Codes erreur typés via `apiErrors.ts` (cf. §2.1.6).
- **Firebase Auth** : login + JWT auto-refresh + signOut. Aucune autre équipe ne parle à Firebase côté client (chat.api le fait via Admin SDK, voir §2.4.3.A).
- **Azy-MCP** : **pas d'appel direct** (CORS interdirait de toute façon). Toujours via chat.api.
- **n8n** : **pas d'appel direct**. Toujours via chat.api → Azy-MCP → n8n.
- **Google APIs** : **pas d'appel direct** (sauf via Firebase `GoogleAuthProvider` pour l'identité — cf. §2.1.4.H). Les data ops (Gmail/Drive/Calendar/Classroom) passent par chat.api → Azy-MCP → n8n.
- **Discord** : **pas d'accès direct**. Le front pilote des bindings Discord (guild_id, promotion_id, subject_id) via chat.api ; l'exécution effective côté Discord passe par chatbot-core via Redis Streams (§2.5).

### 2.2 Discord Bot (vue fonctionnelle)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Interface conversationnelle via Discord |
| **Implémentation** | Chatbot-Core (voir section 2.5) |
| **Communication** | Discord Gateway + Redis Streams (commandes backend) |
| **Fonctionnalités** | Chat, commandes slash, onboarding, voice realtime |

```
Discord Bot
├── Commandes slash     → /voice, /settings, /help
├── Conversations       → Messages dans channels avec @mention
├── Threads             → Discussions contextuelles
├── Onboarding          → DM multi-étapes (RFC-069)
├── Voice Realtime      → Conversations vocales IA (RFC-078)
└── Backend Commands    → Exécution commandes via Redis (RFC-062)
```

**Note :** Le bot Discord est implémenté par le projet Chatbot-Core (section 2.5).
Les commandes du backend (création channels, gestion rôles) passent par Redis Streams.

### 2.3 Plugins Discord (Couche Applicative)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Bots Discord spécialisés par domaine métier |
| **Technologies** | Python 3.11+, chatbot-core (framework), discord.py |
| **Communication** | Discord Gateway + n8n webhooks + Redis |
| **Fonctionnalités** | Conversations IA, commandes slash, tools métier, intégrations |

Les **Plugins** sont des applications Discord autonomes qui utilisent `chatbot-core` comme framework.
Chaque plugin apporte une logique métier spécifique (recettes, échecs, template générique).

#### Plugins existants

| Plugin | Domaine | Spécificités |
|--------|---------|--------------|
| **plugin-recipes** | Recettes de cuisine | DocumentService, RecipeImageHandler, ShoppingListService, CartIntegration |
| **plugin-chess** | Jeux d'échecs | ScoreSheetHandler (OCR), Learning module, GameService |
| **plugin-azy** | Template générique | Base minimale pour nouveaux plugins |

#### Architecture d'un plugin

```
plugin-{domain}/
├── main.py                      → Point d'entrée, initialisation bot
├── src/
│   ├── __init__.py              → Classe Plugin principale ({Domain}Plugin)
│   ├── config.py                → Configuration spécifique (PluginConfig)
│   ├── branding.py              → BOT_NAME, BOT_COLOR, BOT_EMOJI
│   ├── commands/                → Commandes slash Discord
│   │   ├── __init__.py          → setup_commands()
│   │   ├── search.py            → /search, /find
│   │   ├── document.py          → /extraire, /mes-documents
│   │   └── admin.py             → /reload-config
│   ├── services/                → Services métier locaux
│   │   ├── document_service.py  → Traitement documents (RFC-014)
│   │   ├── credits_service.py   → Gestion crédits utilisateur
│   │   ├── search_service.py    → Recherche Qdrant
│   │   └── redis_service.py     → Cache et sessions
│   ├── tools/                   → Tools MCP locaux
│   │   ├── adapters/            → WebhookAdapter pour n8n
│   │   ├── executor.py          → ActionExecutor
│   │   └── local.py             → LOCAL_DISCORD_TOOLS
│   ├── conversation.py          → ConversationService (RFC-030)
│   ├── mentions.py              → Handler @mentions
│   └── views/                   → UI Discord (embeds, buttons, modals)
├── config/
│   └── domains.yaml             → Domaines d'intention (RFC-031)
└── requirements.txt             → Dépendances (chatbot-core, azy-mcp)
```

#### Relation Plugin ↔ Chatbot-Core

Le plugin **hérite et utilise** les composants de chatbot-core :

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Plugin (ex: plugin-recipes)                  │
│                                                                      │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │
│  │ RecipesPlugin  │  │ ConversationSvc│  │ Services métier        │ │
│  │ (Plugin class) │  │ (local)        │  │ DocumentSvc, SearchSvc │ │
│  └───────┬────────┘  └───────┬────────┘  └───────────┬────────────┘ │
│          │                   │                       │              │
└──────────│───────────────────│───────────────────────│──────────────┘
           │                   │                       │
           ▼                   ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Chatbot-Core (framework)                     │
│                                                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐  │
│  │ BotFactory │ │ N8nClient  │ │ TenantRes. │ │ DiscordCommand   │  │
│  │            │ │            │ │ (RFC-079)  │ │ Listener (062)   │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────────┘  │
│                                                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐  │
│  │ Onboarding │ │ VoiceReal- │ │ DMVerific- │ │ ResyncSubscriber │  │
│  │ Cog (069)  │ │ timeCog 78 │ │ ationCog   │ │ (RFC-060)        │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

#### Initialisation (main.py)

```python
# 1. Charger la config
config = PluginConfig.from_env()

# 2. Créer N8nClient
n8n_client = N8nClient(base_url=config.n8n_base_url, ...)

# 3. Créer le bot via BotFactory (chatbot-core)
bot = BotFactory.create(config, intents=intents)

# 4. Créer et charger le plugin
plugin = RecipesPlugin(bot, config, n8n_client)
bot.load_plugin(plugin)

# 5. on_ready: RFC-079 TenantResolver
@bot.on_ready_callback
async def on_ready():
    tenant_resolver = TenantResolver(n8n_client)
    tenant_config = await tenant_resolver.resolve(bot_user_id, guild_id)
    n8n_client.set_tenant_id(tenant_config.tenant_id)
    n8n_client.resolved_models = tenant_config.models  # Accès global aux modèles LLM

    # RFC-062: DiscordCommandListener (commandes backend)
    command_listener = DiscordCommandListener(bot=bot, redis_url=config.redis_url)
    await command_listener.start()

    # Cogs chatbot-core: OnboardingCog, VoiceRealtimeCog, DMVerificationCog
    # ...
```

#### Flux de conversation (@mention)

```
User @mention "Trouve-moi une recette de pizza"
    ↓
Plugin.MentionHandler (mentions.py)
    ↓
ConversationService (conversation.py)
    ├── ToolSearcher (Qdrant tools_index) → pré-filtre tools pertinents
    ├── IntentDetector → détecte intention "search_recipe"
    └── DialogManager → gère le contexte multi-tours
    ↓
ActionExecutor (tools/executor.py)
    ↓
WebhookAdapter (tools/adapters/webhook.py)
    ↓
n8n webhooks (mcp-recipe-search, mcp-entity-*)
    ↓
Services externes (Qdrant, LLM, Google APIs)
    ↓
Réponse formatée → Discord embed
```

#### Configuration (PluginConfig)

| Variable | Description | Exemple |
|----------|-------------|---------|
| `BOT_NAME` | Nom affiché du bot | "Bot Appetit" |
| `ENTITY_TYPE` | Type d'entité métier | "recipe", "game" |
| `DISCORD_TOKEN` | Token du bot Discord | - |
| `DISCORD_GUILD_ID` | ID du serveur principal | 1234567890 |
| `N8N_BASE_URL` | URL base webhooks n8n | http://pi6.local:5678 |
| `N8N_PROJECT_ID` | ID projet n8n | "bot-appetit" |
| `REDIS_URL` | Redis pour sessions/cache | redis://localhost:6379/2 |
| `QDRANT_TOOLS_URL` | URL Qdrant pour ToolSearcher | http://localhost:6333 |
| `QDRANT_TOOLS_COLLECTION` | Collection des tools | "tools_index" |

#### RFCs implémentés côté Plugin

| RFC | Statut | Description |
|-----|--------|-------------|
| **RFC-014** | ✅ | Document Processing (DocumentService, OCR) |
| **RFC-030** | ✅ | ConversationService local (NLU/Dialog/NLG) |
| **RFC-031** | ✅ | Intent Domains (domains.yaml) |
| **RFC-042** | ✅ | User Intuitions (préférences via azy-mcp) |
| **RFC-045** | ✅ | Image Handler (RecipeImageHandler, ScoreSheetHandler) |
| **RFC-050** | ✅ | Qdrant Tools verification au démarrage |
| **RFC-057** | ✅ | Session Context Manager |
| **RFC-063** | ✅ | Architecture refactoring (services/, tools/, conversation/) |
| **RFC-079** | ✅ | TenantResolver + resolved_models sur n8n_client |

#### Dépendances (requirements.txt)

```
# Framework (staging branch)
git+https://github.com/fsebbah/chatbot-core.git@staging
git+https://github.com/fsebbah/azy-mcp.git@staging

# chatbot-core >= 0.8.79 requis pour:
# - RFC-062 DiscordCommandListener.get_roles
# - RFC-079 TenantResolver
```

### 2.4 API Backend (chat.api)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Point d'entrée REST/WebSocket pour le frontend, source de vérité multi-tenant, orchestrateur des services externes |
| **Technologies** | **Python 3.13 / FastAPI** (pas Node.js), async SQLAlchemy + asyncpg, Alembic, Celery, Redis, Pydantic v2 |
| **Port** | 8000 (uvicorn) |
| **Repo** | `chat.api` |
| **Doc API** | `/docs` (Swagger UI) + `/redoc` + `/openapi.json` |

#### 2.4.1 Stack technique

```
chat.api
├── FastAPI            → Routes, validation Pydantic, OpenAPI auto-généré
├── async SQLAlchemy   → ORM async, AsyncSession via app.multi_tenant.database.get_db()
├── asyncpg            → Pool PostgreSQL avec NullPool + async_creator (multi-tenant safe)
├── Alembic            → Migrations versionnées (public + per-tenant)
├── Celery             → Workers async pour tâches background
├── Redis              → Cache tokens OAuth + Pub/Sub + Streams discord:commands/results
├── Pydantic v2        → Schemas avec extra="forbid" en input
├── httpx              → Client HTTP async pour appels MCP/Google/n8n
├── Firebase Admin SDK → Vérification JWT user
└── pytest + asyncio   → Tests
```

#### 2.4.2 Architecture multi-tenant (PostgreSQL schemas)

**Spécificité chat.api importante** : chaque tenant a son propre **schema PostgreSQL** (`tenant_<TENANT_ID>`), pas une simple colonne `tenant_id`. Les autres équipes voient les services chat.api comme des endpoints REST mais derrière, c'est :

```
PostgreSQL (1 base, N schemas)
├── public                    → Tables cross-tenant
│   ├── tenants               → Catalogue des tenants
│   ├── users                 → Comptes user (Firebase UID)
│   ├── experts               → Catalogue d'experts (cross-tenant)
│   ├── expert_personas       → RFC-081 — personas tenant-wide
│   ├── expert_persona_bindings → RFC-081 — channel_kind ∈ {discord_guild, web_default, google_classroom, mcp}
│   ├── expert_question_responses → RFC-080 — réponses Quick-Actions
│   ├── reference_analyses    → RFC-084 — extraction multi-matière
│   ├── tenant_discord_servers → Mapping guild_id ↔ tenant_id
│   ├── tenant_discord_plugin_packages → RFC-079 — packages LLM par guild
│   ├── service_token_usage_logs → Audit appels n8n (X-Service-Token)
│   ├── admin_audit_log       → RFC-075 — audit superadmin
│   └── llm_models, llm_packages, llm_classes → RFC-076/077
│
└── tenant_XXXXXXXX (× N)     → Schemas isolés par tenant
    ├── conversations, messages
    ├── permissions, roles, role_permissions
    ├── tenant_users, user_permissions, tenant_user_permissions
    ├── google_workspace_configs, google_workspace_sync_logs
    ├── google_emails, google_calendars, google_calendar_events, ...
    ├── llm_configurations, llm_usage_stats
    ├── custom_prompts, expert_user_preferences
    ├── promotions, matieres, promotion_enrollments (RFC-023 + RFC-061)
    ├── plugin_descriptors
    └── alembic_version       → Version de migration de CE schema
```

**Implications pour les autres équipes** :
- Les **opérations user-facing** (lecture/écriture conversations, settings, ...) tapent le schema tenant — `search_path = tenant_<X>, public`
- Les **opérations n8n callbacks** (résolveurs) tapent souvent `public` car cross-tenant par nature
- Le `tenant_id` est **toujours extrait du token** (Firebase JWT pour user, X-Service-Token pour n8n) — **jamais accepté en query/body**
- **Migrations** : 2 chaînes alembic distinctes (head unique en V1 = `<descriptive_slug>`). Le script `scripts/migrations/upgrade_all_schemas.sh` applique sur public + tous les `tenant_*` schemas

#### 2.4.3 Authentification — 4 mécanismes coexistants

chat.api est l'autorité d'authentification du système. Tous les autres composants (Azy-MCP, chatbot-core, n8n, plugins Discord) délèguent à chat.api la vérification des identités utilisateur et la résolution des tokens OAuth tiers.

##### A. Firebase JWT (utilisateurs front)

| Aspect | Détail |
|---|---|
| Header | `Authorization: Bearer <firebase_id_token>` |
| Émetteur | Firebase Auth (projet GCP `authent-service`) |
| Vérification | `firebase-admin` SDK Python — vérifie signature + expiration + audience |
| Code | `app/auth/dependencies/auth_dependencies.py` — `get_current_user`, `get_auth_context` |
| Extraction | `tenant_id` (custom claim) + `user_id` (Firebase UID, sub) + `email` |
| Custom claims | `tenant_id`, `roles[]`, `is_superadmin` — posés par chat.api lors du provisioning |
| Refresh | Géré côté front via `firebase.auth().currentUser.getIdToken(true)` — chat.api n'a rien à faire |

**Cas d'usage** : tout endpoint `/api/users/me/*`, `/api/conversations/*`, `/api/owner/*`, `/api/admin/*` (qui ajoute la vérif 2FA en plus pour superadmin).

**Provisioning** : un user créé via Firebase peut être (a) **rattaché automatiquement** à un tenant via `auto_tenant_provisioning_service.py` quand son email matche le `google_workspace_configs.domain` d'un tenant existant, ou (b) **invité explicitement** via le flow `/api/invitations/*`.

##### B. Service Token (service-to-service)

| Aspect | Détail |
|---|---|
| Headers | `X-Service-Token: <token_secret>` + `X-Tenant-ID: <tenant_id>` |
| Émetteur | chat.api lui-même (admin provisionne, chaque service a son propre token) |
| Vérification | `app/services/service_token_manager.py:ServiceTokenManager.verify` |
| Storage | Table `public.service_tokens` (table à confirmer, ou config — non encore industrialisée) |
| Audit | `public.service_token_usage_logs` — chaque appel logué avec `service_name`, `action`, `tenant_id`, `result`, `duration_ms` |
| Renouvellement | Manuel (rotation côté admin, pas d'expiration auto en V1) |

**Consommateurs** :
- **chatbot-core** : appel `/api/n8n/tenants/resolve` au boot pour récupérer le tenant + package LLM
- **Azy-MCP** : appel `/api/n8n/google/token?service=<svc>&user_id=<uid>` à chaque opération Google (résolveur token avec auto-refresh)
- **Azy-MCP** : appel `/api/n8n/experts/{id}/resolve` pour résoudre persona expert × canal
- **n8n** : appel `/api/n8n/*` pour les workflows qui ont besoin de cross-référencer la DB chat.api
- **Scripts admin** : appels CLI / déploiement

**Important** : `tenant_id` est **toujours** lu depuis `X-Tenant-ID` header (validé contre le scope du Service Token), **jamais** depuis la query string ou le body. Un Service Token compromis pour un tenant ne donne pas accès aux autres.

**Précision pour le front (cf. §2.1.4.C)** : le middleware `app/middleware/tenant_middleware.py` priorise les sources de tenant dans cet ordre : `X-Tenant-ID` header → JWT custom claim → query param (legacy, déprécié). Donc le front qui pose `X-Tenant-ID` sur **toutes** les requêtes (pas seulement `/api/owner/*` / `/api/admin/*` / `/api/n8n/*`) est OK et même préférable — c'est explicite et évite l'ambiguïté quand un user a accès à plusieurs tenants. La règle « le tenant est dans le JWT, le front n'a pas besoin de le poser » reste vraie pour les routes user simples, mais ne nuit pas si le header est présent — il sera juste validé contre la claim et doit matcher.

##### C. OAuth Google (flow utilisateur — chat.api ↔ Google direct)

C'est **chat.api lui-même qui parle directement à `accounts.google.com` et `googleapis.com/oauth2/v4/token`** pour le flow OAuth. Pas via Azy-MCP, pas via n8n. Détail complet en §2.4.5 ci-dessous.

##### D. 2FA email (superadmin / owner / admin)

| Aspect | Détail |
|---|---|
| Flow | RFC-075 — un code 6 chiffres envoyé par email, valide 5 min |
| Code | `app/services/auth/two_factor_email.py`, routes `app/api_routes/auth/two_factor_routes.py` |
| Storage Redis | `2fa:verif:<verification_id>` (TTL 5 min), `2fa:attempts:<uid>:<action>` (TTL 10 min, max 3), `2fa:cooldown:<target_uid>` (TTL post-revoke), `2fa:session:<firebase_uid>` |
| Middleware | `Superadmin2FAMiddleware` enforced sur les routes `/api/admin/*` du superadmin |
| Audit | `public.admin_audit_log` — toute action 2FA tracée (succès, échec, rate-limit) |

→ Étendu aux rôles `owner` et `admin` (RFC-075 phase C) au-delà du superadmin initial.

**Flow exact back ↔ front** (précision pour §2.1.4.E) :

```
1. Front fait un appel /api/admin/<route_protégée>
2. Superadmin2FAMiddleware → 403 (sans verification_id, juste un code typé)
3. Front catch le 403 + appelle POST /api/auth/2fa/initiate { action: "<route>" }
4. Back génère + envoie code par email + retourne 200 { verification_id, masked_email, expires_at }
5. Front affiche TwoFactorVerificationDialog avec le verification_id en hidden
6. User saisit le code 6 chiffres
7. Front appelle POST /api/auth/2fa/verify { verification_id, code }
8. Back valide, crée session 2fa:session:<uid>, retourne 200 { session_token, expires_at }
9. Front re-tente la requête initiale avec X-2FA-Session: <session_token>
10. Middleware accepte la session valide → 200
```

→ **Le `verification_id` ne vient PAS dans la 403** — il faut le POST `/api/auth/2fa/initiate` séparé (étape 3) pour le récupérer. C'est par design : la 403 doit rester silencieuse sur les détails du flow 2FA pour ne pas leaker à un attaquant qui force des routes admin.

→ **Important pour les autres équipes** : Azy-MCP et chatbot-core sont **dépendants** de chat.api côté authentification — chat.api est le seul à savoir qui est un user (Firebase) et à quel tenant il appartient. C'est aussi chat.api qui détient les **tokens OAuth Google** des users (cf. §2.4.5). Toute opération service-to-service qui touche à Google passe nécessairement par un appel `X-Service-Token` à chat.api pour récupérer le token courant de l'user concerné.

#### 2.4.4 Endpoints exposés à n8n / Azy-MCP (réservés service-to-service)

Pas seulement la chaîne descendante (chat.api → Azy-MCP → n8n). Il y a aussi une chaîne **remontante** où n8n / chatbot-core / Azy-MCP appellent chat.api pour résoudre des données qu'ils n'ont pas :

| Endpoint | Auth | Consommateur | Usage |
|---|---|---|---|
| `GET /api/n8n/tenants/resolve` | `X-Service-Token` + Discord guild_id | chatbot-core (RFC-079 TenantResolver) | Résoudre `guild_id` → `tenant_id` + package LLM + modèles |
| `GET /api/n8n/google/token?service=<svc>&user_id=<uid>` | `X-Service-Token` + `X-Tenant-ID` | Azy-MCP / n8n (RFC-083-A) | Récupérer access_token Google valide (auto-refresh) pour BYOT |
| `GET /api/n8n/experts/{expert_id}/resolve` | `X-Service-Token` + `X-Tenant-ID` | Azy-MCP / chatbot-core (RFC-081) | Résoudre l'expert effectif (template + persona + RAG sources selon canal) |
| `GET /api/discord-roles?guild_id=X` | `X-Service-Token` | n8n / scripts admin (RFC-059) | Lister les rôles Discord d'un guild (filtrés @everyone + bot) |
| `GET /api/llm/services` | aucun (publique) | grids tarifaires | Catalogue public des modèles |
| `GET /api/llm/capability-tags` | aucun + ETag | front + n8n | Tags de capabilities (cf. RFC-076) |

→ **Implication clé** : chatbot-core et Azy-MCP **dépendent de chat.api** pour démarrer (résolveurs au boot). Si chat.api est down → onboarding tenant impossible côté Discord.

#### 2.4.5 Google services — chat.api est l'autorité OAuth

> **Pour les autres équipes** : chat.api est le seul composant qui parle OAuth à Google (login + storage tokens + refresh). Azy-MCP, n8n, chatbot-core consomment les tokens via le résolveur `/api/n8n/google/token`. Cette section détaille tout pour qu'aucune équipe n'ait besoin de réinventer la plomberie OAuth de son côté.

##### A. Projet GCP utilisé

**Un seul projet GCP partagé** entre tous les tenants : `authent-service`.

| Composant | Source |
|---|---|
| OAuth client web | Fichier JSON credentials (non versionné) |
| Service account Firebase Admin SDK | Fichier JSON service account (non versionné) |
| Redirect URIs configurées (GCP Console) | URIs de callback configurées dans la console GCP |

**Implication majeure** : la **Google verification** (pour les sensitive scopes Classroom + Gmail) est **portée par Azy** (le projet `authent-service`), **pas par chaque tenant**. C'est un *one-shot* — verification active = tous les tenants en bénéficient. Cf. RFC-083 §C.6 + §D.11.2.

##### B. Routers OAuth chat.api ↔ Google direct

Deux familles de routes OAuth coexistent (héritage historique, pas de breaking V1) :

**Famille 1 — `/api/auth/google/*`** (`app/api_routes/google_auth_routes.py`) — flow user-facing « se connecter avec Google »

| Route | Méthode | Description |
|---|---|---|
| `/api/auth/google/signup` | GET | Démarre signup avec Google (création nouveau user + provisioning tenant si applicable) |
| `/api/auth/google/signup/callback` | GET | Callback signup |
| `/api/auth/google/login` | GET | Login user existant — query params : `services=gmail,calendar,drive,classroom`, `access_level=minimal\|standard\|full`, `scopes=<custom>`, `tenant_id?`, `redirect_after?` |
| `/api/auth/google/login/callback` | GET | Callback login |
| `/api/auth/google/callback` | GET | Callback générique (legacy) |
| `/api/auth/google/refresh` | POST | Force refresh token (debugging, normalement automatique) |
| `/api/auth/google/revoke` | POST | Révocation user — supprime token Redis + invalide côté Google |
| `/api/auth/google/status` | GET | État OAuth de l'user courant |
| `/api/auth/google/services` | GET | Services Google connus (`gmail`, `calendar`, `drive`, `contacts`, `classroom`) |
| `/api/auth/google/connections` | GET | Liste des connexions actives par tenant |
| `/api/auth/google/environment/status` | GET | Env state (DevOps) |

**Famille 2 — `/api/services/google/*`** (`app/api_routes/google_services_routes.py`) — flow Settings → Intégrations Google (extension de scopes a posteriori sans re-login)

| Route | Méthode | Description |
|---|---|---|
| `/api/services/google/connect` | GET | Demande de scopes additionnels pour user déjà loggé |
| `/api/services/google/callback` | GET | Callback de la demande |
| `/api/services/google/status` | GET | Quels services activés pour cet user |
| `/api/services/google/refresh` | POST | Refresh tokens manuels |
| `/api/services/google/validate-token` | POST | Valide un token côté Google sans le consommer |
| `/api/services/google/disconnect` | DELETE | Déconnecte un service |
| `/api/services/google/scopes` | GET | Liste des scopes par service + niveau (`?service=classroom&access_level=standard`) |

→ **Convention front conseillée** : utiliser **Famille 1** (`/api/auth/google/login?services=...`) pour le premier consent, **Famille 2** (`/api/services/google/connect`) pour l'extension de scopes (ex : ajout de `classroom` à un user qui avait `calendar+drive`).

##### C. Storage des tokens — Redis (pas DB)

Les tokens OAuth Google **ne sont jamais persistés en PostgreSQL** côté chat.api. Ils vivent dans Redis avec auto-refresh.

```
Redis key      : google_oauth:tokens:<tenant_id>:<user_id>
Redis fallback : gmail:tokens:<tenant_id>:<user_id>     (ancien préfixe, lu mais plus écrit)
Type           : Hash JSON
```

**Shape de la valeur** :

```jsonc
{
  "access_token": "ya29.a0AfH6SMBx...",
  "refresh_token": "1//09xxx...",
  "expires_at": 1712345678,           // unix ts
  "scopes_granted": [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "..."
  ],
  "token_type": "Bearer",
  "issued_at": 1712342078
}
```

**TTL Redis** : aligné sur l'expiration du access_token. Le refresh_token est conservé dans la même hash (jamais purgé sauf revoke explicite — `/api/auth/google/revoke` ou GDPR purge user RFC-040).

**Cache LRU en mémoire** côté `GmailTokenManager` (max ~1000 entries) — évite les round-trips Redis pour les users actifs.

##### D. Cycle de vie d'un token — le pattern `get_valid_token()`

Le cœur de la plomberie est `app/services/google/gmail_token_manager.py:GmailTokenManager.get_valid_token(tenant_id, user_id) -> str` :

```
Appel get_valid_token(tenant_id, user_id)
  ↓
1. Lookup LRU memory cache (clé = tenant:user)
   ├── HIT et expires_at > now+30s → retourne access_token (chemin chaud)
   └── MISS ou expiré → étape 2
  ↓
2. Lookup Redis (google_oauth:tokens:tenant:user)
   ├── HIT et expires_at > now+30s → met en cache LRU et retourne
   ├── HIT et expiré → étape 3
   └── MISS → fallback préfixe gmail:tokens: (legacy) → si trouvé → migrate vers nouveau préfixe
  ↓
3. Refresh via Google OAuth2 endpoint
   ├── POST https://oauth2.googleapis.com/token
   │   { client_id, client_secret, refresh_token, grant_type=refresh_token }
   ├── Lock distribué Redis SETNX 2fa:lock:<tenant>:<user> (TTL 30s) pour éviter races
   ├── Met à jour access_token + expires_at en Redis
   └── Retourne nouveau access_token
  ↓
4. Si refresh échoue (refresh_token revoked) → TokenRefreshError → caller récupère 401
```

**Garanties** :
- **Multi-tenant safe** : la clé Redis inclut `tenant_id` + `user_id`, jamais de fuite cross-tenant
- **Auto-refresh transparent** : le caller (Azy-MCP via `/api/n8n/google/token`, ou directement chat.api pour ses besoins internes) reçoit toujours un token valide, sans avoir à connaître la mécanique de refresh
- **Lock distribué** : si 2 requêtes parallèles déclenchent un refresh, une seule fait l'appel à Google, les autres attendent
- **Audit** : chaque refresh logué dans `service_token_usage_logs` avec result + duration

##### E. Endpoint `/api/n8n/google/token` — le point de consommation pour Azy-MCP / n8n

C'est l'endpoint qui matérialise le **contrat BYOT** côté infrastructure : Azy-MCP / n8n appellent ce résolveur pour obtenir un token Google valide à injecter dans leurs requêtes downstream.

```
GET /api/n8n/google/token?service=classroom&user_id=<firebase_uid>
Headers:
  X-Service-Token: <token>
  X-Tenant-ID: <tenant_id>

→ 200 OK
{
  "access_token": "ya29.a0AfH...",
  "expires_at": "2026-05-08T15:30:00Z",
  "scopes_granted": ["...", "..."],
  "service": "classroom"
}
```

Codes erreur typés :
- `401 google_oauth_not_connected` — user n'a jamais consenté
- `403 google_scope_insufficient` — user a connecté Google mais n'a pas accordé les scopes nécessaires pour ce service
- `403 classroom_requires_edu_domain` — service=classroom + domain Workspace user n'est pas EDU (`*.edu`, `*.ac.<cc>`, ou flag `is_edu_domain`)
- `429 classroom_quota_exceeded` — compteur `classroom_ops_per_day` dépassé pour ce tenant
- `404 user_not_found_in_tenant` — `user_id` n'existe pas dans le tenant signé par `X-Tenant-ID`

Le résolveur **valide aussi les scopes accordés** côté chat.api avant de retourner — si l'user n'a que `gmail` mais demande un token `service=classroom`, refus 403 avec liste des scopes manquants pour que le front sache déclencher un re-consent.

##### F. `GoogleScopeManager` — table de scopes par service × niveau

`app/services/google_scope_manager.py` — source de vérité des scopes par service.

```
GoogleService (enum) ∈ { GMAIL, CALENDAR, CONTACTS, DRIVE, CLASSROOM, USER_INFO }

BASE_SCOPES (toujours demandés) :
  - userinfo.email
  - userinfo.profile

SERVICE_SCOPES[<service>][<level>] :
  level ∈ { minimal, standard, full }
  ex Classroom :
    minimal  : courses.readonly, coursework.students, rosters.readonly, topics
    standard : minimal + announcements
    full     : courses (CRUD write), coursework.students, rosters (write), topics, announcements
```

**Exemples de payloads URL pour le consent** (générés par `/api/auth/google/login`) :
- Gmail standard : `userinfo.email + userinfo.profile + gmail.readonly + gmail.labels`
- Drive full : `userinfo.email + userinfo.profile + drive`
- Classroom V1 minimal (RFC-083) : `userinfo.email + userinfo.profile + classroom.courses.readonly + classroom.coursework.students + classroom.rosters.readonly + classroom.topics`

**Stratégie scope par défaut** : toujours **`minimal`** (principe du moindre privilège). Le front demande `level=standard` ou `full` explicitement quand il a besoin de plus.

##### G. Validation EDU domain pour Classroom (RFC-083 §D.2 Q-C5)

Particularité Classroom : Google **exige un domaine Workspace EDU** pour la majorité des opérations write côté enseignant. chat.api anticipe en validant côté back, **avant** d'appeler Google :

```python
# app/services/classroom_edu_validator.py
def validate_edu_domain(domain: str, override: bool = False) -> bool:
    if override:                                                # is_edu_domain manual flag
        return True
    return bool(re.match(r".+\.(edu|ac\.[a-z]{2}|edu\.[a-z]{2})$", domain.lower()))
```

Si `validate_edu_domain` retourne False → `/api/n8n/google/token?service=classroom` retourne `403 classroom_requires_edu_domain` au lieu de laisser remonter le `403` opaque de Google. UX claire pour l'admin tenant.

L'override `is_edu_domain` est dans `google_workspace_configs.custom_settings.is_edu_domain` (booléen) — utilisable pour des tenants formation continue qui n'ont pas de domaine `.edu` mais ont un usage légitime.

##### H. Audit Google côté chat.api

Tous les appels OAuth + résolution token sont audités :

| Table / Log | Quand | Champs clés |
|---|---|---|
| `public.service_token_usage_logs` | Chaque appel `/api/n8n/google/token`, `/api/n8n/tenants/resolve`, … | `service_name='google_oauth'`, `action='token_resolved'`, `tenant_id`, `user_id`, `result`, `duration_ms` |
| `tenant_<X>.google_workspace_sync_logs` | Sync background Gmail/Calendar/Drive | RFC-014 — `provider`, `started_at`, `completed_at`, `errors` |
| `public.admin_audit_log` (RFC-075) | Connect/disconnect Google par admin | `actor_uid`, `action='google_oauth.connect|revoke'`, `details` |

Pas d'audit côté Redis (volatile par design).

##### I. Disconnect / GDPR purge

Quand un user :
- **Se déconnecte de Google volontairement** (`DELETE /api/services/google/disconnect`) → suppression des clés Redis `google_oauth:tokens:*` + révocation côté Google + log audit.
- **Demande la suppression RGPD** (RFC-040 — Celery `gdpr_purge` task) → idem + suppression de toutes les données dérivées (emails cachés DB, calendar events cachés, …) dans le schema tenant + pseudonymisation des refs cross-tenant.

##### J. Limites connues / dette technique Google côté chat.api

- **Token cache LRU** non sharé entre instances chat.api → en multi-instance, une instance peut déclencher un refresh alors qu'une autre a déjà un token chaud en mémoire. Le lock Redis évite les races avec Google, mais pas le double check Redis. Acceptable car Redis est shared state.
- **Pas de rotation automatique du refresh_token** — Google peut le révoquer côté serveur sans préavis (politique de sécurité). `TokenRefreshError` est traité comme un disconnect implicite côté caller.
- **Discrepancy port Azy-MCP** — `MCP_SERVER_URL=8002` actuel, doc Azy-MCP `8765` — DevOps à harmoniser, **n'impacte pas la résolution OAuth** côté chat.api (lecture transparente de `settings.MCP_SERVER_URL`).

#### 2.4.6 Communications sortantes — qui chat.api appelle

| Cible | Pattern | Cas d'usage |
|---|---|---|
| **PostgreSQL** | async SQLAlchemy / asyncpg | Source de vérité user/tenant/conversations |
| **Redis** | redis-py async | Cache tokens OAuth, sessions, rate-limit, Streams discord |
| **Google APIs (OAuth)** | httpx direct vers `accounts.google.com` + `googleapis.com/oauth2/v4/token` | **Uniquement le flow OAuth** (`/connect`, `/callback`, `/refresh`) — pas pour les data ops |
| **Azy-MCP** | httpx `POST {MCP_SERVER_URL}/api/tools/{id}/execute` | **Toutes les data ops Google** (Gmail/Calendar/Drive/Classroom) — jamais Google direct |
| **n8n direct** | httpx `POST {N8N_BASE_URL}/webhook/{name}` | **Exception** : `training_dataset` (RFC-040) appelle n8n direct via webhook dataset-generate. Tous les autres flows passent par Azy-MCP. |
| **Discord** (via chatbot-core) | Redis Streams `discord:commands` / `discord:results` | RFC-062 — chat.api **n'appelle pas Discord direct** ; c'est chatbot-core qui le fait, chat.api lui envoie des commandes via Redis |
| **Stripe** | stripe-python | Billing (chat.api ↔ Stripe direct, pas via Azy-MCP) |
| **OpenRouter / Anthropic / OpenAI** | httpx direct | Appels LLM côté chat.api pour features RAG/résumés non-conversationnelles. Pour les conversations chatbot, c'est chatbot-core qui appelle. |
| **Qdrant** | qdrant-client | Embeddings, search vectoriel (RFC-074, ScopeClassifier) |

→ **Correction §1 et §2.7** : la phrase « N8N est le SEUL à appeler les services externes » est **inexacte**. chat.api appelle Google directement pour le **flow OAuth** (login/callback/refresh) car c'est l'identité fédérée — pas une data op. chat.api appelle aussi Stripe, OpenRouter, Qdrant, etc. La règle exacte est : *« Toutes les data ops Google (Gmail/Calendar/Drive/Classroom) côté user passent par Azy-MCP → n8n → Google »*.

#### 2.4.7 Background workers (Celery)

Les workers Celery tournent en process séparés et consomment leurs queues Redis. Invisible côté UI mais important à connaître pour debug :

| Worker | Queue | Tâches | RFC |
|---|---|---|---|
| `gdpr_purge_worker` | `gdpr` | Purge RGPD planifiée des données utilisateur | RFC-040 |
| `n8n_workflow_worker` | `n8n` | Exécution workflow n8n via MCP_SERVER_URL/workflow/execute | RFC-040 + RFC-072 |
| `training_dataset_worker` | `training` | Génération datasets (appel direct webhook n8n) | RFC-040 |
| `batch_reconcile_worker` | `batch` | Réconciliation des batchs LLM (RFC-072) avec MCP Server | RFC-072 |
| `document_batch_worker` | `documents` | Traitement de documents en lot | RFC-014 |
| `gmail_sync` (planifié) | `gmail` | Sync Gmail vers cache local DB tenant | RFC-014 |
| `calendar_sync` (planifié) | `calendar` | Sync Calendar vers cache local DB tenant | — |

Beat scheduler : `app/celery_app.py` — déclenche les sync périodiques.

#### 2.4.8 Domaines fonctionnels (organisation des routes)

Les autres équipes voient des endpoints isolés. Côté chat.api ils sont organisés en **20+ domaines** (`app/api_routes/`) :

| Domaine | Routes principales | Audience |
|---|---|---|
| **Auth** | `/api/auth/*`, `/api/auth/google/*`, `/api/auth/2fa/*` | Public + authentifié |
| **Users** | `/api/users/me/*` | JWT user |
| **Experts** | `/api/experts/*`, `/api/experts/{id}/quick-actions/*`, `/api/experts/{id}/personas/*` (admin via `/api/owner/...`) | JWT user + RBAC |
| **Conversations** | `/api/conversations/*`, `/api/messages/*`, WebSocket `/ws/chat` | JWT user |
| **Discord** | `/api/discord/*`, `/api/discord-roles`, `/api/owner/discord/...` | RBAC + Service Token |
| **Google services** | `/api/auth/google/*` (OAuth), `/api/google-classroom/*`, `/api/users/me/drive/*` (...via Azy-MCP) | JWT + scopes OAuth |
| **n8n callbacks** | `/api/n8n/*` | Service Token uniquement |
| **Admin** | `/api/admin/*`, superadmin protégé par 2FA | superadmin |
| **Owner** | `/api/owner/*` (RBAC `*:admin` ou `*:manage`) | tenant admin |
| **LLM** | `/api/llm/*` (catalogue), `/api/user/preferences/effective` (RFC-077) | mixte |
| **Reference analyses** | `/api/reference-analyses/*` (RFC-084) | JWT user |
| **Expert responses** | `/api/expert-responses/*`, `/api/users/me/expert-responses/{id}/classroom-sync` (RFC-083 V2) | JWT user (créateur) |
| **Training** | `/api/training/*`, `/api/v1/training/dataset/*` | RBAC + Celery callbacks |
| **E-commerce** | `/api/ecommerce/*` (Stripe) | JWT user |
| **Gamification** | `/api/badges/*`, `/api/leaderboards/*` (RFC-067) | JWT user |
| **Health/Monitoring** | `/health`, `/api/quotas/*` | infra |

`/openapi.json` liste **745 paths** au total (state actuel develop).

#### 2.4.9 RBAC — modèle de permissions

Système custom (pas Casbin/OPA) défini dans `app/multi_tenant/rbac/` :

```
PermissionDomain (enum) × PermissionAction (enum) → Permissions concrètes seedées
ex : llm:read, expert:persona, classroom:write, expert_response:discord_read, ...

Predefined roles : super_admin, admin, manager, contributor, viewer, custom
```

Permissions ajoutées récemment (à connaître pour les autres équipes) :
- `expert:persona` + `expert:guild_context` (RFC-081)
- `expert_response:discord_read` (RFC-082)
- `classroom:read` + `classroom:write` (RFC-083-A)
- `gmail:*` (RFC-070)

#### 2.4.10 Variables d'environnement (chat.api)

| Variable | Description | Exemple |
|---|---|---|
| `DATABASE_HOST` | PostgreSQL host | `databases.local` |
| `DATABASE_PORT` | port | `5432` |
| `DATABASE_USER` | user | `savvywizard` |
| `DATABASE_NAME` | base | `chat_studio` |
| `REDIS_URL` | Redis (cache + Streams) | `redis://host3.local:6381` |
| `MCP_SERVER_URL` | URL Azy-MCP (pour `/api/tools/{id}/execute`) | `http://pi6.local:8002` (à harmoniser sur 8765 selon doc Azy-MCP §5) |
| `N8N_BASE_URL` / `N8N_DATASET_WEBHOOK_URL` | n8n direct (training dataset uniquement) | `http://pi6.local:5678` |
| `BACKEND_URL` | URL publique chat.api (pour callbacks) | `https://apidev.azy.solutions` |
| `GOOGLE_OAUTH_REDIRECT_URI` | callback OAuth Google | `https://apidev.azy.solutions/api/auth/google/callback` |
| `JWT_SECRET_KEY` | secret JWT (signature interne) | (généré) |
| `FIREBASE_*` | credentials Firebase Admin SDK | (fichier JSON non versionné) |
| `STRIPE_SECRET_KEY` | clé Stripe | (optionnel — billing) |
| `MCP_BATCH_INTERNAL_TOKEN` | Bearer pour `/batch/*` Azy-MCP | (RFC-072) |

Discrepancy **port Azy-MCP** à signaler : settings actuel `8002`, doc Azy-MCP `8765`. À harmoniser DevOps.

#### 2.4.11 RFCs implémentés (vue chat.api)

| RFC | Statut | Surface chat.api |
|---|---|---|
| **RFC-014** | ✅ | Document processing + DocumentService |
| **RFC-023** | ✅ | Training/formations (Promotion, Matiere, ...) |
| **RFC-031** | ✅ | Intent classification (ScopeClassifier hybride) |
| **RFC-032** | ✅ | Migration Redis Streams |
| **RFC-040** | ✅ | RGPD GDPR (PseudonymizationService, gdpr_purge Celery) |
| **RFC-049** | ✅ | Multi-tenant isolation (search_path) |
| **RFC-059** | ✅ | Quotas par rôle Discord, `/api/discord-roles` |
| **RFC-061** | ✅ | Promotions/Matières Discord |
| **RFC-062** | ✅ | DiscordCommandService (chat.api → Redis Streams → chatbot-core) |
| **RFC-067** | 🔄 | Gamification — endpoints livrés, couplage front partiel |
| **RFC-074** | ✅ | Student corrections + moderation suggestions |
| **RFC-075** | ✅ | Superadmin 2FA + admin_audit_log |
| **RFC-076** | ✅ | Catalogue LLM (llm_models, llm_classes, capability_tags) |
| **RFC-077** | ✅ | Packages LLM (PR A/B/C — packages, effective preference, plugin Discord) |
| **RFC-079** | ✅ | TenantResolver pour n8n + plugin packages |
| **RFC-080** | ✅ | Expert question responses (anonymisation RGPD) |
| **RFC-081** v3 | ✅ | Expert personas + bindings (Discord/web/Classroom) |
| **RFC-082** v3 | ✅ | Discord binding + multi-binding par canal |
| **RFC-083 V1+V2** | ✅ V1, 🟡 V2 PR #2356 en review | Token resolver Google, classroom binding, sync wiring vers Azy-MCP |
| **RFC-084** | ✅ | Reference analyses (extraction multi-matière) |

#### 2.4.12 WebSocket layer

Le chat.api expose **plusieurs routes WebSocket** consommées par le front (cf. §2.1.5) et par les chatbot/plugin Discord internes. Les autres équipes ne voient que `/ws/mcp/...` côté chat — la liste complète :

| Route | Fichier | Usage | Auth |
|---|---|---|---|
| `/ws/mcp/execute/{conversation_id}` | `app/api_routes/mcp_websocket_routes.py:26` | **Streaming chat** — relais entre front et Azy-MCP (transport WebSocket Azy-MCP). Le front parle à chat.api WS, chat.api ouvre une connexion WS sortante vers `ws://mcp-server:8765/mcp` et fait du proxy bidirectionnel. | Firebase JWT dans handshake (query `token=`) |
| `/ws/mcp/status` | `mcp_websocket_routes.py:201` | Health WS pour monitoring | Firebase JWT |
| `/api/v1/training/{tenant_id}/ws/sync` | `websocket_sync_routes.py:516` | Notifications de fin de sync (Celery → front) | tenant_id dans path + JWT |
| `/ws/admin` | `dashboard_routes.py:153` | Admin dashboard temps réel | JWT + RBAC admin |
| `/ws` | `dashboard_routes.py:74` | Dashboard user temps réel | JWT |
| `/connect` (workflows) | `websocket_workflows_routes.py:136` | Suivi exécution workflows n8n | JWT |
| `/{api_key}` (chatbot legacy) | `chatbot_websocket_routes.py:341` | Endpoint chatbot widget public (clé API) | API Key |
| `/chat/{session_token}` | `chatbot_websocket_routes.py:571` | Session chatbot publique | session token |
| `/{tenant_id}/conversations/{conversation_id}` | `firebase_websocket.py:86` | Streaming réponses LLM par conversation | Firebase JWT |
| `/status-updates/{session_id}` | `chatbot_queue_routes.py:323` | File d'attente LLM (RFC-076) | session token |

**Pattern principal — `/ws/mcp/execute/{conversation_id}`** (le seul mentionné côté front) :

```
Front WS → chat.api WS (/ws/mcp/execute/<conv_id>)
   ↓ ouvre une connexion sortante WS vers Azy-MCP
chat.api WS ← Azy-MCP WS (ws://mcp-server:8765/mcp)
   ↓ proxy bidirectionnel des trames MCP
   ↓ injection auth (X-Tenant-ID + résolution token Google si tool Google)
   ↓ logging + correlation_id
Réponses MCP streamées au front en temps réel
```

**Lifecycle** : géré par `app/utils/websocket/multi_tenant/connection_lifecycle.py` :
- Codes de fermeture standardisés : `1000` normal, `1008` policy violation (auth échouée), `1011` server error, `4003` tenant access denied
- Heartbeat ping/pong pour détecter les WS zombies
- Multi-tenant safe : isolation par tenant garantie même si plusieurs users du même tenant ouvrent des WS simultanées

**Important pour les autres équipes** :
- Azy-MCP voit chat.api comme **un seul client WebSocket** (pas un par user) — c'est chat.api qui multiplexe.
- Si Azy-MCP est down, chat.api WS ferme avec `1011` et le front affiche un toast d'erreur — pas de fallback REST silencieux.
- Le format des trames MCP est le standard MCP (JSON-RPC 2.0), pas un format custom chat.api.

#### 2.4.13 Relations (corrigées)

- Reçoit toutes les requêtes **frontend** (REST + WebSocket)
- **Source de vérité** PostgreSQL multi-tenant — Azy-MCP, chatbot-core, n8n consomment chat.api en service-to-service via `X-Service-Token` (cf. §2.4.4)
- Délègue à **Azy-MCP** pour les data ops Google (via API REST `/api/tools/{id}/execute`)
- Communique avec **chatbot-core** uniquement via **Redis Streams** (RFC-062 commands/results) — pas d'appel HTTP direct
- Appelle **Google directement** uniquement pour le flow OAuth (login/callback/refresh) — pas pour les data
- Appelle **n8n directement** uniquement pour `training_dataset` (RFC-040) — exception historique, le reste passe par Azy-MCP
- Appelle **Stripe / OpenRouter / Qdrant** directement pour leurs domaines respectifs (billing, LLM RAG, embeddings)
- **N'appelle pas** Discord directement — passe par Redis Streams vers chatbot-core (RFC-062)

### 2.5 Chatbot-Core

| Aspect | Description |
|--------|-------------|
| **Rôle** | Moteur de conversation IA + Bot Discord multi-tenant |
| **Technologies** | Python 3.11+, discord.py, asyncio, Redis |
| **Port** | Pas d'API HTTP (communication via Redis Streams) |
| **Fonctionnalités** | Conversations, commandes Discord, onboarding, voice realtime |

#### Architecture interne

```
Chatbot-Core
├── Core (Framework)
│   ├── BotFactory           → Factory pour créer FrameworkBot
│   ├── FrameworkBot         → Bot Discord étendu avec support plugins
│   ├── BaseConfig           → Configuration de base partagée
│   └── Plugin Interface     → Interface pour plugins métier
│
├── Cogs (Discord Extensions)
│   ├── OnboardingCog        → Onboarding multi-étapes via DM (RFC-069)
│   ├── VoiceRealtimeCog     → Conversations vocales temps réel (RFC-078)
│   ├── ConfigCog            → Configuration utilisateur + /config sync
│   └── DMVerificationCog    → Vérification étudiants via DM
│
├── Services Layer
│   ├── TenantResolver       → Résolution tenant + package LLM (RFC-049, RFC-079)
│   ├── DiscordCommandListener → Commandes Discord via Redis Streams (RFC-062)
│   ├── OnboardingRedisService → Sessions onboarding avec TTL (RFC-069)
│   ├── VoiceRealtimeService → Bridge GCP → OpenAI Realtime (RFC-078)
│   ├── ServerSyncManager    → Sync infos guild vers backend (RFC-060)
│   ├── ResyncSubscriber     → Écoute bot:resync Pub/Sub (RFC-060)
│   ├── MCP Client           → Appels outils via protocole MCP
│   ├── N8nClient            → Appels webhooks n8n
│   └── PromptManager        → Gestion prompts système
│
├── Discord Services
│   ├── RoleManager          → Gestion des rôles Discord
│   ├── ChannelManager       → Gestion des channels
│   ├── ThreadManager        → Gestion des threads
│   └── VoiceSessionManager  → Sessions vocales actives
│
├── Mixins
│   └── GuildEventsMixin     → on_guild_join/update/remove (RFC-060)
│
├── Command Handlers (RFC-062)
│   ├── GuildHandler         → update_guild
│   ├── ChannelHandler       → create_category, create_channel, delete_channel
│   ├── InviteHandler        → create_invite
│   ├── PermissionHandler    → set_permissions
│   └── RoleHandler          → get_roles
│
├── Models
│   ├── TenantConfig         → Configuration tenant + package (RFC-079)
│   ├── PackageModels        → Modèles LLM par package
│   ├── OnboardingSession    → État session onboarding
│   └── PluginContext        → Contexte conversation
│
└── Gamification (RFC-067)
    ├── BadgeService         → Attribution de badges
    ├── LeaderboardService   → Classements
    └── EventBus             → Bus d'événements gamification
```

#### Communication Redis Streams (RFC-062)

Le bot Discord reçoit des commandes du backend via Redis Streams :

```
┌─────────────┐    POST /api/discord-commands     ┌─────────────┐
│   Backend   │ ───────────────────────────────▶  │    Redis    │
│  (chat.api) │                                   │   Streams   │
└─────────────┘                                   └──────┬──────┘
                                                         │
      Stream: discord:commands                           │
      ┌─────────────────────────────────────────────────┐│
      │ request_id: "req-123"                           ││
      │ guild_id: "1234567890"                          ││
      │ action: "get_roles" | "create_channel" | ...    ││
      │ payload: { ... }                                ││
      └─────────────────────────────────────────────────┘│
                                                         │
                                                         ▼
                                            ┌─────────────────────┐
                                            │  DiscordCommand     │
                                            │    Listener         │
                                            │  (Consumer Group)   │
                                            └──────────┬──────────┘
                                                       │
                                                       ▼
                                            ┌─────────────────────┐
                                            │  CommandExecutor    │
                                            │  (Strategy Pattern) │
                                            └──────────┬──────────┘
                                                       │
                                                       ▼
                                            ┌─────────────────────┐
                                            │   Discord API       │
                                            │   (avec bot token)  │
                                            └──────────┬──────────┘
                                                       │
      Stream: discord:results                          │
      ┌─────────────────────────────────────────────────┐
      │ request_id: "req-123"                           │
      │ success: true                                   │
      │ data: { roles: [...] }                          │
      └─────────────────────────────────────────────────┘
                                                         │
                                                         ▼
┌─────────────┐    XREAD discord:results      ┌─────────────┐
│   Backend   │ ◀─────────────────────────────│    Redis    │
│  (chat.api) │                               │   Streams   │
└─────────────┘                               └─────────────┘
```

**Actions supportées (RFC-062) :**

| Action | Payload | Description |
|--------|---------|-------------|
| `update_guild` | `{name?, icon_url?}` | Modifier nom/icône du serveur |
| `create_category` | `{name, position?}` | Créer une catégorie |
| `create_channel` | `{name, type, category_id?, topic?}` | Créer un channel |
| `delete_channel` | `{channel_id}` | Supprimer un channel |
| `create_invite` | `{channel_id, max_age?, max_uses?}` | Créer une invitation |
| `set_permissions` | `{channel_id, target_type, target_id, permissions}` | Modifier permissions |
| `get_roles` | `{}` | Lister les rôles (avec tags bot) |

#### TenantResolver (RFC-049 + RFC-079)

Résout Discord user_id → TenantConfig avec cache 1h :

```python
# Avant (RFC-049)
tenant_id = await resolver.resolve_tenant_id(user_id, guild_id)

# Après (RFC-079)
config = await resolver.resolve(user_id, guild_id)
# config.tenant_id      → "tenant-123"
# config.package_code   → "pro-complet"
# config.models.chat    → "gpt-4.1"
# config.models.chat_mini → "gpt-4.1-mini"
# config.is_fallback    → True si owner fallback
```

**Flux de résolution :**

```
┌──────────────┐     user_id + guild_id     ┌───────────────┐
│  Chatbot-    │ ─────────────────────────▶ │   n8n webhook │
│    Core      │                            │ mcp-tenant-   │
└──────────────┘                            │   resolve     │
       ▲                                    └───────┬───────┘
       │                                            │
       │              TenantConfig                  ▼
       │         ┌──────────────────────┐   ┌─────────────┐
       │         │ tenant_id: "t-123"   │   │  PostgreSQL │
       └─────────│ package: "pro"       │◀──│  (tenants)  │
                 │ models:              │   └─────────────┘
                 │   chat: "gpt-4.1"    │
                 │   chat_mini: "gpt-4.1-mini"
                 │   embedding: "..."   │
                 └──────────────────────┘
```

#### Voice Realtime (RFC-078)

Commandes vocales `/voice start|end|status` :

```
┌──────────────┐     Discord Audio      ┌──────────────┐
│   Discord    │ ─────────────────────▶ │  Chatbot-    │
│   Voice      │                        │    Core      │
│   Channel    │                        │ (Cog)        │
└──────────────┘                        └──────┬───────┘
                                               │
                                               │ WebSocket
                                               ▼
                                    ┌──────────────────────┐
                                    │    GCP Bridge        │
                                    │ (audio transcoding)  │
                                    └──────────┬───────────┘
                                               │
                                               ▼
                                    ┌──────────────────────┐
                                    │  OpenAI Realtime API │
                                    │  (gpt-4o-realtime)   │
                                    └──────────────────────┘
```

#### RFCs implémentés

| RFC | Statut | Description |
|-----|--------|-------------|
| **RFC-049** | ✅ Complété | Multi-tenant isolation (TenantResolver) |
| **RFC-060** | ✅ Complété | Guild info sync (ServerSyncManager, ResyncSubscriber) |
| **RFC-062** | ✅ Complété | Discord commands via Redis Streams |
| **RFC-067** | 🔄 En cours | Gamification (badges, leaderboards) |
| **RFC-069** | ✅ Complété | Onboarding multi-étapes via DM |
| **RFC-078** | ✅ Complété | Voice realtime via GCP bridge |
| **RFC-079** | ✅ Complété | Tenant package configuration |

#### Configuration (variables d'environnement)

| Variable | Description | Défaut |
|----------|-------------|--------|
| `DISCORD_TOKEN` | Token du bot Discord | - |
| `REDIS_URL` | URL Redis pour streams/sessions | redis://localhost:6379 |
| `N8N_WEBHOOK_BASE_URL` | URL base webhooks n8n | http://localhost:5678 |
| `REALTIME_BRIDGE_URL` | URL bridge GCP voice | - |
| `LOG_LEVEL` | Niveau de log | INFO |

#### Relations

- **Discord** → Chatbot-Core : Événements Discord (messages, voice, joins)
- **chat.api** → Redis → Chatbot-Core : Commandes Discord (RFC-062)
- Chatbot-Core → **n8n** : Résolution tenant, appels services
- Chatbot-Core → **Azy-MCP** : Tool calling via MCP protocol
- Chatbot-Core → **GCP Bridge** : Audio voice realtime (RFC-078)

### 2.6 Azy-MCP (MCP Server)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Serveur d'outils MCP (Model Context Protocol) + API REST |
| **Technologies** | Python 3.11+, FastAPI, asyncio |
| **Port** | 8765 |
| **Fonctionnalités** | Wrappers outils, API REST, analyseurs, storage |

#### Architecture interne

```
Azy-MCP
├── API Layer (FastAPI)
│   ├── /api/tools                    → Liste des tools disponibles
│   ├── /api/tools/{tool_id}          → Info sur un tool
│   ├── /api/tools/{tool_id}/execute  → Exécution directe (RFC-083)
│   ├── /health                       → Health check
│   └── /metrics                      → Métriques Prometheus
│
├── MCP Protocol Layer
│   ├── Protocol Handler              → Gestion du protocole MCP
│   └── Workflow Manager              → Orchestration des workflows
│
├── Tools Layer (N8NTool pattern)
│   ├── N8NToolRegistry               → Registre dynamique des tools
│   ├── N8NToolBase                   → Classe de base abstraite
│   │
│   ├── Google Workspace Tools
│   │   ├── GmailTool                 → Emails (list, get, send, draft)
│   │   ├── CalendarTool              → Agenda (events, calendars)
│   │   ├── DriveTool                 → Fichiers (list, upload, download, share)
│   │   ├── ContactsTool              → Contacts (list, get, create, update)
│   │   └── ClassroomTool             → Classroom (courses, topics, coursework, expert_program.sync)
│   │
│   ├── Media Tools
│   │   ├── ImageGenerationTool       → Génération d'images (DALL-E, Midjourney)
│   │   ├── VideoAnalysisTool         → Analyse vidéo (transcription, OCR)
│   │   └── VideoGenerationTool       → Génération vidéo
│   │
│   ├── Knowledge Tools
│   │   └── KnowledgeGraphTool        → Graphe de connaissances (Qdrant)
│   │
│   └── [En développement]
│       ├── MapsTool                  → Google Maps (non enregistré)
│       ├── NotionTool                → Notion API (non enregistré)
│       ├── SlackTool                 → Slack (non enregistré)
│       └── TrelloTool                → Trello (non enregistré)
│
├── Analyzers (Phase 2)
│   ├── PromptAnalyzer                → Analyse des prompts entrants
│   ├── ContextAnalyzer               → Analyse du contexte utilisateur
│   └── ResponseAnalyzer              → Analyse des réponses
│
└── Storage (Phase 2)
    ├── VectorStore                   → Stockage vectoriel (embeddings)
    ├── CacheManager                  → Cache Redis/mémoire
    └── KnowledgeBase                 → Base de connaissances
```

#### Trois modes d'accès

| Mode | Client | Transport | Usage |
|------|--------|-----------|-------|
| **MCP stdio** | Chatbot-Core, Plugin | Processus stdio | Intégration locale, latence minimale |
| **MCP WebSocket** | Plugin, clients distants | `ws://host:8765/mcp` | Intégration réseau, streaming |
| **API REST** | chat.api | `POST /api/tools/{id}/execute` | Appels directs sans conversation |

#### Transports MCP supportés

```
┌─────────────────────────────────────────────────────────────────┐
│                      Azy-MCP Server                              │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  stdio Handler  │  │   WS Handler    │  │  REST Handler   │  │
│  │                 │  │                 │  │                 │  │
│  │  stdin/stdout   │  │  ws://:8765/mcp │  │  http://:8765/  │  │
│  │                 │  │                 │  │  api/tools/*    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                ▼                                │
│                    ┌─────────────────────┐                      │
│                    │   Protocol Router   │                      │
│                    │   (unifié)          │                      │
│                    └──────────┬──────────┘                      │
│                               ▼                                 │
│                    ┌─────────────────────┐                      │
│                    │   Tools Registry    │                      │
│                    └─────────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

**Détail des transports :**

| Transport | Cas d'usage | Authentification | Streaming |
|-----------|-------------|------------------|-----------|
| **stdio** | Plugin local, Chatbot-Core local | Implicite (même machine) | ✅ Natif |
| **WebSocket** | Plugin distant, clients web | Token dans handshake | ✅ Natif |
| **REST** | chat.api, intégrations HTTP | `X-Tenant-ID` + `X-User-ID` | ❌ (polling) |

**Configuration client MCP (stdio) :**

```json
{
  "mcpServers": {
    "azy-mcp": {
      "command": "python",
      "args": ["-m", "mcp_server"],
      "cwd": "/path/to/azy.mcp",
      "env": {
        "N8N_WEBHOOK_URL": "http://localhost:5678"
      }
    }
  }
}
```

**Configuration client MCP (WebSocket) :**

```json
{
  "mcpServers": {
    "azy-mcp": {
      "transport": "websocket",
      "url": "ws://mcp-server:8765/mcp",
      "headers": {
        "X-Tenant-ID": "tenant-123",
        "X-User-ID": "user-456"
      }
    }
  }
}
```

#### Pattern N8NTool

Tous les tools Google héritent de `N8NToolBase` :

```python
class ClassroomTool(N8NToolBase):
    tool_id = "classroom"
    domain = "classroom"
    webhook_path = "mcp-classroom"

    supported_operations = [
        "course.list", "course.get", "course.create",
        "topic.list", "topic.create",
        "coursework.list", "coursework.create",
        "expert_program.sync",  # Opération orchestration
    ]
```

#### Headers d'authentification (API REST)

| Header | Type | Description |
|--------|------|-------------|
| `X-Tenant-ID` | string | Identifiant du tenant |
| `X-User-ID` | string | Identifiant utilisateur (Firebase UID) |
| `X-Correlation-ID` | string | ID de traçabilité (optionnel) |

#### Exemple de requête API REST

```bash
curl -X POST http://mcp-server:8765/api/tools/classroom/execute \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: tenant-123" \
  -H "X-User-ID: user-456" \
  -d '{
    "operation": "course.list",
    "params": {"teacherId": "me"},
    "correlation_id": "req-789"
  }'
```

**Relations :**
- Appelé par **Chatbot-Core** via MCP protocol (conversations)
- Appelé par **chat.api** via API REST (opérations directes)
- Appelle **n8n webhooks** pour exécuter les opérations
- Ne communique JAMAIS directement avec les services externes

**Pattern BYOT (Bring Your Own Token) :**

```
┌─────────────┐    X-Tenant-ID     ┌─────────────┐
│  chat.api   │ ──────────────────▶│   Azy-MCP   │
│             │    X-User-ID       │             │
└─────────────┘                    └──────┬──────┘
                                          │
                                          │ Récupère OAuth token
                                          │ via tenant/user IDs
                                          ▼
                                   ┌─────────────┐
                                   │     n8n     │
                                   │ (avec token)│
                                   └──────┬──────┘
                                          │
                                          │ Utilise token
                                          ▼
                                   ┌─────────────┐
                                   │ Google APIs │
                                   └─────────────┘

→ Aucun token stocké dans n8n (multi-tenant)
→ Tokens récupérés à la volée via X-Tenant-ID + X-User-ID
```

#### Configuration (variables d'environnement)

| Variable | Description | Défaut |
|----------|-------------|--------|
| `MCP_SERVER_PORT` | Port du serveur | 8765 |
| `N8N_WEBHOOK_URL` | URL de base n8n | http://localhost:5678 |
| `N8N_WEBHOOK_SECRET` | Secret HMAC (optionnel) | - |
| `REDIS_URL` | URL Redis pour cache | - |
| `LOG_LEVEL` | Niveau de log | INFO |

#### Phases du projet

| Phase | Statut | Contenu |
|-------|--------|---------|
| **Phase 1** | ✅ Complété | Core MCP, Protocol Handler, Workflow Manager |
| **Phase 2** | ✅ Complété | Analyzers, Storage, Vector Store, Cache (97% coverage) |
| **Phase 3** | 🔄 À faire | MessagePack protocol, Compression avancée |

#### RFCs implémentés

| RFC | Statut | Description |
|-----|--------|-------------|
| **RFC-040** | ✅ Complété | Training Dataset API (webhooks, callbacks) |
| **RFC-072** | ✅ Complété | LLM Batch Manager (batch processing) |
| **RFC-083** | ✅ Complété | REST API pour exécution directe tools (`/api/tools/{id}/execute`) |

#### Liste des tools enregistrés

| Tool ID | Domain | Webhook n8n | Opérations principales |
|---------|--------|-------------|------------------------|
| `gmail` | Google | `mcp-gmail` | email.list, email.get, email.send, draft.create |
| `calendar` | Google | `mcp-calendar` | event.list, event.get, event.create, calendar.list |
| `drive` | Google | `mcp-drive` | file.list, file.get, file.upload, file.share |
| `contacts` | Google | `mcp-contacts` | contact.list, contact.get, contact.create |
| `classroom` | Google | `mcp-classroom` | course.*, topic.*, coursework.*, expert_program.sync |
| `image_generation` | Media | `mcp-image-gen` | generate, variations, edit |
| `video_analysis` | Media | `mcp-video-analysis` | transcribe, extract_frames, ocr |
| `video_generation` | Media | `mcp-video-gen` | generate, animate |
| `knowledge_graph` | Knowledge | `mcp-knowledge` | query, insert, update, search |

### 2.7 N8N (Workflows)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Moteur de workflows et automatisations |
| **Technologies** | Node.js, n8n |
| **Port** | 5678 |
| **Fonctionnalités** | Webhooks, workflows, intégrations |
| **Repo** | `n8n-workflows` — workflows JSON + custom nodes |

```
N8N
├── Webhooks CRUD           → Opérations unitaires (mcp-gmail, mcp-classroom...)
├── Webhooks Orchestration  → Workflows métier (expert-program-sync...)
├── Workflows planifiés     → Tâches récurrentes (sync, cleanup...)
└── Custom Nodes            → Nodes spécialisés (CUSTOM.gmailToolDynamic...)
```

#### 2.7.1 Webhooks MCP (Google Services)

| Webhook | Service Google | Documentation |
|---------|----------------|---------------|
| `/webhook/mcp-gmail` | Gmail API | - |
| `/webhook/mcp-calendar` | Calendar API | - |
| `/webhook/mcp-drive` | Drive API | - |
| `/webhook/mcp-contacts` | People API | - |
| `/webhook/mcp-classroom` | Classroom API | [MCP_CLASSROOM_INTEGRATION.md](../mcp/MCP_CLASSROOM_INTEGRATION.md) |
| `/webhook/mcp-google-maps` | Maps API | - |

> **Catalogue complet** : 167 webhooks actifs documentés par catégorie dans [WEBHOOKS-CATALOG.md](./WEBHOOKS-CATALOG.md)

#### 2.7.2 Types de webhooks

| Type | Exemple | Usage |
|------|---------|-------|
| **CRUD** | `/webhook/mcp-classroom` | Opérations unitaires (list, get, create...) |
| **Orchestration** | `/webhook/expert-program-classroom-sync` | Workflows métier complexes |

#### 2.7.3 Custom Nodes

Les custom nodes utilisent le préfixe `CUSTOM.` (pas le nom du package) :

| Custom Node | Package | Usage |
|-------------|---------|-------|
| `CUSTOM.classroomToolDynamic` | n8n-nodes-classroom-dynamic | Opérations Classroom avec token dynamique |
| `CUSTOM.gmailToolDynamic` | n8n-nodes-gmail-dynamic | Opérations Gmail avec token dynamique |
| `CUSTOM.calendarToolDynamic` | n8n-nodes-calendar-dynamic | Opérations Calendar avec token dynamique |

> ⚠️ **Format obligatoire** : `CUSTOM.nodeName` — le format `package-name.nodeName` ne fonctionne PAS.

#### 2.7.4 Variables d'environnement

| Variable | Description | Exemple |
|----------|-------------|---------|
| `N8N_ENCRYPTION_KEY` | Clé de chiffrement credentials (identique sur tous les serveurs) | `abc123...` |
| `N8N_CUSTOM_EXTENSIONS` | Chemin vers les custom nodes | `/home/node/.n8n/nodes` |
| `DB_POSTGRESDB_HOST` | Host PostgreSQL | `databases.local` |
| `N8N_WEBHOOK_BASE_URL` | URL publique des webhooks | `http://pi6.local:5678` |

#### 2.7.5 Relations

- Reçoit les requêtes UNIQUEMENT de Azy-MCP (pour les flows tools Google côté user)
- Appelle Google APIs (Gmail/Calendar/Drive/Classroom data ops) — **point d'entrée Google data**
- Exception : `chat.api` appelle aussi n8n directement pour `training_dataset` (RFC-040, webhook `/webhook/dataset-generate`) — flow historique non-Google qui n'est pas un user flow conversationnel.
- chat.api appelle Google directement pour le flow OAuth (login/callback/refresh) — pas via n8n. Cf. §2.4.5.

---

## 3. Flux de données

### 3.1 Flux Frontend (Web UI) - Opération Google

```
User (Frontend): "Montre mes emails non lus"
    ↓
Frontend (WebSocket)
    ↓
chat.api
    ↓
Azy-MCP (GmailTool.list_emails)
    ↓
n8n (/webhook/mcp-gmail, operation: "email.list")
    ↓
Google Gmail API
    ↓
Réponse avec liste des emails
```

### 3.2 Flux Discord/Plugin - Conversation IA

```
User (Discord): "Bonjour, aide-moi avec mon code"
    ↓
Discord Bot
    ↓
Chatbot-Core (conversation IA)
    ↓
Azy-MCP (si outil nécessaire)
    ↓
n8n (appel LLM via webhook)
    ↓
OpenAI / Anthropic
    ↓
Réponse générée par l'IA
```

### 3.3 Flux Plugin Discord - Opération Google

```
User (Discord @mention): "Crée un événement dans mon calendrier"
    ↓
Plugin Discord (plugin-recipes, plugin-chess)
    ↓
Chatbot-Core (détecte intention = outil Calendar)
    ↓
Azy-MCP (CalendarTool.create_event)
    ↓
n8n (/webhook/mcp-calendar, operation: "event.create")
    ↓
Google Calendar API
    ↓
Confirmation de création
```

### 3.4 Workflow métier complexe (Frontend)

```
Admin (Frontend): "Synchronise le programme expert #123 vers Classroom"
    ↓
Frontend
    ↓
chat.api
    ↓
Azy-MCP (ClassroomTool.sync_program)
    ↓
n8n (/webhook/expert-program-classroom-sync)
    ↓
n8n crée Topics + CourseWorks (appelle mcp-classroom en interne)
    ↓
Google Classroom API
    ↓
Callback avec résultat
```

---

## 4. Responsabilités par équipe

| Équipe | Composants | Responsabilités |
|--------|------------|-----------------|
| **Frontend** | `chat.vue` (Vue 3 + Vuetify) | UI/UX, Firebase Auth client, attach JWT aux requêtes chat.api, WebSocket MCP streaming, mapping erreurs typées (cf. §2.1) |
| **Plugin Discord** | plugin-recipes, plugin-chess, plugin-azy | Cogs métier au-dessus de chatbot-core (cf. §2.3) — équipe distincte du Frontend |
| **Backend API** | chat.api | Auth, routing, orchestration, sessions |
| **Chatbot-Core** | Chatbot-Core | Bot Discord, TenantResolver, onboarding, voice realtime, commandes Discord |
| **MCP** | Azy-MCP | Wrappers outils, protocole MCP, API REST |
| **Workflows** | N8N | Webhooks, workflows, custom nodes, résolution tenant |
| **DevOps** | Tous | Déploiement, monitoring, infra |

### 4.1 Détail des responsabilités Chatbot-Core

| Domaine | Services | Description |
|---------|----------|-------------|
| **Multi-tenant** | TenantResolver | Résolution user_id → tenant + package LLM |
| **Discord Commands** | DiscordCommandListener, CommandExecutor | Exécution commandes via Redis Streams |
| **Onboarding** | OnboardingCog, OnboardingRedisService | Parcours onboarding multi-étapes |
| **Voice** | VoiceRealtimeCog, VoiceRealtimeService | Sessions vocales temps réel |
| **Gamification** | BadgeService, LeaderboardService | Badges et classements |
| **Intégrations** | MCPClient, N8nClient | Communication avec services externes |

---

## 5. Ports et endpoints

| Service | Port | Endpoints principaux |
|---------|------|---------------------|
| **Frontend** | 3002 (dev), `app.azy.solutions` / `dev.azy.solutions` (déployé) | `/` (SPA Vue 3, history-mode router) |
| **chat.api** | 8000 | `/ws`, `/api/v1/*` |
| **Chatbot-Core** | - | Redis Streams (voir ci-dessous) |
| **Azy-MCP** | 8765 | Voir détail ci-dessous |
| **N8N** | 5678 | `/webhook/*`, `/healthz` |

### Communication Chatbot-Core (Redis Streams)

| Stream | Direction | Format |
|--------|-----------|--------|
| `discord:commands` | chat.api → Chatbot-Core | Commandes à exécuter |
| `discord:results` | Chatbot-Core → chat.api | Résultats d'exécution |
| `onboarding:session:*` | Chatbot-Core ↔ Redis | Sessions onboarding (TTL 2h) |

**Format discord:commands :**
```json
{
  "request_id": "req-uuid-123",
  "guild_id": "1234567890",
  "action": "get_roles",
  "payload": "{}",
  "timestamp": "2026-05-08T12:00:00Z"
}
```

**Format discord:results :**
```json
{
  "request_id": "req-uuid-123",
  "success": "true",
  "guild_id": "1234567890",
  "data": "{\"roles\": [...]}",
  "timestamp": "2026-05-08T12:00:01Z"
}
```

### Endpoints Azy-MCP (détail)

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/` | GET | Info service (version, phase, status) |
| `/health` | GET | Health check (liveness) + état orchestrator |
| `/stats` | GET | Statistiques d'utilisation |
| `/debug` | GET | Debug info (Phase 2 availability) |
| `/api/tools` | GET | Liste des tools disponibles |
| `/api/tools/{tool_id}` | GET | Informations sur un tool |
| `/api/tools/{tool_id}/execute` | POST | **Exécution directe** (RFC-083) |
| `/api/process` | POST | Traitement de requête avec LLM |
| `/api/batch/*` | - | Endpoints batch processing (RFC-072) |
| `/api/orchestrator/*` | - | Endpoints orchestration multi-étapes |
| MCP stdio/WebSocket | - | Protocole MCP natif (Chatbot-Core) |

**Exemple réponse `/health` :**

```json
{
  "status": "healthy",
  "components": {
    "orchestrator": "ready",
    "template_loader": "connected",
    "agent_manager": "ready"
  },
  "uptime_seconds": 3600
}
```

---

## 6. Environnements

| Environnement | Frontend | chat.api | Azy-MCP | N8N |
|---------------|----------|----------|---------|-----|
| **Local (pi6)** | localhost:3002 | localhost:8000 | localhost:8765 (doc) / 8002 (settings — discrepancy à harmoniser) | pi6.local:5678 |
| **Docker (host2)** | - | - | - | host2.local:5678 |
| **Dev (déployé)** | `dev.azy.solutions` | `apidev.azy.solutions` | (privé) | (privé) |
| **Production** | `app.azy.solutions` | TBD | TBD | TBD |

---

## 7. Contrats d'interface Azy-MCP

### Format de requête (API REST)

```json
{
  "operation": "resource.action",
  "params": {
    "param1": "value1",
    "param2": "value2"
  },
  "correlation_id": "optional-tracking-id"
}
```

### Format de réponse

```json
{
  "success": true,
  "data": { ... },
  "correlation_id": "req-12345",
  "metadata": {
    "tool_id": "classroom",
    "operation": "course.list",
    "duration_ms": 234
  }
}
```

### Format d'erreur

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Description de l'erreur",
    "details": { ... }
  },
  "correlation_id": "req-12345"
}
```

### Codes d'erreur standardisés

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Paramètres invalides |
| `AUTH_ERROR` | 401 | Token manquant ou invalide |
| `FORBIDDEN` | 403 | Accès non autorisé |
| `NOT_FOUND` | 404 | Ressource non trouvée |
| `TOOL_NOT_FOUND` | 404 | Tool non enregistré |
| `OPERATION_NOT_SUPPORTED` | 400 | Opération non supportée par le tool |
| `N8N_ERROR` | 502 | Erreur du webhook n8n |
| `TIMEOUT` | 504 | Timeout de l'opération |
| `INTERNAL_ERROR` | 500 | Erreur interne |

---

## 8. Références

### Documentation générale
- [Google Services Integration](./GOOGLE-SERVICES-INTEGRATION.md)
- [MCP Classroom Integration](../mcp/MCP_CLASSROOM_INTEGRATION.md)
- [Webhooks Catalog](./WEBHOOKS-CATALOG.md) — 167 webhooks actifs par catégorie
- [Docker Deployment](../../docker/README.md)

### RFCs Chatbot-Core
- [RFC-049 Multi-Tenant Isolation](../rfc/RFC-049-MULTI-TENANT-ISOLATION.md) - TenantResolver
- [RFC-060 Guild Info Sync](../rfc/RFC-060-GUILD-INFO-SYNC.md) - ServerSyncManager, ResyncSubscriber
- [RFC-062 Discord Commands via Redis](../rfc/RFC-062-DISCORD-COMMAND-LISTENER.md) - DiscordCommandListener
- [RFC-067 Gamification](../rfc/RFC-067-GAMIFICATION.md) - Badges & Leaderboards
- [RFC-069 Onboarding Multi-étapes](../rfc/RFC-069-ONBOARDING.md) - OnboardingRedisService
- [RFC-078 Voice Realtime](../rfc/RFC-078-REALTIME-AUDIO-MCP.md) - VoiceRealtimeCog
- [RFC-079 Tenant Package Configuration](../rfc/RFC-079-TENANT-PACKAGE-CONFIG.md) - TenantConfig, PackageModels

### RFCs Azy-MCP
- [RFC-040 Training Dataset API](../rfc/RFC-040-TRAINING-DATASET-API.md) - Génération datasets
- [RFC-072 LLM Batch Manager](../rfc/RFC-072-LLM-BATCH-MANAGER.md) - Batch processing
- [RFC-083 MCP REST API](../rfc/RFC-083-MCP-REST-API.md) - Exécution directe tools

### Guides
- [Guide TenantResolver (RFC-049)](../guides/GUIDE-RFC049-TENANT-RESOLVER.md)
