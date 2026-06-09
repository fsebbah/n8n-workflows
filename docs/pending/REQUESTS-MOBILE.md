# Demandes Front → Équipe Mobile

**Émetteur** : Équipe Frontend 2 (Claude)
**Date** : 2026-06-05
**Statut** : 📤 à transmettre
**Issue front meta** : [#2300 Planification équipes Frontend](https://github.com/fsebbah/azy.front/issues/2300)

---

## 1. App mobile prof — scan séquentiel copies (RFC-099 §11)

**Contexte** : la RFC-099 (Correction de copies) repose sur une **app mobile prof dédiée** pour le scan séquentiel. La vue web Azy gère la création de contrôles + revue + publication, mais le **scan des copies se fait au téléphone**.

**Vision UX (inspiration Examino)** :
```
Prof ouvre l'app → choisit un contrôle → choisit un élève → scanne sa copie
→ retour automatique sur la liste élèves → suivant
```

Objectif : **15-20 secondes par copie** en routine.

---

## 2. Périmètre app mobile

### 2.1. Trois écrans principaux

1. **Liste contrôles** — paginée, filtrée sur `ready_for_grading`, cache local 24h, pull-to-refresh
2. **Liste élèves d'un contrôle** — affichage statut soumission par élève (vert/jaune/blanc), recherche par nom
3. **Capture caméra** — cadre d'aide A4, multi-pages (1 à 4 photos), rotation/recadrage auto, bouton « Envoyer »

### 2.2. Fonctionnalités critiques (RFC-099 §11.2)

| Feature | Priorité | Détail |
|---|---|---|
| Sélection contrôle | P0 | Liste paginée + cache 24h + pull-to-refresh |
| Sélection élève | P0 | Liste classe avec statut soumission (vert/jaune/blanc) + recherche |
| Capture multi-pages | P0 | Cadre d'aide A4, prise séquentielle 1-4 pages, rotation, recadrage auto |
| Compression intelligente | P0 | Limite ~500 Ko/photo (1500×2000 px max, JPEG 80%) pour bandwidth école |
| Queue offline | P0 | Photos en queue locale si offline, retry au retour réseau |
| Indicateur statut soumission | P1 | Badges par élève après upload |
| Notifications push | P1 | Notification quand correction prête à valider (deep link vers web) |
| Auth SSO Firebase | P0 | Même token que web Azy |
| Mode landscape | P2 | Scan A4 paysage |

### 2.3. Endpoints back utilisés (cf. `REQUESTS-BACK-CHATAPI.md` §2)

- `GET /api/grading/mobile/controls` (liste paginée + ETag)
- `GET /api/grading/mobile/controls/{id}/students` (liste élèves + statut)
- `POST /api/grading/mobile/submissions/upload` (multipart photo + control_id + student_id)
- `GET /api/grading/mobile/sync-queue` (reprise uploads en queue après reboot)

### 2.4. Sécurité

- Token Firebase stocké dans Keychain (iOS) / EncryptedSharedPreferences (Android)
- Photos chiffrées at-rest sur l'appareil (encryption OS standard)
- HTTPS obligatoire
- Aucune persistence des photos après upload réussi (purge auto 24h)

---

## 3. Effort estimé

Cf. RFC-099 §11.6 :

| Item | Effort |
|---|---|
| Setup projet + SSO Firebase | ~2j |
| Écran liste contrôles | ~1j |
| Écran liste élèves + statuts | ~1j |
| Écran capture (camera + multi-pages + crop) | ~3j |
| Upload multipart + retry + queue offline | ~2j |
| Notifications push | ~1j |
| Tests + polish + store submission | ~2-3j |
| **Total mobile** | **~12-13j** (~2.5 sem 1 dev mobile) |

---

## 4. Choix techniques à confirmer

- **Framework** : Flutter ou React Native ? (à votre discrétion, mais à figer)
- **Camera lib** : qui supporte le bien recadrage automatique et la rotation
- **Storage local** : SQLite ou Hive (Flutter) / AsyncStorage (RN) pour la queue
- **Push notifications** : Firebase Cloud Messaging (cohérent avec SSO Firebase)
- **Deep linking** : vers la vue web `/grading/{control_id}/{student_id}` quand notif arrive

---

## 5. Hors RFC-099 — opportunités

À considérer post-Phase 1 :

- **App élève** pour consulter ses corrections (sinon Discord seul)
- **Mode offline complet** pour les écoles à faible connectivité
- **Scan QR submission élève** (Edcafe — cf. RFC-099 §15 Tier 4) — alternative au scan prof

---

## 6. Lien avec la vue web Azy

- L'app mobile **ne réplique pas** la vue web ; chacune a son scope :
  - **Mobile = scan rapide**
  - **Web = création/review/publication**
- Le prof peut commencer un contrôle au web et terminer le scan au mobile (et inverse)
- Sync data via les endpoints back communs

---

## Format de réponse attendu

Pour chaque écran / feature, merci d'indiquer :
- ✅ Pris en charge — date estimée
- ⏳ Pris en compte — à planifier après livraison back endpoints mobile
- ❓ Besoin de précisions
- ❌ Hors scope

Et **confirmer le framework choisi** (Flutter / React Native / natif) pour aligner les attentes.

**Issue front liée** : [#2297](https://github.com/fsebbah/azy.front/issues/2297) (chantier parent RFC-099 Phase 1)
